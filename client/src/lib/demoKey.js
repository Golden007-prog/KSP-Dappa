// KSP DAPPA — static-demo snapshot key encoding, shared by two consumers so
// they can never drift apart:
//   1. scripts/demo_snapshot.mjs (Node) — writes client/public/demo/api/<key>.json
//   2. src/lib/api.js (browser)        — reads the same files when the bundle
//      is built with VITE_STATIC_DEMO=1 (GitHub Pages demo).
// Dependency-free ESM on purpose: Node imports it straight from source.

/** FNV-1a 32-bit hash → 8-char hex (deterministic, tiny, no deps). */
export function fnv32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Sorted `k=v&k2=v2` with null/undefined/'' dropped and every value String()-
 * coerced, so {perPage: 200} and {perPage: '200'} produce the same key. */
export function canonicalParams(params = {}) {
  const parts = [];
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join('&');
}

/** Stable JSON for POST bodies: keys sorted recursively, primitives coerced to
 * String (1 === '1', false === 'false'), null/undefined entries dropped. */
export function stableBody(body) {
  const walk = (v) => {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const w = walk(v[k]);
        if (w !== null) out[k] = w;
      }
      return out;
    }
    return String(v);
  };
  return JSON.stringify(walk(body));
}

/** Mirror of the backend copilot normalizer (functions/dappa_api/lib/copilot.js
 * parse()): lowercase, punctuation → space, collapsed whitespace. Keying on the
 * normalized utterance makes 'Total FIRs last month?' hit the same snapshot. */
export function normalizeUtterance(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[?.!,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugOf(method, path) {
  return `${String(method || 'GET').toUpperCase()}_${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * method + path + params (+ body) → filename-safe snapshot key, e.g.
 * 'get_summary_kpis.1a2b3c4d'. The readable slug aids debugging; the hash over
 * the canonical request string guarantees uniqueness across param combos.
 */
export function demoKey(method, path, params = {}, body = null) {
  const m = String(method || 'GET').toUpperCase();
  const canonical = `${m} ${path}?${canonicalParams(params)}${body != null ? `|${stableBody(body)}` : ''}`;
  return `${slugOf(m, path)}.${fnv32(canonical)}`;
}

/** Fixed-name key for a POST endpoint's representative fallback response —
 * served when the exact request body was not part of the snapshot sweep. */
export function demoFallbackKey(method, path) {
  return `${slugOf(method, path)}._fallback`;
}

/**
 * POST paths whose snapshot key is built from a SUBSET of the request body.
 * Only for bodies the generator cannot reproduce byte-for-byte or whose extra
 * fields provably do not change the answer:
 *   /identify  the probe image is a canvas PNG encoded by the browser, so its
 *              bytes differ per engine; a sample capture is keyed on the
 *              stand-in it was drawn from (samplePerson) plus the filters, and
 *              caseNo / legalBasis are recorded, not matched on. The replay is
 *              the live function's answer for that stand-in, so the figure can
 *              differ by a point from what this browser's canvas would score.
 */
export const DEMO_POST_KEY_FIELDS = {
  '/identify': ['samplePerson', 'filters', 'limit'],
};

/** The body a POST snapshot is keyed on — identity for everything unlisted. */
export function demoPostKeyBody(path, body) {
  const fields = DEMO_POST_KEY_FIELDS[path];
  if (!fields) return body || {};
  const out = {};
  for (const k of fields) {
    const v = body ? body[k] : undefined;
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}
