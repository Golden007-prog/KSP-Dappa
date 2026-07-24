// Top movers strip — the three districts with the biggest month-over-month
// swing (server-computed momDeltaPct from /geo/districts). Shown when the
// MoM choropleth metric is active; clicking a mover flies to its polygon and
// opens the district drill.
import { polygonForUnit, unitInfo } from '../../lib/districtGeoMap.js';
import { fmtPct } from '../../lib/format.js';

export default function TopMovers({ rows, onSelect }) {
  const movers = (rows || [])
    .filter((r) => Number.isFinite(Number(r.momDeltaPct)) && polygonForUnit(r.districtId))
    .sort((a, b) => Math.abs(Number(b.momDeltaPct)) - Math.abs(Number(a.momDeltaPct)))
    .slice(0, 3);
  if (!movers.length) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-1.5 bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg max-w-full overflow-x-auto no-scrollbar">
      <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Top movers</span>
      {movers.map((r) => {
        const d = Number(r.momDeltaPct);
        const up = d > 0;
        return (
          <button
            key={r.districtId}
            type="button"
            className="chip gi-tap shrink-0 hover:border-primary/50 transition-colors"
            title={`Fly to ${r.districtName || r.districtId} — ${fmtPct(d, { sign: true, fraction: false })} vs last month`}
            onClick={() => onSelect(r)}
          >
            <span className="truncate max-w-[8rem]">
              {r.districtName || unitInfo(r.districtId)?.name || r.districtId}
            </span>
            <span className={`num text-[11px] ${up ? 'text-signal' : 'text-teal'}`}>
              {up ? '▲' : '▼'} {fmtPct(Math.abs(d), { fraction: false })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
