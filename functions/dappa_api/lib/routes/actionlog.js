'use strict';
// Action-loop endpoints (Round 2, Phase 7): the write path for officer
// decisions on alerts, the per-alert timeline, the recent-actions feed that
// drives the in-app notification centre, the "what happened to past alerts"
// analytics, and the digest (JSON + Catalyst Mail behind FEATURE_MAIL).
//
// Who may write: anyone. The record IS the audit trail — an anonymous demo
// visitor's decision is stored with actorSource:'client' and the role the
// tier switcher claims, a Catalyst-authenticated user's with the identity the
// session resolves (lib/auth.js whoami). What stays gated is the mutation of
// AnomalyAlert.Status itself (PUBLIC_DEMO read-only rule, same as
// /alerts/:id/ack): acknowledge/dismiss flip the status only for an
// authenticated or admin-token caller, and the response says whether it did.

const { ok, fail, asyncH, requireAdmin, isAuthed, nocache, cacheKey } = require('../envelope');
const { getLookups } = require('../lookups');
const auth = require('../auth');
const push = require('../push');
const mail = require('../mail');
const actionlog = require('../actionlog');
const { buildActionDigest } = require('../actiondigest');
const { toNum } = require('../util');

const EPOCH_KEY = 'v1:actionlog:epoch';
const OUTCOMES_TTL = 60;
const RECENT_MAX = 200;

async function resolveIdentity(ctx, req, body) {
  const b = body || {};
  const me = await auth.whoami(ctx, req);
  if (me.authenticated && me.source === 'catalyst-auth') {
    const u = me.user || {};
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return { actor: u.email || name || u.userId || 'catalyst-user', actorRole: me.role || 'viewer', actorSource: 'catalyst-auth', canMutateStatus: true };
  }
  if (isAuthed(req)) {
    return { actor: String(b.actor || 'demo-admin').trim() || 'demo-admin', actorRole: String(b.actorRole || 'admin'), actorSource: 'admin-token', canMutateStatus: true };
  }
  const role = String(b.actorRole || 'viewer').toLowerCase().trim();
  // Anonymous NEVER flips AnomalyAlert.Status — not only in PUBLIC_DEMO. The
  // record is the audit trail and anyone may add to it (D-phase7-2), but the
  // alert's own state is a write that has to be attributable, and keying that
  // off the demo flag meant a real deployment with PUBLIC_DEMO off accepted an
  // unauthenticated status change.
  return {
    actor: String(b.actor || '').trim() || 'anonymous',
    actorRole: actionlog.ROLE_VALUES.includes(role) ? role : 'viewer',
    actorSource: 'client',
    canMutateStatus: false
  };
}

async function bumpEpoch(ctx) {
  try { await ctx.cache.put(EPOCH_KEY, Date.now(), 86400); } catch (e) { /* cache is best-effort */ }
}

async function epoch(ctx) {
  try {
    const hit = await ctx.cache.get(EPOCH_KEY);
    return hit && hit.value ? String(hit.value) : '0';
  } catch (e) {
    return '0';
  }
}

