'use strict';
// Small deterministic helpers shared by routes and copilot.

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Current 'YYYY-MM' for a Date (defaults to now). */
function ymOf(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
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

function logJson(level, evt, extra) {
  const rec = Object.assign({ ts: new Date().toISOString(), level, evt }, extra || {});
  // Structured single-line logs for Catalyst function log viewer.
  console.log(JSON.stringify(rec));
}

module.exports = { pad2, ymOf, ymAdd, ymRange, toNum, round, pctDelta, fmtInt, hash32, parseJsonSafe, logJson };
