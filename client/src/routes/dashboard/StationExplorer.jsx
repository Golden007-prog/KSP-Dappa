// District → station drill-down with breadcrumbs (C1).
// The choropleth answers "which district"; this answers "which of its 14
// stations", which is the level a DySP actually deploys at. Level 1 lists the
// districts by volume, level 2 lists that district's stations from
// /geo/stations?districtId (a scoped request — never the 282-row statewide
// page), level 3 opens one station with its coordinates, risk drivers and
// deep links into GeoIntel and the case explorer.
//
// Props: districts (geo rows, statewide), lookupDistricts, riskRows,
//        linkSearch, onPickDistrict?, activeDistrictId
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Badge from '../../components/Badge.jsx';
import { normalizeUnitCode, unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref } from './lib.js';
import { useDistrictStations } from './dataExtra.js';
import { isNum } from './analytics.js';
import { downloadCsv, stamp } from './exports.js';

const SORTS = ['cases', 'risk', 'name'];

/** Six-point risk spark from /risk/stations, drawn inline. */
function RiskSpark({ values = [] }) {
  const pts = (values || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  if (pts.length < 2 || !pts.some((v) => v > 0)) return null;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const w = 46;
  const h = 14;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 text-amber" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

export default function StationExplorer({
  districts = [], lookupDistricts = [], riskRows = [], linkSearch = '',
  onPickDistrict, activeDistrictId,
}) {
  const t = useT();
  const tName = useNames();
  const [drillId, setDrillId] = useState(null);
  const [stationId, setStationId] = useState(null);
  const [sort, setSort] = useLocalPref('dappa-dash-stationsort', 'cases');
  const [q, setQ] = useState('');

  const stations = useDistrictStations(drillId);

  const riskByUnit = useMemo(() => {
    const m = new Map();
    for (const r of riskRows || []) {
      const id = r?.unitId === undefined || r?.unitId === null ? '' : String(r.unitId);
      if (id) m.set(id, r);
    }
    return m;
  }, [riskRows]);

  const districtName = (id) => {
    const fromLookup = (lookupDistricts || []).find(
      (d) => normalizeUnitCode(d.districtId) === normalizeUnitCode(id),
    )?.districtName;
    const fromGeo = (districts || []).find(
      (d) => normalizeUnitCode(d.districtId) === normalizeUnitCode(id),
    )?.districtName;
    const raw = fromGeo || fromLookup || unitInfo(id)?.name || String(id ?? '');
    return tName('districts', id, raw) || raw;
  };

  const districtRows = useMemo(
    () => [...(districts || [])]
      .filter((d) => d && (d.districtId ?? d.unitId) !== undefined)
      .sort((a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0)),
    [districts],
  );

  const stationRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (stations.data || []).map((s) => {
      const risk = riskByUnit.get(String(s.unitId));
      return {
        ...s,
        riskScore: isNum(s.riskScore) ? Number(s.riskScore)
          : isNum(risk?.riskScore) ? Number(risk.riskScore) : null,
        spark: Array.isArray(risk?.spark) ? risk.spark : null,
        drivers: Array.isArray(risk?.drivers) ? risk.drivers : [],
      };
    }).filter((s) => !needle || String(s.unitName || s.unitId).toLowerCase().includes(needle));
    const by = {
      cases: (a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0),
      risk: (a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1),
      name: (a, b) => String(a.unitName || '').localeCompare(String(b.unitName || '')),
    };
    return rows.sort(by[SORTS.includes(sort) ? sort : 'cases']);
  }, [stations.data, riskByUnit, q, sort]);

  const selected = useMemo(
    () => stationRows.find((s) => String(s.unitId) === String(stationId)) || null,
    [stationRows, stationId],
  );

  const maxCases = Math.max(1e-9, ...stationRows.map((s) => Number(s.caseCount) || 0));
  const districtTotal = stationRows.reduce((a, s) => a + (Number(s.caseCount) || 0), 0);

  const linkWith = (base, extra = {}) => {
    const qs = new URLSearchParams(linkSearch ? linkSearch.slice(1) : '');
    for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, String(v));
    const s = qs.toString();
    return `${base}${s ? `?${s}` : ''}`;
  };

  const exportCsv = () => downloadCsv(
    `stations-${drillId || 'all'}-${stamp()}.csv`,
    [t('dashboard.csv.station'), t('dashboard.csv.district'), t('dashboard.csv.cases'),
      t('dashboard.csv.risk30d'), t('dashboard.csv.lat'), t('dashboard.csv.lng')],
    stationRows.map((s) => [
      s.unitName || s.unitId, districtName(drillId), s.caseCount,
      s.riskScore ?? '', s.lat ?? '', s.lng ?? '',
    ]),
  );

  const sortOptions = useMemo(
    () => SORTS.map((v) => ({ value: v, label: t(`dashboard.station.sort.${v}`) })),
    [t],
  );

  // ---- breadcrumbs --------------------------------------------------------
  const crumbs = [
    { key: 'state', label: t('dashboard.station.crumbState'), onClick: () => { setDrillId(null); setStationId(null); } },
    ...(drillId ? [{ key: 'district', label: districtName(drillId), onClick: () => setStationId(null) }] : []),
    ...(selected ? [{ key: 'station', label: selected.unitName || String(selected.unitId) }] : []),
  ];

  return (
    <div className="space-y-2.5">
      <nav aria-label={t('dashboard.station.crumbAria')} className="flex flex-wrap items-center gap-1 text-[11px]">
        {crumbs.map((c, i) => (
          <span key={c.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted" aria-hidden="true">/</span>}
            {c.onClick ? (
              <button
                type="button"
                onClick={c.onClick}
                className="min-h-[28px] max-w-[10rem] truncate rounded px-1 text-muted transition-colors hover:text-amber"
              >
                {c.label}
              </button>
            ) : (
              <span className="max-w-[10rem] truncate px-1 font-semibold text-ink" aria-current="page">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* ---- level 1: districts ---- */}
      {!drillId && (
        districtRows.length === 0 ? (
          <EmptyState compact title={t('dashboard.station.noDistricts')} message={t('dashboard.station.noDistrictsHint')} />
        ) : (
          <>
            {/* One column, always. This panel occupies a single grid track on
                xl, so a viewport-width `sm:grid-cols-2` split the ~300px card
                into two 150px cells and collided the district name with its
                bar and count. */}
            <ul className="grid grid-cols-1 gap-1.5">
              {districtRows.slice(0, 10).map((d) => {
                const id = d.districtId ?? d.unitId;
                const maxD = Math.max(1e-9, ...districtRows.map((x) => Number(x.caseCount) || 0));
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => { setDrillId(String(id)); setStationId(null); setQ(''); }}
                      title={t('dashboard.station.drillTitle', { name: districtName(id) })}
                      className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:border-amber/50 ${
                        String(activeDistrictId) === String(id) ? 'border-amber/60 bg-amber/5' : 'border-grid/60 bg-base/30'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">{districtName(id)}</span>
                      {d.alert && <Badge tone="red" pulse className="shrink-0">{t('dashboard.station.anomaly')}</Badge>}
                      <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-grid/50 sm:w-14" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-amber/80"
                          style={{ width: `${Math.max(6, Math.round(((Number(d.caseCount) || 0) / maxD) * 100))}%` }}
                        />
                      </span>
                      <span className="num shrink-0 text-xs text-ink">{fmtInt(d.caseCount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted">{t('dashboard.station.pickHint')}</p>
          </>
        )
      )}

      {/* ---- level 2/3: stations of the drilled district ---- */}
      {drillId && (
        <>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            <SegmentedControl
              ariaLabel={t('dashboard.station.sortAria')}
              value={SORTS.includes(sort) ? sort : 'cases'}
              onChange={setSort}
              options={sortOptions}
              className="shrink-0"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('dashboard.station.searchPlaceholder')}
              aria-label={t('dashboard.station.searchAria')}
              className="min-h-[36px] w-28 shrink-0 rounded-lg border border-grid bg-panel px-2 text-xs text-ink placeholder:text-muted focus:border-amber focus:outline-none sm:w-40"
            />
            {stationRows.length > 0 && (
              <button type="button" onClick={exportCsv} className="chip min-h-[36px] shrink-0 px-2.5 hover:border-amber/40">
                {t('dashboard.station.csv')}
              </button>
            )}
          </div>

          {stations.isLoading ? (
            <LoadingSkeleton lines={6} />
          ) : stations.error ? (
            <EmptyState
              compact
              title={t('dashboard.station.error')}
              message={stations.error.message}
              action={<button type="button" className="btn" onClick={() => stations.refetch()}>{t('common.action.retry')}</button>}
            />
          ) : !stationRows.length ? (
            <EmptyState compact title={t('dashboard.station.empty')} message={t('dashboard.station.emptyHint')} />
          ) : (
            <>
              <p className="text-[11px] text-muted">
                {t('dashboard.station.summary', { n: fmtInt(stationRows.length), total: fmtInt(districtTotal) })}
              </p>
              <ol className="max-h-64 divide-y divide-grid/50 overflow-y-auto">
                {stationRows.map((s) => {
                  const on = String(s.unitId) === String(stationId);
                  return (
                    <li key={s.unitId}>
                      <button
                        type="button"
                        onClick={() => setStationId(on ? null : String(s.unitId))}
                        aria-expanded={on}
                        className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-grid/30 ${on ? 'bg-amber/5' : ''}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">{s.unitName || s.unitId}</span>
                        <RiskSpark values={s.spark} />
                        {s.riskScore !== null && (
                          <Badge tone={s.riskScore >= 70 ? 'red' : s.riskScore >= 45 ? 'amber' : 'slate'} className="shrink-0">
                            {t('dashboard.station.risk', { v: fmtNum(s.riskScore, 0) })}
                          </Badge>
                        )}
                        <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-grid/50 sm:w-16" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-amber/80"
                            style={{ width: `${Math.max(6, Math.round(((Number(s.caseCount) || 0) / maxCases) * 100))}%` }}
                          />
                        </span>
                        <span className="num shrink-0 text-xs text-ink">{fmtInt(s.caseCount)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {selected && (
                <div className="rounded-lg border border-grid/70 bg-base/30 p-2.5">
                  <p className="truncate text-xs font-semibold text-ink">{selected.unitName || selected.unitId}</p>
                  <p className="num mt-0.5 text-[10px] text-muted">
                    {t('dashboard.station.detail', {
                      district: districtName(drillId),
                      cases: fmtInt(selected.caseCount),
                      share: districtTotal > 0
                        ? fmtNum(((Number(selected.caseCount) || 0) / districtTotal) * 100, 1)
                        : '0.0',
                    })}
                  </p>
                  {isNum(selected.lat) && isNum(selected.lng) && (
                    <p className="num mt-0.5 text-[10px] text-muted">
                      {t('dashboard.station.coords', {
                        lat: fmtNum(selected.lat, 4), lng: fmtNum(selected.lng, 4),
                      })}
                    </p>
                  )}
                  {selected.drivers.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selected.drivers.slice(0, 3).map((d) => (
                        <span key={d} className="rounded-full border border-grid bg-panel px-1.5 py-0.5 text-[9px] text-muted">{d}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onPickDistrict?.(drillId)}
                      className="chip min-h-[36px] px-2.5 hover:border-amber/40"
                    >
                      {t('dashboard.station.filterDistrict')}
                    </button>
                    <Link to={linkWith('/map', { districtId: drillId, unitId: selected.unitId })} className="chip min-h-[36px] px-2.5 hover:border-amber/40">
                      {t('dashboard.link.map')}
                    </Link>
                    <Link to={linkWith('/cases', { districtId: drillId })} className="chip min-h-[36px] px-2.5 hover:border-amber/40">
                      {t('dashboard.link.cases')}
                    </Link>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted">{t('dashboard.station.footnote')}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
