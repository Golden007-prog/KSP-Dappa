// Trends deep-dive — client-side CSV export (Blob download, no server round
// trip). Values are escaped per RFC 4180; a UTF-8 BOM keeps Excel happy.

const BOM = String.fromCharCode(0xfeff);

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** headers: string[] · rows: any[][] → CSV text. */
export function buildCsv(headers, rows) {
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return BOM + lines.join('\r\n');
}

/** Trigger a browser download of the given rows as <filename>.csv. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 'Bengaluru City · Theft' → 'bengaluru-city-theft' (safe filename token). */
export function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'all';
}
