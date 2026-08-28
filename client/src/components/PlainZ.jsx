// The z-score badge an alert card carries, said the officer's way when
// plain-language mode is on: "about 3 swings above normal" (or "within the
// normal range") with "z 3.1" behind the tooltip; with plain mode off the
// badge reads "z 3.1" and the plain phrase sits in the tooltip. Drop-in for
// the `<Badge>z …</Badge>` line in routes/alerts/AlertCard.jsx and siblings.
// Props: z (number), tone? (Badge tone), prefix? (the translated 'z' label),
// className?.
import Badge from './Badge.jsx';
import Tooltip from './Tooltip.jsx';
import { usePlain } from '../lib/plainlanguage.js';
import { fmtNum } from '../lib/format.js';

export default function PlainZ({ z, tone = 'red', prefix = 'z', className = '' }) {
  const { plain, fmt, term } = usePlain();
  const n = Number(z);
  if (!Number.isFinite(n)) return <Badge tone="slate" className={`num ${className}`}>{prefix} —</Badge>;
  const technical = `${prefix} ${fmtNum(n, 1)}`;
  const phrase = fmt('zscore', n);
  const r = term('zscore');
  const lead = plain ? phrase : technical;
  const behind = plain ? `${technical} · ${r.technical}` : `${r.label}: ${phrase}`;
  return (
    <Tooltip label={behind} position="bottom">
      <span tabIndex={0} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <Badge tone={tone} className={`${plain ? '' : 'num'} ${className}`}>{lead}</Badge>
      </span>
    </Tooltip>
  );
}
