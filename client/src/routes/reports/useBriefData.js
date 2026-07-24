// Shared data hook for the Weekly Intelligence Brief — used by both /reports
// (preview) and /print/brief (SmartBrowz PDF target) so the two never drift.
import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  useKpis, useAlerts, useHotspots, useNetworkGraph, useForecast, useStationRisk,
} from '../../lib/api.js';

export const WINDOWS = [
  { value: 'last-7-days', label: 'Last 7 days', days: 7 },
  { value: 'last-30-days', label: 'Last 30 days', days: 30 },
];

export const DEFAULT_WINDOW = WINDOWS[0].value;

export function windowInfo(windowKey, now = new Date()) {
  const w = WINDOWS.find((x) => x.value === windowKey) || WINDOWS[0];
  return {
    ...w,
    from: format(subDays(now, w.days), 'yyyy-MM-dd'),
    to: format(now, 'yyyy-MM-dd'),
  };
}

export function useBriefData(windowKey) {
  const win = useMemo(() => windowInfo(windowKey), [windowKey]);
  const range = { from: win.from, to: win.to };

  const kpis = useKpis(range);
  const alerts = useAlerts(range);
  const hotspots = useHotspots(range);
  const network = useNetworkGraph();
  const forecast = useForecast();
  const risk = useStationRisk();

  // "settled" not "succeeded": an errored section renders its own note and must
  // not block autoprint on /print/brief.
  const ready = [kpis, alerts, hotspots, network, forecast, risk].every((q) => !q.isLoading);

  return { win, kpis, alerts, hotspots, network, forecast, risk, ready };
}
