// Escalation SLA countdown badge for one open alert: neutral while comfortably
// inside the window, amber once <25% of it remains, pulsing red after breach.
// The tooltip spells out the per-severity policy so the badge self-documents.
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { slaDuration, SLA_HOURS, DEFAULT_SLA_HOURS, SLA_POLICY_TEXT } from './sla.js';

export default function SlaBadge({ sla, severity, className = '' }) {
  if (!sla) return null;
  const sev = String(severity || '').toLowerCase();
  const hours = SLA_HOURS[sev] ?? DEFAULT_SLA_HOURS;
  const tip = `Triage SLA for ${sev || 'this'} severity: ${hours}h (${SLA_POLICY_TEXT})`;
  return (
    <Tooltip label={tip} className={className}>
      <span tabIndex={0} className="inline-flex cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        {sla.breached ? (
          <Badge tone="red" pulse className="num">SLA breached {slaDuration(sla.remainingMs)}</Badge>
        ) : (
          <Badge tone={sla.warning ? 'amber' : 'slate'} className="num">SLA {slaDuration(sla.remainingMs)}</Badge>
        )}
      </span>
    </Tooltip>
  );
}
