'use strict';
// Data Store OLAP — the heaviest GROUP BY aggregates routed through
// app.zcql().executeOLAPQuery(sql) with executeZCQLQuery as the fallback.
//
// Real path : ctx.services.olap.execute(sql) -> capp.zcql().executeOLAPQuery(sql)
//             (zcatalyst-sdk-node 3.4.0 lib/zcql/zcql.d.ts; the docs page for
//             the method is 404, so the call is verified against the typing and
//             exercised by GET /meta/olap-benchmark, never assumed).
// Flag      : FEATURE_OLAP + OLAP_ENABLED (the OLAP database is switched on
//             once in the console — Data Store -> OLAP Database -> Enable; no
//             env var can do it, so OLAP_ENABLED is the operator's attestation
//             that the step was done).
// Fallback  : the identical structured query through ctx.ds.queryAll, i.e. the
//             paged 300-row ZCQL path every other route already uses.
//
// Every answer carries `engine` ('olap' | 'zcql') so a route can surface it in
// meta.engine, and a failed OLAP call marks the engine unhealthy for the rest
// of the container's life — a second round trip per request would otherwise
// be paid on every aggregate while the console step is still pending.

const { withTimeout, AI_TIMEOUT_MS } = require('./util');
const { flattenRow } = require('./datastore');

const BENCH_KEY = 'v1:olap:benchmark';
const BENCH_TTL_SEC = 24 * 3600;
// ZCQL clips a single SELECT at 300 rows; whether OLAP does too is undocumented,
// so a result of exactly this size is flagged as "possibly capped" rather than
// trusted as complete.
const ZCQL_ROW_CAP = 300;

let olapHealthy = true;
let lastError = null;

function olapConfigured(ctx) {
  return Boolean(ctx && ctx.flags && ctx.flags.olap && ctx.services && ctx.services.olap
    && String(process.env.OLAP_ENABLED || '').trim());
}

/** Test hook. */
function resetOlapHealth() {
  olapHealthy = true;
  lastError = null;
}

function olapState() {
  return { healthy: olapHealthy, lastError };
}

/**
 * Run a structured query (lib/datastore.js shape) through OLAP when possible,
 * else through the paged ZCQL path. Returns { rows, engine, ms, note? }.
 * `q.limit` is ignored on the OLAP path (an analytical engine returns the whole
 * group set); `opts.maxRows` still caps the fallback exactly as queryAll does.
 */
async function queryAll(ctx, q, opts) {
  const t0 = Date.now();
  if (olapConfigured(ctx) && olapHealthy) {
    const sql = ctx.ds.buildZCQL(Object.assign({}, q, { limit: undefined }));
    try {
      const raw = await withTimeout(ctx.services.olap.execute(sql), AI_TIMEOUT_MS, 'olap');
      const rows = (raw || []).map(flattenRow);
      const out = { rows, engine: 'olap', ms: Date.now() - t0, sql };
      if (rows.length === ZCQL_ROW_CAP) out.note = `exactly ${ZCQL_ROW_CAP} rows — OLAP may share the ZCQL row cap; treat as possibly truncated`;
      return out;
    } catch (e) {
      olapHealthy = false;
      lastError = String((e && e.message) || e).slice(0, 300);
    }
  }
  const { rows, pages, truncated } = await ctx.ds.queryPaged(q, opts);
  const out = { rows, engine: 'zcql', ms: Date.now() - t0, pages, truncated };
  if (ctx.flags && ctx.flags.olap && !olapConfigured(ctx)) out.note = 'FEATURE_OLAP is on but OLAP_ENABLED is unset (enable the OLAP database in the console first)';
  else if (ctx.flags && ctx.flags.olap && !olapHealthy) out.note = `OLAP call failed (${lastError}); served by ZCQL`;
  return out;
}

/** The district x head x month cube for a Ym window — the heaviest aggregate
 * in the API (38 districts x 8 heads x N months). */
function cubeQuery(fromYm, toYm) {
  return {
    table: 'AggMonthly',
    columns: ['DistrictID', 'CrimeHeadID', 'Ym', 'SUM(CaseCount)', 'SUM(HeinousCount)'],
    where: [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }],
    groupBy: ['DistrictID', 'CrimeHeadID', 'Ym'],
    orderBy: { col: 'Ym' }
  };
}

/**
 * Run the cube both ways and report measured latency. The OLAP leg is
 * attempted whenever the flag is on, even if a previous call marked the engine
 * unhealthy — the benchmark exists precisely to re-test it. Cached daily.
 */
async function benchmark(ctx, fromYm, toYm, bypass) {
  return ctx.cache.wrap(`${BENCH_KEY}:${fromYm}:${toYm}`, BENCH_TTL_SEC, bypass, async () => {
    const q = cubeQuery(fromYm, toYm);
    const sql = ctx.ds.buildZCQL(Object.assign({}, q, { limit: undefined }));
    const legs = {};

    const z0 = Date.now();
    try {
      const { rows, pages, truncated } = await ctx.ds.queryPaged(q, { maxRows: 6000 });
      legs.zcql = { ok: true, ms: Date.now() - z0, rows: rows.length, pages, truncated };
    } catch (e) {
      legs.zcql = { ok: false, ms: Date.now() - z0, error: String((e && e.message) || e).slice(0, 300) };
    }

    const enabled = Boolean(ctx.flags.olap && ctx.services.olap);
    const attested = Boolean(String(process.env.OLAP_ENABLED || '').trim());
    if (enabled) {
      const o0 = Date.now();
      try {
        const raw = await withTimeout(ctx.services.olap.execute(sql), AI_TIMEOUT_MS * 2, 'olap benchmark');
        const rows = (raw || []).map(flattenRow);
        legs.olap = { ok: true, ms: Date.now() - o0, rows: rows.length, possiblyCapped: rows.length === ZCQL_ROW_CAP };
        olapHealthy = true;
        lastError = null;
      } catch (e) {
        legs.olap = { ok: false, ms: Date.now() - o0, error: String((e && e.message) || e).slice(0, 300) };
        olapHealthy = false;
        lastError = legs.olap.error;
      }
    } else {
      legs.olap = { ok: false, ms: null, skipped: true, reason: ctx.flags.olap ? 'OLAP handle unavailable in this runtime' : 'FEATURE_OLAP off' };
    }

    const both = legs.zcql.ok && legs.olap.ok;
    return {
      window: { fromYm, toYm },
      sql,
      legs,
      speedup: both ? Math.round((Math.max(1, legs.zcql.ms) / Math.max(1, legs.olap.ms)) * 100) / 100 : null,
      rowsAgree: both ? legs.zcql.rows === legs.olap.rows : null,
      attested,
      recommendedEngine: both && legs.olap.rows === legs.zcql.rows && legs.olap.ms <= legs.zcql.ms ? 'olap' : 'zcql',
      measuredAt: new Date().toISOString()
    };
  });
}

module.exports = { queryAll, benchmark, cubeQuery, olapConfigured, olapState, resetOlapHealth, ZCQL_ROW_CAP };
