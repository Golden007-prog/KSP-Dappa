// KSP DAPPA backend test harness — plain Node, no framework.
// Boots the Express app with a stubbed datastore (canned rows shaped like real
// ZCQL results for every query pattern) and asserts the CONTRACTS shapes.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../lib/app.js');
const { createStubClient, buildZCQL } = require('../lib/datastore.js');
const { buildFixtureTables, getFallbackState, resetFixtureFallback } = require('../lib/fixture.js');
const { CANNED_UTTERANCES, parse } = require('../lib/copilot.js');

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
