'use strict';
// Round-2 phase 8 — new Catalyst service surfaces: Data Store OLAP, Zia object
// recognition + image moderation, the OCR attach audit flow, Job Scheduling as
// the nightly-refresh path, in-function observability, Stratus pre-signed
// artefact links, SmartBrowz map screenshots, auth roles per tier, the QuickML
// AutoML challenger and the LLM composer with its numeric firewall.
//
// Same contract as lib/routes/services.js: attempt the Catalyst service,
// degrade to a documented fallback, report which path answered in meta.source
// (and meta.engine for OLAP). Registered FIRST on the router so the
// observability middleware sees every request.

const fs = require('fs');
const path = require('path');
const { ok, fail, asyncH, requireAdmin, nocache, cacheKey } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const { getFallbackState } = require('../fixture');
const { ymAdd, toNum, parseJsonSafe } = require('../util');
const olap = require('../olap');
const objects = require('../objects');
const moderation = require('../moderation');
const ocrAttach = require('../ocr_attach');
const jobs = require('../jobs');
const observability = require('../observability');
const artifacts = require('../artifacts');
const auth = require('../auth');
const challenger = require('../challenger');
const composer = require('../composer');
const copilot = require('../copilot');
const zia = require('../zia');

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const YM_RE = /^\d{4}-\d{2}$/;
const OCR_MANIFEST = path.join(__dirname, '..', '..', 'assets', 'ocr_manifest.json');
const CUBE_TTL_SEC = 900;
const SNAPSHOT_TTL_SEC = 6 * 3600;
const SCENE_TTL_SEC = 6 * 3600;

// Per-IP budget for the two anonymous routes that spend a metered Zia call.
// requireAdmin is not an option on either: /zia/objects is what the FIR-detail
// evidence card calls for a judge with no token, and /zia/moderate is the OCR
// page's intake guard. The demo-shaped ceiling is generous (a judge cannot
// reach it by clicking) but a loop cannot burn the pooled Zia allowance.
const aiSpend = new Map(); // ip -> { count, resetAt }

function aiBudgetPerHour() {
  return Math.max(1, Number(process.env.AI_BUDGET_PER_HOUR || 40) || 40);
}

function overAiBudget(req, res) {
  const now = Date.now();
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  let h = aiSpend.get(ip);
  if (!h || h.resetAt <= now) { h = { count: 0, resetAt: now + 3600000 }; aiSpend.set(ip, h); }
  h.count += 1;
  if (aiSpend.size > 500) for (const [k, v] of aiSpend) if (v.resetAt <= now) aiSpend.delete(k);
  const limit = aiBudgetPerHour();
  res.setHeader('X-AI-Budget-Remaining', String(Math.max(0, limit - h.count)));
  if (h.count > limit) {
    fail(res, 429, 'AI_BUDGET', `This demo allows ${limit} Zia calls per hour from one address; the cached and fixture paths still answer.`);
    return true;
  }
  return false;
}

/** Test hook — forget the per-IP AI budget between suites. */
function resetAiBudget() { aiSpend.clear(); }

function ocrSamples() {
  try {
    const m = JSON.parse(fs.readFileSync(OCR_MANIFEST, 'utf8'));
    return Array.isArray(m.samples) ? m.samples : [];
  } catch (e) {
    return [];
  }
}

async function ymWindowFrom(ctx, q) {
  const anchor = await anchorYm(ctx.ds, null);
  const to = YM_RE.test(String(q.to || '')) ? String(q.to) : anchor;
  const from = YM_RE.test(String(q.from || '')) ? String(q.from) : ymAdd(to, -11);
  return { from, to };
}

