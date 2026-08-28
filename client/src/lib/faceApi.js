// Face identification hooks — one react-query hook per /identify/* endpoint
// (functions/dappa_api/lib/routes/faces.js). Everything is defensive: a
// partial answer renders an honest empty state, never a white screen.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, prune } from './api.js';

const arr = (v) => (Array.isArray(v) ? v : []);

export function useFaceRules() {
  return useQuery({
    queryKey: ['face-rules'],
    queryFn: ({ signal }) => apiGet('/identify/rules', {}, { signal }).then((r) => {
      const d = r.data || {};
      return { ...d, rules: arr(d.rules), legalBases: arr(d.legalBases), limits: d.limits || {}, filters: d.filters || {}, engines: d.engines || {}, meta: r.meta || {} };
    }),
    staleTime: 30 * 60 * 1000,
  });
}

export function useFaceModelCard() {
  return useQuery({
    queryKey: ['face-model-card'],
    queryFn: ({ signal }) => apiGet('/identify/model-card', {}, { signal }).then((r) => {
      const d = r.data || {};
      return { ...d, engines: arr(d.engines), statements: arr(d.statements), limitations: arr(d.limitations), calibration: d.calibration || {}, meta: r.meta || {} };
    }),
    staleTime: 30 * 60 * 1000,
  });
}

export function useFaceGallery(params = {}) {
  const p = { perPage: 24, page: 1, ...params };
  return useQuery({
    queryKey: ['face-gallery', prune(p)],
    queryFn: ({ signal }) => apiGet('/identify/gallery', p, { signal }).then((r) => ({
      items: arr(r.data && r.data.items),
      disclaimer: (r.data && r.data.disclaimer) || '',
      total: Number((r.meta || {}).total) || 0,
      page: Number((r.meta || {}).page) || p.page,
      perPage: Number((r.meta || {}).perPage) || p.perPage,
      meta: r.meta || {},
    })),
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useFaceAudit(params = {}) {
  return useQuery({
    queryKey: ['face-audit', prune(params)],
    queryFn: ({ signal }) => apiGet('/identify/audit', params, { signal }).then((r) => ({
      items: arr(r.data && r.data.items),
      probeStored: Boolean(r.data && r.data.probeStored),
      total: Number((r.meta || {}).total) || 0,
      meta: r.meta || {},
    })),
    staleTime: 30 * 1000,
  });
}

export function useFaceCost(limit) {
  return useQuery({
    queryKey: ['face-cost', limit],
    queryFn: ({ signal }) => apiGet('/identify/cost', { limit }, { signal }).then((r) => ({ ...(r.data || {}), meta: r.meta || {} })),
    staleTime: 10 * 60 * 1000,
  });
}

export function useFaceIdentify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiPost('/identify', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['face-audit'] }),
  });
}

export function useFaceDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ searchId, ...body }) => apiPost(`/identify/audit/${encodeURIComponent(searchId)}/decision`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['face-audit'] }),
  });
}
