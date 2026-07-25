// Offenders registry — searchable, risk-scored table of identity-resolved
// persons. Repeat-only + risk-band + MO-tag + watchlist + cross-district
// filters (URL-synced), full-set column sorting (incl. alias/district counts),
// KPI tile strip, CSV export, copy-view-link, risk-band distribution strip,
// MO co-occurrence matrix, recently-viewed chips, per-row watchlist stars, and
// a 2–3 person compare tray (persisted in localStorage so "Add to compare"
// works from other routes) → bottom-sheet side-by-side view. Row →
// /offenders/:personKey (Offender 360); the name cell is a real link so the
// profile is reachable by keyboard.
// Spec: master prompt §7 route 5.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLookups, useOffenders } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { unitInfo } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import DensityToggle from '../components/DensityToggle.jsx';
import Tooltip from '../components/Tooltip.jsx';
import KpiTile from '../components/KpiTile.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';
import { RiskBadge, MoChips, useDistrictName } from './offenders/common.jsx';
import CompareDrawer from './offenders/CompareDrawer.jsx';
import MoMatrix from './offenders/MoMatrix.jsx';
import { RiskBandStrip, MoTagChips, RecentRow } from './offenders/FilterStrips.jsx';
import { readCompare, writeCompare, COMPARE_MAX } from './offenders/compareStore.js';
import { readRecent, clearRecent } from './offenders/recentStore.js';
import { useWatchlist, WATCH_MAX } from './offenders/watchlistStore.js';
import { communityColor } from './network/graphUtils.js';
import { downloadCsv } from './network/download.js';
import { copyText } from './network/clipboard.js';
import { readPref, writePref } from './network/hooks.js';

const PER_PAGE = 25;
const FETCH_CAP = 200; // API perPage ceiling — search/paging run client-side on this slice
const REPEAT_PREF = 'dappa-offenders-repeat';
const MO_TAG_CAP = 14;

const BAND_KEYS = [
  { value: 'all', key: 'network.off.bandAll' },
  { value: 'high', key: 'network.off.bandHigh' },
  { value: 'med', key: 'network.off.bandMed' },
  { value: 'low', key: 'network.off.bandLow' },
];

function inBand(band, score) {
  if (!band || band === 'all') return true;
  const n = Number(score);
  if (!Number.isFinite(n)) return false;
  if (band === 'high') return n >= 70;
  if (band === 'med') return n >= 40 && n < 70;
  return n < 40;
}

function bandOf(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return n >= 70 ? 'high' : n >= 40 ? 'med' : 'low';
}

/** CSV headers follow the UI language; the values stay as the API sent them
 *  except district names, which the sheet reads better translated. */
const csvColumns = (t, dName) => [
  { key: 'personKey', label: t('network.csv.personKey') },
  { key: 'canonicalName', label: t('network.csv.canonicalName') },
  { label: t('network.csv.aliases'), map: (r) => (r.aliases || []).join('; ') },
  { key: 'caseCount', label: t('network.csv.cases') },
  { label: t('network.csv.districts'), map: (r) => (r.districts || []).map(dName).join('; ') },
  { label: t('network.csv.moTags'), map: (r) => (r.moTags || []).join('; ') },
  { key: 'riskScore', label: t('network.csv.riskScore') },
  { label: t('network.csv.community'), map: (r) => (r.communityId ?? '') },
];

