// Escalation SLA countdown badge for one open alert: neutral while comfortably
// inside the window, amber once <25% of it remains, pulsing red after breach.
// The tooltip spells out the per-severity policy so the badge self-documents.
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import { slaDuration, slaPolicyText, SLA_HOURS, DEFAULT_SLA_HOURS } from './sla.js';
import { sevKey } from './severity.js';

export default function SlaBadge({ sla, severity, className = '' }) {
  const t = useT();
  if (!sla) return null;
  const sev = sevKey(severity);
  const hours = SLA_HOURS[sev] ?? DEFAULT_SLA_HOURS;
  const sevLabel = sev ? t(`alerts.sevLower.${sev}`) : t('alerts.sla.thisSeverity');
  const tip = t('alerts.sla.tip', { sev: sevLabel, hours, policy: slaPolicyText(t) });
  return (
    <Tooltip label={tip} className={className}>
      <span tabIndex={0} className="inline-flex cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        {sla.breached ? (
          <Badge tone="red" pulse className="num">{t('alerts.sla.breached', { t: slaDuration(sla.remainingMs, t) })}</Badge>
        ) : (
          <Badge tone={sla.warning ? 'amber' : 'slate'} className="num">{t('alerts.sla.remaining', { t: slaDuration(sla.remainingMs, t) })}</Badge>
        )}
      </span>
    </Tooltip>
  );
}
