// Bulk selection — the unbounded sibling of the 3-case compare tray.
//
// Compare is deliberately capped at 3 (a side-by-side of 10 cases is unreadable),
// but working a series or a station's backlog needs a working set: tick 40 rows,
// star them, copy their CrimeNos into a case diary, or export just those rows.
// Snapshots (not ids) are stored so a selected case survives paging and filter
// changes that remove its row from the table.
import { snapshotRow } from './compare.js';

const STORAGE_KEY = 'dappa-cases-bulk';
export const BULK_CAP = 500;

export function readBulk() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => x && x.caseMasterId !== undefined).slice(0, BULK_CAP) : [];
  } catch {
    return [];
  }
}

export function writeBulk(list) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, BULK_CAP))); } catch { /* private mode */ }
}

/** Toggle one row in/out of the selection → the next list (never mutates). */
export function toggleBulk(list, row) {
  const key = String(row.caseMasterId);
  if (list.some((x) => String(x.caseMasterId) === key)) {
    return list.filter((x) => String(x.caseMasterId) !== key);
  }
  if (list.length >= BULK_CAP) return list;
  return [...list, snapshotRow(row)];
}

/** Add every row that is not already selected (page-level "select all"). */
export function addManyBulk(list, rows) {
  const seen = new Set(list.map((x) => String(x.caseMasterId)));
  const next = [...list];
  for (const r of rows || []) {
    const key = String(r.caseMasterId);
    if (seen.has(key) || next.length >= BULK_CAP) continue;
    seen.add(key);
    next.push(snapshotRow(r));
  }
  return next;
}

export function removeManyBulk(list, rows) {
  const drop = new Set((rows || []).map((r) => String(r.caseMasterId)));
  return list.filter((x) => !drop.has(String(x.caseMasterId)));
}
