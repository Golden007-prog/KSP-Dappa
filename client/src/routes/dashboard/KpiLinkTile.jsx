// KPI tile with MoM + YoY StatDeltas, wrapped in a Link for click-through.
// Mirrors KpiTile's footprint/skeleton so loading and loaded layouts match.
// Props: to, label, value (number → en-IN grouping), mom?, yoy? (signed percent
// numbers; omit to hide), positiveIsGood?=false (crime counts: up = bad),
// accent?='amber'|'red'|'teal', pulse?, hint?, loading?,
// spark? — number[] (≥2 points) renders a mini trend polyline under the value,
// sparkBaseline? — draws the series mean as a dashed line plus a dot on the
//   latest point (visual "target/average" reference),
// progress? — {pct, target?} renders a progress bar under the value with an
//   optional target tick (KPI target line).
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import PulseDot from '../../components/PulseDot.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt } from '../../lib/format.js';

const ACCENTS = { amber: 'border-l-amber', red: 'border-l-signal', teal: 'border-l-teal' };

function Spark({ data, baseline = false }) {
  const w = 96;
  const h = 24;
  const nums = data.map((v) => Number(v) || 0);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const span = max - min || 1;
  const y = (v) => h - 2 - ((v - min) / span) * (h - 4);
  const pts = nums
    .map((v, i) => `${((i / (nums.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return (
    <svg
      width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      className="mt-2 text-amber/70" aria-hidden="true"
    >
      {baseline && (
        <line
          x1="0" y1={y(mean).toFixed(1)} x2={w} y2={y(mean).toFixed(1)}
          stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3"
        />
      )}
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {baseline && (
        <circle cx={w} cy={y(nums[nums.length - 1]).toFixed(1)} r="2" fill="currentColor" />
      )}
    </svg>
  );
}

function ProgressBar({ pct, target }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const t = Number(target);
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-grid/50" aria-hidden="true">
      <div className="h-full rounded-full bg-teal/80" style={{ width: `${p}%` }} />
      {Number.isFinite(t) && (
        <span
          className="absolute -top-[3px] h-3 w-0.5 rounded-sm bg-ink/70"
          style={{ left: `${Math.max(0, Math.min(100, t))}%` }}
          title={`Target ${t}%`}
        />
      )}
    </div>
  );
}

export default function KpiLinkTile({
  to, label, value, mom, yoy, positiveIsGood = false,
  accent = 'amber', pulse = false, hint, loading = false, spark,
  sparkBaseline = false, progress,
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
      {!loading && progress && Number.isFinite(Number(progress.pct)) && (
        <ProgressBar pct={progress.pct} target={progress.target} />
      )}
      {!loading && Array.isArray(spark) && spark.length > 1 && <Spark data={spark} baseline={sparkBaseline} />}
    </Link>
  );
}
