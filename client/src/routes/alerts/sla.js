// /alerts — escalation SLA policy (prototype): each severity carries a triage
// due-time measured from when THIS console first saw the alert (persisted by
// useAlertPrefs as dappa-alerts-firstseen, so countdowns survive reloads).
// Pure helpers plus a ticking-clock hook; nothing here talks to the API.
import { useEffect, useState } from 'react';
import { translate } from '../../lib/i18n.jsx';
import { sevKey } from './severity.js';

/** Fallback translator for callers that have no hook in scope (tests, plain JS). */
const en = (key, vars) => translate('en', key, vars);

/** Hours allowed to triage an alert of each severity. */
export const SLA_HOURS = { critical: 4, high: 12, medium: 24, low: 48 };
export const DEFAULT_SLA_HOURS = 24;

/** English policy sentence — kept for callers that predate the translator. */
export const SLA_POLICY_TEXT =
  'critical 4h · high 12h · medium 24h · low 48h, counted from first sighting in this console';

/** Localised policy sentence for the SLA badge tooltip and the brief annex. */
export const slaPolicyText = (t = en) => t('alerts.sla.policy');

/** SLA state for one alert. firstSeen: ms epoch (absent → clock starts now). */
export function slaFor(alert, firstSeen, now = Date.now()) {
  // Live rows carry the stored INTEGER band, not a word — decode before the
  // policy lookup or every alert silently inherits the 24h default.
  const sev = sevKey(alert?.severity);
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

/** |ms| → '42m' / '3h 05m' / '2d 4h' (rounded down to minutes), in the active
 * language when a translator is passed. */
export function slaDuration(ms, t = en) {
  const mins = Math.floor(Math.abs(Number(ms) || 0) / 60000);
  if (mins < 60) return t('alerts.sla.minutes', { m: mins });
  const h = Math.floor(mins / 60);
  if (h < 48) return t('alerts.sla.hours', { h, m: String(mins % 60).padStart(2, '0') });
  return t('alerts.sla.days', { d: Math.floor(h / 24), h: h % 24 });
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
