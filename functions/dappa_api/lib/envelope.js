'use strict';
// Response envelope + request helpers per CONTRACTS.md:
//   success {ok:true, data, meta}; error {ok:false, error:{code,message}}.

const { logJson, toNum } = require('./util');

function ok(res, data, meta) {
  res.json({ ok: true, data, meta: meta || {} });
}

function fail(res, status, code, message) {
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

function cacheKey(req) {
  const q = Object.entries(req.query || {})
    .filter(([k]) => k !== 'nocache')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `v1:${req.path}?${q}`;
}

function isAuthed(req) {
  if (req.headers && req.headers.authorization) return true;
  const admin = process.env.ADMIN_TOKEN;
  if (admin && req.headers && req.headers['x-admin-token'] === admin) return true;
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

function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logJson('info', 'http', {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms: Date.now() - start
      });
    });
    next();
  };
}

module.exports = { ok, fail, asyncH, commonFilters, pagination, nocache, cacheKey, isAuthed, requireAdmin, requestLogger };
