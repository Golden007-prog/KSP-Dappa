// KPI number tile (tabular-nums). Props:
//   label            — caption above the number
//   value            — preformatted string OR number (numbers get en-IN grouping)
//   delta?           — signed percent number (e.g. +4.2). Rendered as ▲/▼ chip.
//   deltaLabel?      — small text after the delta (default 'MoM')
//   positiveIsGood?  — default true; flips delta coloring (false for crime counts)
//   accent?          — 'amber'|'red'|'teal' left hairline (default 'amber')
//   pulse?           — show a PulseDot next to the label (e.g. active alerts > 0)
//   hint?            — muted footnote line
//   loading?         — renders a skeleton of the same footprint
import LoadingSkeleton from './LoadingSkeleton.jsx';
import PulseDot from './PulseDot.jsx';
import { fmtInt, fmtPct } from '../lib/format.js';

const ACCENTS = { amber: 'border-l-amber', red: 'border-l-signal', teal: 'border-l-teal' };

export default function KpiTile({
  label, value, delta, deltaLabel = 'MoM', positiveIsGood = true,
  accent = 'amber', pulse = false, hint, loading = false, className = '',
}) {
  const display = typeof value === 'number' ? fmtInt(value) : (value ?? '—');
  const hasDelta = Number.isFinite(Number(delta)) && delta !== null && delta !== undefined;
  const up = Number(delta) >= 0;
  const good = positiveIsGood ? up : !up;
  return (
    <div className={`bg-panel border border-grid border-l-2 ${ACCENTS[accent] || ACCENTS.amber} rounded-xl p-4 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
        {pulse && <PulseDot />}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <LoadingSkeleton height={34} className="mt-2" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="num text-2xl font-semibold text-ink">{display}</span>
          {hasDelta && (
            <span className={`num inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-teal' : 'text-signal'}`}>
              <span aria-hidden="true">{up ? '▲' : '▼'}</span>
              {fmtPct(Math.abs(Number(delta)), { fraction: false })}
              <span className="text-muted font-normal">{deltaLabel}</span>
            </span>
          )}
        </div>
      )}
      {hint && !loading && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
