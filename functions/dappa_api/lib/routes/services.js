'use strict';
// Catalyst service-surface endpoints: coverage matrix, full-text search,
// authentication, mail digest, push notifications, artefact storage, circuit
// orchestration, OAuth connections, Zia OCR/translation and the model registry.
//
// Every handler here follows the same contract: attempt the real Catalyst
// service, degrade to a documented fallback, and report which path answered in
// meta.source. Nothing in this file can 500 a live demo.

const { ok, fail, asyncH, requireAdmin, nocache, cacheKey, ttlFor } = require('../envelope');
const { buildServiceMap, summarize } = require('../servicemap');
const { getFallbackState } = require('../fixture');
const search = require('../search');
const auth = require('../auth');
const mail = require('../mail');
const push = require('../push');
const artifacts = require('../artifacts');
const circuits = require('../circuits');
const zia = require('../zia');
const quickml = require('../quickml');
const { toNum } = require('../util');

const ARTIFACT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function register(router) {
  // -------------------------------------------------------------------------
  // Coverage matrix — the About page's evidence that the platform runs on
  // Catalyst services, with honest per-service status.
  // -------------------------------------------------------------------------
  router.get('/meta/services', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const rows = buildServiceMap(ctx);
    const fb = getFallbackState();
    ok(res, {
      services: rows,
      counts: summarize(rows),
      flags: ctx.flags,
      dataMode: fb.datastore ? 'fixture-demo' : 'live',
      generatedAt: new Date().toISOString()
    }, { source: 'runtime-introspection', count: rows.length });
  }));

  // -------------------------------------------------------------------------
  // Data Store full-text Search (fallback: ZCQL LIKE)
  // -------------------------------------------------------------------------
  router.get('/search/cases', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) return fail(res, 400, 'BAD_REQUEST', 'Provide a search term as ?q=');
    if (q.length > 200) return fail(res, 400, 'BAD_REQUEST', 'Search term too long (max 200 characters).');
    const ttl = ttlFor(req, 300);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => search.searchAll(ctx, {
      q, scope: req.query.scope, limit: toNum(req.query.limit, 20)
    }));
    ok(res, value, { source: value.source, cached, ttlSec: ttl, count: value.results.length });
  }));

  // -------------------------------------------------------------------------
  // Catalyst Authentication (fallback: anonymous PUBLIC_DEMO identity)
  // -------------------------------------------------------------------------
  router.get('/auth/me', asyncH(async (req, res) => {
    const identity = await auth.whoami(req.ctx, req);
    ok(res, identity, { source: identity.source });
  }));

  router.post('/auth/signin', asyncH(async (req, res) => {
    const out = await auth.signIn(req.ctx, req, req.body || {});
    if (!out.ok) return fail(res, 401, 'AUTH_FAILED', out.mode === 'invalid-token' ? 'Invalid credentials.' : 'No credentials supplied.');
    ok(res, out, { source: out.identity.source });
  }));

  router.post('/auth/signout', asyncH(async (req, res) => {
    const out = await auth.signOut(req.ctx, req);
    ok(res, out, { source: 'catalyst-auth' });
  }));

  router.get('/auth/users', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const out = await auth.listUsers(ctx);
    ok(res, out, { source: out.source, count: out.users.length });
  }));

  // -------------------------------------------------------------------------
  // Catalyst Mail (fallback: rendered preview)
  // -------------------------------------------------------------------------
  router.get('/admin/digest/preview', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const preview = await mail.buildDigest(ctx, { limit: toNum(req.query.limit, 10) });
    ok(res, {
      preview,
      to: mail.recipients(null),
      from: process.env.MAIL_FROM || null,
      wouldSend: Boolean(ctx.flags.mail && ctx.services.mailer)
    }, { source: 'fallback-local' });
  }));

  router.post('/admin/digest/send', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const out = await mail.sendDigest(ctx, {
      to: body.to,
      from: body.from,
      htmlMode: body.htmlMode,
      limit: toNum(body.limit, 10)
    });
    ok(res, out, { source: out.source });
  }));

  // -------------------------------------------------------------------------
  // Push Notifications (fallback: logged no-op preview)
  // -------------------------------------------------------------------------
  router.post('/notify/register', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const out = await push.registerRecipient(ctx, req.body || {});
    if (!out.ok) return fail(res, 400, 'BAD_REQUEST', out.reason);
    ok(res, out, { source: 'catalyst-cache' });
  }));

  router.post('/notify/unregister', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String((req.body || {}).recipient || (req.body || {}).id || '').trim();
    if (!id) return fail(res, 400, 'BAD_REQUEST', 'Provide the recipient to remove.');
    ok(res, await push.unregisterRecipient(ctx, id), { source: 'catalyst-cache' });
  }));

  router.get('/notify/recipients', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const list = await push.listRecipients(ctx);
    ok(res, { recipients: list, enabled: Boolean(ctx.flags.push && ctx.services.push) }, { count: list.length });
  }));

  router.post('/notify/push', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const message = String(body.message || body.text || '').trim();
    if (!message) return fail(res, 400, 'BAD_REQUEST', 'Provide {message}.');
    const out = await push.sendPush(ctx, message, {
      recipients: Array.isArray(body.recipients) ? body.recipients : null,
      reason: body.reason || 'manual'
    });
    ok(res, out, { source: out.source });
  }));

  // -------------------------------------------------------------------------
  // Artefact storage: File Store -> Stratus -> memory
  // -------------------------------------------------------------------------
  router.post('/reports/archive', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    const window = String(body.window || req.query.window || 'last30');
    const digest = await mail.buildDigest(ctx, { limit: 10 });
    const payload = {
      kind: 'weekly-brief',
      window,
      generatedAt: digest.generatedAt,
      subject: digest.subject,
      alerts: digest.alerts,
      topRisk: digest.topRisk
    };
    const out = await artifacts.putArtifact(ctx, {
      name: body.name || `weekly-brief-${window}.json`,
      contentType: 'application/json',
      kind: 'brief',
      body: JSON.stringify(payload, null, 2)
    });
    if (!out.ok) return fail(res, 400, 'BAD_REQUEST', out.reason);
    ok(res, Object.assign({ stored: true }, out.meta), { source: `store-${out.meta.storage}` });
  }));

  router.get('/reports/artifacts', asyncH(async (req, res) => {
    const list = await artifacts.listArtifacts(req.ctx);
    ok(res, list, { count: list.length });
  }));

  router.get('/reports/artifacts/:id', asyncH(async (req, res) => {
    const id = String(req.params.id);
    if (!ARTIFACT_ID_RE.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid artifact id.');
    const out = await artifacts.getArtifact(req.ctx, id);
    if (!out.ok) return fail(res, 404, 'NOT_FOUND', out.reason);
    ok(res, { meta: out.meta, body: out.body }, { source: out.source });
  }));

  // -------------------------------------------------------------------------
  // Circuits (fallback: the same steps sequentially in-process)
  // -------------------------------------------------------------------------
  router.post('/admin/circuit/nightly-refresh', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const record = await circuits.runNightlyRefresh(ctx, {
      trigger: body.trigger || 'api',
      send: Boolean(body.send)
    });
    ok(res, record, { source: record.source });
  }));

  router.get('/admin/circuit/:executionId', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const id = String(req.params.executionId);
    if (!ARTIFACT_ID_RE.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid execution id.');
    const record = await circuits.getExecution(ctx, id);
    if (!record) return fail(res, 404, 'NOT_FOUND', `No circuit execution ${id}.`);
    ok(res, record, { source: record.source });
  }));

  // -------------------------------------------------------------------------
  // Connections (OAuth) — credential reachability + a guarded outbound call.
  // Credentials are NEVER echoed back; only their presence is reported.
  // -------------------------------------------------------------------------
  router.get('/connections/status', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const linkName = String(process.env.CONNECTION_LINK_NAME || '').trim();
    const base = {
      enabled: Boolean(ctx.flags.connections),
      connectionLinkName: linkName || null,
      configured: Boolean(linkName)
    };
    if (!ctx.flags.connections || !ctx.services.connections || !linkName) {
      return ok(res, Object.assign(base, {
        reachable: false,
        mode: ctx.flags.connections ? 'console-pending' : 'disabled',
        note: 'Create the connection in the Catalyst console, set CONNECTION_LINK_NAME and FEATURE_CONNECTIONS=on.'
      }), { source: 'fallback-local' });
    }
    try {
      const creds = await ctx.services.connections.credentials(linkName);
      const token = creds && (creds.access_token || creds.accessToken);
      ok(res, Object.assign(base, {
        reachable: Boolean(token),
        mode: token ? 'connected' : 'no-token',
        hasAccessToken: Boolean(token),
        expiresIn: creds && (creds.expires_in || creds.expiresIn) ? Number(creds.expires_in || creds.expiresIn) : null
      }), { source: 'catalyst-connections' });
    } catch (e) {
      ok(res, Object.assign(base, {
        reachable: false, mode: 'error-fallback', error: String((e && e.message) || e)
      }), { source: 'fallback-local' });
    }
  }));

  router.post('/connections/invoke', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const linkName = String(process.env.CONNECTION_LINK_NAME || '').trim();
    const target = String((req.body || {}).url || process.env.CONNECTION_TARGET_URL || '').trim();
    if (!ctx.flags.connections || !ctx.services.connections || !linkName || !target) {
      return ok(res, {
        invoked: false,
        mode: 'not-configured',
        note: 'Needs FEATURE_CONNECTIONS=on, CONNECTION_LINK_NAME and a target Zoho service URL (CONNECTION_TARGET_URL or {url}).'
      }, { source: 'fallback-local' });
    }
    if (!/^https:\/\/[a-z0-9.-]+\.zoho(cloud)?\.(com|in|eu|com\.au|jp)\//i.test(target)) {
      return fail(res, 400, 'BAD_REQUEST', 'Target must be an https Zoho service URL.');
    }
    try {
      const creds = await ctx.services.connections.credentials(linkName);
      const token = creds && (creds.access_token || creds.accessToken);
      if (!token) throw new Error('connection returned no access token');
      const doFetch = ctx.services.fetchImpl || fetch;
      const resp = await doFetch(target, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      const text = await resp.text();
      ok(res, {
        invoked: true,
        mode: 'connected',
        status: resp.status,
        bodyPreview: String(text).slice(0, 500)
      }, { source: 'catalyst-connections' });
    } catch (e) {
      ok(res, { invoked: false, mode: 'error-fallback', error: String((e && e.message) || e) }, { source: 'fallback-local' });
    }
  }));

  // -------------------------------------------------------------------------
  // Zia: OCR over a FIR scan, and trilingual translation.
  // -------------------------------------------------------------------------
  router.post('/zia/ocr', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    if (!body.imageBase64 && !body.image && !body.file && !body.text) {
      return fail(res, 400, 'BAD_REQUEST', 'Provide {imageBase64} (a base64 FIR scan) or {text}.');
    }
    const { result, source } = await zia.ocrScan(body, { flags: ctx.flags, ziaClient: ctx.services.ziaClient });
    if (result.ok === false) return fail(res, 400, 'BAD_REQUEST', result.reason);
    ok(res, result, { source });
  }));

  router.post('/zia/translate', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const body = req.body || {};
    if (!body.text && !Array.isArray(body.texts)) {
      return fail(res, 400, 'BAD_REQUEST', 'Provide {text} or {texts:[...]}.');
    }
    const { result, source } = await zia.translate(body, { flags: ctx.flags, fetchImpl: ctx.services.fetchImpl });
    if (result.ok === false) return fail(res, 400, 'BAD_REQUEST', result.reason);
    ok(res, result, { source, count: (result.items || []).length });
  }));

  // -------------------------------------------------------------------------
  // Model registry / training status across QuickML, Zia AutoML and the local
  // models, so the AI page can show what is serving vs what needs a console step.
  // -------------------------------------------------------------------------
  router.get('/ml/models', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const models = quickml.modelRegistry({ flags: ctx.flags });
    const serving = models.filter((m) => m.status === 'serving').length;
    ok(res, {
      models,
      counts: {
        total: models.length,
        serving,
        consolePending: models.filter((m) => m.status === 'console-pending').length,
        disabled: models.filter((m) => m.status === 'disabled').length
      }
    }, { source: 'runtime-introspection', count: models.length });
  }));
}

module.exports = { register };
