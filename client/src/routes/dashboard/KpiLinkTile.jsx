// KPI tile with MoM + YoY StatDeltas, wrapped in a Link for click-through.
// Mirrors KpiTile's footprint/skeleton so loading and loaded layouts match.
// Props: to, label, value (number → en-IN grouping), mom?, yoy? (signed percent
// numbers; omit to hide), positiveIsGood?=false (crime counts: up = bad),
// accent?='amber'|'red'|'teal', pulse?, hint?, loading?.
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import PulseDot from '../../components/PulseDot.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt } from '../../lib/format.js';

const ACCENTS = { amber: 'border-l-amber', red: 'border-l-signal', teal: 'border-l-teal' };

export default function KpiLinkTile({
  to, label, value, mom, yoy, positiveIsGood = false,
  accent = 'amber', pulse = false, hint, loading = false,
}) {
  const display = typeof value === 'number' ? fmtInt(value) : (value ?? '—');
  return (
    <Link
      to={to}
      className={`group block bg-panel border border-grid border-l-2 ${ACCENTS[accent] || ACCENTS.amber}
        rounded-xl shadow-card p-4 transition-colors hover:border-primary/50 focus-visible:border-primary/50`}
    >
      <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide">
        {pulse && <PulseDot />}
        <span className="truncate">{label}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 text-primary transition-opacity"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </div>
      {loading ? (
        <LoadingSkeleton height={34} className="mt-2" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          <span className="num text-2xl font-semibold tracking-tight text-ink">{display}</span>
          {mom !== undefined && <StatDelta value={Number(mom)} positiveIsGood={positiveIsGood} label="MoM" />}
          {yoy !== undefined && <StatDelta value={Number(yoy)} positiveIsGood={positiveIsGood} label="YoY" />}
        </div>
      )}
      {hint && !loading && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </Link>
  );
}
