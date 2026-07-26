// /alerts — "why is this an alert" decomposition.
//
// Every number in the panel is derived, on the client, from the row the server
// sent: expected, observed, the excess, the σ recovered from the detector's own
// z, the band the deviation falls in, and an approximate rarity. Nothing is
// invented and nothing is hidden — including the two caveats printed under it,
// because a robust MAD z is not a normal z and a weekly count is not a normal
// variable. An analytic that explains its own limits is worth more to a police
// user than one that prints a confident p-value.
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { explainAlert, bandRange, detectionLagDays } from './explain.js';
import { SEV_TONE, sevKey } from './severity.js';

function Row({ label, value, tip, tone = 'text-ink' }) {
  const body = (
    <div className="flex items-baseline justify-between gap-3 border-b border-grid/40 py-1 last:border-0">
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`num text-xs font-medium tabular-nums ${tone}`}>{value}</span>
    </div>
  );
  return tip ? <Tooltip label={tip}>{body}</Tooltip> : body;
}

export default function ExplainPanel({ alert: a, createdAt }) {
  const t = useT();
  const e = explainAlert(a);
  const band = e.band || sevKey(a?.severity);
  const lag = detectionLagDays(createdAt, a?.periodEnd);

  return (
    <div className="rounded-lg border border-grid/70 bg-base/20 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t('alerts.explain.title')}
        </span>
        {band && (
          <Badge tone={SEV_TONE[band] || 'neutral'}>
            {t(`alerts.sev.${band}`)} · |z| {bandRange(band)}
          </Badge>
        )}
        {e.direction && (
          <Badge tone={e.direction === 'up' ? 'red' : 'teal'}>
            {t(e.direction === 'up' ? 'alerts.explain.surge' : 'alerts.explain.drop')}
          </Badge>
        )}
      </div>

      <Row label={t('alerts.explain.expected')} value={e.expected === null ? '—' : fmtNum(e.expected, 1)} />
      <Row label={t('alerts.explain.observed')} value={e.observed === null ? '—' : fmtInt(e.observed)} />
      <Row
        label={t('alerts.explain.excess')}
        value={e.excess === null ? '—' : `${e.excess > 0 ? '+' : ''}${fmtNum(e.excess, 1)}`}
        tone={e.excess > 0 ? 'text-signal' : e.excess < 0 ? 'text-teal' : 'text-ink'}
      />
      <Row
        label={t('alerts.explain.pct')}
        value={e.pctVsExpected === null ? '—' : `${e.pctVsExpected > 0 ? '+' : ''}${e.pctVsExpected.toFixed(0)}%`}
        tone={e.pctVsExpected > 0 ? 'text-signal' : e.pctVsExpected < 0 ? 'text-teal' : 'text-ink'}
      />
      <Row
        label={t('alerts.explain.sigma')}
        value={e.sigma === null ? '—' : fmtNum(e.sigma, 2)}
        tip={t('alerts.explain.sigmaTip')}
      />
      <Row
        label={t('alerts.explain.band')}
        value={e.lo === null ? '—' : `${fmtNum(e.lo, 1)} – ${fmtNum(e.hi, 1)}`}
        tip={t('alerts.explain.bandTip')}
      />
      <Row label={t('alerts.explain.z')} value={e.z === null ? '—' : fmtNum(e.z, 2)} />
      <Row
        label={t('alerts.explain.rarity')}
        value={e.oneIn === null ? '—' : t('alerts.explain.oneIn', { n: fmtInt(e.oneIn) })}
        tip={t('alerts.explain.rarityTip')}
      />
      {lag !== null && (
        <Row
          label={t('alerts.explain.lag')}
          // A negative lag means the row was written before its own period
          // closed (the detector can fire mid-window) — say so rather than
          // printing "-13 days after period end".
          value={lag >= 0
            ? t('alerts.explain.lagDays', { n: fmtInt(lag) })
            : t('alerts.explain.lagEarly', { n: fmtInt(Math.abs(lag)) })}
          tip={t('alerts.explain.lagTip')}
        />
      )}
      {createdAt && (
        <Row label={t('alerts.explain.detected')} value={dateLabel(String(createdAt).slice(0, 10))} />
      )}

      <p className="mt-1.5 text-[10px] leading-tight text-muted">{t('alerts.explain.caveat')}</p>
    </div>
  );
}
