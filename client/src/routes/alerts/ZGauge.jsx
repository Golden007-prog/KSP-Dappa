// z-score gauge — pure SVG half-dial mapping |z| onto 0–6 with the severity
// thresholds used across the app (2 → medium, 3 → high, 4 → critical). No
// chart library: it prints crisply, follows the theme via currentColor, and
// costs nothing in the bundle. Text alternative on the wrapper.
import { fmtNum } from '../../lib/format.js';

const MAX_Z = 6;
const BANDS = [
  { from: 0, to: 2, cls: 'text-muted/40', label: 'within expected band' },
  { from: 2, to: 3, cls: 'text-amber/70', label: 'moderate deviation' },
  { from: 3, to: 4, cls: 'text-amber', label: 'high deviation' },
  { from: 4, to: MAX_Z, cls: 'text-signal', label: 'severe deviation' },
];

/** Value on the 0–6 dial → [x, y] at radius r (pivot at 60,58; 180°→0°). */
function polar(v, r) {
  const t = Math.PI * (1 - Math.min(Math.max(v, 0), MAX_Z) / MAX_Z);
  return [60 + r * Math.cos(t), 58 - r * Math.sin(t)];
}

function arc(v0, v1, r) {
  const [x0, y0] = polar(v0, r);
  const [x1, y1] = polar(v1, r);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export default function ZGauge({ z, className = '' }) {
  const abs = Math.abs(Number(z) || 0);
  const clamped = Math.min(abs, MAX_Z);
  const band = BANDS.find((b) => clamped < b.to) || BANDS[BANDS.length - 1];
  const [nx, ny] = polar(clamped, 30);
  return (
    <div className={`flex flex-col items-center ${className}`} role="img" aria-label={`z-score gauge: ${fmtNum(z, 1)} — ${band.label}`}>
      <svg width="118" height="72" viewBox="0 0 120 74" aria-hidden="true" className="max-w-full">
        {BANDS.map((b) => (
          <path
            key={b.from}
            d={arc(b.from + 0.06, b.to - 0.06, 44)}
            className={b.cls}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {[2, 3, 4].map((v) => {
          const [tx, ty] = polar(v, 53);
          return (
            <text key={v} x={tx} y={ty + 2} textAnchor="middle" fontSize="6.5" className="fill-current text-muted">
              {v}
            </text>
          );
        })}
        <line x1="60" y1="58" x2={nx} y2={ny} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-ink" />
        <circle cx="60" cy="58" r="3" fill="currentColor" className="text-ink" />
        <text x="60" y="72" textAnchor="middle" fontSize="12" fontWeight="700" className="fill-current text-ink">
          {fmtNum(abs, 1)}
        </text>
      </svg>
      <p className="text-[10px] text-muted leading-tight text-center">|z| on 0–{MAX_Z} · {band.label}</p>
    </div>
  );
}
