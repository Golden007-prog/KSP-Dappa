// KSP DAPPA backend test harness — plain Node, no framework.
// Boots the Express app with a stubbed datastore (canned rows shaped like real
// ZCQL results for every query pattern) and asserts the CONTRACTS shapes.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../lib/app.js');
const { createStubClient } = require('../lib/datastore.js');
const { buildFixtureTables, getFallbackState, resetFixtureFallback } = require('../lib/fixture.js');
const { CANNED_UTTERANCES } = require('../lib/copilot.js');

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

// --- GET endpoints: 200 + {ok:true} + contract keys -------------------------

const GET_CASES = [
  ['/meta/lookups', (d) => hasKeys(d, ['districts', 'units', 'crimeHeads', 'crimeSubHeads', 'categories', 'statuses', 'gravities']) && d.districts.length === 38 && d.units.length > 0],
  ['/summary/kpis', (d) => hasKeys(d, ['totalFirs', 'momPct', 'heinousCount', 'detectionRate', 'activeAlerts', 'topRisingSubhead']) && hasKeys(d.topRisingSubhead, ['id', 'name', 'deltaPct']) && d.totalFirs > 0 && d.activeAlerts === 3],
  ['/trends/monthly', (d) => Array.isArray(d) && d.length === 12 && hasKeys(d[0], ['ym', 'caseCount', 'heinousCount'])],
  ['/trends/monthly?districtId=0101&crimeHeadId=3', (d) => Array.isArray(d) && d.every((r) => r.caseCount >= 0)],
  ['/trends/seasonality', (d) => hasKeys(d, ['weekdays', 'hours', 'matrix', 'maxCount']) && d.matrix.length === 7 && d.matrix[0].length === 24 && d.sampleSize > 0],
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
  ['/risk/stations?horizon=30', (d) => Array.isArray(d) && d.length === 15 && hasKeys(d[0], ['unitId', 'unitName', 'districtId', 'riskScore', 'drivers']) && d[0].riskScore >= d[1].riskScore],
  ['/cases?page=1&perPage=10', (d, meta) => Array.isArray(d) && d.length === 10 && hasKeys(d[0], ['caseMasterId', 'crimeNo', 'caseNo', 'registeredDate', 'districtName', 'unitName', 'headName', 'subHeadName', 'statusName', 'gravityName', 'anomalyFlag']) && meta.total === 40 && meta.page === 1 && meta.perPage === 10],
  ['/cases?districtId=0103&perPage=200', (d) => d.length === 8],
  ['/cases?perPage=500', (d, meta) => meta.perPage === 200],
  ['/healthz', (d) => d.status === 'ok' && d.datastore.ok === true && d.cache.ok === true && d.datastore.rowCounts.CaseMaster === 40]
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

  // A raw write during fallback is recorded and returns the success shape.
  const ack = await post('/alerts/AL-001/ack', {}, { Authorization: 'Bearer demo-admin' }, DOWN);
  check('FIXTURE ack write succeeds', ack.status === 200 && ack.json.ok === true && ack.json.data.status === 'ACK');

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
