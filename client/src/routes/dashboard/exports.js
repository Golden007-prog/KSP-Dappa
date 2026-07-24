// Dashboard export helpers — pure client-side downloads (Blob / data-URL),
// no external services. CSV gets a UTF-8 BOM so Excel opens en-IN text cleanly.

/** 'District leaderboard' → 'district-leaderboard' (for filenames). */
export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Today as 'YYYY-MM-DD' for filename stamps. */
export function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// U+FEFF byte-order mark, kept out of the source text on purpose.
const BOM = String.fromCharCode(0xfeff);

function triggerDownload(href, filename, revoke = false) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1500);
}

/**
 * Download rows as CSV. headers: string[]; rows: (string|number|null)[][].
 * Quotes/commas/newlines are escaped per RFC 4180.
 */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(esc).join(','));
  const blob = new Blob([BOM, lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(URL.createObjectURL(blob), filename, true);
}

/** Download an ECharts getDataURL() result (or any data: URL) as a file. */
export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return;
  triggerDownload(dataUrl, filename);
}
