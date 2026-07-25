// Triage progress meter — share of the currently-listed alerts already handled
// (acknowledged, snoozed, or locally read). Segmented bar: teal = acked,
// slate = snoozed, amber = read-but-still-open; the empty track is untouched.
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export default function TriageProgress({ rows, readIds, snoozes, isAcked, className = '' }) {
  const t = useT();
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
      label={t('alerts.progress.tip', {
        ack: fmtInt(ack), snoozed: fmtInt(sno), read: fmtInt(read), untouched: fmtInt(total - done),
      })}
      className={`w-full ${className}`}
    >
      <div
        className="w-full cursor-default rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        aria-label={t('alerts.progress.aria', { done, total, pct })}
      >
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span className="font-semibold uppercase tracking-wider">{t('alerts.progress.label')}</span>
          <span className="num">{t('alerts.progress.handled', { done: fmtInt(done), total: fmtInt(total), pct })}</span>
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
