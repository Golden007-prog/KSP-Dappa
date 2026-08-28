'use strict';
// Action loop + audit trail (Round 2, Phase 7).
//
// DAPPA never tells an officer what to do; it shows what it found and how
// sure it is. This module records what the officer DECIDED about an alert
// (acknowledge / assign / escalate / dismiss / note / outcome) and turns those
// records into the honest evaluation nobody publishes for predictive policing:
// how many alerts were looked at, how fast, and how many turned out real.
//
// Storage
//   Real path : ActionLog Data Store table (AlertKey, ActionType, Actor,
//               ActorRole, Unit, Note, OutcomeLabel, Payload, ClientTs) written
//               through zcatalyst-sdk-node datastore().table().insertRow when
//               the function runs on Catalyst; reads go through ZCQL like every
//               other table so the PUBLIC_DEMO fixture fallback covers them.
//   Fallback  : a per-container memory store (tests, local runs, or a deployed
//               function whose table does not exist yet). Reads always merge
//               the ZCQL/fixture rows with the memory rows, so a demo write is
//               visible on the next read whichever path answered.
//   meta.storage names the path that took the write: 'datastore' | 'memory'.
//
// Nothing is ever deleted — dismiss is a state, not a removal — and every row
// carries an idempotency key over (subject, action, actor, clientTs) so a
// retried POST cannot double-count a decision.

const crypto = require('crypto');
const { toNum, round, parseJsonSafe } = require('./util');

const TABLE = 'ActionLog';
const COLUMNS = ['ROWID', 'CREATEDTIME', 'AlertKey', 'ActionType', 'Actor', 'ActorRole', 'Unit', 'Note', 'OutcomeLabel', 'Payload', 'ClientTs'];

const SUBJECT_TYPES = ['alert', 'case', 'alias', 'face', 'ingest'];
const ACTION_TYPES = ['acknowledge', 'assign', 'escalate', 'dismiss', 'note', 'outcome'];
const OUTCOME_LABELS = ['true_positive', 'false_alarm', 'already_known', 'actioned', 'no_action_needed'];
const DISMISS_REASONS = ['duplicate', 'known_cause', 'data_error', 'seasonal', 'other'];
const TIERS = ['beat', 'station', 'district', 'state'];
const ROLE_VALUES = TIERS.concat(['admin', 'viewer']);
const NEXT_TIER = { beat: 'station', station: 'district', district: 'state', state: 'state' };

// Triage SLA by stored severity band — the same hours the client's sla.js
// applies to critical / high / medium / low (analytics.py bands 3 / 2 / 1 / 0).
const SLA_HOURS = { 3: 4, 2: 12, 1: 24, 0: 48 };
const SEV_WORD = { 3: 'critical', 2: 'high', 1: 'medium', 0: 'low' };
const TTA_BUCKETS = [
  { key: 'under1h', maxHours: 1 },
  { key: '1to4h', maxHours: 4 },
  { key: '4to12h', maxHours: 12 },
  { key: '12to24h', maxHours: 24 },
  { key: '1to3d', maxHours: 72 },
  { key: 'over3d', maxHours: Infinity }
];
// What an offline retrain of the anomaly thresholds would need before the
// labels mean anything: enough of each class to estimate a rate. There is no
// online learning anywhere in DAPPA — a retrain is pipeline/analytics.py run
// by a person, with these labels as its evaluation set.
const RETRAIN_MIN_PER_CLASS = 30;
const RETRAIN_MIN_TOTAL = 100;

const NOTE_MAX = 500;
const ACTOR_MAX = 128;
const UNIT_MAX = 64;
const KEY_MAX = 64;
const KEY_RE = /^[\w.-]+$/;
const IST_OFFSET_MS = 330 * 60000;

// ---------------------------------------------------------------------------
// time helpers — Data Store datetimes are IST wall-clock strings
// ---------------------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, '0'); }

