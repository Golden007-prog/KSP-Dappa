'use strict';
// Action endpoints: predict, ai narrative, copilot, reports, notify, healthz.

const { ok, fail, asyncH, requireAdmin, nocache, cacheKey, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const { EXPECTED_ROW_COUNTS } = require('../constants');
const copilot = require('../copilot');
const quickml = require('../quickml');
const zia = require('../zia');
const mail = require('../mail');
const { getFallbackState, fixtureNetworkGraph } = require('../fixture');
const { toNum, round, ymAdd, pctDelta, parseJsonSafe, withTimeout, AI_TIMEOUT_MS } = require('../util');

// COUNT() column per completeness-tracked table (COUNT(*) is not portable ZCQL).
const COMPLETENESS_COUNT_COLS = {
  CaseMaster: 'COUNT(CaseMasterID)',
  AggMonthly: 'COUNT(Ym)',
  Victim: 'COUNT(VictimMasterID)',
  Accused: 'COUNT(AccusedMasterID)',
  NetworkEdge: 'COUNT(PersonKeyA)',
  ForecastMonthly: 'COUNT(Ym)',
  OffenderProfile: 'COUNT(PersonKey)',
  District: 'COUNT(DistrictID)',
  ChargesheetDetails: 'COUNT(CSID)',
  ComplainantDetails: 'COUNT(ComplainantID)',
  ActSectionAssociation: 'COUNT(CaseMasterID)',
  ArrestSurrender: 'COUNT(ArrestSurrenderID)',
  AnomalyAlert: 'COUNT(AlertID)'
};

function register(router) {
  router.post('/predict/outcome', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    // Serving chain: QuickML SDK -> QuickML deployment URL -> Zia AutoML ->
    // the embedded logistic model. meta.source names whichever answered.
    const { result, source } = await quickml.predictOutcome(body, {
      flags: ctx.flags,
      fetchImpl: ctx.services.fetchImpl,
      quickmlClient: ctx.services.quickmlClient,
      ziaAutoml: (features) => zia.automlPredict(features, { flags: ctx.flags, ziaClient: ctx.services.ziaClient })
    });
    ok(res, result, { source });
  }));

  router.post('/ai/narrative', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    let text = body.text || null;
    const caseId = body.caseId || null;
    if (!text && caseId) {
      const rows = await ctx.ds.query({
        table: 'CaseMaster', columns: ['CaseMasterID', 'BriefFacts'],
        where: [{ col: 'CaseMasterID', op: '=', val: caseId }]
      });
      if (!rows.length) return fail(res, 404, 'NOT_FOUND', `No case with id ${caseId}.`);
      text = rows[0].BriefFacts || '';
    }
    if (!text) return fail(res, 400, 'BAD_REQUEST', 'Provide caseId or text.');
    const { result, source } = await zia.analyzeNarrative(text, { flags: ctx.flags, ziaClient: ctx.services.ziaClient });
    ok(res, Object.assign({ caseId }, result), { source });
  }));

  router.post('/copilot/query', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const q = String(body.q || body.query || body.text || '').trim();
    if (!q) return fail(res, 400, 'BAD_REQUEST', 'Provide a question as {q}.');
    // Flag path: QuickML LLM Serving with RAG over the NoSQL context pack.
    if (ctx.flags.quickmlLlm && process.env.QUICKML_LLM_URL) {
      try {
        const doFetch = ctx.services.fetchImpl || fetch;
        const resp = await withTimeout(doFetch(process.env.QUICKML_LLM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Zoho-oauthtoken ${process.env.QUICKML_API_KEY || ''}`
          },
          body: JSON.stringify({ question: q })
        }), AI_TIMEOUT_MS, 'quickml llm');
        if (resp.ok) {
          const json = await resp.json();
          const inner = json.data || json;
          if (inner && inner.answer) {
            return ok(res, {
              answer: String(inner.answer),
              chart: inner.chart || undefined,
              zcql: inner.zcql || undefined,
              engine: 'quickml-rag'
            }, { source: 'quickml-llm' });
          }
        }
      } catch (e) {
        // fall through to the deterministic parser
      }
    }
    const lk = await getLookups(ctx);
    const result = await copilot.answer(q, { ds: ctx.ds, lk });
    ok(res, result, { source: 'deterministic' });
  }));

  // Tappable question chips for the copilot UI — every one is guaranteed to
  // answer (they are the smoke-tested canned utterances).
  router.get('/copilot/suggestions', asyncH(async (req, res) => {
    ok(res, { suggestions: copilot.CANNED_UTTERANCES }, { count: copilot.CANNED_UTTERANCES.length });
  }));

  // Single-call data payload for the weekly brief: the /print/brief page and
  // the SmartBrowz PDF path both render from this one response.
  router.get('/reports/brief-data', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const window = String(req.query.window || 'last30');
    const ttl = ttlFor(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const curYm = await anchorYm(ctx.ds, null);
      const prevYm = ymAdd(curYm, -1);
      const [monthRows, alertCountRows, alerts, risk, distRows] = await Promise.all([
        ctx.ds.query({
          table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)', 'SUM(HeinousCount)'],
          where: [{ col: 'Ym', op: '>=', val: prevYm }, { col: 'Ym', op: '<=', val: curYm }],
          groupBy: ['Ym']
        }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] }),
        ctx.ds.query({
          table: 'AnomalyAlert',
          columns: ['AlertID', 'DistrictID', 'CrimeHeadID', 'Observed', 'Expected', 'ZScore', 'Severity', 'Narrative'],
          where: [{ col: 'Status', op: '=', val: 'OPEN' }],
          orderBy: { col: 'ZScore', desc: true }, limit: { count: 5 }
        }),
        ctx.ds.query({
          table: 'StationRisk', columns: ['UnitID', 'RiskScore', 'DriversJson'],
          orderBy: { col: 'RiskScore', desc: true }, limit: { count: 5 }
        }),
        ctx.ds.query({
          table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
          where: [{ col: 'Ym', op: '=', val: curYm }],
          groupBy: ['DistrictID'], orderBy: { col: 'SUM(CaseCount)', desc: true }, limit: { count: 5 }
        })
      ]);
      const byYm = {};
      for (const r of monthRows) byYm[r.Ym] = { cases: toNum(r['SUM(CaseCount)']), heinous: toNum(r['SUM(HeinousCount)']) };
      const cur = byYm[curYm] || { cases: 0, heinous: 0 };
      const prev = byYm[prevYm] || { cases: 0, heinous: 0 };
      return {
        window,
        asOfYm: curYm,
        generatedAt: new Date().toISOString(),
        kpis: {
          totalFirs: cur.cases,
          momPct: pctDelta(cur.cases, prev.cases),
          heinousCount: cur.heinous,
          activeAlerts: toNum(alertCountRows.length ? alertCountRows[0]['COUNT(AlertID)'] : 0)
        },
        topAlerts: alerts.map((a) => ({
          alertId: a.AlertID,
          districtName: lk.districtName(a.DistrictID),
          headName: lk.headName(a.CrimeHeadID),
          observed: toNum(a.Observed),
          expected: round(toNum(a.Expected), 1),
          zScore: round(toNum(a.ZScore), 2),
          severity: toNum(a.Severity),
          narrative: a.Narrative
        })),
        topRisk: risk.map((r) => {
          const unit = lk.unitById.get(String(r.UnitID));
          return {
            unitId: String(r.UnitID),
            unitName: unit ? unit.unitName : `Unit ${r.UnitID}`,
            riskScore: round(toNum(r.RiskScore), 1),
            drivers: parseJsonSafe(r.DriversJson, [])
          };
        }),
        topDistricts: distRows.map((r) => ({
          districtId: String(r.DistrictID),
          districtName: lk.districtName(r.DistrictID),
          caseCount: toNum(r['SUM(CaseCount)'])
        }))
      };
    });
    ok(res, value, { cached, ttlSec: ttl });
  }));

  router.post('/reports/weekly-brief', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const window = String((req.body || {}).window || req.query.window || 'last7');
    let fellBackBecause = null;
    if (ctx.flags.smartbrowz && ctx.services.smartbrowz) {
      try {
        // SmartBrowz renders a headless-browser PDF — allow longer than an AI
        // hop, but still bounded so a stuck render cannot hang the request.
        const out = await withTimeout(ctx.services.smartbrowz.renderBrief(window), AI_TIMEOUT_MS * 4, 'smartbrowz');
        // A rendered-and-stored PDF counts as success even when the signed URL
        // could not be minted — the bytes exist and the key locates them.
        if (out && (out.pdfUrl || out.stored)) {
          return ok(res, {
            mode: 'pdf', pdfUrl: out.pdfUrl || null, storedKey: out.key || null, window
          }, { source: 'smartbrowz' });
        }
        fellBackBecause = 'smartbrowz returned no pdf';
      } catch (e) {
        // Surface WHY we fell back. A silent catch here cost real debugging
        // time: the render was failing on a 404 URL and the response looked
        // identical to the flag simply being off.
        fellBackBecause = String((e && e.message) || e).slice(0, 200);
      }
    } else if (!ctx.flags.smartbrowz) {
      fellBackBecause = 'FEATURE_SMARTBROWZ off';
    } else {
      fellBackBecause = 'smartbrowz service unavailable (not running on Catalyst)';
    }
    ok(res, {
      mode: 'print-css', printUrl: `/print/brief?window=${encodeURIComponent(window)}`, window,
      fallbackReason: fellBackBecause
    }, { source: 'fallback-local' });
  }));

  // Legacy digest endpoint — same behaviour, now sharing lib/mail.js with
  // POST /admin/digest/send so the preview and the sent mail cannot drift.
  router.post('/notify/test-digest', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const out = await mail.sendDigest(ctx, { limit: 5 });
    ok(res, out, { source: out.source });
  }));

  // Admin data loader — inserts rows through the regular Data Store row API
  // (zcatalyst SDK insertRows), NOT the bulk-write job API whose free-tier
  // allowance is a separate, easily-exhausted quota. Used by
  // scripts/load_via_api.mjs to stream pipeline CSVs into the live tables.
  router.post('/admin/bulk-insert', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const { table, rows } = req.body || {};
    if (!table || typeof table !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      return fail(res, 400, 'valid table name required');
    }
    if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'rows[] required');
    if (rows.length > 200) return fail(res, 400, 'max 200 rows per call');
    let capp = null;
    try { capp = require('zcatalyst-sdk-node').initialize(req); } catch (e) { /* local run */ }
    if (!capp) return fail(res, 503, 'catalyst unavailable (deployed only)');
    const out = await capp.datastore().table(table).insertRows(rows);
    ok(res, { table, inserted: Array.isArray(out) ? out.length : rows.length });
  }));

  router.get('/healthz', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const health = { status: 'ok', datastore: { ok: false, rowCounts: {} }, cache: { ok: false, backend: null }, nosql: { ok: false }, flags: ctx.flags };
    const countTables = [['CaseMaster', 'COUNT(CaseMasterID)'], ['AggMonthly', 'COUNT(Ym)'], ['AnomalyAlert', 'COUNT(AlertID)'], ['OffenderProfile', 'COUNT(PersonKey)']];
    const fixtureQueriesBefore = getFallbackState().queries;
    try {
      const results = await Promise.all(countTables.map(([table, expr]) =>
        ctx.ds.query({ table, columns: [expr] }).then((rows) => toNum(rows.length ? rows[0][expr] : 0)).catch(() => null)
      ));
      countTables.forEach(([table], i) => { health.datastore.rowCounts[table] = results[i]; });
      health.datastore.ok = results.some((r) => r !== null);
      const forced = require('../fixture').forcedFixtureTables();
      if (forced.size) health.datastore.forcedFixtureTables = [...forced];
    } catch (e) {
      health.datastore.ok = false;
    }
    // Data completeness: actual vs expected full-load counts per table, so a
    // partial bulk load reads as a percentage instead of quiet under-counting.
    // Advisory only — never degrades the health status. Cached 5 min.
    try {
      const { value: completeness } = await ctx.cache.wrap('v1:completeness', 300, nocache(req), async () => {
        const entries = Object.entries(EXPECTED_ROW_COUNTS);
        const dsForCounts = ctx.dsRaw || ctx.ds; // real Data Store, never fixture
        const counts = await Promise.all(entries.map(([table]) => {
          const expr = COMPLETENESS_COUNT_COLS[table];
          return dsForCounts.query({ table, columns: [expr] })
            .then((rows) => toNum(rows.length ? rows[0][expr] : 0))
            .catch(() => null);
        }));
        const tables = {};
        let gotSum = 0;
        let expSum = 0;
        entries.forEach(([table, expected], i) => {
          const actual = counts[i];
          tables[table] = {
            expected,
            actual,
            pct: actual === null ? null : Math.min(100, round((actual / expected) * 100, 1))
          };
          if (actual !== null) {
            gotSum += Math.min(actual, expected);
            expSum += expected;
          }
        });
        return { tables, overallPct: expSum > 0 ? Math.min(100, round((gotSum / expSum) * 100, 1)) : null };
      });
      health.datastore.completeness = completeness;
    } catch (e) { /* completeness is advisory */ }
    // Honest reporting: if these very counts were answered from the bundled
    // fixture (PUBLIC_DEMO self-healing), say so instead of claiming degraded.
    if (health.datastore.ok && getFallbackState().queries > fixtureQueriesBefore) {
      health.datastore.mode = 'fixture-demo';
    }
    try {
      health.cache.ok = await ctx.cache.ping();
      health.cache.backend = ctx.cache.backend;
    } catch (e) {
      health.cache.ok = false;
    }
    try {
      const loaders = ctx.services.graphLoaders || {};
      if (loaders.nosql) {
        const g = await loaders.nosql();
        health.nosql.ok = Boolean(g && Array.isArray(g.nodes));
      }
    } catch (e) {
      health.nosql.ok = false;
    }
    if (!health.nosql.ok) {
      if (ctx.flags.publicDemo) {
        try {
          const g = await fixtureNetworkGraph();
          health.nosql.ok = Boolean(g && Array.isArray(g.nodes) && g.nodes.length > 0);
          health.nosql.mode = 'fixture-demo';
        } catch (e) {
          health.nosql.ok = false;
        }
      } else if (!(ctx.services.graphLoaders || {}).nosql) {
        health.nosql.note = 'nosql loader not configured (fallback chain active)';
      }
    }
    if (!health.datastore.ok || !health.cache.ok) health.status = 'degraded';
    ok(res, health, { uptimeSec: Math.round(process.uptime()) });
  }));
}

module.exports = { register };
