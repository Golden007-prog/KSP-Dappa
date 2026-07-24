// Triage progress meter — share of the currently-listed alerts already handled
// (acknowledged, snoozed, or locally read). Segmented bar: teal = acked,
// slate = snoozed, amber = read-but-still-open; the empty track is untouched.
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt } from '../../lib/format.js';

export default function TriageProgress({ rows, readIds, snoozes, isAcked, className = '' }) {
  const total = rows.length;
  if (!total) return null;
  const now = Date.now();
  let ack = 0;
  let sno = 0;
  let read = 0;
  for (const a of rows) {
    const id = String(a.alertId);
    if (isAcked(a)) ack += 1;
    else if ((snoozes[id] || 0) > now) sno += 1;
    else if (readIds.has(id)) read += 1;
  }
  const done = ack + sno + read;
  const pct = Math.round((done / total) * 100);
  const seg = (n, cls, key) =>
    n > 0 ? <div key={key} className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null;
  return (
    <Tooltip
      label={`${fmtInt(ack)} acknowledged · ${fmtInt(sno)} snoozed · ${fmtInt(read)} read but open · ${fmtInt(total - done)} untouched`}
      className={`w-full ${className}`}
    >
      <div
        className="w-full cursor-default rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        aria-label={`Triage progress: ${done} of ${total} listed alerts handled (${pct}%)`}
      >
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span className="font-semibold uppercase tracking-wider">Triage progress</span>
          <span className="num">{fmtInt(done)}/{fmtInt(total)} handled · {pct}%</span>
        </div>
        <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
          {seg(ack, 'bg-teal', 'ack')}
          {seg(sno, 'bg-muted/60', 'sno')}
          {seg(read, 'bg-amber', 'read')}
        </div>
      </div>
    </Tooltip>
  );
}
