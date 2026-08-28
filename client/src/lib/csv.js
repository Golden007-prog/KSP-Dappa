// CSV parsing for the ingest screen — quote-aware (RFC 4180: doubled quotes,
// embedded newlines and delimiters inside quotes), delimiter sniffing
// (comma / semicolon / tab), UTF-8 BOM and encoding detection, plus the
// Indian-locale helpers the validator needs (dd-mm-yyyy, lakh/crore digit
// grouping). Pure browser code: no library, no network.

/** Decode a File/ArrayBuffer to text. UTF-8 first (fatal); a UTF-16 BOM is
 * honoured; anything that is not valid UTF-8 is re-read as Windows-1252 and
 * reported so the officer knows the file was not saved as Unicode. */
export function decodeBuffer(buf) {
  const bytes = new Uint8Array(buf);
  const info = { encoding: 'utf-8', bom: false, fallback: false };
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const le = bytes[0] === 0xff;
    info.encoding = le ? 'utf-16le' : 'utf-16be';
    info.bom = true;
    return { text: new TextDecoder(info.encoding).decode(bytes.subarray(2)), info };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) info.bom = true;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), info };
  } catch {
    info.encoding = 'windows-1252';
    info.fallback = true;
    let text;
    try { text = new TextDecoder('windows-1252').decode(bytes); } catch { text = new TextDecoder('utf-8').decode(bytes); }
    return { text: text.replace(/^﻿/, ''), info };
  }
}

/** Pick the delimiter that splits the header most consistently across the first lines. */
export function sniffDelimiter(text) {
  const sample = text.slice(0, 20000).split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => l.split(d).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length;
    const score = consistent * 1000 + counts[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * Parse CSV text → { header: string[], rows: string[][], delimiter, stats }.
 * Rows shorter than the header are padded; longer rows are kept (the extra
 * cells are reported in stats.ragged) so nothing is silently dropped.
 */
export function parseCsv(text, opts = {}) {
  const delimiter = opts.delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"') { quoted = true; i += 1; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue;
    }
    cell += ch; i += 1;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // drop fully blank trailing lines
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  const header = (rows.shift() || []).map((h) => h.replace(/^﻿/, '').trim());
  let ragged = 0;
  let short = 0;
  const body = rows.map((r) => {
    if (r.length > header.length) ragged += 1;
    if (r.length < header.length) { short += 1; return r.concat(Array(header.length - r.length).fill('')); }
    return r;
  });
  return { header, rows: body, delimiter, stats: { rows: body.length, columns: header.length, ragged, short, unterminatedQuote: quoted } };
}

/** Kannada script cells (U+0C80–U+0CFF) — reported so the officer sees the file's script survived decoding. */
export function countKannadaCells(rows, limit = 200000) {
  let count = 0;
  let seen = 0;
  for (const r of rows) {
    for (const c of r) {
      seen += 1;
      if (/[ಀ-೿]/.test(c)) count += 1;
      if (seen >= limit) return { count, sampled: seen, partial: true };
    }
  }
  return { count, sampled: seen, partial: false };
}

/** '1,00,566' (Indian grouping) or '100,566' → '100566'; anything else untouched. */
export function stripDigitGrouping(s) {
  const v = String(s).trim();
  if (/^-?\d{1,3}(,\d{2})*(,\d{3})$/.test(v) || /^-?\d{1,3}(,\d{3})+$/.test(v)) return v.replace(/,/g, '');
  return v;
}

/** dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy (optionally with HH:MM[:SS]) → ISO; ISO passes through; null when not a date. */
export function toIsoDate(s) {
  const t = String(s).trim().replace('T', ' ');
  const m = t.match(/^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  let y; let mo; let d;
  if (m[1].length === 4) { y = +m[1]; mo = +m[3]; d = +m[4]; } else if (m[4].length === 4) { y = +m[4]; mo = +m[3]; d = +m[1]; } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (m[5] === undefined) return { date, normalised: m[1].length !== 4 };
  return { date, time: `${String(+m[5]).padStart(2, '0')}:${m[6]}:${m[7] || '00'}`, normalised: m[1].length !== 4 };
}

/** Serialise rows (arrays or objects) to CSV text. */
export function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(',')];
  for (const r of rows) lines.push(columns.map((c, i) => cell(Array.isArray(r) ? r[i] : r[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Byte size of a JSON payload — used to split a big file into ≤ 700 KB validate parts. */
export function jsonBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return JSON.stringify(value).length; }
}

/** Split rows into parts whose JSON stays under maxBytes (never fewer than 1 row per part). */
export function splitRows(rows, maxBytes = 700 * 1024) {
  const parts = [];
  let cur = [];
  let curBytes = 2;
  for (const r of rows) {
    const b = jsonBytes(r) + 1;
    if (cur.length && curBytes + b > maxBytes) { parts.push(cur); cur = []; curBytes = 2; }
    cur.push(r);
    curBytes += b;
  }
  if (cur.length) parts.push(cur);
  return parts;
}
