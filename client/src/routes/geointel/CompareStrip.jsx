// Month-compare control strip for GeoIntel: pick month A (left of the swipe
// divider) and month B (right), swap them, and read the incident-count delta.
// The parent renders the two clipped heat layers + the draggable divider.
import { fmtInt, monthLabel } from '../../lib/format.js';

export default function CompareStrip({
  months, monthA, monthB, onMonthA, onMonthB, countA, countB, loading, onSwap, onExit,
}) {
  const delta = Number.isFinite(countA) && countA > 0 && Number.isFinite(countB)
    ? ((countB - countA) / countA) * 100
    : null;
  const up = delta !== null && delta > 0;
  return (
    <div className="pointer-events-auto flex items-center gap-2 bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg text-[11px] max-w-full overflow-x-auto no-scrollbar">
      <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Compare</span>
      <label className="flex items-center gap-1 shrink-0">
        <span className="num text-[10px] text-primary font-semibold">A</span>
        <select
          className="input-dark !py-1 !px-1.5 text-[11px]"
          value={monthA || ''}
          aria-label="Compare month A (left of the divider)"
          onChange={(e) => onMonthA(e.target.value)}
        >
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn gi-tap !px-1.5 !py-1 shrink-0"
        onClick={onSwap}
        aria-label="Swap compare months"
        title="Swap A and B"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
        </svg>
      </button>
      <label className="flex items-center gap-1 shrink-0">
        <span className="num text-[10px] text-amber font-semibold">B</span>
        <select
          className="input-dark !py-1 !px-1.5 text-[11px]"
          value={monthB || ''}
          aria-label="Compare month B (right of the divider)"
          onChange={(e) => onMonthB(e.target.value)}
        >
          {!monthB && <option value="">pick…</option>}
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </label>
      <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
      {loading ? (
        <span className="text-muted shrink-0">loading months…</span>
      ) : (
        <span className="shrink-0 num text-muted">
          {fmtInt(countA)} → {fmtInt(countB)} incidents
          {delta !== null && (
            <span className={`ml-1 font-semibold ${up ? 'text-signal' : 'text-teal'}`}>
              {up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </span>
      )}
      <span className="text-[9px] text-muted shrink-0 hidden lg:inline">drag the divider to swipe</span>
      <button
        type="button"
        className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1 shrink-0"
        onClick={onExit}
        aria-label="Exit month compare"
        title="Exit compare"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
