// Whitelist row configs for the /cases/:id single-object joins (chargesheet,
// IO, court) plus the next-hearing countdown. Shared between the detail page's
// KeyValuePanels and the JSON export so both render EXACTLY the same fields —
// unknown keys never surface (caste/religion may exist in the source schema
// and must never reach the UI or an exported file).
import { differenceInCalendarDays } from 'date-fns';
import { pickDate, HEARING_DATE_KEYS } from './caseDates.js';

export const CHARGESHEET_ROWS = [
  { label: 'Chargesheet no', keys: ['chargesheetNo', 'chargeSheetNo', 'csNo', 'number'] },
  { label: 'Filed on', keys: ['chargesheetDate', 'chargeSheetDate', 'csDate', 'filedDate', 'date'], fmt: 'date' },
  { label: 'Final report', keys: ['finalReportTypeName', 'finalReportType', 'reportType', 'type'] },
  { label: 'Court', keys: ['courtName'] },
  { label: 'Status', keys: ['statusName', 'status'] },
];

export const IO_ROWS = [
  { label: 'Name', keys: ['name', 'ioName', 'officerName'] },
  { label: 'Rank', keys: ['rank', 'rankName', 'designation'] },
  { label: 'Badge / KGID', keys: ['badgeNo', 'kgid', 'kgidNo'] },
  { label: 'Unit', keys: ['unitName', 'station', 'stationName'] },
  { label: 'Assigned on', keys: ['assignedDate', 'assignedOn', 'fromDate'], fmt: 'date' },
];

export const COURT_ROWS = [
  { label: 'Court', keys: ['courtName', 'name'] },
  { label: 'Type', keys: ['courtTypeName', 'courtType', 'type'] },
  { label: 'Court case no', keys: ['courtCaseNo', 'ccNo', 'scNo', 'caseNo'] },
  { label: 'Stage', keys: ['caseStage', 'stage', 'stageName'] },
  { label: 'Next hearing', keys: ['nextHearingDate', 'hearingDate', 'nextDate'], fmt: 'date' },
  { label: 'Verdict', keys: ['verdict', 'judgement', 'outcome'] },
];

/**
 * Next-hearing countdown from the court join → { days, label, tone } or null.
 * Upcoming within a week and 'today' show amber, further out teal, past-due red.
 */
export function hearingCountdown(court, now = new Date()) {
  const hit = pickDate(court, HEARING_DATE_KEYS);
  if (!hit) return null;
  const days = differenceInCalendarDays(hit.date, now);
  if (!Number.isFinite(days)) return null;
  if (days > 0) return { days, label: `in ${days} day${days > 1 ? 's' : ''}`, tone: days <= 7 ? 'amber' : 'teal' };
  if (days === 0) return { days, label: 'today', tone: 'amber' };
  return { days, label: `overdue by ${-days} day${days < -1 ? 's' : ''}`, tone: 'red' };
}
