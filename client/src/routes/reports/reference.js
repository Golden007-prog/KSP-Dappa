// Weekly Brief — document reference code and revision stamp.
//
// A brief that circulates on paper needs a handle: "which one is this, and is
// it the same one I read yesterday?". The code is DERIVED, never stored, so the
// preview, the print view, the PDF, the Markdown and the JSON bundle all agree
// without passing anything through the URL:
//
//   DAPPA/WB/<to-date compacted>/<window code>-<content hash>
//   e.g. DAPPA/WB/20260726/W7-4C1A
//
// The hash covers the window, the enabled sections in order, and the
// classification — i.e. everything that changes what the document CONTAINS.
// Change any of them and the code changes; regenerate the same brief tomorrow
// with the same settings and only the date part moves.

/** FNV-1a, 32-bit — deterministic, dependency-free, good enough for a doc id. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Short window code: last-7-days → W7, last-30-days → W30, custom → WC. */
function windowCode(win) {
  if (!win) return 'W';
  if (win.value === 'custom') return 'WC';
  const days = Number(win.days);
  return Number.isFinite(days) ? `W${days}` : 'W';
}

/**
 * Reference code for one brief configuration.
 * `sections` is the ORDERED list of enabled section keys.
 */
export function briefReference(win, sections = [], classification = 'unclassified') {
  const day = String(win?.to || new Date().toISOString().slice(0, 10)).slice(0, 10).replace(/-/g, '');
  const payload = [win?.value || '', win?.from || '', win?.to || '', sections.join(','), classification].join('|');
  const tag = hash32(payload).toString(16).toUpperCase().padStart(8, '0').slice(-4);
  return `DAPPA/WB/${day}/${windowCode(win)}-${tag}`;
}

/** Revision letter A–Z: how many times this exact code has been generated here. */
const REV_KEY = 'dappa-brief-revisions';

function loadRevs() {
  try {
    const v = JSON.parse(localStorage.getItem(REV_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Bump and return the revision for a reference code (called on export only). */
export function bumpRevision(code) {
  const revs = loadRevs();
  const next = Math.min(25, (Number(revs[code]) || 0) + 1);
  revs[code] = next;
  // Keep the map small — 40 recent codes is plenty for a demo machine.
  const keys = Object.keys(revs);
  if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete revs[k];
  try { localStorage.setItem(REV_KEY, JSON.stringify(revs)); } catch { /* private mode */ }
  return String.fromCharCode(65 + next - 1);
}

/** Current revision letter without bumping ('A' when never exported). */
export function currentRevision(code) {
  const n = Number(loadRevs()[code]) || 1;
  return String.fromCharCode(65 + Math.min(25, n) - 1);
}
