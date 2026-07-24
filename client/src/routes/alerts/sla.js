// /alerts — escalation SLA policy (prototype): each severity carries a triage
// due-time measured from when THIS console first saw the alert (persisted by
// useAlertPrefs as dappa-alerts-firstseen, so countdowns survive reloads).
// Pure helpers plus a ticking-clock hook; nothing here talks to the API.
import { useEffect, useState } from 'react';

/** Hours allowed to triage an alert of each severity. */
export const SLA_HOURS = { critical: 4, high: 12, medium: 24, low: 48 };
export const DEFAULT_SLA_HOURS = 24;

export const SLA_POLICY_TEXT =
  'critical 4h · high 12h · medium 24h · low 48h, counted from first sighting in this console';

/** SLA state for one alert. firstSeen: ms epoch (absent → clock starts now). */
export function slaFor(alert, firstSeen, now = Date.now()) {
  const sev = String(alert?.severity || '').toLowerCase();
  const hours = SLA_HOURS[sev] ?? DEFAULT_SLA_HOURS;
  const start = Number(firstSeen) || now;
  const due = start + hours * 3600000;
  const remainingMs = due - now;
  return {
    hours,
    due,
    remainingMs,
    breached: remainingMs <= 0,
    // amber warning once less than a quarter of the SLA window remains
    warning: remainingMs > 0 && remainingMs < hours * 3600000 * 0.25,
  };
}

/** |ms| → '42m' / '3h 05m' / '2d 4h' (rounded down to minutes). */
export function slaDuration(ms) {
  const mins = Math.floor(Math.abs(Number(ms) || 0) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${String(mins % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Re-render tick for the countdown badges (default: every 30 s). */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
