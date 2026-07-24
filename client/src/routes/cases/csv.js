// Client-side CSV export for the Case Explorer — pages through GET /cases with
// the active server filters (perPage 200, capped so a demo click can't pull the
// whole synthetic corpus), applies the same client-side refinements the table
// shows, and downloads a UTF-8 (BOM) Blob. No server round-trip for the file.
import { apiGet } from '../../lib/api.js';
import { caseAgeDays } from './explorerState.js';

export const EXPORT_CAP = 1000;

export const EXPORT_COLUMNS = [
  { key: 'caseMasterId', label: 'CaseMasterID' },
  { key: 'crimeNo', label: 'CrimeNo' },
  { key: 'caseNo', label: 'CaseNo' },
  { key: 'registeredDate', label: 'RegisteredDate' },
  { key: 'districtName', label: 'District' },
  { key: 'unitName', label: 'Station' },
  { key: 'headName', label: 'CrimeHead' },
  { key: 'subHeadName', label: 'SubHead' },
  { key: 'statusName', label: 'Status' },
  { key: 'gravityName', label: 'Gravity' },
  { key: 'anomalyFlag', label: 'Anomaly', value: (r) => (r.anomalyFlag ? 'yes' : 'no') },
];

// Client-computed column — raw export rows come straight from the API, so the
// age is derived here rather than read off the row.
const AGE_COLUMN = { key: 'ageDays', label: 'AgeDays', value: (r) => caseAgeDays(r.registeredDate) ?? '' };

// Always exported regardless of the chooser — the file stays joinable/identifiable.
const IDENTITY_KEYS = new Set(['caseMasterId', 'crimeNo']);

/**
 * Export columns mirroring the on-screen column chooser: identity columns are
 * kept, the rest follow visibility. Falls back to the full canonical set when
 * no key list is given (backwards compatible).
 */
export function buildExportColumns(visibleKeys) {
  if (!Array.isArray(visibleKeys)) return EXPORT_COLUMNS;
  const keys = new Set(visibleKeys);
  const cols = EXPORT_COLUMNS.filter((c) => IDENTITY_KEYS.has(c.key) || keys.has(c.key));
  if (keys.has('ageDays')) cols.push(AGE_COLUMN);
  return cols;
}

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns = EXPORT_COLUMNS) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((r) =>
    columns.map((c) => csvCell(c.value ? c.value(r) : r?.[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

export function downloadCsv(filename, csvText) {
  // BOM so Excel opens en-IN text columns as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff), csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Fetch every row of the current server filter (newest first, ≤ cap).
 * → { rows, total, truncated } — truncated means the server had more matches
 * than the cap allowed us to pull.
 */
export async function fetchCasesForExport(serverParams, { cap = EXPORT_CAP } = {}) {
  const perPage = 200;
  const rows = [];
  let total = 0;
  for (let page = 1; rows.length < cap; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await apiGet('/cases', { ...serverParams, page, perPage });
    const batch = Array.isArray(r.data) ? r.data : (r.data?.rows || []);
    rows.push(...batch);
    total = Number(r.meta?.total);
    if (!Number.isFinite(total)) total = rows.length;
    if (batch.length < perPage || rows.length >= total) break;
  }
  const truncated = rows.length > cap || rows.length < total;
  if (rows.length > cap) rows.length = cap;
  return { rows, total, truncated };
}

export function exportFilename(prefix = 'dappa-cases') {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}
