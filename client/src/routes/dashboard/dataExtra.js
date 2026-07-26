// Extra dashboard data hooks — endpoints the shared api.js does not expose yet.
// These call the SAME exported request helper (apiGet) and the same react-query
// client, so caching, the envelope contract, abort signals and the static-demo
// fallback all behave exactly as they do for the built-in hooks. Nothing here
// edits api.js; when a hook graduates into the shared layer these can simply
// re-export it.
//
// Endpoints wired here (all verified live against the Catalyst deployment):
//   /meta/socio             38 districts × population, urbanisation, literacy,
//                           density, per-capita income index
//   /insight/emerging       rising / falling sub-heads, 3-mo avg vs 9-mo
//                           baseline, 12-point spark, emerging flag at ≥15 %
//   /alerts/summary         status + severity rollup and top open districts
//   /trends/monthly         RAW rows — keeps heinousCount, which the shared
//                           normalizer folds away
//   /trends/seasonality     RAW payload — keeps the server's weekday ORDER
//   /geo/stations           per-district station rows for the drill explorer
//
// Every key is prefixed 'dash-'. react-query caches by KEY, not by queryFn, so
// two routes that register the same key with differently-shaped selectors race:
// whichever mounts first decides the shape everyone else receives. Several
// other routes already publish ['meta-socio'] — one of them resolving to
// {rows, byId} rather than a plain array — so an unprefixed key here would hand
// this module a shape it does not expect. The prefix costs one extra request
// per endpoint and buys shape safety that cannot be broken from outside.
import { useQuery, useQueries } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';

const asArray = (d) => {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.rows)) return d.rows;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
};

// District socio context changes about once a census — cache it hard.
const SOCIO_OPTS = { staleTime: 60 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000 };

/** /meta/socio → [{districtId, districtName, population, urbanPct,
 *  literacyPct, densityPerKm2, perCapitaIncomeIdx}] (38 rows). */
export function useSocio() {
  return useQuery({
    queryKey: ['dash-meta-socio'],
    queryFn: ({ signal }) => apiGet('/meta/socio', {}, { signal }).then((r) => asArray(r.data)),
    ...SOCIO_OPTS,
  });
}

/** /insight/emerging → {anchorYm, fromYm, districtId, rising[], falling[]}.
 *  Only districtId is honoured server-side; passing the whole filter bag would
 *  fragment the cache for no behavioural gain. */
export function useEmerging(params = {}) {
  const p = prune({ districtId: params.districtId });
  return useQuery({
    queryKey: ['dash-insight-emerging', p],
    queryFn: ({ signal }) => apiGet('/insight/emerging', p, { signal }).then((r) => ({
      anchorYm: r.data?.anchorYm || '',
      fromYm: r.data?.fromYm || '',
      rising: asArray(r.data?.rising),
      falling: asArray(r.data?.falling),
    })),
  });
}

/** /alerts/summary → {total, byStatus, bySeverity, topDistricts[], latestCreatedAt}. */
export function useAlertSummary() {
  return useQuery({
    queryKey: ['dash-alerts-summary'],
    queryFn: ({ signal }) => apiGet('/alerts/summary', {}, { signal }).then((r) => ({
      total: Number(r.data?.total) || 0,
      byStatus: r.data?.byStatus || {},
      bySeverity: r.data?.bySeverity || {},
      topDistricts: asArray(r.data?.topDistricts),
      latestCreatedAt: r.data?.latestCreatedAt || null,
    })),
  });
}

/**
 * /trends/monthly kept RAW: [{ym, caseCount, heinousCount}]. The shared
 * normalizer collapses these rows into a single unnamed series and drops
 * heinousCount entirely, which is exactly the column the heat calendar and the
 * heinous-share tile need.
 */
export function useMonthlyRaw(params = {}) {
  const p = prune(params);
  return useQuery({
    queryKey: ['dash-trends-monthly-raw', p],
    queryFn: ({ signal }) => apiGet('/trends/monthly', p, { signal }).then((r) => asArray(r.data)),
  });
}

/**
 * /trends/seasonality kept RAW: {weekdays, hours, matrix, maxCount, sampleSize}.
 * The server orders matrix rows by JavaScript getDay() — Sunday first. The
 * shared normalizer only looks for a `days` key, misses `weekdays`, and
 * relabels the rows Mon-first, so every weekday reads one row off. Reading the
 * raw payload keeps the shift breakdown's weekday labels honest.
 */
export function useSeasonalityRaw(params = {}) {
  const p = prune(params);
  return useQuery({
    queryKey: ['dash-trends-seasonality-raw', p],
    queryFn: ({ signal }) => apiGet('/trends/seasonality', p, { signal }).then((r) => ({
      weekdays: asArray(r.data?.weekdays),
      hours: asArray(r.data?.hours),
      matrix: asArray(r.data?.matrix),
      maxCount: Number(r.data?.maxCount) || 0,
      sampleSize: Number(r.data?.sampleSize) || 0,
    })),
  });
}

/**
 * Parallel /trends/monthly fetches, one per district — the multi-district
 * compare board. Each district is its own cache entry, so adding a fourth
 * district only fetches the fourth. `enabled` guards the empty-selection case.
 * → [{districtId, isLoading, error, rows}]
 */
export function useDistrictMonthlySeries(districtIds = [], baseParams = {}) {
  const base = prune({ crimeHeadId: baseParams.crimeHeadId, from: baseParams.from, to: baseParams.to });
  const ids = (districtIds || []).filter(Boolean).map(String);
  const results = useQueries({
    queries: ids.map((districtId) => {
      const p = { ...base, districtId };
      return {
        queryKey: ['dash-trends-monthly-raw', prune(p)],
        queryFn: ({ signal }) => apiGet('/trends/monthly', p, { signal }).then((r) => asArray(r.data)),
      };
    }),
  });
  return ids.map((districtId, i) => ({
    districtId,
    isLoading: !!results[i]?.isLoading,
    error: results[i]?.error || null,
    rows: results[i]?.data || [],
  }));
}

/**
 * /geo/stations scoped to one district → [{unitId, unitName, districtId, lat,
 * lng, caseCount, riskScore}]. 282 stations statewide, ~14 per district, so a
 * single 200-row page is always enough for a district scope. `enabled` keeps
 * the request from firing until a district is actually picked.
 */
export function useDistrictStations(districtId) {
  const p = prune({ districtId, perPage: 200 });
  return useQuery({
    queryKey: ['dash-geo-stations', p],
    queryFn: ({ signal }) => apiGet('/geo/stations', p, { signal }).then((r) => asArray(r.data)),
    enabled: !!districtId,
  });
}

/** Query-key roots this module owns — folded into the dashboard's refresh
 *  sweep so the new panels honour manual and auto refresh like the old ones. */
export const EXTRA_QUERY_KEYS = [
  'dash-insight-emerging', 'dash-alerts-summary', 'dash-trends-monthly-raw',
  'dash-trends-seasonality-raw', 'dash-geo-stations', 'dash-meta-socio',
];
