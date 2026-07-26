'use strict';
// Response envelope + request helpers per CONTRACTS.md:
//   success {ok:true, data, meta}; error {ok:false, error:{code,message}}.

const crypto = require('crypto');
const { logJson, toNum } = require('./util');

/** X-Response-Time on every envelope response (start stamped by requestId()). */
function timing(res) {
  const req = res.req;
  if (req && req._dappaStart && !res.headersSent) {
    res.setHeader('X-Response-Time', `${Date.now() - req._dappaStart}ms`);
  }
}

function ok(res, data, meta) {
  timing(res);
  const req = res.req;
  if (req && req.method === 'GET') {
    // Weak ETag over the data payload only — meta carries volatile fields
    // (cached, generatedAt) that must not defeat 304 revalidation. Paired with
    // Cache-Control: no-cache the browser always revalidates but unchanged
    // answers cost a bodyless 304 instead of a full payload.
    const etag = `W/"${crypto.createHash('sha1').update(JSON.stringify(data === undefined ? null : data)).digest('base64url')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    const inm = String(req.headers['if-none-match'] || '');
    if (inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
      res.status(304).end();
      return;
    }
  }
  res.json({ ok: true, data, meta: meta || {} });
}

function fail(res, status, code, message) {
  timing(res);
  res.status(status).json({ ok: false, error: { code, message } });
}

function asyncH(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      logJson('error', 'handler_error', { path: req.path, message: err && err.message });
      if (!res.headersSent) fail(res, 500, 'INTERNAL', (err && err.message) || 'internal error');
    });
  };
}

/** Common filters: from,to,districtId,unitId,crimeHeadId,crimeSubHeadId,gravityId. */
function commonFilters(req) {
  const q = req.query || {};
  return {
    from: q.from || null,
    to: q.to || null,
    districtId: q.districtId || null,
    unitId: q.unitId || null,
    crimeHeadId: q.crimeHeadId ? toNum(q.crimeHeadId, null) : null,
    crimeSubHeadId: q.crimeSubHeadId ? toNum(q.crimeSubHeadId, null) : null,
    gravityId: q.gravityId ? toNum(q.gravityId, null) : null
  };
}

/** 1-based pagination, perPage <= 200 default 50. */
function pagination(req) {
  const page = Math.max(1, toNum((req.query || {}).page, 1) || 1);
  const perPage = Math.min(200, Math.max(1, toNum((req.query || {}).perPage, 50) || 50));
  return { page, perPage, offset: (page - 1) * perPage };
}

function nocache(req) {
  return String((req.query || {}).nocache || '') === '1';
}

// Per-endpoint cache TTL policy (seconds). Volatile reads (refresh status,
// alert triage) expire fast; heavy stable aggregations (seasonality, hotspot
// clusters, correlations) live longer. Routes surface the applied TTL as
// meta.ttlSec so clients can align their own staleTime.
const ROUTE_TTL = {
  '/summary/kpis': 300,
  '/trends/monthly': 600,
  '/trends/compare': 600,
  '/trends/seasonality': 900,
  '/trends/category-share': 600,
  '/geo/districts': 600,
  '/geo/stations': 600,
  '/geo/incidents': 180,
  '/geo/hotspots': 900,
  '/meta/refresh': 120,
  '/reports/brief-data': 600,
  '/insight/socio-correlation': 900,
  '/insight/emerging': 600,
  '/alerts/summary': 120,
  '/offenders/mo-patterns': 900,
  '/network/communities': 900,
  // Link-analysis + behavioural aggregates: each one pages thousands of rows,
  // so they get the long end of the TTL range. The per-offender routes carry a
  // param and cannot be keyed here — they pass their default to ttlFor().
  '/network/victim-links': 600,
  '/network/locations': 900,
  '/network/communities/score': 900,
  '/offenders/mo-evolution': 900
};

function ttlFor(req, dflt) {
  return ROUTE_TTL[req.path] || dflt || 600;
}

function cacheKey(req) {
  const q = Object.entries(req.query || {})
    .filter(([k]) => k !== 'nocache')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `v1:${req.path}?${q}`;
}

// Demo admin credential: the PUBLIC_DEMO gate is only meaningful if the token
// must actually MATCH (a bare `Authorization: x` must not unlock writes).
// ADMIN_TOKEN env overrides; the default is documented for judging and guards
// synthetic data only.
const DEMO_ADMIN_TOKEN = 'demo-admin';

function adminToken() {
  return process.env.ADMIN_TOKEN || DEMO_ADMIN_TOKEN;
}

function isAuthed(req) {
  const h = (req && req.headers) || {};
  const token = adminToken();
  if (h['x-admin-token'] && String(h['x-admin-token']) === token) return true;
  const auth = String(h.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === token) return true;
  return false;
}

/** Admin actions (ack, digest): 403 in PUBLIC_DEMO mode without auth. */
function requireAdmin(req, res, flags) {
  if (flags.publicDemo && !isAuthed(req)) {
    fail(res, 403, 'AUTH_REQUIRED', 'This action requires authentication (public demo mode is read-only).');
    return false;
  }
  return true;
}

// Correlation id: echo a sane client-provided X-Request-Id or mint one, so a
// UI error toast and the matching Catalyst function log line share an id.
const RID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function requestId() {
  let seq = 0;
  return (req, res, next) => {
    req._dappaStart = Date.now();
    seq = (seq + 1) % 1e6;
    const given = String(req.headers['x-request-id'] || '');
    req.requestId = RID_RE.test(given) ? given : `req-${Date.now().toString(36)}-${seq.toString(36)}`;
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}

/** Fixed-window per-IP limiter. Headers are always surfaced; 429 only past the
 * (generous, env-tunable) budget so a runaway client cannot starve the demo. */
function rateLimit() {
  const limit = Math.max(1, toNum(process.env.RATE_LIMIT_PER_MIN, 600) || 600);
  const windowMs = 60000;
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    let h = hits.get(ip);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(ip, h);
    }
    h.count += 1;
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - h.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(h.resetAt / 1000)));
    if (h.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((h.resetAt - now) / 1000))));
      return fail(res, 429, 'RATE_LIMITED', 'Too many requests — retry after the rate-limit window resets.');
    }
    next();
  };
}

function requestLogger() {
  return (req, res, next) => {
    const start = req._dappaStart || Date.now();
    res.on('finish', () => {
      logJson('info', 'http', {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms: Date.now() - start,
        requestId: req.requestId || undefined
      });
    });
    next();
  };
}

module.exports = { ok, fail, asyncH, commonFilters, pagination, nocache, cacheKey, ttlFor, ROUTE_TTL, isAuthed, requireAdmin, requestId, rateLimit, requestLogger, DEMO_ADMIN_TOKEN };
