'use strict';
// Catalyst Advanced I/O entry point: export the Express app.
// The Catalyst SDK is initialized per request; every Catalyst-only capability
// is wrapped so local `node` runs and tests degrade to fallbacks, never crash.

const fs = require('fs');
const catalyst = require('zcatalyst-sdk-node');
const { createApp } = require('./lib/app');
const { logJson } = require('./lib/util');

function initCatalyst(req) {
  try {
    return catalyst.initialize(req);
  } catch (e) {
    return null;
  }
}

function clientFactory(req) {
  let capp = null;
  let tried = false;
  return {
    async execute(sql) {
      if (!tried) { capp = initCatalyst(req); tried = true; }
      if (!capp) throw new Error('catalyst unavailable');
      return capp.zcql().executeZCQLQuery(sql);
    }
  };
}

// One cache instance per function container; the segment getter binds lazily
// to the first request's SDK app (Cache is project-scoped, not user-scoped).
let segmentSource = null;
const { createCache } = require('./lib/cache');
const cache = createCache({
  getSegment: async () => {
    if (!segmentSource) return null;
    try {
      const c = segmentSource.cache();
      const segments = await c.getAllSegment();
      const named = segments.find((s) => s.segmentName === 'dappa');
      return named || c.segment();
    } catch (e) {
      return null;
    }
  }
});

/** Lazily resolve a Catalyst service handle; a missing service must never
 * throw at wiring time (the fallback chains handle absence). */
function svc(capp, get) {
  try {
    return get(capp);
  } catch (e) {
    return null;
  }
}

function servicesFactory(req) {
  const capp = initCatalyst(req);
  if (capp && !segmentSource) segmentSource = capp;
  if (!capp) return {};
  const stratusBucket = () => capp.stratus().bucket(process.env.STRATUS_BUCKET || 'dappa');
  const folderId = String(process.env.FILESTORE_FOLDER_ID || '').trim();
  return {
    ziaClient: svc(capp, (a) => a.zia()),
    quickmlClient: svc(capp, (a) => a.quickML()),

    // Data Store full-text Search — results keyed by table name.
    search: {
      execute: async (query) => capp.search().executeSearchQuery(query)
    },

    // Catalyst Authentication (User Management).
    auth: {
      currentUser: async () => capp.userManagement().getCurrentUser(),
      allUsers: async () => capp.userManagement().getAllUsers()
    },

    // Push Notifications, web channel.
    push: {
      web: async (message, recipients) => capp.pushNotification().web().sendNotification(message, recipients)
    },

    // File Store — needs a console-created folder; absent folderId disables the link.
    filestore: folderId ? {
      folderId,
      upload: async ({ name, filePath }) => capp.filestore().folder(folderId)
        .uploadFile({ code: fs.createReadStream(filePath), name }),
      download: async (fileId) => capp.filestore().folder(folderId).downloadFile(fileId)
    } : null,

    // Stratus bucket used for archived brief artefacts.
    artifactBucket: {
      put: async (key, body, contentType) => stratusBucket().putObject(key, body, contentType ? { contentType } : undefined),
      get: async (key) => {
        const obj = await stratusBucket().getObject(key);
        return typeof obj === 'string' ? obj : obj && obj.toString ? obj.toString() : null;
      },
      signedUrl: async (key) => {
        const signed = await stratusBucket().generatePreSignedUrl(key, 'GET');
        return (signed && (signed.signature || signed.url)) || null;
      }
    },

    // Circuits — the circuit itself is drawn in the console, so its id is env-supplied.
    circuit: {
      execute: async (name, input) => capp.circuit().execute(process.env.CIRCUIT_ID, name, input),
      status: async (execId) => capp.circuit().status(process.env.CIRCUIT_ID, execId)
    },

    // Connections (OAuth) — credentials are used in-process and never returned.
    connections: {
      credentials: async (linkName) => capp.connections().getConnectionCredentials(linkName)
    },

    graphLoaders: {
      // NoSQL snapshot: item 'graph' in table 'dappa_network' holding the JSON.
      nosql: async () => {
        const table = await capp.nosql().getTable('dappa_network');
        const resp = await table.fetchItem({ keys: [{ partition_key: { name: { S: 'graph' } } }] });
        const item = resp && resp.toJSON ? resp.toJSON() : resp;
        const rawDoc = item && (item.graph || (Array.isArray(item) && item[0] && item[0].graph));
        if (!rawDoc) return null;
        return typeof rawDoc === 'string' ? JSON.parse(rawDoc) : rawDoc;
      },
      // Stratus static copy written by the analytics pass.
      stratus: async () => {
        const bucket = capp.stratus().bucket('dappa');
        const obj = await bucket.getObject('network_graph.json');
        const text = typeof obj === 'string' ? obj : obj && obj.toString ? obj.toString() : null;
        return text ? JSON.parse(text) : null;
      }
    },
    smartbrowz: {
      renderBrief: async (window) => {
        const base = process.env.APP_BASE_URL || '';
        const pdf = await capp.smartbrowz().convertToPdf(`${base}/print/brief?window=${encodeURIComponent(window)}`);
        const bucket = capp.stratus().bucket('dappa');
        const key = `briefs/weekly-brief-${Date.now()}.pdf`;
        await bucket.putObject(key, pdf);
        const signed = await bucket.generatePreSignedUrl(key, 'GET');
        return { pdfUrl: (signed && (signed.signature || signed.url)) || null };
      }
    },
    mailer: {
      // `to` accepts a string (legacy callers) or an array of addresses.
      send: async ({ from, to, subject, content, htmlMode }) => capp.email().sendMail({
        from_email: from,
        to_email: Array.isArray(to) ? to : [to].filter(Boolean),
        subject,
        content,
        html_mode: Boolean(htmlMode)
      })
    }
  };
}

const app = createApp({ clientFactory, servicesFactory, cache });

logJson('info', 'boot', { fn: 'dappa_api', node: process.version });

module.exports = app;
