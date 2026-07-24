'use strict';
// Read-side endpoints: meta, summary, trends, geo.

const { ok, asyncH, commonFilters, nocache, cacheKey } = require('../envelope');
const { getLookups, TTL_SEC } = require('../lookups');
const { ymOf, ymAdd, ymRange, toNum, round, pctDelta } = require('../util');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymWindow(filters, now) {
  const nowYm = ymOf(now);
  const toYm = filters.to ? String(filters.to).slice(0, 7) : nowYm;
  const fromYm = filters.from ? String(filters.from).slice(0, 7) : ymAdd(toYm, -11);
  return { fromYm, toYm };
}

function aggWhere(filters, fromYm, toYm) {
  const w = [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }];
  if (filters.districtId) w.push({ col: 'DistrictID', op: '=', val: filters.districtId });
  if (filters.unitId) w.push({ col: 'UnitID', op: '=', val: filters.unitId });
  if (filters.crimeSubHeadId) w.push({ col: 'CrimeSubHeadID', op: '=', val: filters.crimeSubHeadId });
  else if (filters.crimeHeadId) w.push({ col: 'CrimeHeadID', op: '=', val: filters.crimeHeadId });
  return w;
}

/** Anchor month = min(now, latest Ym present) so the demo stays alive after the data window. */
async function anchorYm(ds, now) {
  try {
    const rows = await ds.query({ table: 'AggMonthly', columns: ['MAX(Ym)'] });
    const maxYm = rows.length ? rows[0]['MAX(Ym)'] : null;
    const nowYm = ymOf(now);
    return maxYm && String(maxYm) < nowYm ? String(maxYm) : nowYm;
  } catch (e) {
    return ymOf(now);
  }
}

