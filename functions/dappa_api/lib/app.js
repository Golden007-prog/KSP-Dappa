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
const servicesRoutes = require('./routes/services');
const netlinksRoutes = require('./routes/netlinks');
const behaviourRoutes = require('./routes/behaviour');
const facesRoutes = require('./routes/faces');
const tiersRoutes = require('./routes/tiers');
const actionlogRoutes = require('./routes/actionlog');
const surfacesRoutes = require('./routes/surfaces');
const ingestRoutes = require('./routes/ingest');
const depthRoutes = require('./routes/depth');

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
  // Face probes (≤4 MB, ~5.4 MB as base64) get a wider body limit on their
  // paths only; everything else keeps the 1 MB gate.
  app.use(['/api/v1/identify', '/server/dappa_api/api/v1/identify', '/api/v1/admin/faces', '/server/dappa_api/api/v1/admin/faces'], express.json({ limit: '6mb' }));
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
  surfacesRoutes.register(router); // first: its observability middleware must see every request
  readRoutes.register(router);
  // services before insight/actions: /reports/artifacts and /admin/circuit/*
  // must match ahead of any later param route on the same prefix.
  servicesRoutes.register(router);
  // extras before insight: /alerts/summary and /offenders/mo-patterns must
  // match ahead of the /alerts/:id and /offenders/:personKey param routes.
  extrasRoutes.register(router);
  // Same rule for the link-analysis and behavioural routes: /network/... and
  // /offenders/mo-evolution have to win over the later param routes.
  netlinksRoutes.register(router);
  behaviourRoutes.register(router);
  facesRoutes.register(router);
  tiersRoutes.register(router);
  actionlogRoutes.register(router);
  ingestRoutes.register(router);
  depthRoutes.register(router);
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
