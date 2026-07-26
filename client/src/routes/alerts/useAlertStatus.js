// /alerts — the rest of the triage lifecycle beyond a single acknowledge.
//
// POST /alerts/:id/status accepts OPEN / ACK / DISMISSED, so a supervisor can
// close out a false positive without pretending it was actioned, and can
// re-open something that was closed too fast. Bulk mode runs the same endpoint
// over a selection sequentially (the API takes one id per call) and reports
// how many landed, so a partial failure is stated rather than swallowed.
import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api.js';
import { useToast } from '../../components/ToastProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt } from '../../lib/format.js';
import {
  setStatusInCaches, setStatusManyInCaches, restoreAlertCaches, invalidateAlertCaches,
} from './statusCache.js';

/** Statuses the endpoint accepts (functions/…/routes/insight.js ALERT_STATUSES). */
export const WRITABLE_STATUSES = ['OPEN', 'ACK', 'DISMISSED'];

const isDemoStatic = (res) => !!(res?.meta?.demoStatic || res?.data?.demoStatic);
const readOnly = (err) => err?.status === 403 || err?.code === 'AUTH_REQUIRED';

/** Single-alert status write with optimistic cache patching and rollback. */
export function useSetAlertStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: ({ alertId, status }) =>
      apiPost(`/alerts/${encodeURIComponent(alertId)}/status`, { status }),
    onMutate: async ({ alertId, status }) => {
      await qc.cancelQueries({ queryKey: ['alerts'] });
      await qc.cancelQueries({ queryKey: ['alerts-corpus'] });
      return { snapshots: setStatusInCaches(qc, alertId, status) };
    },
    onError: (err, _vars, ctx) => {
      restoreAlertCaches(qc, ctx?.snapshots);
      if (readOnly(err)) toast.info(t('alerts.toast.ackReadOnly'));
      else toast.error(t('alerts.toast.statusFailed', { msg: err?.message || t('alerts.toast.ackFailedDefault') }));
    },
    onSuccess: (res, { status }) => {
      if (isDemoStatic(res)) toast.info(t('alerts.toast.ackDemoStatic'));
      else if (status === 'DISMISSED') toast.success(t('alerts.toast.dismissed'));
      else if (status === 'OPEN') toast.success(t('alerts.toast.reopened'));
      else toast.success(t('alerts.toast.acked'));
    },
    onSettled: (res) => {
      if (isDemoStatic(res)) {
        qc.invalidateQueries({ queryKey: ['kpis'] });
        return;
      }
      invalidateAlertCaches(qc);
    },
  });
}

/**
 * Bulk status write over a selection.
 * Returns { run, progress } where progress is
 * {active, done, total, ok, failed, status} — enough for a live "12 / 40" bar.
 */
export function useBulkAlertStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const [progress, setProgress] = useState({ active: false, done: 0, total: 0, ok: 0, failed: 0, status: '' });

  const run = useCallback(async (alertIds, status) => {
    const ids = [...new Set((alertIds || []).map(String))].filter(Boolean);
    if (!ids.length || !WRITABLE_STATUSES.includes(status)) return { ok: 0, failed: 0 };
    await qc.cancelQueries({ queryKey: ['alerts'] });
    await qc.cancelQueries({ queryKey: ['alerts-corpus'] });
    const snapshots = setStatusManyInCaches(qc, ids, status);
    setProgress({ active: true, done: 0, total: ids.length, ok: 0, failed: 0, status });

    let ok = 0;
    let failed = 0;
    let gated = false;
    let demo = false;
    for (const id of ids) {
      try {
        // Sequential on purpose: the write endpoint is one id per call and a
        // 665-row corpus could otherwise open hundreds of parallel sockets.
        // eslint-disable-next-line no-await-in-loop
        const res = await apiPost(`/alerts/${encodeURIComponent(id)}/status`, { status });
        if (isDemoStatic(res)) demo = true;
        ok += 1;
      } catch (err) {
        failed += 1;
        if (readOnly(err)) { gated = true; break; }
      }
      setProgress((p) => ({ ...p, done: p.done + 1, ok, failed }));
    }

    setProgress({ active: false, done: ids.length, total: ids.length, ok, failed, status });
    if (gated) {
      restoreAlertCaches(qc, snapshots);
      toast.info(t('alerts.toast.ackReadOnly'));
    } else if (failed && ok) {
      toast.info(t('alerts.toast.bulkPartial', { ok: fmtInt(ok), failed: fmtInt(failed) }));
    } else if (failed) {
      restoreAlertCaches(qc, snapshots);
      toast.error(t('alerts.toast.bulkFailed', { n: fmtInt(failed) }));
    } else if (demo) {
      toast.info(t('alerts.toast.ackDemoStatic'));
    } else {
      toast.success(t('alerts.toast.bulkDone', { n: fmtInt(ok), status: t(`alerts.status.${status.toLowerCase()}`) }));
    }
    if (!demo && !gated) invalidateAlertCaches(qc);
    else qc.invalidateQueries({ queryKey: ['kpis'] });
    return { ok, failed };
  }, [qc, toast, t]);

  return { run, progress };
}
