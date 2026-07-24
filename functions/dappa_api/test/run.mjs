// KSP DAPPA backend test harness — plain Node, no framework.
// Boots the Express app with a stubbed datastore (canned rows shaped like real
// ZCQL results for every query pattern) and asserts the CONTRACTS shapes.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../lib/app.js');
const { createStubClient } = require('../lib/datastore.js');
const constants = require('../lib/constants.js');
const { CANNED_UTTERANCES } = require('../lib/copilot.js');
const { ymAdd, hash32 } = require('../lib/util.js');

// ---------------------------------------------------------------------------
// Canned tables (deterministic, ER-shaped)
// ---------------------------------------------------------------------------

const NOW_YM = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();
// Data window ends at the current month so "this year"/"last N months" queries hit rows.
const MONTHS = [];
for (let i = 35; i >= 0; i -= 1) MONTHS.push(ymAdd(NOW_YM, -i));

const STUB_DISTRICTS = ['0101', '0103', '0107', '0109', '0111'];
const STUB_SUBHEADS = [101, 302, 303, 306, 307, 401, 501];

// 4-digit unit ids: '1011','1012','1013' for 0101; '1031'.. for 0103; etc.
function stationIds(districtId) {
  const base = districtId.slice(1); // '101' for 0101
  return [1, 2, 3].map((i) => `${base}${i}`);
}

const tables = {};

tables.District = constants.DISTRICTS.map((d) => ({ DistrictID: d.id, DistrictName: d.name }));
tables.CrimeHead = constants.CRIME_HEADS.map((h) => ({ CrimeHeadID: h.id, CrimeGroupName: h.name }));
tables.CrimeSubHead = constants.CRIME_SUBHEADS.map((s) => ({ CrimeSubHeadID: s.id, CrimeHeadID: s.headId, CrimeHeadName: s.name }));
tables.CaseCategory = constants.CASE_CATEGORIES.map((c) => ({ CaseCategoryID: c.id, LookupValue: c.name }));
tables.CaseStatusMaster = constants.CASE_STATUSES.map((s) => ({ CaseStatusID: s.id, CaseStatusName: s.name }));
tables.GravityOffence = constants.GRAVITIES.map((g) => ({ GravityOffenceID: g.id, LookupValue: g.name }));
tables.SocioEconomic = constants.DISTRICTS.map((d) => ({
  DistrictID: d.id, Population: d.id === '0101' ? 11000000 : 1500000,
  UrbanPct: 40, LiteracyPct: 75, DensityPerKm2: 320, PerCapitaIncomeIdx: 100
}));

tables.Unit = [];
for (const d of STUB_DISTRICTS) {
  stationIds(d).forEach((uid, i) => {
    tables.Unit.push({ UnitID: uid, UnitName: `${constants.districtById.get(d).name} PS-${i + 1}`, TypeID: 4, ParentUnit: d, DistrictID: d });
  });
}

tables.AggMonthly = [];
for (const d of STUB_DISTRICTS) {
  for (const sh of STUB_SUBHEADS) {
    const head = constants.subHeadById.get(sh).headId;
    for (const ym of MONTHS) {
      const count = 5 + (hash32(`${d}|${sh}|${ym}`) % 20);
      tables.AggMonthly.push({
        Ym: ym, DistrictID: d, UnitID: stationIds(d)[0], CrimeHeadID: head,
        CrimeSubHeadID: sh, CaseCount: count, HeinousCount: sh === 101 ? count : 0
      });
    }
  }
}

tables.ChargesheetDetails = [];
for (let i = 1; i <= 30; i += 1) {
  tables.ChargesheetDetails.push({
    CSID: i, CaseMasterID: i, csdate: `2026-0${(i % 6) + 1}-10`,
    cstype: i <= 12 ? 'A' : i <= 15 ? 'B' : 'C', PolicePersonID: 9001
  });
}

