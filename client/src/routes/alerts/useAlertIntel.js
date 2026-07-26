// /alerts + /reports — the "why behind the where" queries.
//
// None of these have a hook in lib/api.js (which route fillers must not edit),
// so they follow the pattern Reports.jsx already uses for /notify/test-digest:
// a route-local react-query hook over the shared apiGet. All four are read-only
// GETs backed by pre-aggregated Catalyst tables, and all four are cached hard —
// socio indicators and the emerging roll-up change once a night at most.
//
// Verified live shapes (development Catalyst deployment):
//   GET /alerts/:id          → …row…, createdAt, series[{ym,caseCount}], baselineMedian
//   GET /meta/socio          → [{districtId,districtName,population,urbanPct,
//                                literacyPct,densityPerKm2,perCapitaIncomeIdx}]
//   GET /insight/emerging    → {anchorYm,fromYm,rising[],falling[]} with
//                              {subHeadId,subHeadName,headId,headName,recentAvg,
//                               baselineAvg,growthPct,emerging,spark[]}
//   GET /insight/socio-correlation → {points[],indicators[{key,label,r,n,
//                                     strength,direction,note}]}
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from '../../lib/api.js';

const asArray = (d) => (Array.isArray(d) ? d : (d && Array.isArray(d.rows) ? d.rows : []));

/** One alert with its real 12-month AggMonthly series and robust baseline. */
export function useAlertDetail(alertId) {
  const id = alertId ? String(alertId) : '';
  return useQuery({
    queryKey: ['alert-detail', id],
    queryFn: ({ signal }) => apiGet(`/alerts/${encodeURIComponent(id)}`, {}, { signal }).then((r) => r.data || {}),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

/**
 * District socio-economic indicators, keyed for O(1) lookup.
 * District ids arrive unpadded from /meta/socio ('101') but padded on alert
 * rows ('0101'), so both spellings index the same entry.
 */
export function useSocioIndicators() {
  return useQuery({
    queryKey: ['meta-socio'],
    queryFn: ({ signal }) => apiGet('/meta/socio', {}, { signal }).then((r) => {
      const rows = asArray(r.data);
      const byId = new Map();
      for (const s of rows) {
        const raw = String(s.districtId ?? '');
        if (!raw) continue;
        byId.set(raw, s);
        byId.set(raw.replace(/^0+(?=\d)/, ''), s);
        byId.set(raw.padStart(4, '0'), s);
      }
      return { rows, byId };
    }),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 0,
  });
}

/** Rising / receding crime sub-heads vs their own 12-month baseline. */
export function useEmerging(params = {}) {
  const p = prune(params);
  return useQuery({
    queryKey: ['insight-emerging', p],
    queryFn: ({ signal }) => apiGet('/insight/emerging', p, { signal }).then((r) => {
      const d = r.data || {};
      return {
        anchorYm: d.anchorYm || '',
        fromYm: d.fromYm || '',
        rising: asArray(d.rising),
        falling: asArray(d.falling),
      };
    }),
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });
}

/** Pearson r between each socio-economic indicator and district crime rate. */
export function useSocioCorrelation(params = {}) {
  const p = prune(params);
  return useQuery({
    queryKey: ['insight-socio-correlation', p],
    queryFn: ({ signal }) => apiGet('/insight/socio-correlation', p, { signal }).then((r) => {
      const d = r.data || {};
      return {
        fromYm: d.fromYm || '',
        toYm: d.toYm || '',
        points: asArray(d.points),
        indicators: asArray(d.indicators),
      };
    }),
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });
}
