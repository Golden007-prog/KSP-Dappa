// Tolerant date/key access for the unpinned /cases/:id joins. The exact field
// names of arrests/chargesheet/court are not pinned in docs/CONTRACTS.md, so
// every consumer (timeline, lag strip, hearing countdown, JSON export) resolves
// the same multi-key lists — mirroring PartyList/KeyValuePanel's pick() rule.
import { isValid, parse } from 'date-fns';

export const ARREST_DATE_KEYS = ['arrestDate', 'dateOfArrest', 'arrestedOn', 'date'];
export const CS_DATE_KEYS = ['chargesheetDate', 'chargeSheetDate', 'csDate', 'filedDate', 'date'];
export const CS_TYPE_KEYS = ['finalReportTypeName', 'finalReportType', 'reportType', 'type'];
export const HEARING_DATE_KEYS = ['nextHearingDate', 'hearingDate', 'nextDate'];

/** ISO-ish string → Date (date part only) or null. */
export function toDate(iso) {
  if (!iso) return null;
  const d = parse(String(iso).slice(0, 10), 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
}

/** First non-empty value under any of the keys (PartyList's pick semantics). */
export function pickValue(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** First key that parses as a date → { date, raw } (raw keeps the ISO string
 * for dateLabel display); null when nothing parses. */
export function pickDate(obj, keys) {
  for (const k of keys) {
    const raw = obj?.[k];
    const date = toDate(raw);
    if (date) return { date, raw };
  }
  return null;
}

/** Earliest arrest across records, tolerant of per-record key variants. */
export function firstArrest(arrests) {
  const hits = (Array.isArray(arrests) ? arrests : [])
    .map((a) => pickDate(a, ARREST_DATE_KEYS))
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
  return hits[0] || null;
}