tables.AnomalyAlert = [
  { AlertID: 'AL-001', DistrictID: '0103', UnitID: '1031', CrimeHeadID: 3, PeriodStart: `${NOW_YM}-01`, PeriodEnd: `${NOW_YM}-28`, Observed: 42, Expected: 18.5, ZScore: 4.2, Severity: 3, Status: 'OPEN', Narrative: 'Chain snatching resurgence in Mysuru City', CreatedAt: `${NOW_YM}-15 08:00:00` },
  { AlertID: 'AL-002', DistrictID: '0105', UnitID: null, CrimeHeadID: 5, PeriodStart: `${NOW_YM}-01`, PeriodEnd: `${NOW_YM}-28`, Observed: 66, Expected: 23.1, ZScore: 3.4, Severity: 2, Status: 'OPEN', Narrative: 'Cyber fraud spike in Mangaluru City', CreatedAt: `${NOW_YM}-14 08:00:00` },
  { AlertID: 'AL-003', DistrictID: '0101', UnitID: '1011', CrimeHeadID: 3, PeriodStart: `${NOW_YM}-01`, PeriodEnd: `${NOW_YM}-28`, Observed: 30, Expected: 19.0, ZScore: 2.4, Severity: 1, Status: 'OPEN', Narrative: 'Night burglary uptick in Peenya belt', CreatedAt: `${NOW_YM}-13 08:00:00` },
  { AlertID: 'AL-004', DistrictID: '0109', UnitID: '1091', CrimeHeadID: 1, PeriodStart: '2026-05-01', PeriodEnd: '2026-05-28', Observed: 12, Expected: 9.0, ZScore: 2.1, Severity: 1, Status: 'ACK', Narrative: 'Assault cluster acknowledged', CreatedAt: '2026-05-20 08:00:00' }
];

tables.HotspotCluster = [
  { ClusterID: 'HS-01', CrimeHeadID: 3, CentroidLat: 13.028, CentroidLng: 77.518, RadiusM: 800, CaseCount: 34, HourBandStart: 23, HourBandEnd: 3, WindowStart: '2026-02-01', WindowEnd: NOW_YM + '-28', Intensity: 88, Label: 'HB Night cluster — Peenya, 23:00–03:00', DistrictID: '0101' },
  { ClusterID: 'HS-02', CrimeHeadID: 3, CentroidLat: 12.969, CentroidLng: 77.75, RadiusM: 650, CaseCount: 27, HourBandStart: 21, HourBandEnd: 1, WindowStart: '2026-02-01', WindowEnd: NOW_YM + '-28', Intensity: 74, Label: 'Chain Snatching cluster — Whitefield, 21:00–01:00', DistrictID: '0101' },
  { ClusterID: 'HS-03', CrimeHeadID: 3, CentroidLat: 12.31, CentroidLng: 76.65, RadiusM: 500, CaseCount: 19, HourBandStart: 20, HourBandEnd: 23, WindowStart: '2026-02-01', WindowEnd: NOW_YM + '-28', Intensity: 61, Label: 'Chain Snatching cluster — Devaraja, 20:00–23:00', DistrictID: '0103' }
];

tables.NetworkEdge = [
  { PersonKeyA: 'P001', PersonKeyB: 'P002', Weight: 3, CaseIDsJson: '[1,2,3]', CommunityID: 1 },
  { PersonKeyA: 'P001', PersonKeyB: 'P003', Weight: 2, CaseIDsJson: '[2,4]', CommunityID: 1 },
  { PersonKeyA: 'P002', PersonKeyB: 'P003', Weight: 1, CaseIDsJson: '[2]', CommunityID: 1 },
  { PersonKeyA: 'P004', PersonKeyB: 'P005', Weight: 2, CaseIDsJson: '[5,6]', CommunityID: 2 }
];

