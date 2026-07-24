// "This month vs last month" comparison strip — total plus per-crime-head
// chips (count + MoM delta, biggest risers first), horizontally scrollable.
// Data is computed once in Dashboard.jsx (buildCompareView) so the CSV export
// and this render share the exact same numbers.
// Props: view (null while empty), loading, linkSearch (carries URL filters).
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt, monthLabel } from '../../lib/format.js';

export default function CompareStrip({ view, loading = false, linkSearch = '' }) {
  if (loading) return <LoadingSkeleton height={54} />;
  if (!view) {
    return (
      <EmptyState
        compact
        title="Not enough history"
        message="Two consecutive months of data are needed for a comparison."
      />
    );
  }
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
      <div className="shrink-0 rounded-lg border border-amber/40 bg-amber/5 px-3 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted">
          All heads · {monthLabel(view.curYm)} vs {monthLabel(view.prevYm)}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="num text-base font-semibold text-ink">{fmtInt(view.total.cur)}</span>
          <StatDelta value={view.total.delta} positiveIsGood={false} />
        </p>
      </div>
      {view.items.map((it) => (
        <Link
          key={it.name}
          to={`/trends${linkSearch}`}
          title={`${it.name}: ${fmtInt(it.cur)} this month vs ${fmtInt(it.prev)} last month — open Trends`}
          className="shrink-0 rounded-lg border border-grid bg-panel px-3 py-1.5 transition-colors hover:border-amber/50"
        >
          <p className="text-[10px] uppercase tracking-wide text-muted truncate max-w-[10rem]">{it.name}</p>
          <p className="flex items-baseline gap-2">
            <span className="num text-base font-semibold text-ink">{fmtInt(it.cur)}</span>
            <StatDelta value={it.delta} positiveIsGood={false} />
          </p>
        </Link>
      ))}
    </div>
  );
}