function register(router) {
  router.get('/meta/lookups', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const lk = await getLookups(ctx, nocache(req));
    ok(res, {
      districts: lk.districts,
      units: lk.units,
      crimeHeads: lk.heads,
      crimeSubHeads: lk.subHeads,
      categories: lk.categories,
      statuses: lk.statuses,
      gravities: lk.gravities
    }, { source: lk.source, ttlSec: TTL_SEC });
  }));

  router.get('/summary/kpis', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const curYm = await anchorYm(ctx.ds, null);
      const prevYm = ymAdd(curYm, -1);
      const baseWhere = filters.districtId ? [{ col: 'DistrictID', op: '=', val: filters.districtId }] : [];
      const [monthRows, csRows, alertRows, subRows] = await Promise.all([
        ctx.ds.query({
          table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)', 'SUM(HeinousCount)'],
          where: baseWhere.concat([{ col: 'Ym', op: '>=', val: prevYm }, { col: 'Ym', op: '<=', val: curYm }]),
          groupBy: ['Ym']
        }),
        ctx.ds.query({ table: 'ChargesheetDetails', columns: ['cstype', 'COUNT(CSID)'], groupBy: ['cstype'] }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['COUNT(AlertID)'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] }),
        ctx.ds.query({
          table: 'AggMonthly', columns: ['CrimeSubHeadID', 'Ym', 'SUM(CaseCount)'],
          where: baseWhere.concat([{ col: 'Ym', op: '>=', val: prevYm }, { col: 'Ym', op: '<=', val: curYm }]),
          groupBy: ['CrimeSubHeadID', 'Ym']
        })
      ]);
      const byYm = {};
      for (const r of monthRows) byYm[r.Ym] = { cases: toNum(r['SUM(CaseCount)']), heinous: toNum(r['SUM(HeinousCount)']) };
      const cur = byYm[curYm] || { cases: 0, heinous: 0 };
      const prev = byYm[prevYm] || { cases: 0, heinous: 0 };
      const cs = {};
      for (const r of csRows) cs[String(r.cstype).toUpperCase()] = toNum(r['COUNT(CSID)']);
      const detectionRate = (cs.A || 0) + (cs.C || 0) > 0 ? round(((cs.A || 0) / ((cs.A || 0) + (cs.C || 0))) * 100, 1) : 0;
      const perSub = new Map();
      for (const r of subRows) {
        const id = toNum(r.CrimeSubHeadID);
        if (!perSub.has(id)) perSub.set(id, { cur: 0, prev: 0 });
        if (r.Ym === curYm) perSub.get(id).cur = toNum(r['SUM(CaseCount)']);
        if (r.Ym === prevYm) perSub.get(id).prev = toNum(r['SUM(CaseCount)']);
      }
      let top = null;
      for (const [id, v] of perSub) {
        if (v.cur < 5) continue; // ignore noise
        const deltaPct = pctDelta(v.cur, v.prev);
        if (!top || deltaPct > top.deltaPct) top = { id, name: lk.subHeadName(id), deltaPct };
      }
      if (!top) top = { id: null, name: 'n/a', deltaPct: 0 };
      return {
        totalFirs: cur.cases,
        momPct: pctDelta(cur.cases, prev.cases),
        heinousCount: cur.heinous,
        detectionRate,
        activeAlerts: toNum(alertRows.length ? alertRows[0]['COUNT(AlertID)'] : 0),
        topRisingSubhead: top,
        asOfYm: curYm
      };
    });
    ok(res, value, { cached });
  }));

  router.get('/trends/monthly', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { fromYm, toYm } = ymWindow(filters, null);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const rows = await ctx.ds.query({
        table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)', 'SUM(HeinousCount)'],
        where: aggWhere(filters, fromYm, toYm), groupBy: ['Ym'], orderBy: { col: 'Ym' }
      });
      const byYm = new Map(rows.map((r) => [r.Ym, r]));
      return ymRange(fromYm, toYm).map((ym) => ({
        ym,
        caseCount: toNum((byYm.get(ym) || {})['SUM(CaseCount)']),
        heinousCount: toNum((byYm.get(ym) || {})['SUM(HeinousCount)'])
      }));
    });
    ok(res, value, { from: fromYm, to: toYm, cached });
  }));

  router.get('/trends/seasonality', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const where = [];
      if (filters.from) where.push({ col: 'CrimeRegisteredDate', op: '>=', val: filters.from });
      if (filters.to) where.push({ col: 'CrimeRegisteredDate', op: '<=', val: filters.to });
      if (filters.crimeSubHeadId) where.push({ col: 'CrimeMinorHeadID', op: '=', val: filters.crimeSubHeadId });
      else if (filters.crimeHeadId) where.push({ col: 'CrimeMajorHeadID', op: '=', val: filters.crimeHeadId });
      if (filters.unitId) where.push({ col: 'PoliceStationID', op: '=', val: filters.unitId });
      else if (filters.districtId) {
        const lk = await getLookups(ctx);
        const units = lk.unitsOfDistrict(filters.districtId).map((u) => u.unitId);
        if (units.length) where.push({ col: 'PoliceStationID', op: 'in', val: units });
      }
      const rows = await ctx.ds.query({
        table: 'CaseMaster', columns: ['IncidentFromDate'], where, limit: { count: 5000 }
      });
      const matrix = WEEKDAYS.map(() => new Array(24).fill(0));
      let maxCount = 0;
      for (const r of rows) {
        const d = new Date(String(r.IncidentFromDate).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) continue;
        const cell = matrix[d.getDay()];
        cell[d.getHours()] += 1;
        if (cell[d.getHours()] > maxCount) maxCount = cell[d.getHours()];
      }
      return { weekdays: WEEKDAYS, hours: [...Array(24).keys()], matrix, maxCount, sampleSize: rows.length };
    });
    ok(res, value, { cached });
  }));

  router.get('/trends/category-share', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { fromYm, toYm } = ymWindow(filters, null);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const where = aggWhere(filters, fromYm, toYm).filter((c) => !['CrimeHeadID', 'CrimeSubHeadID'].includes(c.col));
      const rows = await ctx.ds.query({
        table: 'AggMonthly', columns: ['CrimeHeadID', 'SUM(CaseCount)'],
        where, groupBy: ['CrimeHeadID'], orderBy: { col: 'SUM(CaseCount)', desc: true }
      });
      const total = rows.reduce((s, r) => s + toNum(r['SUM(CaseCount)']), 0);
      return rows.map((r) => ({
        crimeHeadId: toNum(r.CrimeHeadID),
        headName: lk.headName(r.CrimeHeadID),
        caseCount: toNum(r['SUM(CaseCount)']),
        sharePct: total > 0 ? round((toNum(r['SUM(CaseCount)']) / total) * 100, 1) : 0
      }));
    });
    ok(res, value, { from: fromYm, to: toYm, cached });
  }));

  router.get('/geo/districts', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { fromYm, toYm } = ymWindow(filters, null);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const curYm = await anchorYm(ctx.ds, null);
      const prevYm = ymAdd(curYm, -1);
      const crimeCond = [];
      if (filters.crimeSubHeadId) crimeCond.push({ col: 'CrimeSubHeadID', op: '=', val: filters.crimeSubHeadId });
      else if (filters.crimeHeadId) crimeCond.push({ col: 'CrimeHeadID', op: '=', val: filters.crimeHeadId });
      const [windowRows, momRows, alertRows] = await Promise.all([
        ctx.ds.query({
          table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
          where: [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }].concat(crimeCond),
          groupBy: ['DistrictID']
        }),
        ctx.ds.query({
          table: 'AggMonthly', columns: ['DistrictID', 'Ym', 'SUM(CaseCount)'],
          where: [{ col: 'Ym', op: '>=', val: prevYm }, { col: 'Ym', op: '<=', val: curYm }].concat(crimeCond),
          groupBy: ['DistrictID', 'Ym']
        }),
        ctx.ds.query({ table: 'AnomalyAlert', columns: ['DistrictID'], where: [{ col: 'Status', op: '=', val: 'OPEN' }] })
      ]);
      const mom = new Map();
      for (const r of momRows) {
        const id = String(r.DistrictID);
        if (!mom.has(id)) mom.set(id, { cur: 0, prev: 0 });
        if (r.Ym === curYm) mom.get(id).cur = toNum(r['SUM(CaseCount)']);
        if (r.Ym === prevYm) mom.get(id).prev = toNum(r['SUM(CaseCount)']);
      }
      const alerted = new Set(alertRows.map((r) => String(r.DistrictID)));
      return windowRows.map((r) => {
        const id = String(r.DistrictID);
        const count = toNum(r['SUM(CaseCount)']);
        const pop = lk.population(id);
        const m = mom.get(id) || { cur: 0, prev: 0 };
        return {
          districtId: id,
          districtName: lk.districtName(id),
          caseCount: count,
          ratePerLakh: pop ? round((count / pop) * 100000, 1) : null,
          momDeltaPct: pctDelta(m.cur, m.prev),
          alert: alerted.has(id)
        };
      }).sort((a, b) => b.caseCount - a.caseCount);
    });
    ok(res, value, { from: fromYm, to: toYm, cached });
  }));

  router.get('/geo/stations', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const lk = await getLookups(ctx);
    const unitFilter = filters.districtId ? lk.unitsOfDistrict(filters.districtId).map((u) => u.unitId) : null;
    const where = [];
    if (unitFilter && unitFilter.length) where.push({ col: 'PoliceStationID', op: 'in', val: unitFilter });
    if (filters.from) where.push({ col: 'CrimeRegisteredDate', op: '>=', val: filters.from });
    if (filters.to) where.push({ col: 'CrimeRegisteredDate', op: '<=', val: filters.to });
    const [caseRows, riskRows] = await Promise.all([
      ctx.ds.query({
        table: 'CaseMaster',
        columns: ['PoliceStationID', 'COUNT(CaseMasterID)', 'AVG(latitude)', 'AVG(longitude)'],
        where, groupBy: ['PoliceStationID']
      }),
      ctx.ds.query({ table: 'StationRisk', columns: ['UnitID', 'RiskScore'] })
    ]);
    const risk = new Map(riskRows.map((r) => [String(r.UnitID), toNum(r.RiskScore)]));
    const data = caseRows.map((r) => {
      const id = String(r.PoliceStationID);
      const unit = lk.unitById.get(id);
      return {
        unitId: id,
        unitName: unit ? unit.unitName : `Unit ${id}`,
        districtId: unit ? unit.districtId : (filters.districtId || null),
        lat: round(toNum(r['AVG(latitude)']), 5),
        lng: round(toNum(r['AVG(longitude)']), 5),
        caseCount: toNum(r['COUNT(CaseMasterID)']),
        riskScore: risk.has(id) ? round(risk.get(id), 1) : null
      };
    }).sort((a, b) => b.caseCount - a.caseCount);
    ok(res, data, { districtId: filters.districtId || null });
  }));

  router.get('/geo/incidents', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const limit = Math.min(2000, Math.max(1, toNum(req.query.limit, 2000)));
    const where = [];
    if (req.query.bbox) {
      const parts = String(req.query.bbox).split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        where.push({ col: 'longitude', op: '>=', val: minLng });
        where.push({ col: 'latitude', op: '>=', val: minLat });
        where.push({ col: 'longitude', op: '<=', val: maxLng });
        where.push({ col: 'latitude', op: '<=', val: maxLat });
      }
    }
    if (filters.from) where.push({ col: 'CrimeRegisteredDate', op: '>=', val: filters.from });
    if (filters.to) where.push({ col: 'CrimeRegisteredDate', op: '<=', val: filters.to });
    if (filters.crimeSubHeadId) where.push({ col: 'CrimeMinorHeadID', op: '=', val: filters.crimeSubHeadId });
    else if (filters.crimeHeadId) where.push({ col: 'CrimeMajorHeadID', op: '=', val: filters.crimeHeadId });
    if (filters.unitId) where.push({ col: 'PoliceStationID', op: '=', val: filters.unitId });
    const rows = await ctx.ds.query({
      table: 'CaseMaster',
      columns: ['CaseMasterID', 'latitude', 'longitude', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CrimeRegisteredDate'],
      where, limit: { count: limit }
    });
    ok(res, rows.map((r) => ({
      caseMasterId: r.CaseMasterID,
      lat: toNum(r.latitude),
      lng: toNum(r.longitude),
      crimeHeadId: toNum(r.CrimeMajorHeadID),
      crimeSubHeadId: toNum(r.CrimeMinorHeadID),
      registeredDate: r.CrimeRegisteredDate
    })), { limit, count: rows.length });
  }));

  router.get('/geo/hotspots', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const filters = commonFilters(req);
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), 600, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const where = [];
      if (filters.districtId) where.push({ col: 'DistrictID', op: '=', val: filters.districtId });
      if (filters.crimeHeadId) where.push({ col: 'CrimeHeadID', op: '=', val: filters.crimeHeadId });
      const rows = await ctx.ds.query({
        table: 'HotspotCluster',
        columns: ['ClusterID', 'CrimeHeadID', 'CentroidLat', 'CentroidLng', 'RadiusM', 'CaseCount', 'HourBandStart', 'HourBandEnd', 'Intensity', 'Label', 'DistrictID'],
        where, orderBy: { col: 'Intensity', desc: true }
      });
      return rows.map((r) => {
        const label = String(r.Label || '');
        const subHeadName = label.includes(' cluster') ? label.split(' cluster')[0] : lk.headName(r.CrimeHeadID);
        return {
          clusterId: r.ClusterID,
          crimeHeadId: toNum(r.CrimeHeadID),
          subHeadName,
          centroidLat: toNum(r.CentroidLat),
          centroidLng: toNum(r.CentroidLng),
          radiusM: toNum(r.RadiusM),
          caseCount: toNum(r.CaseCount),
          hourBandStart: toNum(r.HourBandStart),
          hourBandEnd: toNum(r.HourBandEnd),
          intensity: round(toNum(r.Intensity), 1),
          label,
          districtId: String(r.DistrictID)
        };
      });
    });
    ok(res, value, { cached });
  }));
}

module.exports = { register };