/** Date → 'YYYY-MM-DD HH:MM:SS' in IST (the Data Store column format). */
function toDsDatetime(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** 'YYYY-MM-DD HH:MM:SS' (IST) | 'YYYY-MM-DD' | ISO with zone → ms epoch, or null. */
function parseTs(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (bare) {
    const ms = Date.UTC(+bare[1], +bare[2] - 1, +bare[3], +(bare[4] || 0), +(bare[5] || 0), +(bare[6] || 0));
    return ms - IST_OFFSET_MS;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function isoOf(ms) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// subject keys: alerts are stored bare ('A0001'); other subjects carry their
// type as a prefix ('case:123') so one AlertKey column serves every subject
// and ZCQL LIKE can still narrow by type.
// ---------------------------------------------------------------------------

function storedKey(subjectType, subjectKey) {
  return subjectType === 'alert' ? String(subjectKey) : `${subjectType}:${subjectKey}`;
}

function parseStoredKey(key) {
  const s = String(key || '');
  const m = s.match(/^([a-z]+):(.+)$/);
  if (m && SUBJECT_TYPES.includes(m[1]) && m[1] !== 'alert') return { subjectType: m[1], subjectKey: m[2] };
  return { subjectType: 'alert', subjectKey: s };
}

function idemKey(alertKey, actionType, actor, clientTsDs) {
  return crypto.createHash('sha1').update(`${alertKey}|${actionType}|${actor}|${clientTsDs}`).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

function clip(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

const LOOSE_KEY_RE = /^[\w.:-]{1,63}$/;
const LOOSE_ACTION_RE = /^[A-Za-z][\w-]{0,31}$/;
const OTHER_NOTE_MAX = 2000;

/**
 * Validate and normalise one action request. Returns { ok:true, row, idem }
 * or { ok:false, code, message }. `row` is the ActionLog column set.
 *
 * Alerts get the strict vocabulary (the enums above, dismiss needs a reason,
 * outcome needs a label). The other subjects — case / alias / face / ingest
 * — are audit rows written by their own modules (OCR attach, ingest batches,
 * face decisions): any `[A-Za-z][\w-]{0,31}` action type and a free ≤ 32-char
 * OutcomeLabel are accepted so their vocabularies do not have to be mirrored
 * here, and the outcome analytics still count a face 'outcome' by label.
 */
function validateAction(input, identity) {
  const b = input || {};
  const id = identity || {};
  const subjectType = String(b.subjectType || 'alert').toLowerCase();
  if (!SUBJECT_TYPES.includes(subjectType)) return { ok: false, code: 'BAD_SUBJECT_TYPE', message: `subjectType must be one of ${SUBJECT_TYPES.join(', ')}.` };
  const isAlert = subjectType === 'alert';
  const subjectKey = clip(b.subjectKey, KEY_MAX);
  if (!subjectKey || !(isAlert ? KEY_RE : LOOSE_KEY_RE).test(subjectKey)) return { ok: false, code: 'BAD_ID', message: 'Invalid subject key.' };
  const alertKey = storedKey(subjectType, subjectKey);
  if (alertKey.length > KEY_MAX) return { ok: false, code: 'BAD_ID', message: 'Subject key too long.' };

  const rawType = String(b.actionType || '').trim();
  const actionType = isAlert ? rawType.toLowerCase() : rawType;
  if (isAlert && !ACTION_TYPES.includes(actionType)) return { ok: false, code: 'BAD_ACTION_TYPE', message: `actionType must be one of ${ACTION_TYPES.join(', ')}.` };
  if (!isAlert && !LOOSE_ACTION_RE.test(actionType)) return { ok: false, code: 'BAD_ACTION_TYPE', message: 'actionType must be a short word ([A-Za-z][\\w-]{0,31}).' };
  const isOutcome = actionType.toLowerCase() === 'outcome';

  let note = String(b.note === undefined || b.note === null ? '' : b.note).trim();
  if (isAlert && note.length > NOTE_MAX) return { ok: false, code: 'NOTE_TOO_LONG', message: `note must be at most ${NOTE_MAX} characters.` };
  if (!isAlert) note = note.slice(0, OTHER_NOTE_MAX);

  const given = typeof b.payload === 'string' ? parseJsonSafe(b.payload, {}) : (b.payload && typeof b.payload === 'object' ? b.payload : {});
  const payload = Object.assign({}, given || {}, { subjectType, actorSource: id.actorSource || 'server' });
  let outcomeLabel = '';
  if (isAlert && actionType === 'dismiss') {
    const reason = String(b.reason || '').toLowerCase().trim();
    if (!reason) return { ok: false, code: 'REASON_REQUIRED', message: 'dismiss requires a reason (duplicate, known_cause, data_error, seasonal, other).' };
    if (!DISMISS_REASONS.includes(reason)) return { ok: false, code: 'BAD_REASON', message: `reason must be one of ${DISMISS_REASONS.join(', ')}.` };
    if (reason === 'other' && !note) return { ok: false, code: 'REASON_REQUIRED', message: 'reason "other" needs a note saying why.' };
    payload.reason = reason;
  }
  if (isOutcome) {
    const label = String(b.outcomeLabel || '').toLowerCase().trim();
    if (!OUTCOME_LABELS.includes(label)) return { ok: false, code: 'BAD_OUTCOME', message: `outcomeLabel must be one of ${OUTCOME_LABELS.join(', ')}.` };
    outcomeLabel = label;
  } else if (b.outcomeLabel) {
    if (isAlert) return { ok: false, code: 'BAD_OUTCOME', message: 'outcomeLabel is only valid on an outcome action.' };
    outcomeLabel = clip(b.outcomeLabel, 32);
  }
  if (isAlert && actionType === 'escalate') {
    const fromTier = TIERS.includes(id.actorRole) ? id.actorRole : 'station';
    const toTier = String(b.toTier || NEXT_TIER[fromTier]).toLowerCase().trim();
    if (!TIERS.includes(toTier)) return { ok: false, code: 'BAD_TIER', message: `toTier must be one of ${TIERS.join(', ')}.` };
    payload.fromTier = fromTier;
    payload.toTier = toTier;
  }
  if (isAlert && actionType === 'assign') {
    const assignTo = clip(b.assignTo, UNIT_MAX);
    if (!assignTo) return { ok: false, code: 'ASSIGNEE_REQUIRED', message: 'assign requires assignTo (a unit or officer).' };
    payload.assignTo = assignTo;
  }
  if (isAlert && actionType === 'note' && !note) return { ok: false, code: 'NOTE_REQUIRED', message: 'note requires a note.' };

  let clientMs = Date.now();
  if (b.clientTs !== undefined && b.clientTs !== null && b.clientTs !== '') {
    clientMs = parseTs(b.clientTs);
    if (clientMs === null) return { ok: false, code: 'BAD_CLIENT_TS', message: 'clientTs must be an ISO date-time.' };
  }
  const clientTs = toDsDatetime(new Date(clientMs));
  if (b.severity !== undefined && b.severity !== null) payload.severity = toNum(b.severity, null);
  if (b.source) payload.source = clip(b.source, 32);

  const row = {
    AlertKey: alertKey,
    ActionType: actionType,
    Actor: clip(id.actor, ACTOR_MAX) || 'anonymous',
    ActorRole: clip(id.actorRole, 32) || 'viewer',
    Unit: clip(b.unit, UNIT_MAX),
    Note: note || (payload.reason ? payload.reason : ''),
    OutcomeLabel: outcomeLabel,
    Payload: '',
    ClientTs: clientTs
  };
  payload.idem = idemKey(row.AlertKey, row.ActionType, row.Actor, row.ClientTs);
  row.Payload = JSON.stringify(payload);
  return { ok: true, row, idem: payload.idem };
}

/** A raw ActionLog column row (as the OCR / face / ingest modules build one) → input shape. */
function inputFromRow(r) {
  const { subjectType, subjectKey } = parseStoredKey(r.AlertKey);
  return {
    subjectType,
    subjectKey,
    actionType: r.ActionType,
    actor: r.Actor,
    actorRole: r.ActorRole,
    unit: r.Unit,
    note: r.Note,
    outcomeLabel: r.OutcomeLabel,
    payload: r.Payload,
    clientTs: r.ClientTs
  };
}

// ---------------------------------------------------------------------------
// normalised action shape (what every endpoint returns)
// ---------------------------------------------------------------------------

function normalizeRow(r, source) {
  const payload = parseJsonSafe(r.Payload, {}) || {};
  const { subjectType, subjectKey } = parseStoredKey(r.AlertKey);
  const clientMs = parseTs(r.ClientTs);
  const createdMs = parseTs(r.CREATEDTIME) || clientMs;
  const idem = payload.idem || idemKey(String(r.AlertKey), String(r.ActionType), String(r.Actor), String(r.ClientTs));
  return {
    actionId: idem,
    rowId: r.ROWID === undefined || r.ROWID === null ? null : String(r.ROWID),
    subjectType,
    subjectKey,
    alertKey: subjectType === 'alert' ? subjectKey : null,
    actionType: String(r.ActionType || ''),
    actor: r.Actor === undefined || r.Actor === null ? '' : String(r.Actor),
    actorRole: r.ActorRole === undefined || r.ActorRole === null ? '' : String(r.ActorRole),
    unit: r.Unit === undefined || r.Unit === null ? '' : String(r.Unit),
    note: r.Note === undefined || r.Note === null ? '' : String(r.Note),
    outcomeLabel: r.OutcomeLabel ? String(r.OutcomeLabel) : null,
    reason: payload.reason || null,
    assignTo: payload.assignTo || null,
    toTier: payload.toTier || null,
    fromTier: payload.fromTier || null,
    clientTs: isoOf(clientMs),
    createdTime: isoOf(createdMs),
    ts: clientMs,
    seeded: payload.source === 'fixture',
    actorSource: payload.actorSource || null,
    source
  };
}

// ---------------------------------------------------------------------------
// memory store (per container)
// ---------------------------------------------------------------------------

const memory = new Map(); // idem -> raw row

function resetMemory() { memory.clear(); }

function memoryRows() { return [...memory.values()]; }

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

async function readRows(ctx, opts) {
  const o = opts || {};
  const where = [];
  if (o.alertKey) where.push({ col: 'AlertKey', op: '=', val: o.alertKey });
  if (o.unit) where.push({ col: 'Unit', op: '=', val: o.unit });
  if (o.sinceDs) where.push({ col: 'ClientTs', op: '>=', val: o.sinceDs });
  if (o.subjectType && o.subjectType !== 'alert') where.push({ col: 'AlertKey', op: 'like', val: `${o.subjectType}:` });
  let rows = [];
  let source = 'datastore';
  // Lazy require: fixture.js seeds its ActionLog table from this module, so a
  // top-level require would be circular. PUBLIC_DEMO answers a failed ZCQL
  // read from the fixture silently; the fallback counter is the only way to
  // report that honestly as 'fixture' rather than 'datastore'.
  const { getFallbackState } = require('./fixture');
  const before = getFallbackState().queries;
  try {
    rows = await ctx.ds.queryAll({
      table: TABLE, columns: COLUMNS, where,
      orderBy: { col: 'ClientTs', desc: true }
    }, { maxRows: o.maxRows || 3000 });
    if (getFallbackState().queries > before) source = 'fixture';
  } catch (e) {
    rows = [];
    source = 'unavailable';
  }
  return { rows, source };
}

function matchesFilter(row, o) {
  if (o.alertKey && String(row.AlertKey) !== o.alertKey) return false;
  if (o.unit && String(row.Unit || '') !== o.unit) return false;
  if (o.sinceDs && String(row.ClientTs) < o.sinceDs) return false;
  if (o.subjectType) {
    const t = parseStoredKey(row.AlertKey).subjectType;
    if (t !== o.subjectType) return false;
  }
  return true;
}

/**
 * List actions, newest first. Merges the Data Store (or fixture-fallback)
 * rows with the container's memory rows, deduped on the idempotency key.
 */
async function listActions(ctx, opts) {
  const o = opts || {};
  const { rows, source } = await readRows(ctx, o);
  const seen = new Map();
  for (const r of rows) {
    if (!matchesFilter(r, o)) continue;
    const n = normalizeRow(r, source);
    seen.set(n.actionId, n);
  }
  for (const r of memoryRows()) {
    if (!matchesFilter(r, o)) continue;
    const n = normalizeRow(r, 'memory');
    if (!seen.has(n.actionId)) seen.set(n.actionId, n);
  }
  const out = [...seen.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const storage = source === 'datastore' ? 'datastore' : source === 'fixture' ? 'fixture' : 'memory';
  return { actions: o.limit ? out.slice(0, o.limit) : out, storage, memoryRows: memory.size };
}

/** meta.source word for a read: the engine that actually answered. */
function sourceOf(storage) {
  return storage === 'datastore' ? 'datastore' : storage === 'fixture' ? 'fixture' : 'local';
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

function catalystApp(req) {
  try {
    return require('zcatalyst-sdk-node').initialize(req);
  } catch (e) {
    return null;
  }
}

const isReq = (x) => Boolean(x && typeof x === 'object' && (x.headers !== undefined || x.method !== undefined));
const isRawRow = (x) => Boolean(x && typeof x === 'object' && (x.AlertKey !== undefined || x.ActionType !== undefined));

/**
 * Record one action.
 *   recordAction(ctx, req, input, identity)   — the route form; identity =
 *                                               { actor, actorRole, actorSource }
 *   recordAction(ctx, req, input)             — identity taken from input.actor / actorRole
 *   recordAction(ctx, rawRow, req)            — a raw ActionLog column row
 * Returns { ok, action, storage, source, duplicate, fallbackReason } or
 * { ok:false, code, message } when validation fails.
 */
async function recordAction(ctx, a2, a3, a4) {
  let req = null;
  let input = null;
  let identity = null;
  if (isReq(a2)) {
    req = a2; input = a3; identity = a4 || null;
  } else {
    input = a2;
    if (isReq(a3)) { req = a3; identity = a4 || null; } else { identity = a3 || null; req = isReq(a4) ? a4 : null; }
  }
  if (isRawRow(input)) input = inputFromRow(input);
  const b = input || {};
  if (!identity) identity = { actor: b.actor, actorRole: b.actorRole, actorSource: b.actorSource || 'server' };
  const v = validateAction(b, identity);
  if (!v.ok) return v;
  const row = v.row;
  if (memory.has(v.idem)) {
    return { ok: true, action: normalizeRow(memory.get(v.idem), 'memory'), storage: 'memory', source: 'local', duplicate: true };
  }
  const capp = ctx.services && ctx.services.actionWriter ? null : (req ? catalystApp(req) : null);
  const writer = (ctx.services && ctx.services.actionWriter) || (capp ? {
    insert: async (r) => capp.datastore().table(TABLE).insertRow(r)
  } : null);
  if (writer) {
    try {
      const existing = await ctx.ds.query({
        table: TABLE, columns: COLUMNS,
        where: [
          { col: 'AlertKey', op: '=', val: row.AlertKey },
          { col: 'ActionType', op: '=', val: row.ActionType },
          { col: 'Actor', op: '=', val: row.Actor },
          { col: 'ClientTs', op: '=', val: row.ClientTs }
        ],
        limit: { count: 1 }
      }).catch(() => []);
      if (existing.length && existing[0].ROWID !== undefined) {
        return { ok: true, action: normalizeRow(existing[0], 'datastore'), storage: 'datastore', source: 'datastore', duplicate: true };
      }
      const inserted = await writer.insert(row);
      const stored = Object.assign({}, row, inserted && typeof inserted === 'object' ? inserted : {});
      return { ok: true, action: normalizeRow(stored, 'datastore'), storage: 'datastore', source: 'datastore', duplicate: false };
    } catch (e) {
      memory.set(v.idem, row);
      return {
        ok: true, action: normalizeRow(row, 'memory'), storage: 'memory', source: 'local', duplicate: false,
        fallbackReason: String((e && e.message) || e).slice(0, 200)
      };
    }
  }
  memory.set(v.idem, row);
  return { ok: true, action: normalizeRow(row, 'memory'), storage: 'memory', source: 'local', duplicate: false, fallbackReason: 'catalyst datastore unavailable in this runtime' };
}

// ---------------------------------------------------------------------------
// outcome analytics (pure)
// ---------------------------------------------------------------------------

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Wilson score interval for k of n at 95 %. */
function wilson(k, n, z) {
  if (!n) return { lo: null, hi: null };
  const zz = z || 1.96;
  const p = k / n;
  const denom = 1 + (zz * zz) / n;
  const centre = (p + (zz * zz) / (2 * n)) / denom;
  const half = (zz * Math.sqrt((p * (1 - p)) / n + (zz * zz) / (4 * n * n))) / denom;
  return { lo: round(Math.max(0, centre - half), 3), hi: round(Math.min(1, centre + half), 3) };
}

function sevBand(v) {
  const n = toNum(v, 0);
  return n >= 3 ? 3 : n >= 1 ? Math.floor(n) : 0;
}

function bucketOfHours(h) {
  for (const b of TTA_BUCKETS) if (h < b.maxHours) return b.key;
  return 'over3d';
}

function emptyGroup(label, extra) {
  return Object.assign({
    label,
    alerts: 0,
    acknowledged: 0,
    assigned: 0,
    escalated: 0,
    dismissed: 0,
    noted: 0,
    untouched: 0,
    open: 0,
    stale: 0,
    medianTimeToAckHours: null,
    labelled: 0,
    truePositive: 0,
    precision: null,
    precisionInterval: { lo: null, hi: null },
    outcomes: Object.fromEntries(OUTCOME_LABELS.map((k) => [k, 0]))
  }, extra || {});
}

function finishGroup(g, ttas) {
  g.medianTimeToAckHours = ttas.length ? round(median(ttas), 1) : null;
  g.precision = g.labelled ? round(g.truePositive / g.labelled, 3) : null;
  g.precisionInterval = wilson(g.truePositive, g.labelled);
  return g;
}

/**
 * @param {Array} alerts  normalised alerts {alertId, createdMs, severity, crimeHeadId, headName, districtId, districtName, unitId, status, zScore}
 * @param {Array} actions normalised actions (listActions shape)
 * @param {object} opts   {now, windowDays|null}
 */
function computeOutcomes(alerts, actions, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const cutoff = o.windowDays ? now - o.windowDays * 86400000 : null;
  const inWindow = alerts.filter((a) => a.createdMs !== null && (cutoff === null || a.createdMs >= cutoff));
  const byAlert = new Map();
  const bySubject = {};
  for (const x of actions) {
    if (x.subjectType !== 'alert' || !x.alertKey) {
      const t = x.subjectType || 'unknown';
      if (!bySubject[t]) bySubject[t] = { actions: 0, outcomes: {} };
      bySubject[t].actions += 1;
      if (x.outcomeLabel) bySubject[t].outcomes[x.outcomeLabel] = (bySubject[t].outcomes[x.outcomeLabel] || 0) + 1;
      continue;
    }
    if (!byAlert.has(x.alertKey)) byAlert.set(x.alertKey, []);
    byAlert.get(x.alertKey).push(x);
  }
  const overall = emptyGroup('all');
  const bySeverity = {};
  const byHead = {};
  const dismissReasons = Object.fromEntries(DISMISS_REASONS.map((k) => [k, 0]));
  const ttaBuckets = Object.fromEntries(TTA_BUCKETS.map((b) => [b.key, 0]));
  const ttaAll = [];
  const ttaBySev = {};
  const ttaByHead = {};
  const untouched = [];
  let actionsInWindow = 0;
  const actionsByType = Object.fromEntries(ACTION_TYPES.map((k) => [k, 0]));

  for (const a of inWindow) {
    const sev = sevBand(a.severity);
    const sevKey = SEV_WORD[sev];
    const headKey = String(a.crimeHeadId === null || a.crimeHeadId === undefined ? 'unknown' : a.crimeHeadId);
    if (!bySeverity[sevKey]) { bySeverity[sevKey] = emptyGroup(sevKey, { severity: sev }); ttaBySev[sevKey] = []; }
    if (!byHead[headKey]) { byHead[headKey] = emptyGroup(a.headName || headKey, { crimeHeadId: a.crimeHeadId }); ttaByHead[headKey] = []; }
    const groups = [overall, bySeverity[sevKey], byHead[headKey]];
    const acts = (byAlert.get(a.alertId) || []).slice().sort((x, y) => (x.ts || 0) - (y.ts || 0));
    const has = (t) => acts.some((x) => x.actionType === t);
    const firstAck = acts.find((x) => x.actionType === 'acknowledge');
    const outcomesFor = acts.filter((x) => x.actionType === 'outcome' && x.outcomeLabel);
    const latestOutcome = outcomesFor.length ? outcomesFor[outcomesFor.length - 1].outcomeLabel : null;
    const isOpen = String(a.status || '').toUpperCase() === 'OPEN';
    const slaHours = SLA_HOURS[sev];
    const touched = acts.length > 0;
    const ageHours = (now - a.createdMs) / 3600000;
    const stale = isOpen && !has('acknowledge') && !has('dismiss') && ageHours > slaHours;
    for (const x of acts) { actionsInWindow += 1; actionsByType[x.actionType] = (actionsByType[x.actionType] || 0) + 1; if (x.reason) dismissReasons[x.reason] = (dismissReasons[x.reason] || 0) + 1; }
    let tta = null;
    if (firstAck && firstAck.ts !== null) {
      tta = Math.max(0, (firstAck.ts - a.createdMs) / 3600000);
      ttaAll.push(tta); ttaBySev[sevKey].push(tta); ttaByHead[headKey].push(tta);
      ttaBuckets[bucketOfHours(tta)] += 1;
    }
    for (const g of groups) {
      g.alerts += 1;
      if (has('acknowledge')) g.acknowledged += 1;
      if (has('assign')) g.assigned += 1;
      if (has('escalate')) g.escalated += 1;
      if (has('dismiss')) g.dismissed += 1;
      if (has('note')) g.noted += 1;
      if (!touched) g.untouched += 1;
      if (isOpen) g.open += 1;
      if (stale) g.stale += 1;
      if (latestOutcome) {
        g.labelled += 1;
        g.outcomes[latestOutcome] = (g.outcomes[latestOutcome] || 0) + 1;
        if (latestOutcome === 'true_positive') g.truePositive += 1;
      }
    }
    if (isOpen && !touched) {
      untouched.push({
        alertId: a.alertId, severity: a.severity, severityWord: sevKey, headName: a.headName || null,
        districtId: a.districtId, districtName: a.districtName || null, unitId: a.unitId || null,
        zScore: a.zScore, createdAt: isoOf(a.createdMs), ageHours: round(ageHours, 1), slaHours, pastSla: ageHours > slaHours
      });
    }
  }
  finishGroup(overall, ttaAll);
  for (const k of Object.keys(bySeverity)) finishGroup(bySeverity[k], ttaBySev[k]);
  for (const k of Object.keys(byHead)) finishGroup(byHead[k], ttaByHead[k]);
  untouched.sort((x, y) => sevBand(y.severity) - sevBand(x.severity) || (parseTs(x.createdAt) || 0) - (parseTs(y.createdAt) || 0));

  const byClass = Object.fromEntries(OUTCOME_LABELS.map((k) => [k, overall.outcomes[k] || 0]));
  const shortfall = {};
  for (const k of OUTCOME_LABELS) shortfall[k] = Math.max(0, RETRAIN_MIN_PER_CLASS - byClass[k]);
  const labels = {
    labelled: overall.labelled,
    byClass,
    minimumPerClass: RETRAIN_MIN_PER_CLASS,
    minimumTotal: RETRAIN_MIN_TOTAL,
    shortfall,
    enoughToEvaluate: overall.labelled >= RETRAIN_MIN_TOTAL && OUTCOME_LABELS.every((k) => byClass[k] >= RETRAIN_MIN_PER_CLASS),
    onlineLearning: false,
    retrainPath: 'offline: pipeline/analytics.py re-run by a person with these labels as the evaluation set'
  };
  return {
    window: { days: o.windowDays || null, from: cutoff === null ? null : isoOf(cutoff), to: isoOf(now) },
    alertsInWindow: inWindow.length,
    actionsInWindow,
    actionsByType,
    overall,
    bySeverity: ['critical', 'high', 'medium', 'low'].filter((k) => bySeverity[k]).map((k) => bySeverity[k]),
    byHead: Object.values(byHead).sort((x, y) => y.alerts - x.alerts),
    timeToAck: { buckets: ttaBuckets, medianHours: overall.medianTimeToAckHours, n: ttaAll.length, bucketOrder: TTA_BUCKETS.map((b) => b.key) },
    dismissReasons,
    bySubject,
    untouched: untouched.slice(0, o.untouchedLimit || 10),
    untouchedTotal: untouched.length,
    staleTotal: overall.stale,
    slaHours: SLA_HOURS,
    labels
  };
}

// ---------------------------------------------------------------------------
// alerts for the analytics (one paged read, cached briefly by the route)
// ---------------------------------------------------------------------------

const ALERT_COLUMNS = ['AlertID', 'DistrictID', 'UnitID', 'CrimeHeadID', 'PeriodStart', 'PeriodEnd', 'ZScore', 'Severity', 'Status', 'Narrative', 'CreatedAt'];

async function readAlerts(ctx, lk) {
  const rows = await ctx.ds.queryAll({
    table: 'AnomalyAlert', columns: ALERT_COLUMNS, orderBy: { col: 'AlertID' }
  }, { maxRows: 2000 });
  return rows.map((r) => {
    const createdMs = parseTs(r.CreatedAt) || parseTs(r.PeriodEnd) || parseTs(r.PeriodStart);
    return {
      alertId: String(r.AlertID),
      createdMs,
      severity: toNum(r.Severity),
      crimeHeadId: r.CrimeHeadID === undefined || r.CrimeHeadID === null ? null : toNum(r.CrimeHeadID),
      headName: lk ? lk.headName(r.CrimeHeadID) : null,
      districtId: r.DistrictID === undefined || r.DistrictID === null ? null : String(r.DistrictID),
      districtName: lk ? lk.districtName(r.DistrictID) : null,
      unitId: r.UnitID === undefined || r.UnitID === null ? null : String(r.UnitID),
      status: r.Status,
      zScore: round(toNum(r.ZScore), 2),
      narrative: r.Narrative || null,
      periodStart: r.PeriodStart || null,
      periodEnd: r.PeriodEnd || null
    };
  });
}

function windowDaysOf(window) {
  const w = String(window || 'all').toLowerCase();
  if (w === 'all' || w === '') return null;
  const m = w.match(/^(?:last)?(\d+)(?:d)?$/);
  return m ? Math.max(1, Math.min(3650, Number(m[1]))) : null;
}

// ---------------------------------------------------------------------------
// deterministic demo seed — 40 actions on the oldest alerts, one template per
// alert in order, Source=fixture in every Payload. Shared by lib/fixture.js
// (the contract suite + PUBLIC_DEMO fallback) and scripts/seed_actionlog.mjs
// (the CSV the lead imports into the live table).
// ---------------------------------------------------------------------------

const SEED_TEMPLATES = [
  ['acknowledge', 'assign', 'note', 'outcome:true_positive'],
  ['acknowledge', 'dismiss:duplicate'],
  ['escalate', 'acknowledge', 'outcome:false_alarm'],
  ['acknowledge', 'note', 'outcome:actioned'],
  ['acknowledge', 'assign', 'escalate', 'note', 'outcome:already_known'],
  ['acknowledge', 'dismiss:seasonal'],
  ['acknowledge', 'outcome:no_action_needed'],
  ['acknowledge', 'assign', 'outcome:true_positive']
];
// Hours from the alert's CreatedAt to its first action, cycling by alert index
// so the time-to-acknowledge distribution has spread instead of one spike.
const SEED_FIRST_ACTION_HOURS = [1, 3, 6, 12, 26, 2, 50, 5, 9, 0.5, 30, 4, 8];
const SEED_ACTORS = { acknowledge: 'seed:sho-demo', assign: 'seed:sho-demo', escalate: 'seed:sho-demo', dismiss: 'seed:sho-demo', note: 'seed:io-demo', outcome: 'seed:sdpo-demo' };
const SEED_ROLES = { 'seed:sho-demo': 'station', 'seed:io-demo': 'station', 'seed:sdpo-demo': 'district' };
const SEED_NOTES = {
  note: 'Beat staff briefed; night patrol re-routed for the week (seed).',
  assign: 'Assigned to the affected station for verification (seed).',
  escalate: 'Escalated for the district review meeting (seed).',
  outcome: 'Outcome recorded after the weekly review (seed).'
};

/**
 * @param {Array} alertRows raw AnomalyAlert rows (AlertID, CreatedAt|PeriodEnd, Severity, UnitID, DistrictID)
 * @param {object} [opts] {count=40, seedTag='seed_actionlog v1'}
 * @returns {Array} raw ActionLog rows (column names), oldest alert first
 */
function seedActions(alertRows, opts) {
  const o = opts || {};
  const count = o.count || 40;
  const alerts = (alertRows || [])
    .map((r) => ({ r, ms: parseTs(r.CreatedAt) || parseTs(r.PeriodEnd) || parseTs(r.PeriodStart) }))
    .filter((x) => x.ms !== null)
    .sort((a, b) => a.ms - b.ms || String(a.r.AlertID).localeCompare(String(b.r.AlertID)));
  const out = [];
  if (!alerts.length) return out;
  for (let t = 0; out.length < count; t += 1) {
    const { r, ms } = alerts[t % alerts.length];
    const round_ = Math.floor(t / alerts.length);
    const steps = SEED_TEMPLATES[t % SEED_TEMPLATES.length];
    const baseHours = SEED_FIRST_ACTION_HOURS[t % SEED_FIRST_ACTION_HOURS.length] + round_ * 72;
    for (let s = 0; s < steps.length && out.length < count; s += 1) {
      const [actionType, arg] = steps[s].split(':');
      const ts = new Date(ms + (baseHours + s * 0.5) * 3600000);
      const actor = SEED_ACTORS[actionType];
      const payload = { subjectType: 'alert', source: 'fixture', seed: o.seedTag || 'seed_actionlog v1', template: t % SEED_TEMPLATES.length, step: s, actorSource: 'fixture' };
      let note = SEED_NOTES[actionType] || '';
      if (actionType === 'dismiss') { payload.reason = arg; note = arg; }
      if (actionType === 'assign') payload.assignTo = String(r.UnitID || r.DistrictID || '');
      if (actionType === 'escalate') { payload.fromTier = 'station'; payload.toTier = 'district'; }
      const row = {
        AlertKey: String(r.AlertID),
        ActionType: actionType,
        Actor: actor,
        ActorRole: SEED_ROLES[actor],
        Unit: String(r.UnitID || r.DistrictID || ''),
        Note: note,
        OutcomeLabel: actionType === 'outcome' ? arg : '',
        Payload: '',
        ClientTs: toDsDatetime(ts)
      };
      payload.idem = idemKey(row.AlertKey, row.ActionType, row.Actor, row.ClientTs);
      row.Payload = JSON.stringify(payload);
      out.push(row);
    }
    if (t > count * 4) break; // cannot happen with a non-empty alert list; guards a pathological input
  }
  return out;
}

module.exports = {
  TABLE,
  COLUMNS,
  SUBJECT_TYPES,
  ACTION_TYPES,
  OUTCOME_LABELS,
  DISMISS_REASONS,
  TIERS,
  ROLE_VALUES,
  NEXT_TIER,
  SLA_HOURS,
  SEV_WORD,
  TTA_BUCKETS,
  RETRAIN_MIN_PER_CLASS,
  RETRAIN_MIN_TOTAL,
  NOTE_MAX,
  KEY_RE,
  SEED_TEMPLATES,
  toDsDatetime,
  parseTs,
  storedKey,
  parseStoredKey,
  idemKey,
  validateAction,
  inputFromRow,
  normalizeRow,
  resetMemory,
  memoryRows,
  listActions,
  sourceOf,
  recordAction,
  wilson,
  median,
  computeOutcomes,
  readAlerts,
  windowDaysOf,
  seedActions
};
