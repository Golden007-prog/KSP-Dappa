// Offenders registry — searchable, risk-scored table of identity-resolved
// persons. Repeat-only + risk-band + district filters (URL-synced), full-set
// column sorting, CSV export, and a 2–3 person compare tray → bottom-sheet
// side-by-side view. Row → /offenders/:personKey (Offender 360).
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
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt } from '../lib/format.js';
import { RiskBadge, MoChips } from './offenders/common.jsx';
import CompareDrawer from './offenders/CompareDrawer.jsx';
import { communityColor } from './network/graphUtils.js';
import { downloadCsv } from './network/download.js';
import { readPref, writePref } from './network/hooks.js';

const PER_PAGE = 25;
const FETCH_CAP = 200; // API perPage ceiling — search/paging run client-side on this slice
const COMPARE_MAX = 3;
const REPEAT_PREF = 'dappa-offenders-repeat';

const BANDS = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High ≥70' },
  { value: 'med', label: 'Med 40–69' },
  { value: 'low', label: 'Low <40' },
];

function inBand(band, score) {
  if (!band || band === 'all') return true;
  const n = Number(score);
  if (!Number.isFinite(n)) return false;
  if (band === 'high') return n >= 70;
  if (band === 'med') return n >= 40 && n < 70;
  return n < 40;
}

const CSV_COLUMNS = [
  { key: 'personKey', label: 'Person key' },
  { key: 'canonicalName', label: 'Canonical name' },
  { label: 'Aliases', map: (r) => (r.aliases || []).join('; ') },
  { key: 'caseCount', label: 'Cases' },
  { label: 'Districts', map: (r) => (r.districts || []).join('; ') },
  { label: 'MO tags', map: (r) => (r.moTags || []).join('; ') },
  { key: 'riskScore', label: 'Risk score' },
  { label: 'Community', map: (r) => (r.communityId ?? '') },
];

