// Analytical-depth hooks — one react-query hook per /depth/* endpoint
// (functions/dappa_api/lib/routes/depth.js). Every answer is deterministic and
// computed inside the function (meta.source 'local'), cached server-side for
// 10–15 minutes, so staleTime mirrors that and a panel never refetches while a
// judge scrolls. Shapes are pinned by test/round2/phase8-depth.test.mjs.
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from './api.js';

const TEN_MIN = 10 * 60 * 1000;

function depthQuery(path, params, options = {}) {
  const p = prune(params || {});
  return useQuery({
    queryKey: ['depth', path, p],
    queryFn: ({ signal }) => apiGet(path, p, { signal }).then((r) => ({ ...(r.data || {}), meta: r.meta || {} })),
    staleTime: TEN_MIN,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useDepthEscalation(params = {}, options) { return depthQuery('/depth/escalation', params, options); }
export function useDepthMoTransitions(params = {}, options) { return depthQuery('/depth/mo-transitions', params, options); }
export function useDepthRecidivism(params = {}, options) { return depthQuery('/depth/recidivism', params, options); }
export function useDepthReactivation(params = {}, options) { return depthQuery('/depth/reactivation', params, options); }
export function useDepthCorridors(params = {}, options) { return depthQuery('/depth/corridors', params, options); }
export function useDepthNearRepeat(params = {}, options) { return depthQuery('/depth/near-repeat', params, options); }
export function useDepthTrajectory(params = {}, options) { return depthQuery('/depth/hotspot-trajectory', params, options); }
export function useDepthForecastAudit(options) { return depthQuery('/depth/forecast-audit', {}, options); }
export function useDepthFestival(params = {}, options) { return depthQuery('/depth/festival-uplift', params, options); }
export function useDepthLeadLag(params = {}, options) { return depthQuery('/depth/lead-lag', params, options); }
export function useDepthBenchmarks(options) { return depthQuery('/depth/benchmarks', {}, options); }
export function useDepthIdentity(personKey, options) {
  return depthQuery(`/depth/identity/${encodeURIComponent(personKey || '')}`, {}, { enabled: Boolean(personKey), ...(options || {}) });
}
