// Round-2 Phase 4 — officer-tier aggregates (lib/routes/tiers.js).
// Pins the three /tiers/* contracts the Beat / Station / State homes code
// against: envelope + provenance block, the unit filter, the statusWord rule,
// the 38-unit × head matrix arithmetic, and the "empty unit answers 200 with
// empty arrays" promise (a station with no rows must never white-screen a
// phone). Pure helpers (statusFromZ, swings, bandOfHour) are pinned directly.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const tiers = require('../../lib/routes/tiers.js');
const { statusFromZ, swings, bandOfHour } = tiers;

const STATUS_WORDS = new Set(['rising', 'watch', 'stable', 'falling', 'nodata']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function provenanceOk(p) {
  return p && ISO_DAY.test(String(p.asOn)) && typeof p.window === 'string' && typeof p.method === 'string'
    && p.provisional === true && Array.isArray(p.tables) && p.tables.length > 0;
}

export async function run(h) {
  const { get, check, hasKeys } = h;

  // --- pure helpers ---------------------------------------------------------
  check('statusFromZ: z ≥ 3 → rising', statusFromZ(3) === 'rising' && statusFromZ(4.2) === 'rising');
  check('statusFromZ: 2 ≤ z < 3 → watch', statusFromZ(2) === 'watch' && statusFromZ(2.99) === 'watch');
  check('statusFromZ: |z| < 2 → stable', statusFromZ(0) === 'stable' && statusFromZ(-1.99) === 'stable' && statusFromZ(1.99) === 'stable');
  check('statusFromZ: z ≤ −2 → falling', statusFromZ(-2) === 'falling' && statusFromZ(-3.5) === 'falling');
  check('statusFromZ: null / NaN → nodata', statusFromZ(null) === 'nodata' && statusFromZ(undefined) === 'nodata' && statusFromZ(NaN) === 'nodata');
  check('swings: Poisson floor stops a tiny baseline exploding', swings(5, 1, 0) === 4 && swings(30, 25, 0) === 1, JSON.stringify([swings(5, 1, 0), swings(30, 25, 0)]));
  check('swings: uses the larger of spread and floor', swings(40, 25, 10) === 1.5 && swings(10, null, 3) === null);
  check('bandOfHour: night wraps midnight', bandOfHour(23).key === 'night' && bandOfHour(2).key === 'night' && bandOfHour(5).key === 'morning');
  check('bandOfHour: afternoon / evening / null', bandOfHour(13).key === 'afternoon' && bandOfHour(19).key === 'evening' && bandOfHour(null) === null);

  // Caste / religion never enter a tier aggregate (organiser rule).
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/routes/tiers.js'), 'utf8');
  check('tiers.js never selects caste or religion columns', !/CasteID|ReligionID|'Caste'|'Religion'/.test(src));

  // --- GET /tiers/beat --------------------------------------------------------
  const beat = await get('/tiers/beat');
  check('GET /tiers/beat -> 200 envelope', beat.status === 200 && beat.json && beat.json.ok === true, JSON.stringify(beat.json).slice(0, 200));
  const b = (beat.json && beat.json.data) || {};
  check('beat data keys', hasKeys(b, ['unit', 'asOf', 'anchorYm', 'recent', 'risk', 'hotspots', 'openCases', 'alerts', 'provenance']), Object.keys(b).join(','));
  check('beat unit block', hasKeys(b.unit || {}, ['unitId', 'unitName', 'districtId', 'districtName', 'lat', 'lng']));
  check('beat defaults to the highest-risk scored unit and says so', beat.json.meta && beat.json.meta.defaulted === true && beat.json.meta.unitId === b.unit.unitId);
  check('beat provenance on data AND meta', provenanceOk(b.provenance) && provenanceOk(beat.json.meta.provenance) && b.provenance.asOn === b.asOf);
  check('beat recent window is 7 days ending asOf', b.recent && b.recent.to === b.asOf && ISO_DAY.test(b.recent.from)
    && Math.round((Date.parse(b.recent.to) - Date.parse(b.recent.from)) / 86400000) === 6);
  check('beat recent keys', hasKeys(b.recent || {}, ['count', 'usualPerWeek', 'swings', 'statusWord', 'byHead', 'cases']) && Array.isArray(b.recent.byHead) && Array.isArray(b.recent.cases));
  check('beat recent statusWord obeys statusFromZ', b.recent && STATUS_WORDS.has(b.recent.statusWord) && b.recent.statusWord === statusFromZ(b.recent.swings));
  check('beat recent count equals the listed cases (fixture ≤ 25)', b.recent && b.recent.count === b.recent.cases.length && b.recent.byHead.reduce((s, r) => s + r.count, 0) === b.recent.count);
  check('beat case rows carry head, band and coordinates', (b.recent.cases || []).every((c) => hasKeys(c, ['caseMasterId', 'crimeNo', 'registeredDate', 'headName', 'subHeadName', 'hour', 'band', 'lat', 'lng'])));
  check('beat risk block with percentile → word → statusWord', b.risk && hasKeys(b.risk, ['riskScore', 'percentile', 'rank', 'of', 'word', 'statusWord', 'drivers', 'computedAt'])
    && ['high', 'elevated', 'normal', 'nodata'].includes(b.risk.word) && STATUS_WORDS.has(b.risk.statusWord) && Array.isArray(b.risk.drivers));
  check('beat risk percentile is 0–100 and rank ≤ of', b.risk && b.risk.percentile >= 0 && b.risk.percentile <= 100 && b.risk.rank >= 1 && b.risk.rank <= b.risk.of);
  check('beat hotspots sorted nearest first with distance and band', Array.isArray(b.hotspots) && b.hotspots.length > 0
    && b.hotspots.every((x) => hasKeys(x, ['clusterId', 'headName', 'subHeadName', 'centroidLat', 'centroidLng', 'radiusM', 'caseCount', 'hourBandStart', 'hourBandEnd', 'distanceKm', 'thisWeekInside']))
    && b.hotspots.every((x, i, arr) => i === 0 || (arr[i - 1].distanceKm ?? 1e9) <= (x.distanceKm ?? 1e9)));
  check('beat hotspots are the unit\'s own district', b.hotspots.every((x) => x.clusterId !== 'HS-03'));
  check('beat openCases block', hasKeys(b.openCases || {}, ['total', 'over30', 'over60', 'medianDays', 'scope', 'rows']) && b.openCases.scope === 'unit' && Array.isArray(b.openCases.rows));
  check('beat alerts carry ageHours + statusWord from z', Array.isArray(b.alerts) && b.alerts.length > 0
    && b.alerts.every((a) => hasKeys(a, ['alertId', 'scope', 'headName', 'zScore', 'ageHours', 'statusWord']) && a.statusWord === statusFromZ(a.zScore)));
  check('beat alerts are OPEN and in-district only', b.alerts.every((a) => a.status === 'OPEN' && a.districtId === b.unit.districtId));

  const beatUnit = await get('/tiers/beat?unitId=1031');
  const bu = (beatUnit.json && beatUnit.json.data) || {};
  check('beat ?unitId= filters to that station', beatUnit.status === 200 && bu.unit && bu.unit.unitId === '1031' && bu.unit.districtId === '0103' && beatUnit.json.meta.defaulted === false);
  check('beat unit filter scopes alerts (AL-001 is Mysuru City PS-1)', Array.isArray(bu.alerts) && bu.alerts.some((a) => a.alertId === 'AL-001') && bu.alerts.every((a) => a.districtId === '0103'));
  check('beat unit filter scopes hotspots (Devaraja cluster)', Array.isArray(bu.hotspots) && bu.hotspots.length === 1 && bu.hotspots[0].clusterId === 'HS-03');

  const beatOfficer = await get('/tiers/beat?unitId=1011&employeeId=9001');
  check('beat ?employeeId= narrows openCases to the officer', beatOfficer.status === 200 && beatOfficer.json.data.openCases.scope === 'officer');

  const beatMissing = await get('/tiers/beat?unitId=nope');
  check('beat unknown unit -> 404 NOT_FOUND', beatMissing.status === 404 && beatMissing.json && beatMissing.json.ok === false && beatMissing.json.error.code === 'NOT_FOUND');

  const beatAgain = await get('/tiers/beat');
  check('beat second read is served from cache', beatAgain.status === 200 && beatAgain.json.meta.cached === true && beatAgain.json.meta.ttlSec === 300);

  // --- GET /tiers/station -----------------------------------------------------
  const station = await get('/tiers/station');
  check('GET /tiers/station -> 200 envelope', station.status === 200 && station.json && station.json.ok === true);
  const s = (station.json && station.json.data) || {};
  check('station data keys', hasKeys(s, ['unit', 'asOf', 'anchorYm', 'week', 'weekByHead', 'alerts', 'series', 'spark8w', 'undetected30', 'caseload', 'provenance']), Object.keys(s).join(','));
  check('station provenance (8-week window)', provenanceOk(s.provenance) && /8 weeks/.test(s.provenance.window) && station.json.meta.provenance.asOn === s.asOf);
  check('station week block obeys statusFromZ', hasKeys(s.week || {}, ['from', 'to', 'total', 'usualPerWeek', 'swings', 'statusWord']) && s.week.statusWord === statusFromZ(s.week.swings) && s.week.to === s.asOf);
  check('station weekByHead covers every crime head with 8 weekly buckets', Array.isArray(s.weekByHead) && s.weekByHead.length === h.tables.CrimeHead.length
    && s.weekByHead.every((r) => hasKeys(r, ['crimeHeadId', 'headName', 'thisWeek', 'usualPerWeek', 'swings', 'statusWord', 'weeks', 'month']) && r.weeks.length === 8 && r.weeks[7] === r.thisWeek));
  check('station weekByHead statusWord rule + Crime Review triad', s.weekByHead.every((r) => r.statusWord === statusFromZ(r.swings) && hasKeys(r.month, ['cur', 'prev', 'yoy', 'momPct', 'yoyPct'])));
  check('station weekByHead sorted by swings desc', s.weekByHead.every((r, i, arr) => i === 0 || ((arr[i - 1].swings ?? -99) >= (r.swings ?? -99))));
  check('station week total equals the sum over heads', s.weekByHead.reduce((n, r) => n + r.thisWeek, 0) === s.week.total);
  check('station spark8w: 8 labelled weeks, unit and district median', s.spark8w && s.spark8w.weeks.length === 8 && s.spark8w.unit.length === 8 && s.spark8w.districtMedian.length === 8
    && s.spark8w.weeks.every((w) => ISO_DAY.test(w.from) && ISO_DAY.test(w.to)) && s.spark8w.weeks[7].to === s.asOf && typeof s.spark8w.unitsCompared === 'number');
  check('station spark8w week 8 equals the week total', s.spark8w.unit[7] === s.week.total);
  check('station series is an array of ≥3-case runs', Array.isArray(s.series) && s.series.every((x) => x.count >= 3 && x.spanDays >= 1 && x.spanDays <= 14 && Array.isArray(x.caseIds)));
  check('station undetected30 block names the property head', hasKeys(s.undetected30 || {}, ['count', 'headName', 'rows']) && Array.isArray(s.undetected30.rows) && s.undetected30.count >= s.undetected30.rows.length);
  check('station caseload rows carry pendency + statusWord', Array.isArray(s.caseload) && s.caseload.every((r) => hasKeys(r, ['employeeId', 'name', 'rank', 'open', 'medianDays', 'over30', 'over60', 'statusWord']) && STATUS_WORDS.has(r.statusWord)));
  check('station alerts share the beat shape', Array.isArray(s.alerts) && s.alerts.every((a) => hasKeys(a, ['alertId', 'scope', 'zScore', 'ageHours', 'statusWord']) && a.statusWord === statusFromZ(a.zScore)));

  const stationUnit = await get('/tiers/station?unitId=1031');
  const su = (stationUnit.json && stationUnit.json.data) || {};
  check('station ?unitId= filters and scopes alerts', stationUnit.status === 200 && su.unit && su.unit.unitId === '1031' && su.alerts.some((a) => a.alertId === 'AL-001') && stationUnit.json.meta.defaulted === false);
  const stationMissing = await get('/tiers/station?unitId=nope');
  check('station unknown unit -> 404', stationMissing.status === 404 && stationMissing.json.error.code === 'NOT_FOUND');

  // --- GET /tiers/state -------------------------------------------------------
  const state = await get('/tiers/state');
  check('GET /tiers/state -> 200 envelope', state.status === 200 && state.json && state.json.ok === true);
  const st = (state.json && state.json.data) || {};
  check('state data keys', hasKeys(st, ['anchorYm', 'prevYm', 'yoyYm', 'asOn', 'totals', 'heads', 'units', 'matrix', 'rareHeads', 'alertsOpen', 'unitsWithOpenAlerts', 'provenance']), Object.keys(st).join(','));
  check('state AS ON stamp is the first day after the anchor month', ISO_DAY.test(st.asOn) && st.asOn.endsWith('-01') && st.asOn > `${st.anchorYm}-28` && st.provenance.asOn === st.asOn);
  check('state triad months', /^\d{4}-\d{2}$/.test(st.anchorYm) && st.prevYm < st.anchorYm && st.yoyYm.slice(5) === st.anchorYm.slice(5) && Number(st.yoyYm.slice(0, 4)) === Number(st.anchorYm.slice(0, 4)) - 1);
  check('state units = every district master row', Array.isArray(st.units) && st.units.length === h.tables.District.length
    && st.units.every((u) => hasKeys(u, ['districtId', 'districtName', 'cur', 'prev', 'momPct', 'total12', 'ratePerLakh', 'swings', 'statusWord', 'openAlerts', 'cells']) && STATUS_WORDS.has(u.statusWord) && u.statusWord === statusFromZ(u.swings)));
  check('state matrix is units × heads with honest row totals', st.matrix && st.matrix.heads.length === st.heads.length && st.matrix.rows.length === st.units.length
    && st.matrix.rows.every((r) => r.cells.length === st.matrix.heads.length && r.total === r.cells.reduce((a, n) => a + n, 0)));
  check('state totals add up across heads and across the matrix', st.totals.cur === st.heads.reduce((a, x) => a + x.cur, 0)
    && st.totals.cur === st.matrix.rows.reduce((a, r) => a + r.total, 0) && st.totals.prev === st.heads.reduce((a, x) => a + x.prev, 0));
  check('state head review carries the Crime Review direction words', st.heads.every((x) => hasKeys(x, ['crimeHeadId', 'headName', 'cur', 'prev', 'yoy', 'momPct', 'yoyPct', 'vsPrev', 'vsYoy']) && ['up', 'down', 'same'].includes(x.vsPrev) && ['up', 'down', 'same'].includes(x.vsYoy)));
  check('state rare heads carry a unit-wise breakup', Array.isArray(st.rareHeads) && st.rareHeads.length > 0
    && st.rareHeads.every((r) => hasKeys(r, ['crimeSubHeadId', 'subHeadName', 'headName', 'total', 'units']) && r.total === r.units.reduce((a, u) => a + u.count, 0)));
  check('state open-alert rollup matches the fixture (3 OPEN across 3 districts)', st.alertsOpen === 3 && st.unitsWithOpenAlerts === 3);
  check('state units with no rows read nodata, never a fake stable', st.units.filter((u) => u.total12 === 0).every((u) => u.statusWord === 'nodata' && u.swings === null));

  // --- an existing unit with no rows answers 200 with empty arrays ---------
  {
    const tables = h.buildFixtureTables();
    tables.Unit.push({ UnitID: '1099', UnitName: 'Bengaluru City PS-Empty', TypeID: 4, ParentUnit: '0101', DistrictID: '0101' });
    const app = h.createApp({ clientFactory: () => h.createStubClient(tables) });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const eb = await (await fetch(`${base}/tiers/beat?unitId=1099`)).json();
    const es = await (await fetch(`${base}/tiers/station?unitId=1099`)).json();
    server.close();
    check('empty unit: beat -> 200 with empty arrays and nodata words', eb.ok === true && eb.data.unit.unitId === '1099' && eb.data.recent.count === 0 && eb.data.recent.cases.length === 0
      && eb.data.recent.statusWord === 'nodata' && eb.data.risk === null && eb.data.openCases.rows.length === 0 && eb.data.openCases.medianDays === null, JSON.stringify(eb).slice(0, 300));
    check('empty unit: beat still lists the district hotspots and alerts', Array.isArray(eb.data.hotspots) && Array.isArray(eb.data.alerts));
    check('empty unit: station -> 200 with zero week and empty lists', es.ok === true && es.data.week.total === 0 && es.data.week.statusWord === 'nodata' && es.data.series.length === 0
      && es.data.caseload.length === 0 && es.data.undetected30.count === 0 && es.data.spark8w.unit.every((n) => n === 0), JSON.stringify(es).slice(0, 300));
    check('empty unit: station weekByHead all nodata', es.data.weekByHead.every((r) => r.statusWord === 'nodata' && r.thisWeek === 0));
  }
}
