'use strict';
// Deterministic bundled fixture dataset (ER-shaped, window ending at the
// current month). Two consumers share it so they can never drift apart:
//   1. test/run.mjs — canned tables for the contract suite.
//   2. PUBLIC_DEMO self-healing — when a real ZCQL/NoSQL call fails live
//      (e.g. Data Store tables not yet created in the console), the same
//      structured query is answered from these tables via createStubClient,
//      so the demo always works end to end.

const constants = require('./constants');
const { ymOf, ymAdd, hash32 } = require('./util');
const { createStubClient, createDatastore } = require('./datastore');
const network = require('./network');

const STUB_DISTRICTS = ['0101', '0103', '0107', '0109', '0111'];
const STUB_SUBHEADS = [101, 302, 303, 306, 307, 401, 501];

// 4-digit unit ids: '1011','1012','1013' for 0101; '1031'.. for 0103; etc.
function stationIds(districtId) {
  const base = districtId.slice(1); // '101' for 0101
  return [1, 2, 3].map((i) => `${base}${i}`);
}

const BRIEFS = [
  'The complainant Lakshmamma Gowda reported that two unknown persons on a two-wheeler without plate snatched her gold mangalsutra near Devaraja Market at night. One accused brandished a knife and threatened her before fleeing. Property worth Rs. 45,000 was stolen.',
  'Unknown persons committed house breaking by lock-breaking with a gas-cutter during the night and stole cash and jewellery from the house of Shivakumar Hegde.',
  'The accused posing as fake police collected OTP from the victim and defrauded Rs. 1,20,000 through online transfer. The one-time password was obtained on the pretext of a KYC update.',
  'The accused Prakash Naik assaulted the victim with a machete following a property dispute and fled on a motorcycle.'
];

function buildFixtureTables() {
  const NOW_YM = ymOf();
  // Data window ends at the current month so "this year"/"last N months" queries hit rows.
  const MONTHS = [];
  for (let i = 35; i >= 0; i -= 1) MONTHS.push(ymAdd(NOW_YM, -i));

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
    { AlertID: 'AL-004', DistrictID: '0109', UnitID: '1091', CrimeHeadID: 1, PeriodStart: `${ymAdd(NOW_YM, -2)}-01`, PeriodEnd: `${ymAdd(NOW_YM, -2)}-28`, Observed: 12, Expected: 9.0, ZScore: 2.1, Severity: 1, Status: 'ACK', Narrative: 'Assault cluster acknowledged', CreatedAt: `${ymAdd(NOW_YM, -2)}-20 08:00:00` }
  ];

  tables.HotspotCluster = [
    { ClusterID: 'HS-01', CrimeHeadID: 3, CentroidLat: 13.028, CentroidLng: 77.518, RadiusM: 800, CaseCount: 34, HourBandStart: 23, HourBandEnd: 3, WindowStart: `${ymAdd(NOW_YM, -5)}-01`, WindowEnd: NOW_YM + '-28', Intensity: 88, Label: 'HB Night cluster — Peenya, 23:00–03:00', DistrictID: '0101' },
    { ClusterID: 'HS-02', CrimeHeadID: 3, CentroidLat: 12.969, CentroidLng: 77.75, RadiusM: 650, CaseCount: 27, HourBandStart: 21, HourBandEnd: 1, WindowStart: `${ymAdd(NOW_YM, -5)}-01`, WindowEnd: NOW_YM + '-28', Intensity: 74, Label: 'Chain Snatching cluster — Whitefield, 21:00–01:00', DistrictID: '0101' },
    { ClusterID: 'HS-03', CrimeHeadID: 3, CentroidLat: 12.31, CentroidLng: 76.65, RadiusM: 500, CaseCount: 19, HourBandStart: 20, HourBandEnd: 23, WindowStart: `${ymAdd(NOW_YM, -5)}-01`, WindowEnd: NOW_YM + '-28', Intensity: 61, Label: 'Chain Snatching cluster — Devaraja, 20:00–23:00', DistrictID: '0103' }
  ];

  tables.NetworkEdge = [
    { PersonKeyA: 'P001', PersonKeyB: 'P002', Weight: 3, CaseIDsJson: '[1,2,3]', CommunityID: 1 },
    { PersonKeyA: 'P001', PersonKeyB: 'P003', Weight: 2, CaseIDsJson: '[2,4]', CommunityID: 1 },
    { PersonKeyA: 'P002', PersonKeyB: 'P003', Weight: 1, CaseIDsJson: '[2]', CommunityID: 1 },
    { PersonKeyA: 'P004', PersonKeyB: 'P005', Weight: 2, CaseIDsJson: '[5,6]', CommunityID: 2 }
  ];

  tables.OffenderProfile = [
    { PersonKey: 'P001', CanonicalName: 'Ravi Kumar', AliasesJson: '["Ravi Kumar B","R Kumar"]', CaseCount: 6, DistrictsJson: '["0101","0103"]', FirstSeen: '2024-02-11', LastSeen: `${NOW_YM}-02`, MOTagsJson: '["two-wheeler","gold-chain","night"]', CommunityID: 1, DegreeCentrality: 0.42, RiskScore: 87.5 },
    { PersonKey: 'P002', CanonicalName: 'Manjunath Shetty', AliasesJson: '["M Shetty"]', CaseCount: 4, DistrictsJson: '["0101"]', FirstSeen: '2024-06-01', LastSeen: `${ymAdd(NOW_YM, -2)}-11`, MOTagsJson: '["lock-breaking","gas-cutter"]', CommunityID: 1, DegreeCentrality: 0.31, RiskScore: 72.3 },
    { PersonKey: 'P003', CanonicalName: 'Nagaraj Gowda', AliasesJson: '[]', CaseCount: 3, DistrictsJson: '["0103"]', FirstSeen: '2025-01-15', LastSeen: `${ymAdd(NOW_YM, -3)}-20`, MOTagsJson: '["otp-fraud"]', CommunityID: 1, DegreeCentrality: 0.2, RiskScore: 55.0 },
    { PersonKey: 'P004', CanonicalName: 'Prakash Naik', AliasesJson: '["P Naik"]', CaseCount: 5, DistrictsJson: '["0109","0111"]', FirstSeen: '2024-03-02', LastSeen: `${ymAdd(NOW_YM, -1)}-13`, MOTagsJson: '["vehicle-theft"]', CommunityID: 2, DegreeCentrality: 0.28, RiskScore: 64.9 },
    { PersonKey: 'P005', CanonicalName: 'Shivakumar Hegde', AliasesJson: '[]', CaseCount: 3, DistrictsJson: '["0109"]', FirstSeen: '2025-05-19', LastSeen: `${ymAdd(NOW_YM, -1)}-28`, MOTagsJson: '["vehicle-theft","country-made-pistol"]', CommunityID: 2, DegreeCentrality: 0.18, RiskScore: 51.2 },
    { PersonKey: 'P006', CanonicalName: 'Lakshman Rao', AliasesJson: '[]', CaseCount: 1, DistrictsJson: '["0107"]', FirstSeen: `${ymAdd(NOW_YM, -6)}-05`, LastSeen: `${ymAdd(NOW_YM, -6)}-05`, MOTagsJson: '[]', CommunityID: null, DegreeCentrality: 0, RiskScore: 12.0 }
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
    { ArrestSurrenderID: 41, CaseMasterID: 1, ArrestSurrenderTypeID: 1, ArrestSurrenderDate: `${ymAdd(NOW_YM, -1)}-20`, ArrestSurrenderStateId: 1, ArrestSurrenderDistrictId: '0101', PoliceStationID: '1012', IOID: 9001, CourtID: 501, AccusedMasterID: 31, IsAccused: 1 }
  ];
  tables.Employee = [
    { EmployeeID: 9001, DistrictID: '0101', UnitID: '1011', RankID: 3, DesignationID: 2, KGID: 'KG12345', FirstName: 'Manjunath Hegde' }
  ];
  tables.Rank = [{ RankID: 3, RankName: 'Inspector' }];
  tables.Court = [{ CourtID: 501, CourtName: 'City Civil & Sessions Court, Bengaluru', DistrictID: '0101' }];
  tables.CaseAnomaly = [{ CaseMasterID: 1, AnomalyFlag: 1, AnomalyScore: 0.91 }];

  // Freshness marker consumed by GET /meta/refresh (mirrors what dappa_nightly
  // writes after a real refresh).
  tables.RefreshMeta = [{
    RefreshedAt: `${NOW_YM}-01 02:00:00`,
    DetailsJson: JSON.stringify({ mode: 'fixture', cases_read: 40, anomaly_alerts: 4, stations_scored: 15 })
  }];

  return tables;
}

