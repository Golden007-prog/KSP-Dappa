// Expected-vs-observed mini bar — two horizontal bars on a shared scale so the
// gap that raised the alert reads at a glance. Observed is amber, turning red
// once |z| reaches the high threshold; expected stays muted. Pure divs (no
// chart lib) with a text alternative on the wrapper.
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export default function MiniCompareBar({ observed, expected, zScore, className = '' }) {
  const t = useT();
  const obs = Number(observed);
  const exp = Number(expected);
  if (!Number.isFinite(obs) || !Number.isFinite(exp)) return null;
  const max = Math.max(obs, exp, 1);
  const hot = Math.abs(Number(zScore) || 0) >= 3;
  const row = (label, v, barCls) => (
    <div className="flex items-center gap-1.5" key={label}>
      <span className="w-10 shrink-0 text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-grid/40">
        <div className={`h-full rounded-sm ${barCls}`} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
      </div>
      <span className="num w-10 shrink-0 text-right text-[10px] text-ink">{fmtInt(v)}</span>
    </div>
  );
  return (
    <div
      className={`space-y-1 ${className}`}
      role="img"
      aria-label={t('alerts.mini.aria', { obs: fmtInt(obs), exp: fmtInt(exp) })}
    >
      {row(t('alerts.mini.observed'), obs, hot ? 'bg-signal' : 'bg-amber')}
      {row(t('alerts.mini.expected'), exp, 'bg-muted/50')}
    </div>
  );
}
