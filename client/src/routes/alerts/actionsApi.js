// /alerts — react-query hooks for the action loop (functions/dappa_api/lib/
// routes/actionlog.js). Shapes are pinned by test/round2/phase7.test.mjs;
// everything here is defensive so a partial answer never white-screens a
// phone in a station.
//
//   useAlertActions(alertKey)    GET  /alerts/:key/actions   timeline + summary
//   useRecordAction()            POST /alerts/:key/actions   one decision
//   useOutcomes(params)          GET  /alerts/outcomes       what happened to past alerts
//   useRecentActions(params)     GET  /actions/recent        notification centre feed
//   useActionDigest(params)      GET  /alerts/digest         printable digest JSON
//   useServiceFlags()            GET  /meta/services         flags.push / flags.mail
//   useActorName()               localStorage display name for the record
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, prune } from '../../lib/api.js';
import { invalidateAlertCaches, setStatusInCaches } from './statusCache.js';

const arr = (v) => (Array.isArray(v) ? v : []);

export const ACTION_TYPES = ['acknowledge', 'assign', 'escalate', 'dismiss', 'note', 'outcome'];
export const OUTCOME_LABELS = ['true_positive', 'false_alarm', 'already_known', 'actioned', 'no_action_needed'];
export const DISMISS_REASONS = ['duplicate', 'known_cause', 'data_error', 'seasonal', 'other'];
export const NEXT_TIER = { beat: 'station', station: 'district', district: 'state', state: 'state' };

const ACTOR_KEY = 'dappa-actor-name';

/** Display name an anonymous officer signs the record with (per browser). */
export function useActorName() {
  const [name, setNameState] = useState(() => {
    try { return localStorage.getItem(ACTOR_KEY) || ''; } catch { return ''; }
  });
  const setName = useCallback((v) => {
    const next = String(v || '').slice(0, 128);
    setNameState(next);
    try { localStorage.setItem(ACTOR_KEY, next); } catch { /* private mode */ }
  }, []);
  return [name, setName];
}

export function useAlertActions(alertKey, { enabled = true } = {}) {
  const key = String(alertKey || '');
  return useQuery({
    queryKey: ['alert-actions', key],
    enabled: enabled && !!key,
    queryFn: ({ signal }) => apiGet(`/alerts/${encodeURIComponent(key)}/actions`, {}, { signal }).then((r) => {
      const d = r.data || {};
      return { alertKey: key, timeline: arr(d.timeline), summary: { count: 0, ...(d.summary || {}) }, meta: r.meta || {} };
    }),
    staleTime: 30 * 1000,
  });
}

/**
 * One decision. `variables` = { alertKey, body, statusPatch? } — when the server
 * reports statusUpdated the alert caches are patched so the card moves.
 */
export function useRecordAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertKey, body }) => apiPost(`/alerts/${encodeURIComponent(alertKey)}/actions`, body),
    onSuccess: (res, { alertKey, body }) => {
      const d = res?.data || {};
      if (d.statusUpdated && (body.actionType === 'acknowledge' || body.actionType === 'dismiss')) {
        setStatusInCaches(qc, alertKey, body.actionType === 'acknowledge' ? 'ACK' : 'DISMISSED');
        invalidateAlertCaches(qc);
      }
      qc.invalidateQueries({ queryKey: ['alert-actions', String(alertKey)] });
      qc.invalidateQueries({ queryKey: ['alert-outcomes'] });
      qc.invalidateQueries({ queryKey: ['actions-recent'] });
      qc.invalidateQueries({ queryKey: ['alert-digest'] });
    },
  });
}

export function useOutcomes(params = {}) {
  return useQuery({
    queryKey: ['alert-outcomes', prune(params)],
    queryFn: ({ signal }) => apiGet('/alerts/outcomes', params, { signal }).then((r) => {
      const d = r.data || {};
      return {
        ...d,
        overall: d.overall || {},
        bySeverity: arr(d.bySeverity),
        byHead: arr(d.byHead),
        untouched: arr(d.untouched),
        timeToAck: { buckets: {}, bucketOrder: [], n: 0, medianHours: null, ...(d.timeToAck || {}) },
        dismissReasons: d.dismissReasons || {},
        labels: d.labels || {},
        meta: r.meta || {},
      };
    }),
    staleTime: 60 * 1000,
  });
}

export function useRecentActions(params = {}, { refetchInterval = 0, enabled = true } = {}) {
  return useQuery({
    queryKey: ['actions-recent', prune(params)],
    enabled,
    queryFn: ({ signal }) => apiGet('/actions/recent', params, { signal }).then((r) => ({ rows: arr(r.data), meta: r.meta || {} })),
    staleTime: 30 * 1000,
    refetchInterval: refetchInterval || false,
  });
}

export function useActionDigest(params = {}) {
  return useQuery({
    queryKey: ['alert-digest', prune(params)],
    queryFn: ({ signal }) => apiGet('/alerts/digest', params, { signal }).then((r) => {
      const d = r.data || {};
      return {
        ...d,
        alerts: arr(d.alerts),
        topRisk: arr(d.topRisk),
        untouched: arr(d.untouched),
        actions: { total: 0, decisions: 0, byType: {}, recent: [], ...(d.actions || {}) },
        outcomes: d.outcomes || {},
        labels: d.labels || {},
        meta: r.meta || {},
      };
    }),
    staleTime: 60 * 1000,
  });
}

export function useServiceFlags() {
  return useQuery({
    queryKey: ['meta-services'],
    queryFn: ({ signal }) => apiGet('/meta/services', {}, { signal }).then((r) => (r.data && r.data.flags) || {}),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });
}

/** Signed-in identity (shares the ['auth-me'] cache with lib/tierApi.js). */
export function useAuthMe() {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: ({ signal }) => apiGet('/auth/me', {}, { signal }).then((r) => r.data || {}),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
}