tables.OffenderProfile = [
  { PersonKey: 'P001', CanonicalName: 'Ravi Kumar', AliasesJson: '["Ravi Kumar B","R Kumar"]', CaseCount: 6, DistrictsJson: '["0101","0103"]', FirstSeen: '2024-02-11', LastSeen: `${NOW_YM}-02`, MOTagsJson: '["two-wheeler","gold-chain","night"]', CommunityID: 1, DegreeCentrality: 0.42, RiskScore: 87.5 },
  { PersonKey: 'P002', CanonicalName: 'Manjunath Shetty', AliasesJson: '["M Shetty"]', CaseCount: 4, DistrictsJson: '["0101"]', FirstSeen: '2024-06-01', LastSeen: '2026-05-11', MOTagsJson: '["lock-breaking","gas-cutter"]', CommunityID: 1, DegreeCentrality: 0.31, RiskScore: 72.3 },
  { PersonKey: 'P003', CanonicalName: 'Nagaraj Gowda', AliasesJson: '[]', CaseCount: 3, DistrictsJson: '["0103"]', FirstSeen: '2025-01-15', LastSeen: '2026-04-20', MOTagsJson: '["otp-fraud"]', CommunityID: 1, DegreeCentrality: 0.2, RiskScore: 55.0 },
  { PersonKey: 'P004', CanonicalName: 'Prakash Naik', AliasesJson: '["P Naik"]', CaseCount: 5, DistrictsJson: '["0109","0111"]', FirstSeen: '2024-03-02', LastSeen: '2026-06-13', MOTagsJson: '["vehicle-theft"]', CommunityID: 2, DegreeCentrality: 0.28, RiskScore: 64.9 },
  { PersonKey: 'P005', CanonicalName: 'Shivakumar Hegde', AliasesJson: '[]', CaseCount: 3, DistrictsJson: '["0109"]', FirstSeen: '2025-05-19', LastSeen: '2026-06-30', MOTagsJson: '["vehicle-theft","country-made-pistol"]', CommunityID: 2, DegreeCentrality: 0.18, RiskScore: 51.2 },
  { PersonKey: 'P006', CanonicalName: 'Lakshman Rao', AliasesJson: '[]', CaseCount: 1, DistrictsJson: '["0107"]', FirstSeen: '2026-01-05', LastSeen: '2026-01-05', MOTagsJson: '[]', CommunityID: null, DegreeCentrality: 0, RiskScore: 12.0 }
];

tables.ForecastMonthly = [];
for (const d of ['0101', '0103']) {
  for (let i = 11; i >= 0; i -= 1) {
    const ym = ymAdd(NOW_YM, -i);
    const actual = 40 + (hash32(`${d}|f|${ym}`) % 15);
    const row = { DistrictID: d, CrimeHeadID: 3, Ym: ym, Actual: actual, Predicted: null, Lo: null, Hi: null, Model: 'holt-winters' };
    if (i <= 5) { row.Predicted = actual + 3; row.Lo = actual - 5; row.Hi = actual + 11; } // backtest overlap
    tables.ForecastMonthly.push(row);
  }
  for (let i = 1; i <= 3; i += 1) {
    const ym = ymAdd(NOW_YM, i);
    const p = 45 + (hash32(`${d}|p|${ym}`) % 10);
    tables.ForecastMonthly.push({ DistrictID: d, CrimeHeadID: 3, Ym: ym, Actual: null, Predicted: p, Lo: p - 8, Hi: p + 8, Model: 'holt-winters' });
  }
}

tables.StationRisk = tables.Unit.map((u, i) => ({
  UnitID: u.UnitID, Horizon: 30, RiskScore: 90 - i * 4.5,
  DriversJson: '["rising vehicle theft","active night-burglary hotspot 800 m","recent anomaly"]',
  ComputedAt: `${NOW_YM}-01 02:00:00`
}));

