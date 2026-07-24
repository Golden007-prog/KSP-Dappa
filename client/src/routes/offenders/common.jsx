// Shared bits for the Offenders registry + Offender 360 views.
import Badge from '../../components/Badge.jsx';
import { fmtNum } from '../../lib/format.js';

/** Risk score 0–100 → tone-coded badge (thresholds match StationRisk styling). */
export function RiskBadge({ score, pulse = false }) {
  const n = Number(score);
  if (!Number.isFinite(n)) return <Badge tone="slate">—</Badge>;
  const tone = n >= 70 ? 'red' : n >= 40 ? 'amber' : 'teal';
  return <Badge tone={tone} pulse={pulse && tone === 'red'}>{fmtNum(n, 1)}</Badge>;
}

/** Case outcome → tone-coded badge for timeline / tables. */
export function OutcomeBadge({ status }) {
  const s = String(status || '');
  if (!s) return <Badge tone="slate">—</Badge>;
  const tone = /convict|charge\s*sheet|a\s*final/i.test(s) ? 'teal'
    : /under\s*invest|pending|open/i.test(s) ? 'amber'
      : 'neutral';
  return <Badge tone={tone}>{s}</Badge>;
}

/** MO tag chips, truncated to `max` with a +n overflow chip. */
export function MoChips({ tags = [], max = 3, className = '' }) {
  if (!tags.length) return <span className="text-muted text-xs">—</span>;
  const shown = tags.slice(0, max);
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {shown.map((t) => <span key={t} className="chip !py-0 text-[10px]">{t}</span>)}
      {tags.length > max && (
        <span className="chip !py-0 text-[10px] text-muted" title={tags.slice(max).join(', ')}>+{tags.length - max}</span>
      )}
    </span>
  );
}
