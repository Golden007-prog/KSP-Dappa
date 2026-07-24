// KPI number tile (tabular-nums). Props:
//   label            — caption above the number
//   value            — preformatted string OR number (numbers get en-IN grouping)
//   delta?           — signed percent number (e.g. +4.2). Rendered via StatDelta.
//   deltaLabel?      — small text after the delta (default 'MoM')
//   positiveIsGood?  — default true; flips delta coloring (false for crime counts)
//   accent?          — 'amber'|'red'|'teal' left hairline (default 'amber')
//   pulse?           — show a PulseDot next to the label (e.g. active alerts > 0)
//   hint?            — muted footnote line
//   spark?           — optional array of numbers → inline SVG sparkline beside
//                      the value (pure SVG, no deps; needs ≥ 2 finite points)
//   loading?         — renders a skeleton of the same footprint
import LoadingSkeleton from './LoadingSkeleton.jsx';
import PulseDot from './PulseDot.jsx';
import StatDelta from './StatDelta.jsx';
import { fmtInt } from '../lib/format.js';

const ACCENTS = { amber: 'border-l-amber', red: 'border-l-signal', teal: 'border-l-teal' };
const SPARK_STROKE = { amber: 'text-amber/80', red: 'text-signal/80', teal: 'text-teal/80' };

function Sparkline({ data, className = '' }) {
  const w = 88; const h = 28; const pad = 2;
  const nums = (data || []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (nums.length - 1);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${className}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function KpiTile({
  label, value, delta, deltaLabel = 'MoM', positiveIsGood = true,
  accent = 'amber', pulse = false, hint, spark, loading = false, className = '',
}) {
  const display = typeof value === 'number' ? fmtInt(value) : (value ?? '—');
  const hasDelta = Number.isFinite(Number(delta)) && delta !== null && delta !== undefined;
  return (
    <div className={`bg-panel border border-grid border-l-2 ${ACCENTS[accent] || ACCENTS.amber} rounded-xl shadow-card p-4 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
        {pulse && <PulseDot />}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <LoadingSkeleton height={34} className="mt-2" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="num text-2xl font-semibold tracking-tight text-ink">{display}</span>
          {hasDelta && (
            <StatDelta value={Number(delta)} positiveIsGood={positiveIsGood} label={deltaLabel} />
          )}
          {Array.isArray(spark) && (
            <Sparkline data={spark} className={`ml-auto self-end ${SPARK_STROKE[accent] || SPARK_STROKE.amber}`} />
          )}
        </div>
      )}
      {hint && !loading && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
