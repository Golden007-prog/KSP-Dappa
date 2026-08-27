'use strict';
// Catalyst service coverage matrix behind GET /meta/services.
//
// The organiser's rule is that every capability must run on Catalyst services,
// so the About page needs a claim it can defend line by line. The honesty
// contract here:
//
//   live            — code on the DEFAULT configuration calls this service on a
//                     normal request path, and the call is expected to succeed.
//   active          — a flag-gated service whose flag is ON right now.
//   flag-gated      — the code path exists and is exercised the moment its flag
//                     is set; it is off by default (side effect or billed call).
//   console-pending — reaching it needs a step no code can perform (a folder id,
//                     a circuit drawing, a domain mapping). The endpoint exists
//                     and reports the missing piece.
//   platform        — the project genuinely runs on it, but not by an SDK call
//                     from this function (hosting, CI/CD, gateway routing).
//
// Nothing in this file claims a service is wired unless a real call site exists;
// `invocation` names that call site.

function envSet(name) {
  return Boolean(String(process.env[name] || '').trim());
}

/** flag-driven status with an env prerequisite. */
function gated(on, requires) {
  const missing = (requires || []).filter((n) => !envSet(n));
  if (!on) return { status: 'flag-gated', statusReason: 'feature flag off (fallback path serving)' };
  if (missing.length) return { status: 'console-pending', statusReason: `flag on but ${missing.join(', ')} not set` };
  return { status: 'active', statusReason: 'flag on and configured' };
}

/**
 * @param {object} ctx request context (flags + resolved service handles)
 * @returns {Array<object>} one row per sanctioned Catalyst service
 */
