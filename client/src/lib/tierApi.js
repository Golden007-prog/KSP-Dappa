// Officer-tier data hooks — one react-query hook per /tiers/* endpoint plus
// the /auth/me read that maps a signed-in Catalyst role to a tier
// (lib/tier.js applyRole). Shapes are pinned by functions/dappa_api/lib/
// routes/tiers.js and the contract suite; everything here is defensive so a
// partial answer never white-screens a phone in a station.
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, prune } from './api.js';
import { useTierStore } from './tier.js';

const arr = (v) => (Array.isArray(v) ? v : []);

export function useBeatHome(params = {}) {
  return useQuery({
    queryKey: ['tiers-beat', prune(params)],
    queryFn: ({ signal }) => apiGet('/tiers/beat', params, { signal }).then((r) => {
      const d = r.data || {};
      return {
        ...d,
        recent: { count: 0, byHead: [], cases: [], ...(d.recent || {}) },
        hotspots: arr(d.hotspots),
        alerts: arr(d.alerts),
        openCases: { total: 0, rows: [], ...(d.openCases || {}) },
        meta: r.meta || {},
      };
    }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStationHome(params = {}) {
  return useQuery({
    queryKey: ['tiers-station', prune(params)],
    queryFn: ({ signal }) => apiGet('/tiers/station', params, { signal }).then((r) => {
      const d = r.data || {};
      return {
        ...d,
        week: { total: 0, ...(d.week || {}) },
        weekByHead: arr(d.weekByHead),
        alerts: arr(d.alerts),
        series: arr(d.series),
        spark8w: { weeks: [], unit: [], districtMedian: [], ...(d.spark8w || {}) },
        undetected30: { count: 0, rows: [], ...(d.undetected30 || {}) },
        caseload: arr(d.caseload),
        meta: r.meta || {},
      };
    }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStateHome() {
  return useQuery({
    queryKey: ['tiers-state'],
    queryFn: ({ signal }) => apiGet('/tiers/state', {}, { signal }).then((r) => {
      const d = r.data || {};
      return {
        ...d,
        heads: arr(d.heads),
        units: arr(d.units),
        matrix: { heads: [], rows: [], ...(d.matrix || {}) },
        rareHeads: arr(d.rareHeads),
        meta: r.meta || {},
      };
    }),
    staleTime: 10 * 60 * 1000,
  });
}

/** GET /auth/me once per session; a Catalyst-role identity sets the default
 * tier through applyRole (a stored switcher choice still wins). */
export function useAuthTier() {
  const applyRole = useTierStore((s) => s.applyRole);
  const q = useQuery({
    queryKey: ['auth-me'],
    queryFn: ({ signal }) => apiGet('/auth/me', {}, { signal }).then((r) => r.data || {}),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
  useEffect(() => {
    const me = q.data;
    if (!me || !me.authenticated) return;
    const role = me.user?.roleName || me.role;
    if (role) applyRole(role);
  }, [q.data, applyRole]);
  return q;
}