function register(router) {
  router.use(observability.middleware());

  // -------------------------------------------------------------------------
  // Data Store OLAP (fallback: paged ZCQL)
  // -------------------------------------------------------------------------
  router.get('/meta/olap-benchmark', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const { from, to } = await ymWindowFrom(ctx, req.query);
    if (from > to) return fail(res, 400, 'BAD_REQUEST', 'from must not be after to.');
    const { value, cached } = await olap.benchmark(ctx, from, to, nocache(req));
    ok(res, value, { source: value.legs.olap && value.legs.olap.ok ? 'catalyst-olap' : 'fallback-local', cached, ttlSec: 24 * 3600, engineState: olap.olapState() });
  }));

  router.get('/olap/cube', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const { from, to } = await ymWindowFrom(ctx, req.query);
    if (from > to) return fail(res, 400, 'BAD_REQUEST', 'from must not be after to.');
    const lk = await getLookups(ctx);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), CUBE_TTL_SEC, nocache(req), async () => {
      const out = await olap.queryAll(ctx, olap.cubeQuery(from, to), { maxRows: 6000 });
      const cells = out.rows.map((r) => ({
        districtId: String(r.DistrictID),
        crimeHeadId: toNum(r.CrimeHeadID),
        ym: String(r.Ym),
        caseCount: toNum(r['SUM(CaseCount)']),
        heinousCount: toNum(r['SUM(HeinousCount)'])
      }));
      const byDistrict = new Map();
      const byHead = new Map();
      const byMonth = new Map();
      for (const c of cells) {
        byDistrict.set(c.districtId, (byDistrict.get(c.districtId) || 0) + c.caseCount);
        byHead.set(c.crimeHeadId, (byHead.get(c.crimeHeadId) || 0) + c.caseCount);
        byMonth.set(c.ym, (byMonth.get(c.ym) || 0) + c.caseCount);
      }
      return {
        fromYm: from,
        toYm: to,
        districts: [...byDistrict.entries()].map(([id, n]) => ({ districtId: id, districtName: lk.districtName(id), caseCount: n })).sort((a, b) => b.caseCount - a.caseCount),
        heads: [...byHead.entries()].map(([id, n]) => ({ crimeHeadId: id, headName: lk.headName(id), caseCount: n })).sort((a, b) => b.caseCount - a.caseCount),
        months: [...byMonth.entries()].map(([ym, n]) => ({ ym, caseCount: n })).sort((a, b) => a.ym.localeCompare(b.ym)),
        cells,
        total: cells.reduce((s, c) => s + c.caseCount, 0),
        engine: out.engine,
        engineMs: out.ms,
        pages: out.pages === undefined ? null : out.pages,
        truncated: Boolean(out.truncated),
        note: out.note || null
      };
    });
    ok(res, value, { source: value.engine === 'olap' ? 'catalyst-olap' : 'datastore', engine: value.engine, cached, ttlSec: CUBE_TTL_SEC, count: value.cells.length });
  }));

  // -------------------------------------------------------------------------
  // Zia image moderation — the intake guard, also callable on its own.
  // -------------------------------------------------------------------------
  router.post('/zia/moderate', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const buf = moderation.decodeImage(body.imageBase64 || body.image || body.file);
    if (!buf) return fail(res, 400, 'BAD_REQUEST', 'Provide {imageBase64} (a base64 image or data: URI).');
    if (ctx.flags.ziaModeration && overAiBudget(req, res)) return;
    const out = await moderation.moderateImage(buf, { flags: ctx.flags, ziaClient: ctx.services.ziaClient, mode: body.mode });
    if (!out.ok) return fail(res, 400, 'BAD_REQUEST', out.reason);
    ok(res, out, { source: out.source });
  }));

  // -------------------------------------------------------------------------
  // Zia object recognition on synthetic evidence scenes (fallback: manifest)
  // -------------------------------------------------------------------------
  router.get('/zia/objects/samples', asyncH(async (req, res) => {
    const scenes = objects.listScenes();
    ok(res, { scenes, baseUrl: 'samples/scenes/' }, { source: 'fixture', count: scenes.length });
  }));

  router.post('/zia/objects', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const buf = moderation.decodeImage(body.imageBase64 || body.image || body.file);
    const sceneId = body.sceneId ? String(body.sceneId) : null;
    if (!buf && !sceneId) return fail(res, 400, 'BAD_REQUEST', 'Provide {imageBase64} or a demo {sceneId}.');
    if (sceneId && !objects.sceneById(sceneId)) return fail(res, 404, 'NOT_FOUND', `Unknown sceneId ${sceneId}.`);
    const caseId = body.caseId ? String(body.caseId) : null;
    if (!buf && ctx.flags.ziaObjects && overAiBudget(req, res)) return;
    // The FIR-detail card asks for the same three scenes on every page view.
    // Cache the scene path (6 h) so a browsing judge spends at most one Zia
    // call per scene per container; an uploaded image is never cached.
    const readScene = async () => {
      let guard = null;
      if (buf) {
        guard = await moderation.guardUpload(buf, { flags: ctx.flags, ziaClient: ctx.services.ziaClient });
        if (!guard.ok) return { blocked: guard.reason };
      }
      const out = await objects.detectObjects({ buffer: buf, sceneId }, { flags: ctx.flags, ziaClient: ctx.services.ziaClient });
      let narrativeTags = [];
      if (caseId && /^\d{1,10}$/.test(caseId)) {
        try {
          const rows = await ctx.ds.query({ table: 'CaseMaster', columns: ['BriefFacts'], where: [{ col: 'CaseMasterID', op: '=', val: Number(caseId) }], limit: { count: 1 } });
          narrativeTags = rows.length ? zia.extractLocal(rows[0].BriefFacts || '').moTags : [];
        } catch (e) { narrativeTags = []; }
      }
      return {
        value: Object.assign({}, out, {
          caseId,
          narrativeTags,
          mergedMoTags: [...new Set([...(out.moTags || []), ...narrativeTags])],
          moderation: guard ? guard.moderation : null
        })
      };
    };
    let result;
    let cached = false;
    if (!buf && sceneId) {
      const hit = await ctx.cache.wrap(`v1:zia-objects:${sceneId}:${caseId || ''}`, SCENE_TTL_SEC, nocache(req), async () => (await readScene()).value);
      result = { value: hit.value };
      cached = hit.cached;
    } else {
      result = await readScene();
    }
    if (result.blocked) return fail(res, 400, 'BLOCKED', result.blocked);
    ok(res, result.value, { source: result.value.source, count: result.value.objects.length, cached });
  }));

  // -------------------------------------------------------------------------
  // OCR client surface: demo scans + the attach-to-case audit row.
  // -------------------------------------------------------------------------
  router.get('/ocr/samples', asyncH(async (req, res) => {
    const samples = ocrSamples();
    ok(res, { samples, baseUrl: 'samples/ocr/' }, { source: 'fixture', count: samples.length });
  }));

  router.post('/ocr/attach', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const caseId = String(body.caseId || '').trim();
    if (!/^\d{1,10}$/.test(caseId)) return fail(res, 400, 'BAD_REQUEST', 'Provide a numeric {caseId}.');
    if (!String(body.text || '').trim()) return fail(res, 400, 'BAD_REQUEST', 'Provide the recovered {text} to attach.');
    const identity = await auth.whoami(ctx, req);
    const out = await ocrAttach.attachOcr(ctx, req, body, identity);
    ok(res, out, { source: out.source });
  }));

  router.get('/ocr/attachments', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const caseId = String(req.query.caseId || '').trim();
    if (!/^\d{1,10}$/.test(caseId)) return fail(res, 400, 'BAD_REQUEST', 'Provide ?caseId=<number>.');
    const out = await ocrAttach.recentFor(ctx, caseId);
    const rows = out.rows.map((r) => ({
      rowid: r.ROWID ? String(r.ROWID) : null,
      actor: r.Actor || null,
      actorRole: r.ActorRole || null,
      outcomeLabel: r.OutcomeLabel || null,
      clientTs: r.ClientTs || null,
      createdAt: r.CREATEDTIME || null,
      payload: parseJsonSafe(r.Payload, null)
    }));
    ok(res, { caseId, rows }, { source: out.source, count: rows.length });
  }));

  // -------------------------------------------------------------------------
  // Job Scheduling (fallback: the same steps inline)
  // -------------------------------------------------------------------------
  router.post('/admin/jobs/nightly-refresh', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const rec = await jobs.submitNightly(ctx, { trigger: body.trigger || 'api', send: Boolean(body.send) });
    ok(res, rec, { source: rec.source });
  }));

  router.get('/admin/jobs/pools', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const out = await jobs.listPools(ctx);
    ok(res, Object.assign({ configuredPool: String(process.env.JOB_POOL_NAME || '') || null }, out), { source: out.source, count: out.pools.length });
  }));

  router.get('/admin/jobs/:jobId', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const id = String(req.params.jobId);
    if (!ID_RE.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid job id.');
    const rec = await jobs.getJob(ctx, id);
    if (!rec) return fail(res, 404, 'NOT_FOUND', `No job ${id}.`);
    ok(res, rec, { source: rec.source });
  }));

  // Nightly-run observability (public read) — RefreshMeta + the last job.
  router.get('/meta/nightly', asyncH(async (req, res) => {
    const ctx = req.ctx;
    let nightly = null;
    try {
      const rows = await ctx.ds.query({ table: 'RefreshMeta', columns: ['RefreshedAt', 'DetailsJson'], orderBy: { col: 'RefreshedAt', desc: true }, limit: { count: 1 } });
      if (rows.length) nightly = { refreshedAt: rows[0].RefreshedAt, details: parseJsonSafe(rows[0].DetailsJson, null) };
    } catch (e) { nightly = null; }
    const last = await jobs.lastRun(ctx);
    const refreshedMs = nightly && nightly.refreshedAt ? Date.parse(String(nightly.refreshedAt).replace(' ', 'T')) : NaN;
    const fb = getFallbackState();
    ok(res, {
      nightly,
      ageHours: Number.isFinite(refreshedMs) ? Math.max(0, Math.round(((Date.now() - refreshedMs) / 3600000) * 10) / 10) : null,
      lastJob: last ? {
        jobId: last.jobId, mode: last.mode, status: last.status, submittedAt: last.submittedAt, startedAt: last.startedAt,
        finishedAt: last.finishedAt, executionMs: last.executionMs, retriedCount: last.retriedCount, jobpool: last.jobpool,
        steps: (last.steps || []).map((s) => ({ name: s.name, status: s.status, ms: s.ms === undefined ? null : s.ms })), source: last.source
      } : null,
      scheduler: {
        cron: 'dappa_nightly (Catalyst cron function, 02:00 IST)',
        jobsEnabled: Boolean(ctx.flags.jobs),
        pool: String(process.env.JOB_POOL_NAME || '') || null,
        retries: Number(process.env.JOB_RETRIES || 2),
        retryIntervalSec: Number(process.env.JOB_RETRY_INTERVAL_SEC || 900),
        mode: jobs.jobsConfigured(ctx) ? 'job-scheduling' : ctx.flags.jobs ? 'console-pending' : 'cron-only'
      },
      dataMode: fb.datastore ? 'fixture-demo' : 'live'
    }, { source: last && last.source === 'catalyst-jobs' ? 'catalyst-jobs' : 'datastore' });
  }));

  router.get('/meta/observability', asyncH(async (req, res) => {
    const s = observability.summary();
    ok(res, s, { source: s.source, count: s.requests });
  }));

  // -------------------------------------------------------------------------
  // Stratus pre-signed download link for an archived artefact
  // -------------------------------------------------------------------------
  router.get('/reports/artifacts/:id/url', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String(req.params.id);
    if (!ID_RE.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid artifact id.');
    const list = await artifacts.listArtifacts(ctx);
    const meta = list.find((m) => m.artifactId === id);
    if (!meta) return fail(res, 404, 'NOT_FOUND', 'not found');
    const expiresInSec = Math.min(3600, Math.max(60, toNum(req.query.expiresIn, 900)));
    if (meta.storage === 'stratus' && meta.key && ctx.services.artifactBucket && ctx.services.artifactBucket.signedUrl) {
      try {
        const url = await ctx.services.artifactBucket.signedUrl(meta.key, expiresInSec);
        if (url) return ok(res, { artifactId: id, storage: 'stratus', key: meta.key, url, expiresInSec, mode: 'pre-signed' }, { source: 'catalyst-stratus' });
      } catch (e) {
        return ok(res, { artifactId: id, storage: meta.storage, key: meta.key, url: `/api/v1/reports/artifacts/${id}`, expiresInSec: null, mode: 'api-proxy', note: `pre-signed URL unavailable (${String((e && e.message) || e).slice(0, 120)}); the API serves the body` }, { source: 'fallback-local' });
      }
    }
    ok(res, { artifactId: id, storage: meta.storage, key: meta.key || null, url: `/api/v1/reports/artifacts/${id}`, expiresInSec: null, mode: 'api-proxy', note: meta.storage === 'stratus' ? 'no signing handle in this runtime' : `artefact stored in ${meta.storage}; only Stratus objects get pre-signed links` }, { source: 'fallback-local' });
  }));

  // -------------------------------------------------------------------------
  // SmartBrowz screenshot of the hotspot map (fallback: the static map)
  // -------------------------------------------------------------------------
  // Guarded: every call spends a metered SmartBrowz render AND writes a
  // Stratus object, so it is a write-ish route even though it reads a map.
  // ?nocache is deliberately ignored here (an anonymous loop with nocache=1
  // was five renders and five objects); the 6 h cache is the budget, and the
  // hourly object key means a repeat inside the hour overwrites one object
  // instead of accumulating timestamped ones.
  router.post('/reports/map-snapshot', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const districtId = String(body.districtId || req.query.districtId || '').trim();
    if (districtId && !/^\d{3,4}$/.test(districtId)) return fail(res, 400, 'BAD_REQUEST', 'districtId must be a 3-4 digit id.');
    const key = `v1:map-snapshot:${districtId || 'state'}`;
    // noOptions: a bare takeScreenshot(url) probe — SmartBrowz merges option
    // keys into the top level of its request body and rejects unknown ones.
    const noOptions = Boolean(body.noOptions);
    const { value, cached } = await ctx.cache.wrap(key, SNAPSHOT_TTL_SEC, false, () => artifacts.captureMapSnapshot(ctx, { districtId, noOptions }));
    ok(res, value, { source: value.source, cached, ttlSec: SNAPSHOT_TTL_SEC, nocacheHonoured: false });
  }));

  // -------------------------------------------------------------------------
  // Auth roles per officer tier + invites
  // -------------------------------------------------------------------------
  router.get('/auth/roles', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const identity = await auth.whoami(ctx, req);
    const configured = {};
    for (const tier of auth.TIERS) {
      const v = String(process.env[`AUTH_ROLE_ID_${tier.toUpperCase()}`] || '').trim();
      configured[tier] = v ? 'set' : null;
    }
    ok(res, {
      you: { role: identity.role, tier: identity.tier, roleSource: identity.roleSource, authenticated: identity.authenticated },
      mapping: auth.ROLE_TIER_RULES,
      roleIds: configured,
      embedEnabled: Boolean(ctx.flags.authEmbed),
      publicDemo: Boolean(ctx.flags.publicDemo),
      note: 'Custom roles (Constable, SHO, SP, DGP) are created in the console under Authentication > Roles; their ids go into AUTH_ROLE_ID_<TIER>. Development projects register at most 25 users.'
    }, { source: identity.source });
  }));

  router.post('/auth/invite', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const tier = String(body.tier || 'station').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'BAD_REQUEST', 'Provide a valid {email}.');
    if (!auth.TIERS.includes(tier)) return fail(res, 400, 'BAD_REQUEST', `tier must be one of ${auth.TIERS.join(', ')}.`);
    const out = await auth.inviteUser(ctx, { email, tier, firstName: body.firstName, lastName: body.lastName });
    ok(res, out, { source: out.source });
  }));

  // -------------------------------------------------------------------------
  // QuickML AutoML challenger + LLM composer (numeric firewall)
  // -------------------------------------------------------------------------
  router.post('/predict/outcome/challenger', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const out = await challenger.predictChallenger(req.body || {}, { flags: ctx.flags, quickmlClient: ctx.services.quickmlClient });
    ok(res, out, { source: out.source });
  }));

  router.post('/copilot/compose', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const q = String(body.q || body.query || body.text || '').trim();
    if (!q) return fail(res, 400, 'BAD_REQUEST', 'Provide a question as {q}.');
    const tier = String(body.tier || 'district');
    const lk = await getLookups(ctx);
    const deterministic = await copilot.answer(q, { ds: ctx.ds, lk });
    const out = await composer.composeAnswer(q, deterministic, { flags: ctx.flags, fetchImpl: ctx.services.fetchImpl }, { tier });
    ok(res, Object.assign({ tier }, out), { source: out.source });
  }));
}

module.exports = { register, resetAiBudget, aiBudgetPerHour };
