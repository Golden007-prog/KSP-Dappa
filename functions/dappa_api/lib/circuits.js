'use strict';
// Catalyst Circuits — multi-step orchestration of the nightly refresh
// (aggregate -> detect anomalies -> notify).
//
// Real path : ctx.services.circuit.execute(name, input) -> capp.circuit()
//             .execute(CIRCUIT_ID, name, input); status via .status(id, execId).
// Flag      : FEATURE_CIRCUIT + CIRCUIT_ID (a Circuit is drawn in the console,
//             so its id cannot be inferred from code).
// Fallback  : the identical three steps executed sequentially in this process.
//             Same step names, same per-step timings and payloads, so the admin
//             UI renders one shape whichever path ran.

const { toNum, round, ymAdd, ymRange, logJson } = require('./util');
const mail = require('./mail');
const push = require('./push');
const olap = require('./olap');

const STEPS = ['aggregate', 'detect-anomalies', 'notify'];
const EXEC_TTL_SEC = 3600;
const MAX_TRACKED = 20;

const executions = new Map(); // executionId -> record

function remember(rec) {
  executions.set(rec.executionId, rec);
  while (executions.size > MAX_TRACKED) executions.delete(executions.keys().next().value);
  return rec;
}

function newExecId() {
  return `exec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Median absolute deviation z-score — the same robust statistic the nightly
 * Python job uses, so the inline path agrees with the scheduled one. */
function robustZ(series, current) {
  if (series.length < 3) return 0;
  const sorted = series.slice().sort((a, b) => a - b);
  const mid = (arr) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  const median = mid(sorted);
  const devs = series.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = mid(devs);
  const scale = mad > 0 ? mad * 1.4826 : Math.max(1e-9, median * 0.25 || 1);
  return (current - median) / scale;
}

async function stepAggregate(ctx) {
  const rows = await ctx.ds.queryAll({
    table: 'AggMonthly', columns: ['MAX(Ym)']
  }).catch(() => []);
  const anchor = rows.length && rows[0]['MAX(Ym)'] ? String(rows[0]['MAX(Ym)']) : null;
  if (!anchor) return { anchorYm: null, districts: 0, totalCases: 0, note: 'AggMonthly unreadable' };
  const perDistrict = await ctx.ds.queryAll({
    table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
    where: [{ col: 'Ym', op: '=', val: anchor }], groupBy: ['DistrictID']
  }, { maxRows: 600 });
  const totalCases = perDistrict.reduce((s, r) => s + toNum(r['SUM(CaseCount)']), 0);
  return { anchorYm: anchor, districts: perDistrict.length, totalCases };
}

async function stepDetect(ctx, agg) {
  const anchor = agg && agg.anchorYm;
  if (!anchor) return { candidates: [], scanned: 0, openAlerts: 0 };
  const fromYm = ymAdd(anchor, -11);
  const months = ymRange(fromYm, anchor);
  // 38 districts x 8 heads x 12 months is far past the 300-row ZCQL cap, so
  // this MUST page — or go through the OLAP engine when it is enabled.
  const cube = await olap.queryAll(ctx, {
    table: 'AggMonthly', columns: ['DistrictID', 'CrimeHeadID', 'Ym', 'SUM(CaseCount)'],
    where: [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: anchor }],
    groupBy: ['DistrictID', 'CrimeHeadID', 'Ym']
  }, { maxRows: 6000 }).catch(() => ({ rows: [], engine: 'zcql' }));
  const rows = cube.rows;
  const series = new Map();
  for (const r of rows) {
    const key = `${r.DistrictID}|${r.CrimeHeadID}`;
    if (!series.has(key)) series.set(key, new Map());
    series.get(key).set(String(r.Ym), toNum(r['SUM(CaseCount)']));
  }
  const candidates = [];
  for (const [key, byYm] of series) {
    const values = months.map((m) => byYm.get(m) || 0);
    const current = values[values.length - 1];
    const z = robustZ(values.slice(0, -1), current);
    if (z >= 2 && current > 0) {
      const [districtId, crimeHeadId] = key.split('|');
      candidates.push({ districtId, crimeHeadId: toNum(crimeHeadId), observed: current, zScore: round(z, 2) });
    }
  }
  candidates.sort((a, b) => b.zScore - a.zScore);
  const openRows = await ctx.ds.query({
    table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }]
  }).catch(() => []);
  return {
    scanned: series.size,
    candidates: candidates.slice(0, 10),
    candidateCount: candidates.length,
    openAlerts: toNum(openRows.length ? openRows[0]['COUNT(AlertID)'] : 0)
  };
}

async function stepNotify(ctx, detect, opts) {
  const preview = await mail.buildDigest(ctx, { limit: 5 });
  const mailResult = (opts && opts.send)
    ? await mail.sendDigest(ctx, { preview })
    : { sent: false, mode: 'dry-run', preview, source: 'fallback-local' };
  const critical = (detect.candidates || []).filter((c) => c.zScore >= 4).length;
  const pushResult = await push.sendPush(ctx, preview.subject, {
    reason: 'circuit:nightly-refresh'
  });
  return {
    mail: { sent: mailResult.sent, mode: mailResult.mode, source: mailResult.source, subject: preview.subject },
    push: { sent: pushResult.sent, mode: pushResult.mode, source: pushResult.source },
    criticalCandidates: critical,
    digestLines: preview.lines.length
  };
}

async function runInline(ctx, opts) {
  const executionId = newExecId();
  const steps = [];
  const startedAt = new Date().toISOString();
  let agg = null;
  let detect = null;
  for (const name of STEPS) {
    const t0 = Date.now();
    try {
      let detail = null;
      if (name === 'aggregate') { agg = await stepAggregate(ctx); detail = agg; } else if (name === 'detect-anomalies') { detect = await stepDetect(ctx, agg); detail = detect; } else { detail = await stepNotify(ctx, detect || {}, opts); }
      steps.push({ name, status: 'success', ms: Date.now() - t0, detail });
    } catch (e) {
      steps.push({ name, status: 'failed', ms: Date.now() - t0, error: String((e && e.message) || e) });
      break;
    }
  }
  const record = {
    executionId,
    mode: 'inline',
    circuitId: null,
    status: steps.every((s) => s.status === 'success') ? 'success' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
    source: 'fallback-local'
  };
  remember(record);
  await ctx.cache.put(`v1:circuit:${executionId}`, record, EXEC_TTL_SEC).catch(() => {});
  logJson('info', 'circuit_inline_done', { executionId, status: record.status, steps: steps.length });
  return record;
}

/**
 * Run the nightly-refresh orchestration. Uses Catalyst Circuits when enabled,
 * otherwise the identical steps sequentially in-process.
 */
async function runNightlyRefresh(ctx, opts) {
  const o = opts || {};
  const circuitId = String(process.env.CIRCUIT_ID || '').trim();
  if (ctx.flags.circuit && ctx.services.circuit && circuitId) {
    try {
      const out = await ctx.services.circuit.execute('dappa_nightly_refresh', {
        trigger: String(o.trigger || 'api'),
        send: String(Boolean(o.send))
      });
      const inner = (out && (out.data || out)) || {};
      const record = {
        executionId: String(inner.execution_id || inner.executionId || inner.id || newExecId()),
        mode: 'circuit',
        circuitId,
        status: String(inner.status || 'running'),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        steps: STEPS.map((name) => ({ name, status: 'delegated' })),
        source: 'catalyst-circuit'
      };
      remember(record);
      await ctx.cache.put(`v1:circuit:${record.executionId}`, record, EXEC_TTL_SEC).catch(() => {});
      return record;
    } catch (e) {
      logJson('warn', 'circuit_execute_failed', { message: String((e && e.message) || e) });
      const inline = await runInline(ctx, o);
      inline.note = `Catalyst Circuit execution failed (${String((e && e.message) || e)}); ran the same steps inline.`;
      return inline;
    }
  }
  const inline = await runInline(ctx, o);
  inline.note = ctx.flags.circuit && !circuitId
    ? 'FEATURE_CIRCUIT is on but CIRCUIT_ID is unset (the circuit is drawn in the console); ran inline.'
    : 'Catalyst Circuits disabled; ran the same steps inline.';
  return inline;
}

/** Execution status: live Circuit status when possible, else the local record. */
async function getExecution(ctx, executionId) {
  const id = String(executionId || '');
  const local = executions.get(id) || (await ctx.cache.get(`v1:circuit:${id}`).catch(() => undefined) || {}).value || null;
  const circuitId = String(process.env.CIRCUIT_ID || '').trim();
  if (local && local.mode === 'circuit' && ctx.flags.circuit && ctx.services.circuit && circuitId) {
    try {
      const live = await ctx.services.circuit.status(id);
      const inner = (live && (live.data || live)) || {};
      return Object.assign({}, local, {
        status: String(inner.status || local.status),
        steps: Array.isArray(inner.steps) ? inner.steps : local.steps,
        source: 'catalyst-circuit'
      });
    } catch (e) { /* fall back to the stored record */ }
  }
  return local;
}

module.exports = { runNightlyRefresh, getExecution, runInline, robustZ, STEPS };
