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
const { seedActions } = require('./actionlog');

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
  // Aggregate window ends at LAST month, the way pipeline/out does: the real
  // load's AggMonthly stops at the last complete month, so anchorYm() resolves
  // to the same month on the fixture as on the store and a batch dated in the
  // demo CSV's month lands on the anchor month rather than the one before it.
  const AGG_YM = ymAdd(NOW_YM, -1);
  const MONTHS = [];
  for (let i = 35; i >= 0; i -= 1) MONTHS.push(ymAdd(AGG_YM, -i));

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

  tables.ActionLog = seedActions(tables.AnomalyAlert, { count: 40 });

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

  // FaceGallery (Round 2, Phase 6): one procedural face per fixture offender,
  // keyed by the same Seed the Python generator used, so lib/faces_spec.js
  // re-derives the drawing and lib/faces.js the descriptor without a binary in
  // the repo. QualityJson.pixel is the descriptor measured on the generated
  // 512×512 PNG (scripts/faces_upload.mjs writes the same for the live rows).
  // P006 is inactive on purpose: the shortlist must skip a withdrawn image.
  const FACE_QUALITY = (pixel) => JSON.stringify({ gate: 'pending', generator: 'procedural-v1', width: 512, height: 512, pixel });
  tables.FaceGallery = [
    { PersonKey: 'P001', ObjectKey: 'face-gallery/v1/P001.png', ThumbKey: 'face-gallery/v1/thumbs/P001.png', Source: 'procedural-v1', Seed: 'v1:2026:P001', QualityJson: FACE_QUALITY({ skin: [255, 224, 196], hair: [255, 224, 196], aspect: 1.135, hairFrac: 0 }), Active: true },
    { PersonKey: 'P002', ObjectKey: 'face-gallery/v1/P002.png', ThumbKey: 'face-gallery/v1/thumbs/P002.png', Source: 'procedural-v1', Seed: 'v1:2026:P002', QualityJson: FACE_QUALITY({ skin: [255, 224, 196], hair: [28, 24, 22], aspect: 1.451, hairFrac: 0.585 }), Active: true },
    { PersonKey: 'P003', ObjectKey: 'face-gallery/v1/P003.png', ThumbKey: 'face-gallery/v1/thumbs/P003.png', Source: 'procedural-v1', Seed: 'v1:2026:P003', QualityJson: FACE_QUALITY({ skin: [150, 104, 72], hair: [60, 40, 28], aspect: 1.346, hairFrac: 0.603 }), Active: true },
    { PersonKey: 'P004', ObjectKey: 'face-gallery/v1/P004.png', ThumbKey: 'face-gallery/v1/thumbs/P004.png', Source: 'procedural-v1', Seed: 'v1:2026:P004', QualityJson: FACE_QUALITY({ skin: [108, 70, 46], hair: [28, 24, 22], aspect: 1.108, hairFrac: 0.569 }), Active: true },
    { PersonKey: 'P005', ObjectKey: 'face-gallery/v1/P005.png', ThumbKey: 'face-gallery/v1/thumbs/P005.png', Source: 'procedural-v1', Seed: 'v1:2026:P005', QualityJson: FACE_QUALITY({ skin: [170, 120, 88], hair: [28, 24, 22], aspect: 1.165, hairFrac: 0.388 }), Active: true },
    { PersonKey: 'P006', ObjectKey: 'face-gallery/v1/P006.png', ThumbKey: 'face-gallery/v1/thumbs/P006.png', Source: 'procedural-v1', Seed: 'v1:2026:P006', QualityJson: FACE_QUALITY({ skin: [108, 70, 46], hair: [60, 40, 28], aspect: 1.49, hairFrac: 0.578 }), Active: false }
  ];
  // Two past face searches so the audit tab is never empty in demo mode —
  // sha256 only, no probe image (rule R7). Appended, never assigned, so the
  // phase-7 seeded alert actions above survive.
  tables.ActionLog = (tables.ActionLog || []).concat([
    { ROWID: 9600001, CREATEDTIME: `${ymAdd(NOW_YM, -1)}-14 10:12:00`, AlertKey: 'face:fs-demo01-a3f2c9d1', ActionType: 'face-search', Actor: 'PSI Demo Officer', ActorRole: 'station', Unit: '1011', Note: `${NOW_YM.slice(0, 4)}00017`, OutcomeLabel: 'candidates', Payload: JSON.stringify({ subjectType: 'face', probeSha256: 'a3f2c9d1e7b04c6f8a1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b', caseNo: `${NOW_YM.slice(0, 4)}00017`, legalBasis: 'investigation-fir', filters: { districtId: '0101', moTag: 'two-wheeler' }, shortlist: { count: 2, description: '2 candidates from Bengaluru City, two-wheeler cases' }, shortlistKeys: ['P001', 'P002'], candidates: 2, topConfidence: 0.91, topPersonKey: 'P001', engine: 'local-descriptor', gate: { mode: 'advisory', passed: true, reasons: [] }, floor: 0.7 }), ClientTs: `${ymAdd(NOW_YM, -1)}-14 10:12:00` },
    { ROWID: 9600002, CREATEDTIME: `${ymAdd(NOW_YM, -1)}-14 10:20:00`, AlertKey: 'face:fs-demo01-a3f2c9d1', ActionType: 'face-decision', Actor: 'PSI Demo Officer', ActorRole: 'station', Unit: '1011', Note: 'Scar on the right cheek and the two-wheeler MO agree with the FIR narrative', OutcomeLabel: 'confirm', Payload: JSON.stringify({ subjectType: 'face', personKey: 'P001', rationale: 'Scar on the right cheek and the two-wheeler MO agree with the FIR narrative', confidence: 0.91, engine: 'local-descriptor', caseNo: `${NOW_YM.slice(0, 4)}00017`, legalBasis: 'investigation-fir' }), ClientTs: `${ymAdd(NOW_YM, -1)}-14 10:20:00` },
    { ROWID: 9600003, CREATEDTIME: `${ymAdd(NOW_YM, -1)}-20 16:05:00`, AlertKey: 'face:fs-demo02-77b1e0c4', ActionType: 'face-search', Actor: 'PSI Demo Officer', ActorRole: 'station', Unit: '1031', Note: `${NOW_YM.slice(0, 4)}00023`, OutcomeLabel: 'no-reliable-match', Payload: JSON.stringify({ subjectType: 'face', probeSha256: '77b1e0c4d9a2f5e8b3c6d1a4e7f0b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3', caseNo: `${NOW_YM.slice(0, 4)}00023`, legalBasis: 'bnss-s84-proclaimed', filters: { districtId: '0103' }, shortlist: { count: 2, description: '2 candidates from Mysuru City' }, shortlistKeys: ['P003', 'P001'], candidates: 2, topConfidence: 0.41, topPersonKey: 'P003', engine: 'local-descriptor', gate: { mode: 'advisory', passed: true, reasons: [] }, floor: 0.7 }), ClientTs: `${ymAdd(NOW_YM, -1)}-20 16:05:00` }
  ]);

  // Realised months stop at AGG_YM and the horizon starts the month after, the
  // same shape pipeline/analytics.py writes.
  tables.ForecastMonthly = [];
  for (const d of ['0101', '0103']) {
    for (let i = 11; i >= 0; i -= 1) {
      const ym = ymAdd(AGG_YM, -i);
      const actual = 40 + (hash32(`${d}|f|${ym}`) % 15);
      const row = { DistrictID: d, CrimeHeadID: 3, Ym: ym, Actual: actual, Predicted: null, Lo: null, Hi: null, Model: 'holt-winters' };
      if (i <= 5) { row.Predicted = actual + 3; row.Lo = actual - 5; row.Hi = actual + 11; } // backtest overlap
      tables.ForecastMonthly.push(row);
    }
    for (let i = 1; i <= 3; i += 1) {
      const ym = ymAdd(AGG_YM, i);
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

  // Officer-tier demo rows (Round 2, Phase 4). The generated block above lands
  // only two cases in unit 1011 — the station /tiers/beat and /tiers/station
  // default to, because StationRisk scores it highest — so the Station
  // console's series / undetected / caseload builders had nothing to read and
  // answered with three empty cards. These rows give 1011 an eight-week
  // history: a three-case Chain Snatching run inside 14 days for the
  // possible-series scan, four property cases still under investigation and
  // older than 30 days for the CCS-17 "UN" lens, and three investigating
  // officers to spread the caseload over.
  //
  // Dated backwards from the unit's own last registration (`${NOW_YM}-16`,
  // which stays the tier "as on") so each row lands in the intended weekly
  // bucket whatever month the fixture is built in. Week 7 (the last 7 days)
  // holds 5 against a weeks-1-7 usual of 1.1, which is the rising week the
  // Beat and Station cards are meant to explain.
  const TIER_ASOF = `${NOW_YM}-16`;
  const tierDay = (back) => {
    const dt = new Date(`${TIER_ASOF}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - back);
    return dt.toISOString().slice(0, 10);
  };
  const BLR = constants.districtById.get('0101');
  const WHITEFIELD = { lat: 12.969, lng: 77.75 }; // inside HotspotCluster HS-02
  // [CaseMasterID, daysBack, subHeadId, CaseStatusID, PolicePersonID, hour, nearHotspot]
  const TIER_CASES = [
    [101, 1, 306, 1, 9002, 3, false],
    [102, 2, 307, 1, 9001, 22, true],
    [103, 5, 307, 1, 9002, 23, true],
    [104, 6, 501, 2, 9003, 14, false],
    [105, 10, 307, 1, 9003, 21, true],
    [106, 17, 305, 3, 9001, 11, false],
    [107, 24, 303, 1, 9002, 2, false],
    [108, 31, 306, 1, 9003, 20, false],
    [109, 38, 305, 1, 9001, 15, false],
    [110, 45, 302, 1, 9002, 19, false],
    [111, 52, 401, 2, 9003, 12, false],
    [112, 95, 305, 1, 9003, 16, false]
  ];
  TIER_CASES.forEach(([id, back, sh, status, officer, hour, near], k) => {
    const day = tierDay(back);
    const serial = String(id).padStart(5, '0');
    const year = day.slice(0, 4);
    const hh = String(hour).padStart(2, '0');
    tables.CaseMaster.push({
      CaseMasterID: id,
      CrimeNo: `10101011${year}${serial}`,
      CaseNo: `${year}${serial}`,
      CrimeRegisteredDate: day,
      PolicePersonID: officer,
      PoliceStationID: '1011',
      CaseCategoryID: 1,
      GravityOffenceID: sh === 101 ? 1 : 2,
      CrimeMajorHeadID: constants.subHeadById.get(sh).headId,
      CrimeMinorHeadID: sh,
      CaseStatusID: status,
      CourtID: 501,
      IncidentFromDate: `${day} ${hh}:15:00`,
      IncidentToDate: `${day} ${hh}:55:00`,
      InfoReceivedPSDate: `${day} ${hh}:40:00`,
      latitude: (near ? WHITEFIELD.lat : BLR.lat) + (k % 5) * 0.0004,
      longitude: (near ? WHITEFIELD.lng : BLR.lng) + (k % 5) * 0.0004,
      BriefFacts: BRIEFS[k % BRIEFS.length]
    });
  });

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

  // Victim/accused rows for cases 2..40 so the link-analysis endpoints have a
  // real bipartite graph to walk: names repeat across cases on purpose, which
  // is what makes "repeat victim" and "cross-district suspect" mean something.
  // Case 1 is left exactly as it was — the ER-join contract test pins it.
  const VICTIM_NAMES = ['Lakshmamma Gowda', 'Rekha Hegde', 'Anitha Rao', 'Bhavana Patil', 'Girish Naik', 'Suma Shetty'];
  const SUSPECT_NAMES = ['Ravi Kumar', 'Manjunath Shetty', 'Nagaraj Gowda', 'Prakash Naik', 'Vinay Swamy', 'Gopal Naik'];
  let victimId = 22;
  let accusedId = 33;
  for (let i = 2; i <= 40; i += 1) {
    const seen = new Set();
    const vCount = 1 + (hash32(`vc|${i}`) % 3 === 0 ? 1 : 0);
    for (let j = 0; j < vCount; j += 1) {
      const name = VICTIM_NAMES[hash32(`vn|${i}|${j}`) % VICTIM_NAMES.length];
      if (seen.has(name)) continue;
      seen.add(name);
      tables.Victim.push({
        VictimMasterID: victimId, CaseMasterID: i, VictimName: name,
        AgeYear: 21 + (hash32(`va|${i}|${j}`) % 45), GenderID: (hash32(`vg|${i}|${j}`) % 2) + 1, VictimPolice: 0
      });
      victimId += 1;
    }
    const aCount = hash32(`ac|${i}`) % 3;
    const usedAccused = new Set();
    for (let j = 0; j < aCount; j += 1) {
      const name = SUSPECT_NAMES[hash32(`an|${i}|${j}`) % SUSPECT_NAMES.length];
      if (usedAccused.has(name)) continue;
      usedAccused.add(name);
      tables.Accused.push({
        AccusedMasterID: accusedId, CaseMasterID: i, AccusedName: name,
        AgeYear: 22 + (hash32(`aa|${i}|${j}`) % 30), GenderID: 1, PersonID: `A${j + 1}`
      });
      accusedId += 1;
    }
  }
  // The tier demo cases get the same treatment, from the same name pools, so
  // they are not victim-less holes in the link graph.
  for (const [id] of TIER_CASES) {
    tables.Victim.push({
      VictimMasterID: victimId, CaseMasterID: id, VictimName: VICTIM_NAMES[hash32(`vn|${id}`) % VICTIM_NAMES.length],
      AgeYear: 21 + (hash32(`va|${id}`) % 45), GenderID: (hash32(`vg|${id}`) % 2) + 1, VictimPolice: 0
    });
    victimId += 1;
    tables.Accused.push({
      AccusedMasterID: accusedId, CaseMasterID: id, AccusedName: SUSPECT_NAMES[hash32(`an|${id}`) % SUSPECT_NAMES.length],
      AgeYear: 22 + (hash32(`aa|${id}`) % 30), GenderID: 1, PersonID: 'A1'
    });
    accusedId += 1;
  }
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
  // Three investigating officers at 1011 so the Station caseload table has
  // more than one row to rank (the tier demo cases above are spread over them).
  tables.Employee = [
    { EmployeeID: 9001, DistrictID: '0101', UnitID: '1011', RankID: 3, DesignationID: 2, KGID: 'KG12345', FirstName: 'Manjunath Hegde' },
    { EmployeeID: 9002, DistrictID: '0101', UnitID: '1011', RankID: 4, DesignationID: 3, KGID: 'KG12346', FirstName: 'Savitha Rao' },
    { EmployeeID: 9003, DistrictID: '0101', UnitID: '1011', RankID: 5, DesignationID: 4, KGID: 'KG12347', FirstName: 'Basavaraj Patil' }
  ];
  tables.Rank = [
    { RankID: 3, RankName: 'Inspector' },
    { RankID: 4, RankName: 'Sub-Inspector' },
    { RankID: 5, RankName: 'Assistant Sub-Inspector' }
  ];
  tables.Court = [{ CourtID: 501, CourtName: 'City Civil & Sessions Court, Bengaluru', DistrictID: '0101' }];
  tables.CaseAnomaly = [{ CaseMasterID: 1, AnomalyFlag: 1, AnomalyScore: 0.91 }];

  // Freshness marker consumed by GET /meta/refresh (mirrors what dappa_nightly
  // writes after a real refresh).
  tables.RefreshMeta = [{
    RefreshedAt: `${NOW_YM}-01 02:00:00`,
    DetailsJson: JSON.stringify({ mode: 'fixture', cases_read: tables.CaseMaster.length, anomaly_alerts: tables.AnomalyAlert.length, stations_scored: tables.StationRisk.length })
  }];

  // ActionLog (console-created 28 Aug 2026): one OCR attach audit row so
  // GET /ocr/attachments?caseId=1 has something to read in fixture mode.
  tables.ActionLog = (tables.ActionLog || []).concat([{
    ROWID: 900001, AlertKey: 'case:1', ActionType: 'note', Actor: 'demo-admin', ActorRole: 'admin', Unit: '1012',
    Note: 'OCR scan attached: Gold mangalsutra snatched near Devaraja Market by two persons on a two-wheeler. (2 MO tags)', OutcomeLabel: '',
    Payload: JSON.stringify({ kind: 'ocr', caseId: '1', text: 'Gold mangalsutra snatched near Devaraja Market by two persons on a two-wheeler.', confidence: 0.91, language: 'eng', moTags: ['vehicle:two-wheeler', 'item:mangalsutra'], entities: [], ocrSource: 'fixture', sampleId: 'fir_01' }),
    ClientTs: `${NOW_YM}-02 09:15:00`, CREATEDTIME: `${NOW_YM}-02 09:15:04`
  }]);

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
/**
 * Tables listed in FORCE_FIXTURE_TABLES (comma-separated env) are answered
 * from the fixture even when real ZCQL succeeds. Used while a table's data
 * load is incomplete: a partially-loaded table returns real-but-WRONG numbers
 * (no error, so the error-only fallback never triggers). Remove a table from
 * the env var once its load is verified complete.
 */
function forcedFixtureTables() {
  return new Set((process.env.FORCE_FIXTURE_TABLES || '').split(',').map((s) => s.trim()).filter(Boolean));
}

function wrapClientWithFixtureFallback(client) {
  return {
    async execute(sql, q) {
      if (q && q.table && forcedFixtureTables().has(q.table)) {
        state.queries += 1;
        return fixtureClient().execute(sql, q);
      }
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
  forcedFixtureTables,
  wrapClientWithFixtureFallback,
  fixtureNetworkGraph,
  getFallbackState,
  resetFixtureFallback
};