// ---------------------------------------------------------------------------
// PUBLIC_DEMO self-healing fallback: real Catalyst client wrapped so any
// failure is answered from the fixture via the stub ZCQL evaluator.
// ---------------------------------------------------------------------------

let memoClient = null;

/** Memoized stub client over the fixture tables (built once per container). */
function fixtureClient() {
  if (!memoClient) memoClient = createStubClient(buildFixtureTables());
  return memoClient;
}

const state = {
  active: false,      // any fallback ever served in this container
  datastore: false,   // a ZCQL query/write was answered from the fixture
  nosql: false,       // the NoSQL graph snapshot was answered from the fixture
  since: null,
  lastError: null,
  queries: 0,         // structured selects served from the fixture
  writes: 0           // raw writes recorded during fallback
};

function noteFallback(kind, err) {
  if (!state.active) { state.active = true; state.since = new Date().toISOString(); }
  state[kind] = true;
  if (err) state.lastError = String((err && err.message) || err);
}

function getFallbackState() {
  return Object.assign({}, state);
}

/** Test hook: forget activation history AND rebuild the fixture memo (demo
 * writes like alert ack now mutate it, so a reset must start clean). */
function resetFixtureFallback() {
  memoClient = null;
  state.active = false;
  state.datastore = false;
  state.nosql = false;
  state.since = null;
  state.lastError = null;
  state.queries = 0;
  state.writes = 0;
}

/**
 * Wrap a datastore client: try the real execute first; on failure evaluate the
 * same structured query against the fixture tables. Raw writes are recorded on
 * the stub's rawLog AND applied to the memoized fixture tables (simple UPDATE
 * grammar), so demo-mode actions like alert ack survive the client's refetch.
 */
function wrapClientWithFixtureFallback(client) {
  return {
    async execute(sql, q) {
      try {
        return await client.execute(sql, q);
      } catch (e) {
        noteFallback('datastore', e);
        if (q) state.queries += 1; else state.writes += 1;
        return fixtureClient().execute(sql, q);
      }
    }
  };
}

/** Demo-safe NoSQL fallback: the network graph built from fixture tables. */
async function fixtureNetworkGraph() {
  noteFallback('nosql', null);
  return network.buildFromTables(createDatastore(fixtureClient()));
}

module.exports = {
  buildFixtureTables,
  fixtureClient,
  wrapClientWithFixtureFallback,
  fixtureNetworkGraph,
  getFallbackState,
  resetFixtureFallback
};
