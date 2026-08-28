// Round-2 Phase 7 — action loop + audit trail contract checks.
// Expected numbers below are computed BY HAND from the fixture seed
// (lib/actionlog.js seedActions over the four fixture alerts; the full table
// is listed in docs/round2/decisions-phase7.md) and from small hand-built
// inputs to the pure computeOutcomes() function.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const actionlog = require('../../lib/actionlog.js');

const ADMIN = { 'x-admin-token': 'demo-admin' };

export async function run(h) {
  const { get, post, check, hasKeys } = h;

  // --- pure functions ------------------------------------------------------
  {
    // Wilson 95 % for 3 of 10 is the textbook (0.108, 0.603).
    const w = actionlog.wilson(3, 10);
    check('wilson 3/10 lower bound', w.lo === 0.108, JSON.stringify(w));
    check('wilson 3/10 upper bound', w.hi === 0.603, JSON.stringify(w));
    // 1 of 1: centre (1 + 1.9208)/4.8416 = 0.6033, half 0.3967 -> (0.207, 1.0 clamped).
    const w1 = actionlog.wilson(1, 1);
    check('wilson 1/1 clamps to [0.207, 1]', w1.lo === 0.207 && w1.hi === 1, JSON.stringify(w1));
    check('wilson 0/0 is null', actionlog.wilson(0, 0).lo === null);
    check('median of even list averages the middle pair', actionlog.median([1, 3, 6.5, 12]) === 4.75);
    check('IST datetime round-trips', actionlog.parseTs('2026-08-15 08:00:00') === Date.UTC(2026, 7, 15, 2, 30, 0));
    check('toDsDatetime writes IST wall clock', actionlog.toDsDatetime(new Date(Date.UTC(2026, 7, 15, 2, 30, 0))) === '2026-08-15 08:00:00');
    check('stored key for a case subject carries the type prefix', actionlog.storedKey('case', '123') === 'case:123');
    check('alert keys are stored bare', actionlog.storedKey('alert', 'A0001') === 'A0001');
    check('parseStoredKey recovers the subject type', actionlog.parseStoredKey('face:P001').subjectType === 'face' && actionlog.parseStoredKey('A0001').subjectType === 'alert');
    check('windowDaysOf parses last90 / 30d / all', actionlog.windowDaysOf('last90') === 90 && actionlog.windowDaysOf('30d') === 30 && actionlog.windowDaysOf('all') === null);
  }

  // computeOutcomes on hand-built input: alert X (critical, open) created at T0,
  // acknowledged 2 h later and labelled true_positive; alert Y (medium, open)
  // created 10 days before T0 and never touched. now = T0 + 3 days.
  {
    const T0 = Date.UTC(2026, 7, 1, 0, 0, 0);
    const alerts = [
      { alertId: 'X', createdMs: T0, severity: 3, crimeHeadId: 3, headName: 'Property', districtId: '0101', status: 'OPEN', zScore: 4 },
      { alertId: 'Y', createdMs: T0 - 10 * 86400000, severity: 1, crimeHeadId: 5, headName: 'Cyber', districtId: '0105', status: 'OPEN', zScore: 2.2 }
    ];
    const actions = [
      { subjectType: 'alert', alertKey: 'X', actionType: 'acknowledge', ts: T0 + 2 * 3600000, outcomeLabel: null, reason: null },
      { subjectType: 'alert', alertKey: 'X', actionType: 'outcome', ts: T0 + 5 * 3600000, outcomeLabel: 'true_positive', reason: null }
    ];
    const now = T0 + 3 * 86400000;
    const all = actionlog.computeOutcomes(alerts, actions, { now, windowDays: null });
    check('outcomes(all): 2 alerts, 2 actions', all.alertsInWindow === 2 && all.actionsInWindow === 2);
    check('outcomes(all): median time-to-ack 2 h', all.overall.medianTimeToAckHours === 2, String(all.overall.medianTimeToAckHours));
    check('outcomes(all): precision 1/1 with Wilson (0.207, 1)', all.overall.precision === 1 && all.overall.precisionInterval.lo === 0.207 && all.overall.precisionInterval.hi === 1);
    check('outcomes(all): Y untouched and stale (13 d > 24 h medium SLA)', all.overall.untouched === 1 && all.overall.stale === 1 && all.untouchedTotal === 1 && all.untouched[0].alertId === 'Y' && all.untouched[0].pastSla === true);
    check('outcomes(all): X not stale (acknowledged)', all.bySeverity.find((g) => g.label === 'critical').stale === 0);
    check('outcomes(all): tta bucket 1to4h', all.timeToAck.buckets['1to4h'] === 1 && all.timeToAck.n === 1);
    check('outcomes(all): labels block says no online learning', all.labels.onlineLearning === false && all.labels.labelled === 1 && all.labels.shortfall.true_positive === 29 && all.labels.enoughToEvaluate === false);
    const week = actionlog.computeOutcomes(alerts, actions, { now, windowDays: 7 });
    check('outcomes(last7): only X inside the window', week.alertsInWindow === 1 && week.overall.untouched === 0 && week.window.days === 7);
  }

  // seedActions: deterministic, 40 rows, every row marked fixture, and on a
  // 13-alert list each of the 13 oldest alerts is used exactly once.
  {
    const fx = h.buildFixtureTables();
    const a = actionlog.seedActions(fx.AnomalyAlert, { count: 40 });
    const b = actionlog.seedActions(fx.AnomalyAlert, { count: 40 });
    // Other phases append their own audit rows (case:/face:) to the fixture table; only alert rows are ours.
    check('seed: 40 rows on the fixture alerts', a.length === 40 && fx.ActionLog.filter((r) => actionlog.parseStoredKey(r.AlertKey).subjectType === 'alert').length === 40);
    check('seed: deterministic', JSON.stringify(a) === JSON.stringify(b));
    check('seed: every Payload carries source=fixture', a.every((r) => JSON.parse(r.Payload).source === 'fixture'));
    check('seed: oldest alert first', a[0].AlertKey === 'AL-004' && a[0].ActionType === 'acknowledge');
    const many = Array.from({ length: 20 }, (_, i) => ({ AlertID: `A${String(i + 1).padStart(4, '0')}`, CreatedAt: `2025-0${1 + (i % 9)}-1${i % 10} 08:00:00`, Severity: 1 + (i % 3), UnitID: null, DistrictID: '101' }));
    const live = actionlog.seedActions(many, { count: 40 });
    const keys = new Set(live.map((r) => r.AlertKey));
    check('seed: 40 rows over exactly 13 distinct oldest alerts', live.length === 40 && keys.size === 13, `${live.length} rows / ${keys.size} alerts`);
    const perAlert = {};
    for (const r of live) perAlert[r.AlertKey] = (perAlert[r.AlertKey] || 0) + 1;
    const oldest13 = [...many].sort((x, y) => x.CreatedAt.localeCompare(y.CreatedAt)).slice(0, 13).map((x) => x.AlertID);
    check('seed: the 13 alerts are the 13 oldest', oldest13.every((k) => perAlert[k] >= 1));
  }

  // --- GET /alerts/outcomes on the fixture seed (hand-computed) --------------
  // Seed layout (oldest first: AL-004, AL-003, AL-002, AL-001; templates cycle):
  //   t0  AL-004 ack/assign/note/outcome:true_positive         (+1 h)
  //   t1  AL-003 ack/dismiss:duplicate                          (+3 h)
  //   t2  AL-002 escalate/ack/outcome:false_alarm               (+6 h, ack at +6.5 h)
  //   t3  AL-001 ack/note/outcome:actioned                      (+12 h)
  //   t4  AL-004 ack/assign/escalate/note/outcome:already_known (+72 h round)
  //   t5  AL-003 ack/dismiss:seasonal   t6 AL-002 ack/outcome:no_action_needed
  //   t7  AL-001 ack/assign/outcome:true_positive
  //   t8  AL-004 (=t0 template)  t9 AL-003 (=t1)  t10 AL-002 (=t2)  t11 AL-001 (=t3)
  //   t12 AL-004 (=t4 template, cut after 4 steps -> 40 rows)
  // Latest outcome per alert: AL-004 true_positive (t8), AL-003 none,
  // AL-002 false_alarm (t10), AL-001 actioned (t11). Labelled 3, TP 1.
  // First-ack delays: 1, 3, 6.5, 12 h -> median 4.75 -> 4.8.
  {
    const r = await get('/alerts/outcomes?window=all');
    check('GET /alerts/outcomes 200', r.status === 200 && r.json && r.json.ok === true, JSON.stringify(r.json).slice(0, 200));
    const d = (r.json && r.json.data) || {};
    check('outcomes: shape', hasKeys(d, ['window', 'alertsInWindow', 'actionsInWindow', 'actionsByType', 'overall', 'bySeverity', 'byHead', 'timeToAck', 'dismissReasons', 'untouched', 'untouchedTotal', 'staleTotal', 'labels', 'storage']));
    check('outcomes: 4 alerts, 40 actions', d.alertsInWindow === 4 && d.actionsInWindow === 40, `${d.alertsInWindow}/${d.actionsInWindow}`);
    check('outcomes: actions by type 13/5/4/3/6/9', JSON.stringify(d.actionsByType) === JSON.stringify({ acknowledge: 13, assign: 5, escalate: 4, dismiss: 3, note: 6, outcome: 9 }), JSON.stringify(d.actionsByType));
    const o = d.overall || {};
    check('outcomes: overall touched counts', o.acknowledged === 4 && o.assigned === 2 && o.escalated === 2 && o.dismissed === 1 && o.noted === 2 && o.untouched === 0, JSON.stringify(o));
    check('outcomes: 3 open, 0 stale (every open alert was acknowledged)', o.open === 3 && o.stale === 0 && d.staleTotal === 0);
    check('outcomes: median time-to-ack 4.8 h', o.medianTimeToAckHours === 4.8, String(o.medianTimeToAckHours));
    check('outcomes: precision 1 of 3 = 0.333, Wilson (0.061, 0.792)', o.labelled === 3 && o.truePositive === 1 && o.precision === 0.333 && o.precisionInterval.lo === 0.061 && o.precisionInterval.hi === 0.792, JSON.stringify(o.precisionInterval));
    check('outcomes: outcome mix', JSON.stringify(o.outcomes) === JSON.stringify({ true_positive: 1, false_alarm: 1, already_known: 0, actioned: 1, no_action_needed: 0 }), JSON.stringify(o.outcomes));
    const sev = Object.fromEntries((d.bySeverity || []).map((g) => [g.label, g]));
    check('outcomes: critical (AL-001) tta 12 h, labelled actioned', sev.critical && sev.critical.alerts === 1 && sev.critical.medianTimeToAckHours === 12 && sev.critical.outcomes.actioned === 1 && sev.critical.precision === 0);
    check('outcomes: high (AL-002) tta 6.5 h, escalated, false_alarm', sev.high && sev.high.medianTimeToAckHours === 6.5 && sev.high.escalated === 1 && sev.high.outcomes.false_alarm === 1);
    check('outcomes: medium (AL-003 + AL-004) tta median 2 h, precision 1/1', sev.medium && sev.medium.alerts === 2 && sev.medium.medianTimeToAckHours === 2 && sev.medium.dismissed === 1 && sev.medium.labelled === 1 && sev.medium.precision === 1);
    check('outcomes: tta buckets 0/2/1/1/0/0', JSON.stringify(d.timeToAck.buckets) === JSON.stringify({ under1h: 0, '1to4h': 2, '4to12h': 1, '12to24h': 1, '1to3d': 0, over3d: 0 }) && d.timeToAck.n === 4, JSON.stringify(d.timeToAck));
    check('outcomes: dismiss reasons duplicate 2, seasonal 1', d.dismissReasons.duplicate === 2 && d.dismissReasons.seasonal === 1 && d.dismissReasons.other === 0);
    check('outcomes: labels shortfall 29/29/30/29/30, not enough to evaluate', d.labels.labelled === 3 && d.labels.shortfall.true_positive === 29 && d.labels.shortfall.already_known === 30 && d.labels.enoughToEvaluate === false && d.labels.onlineLearning === false);
    check('outcomes: byHead groups sum to 4 alerts', (d.byHead || []).reduce((s, g) => s + g.alerts, 0) === 4);
    check('outcomes: meta.source names the engine', r.json.meta && ['datastore', 'fixture', 'local'].includes(r.json.meta.source));
    const scoped = await get('/alerts/outcomes?window=all&unit=0103');
    check('outcomes: unit scope narrows to that district', scoped.status === 200 && scoped.json.data.alertsInWindow === 1 && scoped.json.data.unit === '0103');
    const win = await get('/alerts/outcomes?window=last30');
    check('outcomes: windowed call keeps the shape', win.status === 200 && win.json.data.window.days === 30 && win.json.data.windowLabel === 'last30');
  }

  // --- timeline ---------------------------------------------------------------
  {
    const r = await get('/alerts/AL-004/actions');
    check('GET /alerts/:key/actions 200', r.status === 200 && r.json.ok === true);
    const d = r.json.data;
    check('timeline: 17 seeded actions on AL-004 (4+5+4+4)', d.timeline.length === 17 && d.summary.count === 17, String(d.timeline.length));
    check('timeline: oldest first', d.timeline.every((x, i, arr) => i === 0 || (x.ts || 0) >= (arr[i - 1].ts || 0)));
    check('timeline: summary flags', d.summary.acknowledged === true && d.summary.escalated === true && d.summary.assignedTo === '1091' && d.summary.latestOutcome === 'true_positive');
    check('timeline: rows are normalised', hasKeys(d.timeline[0], ['actionId', 'subjectType', 'alertKey', 'actionType', 'actor', 'actorRole', 'unit', 'note', 'outcomeLabel', 'clientTs', 'seeded', 'source']) && d.timeline[0].seeded === true);
    const bad = await get('/alerts/AL%20004/actions');
    check('timeline: bad id 400', bad.status === 400 && bad.json.error.code === 'BAD_ID');
    const none = await get('/alerts/NOPE-999/actions');
    check('timeline: unknown alert is an empty timeline, not an error', none.status === 200 && none.json.data.timeline.length === 0);
  }

  // --- POST /alerts/:key/actions ------------------------------------------
  {
    actionlog.resetMemory();
    const body = { actionType: 'acknowledge', actor: 'PSI Test', actorRole: 'station', unit: '1011', clientTs: '2026-08-28T05:00:00Z' };
    const r = await post('/alerts/AL-003/actions', body);
    check('POST acknowledge 200', r.status === 200 && r.json.ok === true, JSON.stringify(r.json).slice(0, 200));
    const d = r.json.data || {};
    check('POST acknowledge: action shape', d.action && d.action.actionType === 'acknowledge' && d.action.actor === 'PSI Test' && d.action.actorRole === 'station' && d.action.unit === '1011' && d.action.clientTs === '2026-08-28T05:00:00.000Z');
    check('POST acknowledge: memory storage named honestly', r.json.meta.storage === 'memory' && r.json.meta.source === 'local' && d.action.source === 'memory');
    check('POST acknowledge: public demo does not flip AnomalyAlert.Status', d.statusUpdated === false && /read-only/.test(d.statusReason || ''));
    check('POST acknowledge: identity from the client claim', d.identity.actorSource === 'client' && d.duplicate === false);
    const again = await post('/alerts/AL-003/actions', body);
    check('POST same (subject, action, actor, clientTs) is idempotent', again.status === 200 && again.json.data.duplicate === true && again.json.data.action.actionId === d.action.actionId);

    const noReason = await post('/alerts/AL-003/actions', { actionType: 'dismiss', actor: 'PSI Test', actorRole: 'station' });
    check('POST dismiss without reason 400 REASON_REQUIRED', noReason.status === 400 && noReason.json.error.code === 'REASON_REQUIRED');
    const badReason = await post('/alerts/AL-003/actions', { actionType: 'dismiss', reason: 'because' });
    check('POST dismiss with an unknown reason 400', badReason.status === 400 && badReason.json.error.code === 'BAD_REASON');
    const otherNoNote = await post('/alerts/AL-003/actions', { actionType: 'dismiss', reason: 'other' });
    check('POST dismiss reason=other needs a note', otherNoNote.status === 400 && otherNoNote.json.error.code === 'REASON_REQUIRED');
    const dismissed = await post('/alerts/AL-003/actions', { actionType: 'dismiss', reason: 'duplicate', actor: 'PSI Test', actorRole: 'station' });
    check('POST dismiss with reason 200 and keeps the reason', dismissed.status === 200 && dismissed.json.data.action.reason === 'duplicate' && dismissed.json.data.action.note === 'duplicate');

    const bogus = await post('/alerts/AL-003/actions', { actionType: 'delete' });
    check('POST invalid actionType 400', bogus.status === 400 && bogus.json.error.code === 'BAD_ACTION_TYPE');
    const noLabel = await post('/alerts/AL-003/actions', { actionType: 'outcome' });
    check('POST outcome without label 400', noLabel.status === 400 && noLabel.json.error.code === 'BAD_OUTCOME');
    const badLabel = await post('/alerts/AL-003/actions', { actionType: 'outcome', outcomeLabel: 'maybe' });
    check('POST outcome with unknown label 400', badLabel.status === 400 && badLabel.json.error.code === 'BAD_OUTCOME');
    const labelOnAck = await post('/alerts/AL-003/actions', { actionType: 'acknowledge', outcomeLabel: 'true_positive', clientTs: '2026-08-28T06:00:00Z' });
    check('POST outcomeLabel on a non-outcome action 400', labelOnAck.status === 400 && labelOnAck.json.error.code === 'BAD_OUTCOME');
    const outcome = await post('/alerts/AL-003/actions', { actionType: 'outcome', outcomeLabel: 'false_alarm', actor: 'SDPO Test', actorRole: 'district' });
    check('POST outcome 200 with label', outcome.status === 200 && outcome.json.data.action.outcomeLabel === 'false_alarm');
    const badTier = await post('/alerts/AL-003/actions', { actionType: 'escalate', toTier: 'galaxy' });
    check('POST escalate to an unknown tier 400', badTier.status === 400 && badTier.json.error.code === 'BAD_TIER');
    const esc = await post('/alerts/AL-003/actions', { actionType: 'escalate', actor: 'PSI Test', actorRole: 'station' });
    check('POST escalate defaults to the next tier up (station -> district)', esc.status === 200 && esc.json.data.action.toTier === 'district' && esc.json.data.action.fromTier === 'station');
    check('POST escalate reports the push fallback honestly', esc.json.data.push && esc.json.data.push.mode === 'disabled' && esc.json.data.push.source === 'fallback-local');
    const noAssignee = await post('/alerts/AL-003/actions', { actionType: 'assign' });
    check('POST assign without assignTo 400', noAssignee.status === 400 && noAssignee.json.error.code === 'ASSIGNEE_REQUIRED');
    const assigned = await post('/alerts/AL-003/actions', { actionType: 'assign', assignTo: '1012', actor: 'PSI Test', actorRole: 'station' });
    check('POST assign 200 carries assignTo', assigned.status === 200 && assigned.json.data.action.assignTo === '1012');
    const emptyNote = await post('/alerts/AL-003/actions', { actionType: 'note' });
    check('POST note without text 400', emptyNote.status === 400 && emptyNote.json.error.code === 'NOTE_REQUIRED');
    const longNote = await post('/alerts/AL-003/actions', { actionType: 'note', note: 'x'.repeat(501) });
    check('POST note over 500 chars 400', longNote.status === 400 && longNote.json.error.code === 'NOTE_TOO_LONG');
    const badTs = await post('/alerts/AL-003/actions', { actionType: 'note', note: 'hi', clientTs: 'yesterday' });
    check('POST bad clientTs 400', badTs.status === 400 && badTs.json.error.code === 'BAD_CLIENT_TS');
    const badId = await post('/alerts/AL%20003/actions', { actionType: 'note', note: 'hi' });
    check('POST bad alert id 400', badId.status === 400 && badId.json.error.code === 'BAD_ID');
    const badSubject = await post('/alerts/AL-003/actions', { actionType: 'note', note: 'hi', subjectType: 'planet' });
    check('POST unknown subjectType 400', badSubject.status === 400 && badSubject.json.error.code === 'BAD_SUBJECT_TYPE');
    const caseNote = await post('/alerts/123/actions', { actionType: 'note', note: 'IO briefed', subjectType: 'case', actor: 'IO Test', actorRole: 'beat' });
    check('POST a case-subject note stores the typed key', caseNote.status === 200 && caseNote.json.data.action.subjectType === 'case' && caseNote.json.data.action.subjectKey === '123' && caseNote.json.data.action.alertKey === null);
    const asAdmin = await post('/alerts/AL-002/actions', { actionType: 'acknowledge', actor: 'Admin', clientTs: '2026-08-28T07:00:00Z' }, ADMIN);
    check('POST with the admin token flips the alert status', asAdmin.status === 200 && asAdmin.json.data.statusUpdated === true && asAdmin.json.data.identity.actorSource === 'admin-token');
    // Other modules write audit rows through the same function with their own shapes.
    const rawRow = await actionlog.recordAction({ ds: { query: async () => [] }, services: {}, flags: { publicDemo: true } }, {
      AlertKey: 'case:7', ActionType: 'OCR_ATTACH', Actor: 'demo-admin', ActorRole: 'admin', Unit: '1012', Note: 'OCR text attached', OutcomeLabel: 'attached', Payload: JSON.stringify({ kind: 'ocr' }), ClientTs: '2026-08-28 09:15:00'
    }, null);
    check('recordAction accepts a raw ActionLog row (OCR attach shape)', rawRow.ok === true && rawRow.storage === 'memory' && rawRow.source === 'local' && rawRow.action.subjectType === 'case' && rawRow.action.actionType === 'OCR_ATTACH' && rawRow.action.outcomeLabel === 'attached', JSON.stringify(rawRow).slice(0, 200));
    const ingestRow = await actionlog.recordAction({ ds: { query: async () => [] }, services: {}, flags: { publicDemo: true } }, { headers: {} }, { subjectType: 'ingest', subjectKey: 'batch-1', actionType: 'ingest', actor: 'loader', actorRole: 'admin', note: 'x', outcomeLabel: 'accepted', payload: '{"rows":3}' });
    check('recordAction accepts the ingest shape without an identity argument', ingestRow.ok === true && ingestRow.action.actor === 'loader' && ingestRow.action.subjectType === 'ingest' && ingestRow.action.outcomeLabel === 'accepted');
    const faceRow = await actionlog.recordAction({ ds: { query: async () => [] }, services: {}, flags: { publicDemo: true } }, { headers: {} }, { subjectType: 'face', subjectKey: 'fs-1', actionType: 'outcome', outcomeLabel: 'true_positive', clientTs: '2026-08-28T09:00:00Z' }, { actor: 'SI Face', actorRole: 'station', actorSource: 'face-id' });
    check('recordAction accepts the face decision shape', faceRow.ok === true && faceRow.action.subjectType === 'face' && faceRow.action.outcomeLabel === 'true_positive' && faceRow.action.actorSource === 'face-id');
    const oc2 = await get('/alerts/outcomes?window=all&nocache=1');
    check('outcomes: non-alert subjects are counted apart, never in alert precision', oc2.status === 200 && oc2.json.data.bySubject.face && oc2.json.data.bySubject.face.outcomes.true_positive === 1 && oc2.json.data.overall.labelled === 4);

    // Timeline now merges seed rows (datastore/fixture) with memory rows.
    const tl = await get('/alerts/AL-003/actions');
    const mem = tl.json.data.timeline.filter((x) => x.source === 'memory');
    check('timeline merges seeded and memory rows', tl.json.data.timeline.length === 6 + 5 && mem.length === 5, `${tl.json.data.timeline.length} / ${mem.length}`);
    // p7-3: the header label is the LIST's read source; a memory-only row under
    // a "Data Store" header used to read as if the Data Store held it, so every
    // row has to carry its own engine and the client renders that per row.
    check('timeline rows carry their own engine, which can differ from the read source', tl.json.data.meta === undefined
      && tl.json.data.timeline.every((x) => ['datastore', 'fixture', 'memory'].includes(x.source))
      && new Set(tl.json.data.timeline.map((x) => x.source)).size === 2, JSON.stringify([...new Set(tl.json.data.timeline.map((x) => x.source))]));
    check('the read source reported for the list is not the source of every row', tl.json.meta.storage === 'datastore'
      && tl.json.data.timeline.some((x) => x.source !== tl.json.meta.storage), `${tl.json.meta.storage}`);
    check('timeline summary reflects the new decisions', tl.json.data.summary.dismissed === true && tl.json.data.summary.latestOutcome === 'false_alarm' && tl.json.data.summary.assignedTo === '1012');

    const recent = await get('/actions/recent?days=2&limit=100');
    check('GET /actions/recent 200 lists the new actions newest first', recent.status === 200 && Array.isArray(recent.json.data) && recent.json.data.some((x) => x.actionId === d.action.actionId) && recent.json.meta.days === 2);
    check('recent: newest first', recent.json.data.every((x, i, arr) => i === 0 || (x.ts || 0) <= (arr[i - 1].ts || 0)));
    const recentCase = await get('/actions/recent?days=2&subjectType=case');
    check('recent: subjectType=case filters to case subjects (the note + the OCR row)', recentCase.status === 200 && recentCase.json.data.length === 2 && recentCase.json.data.every((x) => x.subjectType === 'case'), JSON.stringify(recentCase.json.data.map((x) => x.subjectKey)));
    const recentUnit = await get('/actions/recent?days=2&unit=1011');
    check('recent: unit filter', recentUnit.status === 200 && recentUnit.json.data.length === 1 && recentUnit.json.data[0].unit === '1011');
    const recentBad = await get('/actions/recent?subjectType=planet');
    check('recent: unknown subjectType 400', recentBad.status === 400 && recentBad.json.error.code === 'BAD_SUBJECT_TYPE');
    const after = await get('/alerts/outcomes?window=all');
    check('outcomes cache is busted by a write (AL-003 now dismissed twice, labelled 4)', after.status === 200 && after.json.data.overall.labelled === 4 && after.json.data.overall.outcomes.false_alarm === 2);
    actionlog.resetMemory();
  }

  // --- digest -----------------------------------------------------------------
  {
    const r = await get('/alerts/digest?days=3650');
    check('GET /alerts/digest 200', r.status === 200 && r.json.ok === true);
    const d = r.json.data || {};
    check('digest: shares the mail shape {subject, lines, text, html}', hasKeys(d, ['subject', 'lines', 'text', 'html']) && typeof d.text === 'string' && d.text.includes('Action loop'));
    check('digest: action-loop blocks', hasKeys(d, ['scope', 'alerts', 'topRisk', 'actions', 'outcomes', 'untouched', 'untouchedTotal', 'staleTotal', 'labels', 'storage', 'generatedAt']));
    check('digest: 34 decisions in the seed (40 alert actions minus 6 notes)', d.actions.alertActions === 40 && d.actions.decisions === 34, `${d.actions.alertActions} / ${d.actions.decisions}`);
    check('digest: precision from the seed (1 of 3)', d.outcomes.labelled === 3 && d.outcomes.precision === 0.333);
    check('digest: framing sentence present', d.text.includes('DAPPA never tells an officer what to do'));
    check('digest: meta.wouldSend false with mail off', r.json.meta.wouldSend === false);
    const scoped = await get('/alerts/digest?days=3650&unit=0103');
    check('digest: unit scope names the scope', scoped.status === 200 && scoped.json.data.scope.unit === '0103' && scoped.json.data.alerts.every((a) => a.alertId === 'AL-001'));

    const noAuth = await post('/alerts/digest/send', { days: 7 });
    check('POST /alerts/digest/send without auth 403', noAuth.status === 403 && noAuth.json.error.code === 'AUTH_REQUIRED');
    const send = await post('/alerts/digest/send', { days: 7 }, ADMIN);
    check('POST /alerts/digest/send flag off -> disabled + preview + page fallback', send.status === 200 && send.json.data.sent === false && send.json.data.mode === 'disabled' && send.json.data.source === 'fallback-local' && send.json.data.preview && send.json.data.preview.subject && send.json.data.fallback.page === '/alerts/digest');
  }

  // --- flag paths: FEATURE_MAIL / FEATURE_PUSH on with stubbed services ----
  {
    const prev = { mail: process.env.FEATURE_MAIL, push: process.env.FEATURE_PUSH, from: process.env.MAIL_FROM, to: process.env.DIGEST_TO };
    process.env.FEATURE_MAIL = 'on';
    process.env.FEATURE_PUSH = 'on';
    process.env.MAIL_FROM = 'dappa@example.test';
    process.env.DIGEST_TO = 'sho@example.test';
    const sent = [];
    const pushed = [];
    // One shared stub so a raw UPDATE is visible to the next request.
    const stub = h.createStubClient(h.buildFixtureTables());
    const app = h.createApp({
      clientFactory: () => stub,
      servicesFactory: () => ({
        mailer: { send: async (m) => { sent.push(m); return { ok: true }; } },
        push: { web: async (message, ids) => { pushed.push({ message, ids }); return true; } }
      })
    });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}/api/v1`;
    const p = async (path, body, headers) => {
      const res = await fetch(B + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) });
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    try {
      const send = await p('/alerts/digest/send', { days: 30 }, ADMIN);
      check('flag on: digest sent through the mailer', send.status === 200 && send.json.data.sent === true && send.json.data.mode === 'sent' && send.json.data.source === 'catalyst-mail' && sent.length === 1);
      check('flag on: mailer got the action-loop subject and recipients', sent[0] && /decision/.test(sent[0].subject) && sent[0].to[0] === 'sho@example.test' && sent[0].from === 'dappa@example.test');
      await p('/notify/register', { recipient: 'sho@example.test', label: 'SHO' });
      const esc = await p('/alerts/AL-001/actions', { actionType: 'escalate', actor: 'PSI Test', actorRole: 'station', clientTs: '2026-08-28T08:00:00Z' });
      check('flag on: escalation pushes to the registered recipient', esc.status === 200 && esc.json.data.push.mode === 'sent' && esc.json.data.push.delivered === 1 && pushed.length === 1 && /escalated to district tier/.test(pushed[0].message));
      const assign = await p('/alerts/AL-001/actions', { actionType: 'assign', assignTo: 'Peenya PS', actor: 'PSI Test', actorRole: 'station', clientTs: '2026-08-28T08:05:00Z' });
      check('flag on: assignment pushes too', assign.status === 200 && assign.json.data.push.mode === 'sent' && pushed.length === 2);
      delete process.env.MAIL_FROM;
      const unconfigured = await p('/alerts/digest/send', { days: 30 }, ADMIN);
      check('flag on but MAIL_FROM empty -> not-configured, nothing sent', unconfigured.status === 200 && unconfigured.json.data.mode === 'not-configured' && sent.length === 1);
      const ack = await p('/alerts/AL-002/actions', { actionType: 'acknowledge', actor: 'Admin', clientTs: '2026-08-28T07:30:00Z' }, ADMIN);
      const al2 = await fetch(`${B}/alerts/AL-002`).then((r) => r.json());
      check('admin acknowledge flips AnomalyAlert.Status on the shared store', ack.status === 200 && ack.json.data.statusUpdated === true && al2.data && al2.data.status === 'ACK', al2.data && al2.data.status);
      const dis = await p('/alerts/AL-003/actions', { actionType: 'dismiss', reason: 'known_cause', actor: 'Admin', clientTs: '2026-08-28T07:31:00Z' }, ADMIN);
      const al3 = await fetch(`${B}/alerts/AL-003`).then((r) => r.json());
      check('admin dismiss sets DISMISSED (dismiss is a state, the row stays)', dis.status === 200 && dis.json.data.statusUpdated === true && al3.data && al3.data.status === 'DISMISSED');
    } finally {
      server.close();
      actionlog.resetMemory();
      for (const [k, v] of [['FEATURE_MAIL', prev.mail], ['FEATURE_PUSH', prev.push], ['MAIL_FROM', prev.from], ['DIGEST_TO', prev.to]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  }

  // --- p7-12: an anonymous caller records but never flips the alert's status,
  // in PUBLIC_DEMO or out of it (the decision's title was stricter than the
  // code, which keyed the permission off the demo flag alone). --------------
  {
    actionlog.resetMemory();
    actionlog.resetEmptyProbe();
    const app = h.createApp({ clientFactory: () => h.createStubClient(h.buildFixtureTables()), flags: { publicDemo: false } });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}/api/v1`;
    try {
      const r = await fetch(`${B}/alerts/AL-001/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'acknowledge', actor: 'walk-in', clientTs: '2026-08-28T10:00:00Z' })
      }).then((x) => x.json());
      check('PUBLIC_DEMO off: an anonymous decision is still recorded', r.ok === true && r.data.action.actionType === 'acknowledge' && r.data.identity.actorSource === 'client');
      check('PUBLIC_DEMO off: an anonymous caller still cannot flip AnomalyAlert.Status', r.data.statusUpdated === false
        && /may record a decision but not change/.test(r.data.statusReason || ''), JSON.stringify(r.data.statusReason));
      const al = await fetch(`${B}/alerts/AL-001`).then((x) => x.json());
      check('PUBLIC_DEMO off: the alert row is untouched by the anonymous acknowledge', al.data.status !== 'ACK', String(al.data && al.data.status));
    } finally {
      server.close();
      actionlog.resetMemory();
    }
  }

  // --- int-6: an EMPTY (not failing) ActionLog read falls through to the
  // fixture in PUBLIC_DEMO, and says `fixture` when it does. ----------------
  {
    actionlog.resetMemory();
    actionlog.resetEmptyProbe();
    const empty = h.buildFixtureTables();
    empty.ActionLog = [];
    const app = h.createApp({ clientFactory: () => h.createStubClient(empty) });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}/api/v1`;
    try {
      const tl = await fetch(`${B}/alerts/AL-004/actions`).then((x) => x.json());
      check('empty ActionLog in PUBLIC_DEMO falls through to the fixture', tl.data.timeline.length === 17, String(tl.data.timeline.length));
      check('the empty-table fallback reports fixture, NEVER datastore', tl.meta.storage === 'fixture' && tl.meta.source === 'fixture'
        && tl.data.timeline.every((x) => x.source === 'fixture'), JSON.stringify(tl.meta));
      const oc = await fetch(`${B}/alerts/outcomes?window=all`).then((x) => x.json());
      // p7-2: these are the three numbers the panel must put on screen.
      check('the fallback gives the digest real decisions, not 0', oc.data.actionsInWindow === 40 && oc.data.overall.labelled === 3
        && oc.data.overall.truePositive === 1 && oc.data.overall.precision === 0.333, JSON.stringify({ n: oc.data.actionsInWindow, l: oc.data.overall.labelled }));
      check('precision interval on the fixture is 6-79 of every 100', Math.round(oc.data.overall.precisionInterval.lo * 100) === 6
        && Math.round(oc.data.overall.precisionInterval.hi * 100) === 79, JSON.stringify(oc.data.overall.precisionInterval));
      check('median time-to-acknowledge on the fixture is 4.8 h', oc.data.overall.medianTimeToAckHours === 4.8, String(oc.data.overall.medianTimeToAckHours));
    } finally {
      server.close();
      actionlog.resetMemory();
      actionlog.resetEmptyProbe();
    }
  }

  // A NON-empty table must never trigger the fallback: a filtered read that
  // legitimately matches nothing stays empty and stays `datastore`.
  {
    actionlog.resetMemory();
    actionlog.resetEmptyProbe();
    const app = h.createApp({ clientFactory: () => h.createStubClient(h.buildFixtureTables()) });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const B = `http://127.0.0.1:${server.address().port}/api/v1`;
    try {
      const none = await fetch(`${B}/alerts/AL-999/actions`).then((x) => x.json());
      check('a filtered read that matches nothing does NOT pull in the fixture', none.data.timeline.length === 0 && none.meta.storage === 'datastore', JSON.stringify(none.meta));
    } finally {
      server.close();
      actionlog.resetMemory();
      actionlog.resetEmptyProbe();
    }
  }
}
