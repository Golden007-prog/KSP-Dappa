// Small shared visuals for crew scoring.
//
// These live apart from OrgCrimeCrews because the crew drill-in sheet and the
// Offender-360 membership card both draw driver bars, and importing them back
// out of the panel that renders the sheet is a genuine import cycle.
import { fmtNum, fmtPct } from '../../lib/format.js';

/** Horizontal driver bar — the visual "why" behind a crew's score. */
export function DriverBar({ label, value, hint }) {
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted truncate">{label}</span>
        <span className="num text-[11px] text-ink shrink-0">{fmtPct(pct, { digits: 0 })}</span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-grid/60 overflow-hidden">
        <div className="h-full rounded-full bg-amber/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Score readout with a compact rail, tone-coded by organised-crime band. */
export function ScoreMeter({ score, band }) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const tone = band === 'organised' ? 'bg-signal' : band === 'emerging' ? 'bg-amber' : 'bg-muted/60';
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="hidden sm:block h-1.5 w-16 rounded-full bg-grid/60 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="num text-sm font-semibold text-ink tabular-nums">{fmtNum(pct, 1)}</span>
    </div>
  );
}
