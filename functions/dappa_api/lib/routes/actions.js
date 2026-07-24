'use strict';
// Action endpoints: predict, ai narrative, copilot, reports, notify, healthz.

const { ok, fail, asyncH, requireAdmin } = require('../envelope');
const { getLookups } = require('../lookups');
const copilot = require('../copilot');
const quickml = require('../quickml');
const zia = require('../zia');
const { toNum } = require('../util');

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
    try {
      const results = await Promise.all(countTables.map(([table, expr]) =>
        ctx.ds.query({ table, columns: [expr] }).then((rows) => toNum(rows.length ? rows[0][expr] : 0)).catch(() => null)
      ));
      countTables.forEach(([table], i) => { health.datastore.rowCounts[table] = results[i]; });
      health.datastore.ok = results.some((r) => r !== null);
    } catch (e) {
      health.datastore.ok = false;
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
      } else {
        health.nosql.ok = false;
        health.nosql.note = 'nosql loader not configured (fallback chain active)';
      }
    } catch (e) {
      health.nosql.ok = false;
    }
    if (!health.datastore.ok || !health.cache.ok) health.status = 'degraded';
    ok(res, health, { uptimeSec: Math.round(process.uptime()) });
  }));
}

module.exports = { register };
