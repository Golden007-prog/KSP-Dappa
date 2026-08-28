'use strict';
// CSV → ER ingest endpoints (Round 2, Phase 8). Validation is always a dry run;
// nothing reaches a store until POST /ingest/load, which needs the District or
// State tier (X-Dappa-Tier) or the admin token, and only writes to the Data
// Store when the SDK app is present AND the caller is the admin — every other
// combination loads into memory and says so in meta.storage.

const { ok, fail, asyncH, nocache } = require('../envelope');
const ingest = require('../ingest');

const BATCH_ID_RE = /^ing-[a-z0-9]+-[a-z0-9]{3}$/;

function sendError(res, e) {
  if (e && e.status && e.code) return fail(res, e.status, e.code, e.message);
  throw e;
}

function register(router) {
  router.get('/ingest/tables', asyncH(async (req, res) => {
    const tables = ingest.listTables();
    ok(res, { tables, maxRows: ingest.MAX_ROWS, chunkSize: ingest.CHUNK, presets: ingest.PRESETS }, { source: 'schema-registry', count: tables.length, schema: 'docs/SCHEMA_CHECKLIST.md' });
  }));

  router.get('/ingest/template/:table.csv', asyncH(async (req, res) => {
    const t = ingest.tableDef(req.params.table);
    if (!t) return fail(res, 404, 'NOT_FOUND', `Unknown table "${req.params.table}".`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${t.name}_template.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(ingest.templateCsv(t, String(req.query.example || '') === '1'));
  }));

  router.post('/ingest/validate', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    if (!body.table) return fail(res, 400, 'BAD_REQUEST', 'table is required.');
    if (!ingest.tableDef(body.table)) return fail(res, 400, 'BAD_REQUEST', `Unknown table "${body.table}" — GET /ingest/tables lists the ER tables.`);
    if (!Array.isArray(body.columns) || !body.columns.length) return fail(res, 400, 'BAD_REQUEST', 'columns[] (the CSV header row) is required.');
    if (!Array.isArray(body.rows)) return fail(res, 400, 'BAD_REQUEST', 'rows[] is required.');
    if (body.rows.length > ingest.MAX_ROWS) return fail(res, 400, 'TOO_MANY_ROWS', `At most ${ingest.MAX_ROWS} rows per batch.`);
    if (body.mapping && typeof body.mapping !== 'object') return fail(res, 400, 'BAD_REQUEST', 'mapping must be an object {targetColumn: sourceHeader}.');
    if (body.mapping) {
      const t = ingest.tableDef(body.table);
      const bad = Object.keys(body.mapping).filter((k) => !t.columns.some((c) => c.name === k));
      if (bad.length) return fail(res, 400, 'BAD_REQUEST', `mapping targets unknown columns: ${bad.join(', ')}`);
    }
    try {
      const { batch, result } = await ingest.receive(ctx, body);
      if (!result) {
        return ok(res, { batchId: batch.batchId, status: batch.status, receivedRows: batch.raw.length }, { source: 'local', storage: 'memory', part: body.part });
      }
      const rowsOut = result.rows.map((r) => ({ rowNo: r.rowNo, verdict: r.verdict, keys: r.keys, issues: r.issues.map((is) => ({ code: is.code, column: is.column || null, severity: is.severity, detail: is.detail || null })) }));
      ok(res, Object.assign({ batchId: batch.batchId, status: batch.status, dryRun: true, resumeToken: ingest.resumeTokenFor(batch), whatChanged: batch.projected }, result, { rows: rowsOut }), {
        source: 'local', storage: 'memory', validator: 'lib/ingest.js', geo: ingest.pointInDistrict(12.97, 77.59, '0101') === null ? 'polygons-unavailable' : 'assets/karnataka_districts.geojson', count: rowsOut.length
      });
    } catch (e) {
      sendError(res, e);
    }
  }));

  router.post('/ingest/load', asyncH(async (req, res) => {
    const body = req.body || {};
    if (!body.batchId && !body.resumeToken) return fail(res, 400, 'BAD_REQUEST', 'batchId (or resumeToken) is required.');
    if (body.batchId && !BATCH_ID_RE.test(String(body.batchId))) return fail(res, 400, 'BAD_REQUEST', 'batchId is malformed.');
    if (body.resumeToken && !ingest.parseResumeToken(body.resumeToken)) return fail(res, 400, 'BAD_REQUEST', 'resumeToken is malformed.');
    try {
      const out = await ingest.load(req.ctx, req, body);
      ok(res, out, { source: out.storage === 'datastore' ? 'catalyst-datastore' : 'local', storage: out.storage, audit: out.audit ? out.audit.source : null });
    } catch (e) {
      sendError(res, e);
    }
  }));

  router.get('/ingest/batches', asyncH(async (req, res) => {
    const list = ingest.listBatches();
    ok(res, list, { source: 'local', storage: 'memory', count: list.length, note: 'Batches live in this container for 2 hours; a restart empties the list.' });
  }));

  router.get('/ingest/batches/:id', asyncH(async (req, res) => {
    if (!BATCH_ID_RE.test(String(req.params.id))) return fail(res, 400, 'BAD_REQUEST', 'batch id is malformed.');
    const b = ingest.getBatch(req.params.id);
    if (!b) return fail(res, 404, 'BATCH_NOT_FOUND', 'Batch not found in this container (2-hour TTL).');
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));
    const rejected = (b.rows || []).filter((r) => r.verdict === 'reject').slice(0, limit);
    ok(res, Object.assign(ingest.summarize(b), {
      mapping: b.mappingResolved || null, profile: b.profile || null, budget: b.budget || null, privacy: b.privacy || null,
      issueSummary: b.issueSummary || [], storeChecks: b.storeChecks || [], prerequisites: b.prerequisites || null,
      whatChanged: b.whatChanged || b.projected || null, rejected
    }), { source: 'local', storage: b.storage || 'memory', nocache: nocache(req) });
  }));

  router.get('/ingest/batches/:id/rejections.csv', asyncH(async (req, res) => {
    if (!BATCH_ID_RE.test(String(req.params.id))) return fail(res, 400, 'BAD_REQUEST', 'batch id is malformed.');
    const b = ingest.getBatch(req.params.id);
    if (!b) return fail(res, 404, 'BATCH_NOT_FOUND', 'Batch not found in this container (2-hour TTL).');
    if (b.status === 'receiving') return fail(res, 409, 'BATCH_STATE', 'Batch not validated yet.');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${b.batchId}_rejections.csv"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(ingest.rejectionCsv(b));
  }));

  router.post('/ingest/batches/:id/rollback', asyncH(async (req, res) => {
    if (!BATCH_ID_RE.test(String(req.params.id))) return fail(res, 400, 'BAD_REQUEST', 'batch id is malformed.');
    try {
      const out = await ingest.rollback(req.ctx, req, req.params.id);
      ok(res, out, { source: out.storage === 'datastore' ? 'catalyst-datastore' : 'local', storage: out.storage });
    } catch (e) {
      sendError(res, e);
    }
  }));
}

module.exports = { register };