export default function Offenders() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  const localDistrict = useDistrictName();
  const [searchParams, setSearchParams] = useSearchParams();
  const { districtId } = useUrlFilters();
  const lookups = useLookups();

  // Route filters live in the URL (shareable views); the repeat toggle also
  // remembers the last choice in localStorage as the default for fresh visits.
  const search = searchParams.get('q') || '';
  const band = searchParams.get('band') || 'all';
  const moParam = searchParams.get('mo') || '';
  const moSel = useMemo(() => moParam.split(',').filter(Boolean), [moParam]);
  const repeatParam = searchParams.get('repeat');
  const storedRepeat = useMemo(() => readPref(REPEAT_PREF, null), []);
  const repeatOnly = repeatParam !== null ? repeatParam === '1' : storedRepeat !== '0';
  const watchOnly = searchParams.get('watch') === '1';
  const spanMulti = searchParams.get('span') === 'multi';
  const { keys: watchKeys, toggle: toggleWatchKey } = useWatchlist();

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'riskScore', dir: 'desc' });
  // Compare tray survives navigation (Offender 360 / Network can add to it).
  const [compare, setCompare] = useState(readCompare);
  const [compareOpen, setCompareOpen] = useState(false);
  const [recent, setRecent] = useState(readRecent);

  useEffect(() => { writeCompare(compare); }, [compare]);

  const setParams = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  };

  const setRepeat = (on) => {
    setParams({ repeat: on ? '1' : '0' });
    writePref(REPEAT_PREF, on ? '1' : '0');
  };

  const toggleMo = (tag) => {
    const next = moSel.includes(tag) ? moSel.filter((t) => t !== tag) : [...moSel, tag];
    setParams({ mo: next.join(',') });
  };

  // The API's district filter matches OffenderProfile district NAMES — resolve
  // the FilterBar's unit code via lookups (static table as fallback).
  const districtName = useMemo(() => {
    if (!districtId) return '';
    const hit = (lookups.data?.districts || []).find((d) => d.districtId === districtId);
    return hit?.districtName || unitInfo(districtId)?.name || '';
  }, [districtId, lookups.data]);

  const params = { perPage: FETCH_CAP, repeatOnly: repeatOnly ? '1' : undefined };
  if (districtName) params.district = districtName;
  const offenders = useOffenders(params);

  // Alias/district counts precomputed so those columns sort like any numeric
  // column through the shared controlled-sort path.
  const allRows = useMemo(
    () => (offenders.data?.rows || []).map((r) => ({
      ...r,
      aliasCount: (r.aliases || []).length,
      districtCount: (r.districts || []).length,
    })),
    [offenders.data],
  );

  const rowsByKey = useMemo(() => {
    const m = new Map();
    for (const r of allRows) m.set(String(r.personKey), r);
    return m;
  }, [allRows]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (r) => {
    if (!q) return true;
    return [r.canonicalName, r.personKey, ...(r.aliases || []), ...(r.moTags || [])]
      .join(' ')
      .toLowerCase()
      .includes(q);
  };
  const matchesMo = (r) => !moSel.length || moSel.every((t) => (r.moTags || []).includes(t));
  const matchesWatch = (r) => !watchOnly || watchKeys.has(String(r.personKey));
  const matchesSpan = (r) => !spanMulti || (r.districts || []).length >= 2;

  const filtered = useMemo(
    () => allRows.filter((r) => inBand(band, r.riskScore) && matchesSearch(r) && matchesMo(r)
      && matchesWatch(r) && matchesSpan(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, band, q, moParam, watchOnly, spanMulti, watchKeys],
  );

  // Band distribution over everything EXCEPT the band filter itself, so the
  // strip acts as a filter control rather than echoing its own selection.
  const bandCounts = useMemo(() => {
    const counts = { high: 0, med: 0, low: 0 };
    for (const r of allRows) {
      if (!matchesSearch(r) || !matchesMo(r) || !matchesWatch(r) || !matchesSpan(r)) continue;
      const b = bandOf(r.riskScore);
      if (b) counts[b] += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, q, moParam, watchOnly, spanMulti, watchKeys]);

  // MO-tag universe (top by frequency over the rows that pass search + band);
  // selected tags always stay visible so an active chip can be un-toggled.
  const moTags = useMemo(() => {
    const freq = new Map();
    for (const r of allRows) {
      if (!matchesSearch(r) || !inBand(band, r.riskScore) || !matchesWatch(r) || !matchesSpan(r)) continue;
      for (const t of r.moTags || []) freq.set(t, (freq.get(t) || 0) + 1);
    }
    const top = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MO_TAG_CAP)
      .map(([tag, count]) => ({ tag, count }));
    for (const t of moSel) {
      if (!top.some((x) => x.tag === t)) top.push({ tag: t, count: freq.get(t) || 0 });
    }
    return top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, q, band, moParam, watchOnly, spanMulti, watchKeys]);

  // Matrix rows honor every filter EXCEPT the MO chips, so the co-occurrence
  // grid stays stable while a pair is being picked from it.
  const matrixRows = useMemo(
    () => allRows.filter((r) => inBand(band, r.riskScore) && matchesSearch(r)
      && matchesWatch(r) && matchesSpan(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, band, q, watchOnly, spanMulti, watchKeys],
  );

  // KPI strip over the loaded slice (the server caps at FETCH_CAP by risk).
  const kpi = useMemo(() => ({
    total: allRows.length,
    high: allRows.filter((r) => Number(r.riskScore) >= 70).length,
    multi: allRows.filter((r) => (r.districts || []).length >= 2).length,
    watched: allRows.filter((r) => watchKeys.has(String(r.personKey))).length,
  }), [allRows, watchKeys]);

  // Sort the WHOLE filtered slice (not just the visible page) so column sorts
  // behave like a real registry — DataTable runs in controlled-sort mode.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const mul = dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a?.[key]; const bv = b?.[key];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const an = Number(av); const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [filtered, sort]);

  useEffect(() => { setPage(1); }, [search, repeatOnly, districtName, band, moParam, sort, watchOnly, spanMulti]);

  // Clamp when the result set shrinks out-of-band (e.g. a refetch returns fewer
  // rows while a late page is open) — never strand the user on an empty page.
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const pageRows = useMemo(
    () => sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [sorted, page],
  );

  const serverTotal = offenders.data?.total ?? 0;
  const truncated = serverTotal > FETCH_CAP;

  const toggleCompare = (r) => {
    const key = String(r.personKey);
    setCompare((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= COMPARE_MAX) {
        toast.info(t('network.toast.compareFullShort', { n: fmtInt(COMPARE_MAX) }));
        return prev;
      }
      return [...prev, key];
    });
  };

  const removeCompare = (key) => setCompare((prev) => prev.filter((k) => k !== String(key)));

  const onToggleWatch = (r) => {
    const res = toggleWatchKey(String(r.personKey), r.canonicalName);
    if (res.status === 'full') toast.info(t('network.toast.watchFull', { n: fmtInt(WATCH_MAX) }));
  };

  // Cell click applies/clears an MO pair from the co-occurrence matrix
  // (single tag from a header click falls back to the ordinary toggle).
  const pickMoPair = (a, b) => {
    if (!b || a === b) { toggleMo(a); return; }
    const next = new Set(moSel);
    if (next.has(a) && next.has(b)) { next.delete(a); next.delete(b); } else { next.add(a); next.add(b); }
    setParams({ mo: [...next].join(',') });
  };

  const exportCsv = () => {
    if (!sorted.length) { toast.info(t('network.toast.nothingToExportFilters')); return; }
    downloadCsv(
      `dappa-offenders-${new Date().toISOString().slice(0, 10)}.csv`,
      csvColumns(t, localDistrict),
      sorted,
    );
    toast.success(t(sorted.length === 1 ? 'network.toast.offendersCsv.one' : 'network.toast.offendersCsv.other',
      { n: fmtInt(sorted.length) }));
  };

  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success(t('network.toast.offenderLinkCopied'));
    else toast.error(t('network.toast.copyFailed'));
  };

  const columns = [
    {
      key: 'canonicalName',
      label: t('network.table.colName'),
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-1.5 min-w-0">
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
          <label
            className="flex h-10 w-9 -my-2 -ml-2 shrink-0 items-center justify-center cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="accent-amber h-4 w-4"
              checked={compare.includes(String(r.personKey))}
              onChange={() => toggleCompare(r)}
              aria-label={t('network.table.compareAria', { name: r.canonicalName || r.personKey })}
            />
          </label>
          <div className="min-w-0">
            {/* Real link — the keyboard path to Offender 360 (row onClick is pointer-only). */}
            <Link
              to={`/offenders/${encodeURIComponent(r.personKey)}`}
              className="font-medium text-ink truncate block hover:text-amber transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {r.canonicalName || r.personKey}
            </Link>
            <p className="text-[10px] text-muted num truncate">{r.personKey}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'aliasCount',
      label: t('network.table.colAliases'),
      sortable: true,
      align: 'right',
      width: 70,
      render: (r) => (
        <span title={(r.aliases || []).join(', ') || t('network.table.noAliases')}>{fmtInt((r.aliases || []).length)}</span>
      ),
    },
    { key: 'caseCount', label: t('network.table.colCases'), sortable: true, align: 'right', width: 70 },
    {
      key: 'districtCount',
      label: t('network.table.colDistricts'),
      sortable: true,
      align: 'right',
      width: 90,
      render: (r) => {
        const n = (r.districts || []).length;
        return (
          <span className="inline-flex items-center justify-end gap-1.5" title={(r.districts || []).map(localDistrict).join(', ') || '—'}>
            {n > 1 && (
              <span className="inline-flex gap-0.5" aria-hidden="true">
                {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-amber/70" />
                ))}
              </span>
            )}
            <span className="num">{fmtInt(n)}</span>
          </span>
        );
      },
    },
    {
      key: 'moTags',
      label: t('network.table.colMo'),
      render: (r) => <MoChips tags={r.moTags || []} />,
    },
    {
      key: 'riskScore',
      label: t('network.table.colRisk'),
      sortable: true,
      align: 'right',
      width: 80,
      render: (r) => <RiskBadge score={r.riskScore} />,
    },
    {
      key: 'communityId',
      label: t('network.table.colGroup'),
      align: 'center',
      width: 80,
      render: (r) => (r.communityId === null || r.communityId === undefined ? (
        <span className="text-muted">—</span>
      ) : (
        <Link
          to={`/network?communityId=${encodeURIComponent(r.communityId)}&focus=${encodeURIComponent(r.personKey)}`}
          className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
          title={t('network.table.openCommunity')}
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: communityColor(r.communityId) }} />
          #{String(r.communityId)}
        </Link>
      )),
    },
    {
      key: 'watch',
      label: '★',
      align: 'center',
      width: 44,
      render: (r) => {
        const watched = watchKeys.has(String(r.personKey));
        return (
          <button
            type="button"
            className={`flex h-9 w-9 -my-1.5 mx-auto items-center justify-center rounded-lg transition-colors ${
              watched ? 'text-amber' : 'text-muted hover:text-amber'
            }`}
            onClick={(e) => { e.stopPropagation(); onToggleWatch(r); }}
            aria-pressed={watched}
            aria-label={t(watched ? 'network.table.watchRemoveAria' : 'network.table.watchAddAria',
              { name: r.canonicalName || r.personKey })}
            title={t(watched ? 'network.table.watchRemoveHint' : 'network.table.watchAddHint')}
          >
            {watched ? '★' : '☆'}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t('network.off.title')}</h1>
        <p className="page-subtitle">{t('network.off.subtitle')}</p>
      </div>

      <FilterBar show={['district']}>
        <input
          className="input-dark !py-2 w-52 sm:w-64"
          placeholder={t('network.off.searchPlaceholder')}
          value={search}
          onChange={(e) => setParams({ q: e.target.value })}
          aria-label={t('network.off.searchAria')}
        />
        <SegmentedControl
          ariaLabel={t('network.off.bandAria')}
          value={band}
          onChange={(v) => setParams({ band: v === 'all' ? '' : v })}
          options={BAND_KEYS.map((b) => ({ value: b.value, label: t(b.key) }))}
        />
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none whitespace-nowrap min-h-[40px] px-0.5">
          <input
            type="checkbox"
            className="accent-amber h-4 w-4"
            checked={repeatOnly}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          {t('network.off.repeatOnly')}
        </label>
        <button
          type="button"
          className={`chip !py-1 min-h-[40px] whitespace-nowrap transition-colors hover:border-amber/50 ${watchOnly ? '!border-amber text-amber' : ''}`}
          onClick={() => setParams({ watch: watchOnly ? '' : '1' })}
          aria-pressed={watchOnly}
          title={t(watchOnly ? 'network.off.watchChipOn' : 'network.off.watchChipOff')}
        >
          {t('network.off.watchChip')}
          <span className="num text-muted">{fmtInt(kpi.watched)}</span>
        </button>
        <button
          type="button"
          className={`chip !py-1 min-h-[40px] whitespace-nowrap transition-colors hover:border-amber/50 ${spanMulti ? '!border-amber text-amber' : ''}`}
          onClick={() => setParams({ span: spanMulti ? '' : 'multi' })}
          aria-pressed={spanMulti}
          title={t(spanMulti ? 'network.off.crossDistrictOn' : 'network.off.crossDistrictOff')}
        >
          {t('network.off.crossDistrict')}
          <span className="num text-muted">{fmtInt(kpi.multi)}</span>
        </button>
      </FilterBar>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label={t('network.off.kpiLoaded')}
          value={kpi.total}
          loading={offenders.isLoading}
          hint={t('network.off.kpiLoadedHint', { n: fmtInt(serverTotal) })}
        />
        <KpiTile
          label={t('network.off.kpiHigh')}
          value={kpi.high}
          accent="red"
          loading={offenders.isLoading}
          hint={t('network.off.kpiHighHint')}
        />
        <KpiTile
          label={t('network.off.kpiCross')}
          value={kpi.multi}
          accent="teal"
          loading={offenders.isLoading}
          hint={t('network.off.kpiCrossHint')}
        />
        <KpiTile
          label={t('network.off.kpiWatched')}
          value={kpi.watched}
          loading={offenders.isLoading}
          hint={t('network.off.kpiWatchedHint')}
        />
      </div>

      {(recent.length > 0 || moTags.length > 0
        || bandCounts.high + bandCounts.med + bandCounts.low > 0) && (
        <div className="space-y-1.5">
          <RecentRow items={recent} onClear={() => { clearRecent(); setRecent([]); }} />
          <RiskBandStrip
            counts={bandCounts}
            band={band}
            onBand={(v) => setParams({ band: v === 'all' ? '' : v })}
          />
          <MoTagChips tags={moTags} selected={moSel} onToggle={toggleMo} />
        </div>
      )}

      <Card
        padded={false}
        title={t('network.table.title')}
        subtitle={offenders.isLoading
          ? t('network.table.loading')
          : t(search ? 'network.table.subtitleSearch' : 'network.table.subtitle', {
            shown: fmtInt(sorted.length),
            total: fmtInt(serverTotal),
            q: search.trim(),
          })}
        actions={(
          <>
            {truncated && (
              <Badge tone="slate">
                <span className="hidden sm:inline">{t('network.table.truncatedLong', { n: fmtInt(FETCH_CAP) })}</span>
                <span className="sm:hidden">{t('network.table.truncatedShort', { n: fmtInt(FETCH_CAP) })}</span>
              </Badge>
            )}
            <DensityToggle className="hidden md:inline-flex" />
            <Tooltip label={t('network.table.linkHint')}>
              <button type="button" className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]" onClick={copyLink}>
                {t('network.tool.link')}
              </button>
            </Tooltip>
            <button
              type="button"
              className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
              onClick={exportCsv}
              disabled={offenders.isLoading || !sorted.length}
            >
              {t('common.action.exportCsv')}
            </button>
          </>
        )}
      >
        {offenders.error ? (
          <EmptyState
            title={t('network.table.error')}
            message={offenders.error.message}
            action={<button type="button" className="btn" onClick={() => offenders.refetch()}>{t('common.action.retry')}</button>}
          />
        ) : (
          <DataTable
            exportFilename="dappa-offenders"
            columns={columns}
            rows={pageRows}
            rowKey="personKey"
            loading={offenders.isLoading}
            emptyMessage={t(watchOnly
              ? 'network.table.emptyWatch'
              : moSel.length
                ? 'network.table.emptyMo'
                : spanMulti
                  ? 'network.table.emptySpan'
                  : search
                    ? 'network.table.emptySearch'
                    : repeatOnly
                      ? 'network.table.emptyRepeat'
                      : 'network.table.empty')}
            total={sorted.length}
            page={page}
            perPage={PER_PAGE}
            onPageChange={setPage}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(r) => navigate(`/offenders/${encodeURIComponent(r.personKey)}`)}
          />
        )}
      </Card>

      <MoMatrix rows={matrixRows} selected={moSel} onPickPair={pickMoPair} />

      {compare.length > 0 && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
            rounded-xl border border-grid bg-panel/95 backdrop-blur px-3 py-2 shadow-lift
            max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar"
          role="region"
          aria-label={t('network.tray.aria')}
        >
          {compare.map((k) => (
            <span key={k} className="chip !py-1 min-h-[36px] text-[11px] shrink-0">
              <span className="truncate max-w-[8rem]">{rowsByKey.get(k)?.canonicalName || k}</span>
              <button
                type="button"
                className="flex h-9 w-8 -my-2 -mr-2 items-center justify-center text-muted hover:text-ink leading-none"
                onClick={() => removeCompare(k)}
                aria-label={t('network.tray.removeAria', { name: rowsByKey.get(k)?.canonicalName || k })}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 text-xs min-h-[40px] shrink-0"
            disabled={compare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            {t('network.tray.compare', { n: fmtInt(compare.length) })}
          </button>
          <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs min-h-[40px] shrink-0" onClick={() => setCompare([])}>
            {t('common.action.clear')}
          </button>
        </div>
      )}

      <CompareDrawer
        open={compareOpen}
        keys={compare}
        baseByKey={rowsByKey}
        onClose={() => setCompareOpen(false)}
        onRemove={removeCompare}
      />
    </div>
  );
}
