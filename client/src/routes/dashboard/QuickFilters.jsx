// One-tap global filter chips — date-range presets + busiest districts.
// Everything writes through useUrlFilters, so the chips stay in lockstep with
// the URL (shareable links) and with FilterBar's selects on every route.
// Props: districts — [{districtId, districtName, caseCount}] (top by volume,
// supplied by Dashboard from the unfiltered geo query), loading?.
import { useSearchParams } from 'react-router-dom';
import { useUrlFilters, DATE_RANGES } from '../../lib/filters.js';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';

function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`chip min-h-[40px] px-3 shrink-0 transition-colors ${
        active ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
      }`}
    >
      {children}
    </button>
  );
}

export default function QuickFilters({ districts = [], loading = false }) {
  const { districtId, range, setFilter, setFilters } = useUrlFilters();
  const [searchParams] = useSearchParams();
  const hasCustomDates = !!(searchParams.get('from') || searchParams.get('to'));

  return (
    <div
      role="group"
      aria-label="Quick filters"
      className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5"
    >
      {DATE_RANGES.map((r) => (
        <Chip
          key={r.value}
          active={!hasCustomDates && range === r.value}
          onClick={() => setFilter('range', r.value === 'all' ? '' : r.value)}
          title={`Show ${r.label.toLowerCase()}`}
        >
          {r.label}
        </Chip>
      ))}
      {hasCustomDates && (
        <Chip active onClick={() => setFilters({ from: '', to: '' })} title="Clear the custom date range">
          Custom dates ✕
        </Chip>
      )}
      <span className="h-4 w-px shrink-0 bg-grid" aria-hidden="true" />
      {loading && !districts.length && <LoadingSkeleton height={26} className="w-64 shrink-0 !rounded-full" />}
      {districts.map((d) => {
        const active = String(d.districtId) === String(districtId);
        return (
          <Chip
            key={d.districtId}
            active={active}
            onClick={() => setFilter('districtId', active ? '' : d.districtId)}
            title={active ? 'Clear district filter' : `Filter to ${d.districtName}`}
          >
            {d.districtName}
            {active && <span aria-hidden="true"> ✕</span>}
          </Chip>
        );
      })}
    </div>
  );
}
