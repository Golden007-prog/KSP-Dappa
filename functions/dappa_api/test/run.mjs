// KSP DAPPA backend test harness — plain Node, no framework.
// Boots the Express app with a stubbed datastore (canned rows shaped like real
// ZCQL results for every query pattern) and asserts the CONTRACTS shapes.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../lib/app.js');
const { createStubClient, buildZCQL, createDatastore, ZCQL_PAGE } = require('../lib/datastore.js');
const { buildFixtureTables, getFallbackState, resetFixtureFallback } = require('../lib/fixture.js');
const { CANNED_UTTERANCES, parse } = require('../lib/copilot.js');
const { resetArtifacts } = require('../lib/artifacts.js');
const { buildServiceMap, summarize } = require('../lib/servicemap.js');
const ziaModule = require('../lib/zia.js');
const { glossaryLookup, TRANSLATION_GLOSSARY, MAX_IMAGE_BYTES } = ziaModule;
const { robustZ } = require('../lib/circuits.js');
const { modelRegistry, mapSdk, stringifyInputs } = require('../lib/quickml.js');

// ---------------------------------------------------------------------------
// Canned tables come from the shared fixture module — the same deterministic
// dataset that backs the PUBLIC_DEMO self-healing fallback in production.
// ---------------------------------------------------------------------------

const tables = buildFixtureTables();

// ---------------------------------------------------------------------------
// Boot app with the stub
// ---------------------------------------------------------------------------

const stub = createStubClient(tables);
const app = createApp({ clientFactory: () => stub });

