// Similar-case + nearby-incident data for the FIR detail. useSimilarCases hits
// the real pattern engine (GET /cases/:id/similar — hour band, station/district
// and geo-proximity scoring with whyMatched reasons); if that endpoint is
// unreachable (older backend, static-demo miss) it degrades to a client-side
// same-pattern/same-district scan of GET /cases so the panel never goes dark.
// useNearbyIncidents pulls same-subhead points inside a ~5 km box around the
// incident for the mini-map overlay (GET /geo/incidents with a bbox).
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api.js';
import { splitCrimeNo } from './CrimeNoBreakdown.jsx';

const asRows = (d) => (Array.isArray(d) ? d : (d && Array.isArray(d.rows) ? d.rows : []));

export function useSimilarCases(caseData) {
  const d = caseData || {};
  const id = d.caseMasterId !== undefined && d.caseMasterId !== null ? String(d.caseMasterId) : '';
  return useQuery({
    queryKey: ['case-similar', id],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      try {
        const r = await apiGet(`/cases/${encodeURIComponent(id)}/similar`, {}, { signal });
        return { rows: asRows(r.data), engine: 'server', meta: r.meta || {} };
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        // Fallback: newest same-district cases, narrowed to the same subhead
        // (or head) by name — approximate, but honest about being so.
        const parts = splitCrimeNo(d.crimeNo);
        const districtId = parts ? parts[1].text : undefined;
        const r = await apiGet('/cases', { districtId, page: 1, perPage: 60 }, { signal });
        const sub = String(d.subHeadName || '');
        const head = String(d.headName || '');
        const rows = asRows(r.data)
          .filter((c) => String(c.caseMasterId) !== id)
          .filter((c) => (sub ? c.subHeadName === sub : (head ? c.headName === head : true)))
          .slice(0, 5)
          .map((c) => ({
            ...c,
            similarity: null,
            whyMatched: [sub ? 'same crime pattern' : 'same crime head', 'same district'],
          }));
        return { rows, engine: 'client', meta: {} };
      }
    },
  });
}

export function useNearbyIncidents({ caseId, lat, lng, crimeSubHeadId, enabled = true, radiusDeg = 0.045, limit = 120 }) {
  const la = Number(lat);
  const ln = Number(lng);
  const hasCoords = Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0);
  const bbox = hasCoords
    ? [ln - radiusDeg, la - radiusDeg, ln + radiusDeg, la + radiusDeg].map((n) => n.toFixed(5)).join(',')
    : '';
  return useQuery({
    queryKey: ['case-nearby', String(caseId ?? ''), bbox, String(crimeSubHeadId || '')],
    enabled: !!caseId && hasCoords && !!enabled,
    queryFn: ({ signal }) =>
      apiGet('/geo/incidents', { bbox, crimeSubHeadId: crimeSubHeadId || undefined, limit }, { signal })
        .then((r) => asRows(r.data)),
  });
}
