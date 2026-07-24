// District compare — pick any two districts and see side-by-side mini columns
// (case count with a relative bar, MoM delta, rate per lakh, anomaly badge)
// computed client-side from the district-unfiltered geo rows.
import { useEffect, useMemo, useState } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';

function Column({ row, max }) {
  const width = max > 0 ? Math.max(4, Math.round(((row.caseCount || 0) / max) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-grid bg-base/40 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{row.districtName || row.districtId}</p>
        {row.alert && <Badge tone="red" pulse>anomaly</Badge>}
      </div>
      <p className="num text-xl font-semibold tracking-tight text-ink">{fmtInt(row.caseCount)}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
        <div className="h-full rounded-full bg-amber/80" style={{ width: `${width}%` }} />
      </div>
      <dl className="space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">MoM change</dt>
          <dd><StatDelta value={Number(row.momDeltaPct)} positiveIsGood={false} /></dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Rate / lakh</dt>
          <dd className="num text-ink">
            {Number.isFinite(Number(row.ratePerLakh)) ? fmtNum(row.ratePerLakh, 1) : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function CompareDistricts({ rows = [], loading = false }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const byVolume = useMemo(
    () => [...rows].sort((x, y) => (y.caseCount || 0) - (x.caseCount || 0)),
    [rows],
  );
  const options = useMemo(
    () => [...rows].sort((x, y) => String(x.districtName || '').localeCompare(String(y.districtName || ''))),
    [rows],
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
    return <EmptyState compact title="Not enough districts" message="At least two districts are needed for a comparison." />;
  }

  const rowA = rows.find((r) => String(r.districtId) === String(a));
  const rowB = rows.find((r) => String(r.districtId) === String(b));
  const max = Math.max(rowA?.caseCount || 0, rowB?.caseCount || 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="input-dark min-h-[44px] flex-1 sm:min-h-0"
          value={a}
          onChange={(e) => setA(e.target.value)}
          aria-label="First district"
        >
          {options.map((r) => (
            <option key={r.districtId} value={r.districtId}>{r.districtName || r.districtId}</option>
          ))}
        </select>
        <select
          className="input-dark min-h-[44px] flex-1 sm:min-h-0"
          value={b}
          onChange={(e) => setB(e.target.value)}
          aria-label="Second district"
        >
          {options.map((r) => (
            <option key={r.districtId} value={r.districtId}>{r.districtName || r.districtId}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {rowA && <Column row={rowA} max={max} />}
        {rowB && <Column row={rowB} max={max} />}
      </div>
      <p className="text-[10px] text-muted">Counts for the current period · bars scale to the larger district</p>
    </div>
  );
}
