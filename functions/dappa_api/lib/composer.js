'use strict';
// LLM answer composer with a numeric firewall (backlog row 167).
//
// The deterministic copilot (lib/copilot.js) executes ZCQL and returns a
// templated answer plus the facts it used. When FEATURE_QUICKML_LLM is on and
// QUICKML_LLM_URL points at a QuickML LLM Serving endpoint (GLM 4.7 Flash per
// the Aug-2026 release notes; no zcatalyst-sdk-node binding exists in 3.4.0,
// so this is a POST), the model is asked to REWORD that answer for the
// officer's tier — and every number in what comes back must already exist in
// the executed facts. A single unexplained number rejects the whole
// composition and the deterministic sentence ships instead. The model can
// phrase; it cannot invent. The one exemption is an integer 0-12 doing
// ordering/window work in the sentence ("top 5", "the last 3 months",
// "2 of the 3") — a small integer anywhere else is rejected like any other,
// because that is exactly the range arrests and chargesheets live in.
//
// Fallback : the deterministic answer, firewall {mode:'not-invoked'}.

const { withTimeout, AI_TIMEOUT_MS } = require('./util');

const NUM_RE = /(?<![A-Za-z0-9_.])[-+]?\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9_])/g;

function canon(raw) {
  const s = String(raw).replace(/[,%+\s]/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Canonical form that KEEPS the unit: '1,245' -> '1245', '42%' -> '42%'.
 * Stripping the '%' on both sides let the model restate a raw count as a
 * share ("42 cases" -> "a 42% share") and the firewall waved it through,
 * so a percent token now only matches a percent fact. Pure.
 */
function canonTyped(raw) {
  const c = canon(raw);
  if (c === null) return null;
  return String(raw).includes('%') ? `${c}%` : c;
}

/** Every number reachable inside an object graph, canonicalised. Pure. */
function collectNumbers(value, out, depth) {
  const set = out || new Set();
  const d = depth || 0;
  if (d > 8 || value === null || value === undefined) return set;
  if (typeof value === 'number') { const c = canon(value); if (c !== null) set.add(c); return set; }
  if (typeof value === 'string') {
    for (const m of value.match(NUM_RE) || []) { const c = canonTyped(m); if (c !== null) set.add(c); }
    return set;
  }
  if (Array.isArray(value)) { for (const v of value) collectNumbers(v, set, d + 1); return set; }
  if (typeof value === 'object') { for (const v of Object.values(value)) collectNumbers(v, set, d + 1); return set; }
  return set;
}

// A small integer is allowed ONLY where it is doing ordering/window work in
// the prose — "top 5", "the last 3 months", "2 of the 3". A bare "12 arrests"
// is not prose, it is a police number, and 0-12 is exactly the range those
// counts live in (arrests, chargesheets, murders, accused), so an unmatched
// integer is rejected whatever its size. Years pass through the facts set.
const PROSE_MAX = 12;
const ORDER_BEFORE = /\b(top|first|last|next|previous|past)\s+$/i;
const OF_AFTER = /^\s*(of|out\s+of)\b/i;

/** True when the token at [idx, idx+len) sits in an ordering/window phrase. */
function inProsePhrase(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 24), idx);
  const after = text.slice(idx + len, idx + len + 12);
  return ORDER_BEFORE.test(before) || OF_AFTER.test(after);
}

/**
 * Check a candidate answer against the executed facts. Pure.
 * Returns { passed, checked, rejected:[{token, value}], allowed:[...] }.
 */
function firewall(answerText, facts, extraAllowed) {
  const allowed = collectNumbers(facts);
  for (const x of extraAllowed || []) { const c = canonTyped(x); if (c !== null) allowed.add(c); }
  const text = String(answerText || '');
  const rejected = [];
  let checked = 0;
  for (const m of text.matchAll(NUM_RE)) {
    const tok = m[0];
    const c = canonTyped(tok);
    if (c === null) continue;
    checked += 1;
    const n = Number(canon(tok));
    if (allowed.has(c)) continue;
    if (!tok.includes('%') && Number.isInteger(n) && n >= 0 && n <= PROSE_MAX && inProsePhrase(text, m.index, tok.length)) continue;
    rejected.push({ token: tok, value: n });
  }
  return { passed: rejected.length === 0, checked, rejected, allowedCount: allowed.size };
}

