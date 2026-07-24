// /alerts — client-side CSV export. Blob download only; no server round-trip,
// so it works identically on Catalyst and the static GitHub Pages demo.

/** RFC-4180-ish cell escaping: quote when the value contains , " or newline. */
function cell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{key, label}] · rows: array of objects → CSV string (CRLF). */
export function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadBlob(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so slower browsers finish reading the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const ALERT_COLUMNS = [
  { key: 'alertId', label: 'Alert ID' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'districtName', label: 'District' },
  { key: 'headName', label: 'Crime head' },
  { key: 'periodStart', label: 'Period start' },
  { key: 'periodEnd', label: 'Period end' },
  { key: 'observed', label: 'Observed' },
  { key: 'expected', label: 'Expected' },
  { key: 'zScore', label: 'z-score' },
  { key: 'narrative', label: 'Narrative' },
];

/** Download the given alerts as dappa-alerts-YYYY-MM-DD.csv; returns row count. */
export function exportAlertsCsv(alerts) {
  const rows = (alerts || []).map((a) => ({
    ...a,
    districtName: a.districtName || a.districtId || '',
    headName: a.headName || '',
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`dappa-alerts-${stamp}.csv`, toCsv(ALERT_COLUMNS, rows));
  return rows.length;
}
