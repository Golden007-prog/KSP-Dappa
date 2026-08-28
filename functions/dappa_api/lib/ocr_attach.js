'use strict';
// "Attach OCR result to case" — an AUDIT ROW ONLY. The recovered text, its
// confidence and the MO tags are written to ActionLog (never to CaseMaster:
// an OCR pass is evidence of a scan, not a change to the FIR of record).
//
// ActionLog columns (console-created 28 Aug 2026): AlertKey varchar 64,
// ActionType varchar 32, Actor varchar 128, ActorRole varchar 32,
// Unit varchar 64, Note text, OutcomeLabel varchar 32, Payload text,
// ClientTs datetime.
//
// The row speaks phase 7's vocabulary (lib/actionlog.js): subject key
// 'case:<id>', ActionType 'note', Note <= 500 chars, so the case timeline
// lists an OCR attach like any other officer note. phase 7's recordAction()
// is NOT called because its validator builds the Payload itself and would
// drop the recovered text; the Payload here is {kind:'ocr', text, confidence,
// moTags, ...} and reads filter on that kind.
//
// Write path : require('zcatalyst-sdk-node').initialize(req).datastore()
//              .table('ActionLog').insertRows([row]) — the same SDK write the
//              bulk loader uses; null when running locally.
// Fallback   : a bounded in-process + cache list (v1:actionlog:ocr) so the
//              flow completes off-Catalyst and the row can be read back.

const { logJson, parseJsonSafe } = require('./util');

const RECENT_KEY = 'v1:actionlog:ocr';
const RECENT_TTL_SEC = 24 * 3600;
const RECENT_MAX = 50;
const MAX_TEXT = 4000;
const NOTE_MAX = 500;
const IST_OFFSET_MS = 330 * 60000;
const recent = [];

function pad2(n) { return String(n).padStart(2, '0'); }

/** Data Store datetime: IST wall-clock 'YYYY-MM-DD HH:MM:SS' (as lib/actionlog.js). */
function toDsDatetime(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function buildRow(body, identity) {
  const b = body || {};
  const caseId = String(b.caseId || '').trim();
  const text = String(b.text || '').slice(0, MAX_TEXT);
  const moTags = Array.isArray(b.moTags) ? b.moTags.map(String).slice(0, 40) : [];
  const payload = {
    kind: 'ocr',
    subjectType: 'case',
    caseId,
    text,
    confidence: b.confidence === undefined || b.confidence === null ? null : Number(b.confidence),
    language: b.language ? String(b.language) : null,
    moTags,
    entities: Array.isArray(b.entities) ? b.entities.slice(0, 40) : [],
    ocrSource: b.source ? String(b.source) : null,
    moderation: b.moderation && typeof b.moderation === 'object' ? { verdict: b.moderation.verdict, source: b.moderation.source } : null,
    sampleId: b.sampleId ? String(b.sampleId) : null
  };
  const clientMs = b.clientTs && Number.isFinite(Date.parse(String(b.clientTs))) ? Date.parse(String(b.clientTs)) : Date.now();
  return {
    AlertKey: `case:${caseId}`.slice(0, 64),
    ActionType: 'note',
    Actor: String((identity && identity.user && (identity.user.email || identity.user.userId)) || 'demo-admin').slice(0, 128),
    ActorRole: String((identity && identity.role) || 'admin').slice(0, 32),
    Unit: String(b.unitId || '').slice(0, 64),
    Note: String(b.note || `OCR scan attached: ${text.slice(0, 160)}${text.length > 160 ? '…' : ''} (${moTags.length} MO tag${moTags.length === 1 ? '' : 's'})`).slice(0, NOTE_MAX),
    OutcomeLabel: '',
    Payload: JSON.stringify(payload),
    ClientTs: toDsDatetime(new Date(clientMs))
  };
}

async function attachOcr(ctx, req, body, identity) {
  const row = buildRow(body, identity);
  let capp = null;
  try { capp = require('zcatalyst-sdk-node').initialize(req); } catch (e) { capp = null; }
  if (capp) {
    try {
      const out = await capp.datastore().table('ActionLog').insertRows([row]);
      const rowid = Array.isArray(out) && out[0] && (out[0].ROWID || out[0].rowid) ? String(out[0].ROWID || out[0].rowid) : null;
      return { recorded: true, storage: 'datastore', rowid, row, source: 'catalyst-datastore' };
    } catch (e) {
      logJson('warn', 'ocr_attach_insert_failed', { message: String((e && e.message) || e) });
    }
  }
  recent.unshift(Object.assign({ ROWID: `mem-${Date.now().toString(36)}`, CREATEDTIME: toDsDatetime(new Date()) }, row));
  while (recent.length > RECENT_MAX) recent.pop();
  await ctx.cache.put(RECENT_KEY, recent.slice(0, RECENT_MAX), RECENT_TTL_SEC).catch(() => {});
  return { recorded: true, storage: 'memory', row, source: 'fallback-local', note: capp ? 'ActionLog insert failed; kept in process memory' : 'not running on Catalyst; kept in process memory' };
}

function isOcrRow(r) {
  const p = parseJsonSafe(r.Payload, null);
  return Boolean(p && p.kind === 'ocr');
}

/** Recent OCR audit rows for a case — Data Store/fixture first, memory merged. */
async function recentFor(ctx, caseId) {
  const key = `case:${String(caseId || '').trim()}`;
  let rows = [];
  let source = 'fallback-local';
  try {
    const got = await ctx.ds.query({
      table: 'ActionLog', columns: ['ROWID', 'AlertKey', 'ActionType', 'Actor', 'ActorRole', 'OutcomeLabel', 'Payload', 'ClientTs', 'CREATEDTIME'],
      where: [{ col: 'AlertKey', op: '=', val: key }, { col: 'ActionType', op: '=', val: 'note' }],
      orderBy: { col: 'CREATEDTIME', desc: true }, limit: { count: 50 }
    });
    rows = got.filter(isOcrRow);
    if (rows.length) source = 'datastore';
  } catch (e) { rows = []; }
  const cached = (await ctx.cache.get(RECENT_KEY).catch(() => undefined) || {}).value || recent;
  const seen = new Set(rows.map((r) => String(r.ROWID)));
  for (const r of cached || []) {
    if (r.AlertKey === key && !seen.has(String(r.ROWID))) { rows.push(r); seen.add(String(r.ROWID)); }
  }
  rows.sort((a, b) => String(b.CREATEDTIME || b.ClientTs).localeCompare(String(a.CREATEDTIME || a.ClientTs)));
  return { rows: rows.slice(0, 20), source };
}

/** Test hook. */
function resetRecent() {
  recent.length = 0;
}

module.exports = { attachOcr, recentFor, buildRow, toDsDatetime, resetRecent, MAX_TEXT, NOTE_MAX };
