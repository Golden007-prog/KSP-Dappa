'use strict';
// Case explorer: paginated list + full ER-join detail.
// Privacy guardrail: ReligionID/CasteID exist in the schema but are NEVER
// selected or returned by these endpoints.

const { ok, fail, asyncH, commonFilters, pagination } = require('../envelope');
const { getLookups } = require('../lookups');
const { toNum, round, toCsv } = require('../util');

async function caseWhere(ctx, filters) {
  const where = [];
  if (filters.from) where.push({ col: 'CrimeRegisteredDate', op: '>=', val: filters.from });
  if (filters.to) where.push({ col: 'CrimeRegisteredDate', op: '<=', val: filters.to });
  if (filters.unitId) where.push({ col: 'PoliceStationID', op: '=', val: filters.unitId });
  else if (filters.districtId) {
    const lk = await getLookups(ctx);
    const units = lk.unitsOfDistrict(filters.districtId).map((u) => u.unitId);
    if (units.length) where.push({ col: 'PoliceStationID', op: 'in', val: units });
  }
  if (filters.crimeSubHeadId) where.push({ col: 'CrimeMinorHeadID', op: '=', val: filters.crimeSubHeadId });
  else if (filters.crimeHeadId) where.push({ col: 'CrimeMajorHeadID', op: '=', val: filters.crimeHeadId });
  if (filters.gravityId) where.push({ col: 'GravityOffenceID', op: '=', val: filters.gravityId });
  return where;
}

/** CaseAnomaly is an optional derived table — absence must not break the explorer. */
async function anomalyFlags(ctx, caseIds) {
  if (!caseIds.length) return new Set();
  try {
    const rows = await ctx.ds.query({
      table: 'CaseAnomaly', columns: ['CaseMasterID'],
      where: [{ col: 'CaseMasterID', op: 'in', val: caseIds }, { col: 'AnomalyFlag', op: '=', val: 1 }]
    });
    return new Set(rows.map((r) => String(r.CaseMasterID)));
  } catch (e) {
    return new Set();
  }
}

function listRow(r, lk, anomalous) {
  const unit = lk.unitById.get(String(r.PoliceStationID));
  return {
    caseMasterId: r.CaseMasterID,
    crimeNo: r.CrimeNo,
    caseNo: r.CaseNo,
    registeredDate: r.CrimeRegisteredDate,
    districtName: unit ? lk.districtName(unit.districtId) : null,
    unitName: unit ? unit.unitName : String(r.PoliceStationID),
    headName: lk.headName(r.CrimeMajorHeadID),
    subHeadName: lk.subHeadName(r.CrimeMinorHeadID),
    statusName: lk.statusName(r.CaseStatusID),
    gravityName: lk.gravityName(r.GravityOffenceID),
    anomalyFlag: anomalous.has(String(r.CaseMasterID))
  };
}

const LIST_COLUMNS = ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PoliceStationID',
  'CaseCategoryID', 'GravityOffenceID', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID'];

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

