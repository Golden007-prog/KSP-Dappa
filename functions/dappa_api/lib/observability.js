'use strict';
// In-function request telemetry behind GET /meta/observability (backlog row
// 163). Catalyst APM and Logs are console surfaces: the 3.4.0 SDK vendors
// lib/apminsight (the Site24x7 agent, which needs a Site24x7 licence key —
// not a Catalyst credential) and exposes no read API for either, so the card
// on /about is fed by this ring buffer and says so. Nothing here leaves the
// container; it is the same data the requestLogger already prints per line.

const WINDOW = 500;
const bootAt = Date.now();
const ring = [];

function record(entry) {
  ring.push(entry);
  if (ring.length > WINDOW) ring.shift();
}

/** Express middleware — mount first on the API router. */
function middleware() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const path = String(req.route && req.route.path ? req.route.path : (req.path || req.url || '')).split('?')[0];
      record({ t: start, ms: Date.now() - start, status: res.statusCode, path, method: req.method });
    });
    next();
  };
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Summary over the ring buffer. Pure over the buffer state. */
function summary(now) {
  const t = now || Date.now();
  const entries = ring.slice();
  const ms = entries.map((e) => e.ms).sort((a, b) => a - b);
  const errors = entries.filter((e) => e.status >= 500).length;
  const clientErrors = entries.filter((e) => e.status >= 400 && e.status < 500).length;
  const byRoute = new Map();
  for (const e of entries) {
    const k = `${e.method} ${e.path}`;
    const r = byRoute.get(k) || { route: k, count: 0, totalMs: 0, maxMs: 0, errors: 0 };
    r.count += 1;
    r.totalMs += e.ms;
    r.maxMs = Math.max(r.maxMs, e.ms);
    if (e.status >= 500) r.errors += 1;
    byRoute.set(k, r);
  }
  const routes = [...byRoute.values()]
    .map((r) => ({ route: r.route, count: r.count, avgMs: Math.round(r.totalMs / r.count), maxMs: r.maxMs, errors: r.errors }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    window: { size: WINDOW, sampled: entries.length, sinceIso: entries.length ? new Date(entries[0].t).toISOString() : null },
    requests: entries.length,
    errors5xx: errors,
    errors4xx: clientErrors,
    errorRatePct: entries.length ? Math.round((errors / entries.length) * 1000) / 10 : 0,
    p50Ms: pct(ms, 50),
    p95Ms: pct(ms, 95),
    maxMs: ms.length ? ms[ms.length - 1] : null,
    routes,
    uptimeSec: Math.round((t - bootAt) / 1000),
    apm: {
      available: false,
      note: 'Catalyst APM is enabled and read in the console (DevOps > APM); the Node SDK exposes no read API and its vendored apminsight agent needs a Site24x7 licence key, so this card reports in-function telemetry instead.'
    },
    logs: {
      available: false,
      note: 'Catalyst Logs (DevOps > Logs, 7-day retention in development) hold the structured lines this function prints per request; there is no SDK read path.'
    },
    source: 'in-process'
  };
}

/** Test hook. */
function reset() {
  ring.length = 0;
}

module.exports = { middleware, summary, record, reset, WINDOW };
