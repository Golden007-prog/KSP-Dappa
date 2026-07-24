'use strict';
// Insight endpoints: alerts, network, offenders, forecast, station risk.

const { ok, fail, asyncH, commonFilters, pagination, requireAdmin } = require('../envelope');
const { getLookups } = require('../lookups');
const network = require('../network');
const { toNum, round, hash32, parseJsonSafe } = require('../util');

/** Deterministic 8-point sparkline: expected band drifting into the observed spike. */
function sparkline(alertId, observed, expected) {
  const seed = hash32(alertId);
  const pts = [];
  for (let i = 0; i < 7; i += 1) {
    const wobble = (((seed >> (i * 4)) & 0xf) - 7.5) / 30; // ±25%
    pts.push(Math.max(0, Math.round(expected * (1 + wobble))));
  }
  pts.push(Math.round(toNum(observed)));
  return pts;
}

function register(router) {
  router.get('/alerts', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const { page, perPage, offset } = pagination(req);
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const lk = await getLookups(ctx);
    const where = status ? [{ col: 'Status', op: '=', val: status }] : [];
    const [countRows, rows] = await Promise.all([
      ctx.ds.query({ table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where }),
      ctx.ds.query({
        table: 'AnomalyAlert',
        columns: ['AlertID', 'DistrictID', 'UnitID', 'CrimeHeadID', 'PeriodStart', 'PeriodEnd', 'Observed', 'Expected', 'ZScore', 'Severity', 'Status', 'Narrative'],
        where, orderBy: { col: 'ZScore', desc: true }, limit: { offset, count: perPage }
      })
    ]);
    const data = rows.map((r) => ({
      alertId: r.AlertID,
      districtId: String(r.DistrictID),
      districtName: lk.districtName(r.DistrictID),
      unitId: r.UnitID === undefined || r.UnitID === null ? null : String(r.UnitID),
      crimeHeadId: toNum(r.CrimeHeadID),
      headName: lk.headName(r.CrimeHeadID),
      periodStart: r.PeriodStart,
      periodEnd: r.PeriodEnd,
      observed: toNum(r.Observed),
      expected: round(toNum(r.Expected), 1),
      zScore: round(toNum(r.ZScore), 2),
      severity: toNum(r.Severity),
      status: r.Status,
      narrative: r.Narrative,
      sparkline: sparkline(r.AlertID, r.Observed, toNum(r.Expected))
    }));
    ok(res, data, { total: toNum(countRows.length ? countRows[0]['COUNT(AlertID)'] : data.length), page, perPage });
  }));

  router.post('/alerts/:id/ack', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const id = String(req.params.id);
    if (!/^[\w.-]+$/.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    await ctx.ds.raw(`UPDATE AnomalyAlert SET Status='ACK' WHERE AlertID='${id.replace(/'/g, "''")}'`);
    ok(res, { alertId: id, status: 'ACK' });
  }));

  router.get('/network/graph', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const params = {
      communityId: req.query.communityId,
      districtId: req.query.districtId,
      personKey: req.query.personKey,
      depth: req.query.depth
    };
    const { graph, source } = await network.getGraph(params, { ds: ctx.ds, loaders: ctx.services.graphLoaders });
    ok(res, graph, { source, nodeCount: graph.nodes.length, edgeCount: graph.edges.length });
  }));

  router.get('/offenders', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const { page, perPage, offset } = pagination(req);
    const repeatOnly = String(req.query.repeatOnly || '') === '1' || String(req.query.repeatOnly || '').toLowerCase() === 'true';
    const minCases = toNum(req.query.minCases, repeatOnly ? 3 : 1);
    const district = req.query.district || req.query.districtId || null;
    const where = [{ col: 'CaseCount', op: '>=', val: minCases }];
    if (district) where.push({ col: 'DistrictsJson', op: 'like', val: String(district) });
    const [countRows, rows] = await Promise.all([
      ctx.ds.query({ table: 'OffenderProfile', columns: ['COUNT(PersonKey)'], where }),
      ctx.ds.query({
        table: 'OffenderProfile',
        columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'MOTagsJson', 'RiskScore', 'CommunityID'],
        where, orderBy: { col: 'RiskScore', desc: true }, limit: { offset, count: perPage }
      })
    ]);
    const data = rows.map((r) => ({
      personKey: String(r.PersonKey),
      canonicalName: r.CanonicalName,
      aliases: parseJsonSafe(r.AliasesJson, []),
      caseCount: toNum(r.CaseCount),
      districts: parseJsonSafe(r.DistrictsJson, []),
      moTags: parseJsonSafe(r.MOTagsJson, []),
      riskScore: round(toNum(r.RiskScore), 1),
      communityId: r.CommunityID === undefined || r.CommunityID === null ? null : toNum(r.CommunityID)
    }));
    ok(res, data, { total: toNum(countRows.length ? countRows[0]['COUNT(PersonKey)'] : data.length), page, perPage });
  }));

  router.get('/offenders/:personKey', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.personKey);
    const lk = await getLookups(ctx);
    const rows = await ctx.ds.query({
      table: 'OffenderProfile',
      columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'FirstSeen', 'LastSeen', 'MOTagsJson', 'CommunityID', 'DegreeCentrality', 'RiskScore'],
      where: [{ col: 'PersonKey', op: '=', val: key }]
    });
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', `No offender profile for ${key}.`);
    const p = rows[0];
    const [edgesA, edgesB] = await Promise.all([
      ctx.ds.query({ table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson'], where: [{ col: 'PersonKeyA', op: '=', val: key }] }),
      ctx.ds.query({ table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson'], where: [{ col: 'PersonKeyB', op: '=', val: key }] })
    ]);
    const caseIds = new Set();
    const associates = [];
    for (const e of edgesA.concat(edgesB)) {
      for (const cid of parseJsonSafe(e.CaseIDsJson, [])) caseIds.add(cid);
      const other = String(e.PersonKeyA) === key ? String(e.PersonKeyB) : String(e.PersonKeyA);
      associates.push({ personKey: other, sharedCases: toNum(e.Weight, 1) });
    }
    let timeline = [];
    if (caseIds.size) {
      const caseRows = await ctx.ds.query({
        table: 'CaseMaster',
        columns: ['CaseMasterID', 'CrimeNo', 'CrimeRegisteredDate', 'PoliceStationID', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID'],
        where: [{ col: 'CaseMasterID', op: 'in', val: [...caseIds].slice(0, 50) }],
        orderBy: { col: 'CrimeRegisteredDate', desc: true }
      });
      timeline = caseRows.map((c) => {
        const unit = lk.unitById.get(String(c.PoliceStationID));
        return {
          caseMasterId: c.CaseMasterID,
          crimeNo: c.CrimeNo,
          registeredDate: c.CrimeRegisteredDate,
          unitName: unit ? unit.unitName : String(c.PoliceStationID),
          headName: lk.headName(c.CrimeMajorHeadID),
          subHeadName: lk.subHeadName(c.CrimeMinorHeadID),
          statusName: lk.statusName(c.CaseStatusID)
        };
      });
    }
    ok(res, {
      personKey: String(p.PersonKey),
      canonicalName: p.CanonicalName,
      aliases: parseJsonSafe(p.AliasesJson, []),
      caseCount: toNum(p.CaseCount),
      districts: parseJsonSafe(p.DistrictsJson, []),
      firstSeen: p.FirstSeen,
      lastSeen: p.LastSeen,
      moTags: parseJsonSafe(p.MOTagsJson, []),
      communityId: p.CommunityID === undefined || p.CommunityID === null ? null : toNum(p.CommunityID),
      degree: toNum(p.DegreeCentrality),
      riskScore: round(toNum(p.RiskScore), 1),
      associates,
      timeline
    });
  }));

  router.get('/forecast', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const districtId = req.query.districtId || '0101';
    const crimeHeadId = toNum(req.query.crimeHeadId, 3);
    const rows = await ctx.ds.query({
      table: 'ForecastMonthly',
      columns: ['Ym', 'Actual', 'Predicted', 'Lo', 'Hi', 'Model'],
      where: [{ col: 'DistrictID', op: '=', val: districtId }, { col: 'CrimeHeadID', op: '=', val: crimeHeadId }],
      orderBy: { col: 'Ym' }
    });
    const has = (v) => v !== undefined && v !== null && v !== '';
    const history = rows.filter((r) => has(r.Actual)).map((r) => ({ ym: r.Ym, actual: toNum(r.Actual) }));
    const forecast = rows.filter((r) => has(r.Predicted) && !has(r.Actual)).map((r) => ({
      ym: r.Ym, predicted: round(toNum(r.Predicted), 1), lo: round(toNum(r.Lo), 1), hi: round(toNum(r.Hi), 1)
    }));
    const backtest = rows.filter((r) => has(r.Actual) && has(r.Predicted) && toNum(r.Actual) > 0);
    const mape = backtest.length
      ? round(backtest.reduce((s, r) => s + Math.abs(toNum(r.Actual) - toNum(r.Predicted)) / toNum(r.Actual), 0) / backtest.length * 100, 1)
      : null;
    const model = rows.length ? (rows.find((r) => r.Model) || {}).Model || 'holt-winters' : 'holt-winters';
    ok(res, { history, forecast, model, mape }, { districtId, crimeHeadId });
  }));

  router.get('/risk/stations', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const horizon = toNum(req.query.horizon, 30);
    const lk = await getLookups(ctx);
    let rows = await ctx.ds.query({
      table: 'StationRisk',
      columns: ['UnitID', 'Horizon', 'RiskScore', 'DriversJson', 'ComputedAt'],
      where: [{ col: 'Horizon', op: '=', val: horizon }],
      orderBy: { col: 'RiskScore', desc: true }
    });
    if (!rows.length) {
      // tolerate a single-horizon table
      rows = await ctx.ds.query({
        table: 'StationRisk', columns: ['UnitID', 'Horizon', 'RiskScore', 'DriversJson', 'ComputedAt'],
        orderBy: { col: 'RiskScore', desc: true }
      });
    }
    const data = rows.map((r) => {
      const unit = lk.unitById.get(String(r.UnitID));
      return {
        unitId: String(r.UnitID),
        unitName: unit ? unit.unitName : `Unit ${r.UnitID}`,
        districtId: unit ? unit.districtId : null,
        riskScore: round(toNum(r.RiskScore), 1),
        drivers: parseJsonSafe(r.DriversJson, [])
      };
    });
    ok(res, data, { horizon, count: data.length });
  }));
}

module.exports = { register };