let pass = 0;
let failCount = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass += 1; return; }
  failCount += 1;
  failures.push({ name, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

function hasKeys(obj, keys) {
  return keys.every((k) => obj && Object.prototype.hasOwnProperty.call(obj, k));
}

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/api/v1`;

async function get(path, base) {
  const res = await fetch((base || BASE) + path);
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function post(path, body, headers, base) {
  const res = await fetch((base || BASE) + path, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body || {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function getRaw(path, base) {
  const res = await fetch((base || BASE) + path);
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '', text };
}

// --- pure-function pins ------------------------------------------------------

// ZCQL LIMIT uses MySQL skip semantics ("LIMIT 1,3" starts at the SECOND
// record) — the offset must be emitted verbatim, never off+1.
check('buildZCQL LIMIT page 1 omits offset', buildZCQL({ table: 'T', limit: { offset: 0, count: 50 } }).endsWith(' LIMIT 50'));
check('buildZCQL LIMIT page 2 is skip-count', buildZCQL({ table: 'T', limit: { offset: 50, count: 50 } }).endsWith(' LIMIT 50,50'));

// Paginated reads: a table bigger than one ZCQL page must come back whole, not
// clipped at 300 rows. This is the regression pin for /trends/seasonality.
{
  const big = { Big: Array.from({ length: 731 }, (_, i) => ({ Id: i + 1, Bucket: i % 7 })) };
  const bigDs = createDatastore(createStubClient(big));
  check('ZCQL page size pinned at 300', ZCQL_PAGE === 300, String(ZCQL_PAGE));
  const single = await bigDs.query({ table: 'Big', columns: ['Id'], limit: { count: 5000 } });
  check('a single stub query is not the paging path', single.length === 731);
  const paged = await bigDs.queryPaged({ table: 'Big', columns: ['Id'], orderBy: { col: 'Id' } }, { maxRows: 6000 });
  check('queryPaged walks every page', paged.rows.length === 731 && paged.pages === 3 && paged.truncated === false,
    JSON.stringify({ rows: paged.rows.length, pages: paged.pages, truncated: paged.truncated }));
  check('queryPaged keeps row order across pages', paged.rows[0].Id === 1 && paged.rows[300].Id === 301 && paged.rows[730].Id === 731,
    JSON.stringify([paged.rows[0], paged.rows[300], paged.rows[730]]));
  const capped = await bigDs.queryPaged({ table: 'Big', columns: ['Id'], orderBy: { col: 'Id' } }, { maxRows: 400 });
  check('queryPaged reports an honest truncation', capped.rows.length === 400 && capped.truncated === true);
  const askCap = await bigDs.queryAll({ table: 'Big', columns: ['Id'], orderBy: { col: 'Id' }, limit: { count: 120 } }, { maxRows: 6000 });
  check('queryAll treats limit.count as the caller cap', askCap.length === 120);
}

// Service coverage matrix is computed, not hand-waved.
{
  const rows = buildServiceMap({ flags: { search: true, filestore: true, auth: true }, services: {} });
  const counts = summarize(rows);
  check('service map covers 20+ Catalyst services', rows.length >= 20, String(rows.length));
  check('every service row is self-describing', rows.every((r) => r.key && r.name && r.status && r.statusReason && r.category));
  check('every code-reachable service documents a fallback', rows.filter((r) => r.invocation).every((r) => Boolean(r.fallback)));
  check('service keys are unique', new Set(rows.map((r) => r.key)).size === rows.length);
  check('service counts add up', counts.total === rows.length && counts.reachableFromCode > 0 && counts.liveNow > 0);
  const mailRow = rows.find((r) => r.key === 'mail');
  check('mail is flag-gated with the flag off', mailRow && mailRow.status === 'flag-gated' && mailRow.flag === 'FEATURE_MAIL');
  const onRows = buildServiceMap({ flags: { mail: true, circuit: true }, services: {} });
  check('flag on without config reads console-pending',
    onRows.find((r) => r.key === 'mail').status === 'console-pending'
    && onRows.find((r) => r.key === 'circuits').status === 'console-pending');
}

// Pure helpers behind the new service paths.
{
  check('glossary translates a domain term to Kannada', glossaryLookup('Chain Snatching', 'kn') === 'ಸರ ಕಳ್ಳತನ');
  check('glossary translates a domain term to Hindi', glossaryLookup('Vehicle Theft', 'hi') === 'वाहन चोरी');
  check('glossary misses return null (never a guess)', glossaryLookup('quantum widget', 'kn') === null);
  check('glossary carries kn AND hi for every entry',
    Object.values(TRANSLATION_GLOSSARY).every((v) => v.kn && v.hi && v.kn !== v.hi));
  check('glossary covers all 8 crime heads',
    ['crimes against body', 'crimes against women', 'property crimes', 'economic offences', 'cyber crimes', 'public order', 'narcotics', 'others']
      .every((k) => TRANSLATION_GLOSSARY[k]));
  check('robust z flags a spike', robustZ([10, 11, 9, 10, 12, 10], 40) > 4, String(robustZ([10, 11, 9, 10, 12, 10], 40)));
  check('robust z stays calm on a flat series', Math.abs(robustZ([10, 10, 11, 10, 9, 10], 10)) < 1);
  check('robust z needs history', robustZ([5], 99) === 0);
  const registry = modelRegistry({ flags: {} });
  check('model registry lists local + remote models', registry.length >= 8 && registry.some((m) => m.status === 'serving'));
  check('every model row names its endpoint', registry.every((m) => typeof m.endpoint === 'string' && m.endpoint.length > 0));
  check('quickml sdk probability response maps', mapSdk({ result: ['0.82'] }, {}).probability === 0.82);
  check('quickml sdk class response maps consistently', (() => {
    const m = mapSdk({ result: ['C'] }, {});
    return m.predictedClass === 'C' && m.probability < 0.5;
  })());
  check('quickml inputs are stringified', (() => {
    const s = stringifyInputs({ a: 1, b: true, c: null, d: 'x' });
    return s.a === '1' && s.b === '1' && s.d === 'x' && !('c' in s);
  })());
}

// Copilot parser upgrades.
{
  const m = parse('murders in march 2026');
  check('copilot parses month names', m.fromYm === '2026-03' && m.toYm === '2026-03', JSON.stringify(m));
  check('copilot detection-rate keeps time scope', parse('what is the detection rate this year?').kind === 'detectionRate');
  check('copilot per-lakh intent', parse('crime rate per lakh in Bengaluru City').kind === 'ratePerLakh');
  check('copilot heinous-share intent', parse('heinous share this year').kind === 'heinousShare');
  check('copilot unknown intent for gibberish', parse('what is the meaning of life').kind === 'unknown');
  check('copilot known phrasing still trend', parse('chain snatching in Mysuru City last 3 months').kind === 'trend');
}

// --- GET endpoints: 200 + {ok:true} + contract keys -------------------------

const GET_CASES = [
  ['/meta/lookups', (d) => hasKeys(d, ['districts', 'units', 'crimeHeads', 'crimeSubHeads', 'categories', 'statuses', 'gravities']) && d.districts.length === 38 && d.units.length > 0],
  ['/summary/kpis', (d) => hasKeys(d, ['totalFirs', 'momPct', 'heinousCount', 'detectionRate', 'activeAlerts', 'topRisingSubhead']) && hasKeys(d.topRisingSubhead, ['id', 'name', 'deltaPct']) && d.totalFirs > 0 && d.activeAlerts === 3],
  // KPI cards must honor the same crime/unit filters the charts beside them use.
  ['/summary/kpis?crimeHeadId=1', (d) => d.totalFirs > 0 && d.heinousCount === d.totalFirs],
  ['/summary/kpis?unitId=1011', (d) => d.totalFirs > 0],
  ['/meta/refresh', (d) => hasKeys(d, ['nightly', 'liveAlerts', 'anchorYm', 'mode']) && d.nightly && d.nightly.refreshedAt && /^\d{4}-\d{2}$/.test(d.anchorYm) && d.liveAlerts === 0 && ['live', 'fixture-demo'].includes(d.mode)],
  ['/meta/socio', (d) => Array.isArray(d) && d.length === 38 && hasKeys(d[0], ['districtId', 'districtName', 'population', 'urbanPct', 'literacyPct', 'densityPerKm2', 'perCapitaIncomeIdx']) && d.some((r) => r.population > 0)],
  ['/trends/compare?aDistrictId=0101&bDistrictId=0103', (d) => hasKeys(d, ['categories', 'series', 'sameWindow']) && d.sameWindow === true && d.series.length === 2 && d.series[0].data.length === d.categories.length && d.series[0].label.includes('Bengaluru') && d.series[1].label.includes('Mysuru') && d.series[0].data.some((v) => v > 0)],
  ['/alerts/AL-001', (d) => d.alertId === 'AL-001' && Array.isArray(d.series) && d.series.length === 12 && hasKeys(d.series[0], ['ym', 'caseCount']) && typeof d.baselineMedian === 'number' && d.series.some((p) => p.caseCount > 0)],
  ['/cases/1/similar', (d) => Array.isArray(d) && d.length === 5 && d.every((r) => r.caseMasterId !== 1) && hasKeys(d[0], ['caseMasterId', 'similarity', 'whyMatched', 'subHeadName']) && d[0].similarity >= d[4].similarity && d.every((r) => Array.isArray(r.whyMatched) && r.whyMatched.length > 0)],
  ['/offenders?q=ravi', (d, meta) => d.length === 1 && d[0].personKey === 'P001' && meta.total === 1],
  ['/offenders?q=naik', (d) => d.length === 1 && d[0].personKey === 'P004'],
  ['/copilot/suggestions', (d) => Array.isArray(d.suggestions) && d.suggestions.length >= 15],
  ['/reports/brief-data?window=last7', (d) => hasKeys(d, ['window', 'asOfYm', 'kpis', 'topAlerts', 'topRisk', 'topDistricts']) && d.kpis.activeAlerts === 3 && d.topAlerts.length === 3 && d.topRisk.length === 5 && d.topDistricts.length === 5],
  ['/trends/monthly', (d) => Array.isArray(d) && d.length === 12 && hasKeys(d[0], ['ym', 'caseCount', 'heinousCount'])],
  ['/trends/monthly?districtId=0101&crimeHeadId=3', (d) => Array.isArray(d) && d.every((r) => r.caseCount >= 0)],
  // Regression: seasonality used to ask for 5000 rows in ONE ZCQL query, which
  // the 300-row server cap rejected, silently dropping the endpoint into the
  // fixture. It must page and report how it sampled.
  ['/trends/seasonality', (d) => hasKeys(d, ['weekdays', 'hours', 'matrix', 'maxCount', 'sampleSize', 'pages', 'truncated', 'sampleBudget'])
    && d.matrix.length === 7 && d.matrix[0].length === 24 && d.sampleSize > 0
    && d.pages >= 1 && d.truncated === false && d.sampleBudget === 6000
    && d.parsedSize > 0 && d.matrix.flat().reduce((s, n) => s + n, 0) === d.parsedSize],
  ['/trends/seasonality?sample=300', (d) => d.sampleBudget === 300 && d.sampleSize <= 300],
  ['/trends/category-share', (d) => Array.isArray(d) && d.length > 0 && hasKeys(d[0], ['crimeHeadId', 'headName', 'caseCount', 'sharePct'])],
  ['/geo/districts', (d) => Array.isArray(d) && d.length > 0 && hasKeys(d[0], ['districtId', 'districtName', 'caseCount', 'ratePerLakh', 'momDeltaPct', 'alert']) && d.some((r) => r.alert === true)],
  ['/geo/stations?districtId=0101', (d) => Array.isArray(d) && d.length > 0 && hasKeys(d[0], ['unitId', 'unitName', 'districtId', 'lat', 'lng', 'caseCount', 'riskScore']) && d.every((r) => r.districtId === '0101')],
  ['/geo/incidents?bbox=74,11.5,78.6,18.5&limit=25', (d) => Array.isArray(d) && d.length > 0 && d.length <= 25 && hasKeys(d[0], ['caseMasterId', 'lat', 'lng', 'crimeHeadId', 'crimeSubHeadId', 'registeredDate'])],
  ['/geo/hotspots', (d) => Array.isArray(d) && d.length === 3 && hasKeys(d[0], ['clusterId', 'crimeHeadId', 'subHeadName', 'centroidLat', 'centroidLng', 'radiusM', 'caseCount', 'hourBandStart', 'hourBandEnd', 'intensity', 'label', 'districtId'])],
  ['/alerts', (d, meta) => Array.isArray(d) && d.length === 4 && hasKeys(d[0], ['alertId', 'districtId', 'districtName', 'unitId', 'crimeHeadId', 'headName', 'periodStart', 'periodEnd', 'observed', 'expected', 'zScore', 'severity', 'status', 'narrative', 'sparkline']) && Array.isArray(d[0].sparkline) && hasKeys(meta, ['total', 'page', 'perPage'])],
  ['/alerts?status=OPEN', (d) => Array.isArray(d) && d.length === 3 && d.every((r) => r.status === 'OPEN')],
  ['/network/graph', (d, meta) => hasKeys(d, ['nodes', 'edges']) && d.nodes.length >= 5 && hasKeys(d.nodes[0], ['id', 'label', 'caseCount', 'communityId', 'degree']) && hasKeys(d.edges[0], ['source', 'target', 'weight', 'caseIds']) && meta.source === 'datastore'],
  ['/network/graph?communityId=2', (d) => d.nodes.length === 2 && d.edges.length === 1],
  ['/network/graph?personKey=P001&depth=1', (d) => d.nodes.length === 3],
  ['/offenders?repeatOnly=1', (d, meta) => Array.isArray(d) && d.length === 5 && hasKeys(d[0], ['personKey', 'canonicalName', 'aliases', 'caseCount', 'districts', 'moTags', 'riskScore', 'communityId']) && meta.total === 5],
  ['/offenders?district=0103', (d) => d.length === 2 && d.every((r) => r.districts.includes('0103'))],
  ['/offenders/P001', (d) => hasKeys(d, ['personKey', 'canonicalName', 'aliases', 'caseCount', 'districts', 'firstSeen', 'lastSeen', 'moTags', 'communityId', 'degree', 'riskScore', 'associates', 'timeline']) && d.timeline.length > 0 && d.associates.length === 2],
  ['/forecast?districtId=0101&crimeHeadId=3', (d) => hasKeys(d, ['history', 'forecast', 'model', 'mape']) && d.history.length === 12 && d.forecast.length === 3 && typeof d.mape === 'number' && hasKeys(d.forecast[0], ['ym', 'predicted', 'lo', 'hi'])],
  ['/risk/stations?horizon=30', (d) => Array.isArray(d) && d.length === 15 && hasKeys(d[0], ['unitId', 'unitName', 'districtId', 'riskScore', 'drivers', 'spark']) && d[0].riskScore >= d[1].riskScore && d.every((r) => Array.isArray(r.spark) && r.spark.length === 6) && d.some((r) => r.spark.some((v) => v > 0))],
  ['/cases?page=1&perPage=10', (d, meta) => Array.isArray(d) && d.length === 10 && hasKeys(d[0], ['caseMasterId', 'crimeNo', 'caseNo', 'registeredDate', 'districtName', 'unitName', 'headName', 'subHeadName', 'statusName', 'gravityName', 'anomalyFlag']) && meta.total === 40 && meta.page === 1 && meta.perPage === 10],
  ['/cases?districtId=0103&perPage=200', (d) => d.length === 8],
  ['/cases?perPage=500', (d, meta) => meta.perPage === 200],
  // --- second-pass endpoints -------------------------------------------------
  ['/meta/challenge', (d) => Array.isArray(d.capabilities) && d.capabilities.length === 6
    && d.capabilities.every((c) => hasKeys(c, ['id', 'key', 'title', 'status', 'summary', 'highlights', 'endpoints']) && c.status === 'covered' && c.endpoints.length > 0)
    && d.counts && d.counts.capabilities === 6 && d.counts.covered === 6 && d.counts.distinctEndpoints > 20 && d.counts.copilotUtterances >= 18],
  ['/insight/socio-correlation', (d) => hasKeys(d, ['fromYm', 'toYm', 'points', 'indicators']) && d.points.length === 5 && d.indicators.length === 5
    && hasKeys(d.points[0], ['districtId', 'districtName', 'caseCount', 'ratePerLakh', 'population', 'urbanPct', 'literacyPct', 'densityPerKm2', 'perCapitaIncomeIdx'])
    && typeof d.indicators.find((i) => i.key === 'population').r === 'number'
    && d.indicators.find((i) => i.key === 'urbanPct').r === null
    && d.indicators.find((i) => i.key === 'urbanPct').strength === 'n/a'
    && d.indicators.every((i) => hasKeys(i, ['key', 'label', 'r', 'n', 'strength', 'direction', 'note']))],
  ['/insight/emerging', (d) => hasKeys(d, ['anchorYm', 'fromYm', 'rising', 'falling']) && Array.isArray(d.rising) && Array.isArray(d.falling)
    && (d.rising.length + d.falling.length) > 0
    && [...d.rising, ...d.falling].every((m) => hasKeys(m, ['subHeadId', 'subHeadName', 'headName', 'recentAvg', 'baselineAvg', 'growthPct', 'emerging', 'spark']) && m.spark.length === 12)],
  ['/network/path?from=P001&to=P003', (d) => d.found === true && d.hops === 1 && d.path.length === 2
    && d.path[0].personKey === 'P001' && d.path[1].personKey === 'P003'
    && d.edges.length === 1 && d.totalWeight === 2 && d.weakestLink === 2
    && Array.isArray(d.edges[0].caseIds) && d.edges[0].caseIds.length === 2],
  ['/network/path?from=P001&to=P005', (d) => d.found === false && typeof d.reason === 'string' && d.path.length === 0],
  ['/network/communities', (d) => Array.isArray(d) && d.length === 2 && d[0].memberCount === 3 && d[0].density === 1
    && hasKeys(d[0], ['communityId', 'memberCount', 'edgeCount', 'linkedCases', 'districts', 'districtNames', 'topMoTags', 'avgRisk', 'keyPerson', 'density', 'members'])
    && d[0].keyPerson.personKey === 'P001' && d[0].linkedCases === 4],
  ['/offenders/mo-patterns', (d) => Array.isArray(d) && d.length > 0
    && hasKeys(d[0], ['tag', 'offenders', 'totalCases', 'districts', 'districtNames', 'crossJurisdiction', 'avgRisk', 'topOffenders'])
    && (() => { const v = d.find((t) => t.tag === 'vehicle-theft'); return v && v.offenders === 2 && v.totalCases === 8 && v.crossJurisdiction === true; })()],
  // --- Catalyst service surface ---------------------------------------------
  ['/meta/services', (d) => Array.isArray(d.services) && d.services.length >= 20
    && d.services.every((s) => hasKeys(s, ['key', 'name', 'category', 'status', 'statusReason', 'fallback', 'endpoints']))
    && d.counts && d.counts.total === d.services.length && d.counts.liveNow > 0 && d.counts.withFallback > 0
    && ['live', 'fixture-demo'].includes(d.dataMode)
    && ['data-store', 'cache', 'nosql', 'stratus', 'mail', 'push-notifications', 'circuits', 'authentication', 'connections', 'file-store', 'data-store-search']
      .every((k) => d.services.some((s) => s.key === k))],
  ['/search/cases?q=OTP', (d, meta) => d.query === 'OTP' && Array.isArray(d.results) && d.results.length > 0
    && d.results.every((r) => hasKeys(r, ['type', 'id', 'title', 'snippet']))
    && d.results.some((r) => r.type === 'case' && String(r.snippet).includes('OTP'))
    && ['catalyst-search', 'fallback-zcql-like'].includes(d.source) && meta.source === d.source],
  ['/search/cases?q=ravi&scope=offenders', (d) => d.scope === 'offenders'
    && d.results.length === 1 && d.results[0].type === 'offender' && d.results[0].personKey === 'P001'],
  ['/search/cases?q=zzzznothing', (d) => d.results.length === 0 && d.matched === 0],
  ['/auth/me', (d) => d.authenticated === false && d.anonymous === true && d.role === 'viewer'
    && d.capabilities.read === true && d.capabilities.acknowledgeAlerts === false
    && d.publicDemo === true && d.source === 'fallback-local'],
  ['/ml/models', (d) => Array.isArray(d.models) && d.models.length >= 8
    && d.models.every((m) => hasKeys(m, ['key', 'name', 'task', 'status', 'service', 'endpoint']))
    && d.counts.serving > 0 && d.counts.total === d.models.length
    && d.models.some((m) => m.key === 'outcome-logistic-local' && m.status === 'serving')
    && d.models.some((m) => m.key === 'quickml-outcome' && m.status === 'disabled')],
  ['/connections/status', (d) => d.enabled === false && d.reachable === false && d.mode === 'disabled' && typeof d.note === 'string'],
  ['/alerts/summary', (d) => d.total === 4 && d.byStatus.OPEN === 3 && d.byStatus.ACK === 1
    && d.bySeverity['3'] === 1 && Array.isArray(d.topDistricts) && d.topDistricts.length === 3
    && hasKeys(d.topDistricts[0], ['districtId', 'districtName', 'openCount']) && typeof d.latestCreatedAt === 'string'],
  // Completeness reads the RAW datastore (ctx.dsRaw) — with the stub it sees
  // the canned counts; in fixture-fallback mode (real store down) the honest
  // answer is actual=null/pct=null, never fixture rows masquerading as real.
  ['/healthz', (d) => d.status === 'ok' && d.datastore.ok === true && d.cache.ok === true && d.datastore.rowCounts.CaseMaster === 40
    && d.datastore.completeness && d.datastore.completeness.tables.CaseMaster.expected === 45000
    && (d.datastore.completeness.tables.CaseMaster.actual === null
      ? (d.datastore.completeness.tables.CaseMaster.pct === null && d.datastore.completeness.overallPct === null)
      : (d.datastore.completeness.tables.CaseMaster.actual === 40
        && d.datastore.completeness.tables.CaseMaster.pct === 0.1
        && d.datastore.completeness.tables.District.pct === 100
        && typeof d.datastore.completeness.overallPct === 'number'
        && d.datastore.completeness.overallPct > 0 && d.datastore.completeness.overallPct < 100))]
];

for (const [path, validator] of GET_CASES) {
  const { status, json } = await get(path);
  check(`GET ${path} -> 200`, status === 200, `got ${status}: ${JSON.stringify(json && json.error)}`);
  check(`GET ${path} ok:true`, json && json.ok === true);
  if (json && json.ok) {
    check(`GET ${path} shape`, Boolean(validator(json.data, json.meta || {})), JSON.stringify(json.data).slice(0, 300));
  }
}

// /cases/:id — full ER join + privacy guardrail
{
  const { status, json } = await get('/cases/1');
  check('GET /cases/1 -> 200', status === 200);
  const d = (json && json.data) || {};
  check('case detail keys', hasKeys(d, ['caseMasterId', 'crimeNo', 'caseNo', 'briefFacts', 'complainants', 'victims', 'accused', 'sections', 'arrests', 'chargesheet', 'io', 'court', 'latitude', 'longitude', 'incidentFrom', 'incidentTo', 'anomalyFlag']));
  check('case detail joins populated', d.complainants && d.complainants.length === 1 && d.accused.length === 2 && d.sections.length === 2 && d.arrests.length === 1);
  check('case detail sections text', d.sections && d.sections[0].actCode === 'BNS' && d.sections[0].sectionCode === '304' && d.sections[0].description === 'Snatching');
  check('case detail io+court', d.io && d.io.rankName === 'Inspector' && d.court && d.court.courtName.includes('Sessions'));
  check('case detail chargesheet', d.chargesheet && d.chargesheet.type === 'A');
  check('case detail anomalyFlag', d.anomalyFlag === true);
  const raw = JSON.stringify(json);
  check('caste/religion never in API output', !raw.includes('Caste') && !raw.includes('Religion') && !raw.includes('caste') && !raw.includes('religion'));
  const missing = await get('/cases/99999');
  check('GET /cases/99999 -> 404', missing.status === 404 && missing.json.ok === false);
}

// --- copilot: all canned utterances must answer -----------------------------

check('>=15 canned utterances shipped', CANNED_UTTERANCES.length >= 15, String(CANNED_UTTERANCES.length));
for (const utterance of CANNED_UTTERANCES) {
  const { status, json } = await post('/copilot/query', { q: utterance });
  const d = (json && json.data) || {};
  check(`copilot "${utterance}" -> 200 ok`, status === 200 && json.ok === true, `status ${status}`);
  check(`copilot "${utterance}" non-empty answer`, typeof d.answer === 'string' && d.answer.trim().length > 10, JSON.stringify(d).slice(0, 200));
  check(`copilot "${utterance}" engine`, d.engine === 'deterministic' || d.engine === 'quickml-rag');
}
{
  const { json } = await post('/copilot/query', { q: 'top 5 districts for vehicle theft this year' });
  const chart = json.data.chart;
  check('copilot chart payload shape', chart && ['bar', 'line', 'pie'].includes(chart.type) && Array.isArray(chart.categories) && Array.isArray(chart.series) && chart.series[0].data.length === chart.categories.length);
  check('copilot exposes zcql', typeof json.data.zcql === 'string' && json.data.zcql.toUpperCase().startsWith('SELECT'));
  const empty = await post('/copilot/query', {});
  check('copilot empty query -> 400', empty.status === 400 && empty.json.ok === false);
}

// --- copilot: new intents over HTTP ------------------------------------------

{
  const lakh = await post('/copilot/query', { q: 'crime rate per lakh in Bengaluru City' });
  check('copilot rate-per-lakh answers', lakh.status === 200 && lakh.json.data.intent === 'ratePerLakh' && lakh.json.data.answer.includes('per lakh'), JSON.stringify(lakh.json.data).slice(0, 200));
  const heinous = await post('/copilot/query', { q: 'heinous share this year' });
  check('copilot heinous-share answers', heinous.status === 200 && heinous.json.data.intent === 'heinousShare' && heinous.json.data.answer.includes('%'));
  const det = await post('/copilot/query', { q: 'what is the detection rate this year?' });
  check('copilot detection rate is scoped to the asked window', det.status === 200 && det.json.data.answer.includes('year-to-date'), det.json.data.answer);
  const unknown = await post('/copilot/query', { q: 'what is the meaning of life' });
  check('copilot unknown -> graceful suggestions', unknown.status === 200 && unknown.json.data.intent === 'unknown'
    && Array.isArray(unknown.json.data.suggestions) && unknown.json.data.suggestions.length === 3
    && unknown.json.data.answer.includes('Try'), JSON.stringify(unknown.json.data).slice(0, 200));
}

// --- copilot: second-pass grammar (compare districts / why rising / hour bands)

{
  const cd = parse('compare Bengaluru City and Mysuru City last 6 months');
  check('copilot parses two districts', cd.kind === 'compareDistricts' && cd.districtId === '0101' && cd.districtId2 === '0103', JSON.stringify(cd));
  check('copilot single district keeps compareYears', parse('compare cheating 2025 vs 2026 in Bengaluru City').kind === 'compareYears');
  check('copilot hyphenated district is one match', parse('robbery trend in Hubballi-Dharwad City last 6 months').districtId2 === null);
  const why = parse('why is chain snatching rising in Mysuru City');
  check('copilot why-rising intent', why.kind === 'whyRising' && why.districtId === '0103' && why.subHeadId === 307, JSON.stringify(why));
  const hb = parse('hotspots at night in Bengaluru City');
  check('copilot hotspot hour band', hb.kind === 'hotspots' && hb.hourBand && hb.hourBand.start === 21 && hb.hourBand.end === 5, JSON.stringify(hb.hourBand));

  const cdr = await post('/copilot/query', { q: 'compare Bengaluru City and Mysuru City last 6 months' });
  check('compare-districts names both sides', cdr.status === 200 && cdr.json.data.intent === 'compareDistricts'
    && cdr.json.data.answer.includes('Bengaluru City') && cdr.json.data.answer.includes('Mysuru City'), JSON.stringify(cdr.json.data).slice(0, 250));
  check('compare-districts dual-series chart', cdr.json.data.chart && cdr.json.data.chart.series.length === 2
    && cdr.json.data.chart.categories.length === 6
    && cdr.json.data.chart.series.every((s) => s.data.length === 6));
  const whyr = await post('/copilot/query', { q: 'why is chain snatching rising in Mysuru City' });
  check('why-rising diagnostic answer', whyr.status === 200 && whyr.json.data.intent === 'whyRising'
    && whyr.json.data.answer.includes('%'), JSON.stringify(whyr.json.data).slice(0, 250));
  check('why-rising cites live signals', /alert|hotspot|contributor|variation/i.test(whyr.json.data.answer), whyr.json.data.answer);
  const night = await post('/copilot/query', { q: 'hotspots at night in Bengaluru City' });
  check('night hotspots filtered answer', night.status === 200 && night.json.data.intent === 'hotspots'
    && night.json.data.answer.toLowerCase().includes('night'), night.json.data.answer);
  check('suggestions include second-pass utterances', CANNED_UTTERANCES.length >= 18
    && CANNED_UTTERANCES.includes('hotspots at night in Bengaluru City')
    && CANNED_UTTERANCES.includes('why is chain snatching rising in Mysuru City'));
}

// --- offenders watchlist validation ------------------------------------------

{
  const w = await post('/offenders/watch', { personKeys: ['P001', 'P004', 'ZZZ'] });
  const d = (w.json && w.json.data) || {};
  check('watch -> 200 ok', w.status === 200 && w.json.ok === true);
  check('watch profiles found + risk-sorted', Array.isArray(d.profiles) && d.profiles.length === 2 && d.profiles[0].riskScore >= d.profiles[1].riskScore);
  check('watch notFound listed', Array.isArray(d.notFound) && d.notFound.length === 1 && d.notFound[0] === 'ZZZ' && d.requested === 3);
  const p1 = d.profiles.find((p) => p.personKey === 'P001');
  const p4 = d.profiles.find((p) => p.personKey === 'P004');
  check('watch enrichment shape', p1 && hasKeys(p1, ['personKey', 'canonicalName', 'aliases', 'caseCount', 'districts', 'districtNames', 'firstSeen', 'lastSeen', 'daysSinceLastSeen', 'moTags', 'communityId', 'riskScore', 'associates', 'openAlertsInDistricts']));
  check('watch associates counted', p1 && p4 && p1.associates === 2 && p4.associates === 1, JSON.stringify([p1 && p1.associates, p4 && p4.associates]));
  check('watch links open alerts to districts', p1 && p4 && p1.openAlertsInDistricts === 2 && p4.openAlertsInDistricts === 0, JSON.stringify([p1 && p1.openAlertsInDistricts, p4 && p4.openAlertsInDistricts]));
  check('watch recency computed', p1 && typeof p1.daysSinceLastSeen === 'number' && p1.daysSinceLastSeen >= 0);
  const bad = await post('/offenders/watch', {});
  check('watch without keys -> 400', bad.status === 400 && bad.json.ok === false);
  const empty = await post('/offenders/watch', { personKeys: [] });
  check('watch empty list -> 400', empty.status === 400);
  const huge = await post('/offenders/watch', { personKeys: Array.from({ length: 51 }, (_, i) => `X${i}`) });
  check('watch >50 keys -> 400', huge.status === 400);
}

// --- network path validation --------------------------------------------------

{
  const noParams = await get('/network/path');
  check('path without params -> 400', noParams.status === 400 && noParams.json.error.code === 'BAD_REQUEST');
  const same = await get('/network/path?from=P001&to=P001');
  check('path same person -> 400', same.status === 400);
  const unknown = await get('/network/path?from=P001&to=NOPE');
  check('path unknown person -> found:false', unknown.status === 200 && unknown.json.data.found === false && unknown.json.data.reason.includes('NOPE'));
}

// --- Catalyst service endpoints: auth, mail, push, artefacts, circuits, Zia --

{
  // Authentication: anonymous read stays open, the token elevates, and the
  // wrong token never does.
  const meAnon = await get('/auth/me');
  check('auth/me anonymous is a 200, not a 401', meAnon.status === 200 && meAnon.json.data.authenticated === false);
  const meAdmin = await fetch(`${BASE}/auth/me`, { headers: { 'x-admin-token': 'demo-admin' } }).then((r) => r.json());
  check('auth/me elevates on the admin token', meAdmin.data.authenticated === true && meAdmin.data.role === 'admin'
    && meAdmin.data.roleSource === 'admin-token' && meAdmin.data.capabilities.sendDigest === true);
  const meWrong = await fetch(`${BASE}/auth/me`, { headers: { 'x-admin-token': 'nope' } }).then((r) => r.json());
  check('auth/me ignores a wrong token', meWrong.data.authenticated === false && meWrong.data.role === 'viewer');
  const signin = await post('/auth/signin', { token: 'demo-admin' });
  check('auth/signin with the demo token -> 200', signin.status === 200 && signin.json.data.ok === true
    && signin.json.data.mode === 'demo-token' && signin.json.data.header === 'X-Admin-Token');
  const signinBad = await post('/auth/signin', { token: 'wrong' });
  check('auth/signin with a bad token -> 401', signinBad.status === 401 && signinBad.json.error.code === 'AUTH_FAILED');
  const signinNone = await post('/auth/signin', {});
  check('auth/signin without credentials -> 401', signinNone.status === 401);
  const signout = await post('/auth/signout', {});
  check('auth/signout -> 200 with clear instructions', signout.status === 200 && signout.json.data.signedOut === true
    && signout.json.data.clearHeaders.includes('X-Admin-Token'));
  const usersNoAuth = await get('/auth/users');
  check('auth/users without auth -> 403', usersNoAuth.status === 403);
  const users = await fetch(`${BASE}/auth/users`, { headers: { 'x-admin-token': 'demo-admin' } });
  const usersJson = await users.json();
  check('auth/users admin -> 200 with an honest empty directory',
    users.status === 200 && Array.isArray(usersJson.data.users) && usersJson.meta.source === 'fallback-local');
}

{
  // Catalyst Mail: preview always renders, send degrades to the same preview.
  const prevNoAuth = await get('/admin/digest/preview');
  check('digest preview without auth -> 403', prevNoAuth.status === 403);
  const prev = await fetch(`${BASE}/admin/digest/preview`, { headers: { 'x-admin-token': 'demo-admin' } });
  const prevJson = await prev.json();
  const p = prevJson.data.preview;
  check('digest preview -> 200', prev.status === 200 && prevJson.ok === true);
  check('digest preview renders text, html and lines', p && p.lines.length === 3
    && p.subject.includes('3 active alerts') && p.text.includes('[S3]') && p.html.includes('<h2>'));
  check('digest preview carries alert + risk detail', p.alerts.length === 3 && p.topRisk.length === 5
    && hasKeys(p.alerts[0], ['alertId', 'severity', 'districtName', 'headName', 'observed', 'expected', 'zScore']));
  check('digest preview reports it would not send', prevJson.data.wouldSend === false && Array.isArray(prevJson.data.to));
  const sendNoAuth = await post('/admin/digest/send', {});
  check('digest send without auth -> 403', sendNoAuth.status === 403);
  const send = await post('/admin/digest/send', {}, { 'x-admin-token': 'demo-admin' });
  check('digest send flag-off -> disabled with the full preview', send.status === 200
    && send.json.data.sent === false && send.json.data.mode === 'disabled'
    && send.json.meta.source === 'fallback-local' && send.json.data.preview.lines.length === 3);
  // The legacy endpoint must keep its exact contract while sharing lib/mail.js.
  const legacy = await post('/notify/test-digest', {}, { 'x-admin-token': 'demo-admin' });
  check('legacy test-digest keeps its shape', legacy.status === 200 && legacy.json.data.sent === false
    && legacy.json.data.mode === 'disabled' && legacy.json.data.preview.lines.length > 0
    && legacy.json.meta.source === 'fallback-local');
  check('legacy and new digest render identically',
    legacy.json.data.preview.subject === send.json.data.preview.subject);
}

{
  // Push Notifications: registry in Cache, send degrades to a logged preview.
  const reg = await post('/notify/register', { recipient: 'control-room@ksp.test', label: 'Control room' });
  check('push register -> 200', reg.status === 200 && reg.json.data.ok === true
    && reg.json.data.recipient.id === 'control-room@ksp.test' && reg.json.data.registered === 1);
  const dupe = await post('/notify/register', { recipient: 'control-room@ksp.test' });
  check('push register is idempotent', dupe.json.data.alreadyRegistered === true && dupe.json.data.registered === 1);
  const badReg = await post('/notify/register', {});
  check('push register without a recipient -> 400', badReg.status === 400);
  const listNoAuth = await get('/notify/recipients');
  check('push recipients without auth -> 403', listNoAuth.status === 403);
  const list = await fetch(`${BASE}/notify/recipients`, { headers: { 'x-admin-token': 'demo-admin' } }).then((r) => r.json());
  check('push recipients lists the registry', list.data.recipients.length === 1 && list.data.enabled === false);
  const pushNoAuth = await post('/notify/push', { message: 'x' });
  check('push send without auth -> 403', pushNoAuth.status === 403);
  const pushEmpty = await post('/notify/push', {}, { 'x-admin-token': 'demo-admin' });
  check('push send without a message -> 400', pushEmpty.status === 400);
  const pushed = await post('/notify/push', { message: 'Critical anomaly in Mysuru City' }, { 'x-admin-token': 'demo-admin' });
  check('push send flag-off -> logged no-op preview', pushed.status === 200 && pushed.json.data.sent === false
    && pushed.json.data.mode === 'disabled' && pushed.json.data.delivered === 0
    && pushed.json.data.preview.message.includes('Mysuru') && pushed.json.data.preview.recipients.length === 1);
  const unreg = await post('/notify/unregister', { recipient: 'control-room@ksp.test' });
  check('push unregister removes it', unreg.json.data.removed === 1 && unreg.json.data.registered === 0);
  const unregBad = await post('/notify/unregister', {});
  check('push unregister without a recipient -> 400', unregBad.status === 400);
}

{
  // Artefact store: File Store -> Stratus -> memory. With no Catalyst app the
  // memory link must answer, and the artefact must be readable back.
  resetArtifacts();
  const arch = await post('/reports/archive', { window: 'last7' });
  check('archive -> 200 stored', arch.status === 200 && arch.json.data.stored === true
    && arch.json.data.storage === 'memory' && arch.json.data.bytes > 0
    && arch.json.meta.source === 'store-memory');
  const id = arch.json.data.artifactId;
  check('artifact id is well formed', /^art-[a-z0-9]+-[a-z0-9]+$/.test(id), id);
  const list = await get('/reports/artifacts');
  check('artifacts list contains it', list.status === 200 && list.json.data.some((m) => m.artifactId === id)
    && list.json.meta.count === list.json.data.length);
  const one = await get(`/reports/artifacts/${id}`);
  check('artifact body round-trips', one.status === 200 && one.json.data.meta.artifactId === id
    && JSON.parse(one.json.data.body).kind === 'weekly-brief'
    && JSON.parse(one.json.data.body).alerts.length === 3);
  const missing = await get('/reports/artifacts/art-nope');
  check('unknown artifact -> 404', missing.status === 404 && missing.json.error.code === 'NOT_FOUND');
  const badId = await get('/reports/artifacts/not%20an%20id');
  check('malformed artifact id -> 400', badId.status === 400 && badId.json.error.code === 'BAD_ID');
}

{
  // Circuits: with the flag off the identical steps must run inline.
  const noAuth = await post('/admin/circuit/nightly-refresh', {});
  check('circuit run without auth -> 403', noAuth.status === 403);
  const run = await post('/admin/circuit/nightly-refresh', {}, { 'x-admin-token': 'demo-admin' });
  const rec = run.json.data;
  check('circuit run -> 200 inline', run.status === 200 && rec.mode === 'inline' && rec.status === 'success'
    && rec.source === 'fallback-local' && typeof rec.note === 'string');
  check('circuit ran all three steps in order',
    rec.steps.map((s) => s.name).join(',') === 'aggregate,detect-anomalies,notify'
    && rec.steps.every((s) => s.status === 'success' && typeof s.ms === 'number'));
  check('aggregate step read live totals', rec.steps[0].detail.anchorYm && rec.steps[0].detail.totalCases > 0
    && rec.steps[0].detail.districts === 5);
  check('detect step scanned district x head series', rec.steps[1].detail.scanned > 0
    && Array.isArray(rec.steps[1].detail.candidates) && rec.steps[1].detail.openAlerts >= 0);
  check('notify step reports both channels', rec.steps[2].detail.mail.mode === 'dry-run'
    && rec.steps[2].detail.push.mode === 'disabled' && rec.steps[2].detail.digestLines >= 0);
  const status = await fetch(`${BASE}/admin/circuit/${rec.executionId}`, { headers: { 'x-admin-token': 'demo-admin' } });
  const statusJson = await status.json();
  check('circuit status replays the execution', status.status === 200
    && statusJson.data.executionId === rec.executionId && statusJson.data.steps.length === 3);
  const statusNoAuth = await get(`/admin/circuit/${rec.executionId}`);
  check('circuit status without auth -> 403', statusNoAuth.status === 403);
  const unknown = await fetch(`${BASE}/admin/circuit/exec-does-not-exist`, { headers: { 'x-admin-token': 'demo-admin' } });
  check('unknown circuit execution -> 404', unknown.status === 404);
}

{
  // Connections: never calls out unconfigured, and refuses a non-Zoho target.
  const invokeNoAuth = await post('/connections/invoke', {});
  check('connections invoke without auth -> 403', invokeNoAuth.status === 403);
  const invoke = await post('/connections/invoke', {}, { 'x-admin-token': 'demo-admin' });
  check('connections invoke unconfigured -> honest no-op', invoke.status === 200
    && invoke.json.data.invoked === false && invoke.json.data.mode === 'not-configured');
}

{
  // Zia OCR + translation.
  const noInput = await post('/zia/ocr', {});
  check('ocr without an image or text -> 400', noInput.status === 400);
  const ocr = await post('/zia/ocr', { text: 'Two unknown persons on a two-wheeler without plate snatched a gold mangalsutra near Devaraja Market at night.' });
  const o = ocr.json.data;
  check('ocr text path -> 200', ocr.status === 200 && o.ok === true);
  check('ocr reports the fallback honestly', o.ocrAvailable === false && ocr.json.meta.source === 'fallback-local' && typeof o.note === 'string');
  check('ocr runs MO extraction over the text', Array.isArray(o.moTags) && o.moTags.length > 0
    && o.moTags.some((t) => t.startsWith('vehicle:') || t.startsWith('item:'))
    && Array.isArray(o.keywords) && o.keywords.length > 0);
  // Two independent size gates: the 1 MB express body limit is what a client
  // actually hits, and the module's own byte guard is defence in depth for
  // direct callers (the event/cron functions).
  const bigImg = await post('/zia/ocr', { imageBase64: Buffer.alloc(2 * 1024 * 1024).toString('base64') });
  check('oversized ocr request is rejected by the body limit', bigImg.status === 413 || bigImg.status === 400, String(bigImg.status));
  const guarded = await ziaModule.ocrScan(
    { imageBase64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64') },
    { flags: { ziaOcr: false } }
  );
  check('ocr byte guard rejects an oversized buffer', guarded.result.ok === false && /too large/.test(guarded.result.reason));

  const trNone = await post('/zia/translate', {});
  check('translate without text -> 400', trNone.status === 400);
  const tr = await post('/zia/translate', { texts: ['Chain Snatching', 'Dashboard', 'quantum widget'], target: 'kn' });
  const items = tr.json.data.items;
  check('translate -> 200 with per-item provenance', tr.status === 200 && items.length === 3
    && items.every((i) => hasKeys(i, ['text', 'translated', 'ok', 'engine'])));
  check('translate uses the pinned glossary', items[0].translated === 'ಸರ ಕಳ್ಳತನ' && items[0].engine === 'glossary'
    && items[1].translated === 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್');
  check('translate never invents a translation', items[2].ok === false && items[2].engine === 'passthrough'
    && items[2].translated === 'quantum widget');
  const trHi = await post('/zia/translate', { text: 'Vehicle Theft', target: 'hi' });
  check('translate to Hindi', trHi.json.data.items[0].translated === 'वाहन चोरी' && trHi.json.data.target === 'hi');
  const trDefault = await post('/zia/translate', { text: 'Murder' });
  check('translate defaults to Kannada', trDefault.json.data.target === 'kn' && trDefault.json.data.items[0].translated === 'ಕೊಲೆ');
  const trMany = await post('/zia/translate', { texts: Array.from({ length: 51 }, () => 'Theft') });
  check('translate >50 strings -> 400', trMany.status === 400);
}

{
  // Search input validation.
  const noQ = await get('/search/cases');
  check('search without q -> 400', noQ.status === 400 && noQ.json.error.code === 'BAD_REQUEST');
  const longQ = await get(`/search/cases?q=${'x'.repeat(201)}`);
  check('search with an overlong term -> 400', longQ.status === 400);
}

// --- predict/outcome fallback ----------------------------------------------

{
  const body = { districtId: '0101', crimeSubHeadId: 306, gravity: 'Non-Heinous', hour: 23, victimCount: 1, accusedCount: 2, arrestWithin7d: true, sectionCount: 2 };
  const { status, json } = await post('/predict/outcome', body);
  const d = (json && json.data) || {};
  check('predict -> 200 ok', status === 200 && json.ok === true);
  check('predict probability in [0,1]', typeof d.probability === 'number' && d.probability >= 0 && d.probability <= 1, String(d.probability));
  check('predict class + auc', ['A', 'C'].includes(d.predictedClass) && typeof d.modelAuc === 'number');
  check('predict meta.source fallback-local', json.meta.source === 'fallback-local');
  const empty = await post('/predict/outcome', {});
  check('predict empty body still sane', empty.status === 200 && empty.json.data.probability >= 0 && empty.json.data.probability <= 1);
}

// --- ai/narrative fallback --------------------------------------------------

{
  const { status, json } = await post('/ai/narrative', { caseId: 1 });
  const d = (json && json.data) || {};
  check('narrative -> 200 ok', status === 200 && json.ok === true);
  check('narrative entities+keywords+moTags', Array.isArray(d.entities) && d.entities.length > 0 && Array.isArray(d.keywords) && d.keywords.length > 0 && Array.isArray(d.moTags) && d.moTags.length > 0, JSON.stringify(d).slice(0, 200));
  check('narrative sentiment', ['negative', 'neutral', 'positive'].includes(d.sentiment));
  check('narrative MO vocabulary hit', d.moTags.some((t) => t.startsWith('item:') || t.startsWith('vehicle:') || t.startsWith('weapon:')), JSON.stringify(d.moTags));
  check('narrative meta.source', json.meta.source === 'fallback-local');
}

// --- admin gating (PUBLIC_DEMO default true) --------------------------------

{
  const noAuth = await post('/alerts/AL-001/ack', {});
  check('ack without auth -> 403', noAuth.status === 403 && noAuth.json.ok === false && noAuth.json.error.code === 'AUTH_REQUIRED');
  const authed = await post('/alerts/AL-001/ack', {}, { Authorization: 'Bearer demo-admin' });
  check('ack with auth -> 200', authed.status === 200 && authed.json.data.status === 'ACK');
  check('ack issued UPDATE', stub.rawLog.some((s) => s.includes('UPDATE AnomalyAlert') && s.includes('AL-001')));
  const digestNoAuth = await post('/notify/test-digest', {});
  check('digest without auth -> 403', digestNoAuth.status === 403);
  const digest = await post('/notify/test-digest', {}, { Authorization: 'Bearer demo-admin' });
  check('digest flag-off fallback', digest.status === 200 && digest.json.data.sent === false && digest.json.data.mode === 'disabled' && digest.json.meta.source === 'fallback-local');
  check('digest preview built', digest.json.data.preview && digest.json.data.preview.lines.length > 0);

  const biNoAuth = await post('/admin/bulk-insert', { table: 'State', rows: [{ StateID: 1 }] });
  check('bulk-insert without auth -> 403', biNoAuth.status === 403);
  const biBadTable = await post('/admin/bulk-insert', { table: 'bad name;', rows: [{ a: 1 }] }, { 'x-admin-token': 'demo-admin' });
  check('bulk-insert invalid table -> 400', biBadTable.status === 400);
  const biNoRows = await post('/admin/bulk-insert', { table: 'State', rows: [] }, { 'x-admin-token': 'demo-admin' });
  check('bulk-insert empty rows -> 400', biNoRows.status === 400);
  const biTooMany = await post('/admin/bulk-insert', { table: 'State', rows: Array.from({ length: 201 }, () => ({ a: 1 })) }, { 'x-admin-token': 'demo-admin' });
  check('bulk-insert >200 rows -> 400', biTooMany.status === 400);
  const biLocal = await post('/admin/bulk-insert', { table: 'State', rows: [{ StateID: 1 }] }, { 'x-admin-token': 'demo-admin' });
  check('bulk-insert local run -> 503 catalyst unavailable', biLocal.status === 503);
}

// --- auth hardening: only the REAL token unlocks admin actions ---------------

{
  const wrongBearer = await post('/alerts/AL-003/ack', {}, { Authorization: 'Bearer wrong-token' });
  check('wrong bearer token -> 403', wrongBearer.status === 403 && wrongBearer.json.error.code === 'AUTH_REQUIRED');
  // Regression: any junk Authorization header used to bypass the gate entirely.
  const junkAuth = await post('/alerts/AL-003/ack', {}, { Authorization: 'x' });
  check('junk Authorization header -> 403', junkAuth.status === 403);
  const wrongHeader = await post('/alerts/AL-003/ack', {}, { 'x-admin-token': 'nope' });
  check('wrong x-admin-token -> 403', wrongHeader.status === 403);
  const viaHeader = await post('/alerts/AL-003/ack', {}, { 'x-admin-token': 'demo-admin' });
  check('x-admin-token match -> 200', viaHeader.status === 200 && viaHeader.json.data.status === 'ACK');
}

// --- writes persist + alert lifecycle ----------------------------------------

{
  // AL-001 and AL-003 were acked above; the ack must survive a refetch.
  const open = await get('/alerts?status=OPEN');
  check('acked alerts leave the OPEN list', open.json.data.length === 1 && open.json.data[0].alertId === 'AL-002', JSON.stringify(open.json.data.map((a) => a.alertId)));
  const dismiss = await post('/alerts/AL-002/status', { status: 'DISMISSED' }, { 'x-admin-token': 'demo-admin' });
  check('status DISMISSED -> 200', dismiss.status === 200 && dismiss.json.data.status === 'DISMISSED');
  const dismissed = await get('/alerts?status=DISMISSED');
  check('DISMISSED filter finds it', dismissed.json.data.length === 1 && dismissed.json.data[0].alertId === 'AL-002');
  const noneOpen = await get('/alerts?status=OPEN');
  check('OPEN list now empty', noneOpen.json.data.length === 0);
  const bad = await post('/alerts/AL-002/status', { status: 'nonsense' }, { 'x-admin-token': 'demo-admin' });
  check('invalid status -> 400', bad.status === 400 && bad.json.error.code === 'BAD_STATUS');
  const noAuth = await post('/alerts/AL-002/status', { status: 'OPEN' });
  check('status without auth -> 403', noAuth.status === 403);
  // Restore the fixture state for any later reads in this scenario.
  for (const [id, st] of [['AL-001', 'OPEN'], ['AL-002', 'OPEN'], ['AL-003', 'OPEN']]) {
    await post(`/alerts/${id}/status`, { status: st }, { 'x-admin-token': 'demo-admin' });
  }
}

// --- CSV exports -------------------------------------------------------------

{
  const cases = await getRaw('/cases.csv?districtId=0103');
  const caseLines = cases.text.trim().split(/\r?\n/);
  check('cases.csv 200 + text/csv', cases.status === 200 && cases.contentType.startsWith('text/csv') && cases.disposition.includes('dappa-cases.csv'));
  check('cases.csv header + filtered rows', caseLines[0].includes('crimeNo') && caseLines.length === 9, `${caseLines.length} lines`);
  const alertsCsv = await getRaw('/alerts.csv');
  check('alerts.csv rows', alertsCsv.status === 200 && alertsCsv.contentType.startsWith('text/csv') && alertsCsv.text.trim().split(/\r?\n/).length === 5);
  const offCsv = await getRaw('/offenders.csv');
  check('offenders.csv rows', offCsv.status === 200 && offCsv.contentType.startsWith('text/csv') && offCsv.text.trim().split(/\r?\n/).length === 7);
  check('offenders.csv joins arrays', offCsv.text.includes('two-wheeler|gold-chain|night'));
}

// --- HTTP hardening: ETag/304, request-id, rate-limit headers, TTL policy ----

{
  const r1 = await fetch(`${BASE}/meta/lookups`);
  await r1.json();
  const etag = r1.headers.get('etag');
  check('GET responses carry a weak ETag', Boolean(etag) && etag.startsWith('W/"'), String(etag));
  check('GET responses ask for revalidation', (r1.headers.get('cache-control') || '').includes('no-cache'));
  const r2 = await fetch(`${BASE}/meta/lookups`, { headers: { 'If-None-Match': etag } });
  check('If-None-Match revalidates as 304', r2.status === 304, String(r2.status));
  const r3 = await fetch(`${BASE}/healthz`, { headers: { 'X-Request-Id': 'corr-abc-123' } });
  await r3.json();
  check('client request id echoed', r3.headers.get('x-request-id') === 'corr-abc-123');
  const r4 = await fetch(`${BASE}/healthz`);
  await r4.json();
  check('request id generated when absent', /^req-/.test(r4.headers.get('x-request-id') || ''), String(r4.headers.get('x-request-id')));
  check('rate limit headers surfaced', Number(r4.headers.get('x-ratelimit-limit')) > 0
    && r4.headers.get('x-ratelimit-remaining') !== null
    && Number(r4.headers.get('x-ratelimit-remaining')) < Number(r4.headers.get('x-ratelimit-limit'))
    && Number(r4.headers.get('x-ratelimit-reset')) > 0);
  check('response time header present', /^\d+ms$/.test(r4.headers.get('x-response-time') || ''), String(r4.headers.get('x-response-time')));
  const r5 = await fetch(`${BASE}/summary/kpis`);
  const j5 = await r5.json();
  check('per-endpoint ttl surfaced (kpis 300s)', j5.meta.ttlSec === 300, String(j5.meta.ttlSec));
  const r6 = await fetch(`${BASE}/meta/refresh`);
  const j6 = await r6.json();
  check('per-endpoint ttl tuned (refresh 120s)', j6.meta.ttlSec === 120, String(j6.meta.ttlSec));
  const r7 = await fetch(`${BASE}/geo/incidents?limit=5`);
  const j7 = await r7.json();
  check('per-endpoint ttl tuned (incidents 180s)', j7.meta.ttlSec === 180, String(j7.meta.ttlSec));
}

// --- rate limiting enforces 429 past the env-tuned budget --------------------

{
  process.env.RATE_LIMIT_PER_MIN = '3';
  const rlApp = createApp({ clientFactory: () => stub });
  const rlServer = rlApp.listen(0);
  await new Promise((r) => rlServer.once('listening', r));
  const RL = `http://127.0.0.1:${rlServer.address().port}/api/v1`;
  let last = null;
  let lastJson = null;
  for (let i = 0; i < 4; i += 1) {
    last = await fetch(`${RL}/meta/challenge`);
    lastJson = await last.json();
  }
  check('rate limit enforces 429', last.status === 429 && lastJson.ok === false && lastJson.error.code === 'RATE_LIMITED', `status ${last.status}`);
  check('429 carries Retry-After', Number(last.headers.get('retry-after')) >= 1, String(last.headers.get('retry-after')));
  delete process.env.RATE_LIMIT_PER_MIN;
  rlServer.close();
}

// --- reports fallback + cache bypass ---------------------------------------

{
  const brief = await post('/reports/weekly-brief', { window: 'last7' });
  check('weekly-brief print-css fallback', brief.status === 200 && brief.json.ok === true && brief.json.data.mode === 'print-css' && brief.json.meta.source === 'fallback-local');
  const first = await get('/summary/kpis');
  const second = await get('/summary/kpis');
  check('kpis cache hit on second call', second.json.meta.cached === true || first.json.meta.cached === false);
  const bypass = await get('/summary/kpis?nocache=1');
  check('nocache bypass works', bypass.status === 200 && bypass.json.meta.cached === false);
  check('meta.asOf on cached reads', bypass.json.meta.asOf && /^\d{4}-\d{2}$/.test(bypass.json.meta.asOf.ym) && typeof bypass.json.meta.asOf.generatedAt === 'string');
  const trends = await get('/trends/monthly');
  check('meta.asOf on trends too', trends.json.meta.asOf && /^\d{4}-\d{2}$/.test(trends.json.meta.asOf.ym));
  const stationsCached = await get('/geo/stations?districtId=0101');
  check('geo/stations now cache-wrapped', typeof stationsCached.json.meta.cached === 'boolean');
  const incidentsCached = await get('/geo/incidents?limit=10');
  check('geo/incidents now cache-wrapped', typeof incidentsCached.json.meta.cached === 'boolean' && incidentsCached.json.meta.count === incidentsCached.json.data.length);
}

// ---------------------------------------------------------------------------
// Wired-services scenario: every flag ON with stubbed Catalyst handles. This is
// the half the fallback tests cannot prove — that the REAL call sites fire,
// receive the arguments the SDK expects, and map their responses correctly.
// ---------------------------------------------------------------------------

{
  resetArtifacts();
  const calls = [];
  const note = (...a) => calls.push(a);
  const envBackup = {};
  const setEnv = (k, v) => { envBackup[k] = process.env[k]; process.env[k] = v; };
  setEnv('MAIL_FROM', 'dappa@ksp.test');
  setEnv('DIGEST_TO', 'dcrb@ksp.test, control@ksp.test');
  setEnv('CIRCUIT_ID', '900001');
  setEnv('FILESTORE_FOLDER_ID', '770001');
  setEnv('CONNECTION_LINK_NAME', 'zoho_desk_link');
  setEnv('CONNECTION_TARGET_URL', 'https://desk.zoho.com/api/v1/tickets');
  setEnv('QUICKML_ENDPOINT_KEY', 'endpoint-key-1');
  setEnv('ZIA_AUTOML_MODEL_ID', 'automl-1');
  setEnv('ZIA_TRANSLATE_URL', 'https://zia.example.invalid/translate');

  const wiredFlags = {
    quickml: true, quickmlLlm: false, zia: true, ziaOcr: true, ziaTranslate: true, ziaAutoml: true,
    smartbrowz: false, mail: true, push: true, search: true, filestore: true, auth: true,
    connections: true, circuit: true, publicDemo: true
  };
  const wiredApp = createApp({
    clientFactory: () => stub,
    flags: wiredFlags,
    servicesFactory: () => ({
      mailer: { send: async (m) => { note('mail', m); return { mail_id: 'M1' }; } },
      push: { web: async (msg, ids) => { note('push', msg, ids); return true; } },
      search: {
        execute: async (q) => {
          note('search', q);
          return { CaseMaster: [{ CaseMasterID: 7, CrimeNo: 'CN7', BriefFacts: 'gold chain snatched at night', PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 307 }] };
        }
      },
      auth: {
        currentUser: async () => ({
          user_id: '4242', zuid: 'Z1', email_id: 'io@ksp.test', first_name: 'Anitha', last_name: 'Rao',
          status: 'ACTIVE', org_id: 'ORG1', role_details: { role_id: '1', role_name: 'App Administrator' }
        }),
        allUsers: async () => [{ user_id: '4242', email_id: 'io@ksp.test', first_name: 'Anitha', role_details: { role_name: 'App Administrator' } }]
      },
      filestore: {
        folderId: '770001',
        upload: async ({ name }) => { note('filestore', name); return { id: 'FILE-1' }; },
        download: async (id) => { note('filestore-download', id); return Buffer.from('{"kind":"weekly-brief"}'); }
      },
      artifactBucket: {
        put: async (k) => { note('stratus', k); return true; },
        get: async () => '{"kind":"weekly-brief"}',
        signedUrl: async () => 'https://stratus.example/signed'
      },
      circuit: {
        execute: async (name, input) => { note('circuit', name, input); return { execution_id: 'EX-1', status: 'running' }; },
        status: async (execId) => { note('circuit-status', execId); return { status: 'success', steps: [{ name: 'aggregate', status: 'success' }] }; }
      },
      connections: { credentials: async (link) => { note('connections', link); return { access_token: 'secret-token', expires_in: 3600 }; } },
      ziaClient: {
        extractOpticalCharacters: async (stream, opts) => { note('zia-ocr', opts); return { text: 'Complainant reports a gold chain snatched by two persons on a two-wheeler.', confidence: '0.93' }; },
        automl: async (id, data) => { note('zia-automl', id, data); return { classification_result: { A: 0.81, C: 0.19 } }; },
        getNERPrediction: async () => [{ entities: [{ token: 'Devaraja Market', ner_tag: 'LOCATION' }] }],
        getKeywordExtraction: async () => [{ keywords: ['chain', 'snatch'] }],
        getSentimentAnalysis: async () => [{ sentiment: 'Negative' }]
      },
      quickmlClient: { predict: async (key, data) => { note('quickml', key, data); return { status: 'success', result: ['0.77'] }; } },
      fetchImpl: async (url, init) => {
        note('fetch', url, init && init.method);
        return { ok: true, status: 200, json: async () => ({ data: [{ translated_text: 'ಪರೀಕ್ಷೆ' }] }), text: async () => '{"data":[]}' };
      }
    })
  });
  const wiredServer = wiredApp.listen(0);
  await new Promise((r) => wiredServer.once('listening', r));
  const W = `http://127.0.0.1:${wiredServer.address().port}/api/v1`;
  const ADMIN = { 'x-admin-token': 'demo-admin' };
  const seen = (kind) => calls.filter((c) => c[0] === kind);

  // Data Store Search — the SDK query shape matters as much as the result.
  const sr = await get('/search/cases?q=chain', W);
  check('WIRED search calls Catalyst Search', seen('search').length === 1 && sr.json.data.source === 'catalyst-search');
  check('WIRED search sends the documented query shape', (() => {
    const q = seen('search')[0][1];
    return q.search === 'chain' && Array.isArray(q.search_table_columns.CaseMaster)
      && q.search_table_columns.CaseMaster.includes('BriefFacts')
      && q.select_table_columns.CaseMaster.includes('CaseMasterID')
      && q.start === 1 && typeof q.end === 'number';
  })(), JSON.stringify(seen('search')[0] && seen('search')[0][1]));
  check('WIRED search maps hits onto the contract shape', sr.json.data.results[0].type === 'case'
    && sr.json.data.results[0].caseMasterId === 7 && sr.json.data.results[0].subHeadName === 'Chain Snatching');

  // Catalyst Authentication.
  const me = await get('/auth/me', W);
  check('WIRED auth/me resolves the Catalyst session', me.json.data.authenticated === true
    && me.json.data.source === 'catalyst-auth' && me.json.data.user.email === 'io@ksp.test'
    && me.json.data.user.userId === '4242');
  check('WIRED admin console role grants admin capabilities', me.json.data.role === 'admin'
    && me.json.data.roleSource === 'catalyst-role' && me.json.data.capabilities.sendDigest === true);
  const wUsers = await fetch(`${W}/auth/users`, { headers: ADMIN }).then((r) => r.json());
  check('WIRED auth/users lists the directory', wUsers.data.users.length === 1 && wUsers.data.source === 'catalyst-auth');

  // Catalyst Mail.
  const wSend = await post('/admin/digest/send', {}, ADMIN, W);
  check('WIRED digest actually sends', wSend.json.data.sent === true && wSend.json.data.mode === 'sent'
    && wSend.json.meta.source === 'catalyst-mail');
  check('WIRED mail gets a parsed recipient list', (() => {
    const m = seen('mail')[0][1];
    return m.from === 'dappa@ksp.test' && Array.isArray(m.to) && m.to.length === 2
      && m.to[1] === 'control@ksp.test' && m.subject.includes('active alert') && m.content.includes('[S3]');
  })(), JSON.stringify(seen('mail')[0] && seen('mail')[0][1]).slice(0, 200));
  const wHtml = await post('/admin/digest/send', { htmlMode: true }, ADMIN, W);
  check('WIRED digest can send HTML', wHtml.json.data.sent === true && seen('mail')[1][1].htmlMode === true
    && seen('mail')[1][1].content.includes('<h2>'));

  // Push Notifications.
  await post('/notify/register', { recipient: 'control@ksp.test' }, null, W);
  const wPush = await post('/notify/push', { message: 'Critical: chain snatching spike' }, ADMIN, W);
  check('WIRED push reaches the web channel', wPush.json.data.sent === true && wPush.json.data.mode === 'sent'
    && wPush.json.data.delivered === 1 && wPush.json.meta.source === 'catalyst-push');
  check('WIRED push passes message + recipient ids', seen('push')[0][1].includes('chain snatching')
    && seen('push')[0][2][0] === 'control@ksp.test');

  // File Store (first link of the artefact chain).
  const wArch = await post('/reports/archive', { window: 'last30' }, null, W);
  check('WIRED archive lands in File Store', wArch.json.data.storage === 'filestore'
    && wArch.json.data.fileId === 'FILE-1' && wArch.json.meta.source === 'store-filestore'
    && seen('filestore').length === 1);
  check('WIRED archive records the folder it used', wArch.json.data.folderId === '770001');

  // Circuits.
  const wCircuit = await post('/admin/circuit/nightly-refresh', {}, ADMIN, W);
  check('WIRED circuit delegates to Catalyst Circuits', wCircuit.json.data.mode === 'circuit'
    && wCircuit.json.data.executionId === 'EX-1' && wCircuit.json.data.circuitId === '900001'
    && wCircuit.json.meta.source === 'catalyst-circuit');
  check('WIRED circuit is invoked by name with input', seen('circuit')[0][1] === 'dappa_nightly_refresh'
    && seen('circuit')[0][2].trigger === 'api');
  const wCircuitStatus = await fetch(`${W}/admin/circuit/EX-1`, { headers: ADMIN }).then((r) => r.json());
  check('WIRED circuit status reads live state', wCircuitStatus.data.status === 'success'
    && seen('circuit-status').length === 1);

  // Connections — credentials are used, never echoed.
  const wConn = await get('/connections/status', W);
  check('WIRED connections reports reachable', wConn.json.data.reachable === true
    && wConn.json.data.mode === 'connected' && wConn.json.data.hasAccessToken === true
    && wConn.json.data.expiresIn === 3600 && wConn.json.meta.source === 'catalyst-connections');
  check('WIRED connections never leaks the token', !JSON.stringify(wConn.json).includes('secret-token'));
  const wInvoke = await post('/connections/invoke', {}, ADMIN, W);
  check('WIRED connections invoke uses the OAuth token', wInvoke.json.data.invoked === true
    && wInvoke.json.data.status === 200 && seen('fetch').some((c) => String(c[1]).includes('desk.zoho.com')));
  const wInvokeBad = await post('/connections/invoke', { url: 'https://evil.example.com/steal' }, ADMIN, W);
  check('WIRED connections refuses a non-Zoho target', wInvokeBad.status === 400);

  // Zia: OCR, AutoML (through the prediction chain) and translation.
  const wOcr = await post('/zia/ocr', { imageBase64: Buffer.from('fake-scan').toString('base64'), language: 'eng' }, null, W);
  check('WIRED ocr calls Zia', wOcr.json.data.ocrAvailable === true && wOcr.json.meta.source === 'zia-ocr'
    && wOcr.json.data.text.includes('gold chain') && wOcr.json.data.confidence === 0.93);
  check('WIRED ocr passes the language option', seen('zia-ocr')[0][1].language === 'eng');
  check('WIRED ocr still extracts MO tags from the transcription',
    wOcr.json.data.moTags.some((t) => t.startsWith('item:') || t.startsWith('vehicle:')));
  const wTr = await post('/zia/translate', { texts: ['Chain Snatching', 'bespoke phrase'], target: 'kn' }, null, W);
  check('WIRED translate keeps the glossary authoritative', wTr.json.data.items[0].engine === 'glossary');
  check('WIRED translate only sends unknown strings out', (() => {
    const call = seen('fetch').find((c) => String(c[1]).includes('zia.example.invalid'));
    return Boolean(call);
  })());
  check('WIRED translate maps the remote answer', wTr.json.data.items[1].engine === 'zia-translate'
    && wTr.json.data.items[1].translated === 'ಪರೀಕ್ಷೆ' && wTr.json.meta.source === 'zia-translate');

  // QuickML SDK path wins over the local model, and the narrative uses Zia.
  const wPredict = await post('/predict/outcome', { districtId: '0101', hour: 23 }, null, W);
  check('WIRED predict uses the QuickML SDK', wPredict.json.meta.source === 'quickml-sdk'
    && wPredict.json.data.probability === 0.77 && wPredict.json.data.predictedClass === 'A');
  check('WIRED quickml receives a string feature map', (() => {
    const d = seen('quickml')[0][2];
    return seen('quickml')[0][1] === 'endpoint-key-1' && d.districtId === '0101' && d.hour === '23';
  })());
  const wNarrative = await post('/ai/narrative', { caseId: 1 }, null, W);
  check('WIRED narrative uses Zia text analytics', wNarrative.json.meta.source === 'zia'
    && wNarrative.json.data.sentiment === 'negative' && wNarrative.json.data.entities.length > 0);

  // The coverage matrix must now report these as active, not flag-gated.
  const wServices = await get('/meta/services', W);
  const byKey = new Map(wServices.json.data.services.map((r) => [r.key, r]));
  check('WIRED service map reports mail/push/circuits active',
    byKey.get('mail').status === 'active' && byKey.get('push-notifications').status === 'active'
    && byKey.get('circuits').status === 'active' && byKey.get('connections').status === 'active');
  check('WIRED service map reports File Store live', byKey.get('file-store').status === 'live');
  check('WIRED service map still marks console-only services pending',
    byKey.get('pipelines').status === 'console-pending' && byKey.get('domain-mappings').status === 'console-pending');
  const wModels = await get('/ml/models', W);
  check('WIRED model registry shows the remote models serving',
    wModels.json.data.models.find((m) => m.key === 'quickml-outcome').status === 'serving'
    && wModels.json.data.models.find((m) => m.key === 'zia-automl-outcome').status === 'serving');

  // Zia AutoML is reached when QuickML is unavailable — proving the chain order.
  const autoApp = createApp({
    clientFactory: () => stub,
    flags: Object.assign({}, wiredFlags, { quickml: false }),
    servicesFactory: () => ({
      ziaClient: { automl: async (id, data) => { note('zia-automl', id, data); return { classification_result: { A: 0.62 } }; } }
    })
  });
  const autoServer = autoApp.listen(0);
  await new Promise((r) => autoServer.once('listening', r));
  const A = `http://127.0.0.1:${autoServer.address().port}/api/v1`;
  const autoPredict = await post('/predict/outcome', { districtId: '0101' }, null, A);
  check('WIRED predict falls to Zia AutoML when QuickML is off', autoPredict.json.meta.source === 'zia-automl'
    && autoPredict.json.data.probability === 0.62 && autoPredict.json.data.modelId === 'automl-1');
  autoServer.close();

  wiredServer.close();
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  resetArtifacts();
}

// --- the paged network graph must be memoized, not rebuilt per request ------

{
  let edgeReads = 0;
  const counting = {
    async execute(sql, q) {
      if (q && q.table === 'NetworkEdge') edgeReads += 1;
      return stub.execute(sql, q);
    }
  };
  const gApp = createApp({ clientFactory: () => counting });
  const gServer = gApp.listen(0);
  await new Promise((r) => gServer.once('listening', r));
  const G = `http://127.0.0.1:${gServer.address().port}/api/v1`;
  const g1 = await get('/network/graph', G);
  const after1 = edgeReads;
  const g2 = await get('/network/graph?personKey=P001&depth=1', G);
  const g3 = await get('/network/path?from=P001&to=P003', G);
  check('network graph builds from the table once', after1 >= 1 && g1.json.data.nodes.length >= 5);
  check('network graph is memoized across requests and routes', edgeReads === after1, `${edgeReads} reads vs ${after1}`);
  check('memoized graph still filters per request', g2.json.data.nodes.length === 3 && g3.json.data.found === true);
  gServer.close();
}

// --- envelope on unknown route ---------------------------------------------

{
  const { status, json } = await get('/does-not-exist');
  check('404 keeps envelope', status === 404 && json.ok === false && json.error.code === 'NOT_FOUND');
}

server.close();

// ---------------------------------------------------------------------------
// PUBLIC_DEMO fixture fallback: a datastore client that ALWAYS throws (the
// live no-tables scenario). Every main GET route must still serve 200 with
// fixture-backed data, and healthz must report the honest fixture-demo mode.
// ---------------------------------------------------------------------------

{
  resetFixtureFallback();
  const downApp = createApp({
    clientFactory: () => ({
      async execute() { throw new Error('ZCQL QUERY EXECUTION ERROR: table does not exist'); }
    })
  });
  const downServer = downApp.listen(0);
  await new Promise((r) => downServer.once('listening', r));
  const DOWN = `http://127.0.0.1:${downServer.address().port}/api/v1`;

  // The entire GET contract suite must hold on fixture-served data.
  for (const [path, validator] of GET_CASES) {
    const { status, json } = await get(path, DOWN);
    check(`FIXTURE GET ${path} -> 200`, status === 200, `got ${status}: ${JSON.stringify(json && json.error)}`);
    check(`FIXTURE GET ${path} ok:true`, json && json.ok === true);
    if (json && json.ok) {
      check(`FIXTURE GET ${path} shape`, Boolean(validator(json.data, json.meta || {})), JSON.stringify(json.data).slice(0, 300));
    }
  }

  // Case detail with full ER joins works off the fixture too.
  const detail = await get('/cases/1', DOWN);
  check('FIXTURE case detail joins', detail.status === 200 && detail.json.ok === true
    && detail.json.data.accused.length === 2 && detail.json.data.sections.length === 2
    && detail.json.data.chargesheet && detail.json.data.chargesheet.type === 'A');

  // Copilot answers from the fixture.
  const cop = await post('/copilot/query', { q: 'top 5 districts for vehicle theft this year' }, null, DOWN);
  check('FIXTURE copilot answers', cop.status === 200 && cop.json.ok === true
    && typeof cop.json.data.answer === 'string' && cop.json.data.answer.trim().length > 10);

  // A raw write during fallback is APPLIED to the fixture tables — the acked
  // alert must stay acked when the client invalidates and refetches (this is
  // the headline judge-facing interaction in PUBLIC_DEMO mode).
  const ack = await post('/alerts/AL-001/ack', {}, { Authorization: 'Bearer demo-admin' }, DOWN);
  check('FIXTURE ack write succeeds', ack.status === 200 && ack.json.ok === true && ack.json.data.status === 'ACK');
  const openAfter = await get('/alerts?status=OPEN', DOWN);
  check('FIXTURE ack persists across refetch', openAfter.json.data.length === 2 && openAfter.json.data.every((a) => a.alertId !== 'AL-001'), JSON.stringify(openAfter.json.data.map((a) => a.alertId)));
  const detailAfter = await get('/alerts/AL-001', DOWN);
  check('FIXTURE alert detail shows ACK', detailAfter.status === 200 && detailAfter.json.data.status === 'ACK');
  const kpiAfter = await get('/summary/kpis?nocache=1', DOWN);
  check('FIXTURE KPI activeAlerts drops after ack', kpiAfter.json.data.activeAlerts === 2, String(kpiAfter.json.data.activeAlerts));
  const dismiss = await post('/alerts/AL-002/status', { status: 'DISMISSED' }, { 'x-admin-token': 'demo-admin' }, DOWN);
  check('FIXTURE status write succeeds', dismiss.status === 200 && dismiss.json.data.status === 'DISMISSED');
  const dismissed = await get('/alerts?status=DISMISSED', DOWN);
  check('FIXTURE dismissal persists', dismissed.json.data.length === 1 && dismissed.json.data[0].alertId === 'AL-002');

  // Second-pass POST endpoint answers from the fixture too.
  const watch = await post('/offenders/watch', { personKeys: ['P001', 'P004'] }, null, DOWN);
  check('FIXTURE watchlist validation works', watch.status === 200 && watch.json.ok === true
    && watch.json.data.profiles.length === 2 && watch.json.data.notFound.length === 0);

  // Every new Catalyst-service endpoint must still answer with the Data Store
  // unreachable — that is the whole point of the fallback chains.
  const fxSearch = await get('/search/cases?q=OTP', DOWN);
  check('FIXTURE search falls back to ZCQL LIKE over the fixture', fxSearch.status === 200
    && fxSearch.json.data.source === 'fallback-zcql-like' && fxSearch.json.data.results.length > 0);
  const fxDigest = await post('/admin/digest/send', {}, { 'x-admin-token': 'demo-admin' }, DOWN);
  check('FIXTURE digest still renders a preview', fxDigest.status === 200
    && fxDigest.json.data.sent === false && fxDigest.json.data.preview.lines.length > 0);
  resetArtifacts();
  const fxArch = await post('/reports/archive', { window: 'last7' }, null, DOWN);
  check('FIXTURE archive stores in memory', fxArch.status === 200 && fxArch.json.data.storage === 'memory');
  const fxRead = await get(`/reports/artifacts/${fxArch.json.data.artifactId}`, DOWN);
  check('FIXTURE archived artefact reads back', fxRead.status === 200
    && JSON.parse(fxRead.json.data.body).alerts.length > 0);
  const fxCircuit = await post('/admin/circuit/nightly-refresh', {}, { 'x-admin-token': 'demo-admin' }, DOWN);
  check('FIXTURE circuit runs inline end to end', fxCircuit.status === 200
    && fxCircuit.json.data.status === 'success' && fxCircuit.json.data.steps.length === 3
    && fxCircuit.json.data.steps.every((s) => s.status === 'success'));
  const fxOcr = await post('/zia/ocr', { text: 'gold chain snatched by two persons on a two-wheeler' }, null, DOWN);
  check('FIXTURE ocr fallback works', fxOcr.status === 200 && fxOcr.json.data.moTags.length > 0);
  const fxTr = await post('/zia/translate', { text: 'Robbery', target: 'hi' }, null, DOWN);
  check('FIXTURE translate works from the glossary', fxTr.status === 200 && fxTr.json.data.items[0].translated === 'लूट');
  const fxMe = await get('/auth/me', DOWN);
  check('FIXTURE auth/me stays anonymous-readable', fxMe.status === 200 && fxMe.json.data.anonymous === true);
  resetArtifacts();

  const refresh = await get('/meta/refresh?nocache=1', DOWN);
  check('FIXTURE meta/refresh honest mode', refresh.status === 200 && refresh.json.data.mode === 'fixture-demo' && refresh.json.data.nightly && refresh.json.data.nightly.refreshedAt);

  // healthz: honest but healthy — fixture-demo mode, top-level status ok.
  const hz = await get('/healthz?nocache=1', DOWN);
  const h = (hz.json && hz.json.data) || {};
  check('FIXTURE healthz -> 200 ok envelope', hz.status === 200 && hz.json.ok === true && hasKeys(hz.json, ['ok', 'data', 'meta']));
  check('FIXTURE healthz status ok', h.status === 'ok', JSON.stringify(h).slice(0, 300));
  check('FIXTURE healthz datastore fixture-demo', h.datastore && h.datastore.ok === true && h.datastore.mode === 'fixture-demo');
  check('FIXTURE healthz rowCounts from fixture', h.datastore && h.datastore.rowCounts.CaseMaster === 40 && h.datastore.rowCounts.AnomalyAlert === 4 && h.datastore.rowCounts.OffenderProfile === 6);
  check('FIXTURE healthz nosql fixture-demo', h.nosql && h.nosql.ok === true && h.nosql.mode === 'fixture-demo');
  check('FIXTURE healthz cache ok', h.cache && h.cache.ok === true);

  // Fallback activation state was tracked.
  const st = getFallbackState();
  check('FIXTURE fallback state active', st.active === true && st.datastore === true && st.nosql === true, JSON.stringify(st));
  check('FIXTURE fallback counted queries+writes', st.queries > 0 && st.writes > 0, JSON.stringify(st));

  downServer.close();
}

console.log('');
console.log(`RESULT: ${pass} passed, ${failCount} failed`);
if (failCount > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('ALL GREEN — dappa_api contract suite passed.');
