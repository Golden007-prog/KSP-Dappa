// District compare — pick any two districts (one-tap swap) and see
// side-by-side mini columns: case count with a relative bar, MoM delta, rate
// per lakh, share of the state's volume, derived population and anomaly
// badge — all computed client-side from the district-unfiltered geo rows.
import { useEffect, useMemo, useState } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtNum, fmtPct, fmtCompact } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { unitPopulation } from './insights.js';

function Column({ row, max, stateTotal }) {
  const t = useT();
  const tName = useNames();
  const width = max > 0 ? Math.max(4, Math.round(((row.caseCount || 0) / max) * 100)) : 0;
  const pop = unitPopulation(row);
  const share = stateTotal > 0 ? ((Number(row.caseCount) || 0) / stateTotal) * 100 : null;
  return (
    <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-grid bg-canvas/40 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {tName('districts', row.districtId, row.districtName || row.districtId) || row.districtId}
        </p>
        {row.alert && <Badge tone="red" pulse>{t('dashboard.districts.anomaly')}</Badge>}
      </div>
      <p className="num text-xl font-semibold tracking-tight text-ink">{fmtInt(row.caseCount)}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
        <div className="h-full rounded-full bg-amber/80" style={{ width: `${width}%` }} />
      </div>
      <dl className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('dashboard.districts.momChange')}</dt>
          <dd><StatDelta value={Number(row.momDeltaPct)} positiveIsGood={false} /></dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('dashboard.districts.ratePerLakh')}</dt>
          <dd className="num text-ink">
            {Number.isFinite(Number(row.ratePerLakh)) ? fmtNum(row.ratePerLakh, 1) : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('dashboard.districts.stateShare')}</dt>
          <dd className="num text-ink">{share === null ? '—' : fmtPct(share, { digits: 1 })}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('dashboard.districts.population')}</dt>
          <dd className="num text-ink">{pop ? fmtCompact(pop) : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function CompareDistricts({ rows = [], loading = false }) {
  const t = useT();
  const tName = useNames();
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const byVolume = useMemo(
    () => [...rows].sort((x, y) => (y.caseCount || 0) - (x.caseCount || 0)),
    [rows],
  );
  // Options carry the translated name so the <select> sorts in the reading
  // order of the active script, not the English one.
  const options = useMemo(
    () => rows
      .map((r) => ({ ...r, label: tName('districts', r.districtId, r.districtName || r.districtId) || String(r.districtId) }))
      .sort((x, y) => x.label.localeCompare(y.label)),
    [rows, tName],
  );

  // Default to the two busiest districts once data arrives.
  useEffect(() => {
    if (byVolume.length >= 2 && !a && !b) {
      setA(String(byVolume[0].districtId));
      setB(String(byVolume[1].districtId));
    }
  }, [byVolume, a, b]);

  if (loading && !rows.length) return <LoadingSkeleton height={160} />;
  if (rows.length < 2) {
    return (
      <EmptyState
        compact
        title={t('dashboard.districts.notEnough')}
        message={t('dashboard.districts.notEnoughHint')}
      />
    );
  }

  const rowA = rows.find((r) => String(r.districtId) === String(a));
  const rowB = rows.find((r) => String(r.districtId) === String(b));
  const max = Math.max(rowA?.caseCount || 0, rowB?.caseCount || 0);
  const stateTotal = rows.reduce((acc, r) => acc + (Number(r.caseCount) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="input-dark min-h-[44px] flex-1 sm:min-h-0"
          value={a}
          onChange={(e) => setA(e.target.value)}
          aria-label={t('dashboard.districts.firstAria')}
        >
          {options.map((r) => (
            <option key={r.districtId} value={r.districtId}>{r.label}</option>
          ))}
        </select>
        <button
          type="button"
          aria-label={t('dashboard.districts.swapAria')}
          title={t('dashboard.districts.swapTitle')}
          onClick={() => { setA(b); setB(a); }}
          className="flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center self-center rounded-lg border border-grid
            bg-panel text-muted transition-colors hover:border-primary/50 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 8h13m0 0-4-4m4 4-4 4M17 16H4m0 0 4 4m-4-4 4-4" />
          </svg>
        </button>
        <select
          className="input-dark min-h-[44px] flex-1 sm:min-h-0"
          value={b}
          onChange={(e) => setB(e.target.value)}
          aria-label={t('dashboard.districts.secondAria')}
        >
          {options.map((r) => (
            <option key={r.districtId} value={r.districtId}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {rowA && <Column row={rowA} max={max} stateTotal={stateTotal} />}
        {rowB && <Column row={rowB} max={max} stateTotal={stateTotal} />}
      </div>
      <p className="text-[10px] text-muted">{t('dashboard.districts.footnote')}</p>
    </div>
  );
}
