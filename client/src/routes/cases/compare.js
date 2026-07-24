// Compare-tray selection — up to COMPARE_CAP case snapshots persisted in
// sessionStorage so the tray survives a round-trip into a case detail and
// back, but resets with the browsing session (unlike stars, which are durable).
// Snapshots carry the list-row fields so a selected case stays comparable even
// after paging/filtering removes its row from the table.
import { caseAgeDays } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-compare';
export const COMPARE_CAP = 3;

export function readCompare() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => x && x.caseMasterId !== undefined).slice(0, COMPARE_CAP) : [];
  } catch {
    return [];
  }
}

export function writeCompare(list) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/** Freeze the comparable fields of one explorer row. */
export function snapshotRow(r) {
  return {
    caseMasterId: r.caseMasterId,
    crimeNo: r.crimeNo ?? '',
    caseNo: r.caseNo ?? '',
    registeredDate: r.registeredDate ?? '',
    districtName: r.districtName ?? '',
    unitName: r.unitName ?? '',
    headName: r.headName ?? '',
    subHeadName: r.subHeadName ?? '',
    statusName: r.statusName ?? '',
    gravityName: r.gravityName ?? '',
    anomalyFlag: !!r.anomalyFlag,
    ageDays: Number.isFinite(r.ageDays) ? r.ageDays : caseAgeDays(r.registeredDate),
  };
}
