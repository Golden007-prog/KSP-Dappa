'use strict';
// Officer-tier home aggregates (Round 2, Phase 4). Three read endpoints that
// answer an officer's three questions — what changed, what needs attention,
// what do I do next — at the level of the organisation they work at:
//
//   GET /tiers/beat?unitId=      one police station, last 7 days, my open cases,
//                                today's risk word, nearby hotspots
//   GET /tiers/station?unitId=   this week by crime head vs the usual level, the
//                                Crime Review month-vs-month triad, open alerts
//                                with their age, a possible-series scan, an
//                                8-week sparkline against the district median,
//                                undetected property cases > 30 days, caseload
//   GET /tiers/state             38-unit × crime-head matrix for the anchor
//                                month with the "AS ON" stamp, per-head
//                                MoM / YoY triad, unit-wise breakup of rare heads
//
// Everything is read-only, cached like the other read endpoints, and honest
// about its window: every answer carries meta.provenance {asOn, window, method,
// provisional:true} in the Monthly Crime Review's own footer idiom.
//
// "Usual level" (the baseline an officer compares a week against) is ONE
// number shared by /tiers/beat and /tiers/station: the unit's mean weekly
// count over the trailing 8 weeks of CaseMaster (weeks 1–7 against week 8)
// with a Poisson floor on the spread, so a station with three cases a week is
// not told it is "three swings above normal" because one extra FIR came in.
// It is the figure an officer can verify from the station's own diary, and
// the two tiers must never word the same week differently (D-phase4-8).
// The 12-month AggMonthly mean scaled to a week (÷ 365/12/7) survives on the
// beat as recent.longRun — a separately labelled long-run comparison that
// drives no status word.
//
// Caste / religion columns are never selected here.