function register(router) {
  router.get('/cases', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { page, perPage, offset } = pagination(req);
    const lk = await getLookups(ctx);
    const where = await caseWhere(ctx, filters);
    const [countRows, rows] = await Promise.all([
      ctx.ds.query({ table: 'CaseMaster', columns: ['COUNT(CaseMasterID)'], where }),
      ctx.ds.query({
        table: 'CaseMaster', columns: LIST_COLUMNS, where,
        orderBy: { col: 'CrimeRegisteredDate', desc: true, tieBreak: 'CaseMasterID' },
        limit: { offset, count: perPage }
      })
    ]);
    const anomalous = await anomalyFlags(ctx, rows.map((r) => r.CaseMasterID));
    ok(res, rows.map((r) => listRow(r, lk, anomalous)), {
      total: toNum(countRows.length ? countRows[0]['COUNT(CaseMasterID)'] : rows.length),
      page, perPage
    });
  }));

  // CSV export with the same filters as GET /cases (list-row shape).
  router.get('/cases.csv', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const limit = Math.min(5000, Math.max(1, toNum(req.query.limit, 1000)));
    const lk = await getLookups(ctx);
    const where = await caseWhere(ctx, filters);
    // queryAll, not query: ZCQL truncates a single SELECT at 300 rows, and a
    // over-cap request falls through to the fixture evaluator — which is how
    // this export used to hand out 40 stub rows instead of real cases.
    const rows = await ctx.ds.queryAll({
      table: 'CaseMaster', columns: LIST_COLUMNS, where,
      orderBy: { col: 'CrimeRegisteredDate', desc: true, tieBreak: 'CaseMasterID' },
      limit: { count: limit }
    }, { maxRows: limit });
    const anomalous = await anomalyFlags(ctx, rows.map((r) => r.CaseMasterID));
    const data = rows.map((r) => listRow(r, lk, anomalous));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dappa-cases.csv"');
    res.send(toCsv(data, ['caseMasterId', 'crimeNo', 'caseNo', 'registeredDate', 'districtName', 'unitName', 'headName', 'subHeadName', 'statusName', 'gravityName', 'anomalyFlag']));
  }));

  // "Linked patterns": top-5 similar cases — same crime subhead, ranked by
  // hour-of-day proximity, same station/district, and geographic distance.
  router.get('/cases/:id/similar', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String(req.params.id);
    const lk = await getLookups(ctx);
    const baseRows = await ctx.ds.query({
      table: 'CaseMaster',
      columns: LIST_COLUMNS.concat(['IncidentFromDate', 'latitude', 'longitude']),
      where: [{ col: 'CaseMasterID', op: '=', val: id }]
    });
    if (!baseRows.length) return fail(res, 404, 'NOT_FOUND', `No case with id ${id}.`);
    const base = baseRows[0];
    const baseUnit = lk.unitById.get(String(base.PoliceStationID));
    const baseDistrict = baseUnit ? baseUnit.districtId : null;
    const baseHour = hourOf(base.IncidentFromDate);
    const baseLat = toNum(base.latitude, null);
    const baseLng = toNum(base.longitude, null);
    // The candidate pool must be wider than one 300-row ZCQL page for the
    // similarity ranking to mean anything against 45,000 cases.
    const candidates = await ctx.ds.queryAll({
      table: 'CaseMaster',
      columns: LIST_COLUMNS.concat(['IncidentFromDate', 'latitude', 'longitude']),
      where: [
        { col: 'CrimeMinorHeadID', op: '=', val: base.CrimeMinorHeadID },
        { col: 'CaseMasterID', op: '!=', val: id }
      ],
      orderBy: { col: 'CrimeRegisteredDate', desc: true }
    }, { maxRows: 1200 });
    const scored = candidates.map((c) => {
      const why = ['same crime pattern'];
      let hourScore = 0;
      const h = hourOf(c.IncidentFromDate);
      if (baseHour !== null && h !== null) {
        const diff = Math.min(Math.abs(h - baseHour), 24 - Math.abs(h - baseHour));
        hourScore = Math.max(0, 1 - diff / 6);
        if (diff <= 2) why.push('similar hour of day');
      }
      let placeScore = 0;
      const unit = lk.unitById.get(String(c.PoliceStationID));
      if (String(c.PoliceStationID) === String(base.PoliceStationID)) {
        placeScore = 1;
        why.push('same station');
      } else if (baseDistrict && unit && unit.districtId === baseDistrict) {
        placeScore = 0.7;
        why.push('same district');
      }
      let geoScore = 0;
      const lat = toNum(c.latitude, null);
      const lng = toNum(c.longitude, null);
      if (baseLat !== null && baseLng !== null && lat !== null && lng !== null) {
        const km = haversineKm(baseLat, baseLng, lat, lng);
        geoScore = Math.max(0, 1 - km / 5);
        if (km <= 2) why.push(`within ${round(Math.max(km, 0.1), 1)} km`);
      }
      const similarity = Math.round(100 * (0.4 * hourScore + 0.35 * placeScore + 0.25 * geoScore));
      return { c, similarity, why };
    });
    scored.sort((a, b) => b.similarity - a.similarity || toNum(a.c.CaseMasterID) - toNum(b.c.CaseMasterID));
    const top = scored.slice(0, 5);
    const anomalous = await anomalyFlags(ctx, top.map((s) => s.c.CaseMasterID));
    ok(res, top.map((s) => Object.assign(listRow(s.c, lk, anomalous), {
      similarity: s.similarity,
      whyMatched: s.why
    })), { baseCaseId: toNum(base.CaseMasterID, id), candidateCount: candidates.length });
  }));

  router.get('/cases/:id', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String(req.params.id);
    const lk = await getLookups(ctx);
    const caseRows = await ctx.ds.query({
      table: 'CaseMaster',
      columns: LIST_COLUMNS.concat(['PolicePersonID', 'CourtID', 'IncidentFromDate', 'IncidentToDate', 'InfoReceivedPSDate', 'latitude', 'longitude', 'BriefFacts']),
      where: [{ col: 'CaseMasterID', op: '=', val: id }]
    });
    if (!caseRows.length) return fail(res, 404, 'NOT_FOUND', `No case with id ${id}.`);
    const c = caseRows[0];

    const [complainants, victims, accused, assoc, arrests, chargesheets] = await Promise.all([
      // ReligionID / CasteID deliberately not selected (organizer guardrail).
      ctx.ds.query({ table: 'ComplainantDetails', columns: ['ComplainantID', 'ComplainantName', 'AgeYear', 'OccupationID', 'GenderID'], where: [{ col: 'CaseMasterID', op: '=', val: id }] }),
      ctx.ds.query({ table: 'Victim', columns: ['VictimMasterID', 'VictimName', 'AgeYear', 'GenderID', 'VictimPolice'], where: [{ col: 'CaseMasterID', op: '=', val: id }] }),
      ctx.ds.query({ table: 'Accused', columns: ['AccusedMasterID', 'AccusedName', 'AgeYear', 'GenderID', 'PersonID'], where: [{ col: 'CaseMasterID', op: '=', val: id }] }),
      ctx.ds.query({ table: 'ActSectionAssociation', columns: ['ActID', 'SectionID', 'ActOrderID', 'SectionOrderID'], where: [{ col: 'CaseMasterID', op: '=', val: id }] }),
      ctx.ds.query({ table: 'ArrestSurrender', columns: ['ArrestSurrenderID', 'ArrestSurrenderTypeID', 'ArrestSurrenderDate', 'PoliceStationID', 'IOID', 'CourtID', 'AccusedMasterID', 'IsAccused'], where: [{ col: 'CaseMasterID', op: '=', val: id }] }),
      ctx.ds.query({ table: 'ChargesheetDetails', columns: ['CSID', 'csdate', 'cstype', 'PolicePersonID'], where: [{ col: 'CaseMasterID', op: '=', val: id }] })
    ]);

    // Section text lookup for the associated act/section codes.
    let sections = [];
    if (assoc.length) {
      const sectionCodes = [...new Set(assoc.map((a) => String(a.SectionID)))];
      let sectionRows = [];
      try {
        sectionRows = await ctx.ds.query({
          table: 'Section', columns: ['ActCode', 'SectionCode', 'SectionDescription'],
          where: [{ col: 'SectionCode', op: 'in', val: sectionCodes }]
        });
      } catch (e) { sectionRows = []; }
      sections = assoc
        .sort((a, b) => toNum(a.SectionOrderID) - toNum(b.SectionOrderID))
        .map((a) => {
          const hit = sectionRows.find((s) => String(s.SectionCode) === String(a.SectionID) && String(s.ActCode) === String(a.ActID))
            || sectionRows.find((s) => String(s.SectionCode) === String(a.SectionID));
          return {
            actCode: String(a.ActID),
            sectionCode: String(a.SectionID),
            description: hit ? hit.SectionDescription : null
          };
        });
    }

    // Investigating officer + court (small guarded lookups).
    let io = null;
    if (c.PolicePersonID !== undefined && c.PolicePersonID !== null && c.PolicePersonID !== '') {
      try {
        const emp = await ctx.ds.query({
          table: 'Employee', columns: ['EmployeeID', 'FirstName', 'KGID', 'RankID', 'DesignationID'],
          where: [{ col: 'EmployeeID', op: '=', val: c.PolicePersonID }]
        });
        if (emp.length) {
          let rankName = null;
          try {
            const rank = await ctx.ds.query({ table: 'Rank', columns: ['RankID', 'RankName'], where: [{ col: 'RankID', op: '=', val: emp[0].RankID }] });
            rankName = rank.length ? rank[0].RankName : null;
          } catch (e) { rankName = null; }
          io = { employeeId: emp[0].EmployeeID, name: emp[0].FirstName, kgid: emp[0].KGID, rankName };
        }
      } catch (e) { io = null; }
    }
    let court = null;
    if (c.CourtID !== undefined && c.CourtID !== null && c.CourtID !== '') {
      try {
        const rows = await ctx.ds.query({ table: 'Court', columns: ['CourtID', 'CourtName', 'DistrictID'], where: [{ col: 'CourtID', op: '=', val: c.CourtID }] });
        if (rows.length) court = { courtId: rows[0].CourtID, courtName: rows[0].CourtName, districtId: String(rows[0].DistrictID) };
      } catch (e) { court = null; }
    }

    const anomalous = await anomalyFlags(ctx, [c.CaseMasterID]);
    const cs = chargesheets.length ? chargesheets[0] : null;

    ok(res, Object.assign(listRow(c, lk, anomalous), {
      categoryName: lk.categoryName(c.CaseCategoryID),
      briefFacts: c.BriefFacts,
      complainants: complainants.map((r) => ({ complainantId: r.ComplainantID, name: r.ComplainantName, age: toNum(r.AgeYear, null), genderId: r.GenderID === undefined ? null : toNum(r.GenderID, null), occupationId: r.OccupationID === undefined ? null : toNum(r.OccupationID, null) })),
      victims: victims.map((r) => ({ victimId: r.VictimMasterID, name: r.VictimName, age: toNum(r.AgeYear, null), genderId: r.GenderID === undefined ? null : toNum(r.GenderID, null), victimPolice: r.VictimPolice })),
      accused: accused.map((r) => ({ accusedId: r.AccusedMasterID, name: r.AccusedName, age: toNum(r.AgeYear, null), genderId: r.GenderID === undefined ? null : toNum(r.GenderID, null), personId: r.PersonID })),
      sections,
      arrests: arrests.map((r) => ({
        arrestId: r.ArrestSurrenderID,
        typeId: r.ArrestSurrenderTypeID === undefined ? null : toNum(r.ArrestSurrenderTypeID, null),
        date: r.ArrestSurrenderDate,
        stationId: r.PoliceStationID === undefined || r.PoliceStationID === null ? null : String(r.PoliceStationID),
        ioId: r.IOID,
        accusedId: r.AccusedMasterID,
        isAccused: toNum(r.IsAccused, 0) === 1
      })),
      chargesheet: cs ? { csId: cs.CSID, date: cs.csdate, type: cs.cstype } : null,
      io,
      court,
      latitude: toNum(c.latitude, null),
      longitude: toNum(c.longitude, null),
      incidentFrom: c.IncidentFromDate,
      incidentTo: c.IncidentToDate,
      infoReceivedDate: c.InfoReceivedPSDate
    }));
  }));
}

module.exports = { register };
