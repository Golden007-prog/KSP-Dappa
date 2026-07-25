// Whitelist row configs for the /cases/:id single-object joins (chargesheet,
// IO, court) plus the next-hearing countdown. Shared between the detail page's
// KeyValuePanels and the JSON export so both render EXACTLY the same fields —
// unknown keys never surface (caste/religion may exist in the source schema
// and must never reach the UI or an exported file).
import { differenceInCalendarDays } from 'date-fns';
import { pickDate, HEARING_DATE_KEYS } from './caseDates.js';

// `label` stays English on purpose — exportCaseJson slugs it into the JSON keys,
// so translating it would rename exported fields. `labelKey` drives the UI.
export const CHARGESHEET_ROWS = [
  { label: 'Chargesheet no', labelKey: 'cases.panel.cs.no', keys: ['chargesheetNo', 'chargeSheetNo', 'csNo', 'number'] },
  { label: 'Filed on', labelKey: 'cases.panel.cs.filedOn', keys: ['chargesheetDate', 'chargeSheetDate', 'csDate', 'filedDate', 'date'], fmt: 'date' },
  { label: 'Final report', labelKey: 'cases.panel.cs.finalReport', keys: ['finalReportTypeName', 'finalReportType', 'reportType', 'type'] },
  { label: 'Court', labelKey: 'cases.panel.cs.court', keys: ['courtName'] },
  { label: 'Status', labelKey: 'cases.panel.cs.status', keys: ['statusName', 'status'] },
];

export const IO_ROWS = [
  { label: 'Name', labelKey: 'cases.panel.io.name', keys: ['name', 'ioName', 'officerName'] },
  { label: 'Rank', labelKey: 'cases.panel.io.rank', keys: ['rank', 'rankName', 'designation'] },
  { label: 'Badge / KGID', labelKey: 'cases.panel.io.badge', keys: ['badgeNo', 'kgid', 'kgidNo'] },
  { label: 'Unit', labelKey: 'cases.panel.io.unit', keys: ['unitName', 'station', 'stationName'] },
  { label: 'Assigned on', labelKey: 'cases.panel.io.assignedOn', keys: ['assignedDate', 'assignedOn', 'fromDate'], fmt: 'date' },
];

export const COURT_ROWS = [
  { label: 'Court', labelKey: 'cases.panel.court.name', keys: ['courtName', 'name'] },
  { label: 'Type', labelKey: 'cases.panel.court.type', keys: ['courtTypeName', 'courtType', 'type'] },
  { label: 'Court case no', labelKey: 'cases.panel.court.caseNo', keys: ['courtCaseNo', 'ccNo', 'scNo', 'caseNo'] },
  { label: 'Stage', labelKey: 'cases.panel.court.stage', keys: ['caseStage', 'stage', 'stageName'] },
  { label: 'Next hearing', labelKey: 'cases.panel.court.nextHearing', keys: ['nextHearingDate', 'hearingDate', 'nextDate'], fmt: 'date' },
  { label: 'Verdict', labelKey: 'cases.panel.court.verdict', keys: ['verdict', 'judgement', 'outcome'] },
];

/**
 * Next-hearing countdown from the court join → { days, label, tone } or null.
 * Upcoming within a week and 'today' show amber, further out teal, past-due red.
 * `t` is optional — without it the label stays English (callers outside the
 * provider, tests).
 */
export function hearingCountdown(court, now = new Date(), t = null) {
  const hit = pickDate(court, HEARING_DATE_KEYS);
  if (!hit) return null;
  const days = differenceInCalendarDays(hit.date, now);
  if (!Number.isFinite(days)) return null;
  const say = (key, fallback, vars) => (t ? t(key, vars) : fallback);
  if (days > 0) {
    return {
      days,
      label: say(days > 1 ? 'cases.panel.hearing.inDays' : 'cases.panel.hearing.inDayOne',
        `in ${days} day${days > 1 ? 's' : ''}`, { n: days }),
      tone: days <= 7 ? 'amber' : 'teal',
    };
  }
  if (days === 0) return { days, label: say('cases.panel.hearing.today', 'today'), tone: 'amber' };
  return {
    days,
    label: say(days < -1 ? 'cases.panel.hearing.overdue' : 'cases.panel.hearing.overdueOne',
      `overdue by ${-days} day${days < -1 ? 's' : ''}`, { n: -days }),
    tone: 'red',
  };
}