const { ok, fail, asyncH, nocache, cacheKey, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const constants = require('../constants');
const { ymAdd, ymRange, toNum, round, pctDelta, parseJsonSafe } = require('../util');

const WEEK_PER_MONTH = 365 / 12 / 7; // 4.345
const TTL_SEC = 300;

// ---------------------------------------------------------------------------
// date helpers (ISO YYYY-MM-DD; CaseMaster.CrimeRegisteredDate is ISO-shaped)
// ---------------------------------------------------------------------------

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function dayAdd(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

function daysBetween(a, b) {
  const da = Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`);
  const db = Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((db - da) / 86400000);
}

/** Weekly bucket of an ISO day inside the trailing 8 weeks ending `asOf`:
 * 0 = oldest week, 7 = the last seven days; null outside the window. Shared by
 * beatHome() and stationHome() so both tiers bucket a week the same way. */
function weekIndexOf(iso, asOf) {
  const back = daysBetween(iso, asOf);
  if (back === null || back < 0) return null;
  const idx = 7 - Math.floor(back / 7);
  return idx >= 0 && idx <= 7 ? idx : null;
}

function hourOf(dt) {
  const d = new Date(String(dt || '').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function mean(xs) {
  return xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0;
}

function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, n) => s + (n - m) ** 2, 0) / (xs.length - 1));
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** (observed − usual) / spread, with a Poisson floor so tiny baselines do not
 * explode; null when there is no history at all. */
function swings(observed, usual, spread) {
  if (usual === null || usual === undefined) return null;
  const floor = Math.max(1, Math.sqrt(Math.max(usual, 0)));
  const s = Math.max(spread || 0, floor);
  return round((observed - usual) / s, 2);
}

/** Status word from a z: ≥3 rising · ≥2 watch · ≤−2 falling · else stable. */
function statusFromZ(z) {
  if (z === null || z === undefined || !Number.isFinite(z)) return 'nodata';
  if (z >= 3) return 'rising';
  if (z >= 2) return 'watch';
  if (z <= -2) return 'falling';
  return 'stable';
}

// Hour bands shared with the copilot: night 21–05, morning 05–12, afternoon
// 12–17, evening 17–21. Used to word a possible series ("mostly at night").
const HOUR_BANDS = [
  { key: 'night', start: 21, end: 5 },
  { key: 'morning', start: 5, end: 12 },
  { key: 'afternoon', start: 12, end: 17 },
  { key: 'evening', start: 17, end: 21 }
];

function bandOfHour(h) {
  if (h === null || h === undefined) return null;
  for (const b of HOUR_BANDS) {
    if (b.start < b.end ? (h >= b.start && h < b.end) : (h >= b.start || h < b.end)) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------
// shared lookups
// ---------------------------------------------------------------------------

/** Resolve ?unitId, or default to the highest-risk scored station (the
 * "busiest beat" is the honest demo default). Returns {unit, defaulted}. */
async function resolveUnit(ctx, lk, unitId) {
  if (unitId) {
    const unit = lk.unitById.get(String(unitId));
    return unit ? { unit, defaulted: false } : { unit: null, defaulted: false };
  }
  try {
    const rows = await ctx.ds.query({
      table: 'StationRisk', columns: ['UnitID', 'RiskScore'],
      orderBy: { col: 'RiskScore', desc: true }, limit: { count: 20 }
    });
    for (const r of rows) {
      const unit = lk.unitById.get(String(r.UnitID));
      if (unit) return { unit, defaulted: true };
    }
  } catch (e) { /* fall through to the first known unit */ }
  const first = lk.units[0] || null;
  return { unit: first, defaulted: true };
}

/** Latest registration date in a unit (the honest "as of" for a beat/station
 * window — the synthetic corpus ends before today). Falls back to the anchor
 * month's last day. */
async function unitAsOf(ctx, unitId, anchor) {
  try {
    const rows = await ctx.ds.query({
      table: 'CaseMaster', columns: ['CrimeRegisteredDate'],
      where: [{ col: 'PoliceStationID', op: '=', val: unitId }],
      orderBy: { col: 'CrimeRegisteredDate', desc: true, tieBreak: 'CaseMasterID' }, limit: { count: 1 }
    });
    const d = rows.length ? String(rows[0].CrimeRegisteredDate || '').slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (e) { /* fallback below */ }
  return `${anchor}-28`;
}

/** CaseStatusMaster id for "Under Investigation" (the CCS-17 "UI" column). */
function underInvestigationId(lk) {
  const hit = lk.statuses.find((s) => /under\s*investigation/i.test(String(s.name)));
  return hit ? hit.id : 1;
}

/** Employee names for a unit → Map(EmployeeID → {name, rank}). Optional table. */
async function employeesOfUnit(ctx, unitId) {
  const out = new Map();
  try {
    const rows = await ctx.ds.query({
      table: 'Employee', columns: ['EmployeeID', 'FirstName', 'RankID', 'DesignationID'],
      where: [{ col: 'UnitID', op: '=', val: unitId }], limit: { count: 300 }
    });
    let ranks = new Map();
    const rankIds = [...new Set(rows.map((r) => r.RankID).filter((v) => v !== undefined && v !== null))];
    if (rankIds.length) {
      try {
        const rr = await ctx.ds.query({ table: 'Rank', columns: ['RankID', 'RankName'], where: [{ col: 'RankID', op: 'in', val: rankIds }] });
        ranks = new Map(rr.map((r) => [String(r.RankID), r.RankName]));
      } catch (e) { ranks = new Map(); }
    }
    for (const r of rows) {
      out.set(String(r.EmployeeID), { employeeId: String(r.EmployeeID), name: r.FirstName || `Officer ${r.EmployeeID}`, rank: ranks.get(String(r.RankID)) || null });
    }
  } catch (e) { /* Employee table optional */ }
  return out;
}

/** Open alerts that belong to a unit: its own rows plus the district-level rows
 * (UnitID null) of its district. ZCQL where is AND-only, hence two reads. */
async function openAlertsFor(ctx, lk, unit) {
  const cols = ['AlertID', 'DistrictID', 'UnitID', 'CrimeHeadID', 'PeriodStart', 'PeriodEnd', 'Observed', 'Expected', 'ZScore', 'Severity', 'Status', 'Narrative', 'CreatedAt'];
  const [own, district] = await Promise.all([
    ctx.ds.query({ table: 'AnomalyAlert', columns: cols, where: [{ col: 'Status', op: '=', val: 'OPEN' }, { col: 'UnitID', op: '=', val: unit.unitId }], orderBy: { col: 'ZScore', desc: true }, limit: { count: 50 } }),
    ctx.ds.query({ table: 'AnomalyAlert', columns: cols, where: [{ col: 'Status', op: '=', val: 'OPEN' }, { col: 'DistrictID', op: '=', val: unit.districtId }], orderBy: { col: 'ZScore', desc: true }, limit: { count: 100 } })
  ]);
  const seen = new Set();
  const rows = [];
  for (const r of own.concat(district.filter((d) => d.UnitID === undefined || d.UnitID === null || d.UnitID === ''))) {
    if (seen.has(String(r.AlertID))) continue;
    seen.add(String(r.AlertID));
    rows.push(r);
  }
  const now = Date.now();
  return rows.map((r) => {
    const created = Date.parse(String(r.CreatedAt || r.PeriodEnd || '').replace(' ', 'T'));
    const z = round(toNum(r.ZScore), 2);
    return {
      alertId: r.AlertID,
      districtId: String(r.DistrictID),
      districtName: lk.districtName(r.DistrictID),
      unitId: r.UnitID === undefined || r.UnitID === null || r.UnitID === '' ? null : String(r.UnitID),
      scope: r.UnitID === undefined || r.UnitID === null || r.UnitID === '' ? 'district' : 'unit',
      crimeHeadId: toNum(r.CrimeHeadID),
      headName: lk.headName(r.CrimeHeadID),
      periodStart: r.PeriodStart,
      periodEnd: r.PeriodEnd,
      observed: toNum(r.Observed),
      expected: round(toNum(r.Expected), 1),
      zScore: z,
      severity: toNum(r.Severity),
      status: r.Status,
      narrative: r.Narrative,
      createdAt: r.CreatedAt === undefined ? null : r.CreatedAt,
      ageHours: Number.isFinite(created) ? Math.max(0, round((now - created) / 3600000, 1)) : null,
      statusWord: statusFromZ(z)
    };
  }).sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

/** Unit centroid from its cases (AVG lat/lng), else the district's constant. */
async function unitCentroid(ctx, unit) {
  try {
    const rows = await ctx.ds.query({
      table: 'CaseMaster', columns: ['AVG(latitude)', 'AVG(longitude)'],
      where: [{ col: 'PoliceStationID', op: '=', val: unit.unitId }]
    });
    const lat = toNum(rows.length ? rows[0]['AVG(latitude)'] : null, null);
    const lng = toNum(rows.length ? rows[0]['AVG(longitude)'] : null, null);
    if (lat && lng) return { lat: round(lat, 5), lng: round(lng, 5), source: 'cases' };
  } catch (e) { /* fall back */ }
  const d = constants.districtById.get(String(unit.districtId).padStart(4, '0')) || constants.districtById.get(String(unit.districtId));
  return d ? { lat: d.lat, lng: d.lng, source: 'district' } : { lat: null, lng: null, source: 'none' };
}

// ---------------------------------------------------------------------------
// GET /tiers/beat
// ---------------------------------------------------------------------------

async function beatHome(ctx, unit, employeeId) {
  const lk = await getLookups(ctx);
  const anchor = await anchorYm(ctx.ds, null);
  const asOf = await unitAsOf(ctx, unit.unitId, anchor);
  const from7 = dayAdd(asOf, -6);
  const from56 = dayAdd(asOf, -55);
  const uiId = underInvestigationId(lk);

  const [rows56, aggRows, riskRows, allRisk, hotspotRows, openRows, alerts, centroid, employees] = await Promise.all([
    ctx.ds.queryAll({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID', 'IncidentFromDate', 'latitude', 'longitude', 'PolicePersonID'],
      where: [
        { col: 'PoliceStationID', op: '=', val: unit.unitId },
        { col: 'CrimeRegisteredDate', op: '>=', val: from56 },
        { col: 'CrimeRegisteredDate', op: '<=', val: `${asOf} 23:59:59` }
      ],
      orderBy: { col: 'CrimeRegisteredDate', desc: true, tieBreak: 'CaseMasterID' }
    }, { maxRows: 3000 }),
    ctx.ds.query({
      table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
      where: [{ col: 'UnitID', op: '=', val: unit.unitId }, { col: 'Ym', op: '>=', val: ymAdd(anchor, -11) }, { col: 'Ym', op: '<=', val: anchor }],
      groupBy: ['Ym'], orderBy: { col: 'Ym' }
    }),
    ctx.ds.query({ table: 'StationRisk', columns: ['UnitID', 'Horizon', 'RiskScore', 'DriversJson', 'ComputedAt'], where: [{ col: 'UnitID', op: '=', val: unit.unitId }], limit: { count: 5 } }),
    ctx.ds.queryAll({ table: 'StationRisk', columns: ['UnitID', 'Horizon', 'RiskScore'], orderBy: { col: 'RiskScore', desc: true } }, { maxRows: 1500 }),
    ctx.ds.query({
      table: 'HotspotCluster',
      columns: ['ClusterID', 'CrimeHeadID', 'CentroidLat', 'CentroidLng', 'RadiusM', 'CaseCount', 'HourBandStart', 'HourBandEnd', 'Intensity', 'Label', 'DistrictID'],
      where: [{ col: 'DistrictID', op: '=', val: unit.districtId }], orderBy: { col: 'Intensity', desc: true }, limit: { count: 100 }
    }),
    ctx.ds.queryAll({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'PolicePersonID'],
      where: [{ col: 'PoliceStationID', op: '=', val: unit.unitId }, { col: 'CaseStatusID', op: '=', val: uiId }]
        .concat(employeeId ? [{ col: 'PolicePersonID', op: '=', val: employeeId }] : []),
      orderBy: { col: 'CrimeRegisteredDate', desc: false, tieBreak: 'CaseMasterID' }
    }, { maxRows: 1500 }),
    openAlertsFor(ctx, lk, unit),
    unitCentroid(ctx, unit),
    employeesOfUnit(ctx, unit.unitId)
  ]);

  // The usual weekly level — identical arithmetic to stationHome() below, so
  // the two tiers can never word the same week differently. Week index 0 is
  // the oldest of the trailing eight weeks, 7 the last seven days.
  const unitWeeks = new Array(8).fill(0);
  for (const r of rows56) {
    const idx = weekIndexOf(r.CrimeRegisteredDate, asOf);
    if (idx !== null) unitWeeks[idx] += 1;
  }
  const recentRows = rows56.filter((r) => weekIndexOf(r.CrimeRegisteredDate, asOf) === 7);
  const base7 = unitWeeks.slice(0, 7);
  const hasHistory = unitWeeks.some((v) => v > 0);
  const usualPerWeek = round(mean(base7), 1);
  const count7 = recentRows.length;
  const z7 = hasHistory ? swings(count7, usualPerWeek, sd(base7)) : null;

  // The 12-month AggMonthly mean scaled to a week: a DIFFERENT, long-run
  // comparison kept beside the weekly baseline and labelled as such. It never
  // sets the status word — the beat used to read this while the station read
  // the weekly mean, so the same week came out "falling" on one tier and
  // "rising" on the other.
  const monthly = ymRange(ymAdd(anchor, -11), anchor).map((ym) => {
    const hit = aggRows.find((r) => r.Ym === ym);
    return hit ? toNum(hit['SUM(CaseCount)']) : 0;
  });
  const longRun = monthly.some((v) => v > 0)
    ? { usualPerWeek: round(mean(monthly) / WEEK_PER_MONTH, 1), months: monthly.length, basis: 'AggMonthly 12-month mean ÷ 365/12/7' }
    : null;

  const byHead = new Map();
  for (const r of recentRows) {
    const id = toNum(r.CrimeMajorHeadID);
    byHead.set(id, (byHead.get(id) || 0) + 1);
  }
  const recent = {
    from: from7,
    to: asOf,
    count: count7,
    usualPerWeek,
    swings: z7,
    statusWord: statusFromZ(z7),
    weeks: unitWeeks,
    longRun,
    byHead: [...byHead.entries()].map(([id, n]) => ({ crimeHeadId: id, headName: lk.headName(id), count: n })).sort((a, b) => b.count - a.count),
    cases: recentRows.slice(0, 25).map((r) => ({
      caseMasterId: r.CaseMasterID,
      crimeNo: r.CrimeNo,
      registeredDate: String(r.CrimeRegisteredDate || '').slice(0, 10),
      headName: lk.headName(r.CrimeMajorHeadID),
      subHeadName: lk.subHeadName(r.CrimeMinorHeadID),
      hour: hourOf(r.IncidentFromDate),
      band: (bandOfHour(hourOf(r.IncidentFromDate)) || {}).key || null,
      lat: toNum(r.latitude, null),
      lng: toNum(r.longitude, null)
    }))
  };

  // Risk for the unit: score, drivers and where it sits among scored stations.
  const scored = allRisk.filter((r) => toNum(r.Horizon, 30) === 30);
  const pool = (scored.length ? scored : allRisk).map((r) => toNum(r.RiskScore)).sort((a, b) => a - b);
  const mine = riskRows.find((r) => toNum(r.Horizon, 30) === 30) || riskRows[0] || null;
  let risk = null;
  if (mine) {
    const score = round(toNum(mine.RiskScore), 1);
    const below = pool.filter((s) => s < score).length;
    const percentile = pool.length ? round((below / pool.length) * 100, 0) : null;
    const word = percentile === null ? 'nodata' : percentile >= 90 ? 'high' : percentile >= 75 ? 'elevated' : 'normal';
    risk = {
      riskScore: score,
      percentile,
      rank: pool.length ? pool.length - below : null,
      of: pool.length,
      word,
      statusWord: word === 'high' ? 'rising' : word === 'elevated' ? 'watch' : word === 'normal' ? 'stable' : 'nodata',
      drivers: parseJsonSafe(mine.DriversJson, []),
      computedAt: mine.ComputedAt === undefined ? null : mine.ComputedAt
    };
  }

  // Nearby hotspots with distance from the unit centroid and this week's
  // incidents inside each patch (from the same 7-day rows).
  const hotspots = hotspotRows.map((r) => {
    const lat = toNum(r.CentroidLat);
    const lng = toNum(r.CentroidLng);
    const radiusKm = Math.max(0.1, toNum(r.RadiusM) / 1000);
    const label = String(r.Label || '');
    const subHeadName = label.includes(' cluster') ? label.split(' cluster')[0] : lk.headName(r.CrimeHeadID);
    const thisWeekInside = recentRows.filter((c) => {
      const cl = toNum(c.latitude, null);
      const cn = toNum(c.longitude, null);
      return cl !== null && cn !== null && haversineKm(lat, lng, cl, cn) <= radiusKm;
    }).length;
    return {
      clusterId: r.ClusterID,
      crimeHeadId: toNum(r.CrimeHeadID),
      headName: lk.headName(r.CrimeHeadID),
      subHeadName,
      label,
      centroidLat: lat,
      centroidLng: lng,
      radiusM: toNum(r.RadiusM),
      caseCount: toNum(r.CaseCount),
      hourBandStart: toNum(r.HourBandStart),
      hourBandEnd: toNum(r.HourBandEnd),
      intensity: round(toNum(r.Intensity), 1),
      distanceKm: centroid.lat && centroid.lng ? round(haversineKm(centroid.lat, centroid.lng, lat, lng), 1) : null,
      thisWeekInside
    };
  }).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 6);

  // Open (under-investigation) cases with pendency age, oldest first.
  const ages = openRows.map((r) => daysBetween(r.CrimeRegisteredDate, asOf)).filter((d) => d !== null);
  const openCases = {
    total: openRows.length,
    over30: ages.filter((d) => d > 30).length,
    over60: ages.filter((d) => d > 60).length,
    medianDays: ages.length ? round(median(ages), 0) : null,
    scope: employeeId ? 'officer' : 'unit',
    rows: openRows.slice(0, 10).map((r) => {
      const age = daysBetween(r.CrimeRegisteredDate, asOf);
      const emp = employees.get(String(r.PolicePersonID));
      return {
        caseMasterId: r.CaseMasterID,
        crimeNo: r.CrimeNo,
        registeredDate: String(r.CrimeRegisteredDate || '').slice(0, 10),
        headName: lk.headName(r.CrimeMajorHeadID),
        subHeadName: lk.subHeadName(r.CrimeMinorHeadID),
        officer: emp ? emp.name : null,
        pendingDays: age,
        statusWord: age === null ? 'nodata' : age > 60 ? 'rising' : age > 30 ? 'watch' : 'stable'
      };
    })
  };

  return {
    unit: {
      unitId: unit.unitId,
      unitName: unit.unitName,
      districtId: unit.districtId,
      districtName: lk.districtName(unit.districtId),
      lat: centroid.lat,
      lng: centroid.lng
    },
    asOf,
    anchorYm: anchor,
    recent,
    risk,
    hotspots,
    openCases,
    alerts,
    provenance: {
      asOn: asOf,
      window: `${from7} → ${asOf} · baseline ${from56} → ${dayAdd(from7, -1)} (7 weeks)`,
      method: 'CaseMaster weekly buckets: the last 7 days against the mean and spread of the seven weeks before it with a Poisson floor — the same baseline /tiers/station reports; a 12-month AggMonthly weekly mean beside it as a long-run comparison; StationRisk percentile among scored stations; HotspotCluster distance from the unit centroid',
      provisional: true,
      tables: ['CaseMaster', 'AggMonthly', 'StationRisk', 'HotspotCluster', 'AnomalyAlert']
    }
  };
}

// ---------------------------------------------------------------------------
// GET /tiers/station
// ---------------------------------------------------------------------------

async function stationHome(ctx, unit) {
  const lk = await getLookups(ctx);
  const anchor = await anchorYm(ctx.ds, null);
  const asOf = await unitAsOf(ctx, unit.unitId, anchor);
  const from56 = dayAdd(asOf, -55);
  const from7 = dayAdd(asOf, -6);
  const uiId = underInvestigationId(lk);
  const districtUnits = lk.unitsOfDistrict(unit.districtId).map((u) => u.unitId);
  const prev = ymAdd(anchor, -1);
  const yoy = ymAdd(anchor, -12);

  const [rows56, districtRows, uiRows, triadRows, alerts, employees] = await Promise.all([
    ctx.ds.queryAll({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'IncidentFromDate', 'latitude', 'longitude'],
      where: [
        { col: 'PoliceStationID', op: '=', val: unit.unitId },
        { col: 'CrimeRegisteredDate', op: '>=', val: from56 },
        { col: 'CrimeRegisteredDate', op: '<=', val: `${asOf} 23:59:59` }
      ],
      orderBy: { col: 'CrimeRegisteredDate', desc: false, tieBreak: 'CaseMasterID' }
    }, { maxRows: 3000 }),
    districtUnits.length ? ctx.ds.queryAll({
      table: 'CaseMaster', columns: ['CaseMasterID', 'PoliceStationID', 'CrimeRegisteredDate'],
      where: [
        { col: 'PoliceStationID', op: 'in', val: districtUnits },
        { col: 'CrimeRegisteredDate', op: '>=', val: from56 },
        { col: 'CrimeRegisteredDate', op: '<=', val: `${asOf} 23:59:59` }
      ],
      orderBy: { col: 'CaseMasterID' }
    }, { maxRows: 6000 }) : Promise.resolve([]),
    ctx.ds.queryAll({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'PolicePersonID'],
      where: [{ col: 'PoliceStationID', op: '=', val: unit.unitId }, { col: 'CaseStatusID', op: '=', val: uiId }],
      orderBy: { col: 'CrimeRegisteredDate', desc: false, tieBreak: 'CaseMasterID' }
    }, { maxRows: 3000 }),
    ctx.ds.query({
      table: 'AggMonthly', columns: ['CrimeHeadID', 'Ym', 'SUM(CaseCount)'],
      where: [{ col: 'UnitID', op: '=', val: unit.unitId }, { col: 'Ym', op: 'in', val: [anchor, prev, yoy] }],
      groupBy: ['CrimeHeadID', 'Ym']
    }),
    openAlertsFor(ctx, lk, unit),
    employeesOfUnit(ctx, unit.unitId)
  ]);

  // Weekly buckets: week index 0 = oldest … 7 = this week (ending asOf).
  const weekIndex = (iso) => weekIndexOf(iso, asOf);
  const weeks = Array.from({ length: 8 }, (_, i) => ({ from: dayAdd(from56, i * 7), to: dayAdd(from56, i * 7 + 6) }));

  // This week by crime head vs the usual level (weeks 1–7).
  const perHeadWeeks = new Map();
  for (const h of lk.heads) perHeadWeeks.set(h.id, new Array(8).fill(0));
  for (const r of rows56) {
    const idx = weekIndex(r.CrimeRegisteredDate);
    if (idx === null) continue;
    const id = toNum(r.CrimeMajorHeadID);
    if (!perHeadWeeks.has(id)) perHeadWeeks.set(id, new Array(8).fill(0));
    perHeadWeeks.get(id)[idx] += 1;
  }
  const triad = new Map();
  for (const r of triadRows) {
    const id = toNum(r.CrimeHeadID);
    if (!triad.has(id)) triad.set(id, { cur: 0, prev: 0, yoy: 0 });
    const t = triad.get(id);
    if (r.Ym === anchor) t.cur = toNum(r['SUM(CaseCount)']);
    if (r.Ym === prev) t.prev = toNum(r['SUM(CaseCount)']);
    if (r.Ym === yoy) t.yoy = toNum(r['SUM(CaseCount)']);
  }
  const weekByHead = [...perHeadWeeks.entries()].map(([id, wk]) => {
    const base = wk.slice(0, 7);
    const usual = round(mean(base), 1);
    const z = base.some((v) => v > 0) || wk[7] > 0 ? swings(wk[7], usual, sd(base)) : null;
    const tr = triad.get(id) || { cur: 0, prev: 0, yoy: 0 };
    return {
      crimeHeadId: id,
      headName: lk.headName(id),
      thisWeek: wk[7],
      usualPerWeek: usual,
      swings: z,
      statusWord: statusFromZ(z),
      weeks: wk,
      month: { cur: tr.cur, prev: tr.prev, yoy: tr.yoy, momPct: pctDelta(tr.cur, tr.prev), yoyPct: pctDelta(tr.cur, tr.yoy) }
    };
  }).sort((a, b) => (b.swings ?? -99) - (a.swings ?? -99) || b.thisWeek - a.thisWeek);

  // 8-week unit sparkline against the district median.
  const perUnitWeeks = new Map();
  for (const uid of districtUnits) perUnitWeeks.set(String(uid), new Array(8).fill(0));
  for (const r of districtRows) {
    const idx = weekIndex(r.CrimeRegisteredDate);
    if (idx === null) continue;
    const uid = String(r.PoliceStationID);
    if (!perUnitWeeks.has(uid)) perUnitWeeks.set(uid, new Array(8).fill(0));
    perUnitWeeks.get(uid)[idx] += 1;
  }
  const unitWeeks = new Array(8).fill(0);
  for (const r of rows56) {
    const idx = weekIndex(r.CrimeRegisteredDate);
    if (idx !== null) unitWeeks[idx] += 1;
  }
  const others = [...perUnitWeeks.entries()].filter(([uid]) => uid !== String(unit.unitId)).map(([, w]) => w);
  const districtMedian = Array.from({ length: 8 }, (_, i) => {
    const vals = others.map((w) => w[i]);
    const m = median(vals);
    return m === null ? null : round(m, 1);
  });

  // Possible series: ≥3 cases of one sub-head within 14 days in the last 30.
  const from30 = dayAdd(asOf, -29);
  const bySub = new Map();
  for (const r of rows56) {
    const d = String(r.CrimeRegisteredDate || '').slice(0, 10);
    if (d < from30) continue;
    const id = toNum(r.CrimeMinorHeadID);
    if (!bySub.has(id)) bySub.set(id, []);
    bySub.get(id).push(r);
  }
  const series = [];
  for (const [subId, list] of bySub) {
    if (list.length < 3) continue;
    const sorted = list.slice().sort((a, b) => String(a.CrimeRegisteredDate).localeCompare(String(b.CrimeRegisteredDate)));
    let best = null;
    for (let i = 0; i < sorted.length; i += 1) {
      const start = String(sorted[i].CrimeRegisteredDate).slice(0, 10);
      const win = sorted.filter((c) => {
        const back = daysBetween(start, String(c.CrimeRegisteredDate).slice(0, 10));
        return back !== null && back >= 0 && back <= 13;
      });
      if (win.length >= 3 && (!best || win.length > best.length)) best = win;
    }
    if (!best) continue;
    const bandCount = new Map();
    for (const c of best) {
      const b = bandOfHour(hourOf(c.IncidentFromDate));
      if (b) bandCount.set(b.key, (bandCount.get(b.key) || 0) + 1);
    }
    let band = null;
    for (const [k, n] of bandCount) if (n / best.length >= 0.6) band = k;
    const first = String(best[0].CrimeRegisteredDate).slice(0, 10);
    const last = String(best[best.length - 1].CrimeRegisteredDate).slice(0, 10);
    series.push({
      crimeSubHeadId: subId,
      subHeadName: lk.subHeadName(subId),
      headName: lk.headName(toNum(best[0].CrimeMajorHeadID)),
      count: best.length,
      spanDays: Math.max(1, (daysBetween(first, last) || 0) + 1),
      firstDate: first,
      lastDate: last,
      band,
      caseIds: best.map((c) => c.CaseMasterID),
      crimeNos: best.map((c) => c.CrimeNo)
    });
  }
  series.sort((a, b) => b.count - a.count || a.spanDays - b.spanDays);

  // Undetected property cases older than 30 days (CCS-17 "UN" lens: still
  // under investigation with nobody charged).
  const propertyHead = lk.heads.find((h) => /property/i.test(String(h.name)));
  const cutoff30 = dayAdd(asOf, -30);
  const undetectedRows = uiRows.filter((r) => (!propertyHead || toNum(r.CrimeMajorHeadID) === propertyHead.id)
    && String(r.CrimeRegisteredDate || '').slice(0, 10) <= cutoff30);
  const undetected30 = {
    count: undetectedRows.length,
    headName: propertyHead ? propertyHead.name : 'Property Crimes',
    rows: undetectedRows.slice(0, 10).map((r) => ({
      caseMasterId: r.CaseMasterID,
      crimeNo: r.CrimeNo,
      registeredDate: String(r.CrimeRegisteredDate || '').slice(0, 10),
      subHeadName: lk.subHeadName(r.CrimeMinorHeadID),
      pendingDays: daysBetween(r.CrimeRegisteredDate, asOf),
      officer: (employees.get(String(r.PolicePersonID)) || {}).name || null
    }))
  };

  // Caseload per officer (CaseMaster.PolicePersonID → Employee).
  const perOfficer = new Map();
  for (const r of uiRows) {
    const key = String(r.PolicePersonID === undefined || r.PolicePersonID === null ? '' : r.PolicePersonID);
    if (!perOfficer.has(key)) perOfficer.set(key, []);
    perOfficer.get(key).push(daysBetween(r.CrimeRegisteredDate, asOf));
  }
  const caseload = [...perOfficer.entries()].map(([key, ages]) => {
    const emp = employees.get(key);
    const valid = ages.filter((d) => d !== null);
    const med = valid.length ? round(median(valid), 0) : null;
    const over60 = valid.filter((d) => d > 60).length;
    return {
      employeeId: key || null,
      name: emp ? emp.name : (key ? `Officer ${key}` : 'Unassigned'),
      rank: emp ? emp.rank : null,
      open: ages.length,
      medianDays: med,
      over30: valid.filter((d) => d > 30).length,
      over60,
      statusWord: over60 > 0 ? 'rising' : (med !== null && med > 30) ? 'watch' : 'stable'
    };
  }).sort((a, b) => b.open - a.open);

  const thisWeekTotal = unitWeeks[7];
  const usualTotal = round(mean(unitWeeks.slice(0, 7)), 1);
  const zTotal = unitWeeks.some((v) => v > 0) ? swings(thisWeekTotal, usualTotal, sd(unitWeeks.slice(0, 7))) : null;

  return {
    unit: {
      unitId: unit.unitId,
      unitName: unit.unitName,
      districtId: unit.districtId,
      districtName: lk.districtName(unit.districtId)
    },
    asOf,
    anchorYm: anchor,
    week: { from: from7, to: asOf, total: thisWeekTotal, usualPerWeek: usualTotal, swings: zTotal, statusWord: statusFromZ(zTotal) },
    weekByHead,
    alerts,
    series,
    spark8w: { weeks, unit: unitWeeks, districtMedian, unitsCompared: others.length },
    undetected30,
    caseload,
    provenance: {
      asOn: asOf,
      window: `${from56} → ${asOf} (8 weeks)`,
      method: 'CaseMaster weekly buckets; week 8 vs the mean and spread of weeks 1–7 with a Poisson floor; AggMonthly month-vs-month triad; series = ≥3 cases of one sub-head within 14 days',
      provisional: true,
      tables: ['CaseMaster', 'AggMonthly', 'AnomalyAlert', 'Employee']
    }
  };
}

// ---------------------------------------------------------------------------
// GET /tiers/state
// ---------------------------------------------------------------------------

const RARE_HEAD_RE = /murder|dacoity|rape|kidnapping/i;

async function stateHome(ctx) {
  const lk = await getLookups(ctx);
  const anchor = await anchorYm(ctx.ds, null);
  const prev = ymAdd(anchor, -1);
  const yoy = ymAdd(anchor, -12);
  const from12 = ymAdd(anchor, -11);
  const rareSubs = lk.subHeads.filter((s) => RARE_HEAD_RE.test(String(s.name)));

  const [triadRows, twelveRows, rareRows, alertRows] = await Promise.all([
    ctx.ds.queryAll({
      table: 'AggMonthly', columns: ['DistrictID', 'CrimeHeadID', 'Ym', 'SUM(CaseCount)'],
      where: [{ col: 'Ym', op: 'in', val: [anchor, prev, yoy] }],
      groupBy: ['DistrictID', 'CrimeHeadID', 'Ym'], orderBy: { col: 'DistrictID' }
    }, { maxRows: 2000 }),
    ctx.ds.queryAll({
      table: 'AggMonthly', columns: ['DistrictID', 'Ym', 'SUM(CaseCount)'],
      where: [{ col: 'Ym', op: '>=', val: from12 }, { col: 'Ym', op: '<=', val: anchor }],
      groupBy: ['DistrictID', 'Ym'], orderBy: { col: 'DistrictID' }
    }, { maxRows: 1500 }),
    rareSubs.length ? ctx.ds.queryAll({
      table: 'AggMonthly', columns: ['DistrictID', 'CrimeSubHeadID', 'SUM(CaseCount)'],
      where: [{ col: 'Ym', op: '=', val: anchor }, { col: 'CrimeSubHeadID', op: 'in', val: rareSubs.map((s) => s.id) }],
      groupBy: ['DistrictID', 'CrimeSubHeadID'], orderBy: { col: 'DistrictID' }
    }, { maxRows: 600 }) : Promise.resolve([]),
    ctx.ds.query({ table: 'AnomalyAlert', columns: ['DistrictID', 'COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }], groupBy: ['DistrictID'] })
  ]);

  const key = (id) => String(id).replace(/^0+(?=\d)/, '');
  const districts = lk.districts.map((d) => ({ districtId: d.districtId, districtName: d.districtName }));
  const heads = lk.heads.map((h) => ({ crimeHeadId: h.id, headName: h.name }));

  // cell[districtKey][headId] = {cur, prev, yoy}
  const cell = new Map();
  const headTotals = new Map(heads.map((h) => [h.crimeHeadId, { cur: 0, prev: 0, yoy: 0 }]));
  for (const r of triadRows) {
    const dk = key(r.DistrictID);
    const hid = toNum(r.CrimeHeadID);
    const n = toNum(r['SUM(CaseCount)']);
    if (!cell.has(dk)) cell.set(dk, new Map());
    if (!cell.get(dk).has(hid)) cell.get(dk).set(hid, { cur: 0, prev: 0, yoy: 0 });
    const c = cell.get(dk).get(hid);
    const ht = headTotals.get(hid) || { cur: 0, prev: 0, yoy: 0 };
    if (r.Ym === anchor) { c.cur += n; ht.cur += n; }
    if (r.Ym === prev) { c.prev += n; ht.prev += n; }
    if (r.Ym === yoy) { c.yoy += n; ht.yoy += n; }
    headTotals.set(hid, ht);
  }

  const dir = (a, b) => (a > b ? 'up' : a < b ? 'down' : 'same');
  const headReview = heads.map((h) => {
    const t = headTotals.get(h.crimeHeadId) || { cur: 0, prev: 0, yoy: 0 };
    return {
      crimeHeadId: h.crimeHeadId,
      headName: h.headName,
      cur: t.cur,
      prev: t.prev,
      yoy: t.yoy,
      momPct: pctDelta(t.cur, t.prev),
      yoyPct: pctDelta(t.cur, t.yoy),
      vsPrev: dir(t.cur, t.prev),
      vsYoy: dir(t.cur, t.yoy)
    };
  });

  // Per-unit 12-month history → z of the anchor month.
  const hist = new Map();
  for (const r of twelveRows) {
    const dk = key(r.DistrictID);
    if (!hist.has(dk)) hist.set(dk, new Map());
    hist.get(dk).set(r.Ym, toNum(r['SUM(CaseCount)']));
  }
  const months = ymRange(from12, anchor);
  const openAlerts = new Map(alertRows.map((r) => [key(r.DistrictID), toNum(r['COUNT(AlertID)'])]));
  const units = districts.map((d) => {
    const dk = key(d.districtId);
    const byYm = hist.get(dk) || new Map();
    const series = months.map((ym) => byYm.get(ym) || 0);
    const cur = series[series.length - 1];
    const base = series.slice(0, -1);
    const has = series.some((v) => v > 0);
    const z = has ? swings(cur, round(mean(base), 1), sd(base)) : null;
    const total12 = series.reduce((s, n) => s + n, 0);
    const pop = lk.population(d.districtId);
    const row = cell.get(dk) || new Map();
    const cells = heads.map((h) => (row.get(h.crimeHeadId) || { cur: 0 }).cur);
    return {
      districtId: d.districtId,
      districtName: d.districtName,
      cur,
      prev: series.length > 1 ? series[series.length - 2] : 0,
      momPct: series.length > 1 ? pctDelta(cur, series[series.length - 2]) : 0,
      total12,
      ratePerLakh: pop ? round((total12 / pop) * 100000, 1) : null,
      swings: z,
      statusWord: statusFromZ(z),
      openAlerts: openAlerts.get(dk) || 0,
      cells
    };
  });

  const rareByHead = new Map();
  for (const r of rareRows) {
    const sid = toNum(r.CrimeSubHeadID);
    if (!rareByHead.has(sid)) rareByHead.set(sid, []);
    rareByHead.get(sid).push({ districtId: key(r.DistrictID), count: toNum(r['SUM(CaseCount)']) });
  }
  const rareHeads = rareSubs.map((s) => {
    const list = (rareByHead.get(s.id) || []).filter((x) => x.count > 0);
    const byDistrict = list.map((x) => {
      const d = districts.find((dd) => key(dd.districtId) === x.districtId);
      return { districtId: d ? d.districtId : x.districtId, districtName: d ? d.districtName : lk.districtName(x.districtId), count: x.count };
    }).sort((a, b) => b.count - a.count);
    return {
      crimeSubHeadId: s.id,
      subHeadName: s.name,
      headName: lk.headName(s.headId),
      total: byDistrict.reduce((sum, x) => sum + x.count, 0),
      units: byDistrict
    };
  });

  const asOn = `${ymAdd(anchor, 1)}-01`;
  const totalCur = headReview.reduce((s, h) => s + h.cur, 0);
  const totalPrev = headReview.reduce((s, h) => s + h.prev, 0);
  const totalYoy = headReview.reduce((s, h) => s + h.yoy, 0);

  return {
    anchorYm: anchor,
    prevYm: prev,
    yoyYm: yoy,
    asOn,
    totals: { cur: totalCur, prev: totalPrev, yoy: totalYoy, momPct: pctDelta(totalCur, totalPrev), yoyPct: pctDelta(totalCur, totalYoy) },
    heads: headReview,
    units,
    matrix: { heads, rows: units.map((u) => ({ districtId: u.districtId, districtName: u.districtName, cells: u.cells, total: u.cells.reduce((s, n) => s + n, 0) })) },
    rareHeads,
    alertsOpen: [...openAlerts.values()].reduce((s, n) => s + n, 0),
    unitsWithOpenAlerts: [...openAlerts.entries()].filter(([, n]) => n > 0).length,
    provenance: {
      asOn,
      window: `${anchor} vs ${prev} vs ${yoy}`,
      method: 'AggMonthly totals per unit × crime head for the anchor month; unit status = anchor month against its own 11-month mean and spread; rate per lakh = trailing 12 months over SocioEconomic population',
      provisional: true,
      tables: ['AggMonthly', 'SocioEconomic', 'AnomalyAlert']
    }
  };
}

// ---------------------------------------------------------------------------

function register(router) {
  router.get('/tiers/beat', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const lk = await getLookups(ctx);
    const wanted = req.query.unitId ? String(req.query.unitId) : null;
    const { unit, defaulted } = await resolveUnit(ctx, lk, wanted);
    if (!unit) return fail(res, 404, 'NOT_FOUND', wanted ? `No unit with id ${wanted}.` : 'No units are loaded.');
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;
    const ttl = ttlFor(req, TTL_SEC);
    const { value, cached } = await ctx.cache.wrap(`${cacheKey(req)}&_u=${unit.unitId}`, ttl, nocache(req), () => beatHome(ctx, unit, employeeId));
    ok(res, value, { cached, ttlSec: ttl, defaulted, unitId: unit.unitId, provenance: value.provenance });
  }));

  router.get('/tiers/station', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const lk = await getLookups(ctx);
    const wanted = req.query.unitId ? String(req.query.unitId) : null;
    const { unit, defaulted } = await resolveUnit(ctx, lk, wanted);
    if (!unit) return fail(res, 404, 'NOT_FOUND', wanted ? `No unit with id ${wanted}.` : 'No units are loaded.');
    const ttl = ttlFor(req, TTL_SEC);
    const { value, cached } = await ctx.cache.wrap(`${cacheKey(req)}&_u=${unit.unitId}`, ttl, nocache(req), () => stationHome(ctx, unit));
    ok(res, value, { cached, ttlSec: ttl, defaulted, unitId: unit.unitId, provenance: value.provenance });
  }));

  router.get('/tiers/state', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const ttl = ttlFor(req, TTL_SEC);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), () => stateHome(ctx));
    ok(res, value, { cached, ttlSec: ttl, provenance: value.provenance });
  }));
}

module.exports = { register, statusFromZ, swings, bandOfHour };
