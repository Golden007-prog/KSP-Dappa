'use strict';
// Insight endpoints: alerts (list/detail/ack/status/CSV), network, offenders
// (list/search/profile/CSV), forecast, station risk (with sparklines).

const { ok, fail, asyncH, pagination, requireAdmin } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const network = require('../network');
const { ymAdd, ymRange, toNum, round, hash32, parseJsonSafe, toCsv } = require('../util');

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

const ALERT_COLUMNS = ['AlertID', 'DistrictID', 'UnitID', 'CrimeHeadID', 'PeriodStart', 'PeriodEnd', 'Observed', 'Expected', 'ZScore', 'Severity', 'Status', 'Narrative'];
const ALERT_STATUSES = ['OPEN', 'ACK', 'DISMISSED'];

function alertRow(r, lk) {
  return {
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
  };
}

/** Shared by GET /alerts and /alerts.csv so both stay contract-identical. */
async function fetchAlerts(ctx, { status, offset, count }) {
  const lk = await getLookups(ctx);
  const where = status ? [{ col: 'Status', op: '=', val: status }] : [];
  const [countRows, rows] = await Promise.all([
    ctx.ds.query({ table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where }),
    ctx.ds.query({
      table: 'AnomalyAlert', columns: ALERT_COLUMNS,
      where, orderBy: { col: 'ZScore', desc: true }, limit: { offset, count }
    })
  ]);
  const data = rows.map((r) => alertRow(r, lk));
  return { data, total: toNum(countRows.length ? countRows[0]['COUNT(AlertID)'] : data.length) };
}

const OFFENDER_COLUMNS = ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'MOTagsJson', 'RiskScore', 'CommunityID'];

function offenderRow(r) {
  return {
    personKey: String(r.PersonKey),
    canonicalName: r.CanonicalName,
    aliases: parseJsonSafe(r.AliasesJson, []),
    caseCount: toNum(r.CaseCount),
    districts: parseJsonSafe(r.DistrictsJson, []),
    moTags: parseJsonSafe(r.MOTagsJson, []),
    riskScore: round(toNum(r.RiskScore), 1),
    communityId: r.CommunityID === undefined || r.CommunityID === null ? null : toNum(r.CommunityID)
  };
}

/** Shared by GET /offenders and /offenders.csv. `q` = name/alias substring. */
async function fetchOffenders(ctx, { q, repeatOnly, minCases, district, offset, count }) {
  const where = [{ col: 'CaseCount', op: '>=', val: minCases }];
  if (district) where.push({ col: 'DistrictsJson', op: 'like', val: String(district) });
  if (q) {
    // ZCQL `where` is AND-only, so an OR over name/alias is two queries merged
    // and deduped by PersonKey, then paginated in-process.
    const [byName, byAlias] = await Promise.all([
      ctx.ds.query({
        table: 'OffenderProfile', columns: OFFENDER_COLUMNS,
        where: where.concat([{ col: 'CanonicalName', op: 'like', val: q }]),
        orderBy: { col: 'RiskScore', desc: true }, limit: { count: 200 }
      }),
      ctx.ds.query({
        table: 'OffenderProfile', columns: OFFENDER_COLUMNS,
        where: where.concat([{ col: 'AliasesJson', op: 'like', val: q }]),
        orderBy: { col: 'RiskScore', desc: true }, limit: { count: 200 }
      })
    ]);
    const seen = new Map();
    for (const r of byName.concat(byAlias)) {
      if (!seen.has(String(r.PersonKey))) seen.set(String(r.PersonKey), r);
    }
    const all = [...seen.values()].sort((a, b) => toNum(b.RiskScore) - toNum(a.RiskScore));
    return { data: all.slice(offset, offset + count).map(offenderRow), total: all.length };
  }
  const [countRows, rows] = await Promise.all([
    ctx.ds.query({ table: 'OffenderProfile', columns: ['COUNT(PersonKey)'], where }),
    ctx.ds.query({
      table: 'OffenderProfile', columns: OFFENDER_COLUMNS,
      where, orderBy: { col: 'RiskScore', desc: true }, limit: { offset, count }
    })
  ]);
  return {
    data: rows.map(offenderRow),
    total: toNum(countRows.length ? countRows[0]['COUNT(PersonKey)'] : rows.length)
  };
}

