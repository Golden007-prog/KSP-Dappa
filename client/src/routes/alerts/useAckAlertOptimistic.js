// /alerts — acknowledge mutation with optimistic UI. The card flips to the
// acknowledged section instantly; on failure every cached alerts query is
// rolled back and the user gets a toast — a friendly read-only explainer for
// the public-demo 403 (AUTH_REQUIRED), a plain error otherwise. Lives here
// (not lib/api.js) because the optimistic + toast behavior is route policy.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api.js';
import { useToast } from '../../components/ToastProvider.jsx';

export default function useAckAlertOptimistic() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (alertId) => apiPost(`/alerts/${encodeURIComponent(alertId)}/ack`, {}),
    onMutate: async (alertId) => {
      await qc.cancelQueries({ queryKey: ['alerts'] });
      const snapshots = qc.getQueriesData({ queryKey: ['alerts'] });
      qc.setQueriesData({ queryKey: ['alerts'] }, (rows) => (
        Array.isArray(rows)
          ? rows.map((a) => (String(a.alertId) === String(alertId) ? { ...a, status: 'ACK' } : a))
          : rows
      ));
      return { snapshots };
    },
    onError: (err, _alertId, ctx) => {
      for (const [key, data] of ctx?.snapshots || []) qc.setQueryData(key, data);
      if (err?.status === 403 || err?.code === 'AUTH_REQUIRED') {
        toast.info('Public demo is read-only — acknowledging alerts needs an officer sign-in (Catalyst Authentication). The alert stays open.');
      } else {
        toast.error(`Couldn't acknowledge the alert: ${err?.message || 'request failed.'}`);
      }
    },
    onSuccess: () => toast.success('Alert acknowledged'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
    },
  });
}
