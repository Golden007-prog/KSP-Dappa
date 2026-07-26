'use strict';
// Small deterministic helpers shared by routes and copilot.

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Current 'YYYY-MM' for a Date (defaults to now), anchored to IST wall-clock.
 * Catalyst containers run UTC while every dataset timestamp is IST-shaped, so
 * around month boundaries a naive local read would flip the anchor month a few
 * hours early/late. On an IST host the shift is a no-op. */
const IST_OFFSET_MIN = 330;
function ymOf(date) {
  const d = date || new Date();
  const ist = new Date(d.getTime() + (IST_OFFSET_MIN + d.getTimezoneOffset()) * 60000);
  return `${ist.getFullYear()}-${pad2(ist.getMonth() + 1)}`;
}

/** Add n months to a 'YYYY-MM' string. */
function ymAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

/** Inclusive list of Ym strings from..to. */
function ymRange(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 600) {
    out.push(cur);
    cur = ymAdd(cur, 1);
    guard += 1;
  }
  return out;
}

function toNum(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (dflt === undefined ? 0 : dflt);
}

function round(v, places) {
  const f = Math.pow(10, places === undefined ? 1 : places);
  return Math.round(toNum(v) * f) / f;
}

function pctDelta(cur, prev) {
  const c = toNum(cur);
  const p = toNum(prev);
  if (p === 0) return c === 0 ? 0 : 100;
  return round(((c - p) / p) * 100, 1);
}

function fmtInt(n) {
  return Math.round(toNum(n)).toLocaleString('en-IN');
}

/** Deterministic small hash for seeding sparklines etc. */
function hash32(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseJsonSafe(raw, dflt) {
  if (raw === undefined || raw === null || raw === '') return dflt;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return dflt;
  }
}

/** Pearson correlation of two equal-length numeric arrays.
 * Returns null when n < 3 or either side has zero variance (an r of 0 would
 * misread "not computable" as "no relationship"). */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) { sx += toNum(xs[i]); sy += toNum(ys[i]); }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = toNum(xs[i]) - mx;
    const b = toNum(ys[i]) - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function logJson(level, evt, extra) {
  const rec = Object.assign({ ts: new Date().toISOString(), level, evt }, extra || {});
  // Structured single-line logs for Catalyst function log viewer.
  console.log(JSON.stringify(rec));
}

/** RFC-4180-ish CSV: rows = plain objects, columns = ordered key list.
 * Arrays are joined with '|'; values with commas/quotes/newlines are quoted. */
function toCsv(rows, columns) {
  const cell = (v) => {
    if (v === undefined || v === null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(cell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Bound a live AI/service call so a hung remote can never stall a request.
 * The fallbacks in zia/quickml/smartbrowz live in catch blocks, which fire on
 * ERROR but not on a call that simply never returns — with an AI flag on and
 * its service unconfigured or slow, that is the difference between a fast
 * deterministic answer and a request that hangs until the platform kills it.
 * Rejects with a tagged error so the caller's existing catch takes the
 * fallback path unchanged.
 */
function withTimeout(promise, ms, label) {
  let timer = null;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label || 'remote call'} timed out after ${ms}ms`);
      err.code = 'SERVICE_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, limit]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Default budget for a live AI hop before we fall back (ms). */
const AI_TIMEOUT_MS = Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 4000);

module.exports = { pad2, ymOf, ymAdd, ymRange, toNum, round, pctDelta, fmtInt, hash32, pearson, parseJsonSafe, logJson, toCsv, withTimeout, AI_TIMEOUT_MS };
