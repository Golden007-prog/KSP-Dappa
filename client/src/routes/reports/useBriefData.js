// Shared data hook for the Weekly Intelligence Brief — used by both /reports
// (preview) and /print/brief (SmartBrowz PDF target) so the two never drift.
// Supports the preset windows plus a custom {from,to} range, and fetches the
// preceding window's KPIs so the brief can show deltas vs the prior period.
import { useMemo } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  useKpis, useAlerts, useHotspots, useNetworkGraph, useForecast, useStationRisk,
} from '../../lib/api.js';
import { useSocioCorrelation, useEmerging } from '../alerts/useAlertIntel.js';
import { dateLabel } from '../../lib/format.js';
import { translate, useT } from '../../lib/i18n.jsx';

const en = (key, vars) => translate('en', key, vars);

export const WINDOWS = [
  { value: 'last-7-days', label: 'Last 7 days', days: 7, key: 'last7' },
  { value: 'last-30-days', label: 'Last 30 days', days: 30, key: 'last30' },
];

/** Localised label for a preset window value (falls back to the English one). */
export const windowLabel = (value, t = en) => {
  const w = WINDOWS.find((x) => x.value === value);
  return w ? t(`alerts.reports.win.${w.key}`) : value;
};

export const DEFAULT_WINDOW = WINDOWS[0].value;
export const CUSTOM_WINDOW = 'custom';

const ISO = 'yyyy-MM-dd';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when {from,to} is a usable custom range (ISO dates, from ≤ to). */
export function isValidCustomRange(custom) {
  return !!custom
    && ISO_RE.test(String(custom.from || ''))
    && ISO_RE.test(String(custom.to || ''))
    && custom.from <= custom.to;
}

export function windowInfo(windowKey, now = new Date(), custom, t = en) {
  if (windowKey === CUSTOM_WINDOW && isValidCustomRange(custom)) {
    const days = Math.max(
      1,
      Math.round((parseISO(custom.to) - parseISO(custom.from)) / 86400000) + 1,
    );
    return {
      value: CUSTOM_WINDOW,
      label: t('alerts.reports.win.custom', { from: dateLabel(custom.from), to: dateLabel(custom.to) }),
      days,
      from: custom.from,
      to: custom.to,
    };
  }
  const w = WINDOWS.find((x) => x.value === windowKey) || WINDOWS[0];
  return {
    ...w,
    label: t(`alerts.reports.win.${w.key}`),
    from: format(subDays(now, w.days), ISO),
    to: format(now, ISO),
  };
}

export function useBriefData(windowKey, custom) {
  const t = useT();
  const customFrom = custom?.from;
  const customTo = custom?.to;
  const win = useMemo(
    () => windowInfo(windowKey, new Date(), { from: customFrom, to: customTo }, t),
    [windowKey, customFrom, customTo, t],
  );
  const range = { from: win.from, to: win.to };

  // The window immediately before this one, same length — for KPI deltas.
  const prevWin = useMemo(() => ({
    from: format(subDays(parseISO(win.from), win.days), ISO),
    to: format(subDays(parseISO(win.from), 1), ISO),
    days: win.days,
  }), [win.from, win.days]);

  const kpis = useKpis(range);
  const prevKpis = useKpis({ from: prevWin.from, to: prevWin.to });
  const alerts = useAlerts(range);
  const hotspots = useHotspots(range);
  const network = useNetworkGraph();
  const forecast = useForecast();
  const risk = useStationRisk();
  // Explanatory layers: socio-economic correlation answers "why here", the
  // emerging roll-up answers "what is building". Both are optional sections, so
  // a failure in either must not gate `ready` — hence they stay out of the
  // settle list below and render their own unavailable note.
  const socio = useSocioCorrelation();
  const emerging = useEmerging();

  const queries = [kpis, alerts, hotspots, network, forecast, risk];
  // "settled" not "succeeded": an errored section renders its own note and must
  // not block autoprint on /print/brief.
  const ready = queries.every((q) => !q.isLoading) && !prevKpis.isLoading;
  // Every brief query failed (API down) — /print/brief uses this to hold
  // autoprint instead of printing a page of "Section unavailable" notes.
  const allError = queries.every((q) => !!q.error);
  const refetchAll = () => { [...queries, prevKpis, socio, emerging].forEach((q) => q.refetch()); };

  return {
    win, prevWin, kpis, prevKpis, alerts, hotspots, network, forecast, risk,
    socio, emerging, ready, allError, refetchAll,
  };
}
