// Weekly Brief — triage and SLA performance over the alerts in the window.
//
// The brief already lists the top anomalies. This answers the supervisor's
// question about the DESK rather than the crime: how many alerts arrived, how
// many are still open, how the queue splits across the four statuses the
// corpus actually carries, how old the open ones are, and what share are inside
// their escalation window.
//
// SLA compliance is measured against the alert's period end (the earliest
// moment the desk could have acted), not against a per-browser first-sighting
// timestamp — a printed brief has to mean the same thing on every machine.
import { statusKey, sevKey, sevRank, direction, SEV_KEYS, STATUS_KEYS } from '../alerts/severity.js';
import { SLA_HOURS, DEFAULT_SLA_HOURS } from '../alerts/sla.js';
import { alertAgeDays } from '../alerts/explain.js';

const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Roll the window's alerts into brief-ready triage statistics.
 * Returns null when there are no alerts to describe.
 */
export function triageStats(brief, now = Date.now()) {
  const rows = brief?.alerts?.data || [];
  if (!rows.length) return null;

  const byStatus = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  const bySeverity = Object.fromEntries(SEV_KEYS.map((k) => [k, 0]));
  const openAges = [];
  let surges = 0;
  let drops = 0;
  let withinSla = 0;
  let openCount = 0;

  for (const a of rows) {
    const st = statusKey(a.status);
    byStatus[st] = (byStatus[st] || 0) + 1;
    const sv = sevKey(a.severity);
    if (sv) bySeverity[sv] += 1;
    if (direction(a) === 'down') drops += 1; else surges += 1;
    if (st === 'open') {
      openCount += 1;
      const age = alertAgeDays(a, now);
      if (age !== null) {
        openAges.push(age);
        const allowed = (SLA_HOURS[sv] ?? DEFAULT_SLA_HOURS) / 24;
        if (age <= allowed) withinSla += 1;
      }
    }
  }

  const handled = rows.length - openCount;
  const hottest = [...rows]
    .filter((a) => statusKey(a.status) === 'open')
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity)
      || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0))[0] || null;

  return {
    total: rows.length,
    openCount,
    handled,
    byStatus,
    bySeverity,
    surges,
    drops,
    medianOpenAgeDays: median(openAges),
    maxOpenAgeDays: openAges.length ? Math.max(...openAges) : null,
    withinSla,
    slaPct: openCount ? (withinSla / openCount) * 100 : null,
    handledPct: rows.length ? (handled / rows.length) * 100 : null,
    hottest,
  };
}
