'use strict';
// Express app factory. index.js wires the real Catalyst SDK; tests inject a
// stubbed datastore/cache/services and exercise the same routes.

const express = require('express');
const { createDatastore } = require('./datastore');
const { createCache } = require('./cache');
const { getFlags } = require('./flags');
const { wrapClientWithFixtureFallback } = require('./fixture');
const { requestLogger, requestId, rateLimit, fail } = require('./envelope');

const readRoutes = require('./routes/read');
const insightRoutes = require('./routes/insight');
const casesRoutes = require('./routes/cases');
const actionsRoutes = require('./routes/actions');
const extrasRoutes = require('./routes/extras');

/**
 * @param {object} [options]
 * @param {function} [options.clientFactory] (req) => datastore client {execute(sql, q)}
 * @param {object}   [options.cache] cache instance (created once if omitted)
 * @param {function} [options.servicesFactory] (req) => { ziaClient, graphLoaders, smartbrowz, mailer, fetchImpl }
 * @param {object}   [options.flags] fixed flags (default: env-driven per request)
 */
function createApp(options) {
  const o = options || {};
  const app = express();
  app.disable('x-powered-by');
  // Correlation + throttling run before body parsing so even malformed
  // requests carry X-Request-Id and rate-limit headers.
  app.use(requestId());
  app.use(rateLimit());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger());

  const cache = o.cache || createCache();

  app.use((req, res, next) => {
    const flags = o.flags || getFlags();
    const rawClient = o.clientFactory ? o.clientFactory(req) : {
      async execute() { throw new Error('datastore client not configured'); }
    };
    // PUBLIC_DEMO self-healing: if a real ZCQL call fails (e.g. Data Store
    // tables not created yet), the same query is answered from the bundled
    // fixture dataset so the live demo never breaks.
    const client = flags.publicDemo ? wrapClientWithFixtureFallback(rawClient) : rawClient;
    req.ctx = {
      ds: createDatastore(client),
      // Unwrapped datastore for diagnostics (healthz completeness): reports the
      // REAL Data Store state, never the fixture's — forced-fixture tables
      // would otherwise masquerade fixture row counts as live data.
      dsRaw: createDatastore(rawClient),
      cache,
      flags,
      services: o.servicesFactory ? (o.servicesFactory(req) || {}) : {}
    };
    next();
  });

  const router = express.Router();
  readRoutes.register(router);
  // extras before insight: /alerts/summary and /offenders/mo-patterns must
  // match ahead of the /alerts/:id and /offenders/:personKey param routes.
  extrasRoutes.register(router);
  insightRoutes.register(router);
  casesRoutes.register(router);
  actionsRoutes.register(router);

  // Catalyst strips the /server/<function>/ prefix in some contexts and keeps
  // it in others (local serve); mount both so every path resolves.
  app.use('/api/v1', router);
  app.use('/server/dappa_api/api/v1', router);

  app.use((req, res) => {
    fail(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
  });

  // Express error handler (bad JSON bodies etc.) — keep the envelope.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (!res.headersSent) fail(res, err.status || 500, 'INTERNAL', err.message || 'internal error');
  });

  return app;
}

module.exports = { createApp };