function buildPrompt(question, deterministic, tier) {
  const facts = JSON.stringify({ answer: deterministic.answer, chart: deterministic.chart || null, intent: deterministic.intent || null }).slice(0, 6000);
  return [
    'You rewrite a police crime-analytics answer for an officer. Use ONLY the numbers present in FACTS; never add, round or estimate a number.',
    `Audience tier: ${tier || 'district'} (beat = one short plain sentence; station = two sentences; district/state = up to three sentences with the comparison).`,
    'Do not mention caste or religion. Do not say the model predicts a crime; say "expects" or "flags for review".',
    `QUESTION: ${question}`,
    `FACTS: ${facts}`,
    'Reply with the reworded answer only.'
  ].join('\n');
}

/**
 * deps = { flags, fetchImpl? }. `deterministic` is the copilot's own result
 * ({answer, chart?, zcql?, intent, engine}). Returns
 * { answer, engine, firewall, llmAnswer?, deterministicAnswer, source }.
 */
async function composeAnswer(question, deterministic, deps, opts) {
  const d = deps || {};
  const o = opts || {};
  const url = String(process.env.QUICKML_LLM_URL || '').trim();
  const base = { deterministicAnswer: deterministic.answer, chart: deterministic.chart, zcql: deterministic.zcql, intent: deterministic.intent };
  if (!(d.flags && d.flags.quickmlLlm)) {
    return Object.assign(base, { answer: deterministic.answer, engine: 'deterministic', firewall: { passed: true, checked: 0, rejected: [], mode: 'not-invoked' }, source: 'fallback-local', note: 'FEATURE_QUICKML_LLM off' });
  }
  if (!url) {
    return Object.assign(base, { answer: deterministic.answer, engine: 'deterministic', firewall: { passed: true, checked: 0, rejected: [], mode: 'not-invoked' }, source: 'fallback-local', note: 'QUICKML_LLM_URL unset (deploy an LLM Serving endpoint in the QuickML console)' });
  }
  try {
    const doFetch = d.fetchImpl || fetch;
    const resp = await withTimeout(doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Zoho-oauthtoken ${process.env.QUICKML_API_KEY || ''}` },
      body: JSON.stringify({ question: buildPrompt(question, deterministic, o.tier), max_tokens: 400 })
    }), AI_TIMEOUT_MS, 'quickml llm compose');
    if (!resp || !resp.ok) throw new Error(`llm http ${resp && resp.status}`);
    const json = await resp.json();
    const inner = (json && (json.data || json)) || {};
    const text = String(inner.answer || inner.response || inner.text || inner.output || '').trim();
    if (!text) throw new Error('empty LLM answer');
    const fw = firewall(text, { answer: deterministic.answer, chart: deterministic.chart || null }, o.allowedNumbers);
    if (fw.passed) {
      return Object.assign(base, { answer: text, engine: 'quickml-llm', llmAnswer: text, firewall: Object.assign({ mode: 'checked' }, fw), source: 'quickml-llm' });
    }
    return Object.assign(base, { answer: deterministic.answer, engine: 'deterministic', llmAnswer: text, firewall: Object.assign({ mode: 'rejected' }, fw), source: 'fallback-local', note: 'LLM answer carried a number absent from the executed facts; deterministic sentence served' });
  } catch (e) {
    return Object.assign(base, { answer: deterministic.answer, engine: 'deterministic', firewall: { passed: true, checked: 0, rejected: [], mode: 'not-invoked' }, source: 'fallback-local', note: `LLM call failed (${String((e && e.message) || e).slice(0, 160)})` });
  }
}

module.exports = { composeAnswer, firewall, collectNumbers, canonTyped, buildPrompt, PROSE_MAX };
