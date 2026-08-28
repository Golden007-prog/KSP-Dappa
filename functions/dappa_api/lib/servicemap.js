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
// Services the Catalyst documentation lists as not offered in the IN data
// centre (this project runs on .catalystserverless.in). The code path stays,
// the flag stays off, and the row says so instead of pretending a console
// step could flip it.
function unavailableInDc(name, source) {
  return { status: 'unavailable', statusReason: `${name} is documented as not available in the IN data centre (${source}); the in-process fallback serves` };
}

function gated(on, requires) {
  const missing = (requires || []).filter((n) => !envSet(n));
  if (!on) return { status: 'flag-gated', statusReason: 'feature flag off (fallback path serving)' };
  if (missing.length) return { status: 'console-pending', statusReason: `flag on but ${missing.join(', ')} not set` };
  return { status: 'active', statusReason: 'flag on and configured' };
}

/** Keep gated()'s status but say what a live probe of the service found — a
 * row is wired and configured and can still not work as this app uses it. */
function probed(g, note) {
  return g.status === 'active' ? Object.assign({}, g, { statusReason: `${g.statusReason}; ${note}` }) : g;
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
  add(Object.assign({
    key: 'data-store-olap',
    name: 'Data Store OLAP database',
    category: 'data',
    invocation: 'lib/olap.js — zcql().executeOLAPQuery(sql) for the district x head x month cube and the nightly detect step',
    fallback: 'the identical structured query through the paged 300-row ZCQL path (executeZCQLQuery)',
    flag: 'FEATURE_OLAP',
    requires: ['OLAP_ENABLED'],
    endpoints: ['/olap/cube', '/meta/olap-benchmark', '/admin/jobs/nightly-refresh']
  }, gated(f.olap, ['OLAP_ENABLED'])));

  const mail = gated(f.mail, ['MAIL_FROM', 'DIGEST_TO']);
  add(Object.assign({
    key: 'mail',
    name: 'Catalyst Mail',
    category: 'messaging',
    invocation: 'lib/mail.js — email().sendMail({from_email,to_email,subject,content}); the action-loop digest (lib/actiondigest.js) goes through the same sendDigest',
    fallback: 'the fully rendered digest is returned as `preview` and logged; the action-loop digest is also served as JSON and the printable /alerts/digest page',
    flag: 'FEATURE_MAIL',
    requires: ['MAIL_FROM', 'DIGEST_TO'],
    endpoints: ['/admin/digest/preview', '/admin/digest/send', '/notify/test-digest', '/alerts/digest', '/alerts/digest/send']
  }, mail));

  add(Object.assign({
    key: 'push-notifications',
    name: 'Push Notifications',
    category: 'messaging',
    invocation: 'lib/push.js — pushNotification().web().sendNotification(message, recipients); an alert escalate/assign action (lib/routes/actionlog.js) pushes through the same sendPush',
    fallback: 'no-op that logs the payload and returns it as `preview`; the in-app notification centre reads the same events from /actions/recent',
    flag: 'FEATURE_PUSH',
    endpoints: ['/notify/register', '/notify/recipients', '/notify/push', '/alerts/:alertKey/actions', '/actions/recent']
  }, gated(f.push, [])));

  add(Object.assign({
    key: 'circuits',
    name: 'Circuits (multi-step orchestration)',
    category: 'orchestration',
    invocation: 'lib/circuits.js — circuit().execute(CIRCUIT_ID, \'dappa_nightly_refresh\')',
    fallback: 'Job Scheduling (lib/jobs.js, FEATURE_JOBS) submits the same nightly refresh with retries; without a job pool the identical aggregate -> detect-anomalies -> notify steps run sequentially in-process',
    flag: 'FEATURE_CIRCUIT',
    requires: ['CIRCUIT_ID'],
    endpoints: ['/admin/circuit/nightly-refresh', '/admin/circuit/:executionId']
  }, unavailableInDc('Circuits', 'docs/CATALYST_SERVICE_RESEARCH.md §3')));

  add(Object.assign({
    key: 'job-scheduling',
    name: 'Job Scheduling (job pool + retries)',
    category: 'orchestration',
    invocation: 'lib/jobs.js — jobScheduling().job().submitJob({target_type:\'Function\', target_name:\'dappa_nightly\', jobpool_name, job_config:{number_of_retries, retry_interval}}) / getJob(id)',
    fallback: 'the same three nightly steps run inline (lib/circuits.js runInline) and are reported in the job shape',
    flag: 'FEATURE_JOBS',
    requires: ['JOB_POOL_NAME'],
    endpoints: ['/admin/jobs/nightly-refresh', '/admin/jobs/:jobId', '/admin/jobs/pools', '/meta/nightly']
  }, gated(f.jobs, ['JOB_POOL_NAME'])));

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
    key: 'zia-face-analytics',
    name: 'Zia Face Analytics (detection quality gate)',
    category: 'ai',
    invocation: 'lib/faces.js qualityGate() — zia().analyseFace(readStream, {mode:\'moderate\'}) before any comparison',
    fallback: 'advisory gate (decodable still image, dimensions, aspect) with gate.mode:\'advisory\' — never a fake detection',
    flag: 'FEATURE_FACE_ID',
    endpoints: ['/identify', '/identify/model-card']
  }, gated(f.faceId, [])));

  add(Object.assign({
    key: 'zia-identity-scanner',
    name: 'Zia Identity Scanner (1:1 face comparison)',
    category: 'ai',
    invocation: 'lib/faces.js ziaCompare() — zia().compareFace(galleryStream, probeStream) per shortlisted candidate (≤ FACE_ZIA_MAX_COMPARES, cached 24 h)',
    fallback: 'local descriptor engine — cosine similarity over the generator\'s parameter space (meta.engine local-descriptor)',
    flag: 'FEATURE_FACE_ID',
    endpoints: ['/identify', '/identify/gallery', '/identify/audit', '/identify/rules', '/identify/model-card']
  }, gated(f.faceId, [])));

  add(Object.assign({
    key: 'zia-automl',
    name: 'Zia AutoML (tabular)',
    category: 'ai',
    invocation: 'lib/zia.js automlPredict() — zia().automl(ZIA_AUTOML_MODEL_ID, features)',
    fallback: 'the embedded logistic outcome model',
    flag: 'FEATURE_ZIA_AUTOML',
    requires: ['ZIA_AUTOML_MODEL_ID'],
    endpoints: ['/predict/outcome', '/ml/models']
  }, unavailableInDc('Zia AutoML', 'docs/CATALYST_SERVICE_RESEARCH.md §5')));

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
    invocation: 'index.js smartbrowz.renderBrief — smartbrowz().convertToPdf(printUrl) then Stratus put + pre-signed URL; lib/artifacts.js captureMapSnapshot — smartbrowz().takeScreenshot(mapUrl, {page_options, screenshot_options})',
    fallback: 'print-CSS route the browser prints itself; the static map image in place of the screenshot',
    flag: 'FEATURE_SMARTBROWZ',
    requires: ['APP_BASE_URL'],
    endpoints: ['/reports/weekly-brief', '/reports/map-snapshot']
  }, probed(gated(f.smartbrowz, ['APP_BASE_URL']), 'both call sites need a user context this runtime lacks — convertToPdf and takeScreenshot each fail with "No such User with the given id exists" (D-phase8-8), so the print-CSS route and the static map are what a judge sees')));

  add(Object.assign({
    key: 'zia-vision',
    name: 'Zia Services (object recognition / image moderation)',
    category: 'ai',
    invocation: 'lib/objects.js — zia().detectObject(readStream); lib/moderation.js — zia().moderateImage(readStream, {mode})',
    fallback: 'the scene generator\'s own manifest tags (source:fixture) and a format/size check with verdict:unscreened',
    flag: 'FEATURE_ZIA_OBJECTS',
    endpoints: ['/zia/objects', '/zia/objects/samples', '/zia/moderate']
  }, probed(gated(Boolean(f.ziaObjects || f.ziaModeration), []), 'the live probe found Zia does not recognise the procedural drawings (nothing on scene_03, the wrong class on scene_02 — D-phase8-4), so the panels serve manifest tags labelled source:fixture; moderation itself answered correctly')));

  add(Object.assign({
    key: 'quickml-automl',
    name: 'QuickML AutoML challenger',
    category: 'ai',
    invocation: 'lib/challenger.js — quickML().predict(QUICKML_AUTOML_ENDPOINT_KEY, features) beside the embedded logistic champion',
    fallback: 'champion only; the challenger AUC is read from QUICKML_AUTOML_AUC (copied from the console), never computed here',
    flag: 'FEATURE_QUICKML_AUTOML',
    requires: ['QUICKML_AUTOML_ENDPOINT_KEY'],
    endpoints: ['/predict/outcome/challenger']
  }, gated(f.quickmlAutoml, ['QUICKML_AUTOML_ENDPOINT_KEY'])));

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
    key: 'apm-logs',
    name: 'DevOps: APM + Logs',
    category: 'platform',
    status: envSet('APM_ENABLED') ? 'platform' : 'console-pending',
    statusReason: envSet('APM_ENABLED')
      ? 'APM enabled in the console for dappa_api (APM_ENABLED attests it); the SDK has no read API, so /meta/observability reports in-function latency and error rate'
      : 'enable APM under DevOps > APM in the console and set APM_ENABLED=on; /meta/observability serves in-function telemetry meanwhile',
    invocation: 'lib/observability.js — request ring buffer behind /meta/observability (Catalyst APM/Logs are console-read only; lib/apminsight in the SDK is the Site24x7 agent and needs a Site24x7 key)',
    fallback: 'in-function p50/p95 latency, error rate and per-route counts',
    requires: ['APM_ENABLED'],
    endpoints: ['/meta/observability', '/meta/nightly']
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
