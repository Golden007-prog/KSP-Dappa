// Small ▲/▼ delta chip for stat rows and tiles. Props:
//   value          — signed percent NUMBER (e.g. +4.2, not a fraction)
//   positiveIsGood — default true; pass false for crime counts (up = bad)
//   label?         — muted suffix, e.g. 'MoM'
//   className?
// Renders an em-dash chip when value is not finite; ~0 renders neutral.
import { fmtPct } from '../lib/format.js';

export default function StatDelta({ value, positiveIsGood = true, label, className = '' }) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return <span className={`num text-xs text-muted ${className}`}>—{label ? ` ${label}` : ''}</span>;
  }
  const flat = Math.abs(n) < 0.05;
  const up = n >= 0;
  const good = positiveIsGood ? up : !up;
  const tone = flat ? 'text-muted' : good ? 'text-teal' : 'text-signal';
  return (
    <span className={`num inline-flex items-center gap-0.5 text-xs font-medium ${tone} ${className}`}>
      <span aria-hidden="true">{flat ? '▪' : up ? '▲' : '▼'}</span>
      <span className="sr-only">{flat ? 'unchanged' : up ? 'up' : 'down'}</span>
      {fmtPct(Math.abs(n), { fraction: false })}
      {label && <span className="text-muted font-normal">{label}</span>}
    </span>
  );
}