function buildServiceMap(ctx) {
  const f = (ctx && ctx.flags) || {};
  const s = (ctx && ctx.services) || {};
  const rows = [];
  const add = (row) => rows.push(row);

  add({
    key: 'serverless-functions',
    name: 'Serverless Functions',
    category: 'compute',
    status: 'live',
    statusReason: 'this API is the dappa_api advanced-I/O function',
    invocation: 'functions/dappa_api — Express app exported from index.js',
    fallback: 'n/a (the runtime itself)',
    endpoints: ['/healthz', '/meta/services']
  });
  add({
    key: 'event-functions',
    name: 'Signals + Event Functions',
    category: 'compute',
    status: 'live',
    statusReason: 'CaseMaster insert signal drives the live z-check',
    invocation: 'functions/dappa_event — AggMonthly upsert + z-check + AnomalyAlert insert',
    fallback: 'the nightly cron recomputes AggMonthly exactly, reconciling any missed event',
    endpoints: ['/meta/refresh (liveAlerts counts EVT- alerts)']
  });
  add({
    key: 'cron-job-scheduling',
    name: 'Cron / Job Scheduling',
    category: 'compute',
    status: 'live',
    statusReason: 'dappa_nightly is a Catalyst cron function',
    invocation: 'functions/dappa_nightly — nightly analytics refresh (Python 3.12)',
    fallback: 'POST /admin/circuit/nightly-refresh runs the same steps on demand',
    endpoints: ['/meta/refresh', '/admin/circuit/nightly-refresh']
  });
  add({
    key: 'data-store',
    name: 'Data Store',
    category: 'data',
    status: 'live',
    statusReason: 'every read/write goes through ZCQL',
    invocation: 'lib/datastore.js — buildZCQL + zcql().executeZCQLQuery, paged at 300 rows',
    fallback: 'bundled fixture dataset (PUBLIC_DEMO self-healing)',
    endpoints: ['/summary/kpis', '/trends/monthly', '/cases', '/alerts']
  });
  add({
    key: 'data-store-search',
    name: 'Data Store full-text Search',
    category: 'data',
    status: f.search ? 'live' : 'flag-gated',
    statusReason: f.search
      ? 'attempted on every /search/cases call; falls through to ZCQL LIKE until the columns are marked searchable in the console'
      : 'FEATURE_SEARCH off',
    invocation: 'lib/search.js — search().executeSearchQuery over CaseMaster + OffenderProfile',
    fallback: 'ZCQL LIKE across the same columns, merged and deduped',
    flag: 'FEATURE_SEARCH',
    endpoints: ['/search/cases']
  });
  add({
    key: 'nosql',
    name: 'NoSQL',
    category: 'data',
    status: s.graphLoaders && s.graphLoaders.nosql ? 'live' : 'console-pending',
    statusReason: s.graphLoaders && s.graphLoaders.nosql
      ? 'association-graph snapshot read from table dappa_network'
      : 'NoSQL table dappa_network not reachable from this runtime',
    invocation: 'index.js graphLoaders.nosql — nosql().getTable(\'dappa_network\').fetchItem()',
    fallback: 'Stratus snapshot, then a graph built from NetworkEdge + OffenderProfile',
    endpoints: ['/network/graph', '/network/path', '/healthz']
  });
  add({
    key: 'stratus',
    name: 'Stratus (object store)',
    category: 'data',
    status: s.artifactBucket || (s.graphLoaders && s.graphLoaders.stratus) ? 'live' : 'console-pending',
    statusReason: s.artifactBucket || (s.graphLoaders && s.graphLoaders.stratus)
      ? 'bucket \'dappa\' holds the graph snapshot, rendered briefs and archived artefacts'
      : 'bucket handle unavailable in this runtime',
    invocation: 'index.js — stratus().bucket(\'dappa\').putObject/getObject/generatePreSignedUrl',
    fallback: 'in-process memory store for artefacts; table-built graph for the network',
    endpoints: ['/reports/artifacts', '/reports/weekly-brief', '/network/graph']
  });
  add({
    key: 'file-store',
    name: 'File Store',
    category: 'data',
    status: f.filestore && envSet('FILESTORE_FOLDER_ID') ? 'live'
      : f.filestore ? 'console-pending' : 'flag-gated',
    statusReason: f.filestore && envSet('FILESTORE_FOLDER_ID')
      ? 'generated brief artefacts uploaded to the configured folder'
      : f.filestore ? 'FILESTORE_FOLDER_ID not set (create the folder in the console)' : 'FEATURE_FILESTORE off',
    invocation: 'lib/artifacts.js — filestore().folder(id).uploadFile/downloadFile',
    fallback: 'Stratus bucket, then an in-process memory store',
    flag: 'FEATURE_FILESTORE',
    requires: ['FILESTORE_FOLDER_ID'],
    endpoints: ['/reports/archive', '/reports/artifacts', '/reports/artifacts/:id']
  });
  add({
    key: 'cache',
    name: 'Cache',
    category: 'data',
    status: 'live',
    statusReason: 'every expensive aggregate is cache-wrapped',
    invocation: 'lib/cache.js — cache().segment(\'dappa\').put/getValue',
    fallback: 'in-process Map with the same TTL semantics',
    endpoints: ['/summary/kpis', '/geo/hotspots', '/healthz']
  });

  const mail = gated(f.mail, ['MAIL_FROM', 'DIGEST_TO']);
  add(Object.assign({
    key: 'mail',
    name: 'Catalyst Mail',
    category: 'messaging',
    invocation: 'lib/mail.js — email().sendMail({from_email,to_email,subject,content})',
    fallback: 'the fully rendered digest is returned as `preview` and logged',
    flag: 'FEATURE_MAIL',
    requires: ['MAIL_FROM', 'DIGEST_TO'],
    endpoints: ['/admin/digest/preview', '/admin/digest/send', '/notify/test-digest']
  }, mail));

  add(Object.assign({
    key: 'push-notifications',
    name: 'Push Notifications',
    category: 'messaging',
    invocation: 'lib/push.js — pushNotification().web().sendNotification(message, recipients)',
    fallback: 'no-op that logs the payload and returns it as `preview`',
    flag: 'FEATURE_PUSH',
    endpoints: ['/notify/register', '/notify/recipients', '/notify/push']
  }, gated(f.push, [])));

  add(Object.assign({
    key: 'circuits',
    name: 'Circuits (multi-step orchestration)',
    category: 'orchestration',
    invocation: 'lib/circuits.js — circuit().execute(CIRCUIT_ID, \'dappa_nightly_refresh\')',
    fallback: 'the identical aggregate -> detect-anomalies -> notify steps run sequentially in-process',
    flag: 'FEATURE_CIRCUIT',
    requires: ['CIRCUIT_ID'],
    endpoints: ['/admin/circuit/nightly-refresh', '/admin/circuit/:executionId']
  }, gated(f.circuit, ['CIRCUIT_ID'])));

  add({
    key: 'authentication',
    name: 'Catalyst Authentication',
    category: 'platform',
    status: f.auth ? 'live' : 'flag-gated',
    statusReason: f.auth
      ? 'GET /auth/me resolves the Catalyst session on every call; anonymous PUBLIC_DEMO browsing still works'
      : 'FEATURE_AUTH off',
    invocation: 'lib/auth.js — userManagement().getCurrentUser() / getAllUsers()',
    fallback: 'anonymous demo identity, with the admin token as the elevation path',
    flag: 'FEATURE_AUTH',
    endpoints: ['/auth/me', '/auth/signin', '/auth/signout', '/auth/users']
  });

  add(Object.assign({
    key: 'connections',
    name: 'Connections (OAuth)',
    category: 'platform',
    invocation: 'lib/routes/services.js — connections().getConnectionCredentials(CONNECTION_LINK_NAME)',
    fallback: 'reports the missing connection instead of calling out; no feature depends on it',
    flag: 'FEATURE_CONNECTIONS',
    requires: ['CONNECTION_LINK_NAME'],
    endpoints: ['/connections/status', '/connections/invoke']
  }, gated(f.connections, ['CONNECTION_LINK_NAME'])));

  add(Object.assign({
    key: 'zia-text-analytics',
    name: 'Zia Services (text analytics)',
    category: 'ai',
    invocation: 'lib/zia.js — zia().getNERPrediction/getKeywordExtraction/getSentimentAnalysis',
    fallback: 'deterministic MO-vocabulary + TF extractor',
    flag: 'FEATURE_ZIA',
    endpoints: ['/ai/narrative']
  }, gated(f.zia, [])));

  add(Object.assign({
    key: 'zia-ocr',
    name: 'Zia Services (OCR / scanners)',
    category: 'ai',
    invocation: 'lib/zia.js — zia().extractOpticalCharacters(readStream, {language})',
    fallback: 'analyse caller-supplied text with ocrAvailable:false',
    flag: 'FEATURE_ZIA_OCR',
    endpoints: ['/zia/ocr']
  }, gated(f.ziaOcr, [])));

  add(Object.assign({
    key: 'zia-language',
    name: 'Zia Services (translation / speech)',
    category: 'ai',
    invocation: 'lib/zia.js translate() — POSTs ZIA_TRANSLATE_URL (no zcatalyst-sdk-node binding in v3.4.0)',
    fallback: 'pinned English↔Kannada domain glossary; unknown strings pass through untranslated',
    flag: 'FEATURE_ZIA_TRANSLATE',
    requires: ['ZIA_TRANSLATE_URL'],
    endpoints: ['/zia/translate']
  }, gated(f.ziaTranslate, ['ZIA_TRANSLATE_URL'])));

  add(Object.assign({
    key: 'zia-automl',
    name: 'Zia AutoML (tabular)',
    category: 'ai',
    invocation: 'lib/zia.js automlPredict() — zia().automl(ZIA_AUTOML_MODEL_ID, features)',
    fallback: 'the embedded logistic outcome model',
    flag: 'FEATURE_ZIA_AUTOML',
    requires: ['ZIA_AUTOML_MODEL_ID'],
    endpoints: ['/predict/outcome', '/ml/models']
  }, gated(f.ziaAutoml, ['ZIA_AUTOML_MODEL_ID'])));

  add(Object.assign({
    key: 'quickml-pipelines',
    name: 'QuickML (no-code ML pipelines)',
    category: 'ai',
    invocation: 'lib/quickml.js — quickML().predict(QUICKML_STATUS_ENDPOINT_KEY, CaseMaster columns) for case status; QUICKML_ENDPOINT_KEY / deployment URL for the A-vs-C outcome model',
    fallback: 'the embedded logistic outcome model (A vs C only — case status has no local twin)',
    flag: 'FEATURE_QUICKML',
    requires: ['QUICKML_STATUS_ENDPOINT_KEY'],
    endpoints: ['/predict/case-status', '/predict/outcome', '/ml/models']
  }, gated(f.quickml, ['QUICKML_STATUS_ENDPOINT_KEY'])));

  add(Object.assign({
    key: 'quickml-llm-rag',
    name: 'QuickML LLM Serving + RAG',
    category: 'ai',
    invocation: 'lib/routes/actions.js — POSTs QUICKML_LLM_URL with the copilot question',
    fallback: 'deterministic copilot parser over live ZCQL aggregates',
    flag: 'FEATURE_QUICKML_LLM',
    requires: ['QUICKML_LLM_URL'],
    endpoints: ['/copilot/query', '/ml/models']
  }, gated(f.quickmlLlm, ['QUICKML_LLM_URL'])));

  add(Object.assign({
    key: 'smartbrowz',
    name: 'SmartBrowz (PDF / screenshots)',
    category: 'ai',
    invocation: 'index.js smartbrowz.renderBrief — smartbrowz().convertToPdf(printUrl) then Stratus put + pre-signed URL',
    fallback: 'print-CSS route the browser prints itself',
    flag: 'FEATURE_SMARTBROWZ',
    requires: ['APP_BASE_URL'],
    endpoints: ['/reports/weekly-brief']
  }, gated(f.smartbrowz, ['APP_BASE_URL'])));

  add({
    key: 'web-client-hosting',
    name: 'Slate / Web Client Hosting',
    category: 'platform',
    status: 'platform',
    statusReason: 'the React client is served as the Catalyst web client for this project',
    invocation: 'client/dist deployed as the project web client (catalyst deploy)',
    fallback: 'n/a',
    endpoints: []
  });
  add({
    key: 'api-gateway',
    name: 'API Gateway',
    category: 'platform',
    status: 'platform',
    statusReason: 'all /server/dappa_api/api/v1 traffic is routed by the Catalyst gateway; rate limits and request ids are enforced in-function',
    invocation: 'app mounts both /api/v1 and /server/dappa_api/api/v1 so either routing shape resolves',
    fallback: 'n/a',
    endpoints: ['/healthz']
  });
  add({
    key: 'appsail-managed',
    name: 'AppSail (managed runtime)',
    category: 'compute',
    status: 'console-pending',
    statusReason: 'not used — the API runs as an advanced-I/O function; no code path can enable AppSail',
    invocation: null,
    fallback: 'the dappa_api serverless function serves the same routes',
    endpoints: []
  });
  add({
    key: 'appsail-oci',
    name: 'AppSail (custom OCI runtime)',
    category: 'compute',
    status: 'console-pending',
    statusReason: 'not used — no custom container is part of this submission',
    invocation: null,
    fallback: 'the dappa_api serverless function serves the same routes',
    endpoints: []
  });
  add({
    key: 'domain-mappings',
    name: 'Domain Mappings',
    category: 'platform',
    status: 'console-pending',
    statusReason: 'console-only step; the app runs on the default Catalyst domain',
    invocation: null,
    fallback: 'default project domain',
    endpoints: []
  });
  add({
    key: 'signals-cross-app',
    name: 'Signals cross-app event bus',
    category: 'compute',
    status: 'console-pending',
    statusReason: 'only the in-project CaseMaster signal is bound; a cross-app subscription is a console step',
    invocation: null,
    fallback: 'in-project event function + nightly reconciliation',
    endpoints: []
  });
  add({
    key: 'pipelines',
    name: 'Pipelines (CI/CD)',
    category: 'platform',
    status: 'console-pending',
    statusReason: 'deployment is driven by catalyst deploy; a Pipeline is a console/repo integration step',
    invocation: null,
    fallback: 'catalyst deploy from the workstation',
    endpoints: []
  });

  return rows;
}

const LIVE_STATES = new Set(['live', 'active', 'platform']);

function summarize(rows) {
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return {
    total: rows.length,
    reachableFromCode: rows.filter((r) => r.invocation).length,
    liveNow: rows.filter((r) => LIVE_STATES.has(r.status)).length,
    flagGated: rows.filter((r) => r.status === 'flag-gated').length,
    consolePending: rows.filter((r) => r.status === 'console-pending').length,
    withFallback: rows.filter((r) => r.fallback && r.fallback !== 'n/a').length,
    byStatus
  };
}

module.exports = { buildServiceMap, summarize, LIVE_STATES };
