// /alerts — sticky bulk-action bar.
//
// Triaging 600+ alerts one card at a time is not a workflow. Selection is
// per-card (or select-all-visible), and this bar applies one decision to the
// whole set: acknowledge, dismiss as a false positive, snooze for a day, mark
// read, or drop the selection into the digest composer. Writes run through the
// same /alerts/:id/status endpoint one id at a time, so the bar shows real
// progress and reports partial failure rather than pretending.
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const BTN = 'btn !px-2.5 !text-xs min-h-[44px] sm:min-h-[32px]';

export default function BulkBar({
  count, visibleCount, allSelected, progress,
  onSelectAll, onClear, onAck, onDismiss, onSnooze, onRead, onDigest,
}) {
  const t = useT();
  if (!count && !progress?.active) return null;
  const busy = !!progress?.active;
  const pct = busy && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="sticky bottom-2 z-30 mx-auto w-full max-w-[1200px]">
      <div className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-panel/95 p-2.5 shadow-lift backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber" className="num">{t('alerts.bulk.selected', { n: fmtInt(count) })}</Badge>
          <button type="button" className={BTN} disabled={busy} onClick={onSelectAll}>
            {allSelected
              ? t('alerts.bulk.clear')
              : t('alerts.bulk.selectAll', { n: fmtInt(visibleCount) })}
          </button>
          <button type="button" className={BTN} disabled={busy || !count} onClick={onClear}>
            {t('alerts.bulk.deselect')}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" className={BTN} disabled={busy || !count} onClick={onRead}>
              {t('alerts.bulk.markRead')}
            </button>
            <button type="button" className={BTN} disabled={busy || !count} onClick={onSnooze}>
              {t('alerts.bulk.snooze')}
            </button>
            <button type="button" className={BTN} disabled={busy || !count} onClick={onDigest}>
              {t('alerts.bulk.digest')}
            </button>
            <button type="button" className={BTN} disabled={busy || !count} onClick={onDismiss}>
              {t('alerts.bulk.dismiss')}
            </button>
            <button
              type="button"
              className={`btn-primary !px-2.5 !text-xs min-h-[44px] sm:min-h-[32px]`}
              disabled={busy || !count}
              onClick={onAck}
            >
              {t('alerts.bulk.ack')}
            </button>
          </div>
        </div>

        {busy && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-grid/50" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="num text-[11px] text-muted">
              {t('alerts.bulk.progress', {
                done: fmtInt(progress.done), total: fmtInt(progress.total), failed: fmtInt(progress.failed),
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
