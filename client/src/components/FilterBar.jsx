// Shared filter bar — District / Crime Head / Date range, persisted in URL
// search params (lib/filters.js). Props:
//   show?     — subset of ['district','crimeHead','dateRange'] (default all three)
//   children? — route-specific extra controls appended on the right
//   className?
// Options come from useLookups(); while lookups load the selects render disabled
// with a 'Loading…' option — never a crash.
import { useLookups } from '../lib/api.js';
import { useUrlFilters, DATE_RANGES } from '../lib/filters.js';

function Select({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">{label}</span>
      <select
        className="input-dark !py-1.5 pr-7 min-w-[9rem] max-w-[14rem]"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        <option value="">{disabled ? 'Loading…' : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function FilterBar({ show = ['district', 'crimeHead', 'dateRange'], children, className = '' }) {
  const lookups = useLookups();
  const { districtId, crimeHeadId, range, setFilter, reset } = useUrlFilters();

  const districts = (lookups.data?.districts || []).map((d) => ({ value: d.districtId, label: d.districtName }));
  const heads = (lookups.data?.crimeHeads || []).map((h) => ({ value: h.crimeHeadId, label: h.headName }));
  const anyActive = districtId || crimeHeadId || (range && range !== 'all');

  return (
    <div className={`flex flex-wrap items-center gap-3 bg-panel border border-grid rounded-xl px-3 py-2 ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0" aria-hidden="true">
        <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" strokeLinejoin="round" />
      </svg>
      {show.includes('district') && (
        <Select
          label="District"
          value={districtId}
          onChange={(v) => setFilter('districtId', v)}
          options={districts}
          placeholder="All districts"
          disabled={lookups.isLoading}
        />
      )}
      {show.includes('crimeHead') && (
        <Select
          label="Crime head"
          value={crimeHeadId}
          onChange={(v) => setFilter('crimeHeadId', v)}
          options={heads}
          placeholder="All crime heads"
          disabled={lookups.isLoading}
        />
      )}
      {show.includes('dateRange') && (
        <Select
          label="Period"
          value={range === 'all' ? '' : range}
          onChange={(v) => setFilter('range', v)}
          options={DATE_RANGES.filter((r) => r.value !== 'all').map((r) => ({ value: r.value, label: r.label }))}
          placeholder="All time"
          disabled={false}
        />
      )}
      {anyActive && (
        <button type="button" className="text-xs text-muted hover:text-amber transition-colors" onClick={reset}>
          Clear
        </button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
