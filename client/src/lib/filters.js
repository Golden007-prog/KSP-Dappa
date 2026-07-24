// KSP DAPPA — shared URL-persisted filters (District / Crime Head / Date range).
// Filters live in the URL search params so views are shareable and survive
// reloads; Layout's left-nav links carry FILTER_KEYS across routes.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, subMonths, startOfYear } from 'date-fns';

/** Search-param keys that make up the shared filter state. */
export const FILTER_KEYS = ['districtId', 'crimeHeadId', 'range', 'from', 'to'];

export const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
];

const ISO = 'yyyy-MM-dd';

/** Preset → {from,to} (ISO dates) or {} for 'all'. Deterministic given `now`. */
export function rangeToDates(range, now = new Date()) {
  switch (range) {
    case '30d': return { from: format(subDays(now, 30), ISO), to: format(now, ISO) };
    case '90d': return { from: format(subDays(now, 90), ISO), to: format(now, ISO) };
    case '12m': return { from: format(subMonths(now, 12), ISO), to: format(now, ISO) };
    case 'ytd': return { from: format(startOfYear(now), ISO), to: format(now, ISO) };
    default: return {};
  }
}

/** Build the search string (e.g. '?districtId=0101&range=90d') that carries the
 * current filters — Layout uses this so filters follow you across routes. */
export function filterSearchString(searchParams) {
  const qs = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = searchParams.get(key);
    if (v) qs.set(key, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * useUrlFilters() → {
 *   districtId, crimeHeadId, range, from, to,   // current values ('' when unset)
 *   apiParams,                                   // {districtId?,crimeHeadId?,from?,to?} pruned — spread into hooks
 *   setFilter(key, value), setFilters(patch), reset()
 * }
 * Explicit from/to params win over the `range` preset. Setting `range` clears
 * explicit from/to; unknown keys are passed through untouched.
 */
export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const districtId = searchParams.get('districtId') || '';
  const crimeHeadId = searchParams.get('crimeHeadId') || '';
  const range = searchParams.get('range') || 'all';
  const explicitFrom = searchParams.get('from') || '';
  const explicitTo = searchParams.get('to') || '';

  const { from, to } = useMemo(() => {
    if (explicitFrom || explicitTo) return { from: explicitFrom, to: explicitTo };
    return { from: rangeToDates(range).from || '', to: rangeToDates(range).to || '' };
  }, [explicitFrom, explicitTo, range]);

  const setFilters = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '' || (key === 'range' && value === 'all')) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
        if (key === 'range') { next.delete('from'); next.delete('to'); }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setFilter = useCallback((key, value) => setFilters({ [key]: value }), [setFilters]);

  const reset = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of FILTER_KEYS) next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const apiParams = useMemo(() => {
    const p = {};
    if (districtId) p.districtId = districtId;
    if (crimeHeadId) p.crimeHeadId = crimeHeadId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [districtId, crimeHeadId, from, to]);

  return { districtId, crimeHeadId, range, from, to, apiParams, setFilter, setFilters, reset };
}