function offenderQuery(req) {
  const repeatOnly = String(req.query.repeatOnly || '') === '1' || String(req.query.repeatOnly || '').toLowerCase() === 'true';
  return {
    q: String(req.query.q || '').trim() || null,
    repeatOnly,
    minCases: toNum(req.query.minCases, repeatOnly ? 3 : 1),
    district: req.query.district || req.query.districtId || null
  };
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/** CSV export row cap: bigger than the JSON page cap, still bounded. */
function csvLimit(req, dflt) {
  return Math.min(5000, Math.max(1, toNum(req.query.limit, dflt || 1000)));
}

function register(router) {
  router.get('/alerts', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const { page, perPage, offset } = pagination(req);
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const { data, total } = await fetchAlerts(ctx, { status, offset, count: perPage });
    ok(res, data, { total, page, perPage });
  }));

  // CSV export with the same filters as GET /alerts (download button fodder).
  router.get('/alerts.csv', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const { data } = await fetchAlerts(ctx, { status, offset: 0, count: csvLimit(req) });
    const rows = data.map(({ sparkline: _s, ...rest }) => rest);
    sendCsv(res, 'dappa-alerts.csv', toCsv(rows, ['alertId', 'districtId', 'districtName', 'unitId', 'crimeHeadId', 'headName', 'periodStart', 'periodEnd', 'observed', 'expected', 'zScore', 'severity', 'status', 'narrative']));
  }));

  // Alert detail: the list row plus a real 12-month observed series for the
  // alert's district x crime head (recomputed from AggMonthly) and a robust
  // baseline, so the client can draw an actual context chart instead of the
  // synthetic sparkline.
  router.get('/alerts/:id', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String(req.params.id);
    if (!/^[\w.-]+$/.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    const lk = await getLookups(ctx);
    const rows = await ctx.ds.query({
      table: 'AnomalyAlert', columns: ALERT_COLUMNS.concat(['CreatedAt']),
      where: [{ col: 'AlertID', op: '=', val: id }]
    });
    if (!rows.length) return fail(res, 404, 'NOT_FOUND', `No alert with id ${id}.`);
    const r = rows[0];
    const alertYm = String(r.PeriodStart || '').slice(0, 7);
    let series = [];
    if (alertYm) {
      try {
        const fromYm = ymAdd(alertYm, -11);
        const agg = await ctx.ds.query({
          table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
          where: [
            { col: 'DistrictID', op: '=', val: String(r.DistrictID) },
            { col: 'CrimeHeadID', op: '=', val: toNum(r.CrimeHeadID) },
            { col: 'Ym', op: '>=', val: fromYm },
            { col: 'Ym', op: '<=', val: alertYm }
          ],
          groupBy: ['Ym'], orderBy: { col: 'Ym' }
        });
        const byYm = new Map(agg.map((x) => [x.Ym, toNum(x['SUM(CaseCount)'])]));
        series = ymRange(fromYm, alertYm).map((ym) => ({ ym, caseCount: byYm.get(ym) || 0 }));
      } catch (e) { series = []; }
    }
    const baseVals = series.slice(0, -1).map((p) => p.caseCount).sort((a, b) => a - b);
    const n = baseVals.length;
    const baselineMedian = n
      ? (n % 2 ? baseVals[(n - 1) / 2] : (baseVals[n / 2 - 1] + baseVals[n / 2]) / 2)
      : null;
    ok(res, Object.assign(alertRow(r, lk), {
      createdAt: r.CreatedAt === undefined ? null : r.CreatedAt,
      series,
      baselineMedian: baselineMedian === null ? null : round(baselineMedian, 1)
    }));
  }));

  router.post('/alerts/:id/ack', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const id = String(req.params.id);
    if (!/^[\w.-]+$/.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    await ctx.ds.raw(`UPDATE AnomalyAlert SET Status='ACK' WHERE AlertID='${id.replace(/'/g, "''")}'`);
    ok(res, { alertId: id, status: 'ACK' });
  }));

  // Alert triage beyond a single ack: OPEN / ACK / DISMISSED lifecycle.
  router.post('/alerts/:id/status', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const id = String(req.params.id);
    if (!/^[\w.-]+$/.test(id)) return fail(res, 400, 'BAD_ID', 'Invalid alert id.');
    const status = String((req.body || {}).status || '').toUpperCase();
    if (!ALERT_STATUSES.includes(status)) {
      return fail(res, 400, 'BAD_STATUS', `status must be one of ${ALERT_STATUSES.join(', ')}.`);
    }
    await ctx.ds.raw(`UPDATE AnomalyAlert SET Status='${status}' WHERE AlertID='${id.replace(/'/g, "''")}'`);
    ok(res, { alertId: id, status });
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
    const opts = offenderQuery(req);
    const { data, total } = await fetchOffenders(ctx, Object.assign(opts, { offset, count: perPage }));
    ok(res, data, { total, page, perPage, q: opts.q || undefined });
  }));

  router.get('/offenders.csv', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const opts = offenderQuery(req);
    const { data } = await fetchOffenders(ctx, Object.assign(opts, { offset: 0, count: csvLimit(req) }));
    sendCsv(res, 'dappa-offenders.csv', toCsv(data, ['personKey', 'canonicalName', 'aliases', 'caseCount', 'districts', 'moTags', 'riskScore', 'communityId']));
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
    // Per-station mini-trend: last 6 months of AggMonthly counts (one grouped
    // query), zero-filled, for sparkline cells in the risk table.
    let sparkFromYm = null;
    const sparkByUnit = new Map();
    let sparkMonths = [];
    try {
      const anchor = await anchorYm(ctx.ds, null);
      sparkFromYm = ymAdd(anchor, -5);
      sparkMonths = ymRange(sparkFromYm, anchor);
      const agg = await ctx.ds.query({
        table: 'AggMonthly', columns: ['UnitID', 'Ym', 'SUM(CaseCount)'],
        where: [{ col: 'Ym', op: '>=', val: sparkFromYm }, { col: 'Ym', op: '<=', val: anchor }],
        groupBy: ['UnitID', 'Ym']
      });
      for (const r of agg) {
        const id = String(r.UnitID);
        if (!sparkByUnit.has(id)) sparkByUnit.set(id, new Map());
        sparkByUnit.get(id).set(r.Ym, toNum(r['SUM(CaseCount)']));
      }
    } catch (e) { sparkMonths = []; }
    const data = rows.map((r) => {
      const id = String(r.UnitID);
      const unit = lk.unitById.get(id);
      const perYm = sparkByUnit.get(id);
      return {
        unitId: id,
        unitName: unit ? unit.unitName : `Unit ${r.UnitID}`,
        districtId: unit ? unit.districtId : null,
        riskScore: round(toNum(r.RiskScore), 1),
        drivers: parseJsonSafe(r.DriversJson, []),
        spark: sparkMonths.map((ym) => (perYm && perYm.get(ym)) || 0)
      };
    });
    ok(res, data, { horizon, count: data.length, sparkFromYm });
  }));
}

module.exports = { register };
