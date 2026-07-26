// /alerts — SLA ageing profile.
//
// The per-card countdown tells one officer about one alert. This tells the desk
// supervisor how the whole queue is ageing: how many alerts are still fresh,
// how many have burned past half their window, how many are in the final
// quarter (the amber warning state), and how many have already breached. Each
// bucket is a filter, so "show me everything in the final quarter" is one tap.
//
// Buckets are computed from the same slaFor() the badges use, so a card and
// this panel can never disagree.
import { useMemo } from 'react';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { slaFor, slaDuration } from './sla.js';

/** Ordered worst-first so the eye lands on the breach column. */
export const AGE_BUCKETS = ['breached', 'final', 'half', 'fresh'];

const TONE = {
  breached: { bar: 'bg-signal', text: 'text-signal', border: '!border-signal/60 !text-signal' },
  final: { bar: 'bg-amber', text: 'text-amber', border: '!border-amber/60 !text-amber' },
  half: { bar: 'bg-primary/70', text: 'text-ink', border: '!border-primary/60 !text-primary' },
  fresh: { bar: 'bg-teal/70', text: 'text-muted', border: '!border-teal/60 !text-teal' },
};

/** Which bucket one SLA state falls in. Exported so the feed filter matches. */
export function bucketOf(sla) {
  if (!sla) return 'fresh';
  if (sla.breached) return 'breached';
  const spent = 1 - sla.remainingMs / (sla.hours * 3600000);
  if (spent >= 0.75) return 'final';
  if (spent >= 0.5) return 'half';
  return 'fresh';
}

export default function AgeingBuckets({ alerts, firstSeen, now, activeBucket, onPick }) {
  const t = useT();

  const model = useMemo(() => {
    const counts = { breached: 0, final: 0, half: 0, fresh: 0 };
    let worst = null;
    for (const a of alerts) {
      const sla = slaFor(a, firstSeen[String(a.alertId)], now);
      counts[bucketOf(sla)] += 1;
      if (!worst || sla.remainingMs < worst.remainingMs) worst = sla;
    }
    const total = alerts.length;
    const onTime = total ? ((total - counts.breached) / total) * 100 : null;
    return { counts, total, worst, onTime };
  }, [alerts, firstSeen, now]);

  if (!model.total) return <p className="text-xs text-muted">{t('alerts.intel.noAgeing')}</p>;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="num text-muted">
          {t('alerts.intel.compliance', { pct: model.onTime === null ? '—' : model.onTime.toFixed(1) })}
        </span>
        {model.worst && (
          <span className={`num ${model.worst.breached ? 'text-signal' : 'text-muted'}`}>
            {model.worst.breached
              ? t('alerts.intel.worstBreach', { t: slaDuration(model.worst.remainingMs, t) })
              : t('alerts.intel.worstRemaining', { t: slaDuration(model.worst.remainingMs, t) })}
          </span>
        )}
      </div>

      {/* Stacked proportion bar — the queue at a glance. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-grid/40" aria-hidden="true">
        {AGE_BUCKETS.map((k) => {
          const pct = (model.counts[k] / model.total) * 100;
          if (pct <= 0) return null;
          return <span key={k} className={TONE[k].bar} style={{ width: `${pct}%` }} />;
        })}
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5" role="group" aria-label={t('alerts.intel.ageingAria')}>
        {AGE_BUCKETS.map((k) => {
          const n = model.counts[k];
          const on = activeBucket === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              disabled={!n}
              onClick={() => onPick?.(on ? '' : k)}
              title={t(`alerts.age.${k}.tip`)}
              className={`flex min-w-[6.5rem] min-h-[44px] flex-1 flex-col items-start rounded-lg border px-2.5 py-1.5 transition-colors ${
                on ? TONE[k].border : 'border-grid/70 hover:border-primary/40'
              } ${n ? '' : 'opacity-50'}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t(`alerts.age.${k}.label`)}
              </span>
              <span className={`num text-base font-semibold leading-tight ${n ? TONE[k].text : 'text-muted/60'}`}>
                {fmtInt(n)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] leading-tight text-muted">{t('alerts.intel.ageingNote')}</p>
    </div>
  );
}