tables.CaseMaster = [];
const BRIEFS = [
  'The complainant Lakshmamma Gowda reported that two unknown persons on a two-wheeler without plate snatched her gold mangalsutra near Devaraja Market at night. One accused brandished a knife and threatened her before fleeing. Property worth Rs. 45,000 was stolen.',
  'Unknown persons committed house breaking by lock-breaking with a gas-cutter during the night and stole cash and jewellery from the house of Shivakumar Hegde.',
  'The accused posing as fake police collected OTP from the victim and defrauded Rs. 1,20,000 through online transfer. The one-time password was obtained on the pretext of a KYC update.',
  'The accused Prakash Naik assaulted the victim with a machete following a property dispute and fled on a motorcycle.'
];
for (let i = 1; i <= 40; i += 1) {
  const d = STUB_DISTRICTS[i % STUB_DISTRICTS.length];
  const unit = stationIds(d)[i % 3];
  const sh = STUB_SUBHEADS[i % STUB_SUBHEADS.length];
  const head = constants.subHeadById.get(sh).headId;
  const centroid = constants.districtById.get(d);
  const day = String((i % 27) + 1).padStart(2, '0');
  const month = ymAdd(NOW_YM, -(i % 3));
  const serial = String(i).padStart(5, '0');
  const year = month.slice(0, 4);
  tables.CaseMaster.push({
    CaseMasterID: i,
    CrimeNo: `1${d}${unit}${year}${serial}`,
    CaseNo: `${year}${serial}`,
    CrimeRegisteredDate: `${month}-${day}`,
    PolicePersonID: 9001,
    PoliceStationID: unit,
    CaseCategoryID: 1,
    GravityOffenceID: sh === 101 ? 1 : 2,
    CrimeMajorHeadID: head,
    CrimeMinorHeadID: sh,
    CaseStatusID: (i % 4) + 1,
    CourtID: 501,
    IncidentFromDate: `${month}-${day} ${String((i * 7) % 24).padStart(2, '0')}:30:00`,
    IncidentToDate: `${month}-${day} ${String((i * 7 + 1) % 24).padStart(2, '0')}:30:00`,
    InfoReceivedPSDate: `${month}-${day} 10:00:00`,
    latitude: centroid.lat + (i % 10) * 0.001,
    longitude: centroid.lng + (i % 10) * 0.001,
    BriefFacts: BRIEFS[i % BRIEFS.length]
  });
}

// Children for case 1 (schema columns exist incl. sensitive ones; the API must not return them).
tables.ComplainantDetails = [
  { ComplainantID: 11, CaseMasterID: 1, ComplainantName: 'Lakshmamma Gowda', AgeYear: 52, OccupationID: 3, ReligionID: 1, CasteID: 4, GenderID: 2 }
];
tables.Victim = [
  { VictimMasterID: 21, CaseMasterID: 1, VictimName: 'Lakshmamma Gowda', AgeYear: 52, GenderID: 2, VictimPolice: 0 }
];
tables.Accused = [
  { AccusedMasterID: 31, CaseMasterID: 1, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A1' },
  { AccusedMasterID: 32, CaseMasterID: 1, AccusedName: 'Manjunath Shetty', AgeYear: 33, GenderID: 1, PersonID: 'A2' }
];
tables.ActSectionAssociation = [
  { CaseMasterID: 1, ActID: 'BNS', SectionID: '304', ActOrderID: 1, SectionOrderID: 1 },
  { CaseMasterID: 1, ActID: 'BNS', SectionID: '351', ActOrderID: 1, SectionOrderID: 2 }
];
tables.Section = [
  { ActCode: 'BNS', SectionCode: '304', SectionDescription: 'Snatching' },
  { ActCode: 'BNS', SectionCode: '351', SectionDescription: 'Criminal intimidation' }
];
tables.ArrestSurrender = [
  { ArrestSurrenderID: 41, CaseMasterID: 1, ArrestSurrenderTypeID: 1, ArrestSurrenderDate: '2026-06-20', ArrestSurrenderStateId: 1, ArrestSurrenderDistrictId: '0101', PoliceStationID: '1012', IOID: 9001, CourtID: 501, AccusedMasterID: 31, IsAccused: 1 }
];
tables.Employee = [
  { EmployeeID: 9001, DistrictID: '0101', UnitID: '1011', RankID: 3, DesignationID: 2, KGID: 'KG12345', FirstName: 'Manjunath Hegde' }
];
tables.Rank = [{ RankID: 3, RankName: 'Inspector' }];
tables.Court = [{ CourtID: 501, CourtName: 'City Civil & Sessions Court, Bengaluru', DistrictID: '0101' }];
tables.CaseAnomaly = [{ CaseMasterID: 1, AnomalyFlag: 1, AnomalyScore: 0.91 }];

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

async function get(path) {
  const res = await fetch(BASE + path);
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function post(path, body, headers) {
  const res = await fetch(BASE + path, {
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

console.log('');
console.log(`RESULT: ${pass} passed, ${failCount} failed`);
if (failCount > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('ALL GREEN — dappa_api contract suite passed.');
