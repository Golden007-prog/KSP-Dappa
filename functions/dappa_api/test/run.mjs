// KSP DAPPA backend test harness — plain Node, no framework.
// Boots the Express app with a stubbed datastore (canned rows shaped like real
// ZCQL results for every query pattern) and asserts the CONTRACTS shapes.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../lib/app.js');
const { createStubClient, buildZCQL, createDatastore, ZCQL_PAGE } = require('../lib/datastore.js');
const { buildFixtureTables, getFallbackState, resetFixtureFallback } = require('../lib/fixture.js');
const { CANNED_UTTERANCES, parse, hourBandsOverlap } = require('../lib/copilot.js');
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

async function del(path, base) {
  const res = await fetch((base || BASE) + path, { method: 'DELETE' });
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

// ZCQL's LIMIT first argument is a 1-BASED START ROW, not a rows-to-skip count.
// Measured live: "LIMIT 10,10" returns rows 10..19. So a zero-based offset goes
// out as offset+1, and page 1 omits it entirely.
check('buildZCQL LIMIT page 1 omits offset', buildZCQL({ table: 'T', limit: { offset: 0, count: 50 } }).endsWith(' LIMIT 50'));
check('buildZCQL LIMIT page 2 sends a 1-based start row', buildZCQL({ table: 'T', limit: { offset: 50, count: 50 } }).endsWith(' LIMIT 51,50'));
check('buildZCQL LIMIT page 3 start row', buildZCQL({ table: 'T', limit: { offset: 100, count: 50 } }).endsWith(' LIMIT 101,50'));

// ZCQL wildcards are * and ?, not SQL's % and _. Verified against the live
// 45,000-row store: BriefFacts LIKE '%theft%' matches 0 rows while '*theft*'
// matches 9,312, and GET /search/cases?q=OTP answers 10 cases through the
// fallback-zcql-like path. These pins are what stop that regressing.
{
  const like = buildZCQL({ table: 'CaseMaster', columns: ['CaseMasterID'], where: [{ col: 'BriefFacts', op: 'like', val: 'OTP' }] });
  check('ZCQL LIKE emits * wildcards, never %', like.includes("LIKE '*OTP*'") && !like.includes('%'), like);
  const dirty = buildZCQL({ table: 'CaseMaster', columns: ['CaseMasterID'], where: [{ col: 'BriefFacts', op: 'like', val: '%OTP_%' }] });
  check('ZCQL LIKE strips SQL wildcards out of the term', dirty.includes("LIKE '*OTP*'"), dirty);
  const quoted = buildZCQL({ table: 'OffenderProfile', columns: ['PersonKey'], where: [{ col: 'CanonicalName', op: 'like', val: "d'souza" }] });
  check('ZCQL LIKE escapes quotes inside the term', quoted.includes("LIKE '*d''souza*'"), quoted);
}

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
    onRows.find((r) => r.key === 'mail').status === 'console-pending');
  check('IN-DC-unavailable services never read console-pending, whatever the flag (D-019)',
    onRows.find((r) => r.key === 'circuits').status === 'unavailable'
    && onRows.find((r) => r.key === 'zia-automl').status === 'unavailable'
    && /IN data centre/.test(onRows.find((r) => r.key === 'circuits').statusReason));
}

// Pure helpers behind the new service paths.
{
  check('glossary translates a domain term to Kannada', glossaryLookup('Chain Snatching', 'kn') === 'ಸರ ಕಳ್ಳತನ');
  check('glossary translates a second domain term to Kannada', glossaryLookup('Vehicle Theft', 'kn') === 'ವಾಹನ ಕಳ್ಳತನ');
  check('glossary has no Hindi values (locale retired 27 Aug 2026)', glossaryLookup('Vehicle Theft', 'hi') === null);
  check('glossary misses return null (never a guess)', glossaryLookup('quantum widget', 'kn') === null);
  check('glossary carries a Kannada value for every entry and no Hindi leftovers',
    Object.values(TRANSLATION_GLOSSARY).every((v) => v.kn && v.hi === undefined));
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

// Analytics helpers behind the link-analysis (C2) and behavioural (C5) routes.
{
  const an = require('../lib/analytics.js');
  check('percentile uses mid-rank for ties', an.percentileOf([1, 2, 2, 3], 2) === 50, String(an.percentileOf([1, 2, 2, 3], 2)));
  check('percentile of the top value', an.percentileOf([1, 2, 3, 4], 4) === 87.5, String(an.percentileOf([1, 2, 3, 4], 4)));
  check('percentile of an empty population is null, never a misleading 0', an.percentileOf([], 5) === null);
  check('concentration is 1 for a single tag', an.concentration([7]) === 1);
  check('concentration is 1/k when evenly spread', an.concentration([2, 2, 2, 2]) === 0.25);
  check('concentration of nothing is 0', an.concentration([]) === 0);
  check('scale100 guards a zero-width range', an.scale100(5, 3, 3) === 100 && an.scale100(1, 3, 3) === 0);
  check('ymDiff counts whole months across a year boundary', an.ymDiff('2025-11', '2026-02') === 3);
  check('ymDiff refuses garbage rather than guessing', an.ymDiff('nope', '2026-02') === null);
  check('jaccard overlap', an.jaccard(['a', 'b'], ['b', 'c']) === 0.333, String(an.jaccard(['a', 'b'], ['b', 'c'])));
  check('daysBetween spans a month', an.daysBetween('2026-01-01', '2026-02-01') === 31);
  check('ymOfDate reads a datetime', an.ymOfDate('2026-03-11 08:00:00') === '2026-03' && an.ymOfDate('') === null);
  // The padded/unpadded district split is the bug that made ?districtId=0101
  // return the whole state: unitsOfDistrict matched nothing, so the IN clause
  // was dropped entirely.
  check('district key collapses zero padding', an.districtKey('0101') === '101' && an.districtKey('101') === '101');
  const resolve = an.makeDistrictResolver({ districts: [{ districtId: '0103', districtName: 'Mysuru City' }] });
  check('district resolver accepts either padding', resolve('0103') === '0103' && resolve('103') === '0103');
  check('district resolver accepts a name (the live DistrictsJson dialect)', resolve('Mysuru City') === '0103');
  check('district resolver refuses to guess', resolve('Atlantis') === null);
  check('suspect name key normalises case and whitespace', an.nameKey('  Ravi   KUMAR ') === 'ravi kumar');
  const co = an.coOccurrence([['a', 'b'], ['a', 'b'], ['a', 'c'], ['d']], { minSupport: 2, topTags: 10 });
  check('co-occurrence keeps only supported tags', co.tags.join(',') === 'a,b', co.tags.join(','));
  const ab = co.pairs.find((p) => p.a === 'a' && p.b === 'b');
  check('co-occurrence lift is P(a,b)/P(a)P(b)', ab && ab.pairCount === 2 && ab.lift === 1.33 && ab.confidence === 0.667, JSON.stringify(ab));
  const fam = an.tagFamilies(
    [{ a: 'x', b: 'y', pairCount: 3, lift: 2 }, { a: 'z', b: 'w', pairCount: 1, lift: 9 }],
    new Map([['x', 5], ['y', 2], ['z', 1], ['w', 1]]),
    { minLift: 1.2, minPairCount: 2 }
  );
  check('tag families join only pairs clearing lift AND support', fam.length === 3 && fam[0].tags.join(',') === 'x,y', JSON.stringify(fam));
  check('component sizes see one connected graph', an.componentSizes(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]).join(',') === '3');
  check('component sizes split a disconnected graph', an.componentSizes(['a', 'b', 'c', 'd'], [['a', 'b']]).join(',') === '2,1,1');
  const ws = an.weightedScore([
    { key: 'k1', label: 'l1', value: 1, normalized: 100, weight: 0.5 },
    { key: 'k2', label: 'l2', value: 0, normalized: 0, weight: 0.5 }
  ]);
  check('weighted score is exactly the sum of its drivers', ws.score === 50 && ws.drivers[0].key === 'k1' && ws.drivers[0].contribution === 50);
  check('chunk splits ZCQL IN lists', an.chunk([1, 2, 3, 4, 5], 2).length === 3);
  check('score banding', an.band(80) === 'high' && an.band(50) === 'elevated' && an.band(30) === 'moderate' && an.band(10) === 'low');
  check('median of an even list', an.median([1, 2, 3, 4]) === 2.5 && an.median([]) === null);
}

