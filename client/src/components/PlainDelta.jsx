// A KPI delta that respects the Government Analysis Function rule "call noise
// noise": when plain-language mode is on and the latest point sits within two
// normal swings of its own history, the tile says "within the normal range"
// instead of "▲ 12 % MoM" — the percentage stays one hover away. When the move
// IS outside the normal range the ▲/▼ chip is kept and the swing phrase is
// added after it. Without a series (no history to judge against) or with
// plain mode off it renders StatDelta unchanged.
//
// Props: value (signed percent), series? (number[] — the tile's sparkline,
// latest point last), positiveIsGood?, label?, className?.
import StatDelta from './StatDelta.jsx';
import Tooltip from './Tooltip.jsx';
import { usePlain } from '../lib/plainlanguage.js';
import { zFromSeries, withinNormal } from '../lib/status.js';
import { fmtPct } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

export default function PlainDelta({ value, series, positiveIsGood = false, label, className = '' }) {
  const t = useT();
  const { plain, fmt } = usePlain();
  const z = zFromSeries(series);
  if (!plain || z === null) {
    return <StatDelta value={value} positiveIsGood={positiveIsGood} label={label} className={className} />;
  }
  const n = Number(value);
  const pct = Number.isFinite(n) ? `${fmtPct(n, { sign: true, fraction: false })}${label ? ` ${label}` : ''}` : '—';
  if (withinNormal(z)) {
    return (
      <Tooltip label={t('tier.delta.behindNormal', { pct })} position="bottom">
        <span tabIndex={0} className={`inline-flex items-center gap-1 text-xs text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${className}`}>
          <span aria-hidden="true">✓</span>
          <span>{t('tier.delta.withinNormal')}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      <StatDelta value={value} positiveIsGood={positiveIsGood} label={label} />
      <span className="text-[11px] text-muted">· {fmt('zscore', z)}</span>
    </span>
  );
}
