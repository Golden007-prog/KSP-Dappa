// /alerts — acknowledge mutation with optimistic UI. The card flips to the
// acknowledged section instantly; on failure every cached alerts query is
// rolled back and the user gets a toast — a friendly read-only explainer for
// the public-demo 403 (AUTH_REQUIRED), a plain error otherwise. In the static
// demo (meta.demoStatic) the write is simulated: we keep the optimistic ACK in
// the cache instead of refetching the snapshot (which would silently flip the
// card back to open) and tell the user it won't persist. Lives here (not
// lib/api.js) because the optimistic + toast behavior is route policy.
//
// Cache patching moved to statusCache.js so the corpus loader's object-shaped
// cache stays in step with the legacy array-shaped one.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api.js';
import { useToast } from '../../components/ToastProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import {
  setStatusInCaches, restoreAlertCaches, invalidateAlertCaches,
} from './statusCache.js';

const isDemoStatic = (res) => !!(res?.meta?.demoStatic || res?.data?.demoStatic);

export default function useAckAlertOptimistic() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: (alertId) => apiPost(`/alerts/${encodeURIComponent(alertId)}/ack`, {}),
    onMutate: async (alertId) => {
      await qc.cancelQueries({ queryKey: ['alerts'] });
      await qc.cancelQueries({ queryKey: ['alerts-corpus'] });
      return { snapshots: setStatusInCaches(qc, alertId, 'ACK') };
    },
    onError: (err, _alertId, ctx) => {
      restoreAlertCaches(qc, ctx?.snapshots);
      if (err?.status === 403 || err?.code === 'AUTH_REQUIRED') {
        toast.info(t('alerts.toast.ackReadOnly'));
      } else {
        toast.error(t('alerts.toast.ackFailed', { msg: err?.message || t('alerts.toast.ackFailedDefault') }));
      }
    },
    onSuccess: (res) => {
      if (isDemoStatic(res)) {
        toast.info(t('alerts.toast.ackDemoStatic'));
      } else {
        toast.success(t('alerts.toast.acked'));
      }
    },
    onSettled: (res) => {
      // Demo-static: skip the alerts refetch — the snapshot still lists the
      // alert as OPEN and would silently undo the acknowledged state.
      if (isDemoStatic(res)) {
        qc.invalidateQueries({ queryKey: ['kpis'] });
        return;
      }
      invalidateAlertCaches(qc);
    },
  });
}