export default function Offenders() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { districtId } = useUrlFilters();
  const lookups = useLookups();

  // Route filters live in the URL (shareable views); the repeat toggle also
  // remembers the last choice in localStorage as the default for fresh visits.
  const search = searchParams.get('q') || '';
  const band = searchParams.get('band') || 'all';
  const repeatParam = searchParams.get('repeat');
  const storedRepeat = useMemo(() => readPref(REPEAT_PREF, null), []);
  const repeatOnly = repeatParam !== null ? repeatParam === '1' : storedRepeat !== '0';

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'riskScore', dir: 'desc' });
  const [compare, setCompare] = useState([]); // up to 3 personKeys
  const [compareOpen, setCompareOpen] = useState(false);

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

  const allRows = offenders.data?.rows || [];

  const rowsByKey = useMemo(() => {
    const m = new Map();
    for (const r of allRows) m.set(String(r.personKey), r);
    return m;
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!inBand(band, r.riskScore)) return false;
      if (!q) return true;
      const hay = [r.canonicalName, r.personKey, ...(r.aliases || []), ...(r.moTags || [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, search, band]);

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

  useEffect(() => { setPage(1); }, [search, repeatOnly, districtName, band, sort]);

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
        toast.info(`Compare holds up to ${COMPARE_MAX} offenders — remove one first.`);
        return prev;
      }
      return [...prev, key];
    });
  };

  const removeCompare = (key) => setCompare((prev) => prev.filter((k) => k !== String(key)));

  const exportCsv = () => {
    if (!sorted.length) { toast.info('Nothing to export under the current filters.'); return; }
    downloadCsv(`dappa-offenders-${new Date().toISOString().slice(0, 10)}.csv`, CSV_COLUMNS, sorted);
    toast.success(`Exported ${fmtInt(sorted.length)} offender row${sorted.length === 1 ? '' : 's'} to CSV.`);
  };

  const columns = [
    {
      key: 'canonicalName',
      label: 'Canonical name',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            className="accent-amber shrink-0"
            checked={compare.includes(String(r.personKey))}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleCompare(r)}
            aria-label={`Select ${r.canonicalName || r.personKey} for comparison`}
          />
          <div className="min-w-0">
            <p className="font-medium text-ink truncate">{r.canonicalName || r.personKey}</p>
            <p className="text-[10px] text-muted num truncate">{r.personKey}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'aliases',
      label: 'Aliases',
      align: 'right',
      width: 70,
      render: (r) => (
        <span title={(r.aliases || []).join(', ') || 'no aliases'}>{fmtInt((r.aliases || []).length)}</span>
      ),
    },
    { key: 'caseCount', label: 'Cases', sortable: true, align: 'right', width: 70 },
    {
      key: 'districts',
      label: 'Districts',
      align: 'right',
      width: 80,
      render: (r) => (
        <span title={(r.districts || []).join(', ') || '—'}>{fmtInt((r.districts || []).length)}</span>
      ),
    },
    {
      key: 'moTags',
      label: 'MO tags',
      render: (r) => <MoChips tags={r.moTags || []} />,
    },
    {
      key: 'riskScore',
      label: 'Risk',
      sortable: true,
      align: 'right',
      width: 80,
      render: (r) => <RiskBadge score={r.riskScore} />,
    },
    {
      key: 'communityId',
      label: 'Group',
      align: 'center',
      width: 80,
      render: (r) => (r.communityId === null || r.communityId === undefined ? (
        <span className="text-muted">—</span>
      ) : (
        <Link
          to={`/network?communityId=${encodeURIComponent(r.communityId)}&focus=${encodeURIComponent(r.personKey)}`}
          className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
          title="Open this community in the Network Explorer"
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: communityColor(r.communityId) }} />
          #{String(r.communityId)}
        </Link>
      )),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Offenders</h1>
        <p className="page-subtitle">Identity-resolved persons across FIRs — linked by alias, phone and address signals</p>
      </div>

      <FilterBar show={['district']}>
        <input
          className="input-dark !py-1.5 w-52 sm:w-64"
          placeholder="Search name, alias, MO tag…"
          value={search}
          onChange={(e) => setParams({ q: e.target.value })}
          aria-label="Search offenders"
        />
        <SegmentedControl
          ariaLabel="Risk band filter"
          value={band}
          onChange={(v) => setParams({ band: v === 'all' ? '' : v })}
          options={BANDS}
        />
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-amber"
            checked={repeatOnly}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Repeat only (≥3 cases)
        </label>
      </FilterBar>

      <Card
        padded={false}
        title="Resolved persons"
        subtitle={offenders.isLoading
          ? 'Loading registry…'
          : `${fmtInt(sorted.length)} shown${search ? ` for “${search.trim()}”` : ''} · ${fmtInt(serverTotal)} total on file`}
        actions={(
          <>
            {truncated && <Badge tone="slate" className="hidden sm:inline-flex">top {FETCH_CAP} by risk loaded</Badge>}
            <DensityToggle className="hidden md:inline-flex" />
            <button
              type="button"
              className="btn !py-1.5 !px-2.5 text-xs"
              onClick={exportCsv}
              disabled={offenders.isLoading || !sorted.length}
            >
              Export CSV
            </button>
          </>
        )}
      >
        {offenders.error ? (
          <EmptyState
            title="Couldn't load the offender registry"
            message={offenders.error.message}
            action={<button type="button" className="btn" onClick={() => offenders.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey="personKey"
            loading={offenders.isLoading}
            emptyMessage={search
              ? 'No offender matches this search — try a shorter fragment.'
              : repeatOnly
                ? 'No repeat offenders (≥3 cases) under the current filters — untick “Repeat only”.'
                : 'No offender profiles under the current filters.'}
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

      {compare.length > 0 && (
        <div
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
            rounded-xl border border-grid bg-panel/95 backdrop-blur px-3 py-2 shadow-lift
            max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar"
          role="region"
          aria-label="Offender comparison tray"
        >
          {compare.map((k) => (
            <span key={k} className="chip !py-0.5 text-[11px] shrink-0">
              <span className="truncate max-w-[8rem]">{rowsByKey.get(k)?.canonicalName || k}</span>
              <button
                type="button"
                className="text-muted hover:text-ink leading-none"
                onClick={() => removeCompare(k)}
                aria-label={`Remove ${rowsByKey.get(k)?.canonicalName || k} from comparison`}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 text-xs shrink-0"
            disabled={compare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            Compare ({compare.length})
          </button>
          <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs shrink-0" onClick={() => setCompare([])}>
            Clear
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
