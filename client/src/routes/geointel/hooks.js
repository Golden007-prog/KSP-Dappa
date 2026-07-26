// GeoIntel-local query helpers. The shared hooks in src/lib/api.js don't expose
// react-query options (enabled / placeholderData) or multi-district fan-out, so
// these wrap the exported apiGet on the same base — shared files stay untouched.
import { useQuery, useQueries } from '@tanstack/react-query';
import { apiGet, prune, normalizeMonthlyTrends, normalizeSeasonality } from '../../lib/api.js';

const rows = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);

/**
 * /geo/incidents for the heat layer. `enabled` avoids fetching while the layer
 * is toggled off; placeholderData keeps the previous month's blobs on screen
 * while the next month loads, so the time-scrubber animation never flashes empty.
 */
export function useIncidentsLayer(params = {}, enabled = true) {
  const p = { limit: 2000, ...params };
  return useQuery({
    queryKey: ['geo-incidents', prune(p)],
    queryFn: ({ signal }) => apiGet('/geo/incidents', p, { signal }).then((r) => rows(r.data)),
    enabled: !!enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * /geo/stations for 1..n police-unit codes — a census polygon can host up to
 * three units (e.g. Mysuru City + Mysuru District), and the endpoint filters by
 * a single districtId, so the drill panel issues one query per unit.
 */
export function useStationsForUnits(unitIds = [], extraParams = {}) {
  const results = useQueries({
    queries: unitIds.map((districtId) => {
      const p = { perPage: 200, ...extraParams, districtId };
      return {
        queryKey: ['geo-stations', prune(p)],
        queryFn: ({ signal }) => apiGet('/geo/stations', p, { signal }).then((r) => rows(r.data)),
      };
    }),
  });
  return {
    rows: results.flatMap((r) => r.data || []),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error || null,
    refetch: () => results.forEach((r) => r.refetch()),
  };
}

/**
 * Merged monthly totals for 1..n police units (district drill sparkline).
 * Sums every series of /trends/monthly per unit, then across units, keyed by
 * ym. Returns { months: [{ym,total}], isLoading, error }.
 */
export function useTrendsForUnits(unitIds = [], extraParams = {}) {
  const results = useQueries({
    queries: unitIds.map((districtId) => {
      const p = { ...extraParams, districtId };
      return {
        queryKey: ['geo-trends-unit', prune(p)],
        queryFn: ({ signal }) => apiGet('/trends/monthly', p, { signal })
          .then((r) => normalizeMonthlyTrends(r.data)),
        staleTime: 5 * 60 * 1000,
      };
    }),
  });
  // Cheap merge (≤3 units × ≤36 months) — recompute inline, no memo gymnastics.
  const byYm = new Map();
  for (const r of results) {
    const d = r.data;
    if (!d) continue;
    d.months.forEach((ym, i) => {
      const total = d.series.reduce((acc, s) => acc + (Number(s.data[i]) || 0), 0);
      byYm.set(ym, (byYm.get(ym) || 0) + total);
    });
  }
  const months = [...byYm.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ym, total]) => ({ ym, total }));
  return {
    months,
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error || null,
  };
}

/**
 * Socio-economic reference rows (/meta/socio — 38 districts: population,
 * urbanisation, density, literacy, income index). Rarely changes, so it is
 * cached hard; the map uses it for the density / urbanisation choropleth
 * metrics and the bivariate crime-vs-urbanisation classing.
 */
export function useSocioMeta() {
  return useQuery({
    queryKey: ['geo-socio'],
    queryFn: ({ signal }) => apiGet('/meta/socio', {}, { signal }).then((r) => rows(r.data)),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Raw /trends/seasonality for the active filter, keeping the server's own
 * weekday ordering. The shared normalizer reads `data.days`, but the endpoint
 * sends `data.weekdays` (Sun-first, matching Date#getDay), so it silently
 * relabels the matrix Mon-first — this hook reads `weekdays` directly so the
 * weekday × hour explorer lines up with the real day of week.
 * Returns { weekdays, hours, matrix, max, total, sampleSize }.
 */
export function useSeasonalityGrid(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['geo-seasonality-grid', prune(params)],
    queryFn: ({ signal }) => apiGet('/trends/seasonality', params, { signal }).then((r) => {
      const d = r.data || {};
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const weekdays = Array.isArray(d.weekdays) && d.weekdays.length === 7
        ? d.weekdays.map(String)
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const src = Array.isArray(d.matrix) ? d.matrix : [];
      const matrix = weekdays.map((_, di) => hours.map((h) => Number(src?.[di]?.[h]) || 0));
      const flat = matrix.flat();
      return {
        weekdays,
        hours,
        matrix,
        max: Math.max(0, ...flat),
        total: flat.reduce((a, v) => a + v, 0),
        sampleSize: Number(d.sampleSize) || 0,
      };
    }),
    enabled: !!enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Merged day×hour seasonality matrix for 1..n police units (district drill
 * heat-strip). Returns { days, hours, matrix, max, isLoading, error }.
 */
export function useSeasonalityForUnits(unitIds = [], extraParams = {}) {
  const results = useQueries({
    queries: unitIds.map((districtId) => {
      const p = { ...extraParams, districtId };
      return {
        queryKey: ['geo-seasonality-unit', prune(p)],
        queryFn: ({ signal }) => apiGet('/trends/seasonality', p, { signal })
          .then((r) => normalizeSeasonality(r.data)),
        staleTime: 5 * 60 * 1000,
      };
    }),
  });
  const datas = results.map((r) => r.data);
  const base = datas.find(Boolean);
  const merged = base ? (() => {
    const matrix = base.days.map((_, d) => base.hours.map((__, h) => (
      datas.reduce((acc, m) => acc + (Number(m?.matrix?.[d]?.[h]) || 0), 0)
    )));
    return { days: base.days, hours: base.hours, matrix, max: Math.max(0, ...matrix.flat()) };
  })() : null;
  return {
    ...(merged || { days: [], hours: [], matrix: [], max: 0 }),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error || null,
  };
}
