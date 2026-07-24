// Client-side file download helpers (CSV + data-URL) for the Network and
// Offender routes. Blob URLs only — nothing leaves the browser.

/** Trigger a browser download of a Blob. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so slow devices finish reading the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Trigger a download of a data: URL (e.g. cytoscape/echarts PNG export). */
export function downloadDataUrl(filename, dataUrl) {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function csvEscape(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * rows + columns [{key?, label, map?(row)}] → CSV string.
 * BOM-prefixed so Excel opens en-IN text correctly.
 */
export function toCsv(columns, rows) {
  const head = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((r) =>
    columns.map((c) => csvEscape(c.map ? c.map(r) : r?.[c.key])).join(','));
  return `\uFEFF${[head, ...lines].join('\r\n')}`;
}

/** One-call CSV download. */
export function downloadCsv(filename, columns, rows) {
  downloadBlob(filename, new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
}
