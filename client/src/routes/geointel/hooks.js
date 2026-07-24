// GeoIntel-local query helpers. The shared hooks in src/lib/api.js don't expose
// react-query options (enabled / placeholderData) or multi-district fan-out, so
// these wrap the exported apiGet on the same base — shared files stay untouched.
import { useQuery, useQueries } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';

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
