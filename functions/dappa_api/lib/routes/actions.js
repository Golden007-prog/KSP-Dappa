'use strict';
// Action endpoints: predict, ai narrative, copilot, reports, notify, healthz.

const { ok, fail, asyncH, requireAdmin, nocache, cacheKey } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const copilot = require('../copilot');
const quickml = require('../quickml');
const zia = require('../zia');
const { getFallbackState, fixtureNetworkGraph } = require('../fixture');
const { toNum, round, ymAdd, pctDelta, parseJsonSafe } = require('../util');

function register(router) {
  router.post('/predict/outcome', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const { result, source } = await quickml.predictOutcome(body, {
      flags: ctx.flags,
      fetchImpl: ctx.services.fetchImpl
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
        const resp = await doFetch(process.env.QUICKML_LLM_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Zoho-oauthtoken ${process.env.CATALYST_QUICKML_KEY || ''}`
          },
          body: JSON.stringify({ question: q })
        });
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
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
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
    ok(res, value, { cached });
  }));

  router.post('/reports/weekly-brief', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const window = String((req.body || {}).window || req.query.window || 'last7');
    if (ctx.flags.smartbrowz && ctx.services.smartbrowz) {
      try {
        const out = await ctx.services.smartbrowz.renderBrief(window);
        if (out && out.pdfUrl) return ok(res, { mode: 'pdf', pdfUrl: out.pdfUrl, window }, { source: 'smartbrowz' });
      } catch (e) {
        // fall through to print-css fallback
      }
    }
    ok(res, { mode: 'print-css', printUrl: `/print/brief?window=${encodeURIComponent(window)}`, window }, { source: 'fallback-local' });
  }));

  router.post('/notify/test-digest', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const alerts = await ctx.ds.query({
      table: 'AnomalyAlert', columns: ['AlertID', 'Narrative', 'Severity'],
      where: [{ col: 'Status', op: '=', val: 'OPEN' }],
      orderBy: { col: 'Severity', desc: true }, limit: { count: 5 }
    });
    const preview = {
      subject: `KSP DAPPA digest — ${alerts.length} active alert${alerts.length === 1 ? '' : 's'}`,
      lines: alerts.map((a) => `[S${a.Severity}] ${a.Narrative}`)
    };
    if (ctx.flags.mail && ctx.services.mailer) {
      try {
        await ctx.services.mailer.send({
          from: process.env.MAIL_FROM,
          to: process.env.DIGEST_TO,
          subject: preview.subject,
          content: preview.lines.join('\n')
        });
        return ok(res, { sent: true, to: process.env.DIGEST_TO || null, preview }, { source: 'catalyst-mail' });
      } catch (e) {
        return ok(res, { sent: false, mode: 'error-fallback', preview }, { source: 'fallback-local' });
      }
    }
    ok(res, { sent: false, mode: 'disabled', preview }, { source: 'fallback-local' });
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
    } catch (e) {
      health.datastore.ok = false;
    }
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