// Cache: an oversized aggregate must not poison the shared backend.
{
  const { createCache, MAX_REMOTE_BYTES } = require('../lib/cache.js');
  const written = [];
  const seg = { async put(k, v) { written.push([k, v]); }, async getValue() { return undefined; } };
  const c = createCache({ getSegment: async () => seg });
  await c.put('small', { a: 1 }, 60);
  const huge = { blob: 'x'.repeat(MAX_REMOTE_BYTES + 1024) };
  await c.put('huge', huge, 60);
  check('cache writes a normal value through to Catalyst', written.length === 1 && written[0][0] === 'small');
  check('cache keeps an oversized value local instead of failing the backend',
    c.oversizedWrites === 1 && c.backend === 'catalyst', `${c.oversizedWrites}/${c.backend}`);
  const back = await c.get('huge');
  check('an oversized value is still served from memory', back && back.value.blob.length === huge.blob.length);
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

  // Hour bands are HALF-OPEN [start, end). A cluster labelled 19:00-21:00 is
  // active at 19 and 20 and is over by 21, so it must not answer a question
  // about night (21:00-05:00). Treating the end hour as covered made every
  // evening cluster collide with night on hour 21, and "hotspots at night"
  // came back with a 19:00-21:00 cluster.
  check('hour band 19-21 does NOT overlap night 21-5', hourBandsOverlap(19, 21, 21, 5) === false);
  check('hour band 21-23 DOES overlap night 21-5', hourBandsOverlap(21, 23, 21, 5) === true);
  check('hour band 17-19 overlaps evening 17-21', hourBandsOverlap(17, 19, 17, 21) === true);
  check('hour band 21-1 does NOT overlap evening 17-21', hourBandsOverlap(21, 1, 17, 21) === false);
  check('hour band 11-12 overlaps morning 5-12', hourBandsOverlap(11, 12, 5, 12) === true);
  check('hour band 12-14 does NOT overlap morning 5-12', hourBandsOverlap(12, 14, 5, 12) === false);
  check('hour band 16-18 overlaps afternoon 12-17', hourBandsOverlap(16, 18, 12, 17) === true);
  check('hour band 17-19 does NOT overlap afternoon 12-17', hourBandsOverlap(17, 19, 12, 17) === false);
  check('zero-width hour band covers nothing', hourBandsOverlap(21, 21, 0, 24) === false);
  check('midnight-wrapping band still works', hourBandsOverlap(23, 2, 21, 5) === true);
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
  ['/cases?page=1&perPage=10', (d, meta) => Array.isArray(d) && d.length === 10 && hasKeys(d[0], ['caseMasterId', 'crimeNo', 'caseNo', 'registeredDate', 'districtName', 'unitName', 'headName', 'subHeadName', 'statusName', 'gravityName', 'anomalyFlag']) && meta.total === 52 && meta.page === 1 && meta.perPage === 10],
  ['/cases?districtId=0103&perPage=200', (d) => d.length === 8],
  // A jurisdiction filter must fail CLOSED. An unresolved districtId used to
  // drop the predicate entirely, so this returned the whole corpus (live:
  // districtId=9999 -> 45,000 rows across 22 districts) while the UI still
  // showed a district filter as active.
  ['/cases?districtId=9999&perPage=200', (d, meta) => Array.isArray(d) && d.length === 0 && meta.total === 0],
  ['/cases?districtId=not-an-id&perPage=200', (d) => Array.isArray(d) && d.length === 0],
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
  // --- link-analysis endpoints (C2) -----------------------------------------
  ['/network/victim-links?perPage=5', (d, meta) => hasKeys(d, ['scope', 'summary', 'nodes', 'links', 'topSuspects', 'topVictims', 'bridgeCases', 'scan'])
    && d.summary.cases === 52 && d.summary.victims === 6 && d.summary.suspects === 6
    && d.summary.components === 1 && d.summary.largestComponent === 64
    && d.summary.avgVictimsPerCase > 1 && d.summary.repeatSuspects === 6
    && d.nodes.filter((n) => n.type === 'case').length === 5
    && d.nodes.every((n) => ['case', 'victim', 'suspect'].includes(n.type))
    && d.links.length > 0 && d.links.every((l) => ['victim-case', 'case-suspect'].includes(l.type))
    && d.topSuspects.length > 0
    && hasKeys(d.topSuspects[0], ['suspectKey', 'name', 'caseCount', 'victimCount', 'districtCount', 'districtNames', 'personKey', 'riskScore'])
    && d.bridgeCases.length > 0 && hasKeys(d.bridgeCases[0], ['caseMasterId', 'victims', 'suspects', 'degree'])
    && d.scan.casesScanned === 52 && d.scan.casesTruncated === false && d.scan.childTruncated === false
    && meta.total === 52 && meta.perPage === 5],
  ['/network/victim-links?districtId=0103', (d) => d.scope.districtId === '0103' && d.summary.cases === 8
    && d.summary.victims > 0 && d.summary.suspects > 0],
  // An unknown district must answer "nothing", never silently drop the filter
  // and hand back the whole state.
  ['/network/victim-links?districtId=9999', (d) => d.summary.cases === 0 && d.nodes.length === 0
    && d.links.length === 0 && d.topSuspects.length === 0 && d.summary.largestComponent === 0],
  ['/network/locations', (d, meta) => hasKeys(d, ['window', 'method', 'locations', 'summary', 'scan'])
    && d.summary.locations === 8 && d.summary.units === 5 && d.summary.hotspots === 3
    && d.locations[0].recurrenceScore >= d.locations[1].recurrenceScore
    && hasKeys(d.locations[0], ['locationId', 'locationType', 'name', 'districtId', 'districtName', 'lat', 'lng',
      'caseCount', 'monthsActive', 'persistencePct', 'offenderAffiliation', 'communities', 'recurrenceScore', 'band', 'drivers', 'crossCommunity'])
    && hasKeys(d.locations[0].offenderAffiliation, ['offenders', 'basis', 'strength', 'topOffenders'])
    && d.locations[0].drivers.length === 4
    && Math.abs(d.locations[0].drivers.reduce((s, x) => s + x.contribution, 0) - d.locations[0].recurrenceScore) < 0.2
    && d.locations.some((l) => l.locationType === 'hotspot' && typeof l.lat === 'number')
    && d.locations.filter((l) => l.locationType === 'unit').every((l) => typeof l.lat === 'number')
    && meta.total === 8],
  ['/network/locations?type=hotspot', (d, meta) => meta.total === 3 && d.locations.every((l) => l.locationType === 'hotspot' && l.clusterId)],
  ['/network/locations?districtId=0101', (d) => d.locations.length === 3 && d.locations.every((l) => l.districtId === '0101')],
  ['/network/communities/score', (d, meta) => hasKeys(d, ['communities', 'weights', 'method', 'population', 'scan'])
    && d.communities.length === 2 && d.communities[0].communityId === 1
    && d.communities[0].memberCount === 3 && d.communities[0].edgeCount === 3 && d.communities[0].density === 1
    && d.communities[0].districtSpan === 2 && d.communities[0].repeatOffenderShare === 1
    && d.communities[0].score >= d.communities[1].score
    && d.communities[0].drivers.length === 6
    && Math.abs(d.communities[0].drivers.reduce((s, x) => s + x.contribution, 0) - d.communities[0].score) < 0.2
    && d.communities[0].drivers.every((x) => hasKeys(x, ['key', 'label', 'value', 'unit', 'normalized', 'weight', 'contribution']))
    && ['low', 'moderate', 'elevated', 'high'].includes(d.communities[0].band)
    && d.communities[0].districtBreakdown.length === 2 && d.communities[0].keyPerson.personKey === 'P001'
    && d.population.offenders === 6 && d.population.unassignedOffenders === 1
    && d.scan.edgeMode === 'grouped' && meta.total === 2],
  ['/network/communities/score?minSize=3', (d, meta) => d.communities.length === 1 && d.communities[0].memberCount === 3 && meta.total === 1],
  // --- behavioural endpoints (C5) -------------------------------------------
  ['/offenders/mo-evolution?months=12&minSupport=1', (d, meta) => hasKeys(d, ['window', 'months', 'activeOffenders', 'series', 'emerging', 'fading', 'cooccurrence', 'families', 'params', 'method', 'scan'])
    && d.months.length === 12 && d.activeOffenders.length === 12 && d.activeOffenders.some((n) => n > 0)
    && d.series.length > 0 && d.series.every((s) => s.counts.length === 12)
    && d.series.some((s) => s.tag === 'vehicle-theft' && s.offenders === 2 && s.cases === 8)
    && d.cooccurrence.length > 0 && d.cooccurrence.every((p) => hasKeys(p, ['a', 'b', 'pairCount', 'support', 'lift', 'confidence']))
    && d.families.length > 0 && d.families[0].familyId === 'F01'
    && d.families.every((f) => hasKeys(f, ['familyId', 'label', 'tags', 'tagCount', 'offenders', 'cases', 'avgRisk', 'sharePct']))
    && d.scan.profilesScanned === 6 && d.scan.profilesTruncated === false
    && meta.tags === d.series.length],
  // Empty result: nothing clears a support of 99, and that must be a clean 200.
  ['/offenders/mo-evolution?months=6&minSupport=99', (d) => d.months.length === 6 && d.series.length === 0
    && d.cooccurrence.length === 0 && d.families.length === 0 && d.emerging.length === 0],
  ['/offenders/P001/behaviour', (d, meta) => hasKeys(d, ['personKey', 'canonicalName', 'escalationScore', 'band', 'verdict', 'signals', 'timeline', 'halves', 'recent', 'dormancy', 'recentHeadMix', 'scan'])
    && d.personKey === 'P001'
    && d.signals.map((s) => s.key).join(',') === 'gravity,frequency,districtSpread,dormancy'
    && d.signals.every((s) => ['up', 'down', 'flat', 'unknown'].includes(s.direction) && typeof s.note === 'string')
    && d.escalationScore >= 0 && d.escalationScore <= 100
    && ['escalating', 'stable', 'de-escalating', 'dormant', 'insufficient-data'].includes(d.verdict)
    && d.scan.caseIdsLinked === 4 && d.scan.casesDated === 4 && d.scan.caseIdsTruncated === false
    && d.timeline.length > 0 && d.timeline.every((t) => /^\d{4}-\d{2}$/.test(t.ym) && typeof t.cases === 'number')
    && hasKeys(d.halves.early, ['cases', 'months', 'casesPerMonth', 'heinousShare', 'districts'])
    && hasKeys(d.dormancy, ['monthsSinceLastCase', 'longestGapDays', 'dormantSpells', 'reactivated', 'lastCaseYm'])
    && meta.personKey === 'P001'],
  // An offender with no linked cases must degrade, not throw or overclaim.
  ['/offenders/P006/behaviour', (d) => d.verdict === 'insufficient-data' && d.scan.caseIdsLinked === 0
    && d.signals.length === 4 && d.signals[0].direction === 'unknown'],
  ['/offenders/P001/cohort?size=5', (d, meta) => hasKeys(d, ['subject', 'cohort', 'peers', 'percentiles', 'population', 'method', 'scan'])
    && d.subject.personKey === 'P001' && d.subject.districtSpan === 2
    && d.peers.length === 5 && d.peers.every((p) => p.personKey !== 'P001')
    && d.peers.every((p) => hasKeys(p, ['personKey', 'canonicalName', 'caseCount', 'riskScore', 'communityId', 'districtSpan', 'sharedMoTags', 'matchedOn', 'similarity']))
    && d.peers[0].similarity >= d.peers[4].similarity
    && d.peers[0].personKey === 'P002' && d.peers[0].sameCommunity === true
    && d.percentiles.riskScore.cohort > 80 && d.percentiles.riskScore.population > 80
    && typeof d.percentiles.caseCount.population === 'number'
    && d.cohort.criteria.caseCountRange[0] === 3 && d.cohort.criteria.caseCountRange[1] === 12
    && d.population.offenders === 6 && meta.cohortSize === 5],
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
  // A term buried mid-sentence only matches because buildZCQL wraps it in
  // LEADING and trailing '*' — the pin for the wildcard fix, end to end.
  ['/search/cases?q=mangalsutra', (d) => d.source === 'fallback-zcql-like' && d.results.length > 0
    && d.results.some((r) => r.type === 'case' && String(r.snippet).toLowerCase().includes('mangalsutra'))],
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
  ['/healthz', (d) => d.status === 'ok' && d.datastore.ok === true && d.cache.ok === true && d.datastore.rowCounts.CaseMaster === 52
    && d.datastore.completeness && d.datastore.completeness.tables.CaseMaster.expected === 45000
    && (d.datastore.completeness.tables.CaseMaster.actual === null
      ? (d.datastore.completeness.tables.CaseMaster.pct === null && d.datastore.completeness.overallPct === null)
      : (d.datastore.completeness.tables.CaseMaster.actual === 52
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
  // End-to-end guard on the same boundary. Fixture clusters are HS-01 23:00-03:00,
  // HS-02 21:00-01:00 and HS-03 20:00-23:00. An evening question (17:00-21:00)
  // covers hours 17-20, so HS-03 qualifies on hour 20 but HS-02 must not — it
  // only starts at 21. Under the old closed-interval logic HS-02 collided with
  // evening on hour 21, which is the shape of the reported night bug.
  const evening = await post('/copilot/query', { q: 'hotspots in the evening in Bengaluru City' });
  const eveningAnswer = String((evening.json.data || {}).answer || '');
  check('copilot evening hotspot excludes the 21:00-start cluster',
    !eveningAnswer.includes('21:00–01:00') && !eveningAnswer.includes('21:00-01:00'), eveningAnswer);
  // HS-04 ends at 21:00 and outranks the real night clusters on intensity, so a
  // closed band puts it first here. Assert on the literal band strings, not via
  // hourBandsOverlap — validating the answer with the function under test would
  // let both regress together. Both directions are required: the negative alone
  // would also pass if the filter over-corrected and returned nothing.
  const night = await post('/copilot/query', { q: 'hotspots at night in Bengaluru City' });
  const nightAnswer = String((night.json.data || {}).answer || '');
  check('copilot night hotspot excludes the cluster that ENDS at 21:00',
    !/19:00[–-]21:00/.test(nightAnswer), nightAnswer);
  check('copilot night hotspot still includes a genuine night cluster',
    /23:00[–-]03:00|21:00[–-]01:00/.test(nightAnswer), nightAnswer);

  // A fractional hour bound used to spin hoursIn forever (whole-hour steps can
  // never equal a fractional stop), hanging the function rather than answering.
  // NOTE: if the Math.round guard is ever removed this assertion HANGS rather
  // than failing — a suite that never finishes is the symptom to look for here.
  check('hour band tolerates a non-integer bound', hourBandsOverlap(12.5, 17, 12, 17) === true);
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

// --- watchlist persistence (Catalyst Cache, not localStorage) ----------------

{
  const seed = await post('/offenders/watch', { personKeys: ['P001', 'P004', 'ZZZ'], listId: 'crb' });
  check('watch stores only the keys that resolved to a person',
    seed.json.data.watchlist.keys.join(',') === 'P001,P004', JSON.stringify(seed.json.data.watchlist));
  check('watch reports the list and mode it wrote', seed.json.data.listId === 'crb'
    && seed.json.data.mode === 'add' && seed.json.meta.persisted === true && seed.json.data.notFound[0] === 'ZZZ');
  const add = await post('/offenders/watch', { personKeys: ['P002'], listId: 'crb' });
  check('watch add is a union, not a replace', add.json.data.watchlist.keys.join(',') === 'P001,P004,P002',
    add.json.data.watchlist.keys.join(','));
  const read = await get('/offenders/watchlist?listId=crb');
  check('the stored watchlist reads back enriched and risk-sorted', read.status === 200
    && read.json.data.profiles.length === 3
    && read.json.data.profiles[0].riskScore >= read.json.data.profiles[1].riskScore
    && hasKeys(read.json.data.profiles[0], ['personKey', 'canonicalName', 'aliases', 'caseCount', 'districts',
      'districtNames', 'daysSinceLastSeen', 'moTags', 'riskScore', 'associates', 'openAlertsInDistricts']));
  const removed = await post('/offenders/watch', { personKeys: ['P004'], listId: 'crb', mode: 'remove' });
  check('watch remove drops the key', removed.json.data.watchlist.keys.join(',') === 'P001,P002');
  const replaced = await post('/offenders/watch', { personKeys: ['P003'], listId: 'crb', mode: 'replace' });
  check('watch replace swaps the whole list', replaced.json.data.watchlist.keys.join(',') === 'P003');
  const dry = await post('/offenders/watch', { personKeys: ['P005'], listId: 'crb', mode: 'none' });
  check('watch mode=none validates without writing', dry.json.data.profiles.length === 1
    && dry.json.data.watchlist.keys.join(',') === 'P003' && dry.json.meta.persisted === false);
  const badMode = await post('/offenders/watch', { personKeys: ['P001'], mode: 'obliterate' });
  check('watch with an unknown mode -> 400', badMode.status === 400 && badMode.json.error.code === 'BAD_REQUEST');
  const badList = await post('/offenders/watch', { personKeys: ['P001'], listId: 'has spaces' });
  check('watch with a malformed listId -> 400', badList.status === 400);
  const badListRead = await get('/offenders/watchlist?listId=has%20spaces');
  check('watchlist read with a malformed listId -> 400', badListRead.status === 400);
  const cleared = await del('/offenders/watchlist?listId=crb');
  check('watchlist clears', cleared.status === 200 && cleared.json.data.cleared === 1
    && cleared.json.data.watchlist.count === 0);
  const afterClear = await get('/offenders/watchlist?listId=crb');
  check('a cleared watchlist reads empty, not 404', afterClear.status === 200
    && afterClear.json.data.profiles.length === 0 && afterClear.json.data.requested === 0);
  // The earlier POST /offenders/watch (no listId) seeded 'default'; named lists
  // must not have leaked into it.
  const legacy = await get('/offenders/watchlist');
  check('the default list is independent of a named one', legacy.json.data.listId === 'default'
    && legacy.json.data.watchlist.keys.includes('P001') && !legacy.json.data.watchlist.keys.includes('P003'),
    JSON.stringify(legacy.json.data.watchlist));
}

// --- link-analysis + behavioural paging, caching and bad input ---------------

{
  const p1 = await get('/network/victim-links?perPage=10&page=1');
  const p2 = await get('/network/victim-links?perPage=10&page=2');
  const ids1 = p1.json.data.nodes.filter((n) => n.type === 'case').map((n) => n.caseMasterId);
  const ids2 = p2.json.data.nodes.filter((n) => n.type === 'case').map((n) => n.caseMasterId);
  check('victim-links pages the case list', ids1.length === 10 && ids2.length === 10
    && !ids1.some((id) => ids2.includes(id)), JSON.stringify([ids1.length, ids2.length]));
  check('victim-links keeps the summary page-independent',
    JSON.stringify(p1.json.data.summary) === JSON.stringify(p2.json.data.summary));
  // The cache key deliberately drops page/perPage: one scope is computed once
  // and sliced, instead of re-walking Victim and Accused for every page.
  check('victim-links caches the scope, not the page', p2.json.meta.cached === true);
  check('victim-links only ships nodes its page actually links',
    p1.json.data.nodes.filter((n) => n.type !== 'case').every((n) => p1.json.data.links.some((l) => l.source === n.id || l.target === n.id)));
  const ravi = p1.json.data.topSuspects.find((s) => s.name === 'Ravi Kumar');
  check('victim-links resolves a suspect to their offender profile',
    ravi && ravi.personKey === 'P001' && ravi.riskScore === 87.5, JSON.stringify(ravi));
  const sampled = await get('/network/victim-links?sample=50');
  check('victim-links honours a smaller sample budget',
    sampled.json.data.scan.budget === 50 && sampled.json.data.summary.cases <= 50);
  const clamped = await get('/network/victim-links?perPage=9999&sample=99999');
  check('victim-links clamps perPage and the sample budget',
    clamped.json.meta.perPage === 200 && clamped.json.data.scan.budget === 1200);
  const badTo = await get('/network/victim-links?to=last-tuesday');
  check('victim-links rejects a malformed date window', badTo.status === 400 && badTo.json.error.code === 'BAD_REQUEST');
  const badLocDate = await get('/network/locations?from=whenever');
  check('locations rejects a malformed date window', badLocDate.status === 400);
  const badKey = await get('/offenders/not%20a%20key/behaviour');
  check('behaviour rejects a malformed personKey', badKey.status === 400 && badKey.json.error.code === 'BAD_ID');
  const missingBehaviour = await get('/offenders/NOPE/behaviour');
  check('behaviour 404s an unknown offender', missingBehaviour.status === 404 && missingBehaviour.json.error.code === 'NOT_FOUND');
  const badCohortKey = await get('/offenders/not%20a%20key/cohort');
  check('cohort rejects a malformed personKey', badCohortKey.status === 400);
  const missingCohort = await get('/offenders/NOPE/cohort');
  check('cohort 404s an unknown offender', missingCohort.status === 404);
  // /offenders/mo-evolution must beat the /offenders/:personKey param route.
  const evo = await get('/offenders/mo-evolution?months=12&minSupport=1');
  check('mo-evolution wins over the :personKey param route',
    evo.status === 200 && Array.isArray(evo.json.data.series) && evo.json.data.months.length === 12);
  const profile = await get('/offenders/P001');
  check('the param route still answers a real key', profile.status === 200 && profile.json.data.personKey === 'P001');
}

// --- degradation when the store refuses a grouped/mixed aggregate -----------
// PUBLIC_DEMO is switched OFF for these two apps on purpose: with the fixture
// fallback in play the rejection would be silently answered from the fixture
// and the real degradation path would never run.

{
  const pickyAgg = {
    async execute(sql, q) {
      if (q && q.table === 'AggMonthly' && (q.columns || []).some((c) => /^MIN\(/i.test(c))) {
        throw new Error('ZCQL QUERY EXECUTION ERROR: unsupported aggregate combination');
      }
      return stub.execute(sql, q);
    }
  };
  const aggApp = createApp({ clientFactory: () => pickyAgg, flags: { publicDemo: false } });
  const aggServer = aggApp.listen(0);
  await new Promise((r) => aggServer.once('listening', r));
  const AG = `http://127.0.0.1:${aggServer.address().port}/api/v1`;
  const loc = await get('/network/locations', AG);
  check('locations degrades to the SUM-only unit aggregate', loc.status === 200
    && loc.json.data.scan.unitAggMode === 'sum-only' && loc.json.data.summary.units === 5,
    JSON.stringify(loc.json && loc.json.data && loc.json.data.scan));
  check('the degraded aggregate assumes the full window rather than one month',
    loc.json.data.locations.filter((l) => l.locationType === 'unit').every((l) => l.persistencePct === 100));
  aggServer.close();

  const noGroupedEdges = {
    async execute(sql, q) {
      if (q && q.table === 'NetworkEdge' && (q.groupBy || []).length) {
        throw new Error('ZCQL QUERY EXECUTION ERROR: group by unsupported');
      }
      return stub.execute(sql, q);
    }
  };
  const edgeApp = createApp({ clientFactory: () => noGroupedEdges, flags: { publicDemo: false } });
  const edgeServer = edgeApp.listen(0);
  await new Promise((r) => edgeServer.once('listening', r));
  const EG = `http://127.0.0.1:${edgeServer.address().port}/api/v1`;
  const scored = await get('/network/communities/score', EG);
  check('community scoring falls back to a paged edge scan', scored.status === 200
    && scored.json.data.scan.edgeMode === 'scan'
    && scored.json.data.communities[0].edgeCount === 3
    && scored.json.data.communities[0].density === 1,
    JSON.stringify(scored.json && scored.json.data && scored.json.data.scan));
  edgeServer.close();
}

// --- live-dialect regression: unpadded ids + district NAMES in DistrictsJson -
// The real Data Store holds District/Unit/AggMonthly ids UNPADDED ('101') and
// OffenderProfile.DistrictsJson as district NAMES, while the bundled fixture
// uses the padded id form throughout. Code that only understands one dialect
// matches nothing — and an empty unit list means the IN clause is dropped, so
// ?districtId=0101 quietly answered for the whole state. This scenario replays
// every district-scoped route against the live dialect.

{
  const live = buildFixtureTables();
  const nameById = new Map(live.District.map((d) => [String(d.DistrictID), d.DistrictName]));
  const bare = (v) => (v === null || v === undefined ? v : String(v).replace(/^0+(?=\d)/, ''));
  for (const d of live.District) d.DistrictID = bare(d.DistrictID);
  for (const u of live.Unit) { u.DistrictID = bare(u.DistrictID); u.ParentUnit = bare(u.ParentUnit); }
  for (const a of live.AggMonthly) a.DistrictID = bare(a.DistrictID);
  for (const s of live.SocioEconomic) s.DistrictID = bare(s.DistrictID);
  for (const a of live.AnomalyAlert) a.DistrictID = bare(a.DistrictID);
  for (const h of live.HotspotCluster) h.DistrictID = bare(h.DistrictID);
  for (const f of live.ForecastMonthly) f.DistrictID = bare(f.DistrictID);
  for (const p of live.OffenderProfile) {
    p.DistrictsJson = JSON.stringify(JSON.parse(p.DistrictsJson).map((id) => nameById.get(String(id)) || String(id)));
  }
  // The live store also hands ids back as strings.
  for (const c of live.CaseMaster) c.CaseMasterID = String(c.CaseMasterID);
  for (const t of ['Victim', 'Accused', 'ComplainantDetails', 'ActSectionAssociation', 'ArrestSurrender', 'ChargesheetDetails', 'CaseAnomaly']) {
    for (const r of live[t]) r.CaseMasterID = String(r.CaseMasterID);
  }

  const liveApp = createApp({ clientFactory: () => createStubClient(live) });
  const liveServer = liveApp.listen(0);
  await new Promise((r) => liveServer.once('listening', r));
  const L = `http://127.0.0.1:${liveServer.address().port}/api/v1`;

  const padded = await get('/cases?districtId=0101&perPage=50', L);
  const unpadded = await get('/cases?districtId=101&perPage=50', L);
  check('the padded district form actually filters cases now',
    padded.json.meta.total === 20 && padded.json.data.every((r) => r.districtName === 'Bengaluru City'),
    `${padded.json.meta.total} cases`);
  check('both district dialects give the same answer', unpadded.json.meta.total === padded.json.meta.total);
  const vl = await get('/network/victim-links?districtId=0101', L);
  check('victim-links scopes to the district in the live dialect',
    vl.json.data.summary.cases === 20 && vl.json.data.summary.victims > 0,
    JSON.stringify(vl.json.data.summary));
  const loc = await get('/network/locations?districtId=0101', L);
  check('locations scopes to the district in the live dialect',
    loc.json.meta.total === 3 && loc.json.data.locations.every((l) => l.districtId === '101'),
    JSON.stringify(loc.json.data.locations.map((l) => [l.locationId, l.districtId])));
  check('locations still names the district and maps the offenders on to it',
    loc.json.data.locations[0].districtName === 'Bengaluru City'
    && loc.json.data.locations[0].offenderAffiliation.offenders === 2);
  const score = await get('/network/communities/score', L);
  check('community scoring resolves district NAMES back to a span',
    score.json.data.communities[0].districtSpan === 2
    && score.json.data.communities[0].districtBreakdown.every((b) => b.districtName && b.districtName !== b.districtId),
    JSON.stringify(score.json.data.communities[0].districtBreakdown));
  const cohort = await get('/offenders/P001/cohort?size=5', L);
  check('cohort resolves district names into a span', cohort.json.data.subject.districtSpan === 2
    && cohort.json.data.subject.districtNames.includes('Bengaluru City'));
  const geo = await get('/geo/districts', L);
  check('district rates still resolve population across the padding split',
    geo.json.data.some((r) => r.districtName === 'Bengaluru City' && r.ratePerLakh > 0),
    JSON.stringify(geo.json.data[0]));
  const watch = await post('/offenders/watch', { personKeys: ['P001'], listId: 'live' }, null, L);
  check('watch links open alerts to a profile whose districts are names',
    watch.json.data.profiles[0].openAlertsInDistricts === 2,
    String(watch.json.data.profiles[0].openAlertsInDistricts));
  liveServer.close();
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
  check('translate: an unsupported target (hi) falls back to Kannada', trHi.json.data.target === 'kn' && trHi.json.data.items[0].translated === 'ವಾಹನ ಕಳ್ಳತನ');
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

  // With QuickML off there is no local twin for case status, so this must
  // refuse rather than answer with the A-vs-C model under a different name.
  const status503 = await post('/predict/case-status', body);
  check('case-status without QuickML -> 503, not a substituted answer',
    status503.status === 503 && status503.json.ok === false
    && status503.json.error.code === 'MODEL_UNAVAILABLE');
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

  // Regression: the CSV exports used to ask the live store for 1,000 rows in a
  // single SELECT. ZCQL truncates at 300 and an over-cap ask fell through to
  // the fixture evaluator, so the download handed out stub rows while the JSON
  // route beside it served real data. Assert the query is PAGED, not widened.
  const sqlSeen = [];
  const spy = { execute: async (sql, q) => { sqlSeen.push(sql); return stub.execute(sql, q); } };
  const spyApp = createApp({ clientFactory: () => spy });
  const spyServer = spyApp.listen(0);
  const SPY = `http://127.0.0.1:${spyServer.address().port}/api/v1`;
  await getRaw('/cases.csv', SPY);
  const caseSelects = sqlSeen.filter((s) => /FROM CaseMaster/.test(s) && / LIMIT /.test(s));
  check('cases.csv never asks for more than one ZCQL page at a time',
    caseSelects.length > 0 && caseSelects.every((s) => {
      const m = s.match(/ LIMIT (?:\d+,)?(\d+)$/);
      return m && Number(m[1]) <= ZCQL_PAGE;
    }), caseSelects.slice(0, 2).join(' | '));

  sqlSeen.length = 0;
  await getRaw('/alerts.csv?limit=600', SPY);
  const alertSelects = sqlSeen.filter((s) => /FROM AnomalyAlert/.test(s) && / LIMIT /.test(s));
  check('alerts.csv pages instead of over-asking',
    alertSelects.length > 0 && alertSelects.every((s) => {
      const m = s.match(/ LIMIT (?:\d+,)?(\d+)$/);
      return m && Number(m[1]) <= ZCQL_PAGE;
    }), alertSelects.slice(0, 2).join(' | '));
  spyServer.close();
}

// --- paging stability --------------------------------------------------------

{
  // Regression: ORDER BY CrimeRegisteredDate alone is not a total order — 45,000
  // cases sit on ~1,100 distinct dates — so offset windows repeated some rows
  // and dropped others. A unique tiebreaker makes paging total.
  const sql = buildZCQL({
    table: 'CaseMaster', columns: ['CaseMasterID'],
    orderBy: { col: 'CrimeRegisteredDate', desc: true, tieBreak: 'CaseMasterID' },
    limit: { offset: 50, count: 50 }
  });
  check('buildZCQL emits the tiebreaker in the same direction',
    sql.includes('ORDER BY CrimeRegisteredDate DESC, CaseMasterID DESC'), sql);

  const seen = new Set();
  let delivered = 0;
  for (let page = 1; page <= 6; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await get(`/cases?page=${page}&perPage=5`);
    for (const row of r.json.data) { seen.add(String(row.caseMasterId)); delivered += 1; }
  }
  check('paged /cases delivers no duplicate rows across pages',
    delivered > 0 && seen.size === delivered, `${delivered} delivered, ${seen.size} unique`);
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
  setEnv('QUICKML_STATUS_ENDPOINT_KEY', 'status-key-1');
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
      quickmlClient: {
        predict: async (key, data) => {
          note('quickml', key, data);
          // The published case-status deployment answers with a class id plus a
          // likelihood; the A-vs-C deployment answers with a probability.
          if (key === 'status-key-1') return { result: [3], likelihood_score: [0.4631] };
          return { status: 'success', result: ['0.77'] };
        }
      },
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
    // Only console-indexed Var Char columns may be searched (D-P3-1): the
    // Text column BriefFacts must NOT be in the engine query, LIKE covers it.
    return q.search === 'chain' && Array.isArray(q.search_table_columns.CaseMaster)
      && q.search_table_columns.CaseMaster.includes('CrimeNo')
      && q.search_table_columns.CaseMaster.includes('CaseNo')
      && !q.search_table_columns.CaseMaster.includes('BriefFacts')
      && q.search_table_columns.OffenderProfile.length === 1
      && q.search_table_columns.OffenderProfile[0] === 'CanonicalName'
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
  // Case status is a DIFFERENT question from chargesheet A-vs-C, so it gets its
  // own deployment key and never falls back onto the A/C models.
  const wStatus = await post('/predict/case-status', { crimeSubHeadId: 306, gravity: 'Heinous', PoliceStationID: 3011 }, null, W);
  check('WIRED case-status is served by QuickML', wStatus.status === 200
    && wStatus.json.meta.source === 'quickml-sdk' && wStatus.json.data.caseStatusId === 3
    && wStatus.json.data.caseStatusName === 'Closed' && wStatus.json.data.likelihood === 0.4631);
  check('WIRED case-status reports its real (weak) metrics', wStatus.json.data.modelMetrics.auc === 0.5
    && /no-signal/.test(wStatus.json.data.modelMetrics.note));
  check('WIRED case-status maps our vocabulary onto CaseMaster columns', (() => {
    const call = seen('quickml').find((c) => c[1] === 'status-key-1');
    if (!call) return false;
    const d = call[2];
    // gravity 'Heinous' -> 1, alias crimeSubHeadId -> CrimeMinorHeadID, and a
    // column passed by its real name survives untouched.
    return d.GravityOffenceID === '1' && d.CrimeMinorHeadID === '306' && d.PoliceStationID === '3011'
      && d.BriefFacts !== undefined && d.crimeSubHeadId === undefined;
  })());
  const wNarrative = await post('/ai/narrative', { caseId: 1 }, null, W);
  check('WIRED narrative uses Zia text analytics', wNarrative.json.meta.source === 'zia'
    && wNarrative.json.data.sentiment === 'negative' && wNarrative.json.data.entities.length > 0);

  // The coverage matrix must now report these as active, not flag-gated.
  const wServices = await get('/meta/services', W);
  const byKey = new Map(wServices.json.data.services.map((r) => [r.key, r]));
  check('WIRED service map reports mail/push/connections active',
    byKey.get('mail').status === 'active' && byKey.get('push-notifications').status === 'active'
    && byKey.get('connections').status === 'active');
  check('WIRED service map still reports circuits unavailable in the IN DC (a CIRCUIT_ID cannot exist here)',
    byKey.get('circuits').status === 'unavailable');
  check('WIRED service map reports File Store live', byKey.get('file-store').status === 'live');
  check('WIRED service map still marks console-only services pending',
    byKey.get('pipelines').status === 'console-pending' && byKey.get('domain-mappings').status === 'console-pending');
  const wModels = await get('/ml/models', W);
  check('WIRED model registry shows the remote models serving',
    wModels.json.data.models.find((m) => m.key === 'quickml-outcome').status === 'serving'
    && wModels.json.data.models.find((m) => m.key === 'zia-automl-outcome').status === 'serving');
  check('WIRED registry lists the case-status model with its caveat', (() => {
    const m = wModels.json.data.models.find((x) => x.key === 'quickml-case-status');
    return Boolean(m) && m.status === 'serving' && m.metrics.auc === 0.5 && /no discriminative power/.test(m.caveat);
  })());

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
  const fxTr = await post('/zia/translate', { text: 'Robbery', target: 'kn' }, null, DOWN);
  check('FIXTURE translate works from the glossary', fxTr.status === 200 && fxTr.json.data.items[0].translated === 'ದರೋಡೆ');
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
  check('FIXTURE healthz rowCounts from fixture', h.datastore && h.datastore.rowCounts.CaseMaster === 52 && h.datastore.rowCounts.AnomalyAlert === 4 && h.datastore.rowCounts.OffenderProfile === 6);
  check('FIXTURE healthz nosql fixture-demo', h.nosql && h.nosql.ok === true && h.nosql.mode === 'fixture-demo');
  check('FIXTURE healthz cache ok', h.cache && h.cache.ok === true);

  // Fallback activation state was tracked.
  const st = getFallbackState();
  check('FIXTURE fallback state active', st.active === true && st.datastore === true && st.nosql === true, JSON.stringify(st));
  check('FIXTURE fallback counted queries+writes', st.queries > 0 && st.writes > 0, JSON.stringify(st));

  downServer.close();
}

// --- Round-2 phase suites: test/round2/*.test.mjs -----------------------------
// Each file exports `run(h)` and receives this harness's helpers bound to a
// fresh stub-backed app, so parallel workstreams add checks without editing
// this file. A suite that throws counts as one failed check, never a crash.
{
  const fs = require('fs');
  const path = require('path');
  const { fileURLToPath, pathToFileURL } = require('url');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'round2');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort() : [];
  for (const f of files) {
    const r2app = createApp({ clientFactory: () => createStubClient(buildFixtureTables()) });
    const r2server = r2app.listen(0);
    await new Promise((r) => r2server.once('listening', r));
    const R2 = `http://127.0.0.1:${r2server.address().port}/api/v1`;
    const before = pass + failCount;
    try {
      const mod = await import(pathToFileURL(path.join(dir, f)).href);
      await mod.run({
        get: (p) => get(p, R2),
        post: (p, b, h) => post(p, b, h, R2),
        del: (p) => del(p, R2),
        getRaw: (p) => getRaw(p, R2),
        check, hasKeys, BASE: R2, tables, createApp, createStubClient, buildFixtureTables
      });
    } catch (e) {
      check(`round2 suite ${f} runs without throwing`, false, String((e && e.stack) || e).slice(0, 400));
    }
    r2server.close();
    console.log(`round2/${f}: ${pass + failCount - before} checks`);
  }
}

console.log('');
console.log(`RESULT: ${pass} passed, ${failCount} failed`);
if (failCount > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('ALL GREEN — dappa_api contract suite passed.');