function register(router) {
  // -------------------------------------------------------------------------
  // Analytics + digest come BEFORE the write/timeline param routes so that
  // /alerts/outcomes and /alerts/digest never fall into /alerts/:alertKey.
  // -------------------------------------------------------------------------
  router.get('/alerts/outcomes', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const window = String(req.query.window || 'all');
    const windowDays = actionlog.windowDaysOf(window);
    const unit = req.query.unit ? String(req.query.unit).trim() : '';
    const key = `${cacheKey(req)}#${await epoch(ctx)}`;
    const { value, cached } = await ctx.cache.wrap(key, OUTCOMES_TTL, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const [alerts, listed] = await Promise.all([
        actionlog.readAlerts(ctx, lk),
        actionlog.listActions(ctx, {})
      ]);
      const scoped = unit ? alerts.filter((a) => String(a.unitId || '') === unit || String(a.districtId || '') === unit) : alerts;
      const out = actionlog.computeOutcomes(scoped, listed.actions, { now: Date.now(), windowDays, untouchedLimit: toNum(req.query.limit, 10) });
      out.windowLabel = windowDays ? `last${windowDays}` : 'all';
      out.unit = unit || null;
      out.storage = listed.storage;
      out.totalActions = listed.actions.length;
      out.generatedAt = new Date().toISOString();
      return out;
    });
    ok(res, value, { cached, ttlSec: OUTCOMES_TTL, source: actionlog.sourceOf(value.storage), storage: value.storage });
  }));

  router.get('/alerts/digest', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const digest = await buildActionDigest(ctx, { unit: req.query.unit, days: toNum(req.query.days, 7) });
    ok(res, digest, { source: actionlog.sourceOf(digest.storage), storage: digest.storage, wouldSend: Boolean(ctx.flags.mail && ctx.services.mailer) });
  }));

  // Catalyst Mail behind FEATURE_MAIL; the rendered digest always comes back
  // as `preview`, and `mode` says exactly why nothing was sent.
  router.post('/alerts/digest/send', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const body = req.body || {};
    const digest = await buildActionDigest(ctx, { unit: body.unit, days: toNum(body.days, 7) });
    const out = await mail.sendDigest(ctx, { preview: digest, to: body.to, from: body.from, htmlMode: body.htmlMode });
    if (!out.sent) {
      out.fallback = { page: `/alerts/digest${body.unit ? `?unit=${encodeURIComponent(body.unit)}` : ''}`, note: 'The digest is served as this JSON and as the printable /alerts/digest page until Catalyst Mail has a console-verified sender (MAIL_FROM) and DIGEST_TO.' };
    }
    ok(res, out, { source: out.source, mode: out.mode });
  }));

  router.get('/actions/recent', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const days = Math.max(1, Math.min(365, toNum(req.query.days, 7)));
    const limit = Math.max(1, Math.min(RECENT_MAX, toNum(req.query.limit, 50)));
    const unit = req.query.unit ? String(req.query.unit).trim() : '';
    const subjectType = req.query.subjectType ? String(req.query.subjectType).toLowerCase().trim() : '';
    if (subjectType && !actionlog.SUBJECT_TYPES.includes(subjectType)) {
      return fail(res, 400, 'BAD_SUBJECT_TYPE', `subjectType must be one of ${actionlog.SUBJECT_TYPES.join(', ')}.`);
    }
    const sinceMs = Date.now() - days * 86400000;
    const listed = await actionlog.listActions(ctx, {
      unit: unit || undefined,
      subjectType: subjectType || undefined,
      sinceDs: actionlog.toDsDatetime(new Date(sinceMs)),
      limit
    });
    ok(res, listed.actions, {
      count: listed.actions.length, days, unit: unit || null, subjectType: subjectType || null,
      since: new Date(sinceMs).toISOString(), storage: listed.storage, source: actionlog.sourceOf(listed.storage)
    });
  }));

  router.get('/alerts/:alertKey/actions', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.alertKey);
    if (!actionlog.KEY_RE.test(key)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    const listed = await actionlog.listActions(ctx, { alertKey: key });
    const timeline = listed.actions.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const outcomes = timeline.filter((x) => x.actionType === 'outcome' && x.outcomeLabel);
    ok(res, {
      alertKey: key,
      timeline,
      summary: {
        count: timeline.length,
        acknowledged: timeline.some((x) => x.actionType === 'acknowledge'),
        dismissed: timeline.some((x) => x.actionType === 'dismiss'),
        escalated: timeline.some((x) => x.actionType === 'escalate'),
        assignedTo: (timeline.filter((x) => x.actionType === 'assign').pop() || {}).assignTo || null,
        latestOutcome: outcomes.length ? outcomes[outcomes.length - 1].outcomeLabel : null,
        firstActionAt: timeline.length ? timeline[0].clientTs : null,
        lastActionAt: timeline.length ? timeline[timeline.length - 1].clientTs : null
      }
    }, { count: timeline.length, storage: listed.storage, source: actionlog.sourceOf(listed.storage) });
  }));

  router.post('/alerts/:alertKey/actions', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.alertKey);
    if (!actionlog.KEY_RE.test(key)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    const body = req.body || {};
    const identity = await resolveIdentity(ctx, req, body);
    const out = await actionlog.recordAction(ctx, req, Object.assign({}, body, { subjectType: body.subjectType || 'alert', subjectKey: key }), identity);
    if (!out.ok) return fail(res, 400, out.code, out.message);
    const action = out.action;
    let statusUpdated = false;
    let statusReason = null;
    if (action.subjectType === 'alert' && (action.actionType === 'acknowledge' || action.actionType === 'dismiss')) {
      if (identity.canMutateStatus) {
        try {
          const next = action.actionType === 'acknowledge' ? 'ACK' : 'DISMISSED';
          await ctx.ds.raw(`UPDATE AnomalyAlert SET Status='${next}' WHERE AlertID='${key.replace(/'/g, "''")}'`);
          statusUpdated = true;
        } catch (e) {
          statusReason = `status write failed: ${String((e && e.message) || e).slice(0, 120)}`;
        }
      } else {
        statusReason = ctx.flags.publicDemo
          ? 'public demo is read-only for AnomalyAlert.Status; the decision is recorded in the action log'
          : "an unauthenticated caller may record a decision but not change the alert's own status; the decision is recorded in the action log";
      }
    }
    let pushed = null;
    if (!out.duplicate && (action.actionType === 'escalate' || action.actionType === 'assign')) {
      const target = action.actionType === 'escalate' ? `${action.toTier} tier` : action.assignTo;
      pushed = await push.sendPush(ctx, `DAPPA: alert ${key} ${action.actionType === 'escalate' ? 'escalated to' : 'assigned to'} ${target} by ${action.actor}`, { reason: action.actionType });
    }
    if (!out.duplicate) await bumpEpoch(ctx);
    ok(res, {
      action,
      duplicate: Boolean(out.duplicate),
      statusUpdated,
      statusReason,
      push: pushed ? { mode: pushed.mode, delivered: pushed.delivered || 0, source: pushed.source } : null,
      identity: { actor: identity.actor, actorRole: identity.actorRole, actorSource: identity.actorSource }
    }, { storage: out.storage, source: actionlog.sourceOf(out.storage), fallbackReason: out.fallbackReason || undefined });
  }));
}

module.exports = { register };
