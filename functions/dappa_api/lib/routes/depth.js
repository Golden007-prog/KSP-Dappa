'use strict';
// Analytical-depth endpoints (Round-2 phase 8): deterministic statistics
// computed inside the function over the existing tables — no Catalyst AI
// service, no flag, so meta.source is always 'local'. Heavy walks are cached
// with ttlFor(); every answer carries a `scan` block so a bounded sample never
// reads as a complete one.
//
//   GET /depth/escalation            gravity ladder matrix + escalation watchlist
//   GET /depth/mo-transitions        offence-type transition matrix across careers
//   GET /depth/recidivism            Kaplan–Meier time-to-next-case curves
//   GET /depth/reactivation          dormant co-offending pairs that resurfaced
//   GET /depth/corridors             travelling-offender district corridors
//   GET /depth/near-repeat           repeat / near-repeat classes, Knox test, zones
//   GET /depth/hotspot-trajectory    monthly Gi* trajectory classes + stability
//   GET /depth/forecast-audit        band coverage / drift (offline) + live series check
//   GET /depth/festival-uplift       festival uplift per head with a 95% CI
//   GET /depth/lead-lag              lead–lag cross-correlation between heads
//   GET /depth/identity/:personKey   per-alias "why linked" breakdown
//   GET /depth/benchmarks            bundled benchmark artefacts (incl. recovery card)

const { ok, fail, asyncH, commonFilters, nocache, cacheKey, ttlFor } = require('../envelope');
const { getLookups } = require('../lookups');
const { anchorYm } = require('./read');
const { caseScopeWhere } = require('./netlinks');
const { offenderCaseIds } = require('./behaviour');
const { toNum, round, ymAdd, ymRange, parseJsonSafe } = require('../util');
const an = require('../analytics');
const { getCorpus } = require('../depth/corpus');
const behaviour = require('../depth/behaviour');
const nearrepeat = require('../depth/nearrepeat');
const trajectoryLib = require('../depth/trajectory');
const festival = require('../depth/festival');
const leadlag = require('../depth/leadlag');
const identity = require('../depth/identity');
const { loadBench } = require('../depth/bench');
const { strictNum, parseDay } = require('../depth/common');

const KEY_RE = /^[A-Za-z0-9._-]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const META = { source: 'local', engine: 'in-function statistics' };

function badDate(filters) {
  for (const [k, v] of [['from', filters.from], ['to', filters.to]]) {
    if (v && !DATE_RE.test(String(v))) return `${k} must be YYYY-MM or YYYY-MM-DD.`;
  }
  return null;
}

/** Parse the strict numeric params; the first bad one becomes a 400. */
function params(req, res, spec) {
  const out = {};
  for (const [name, dflt, min, max] of spec) {
    const v = strictNum(req.query[name], dflt, min, max);
    if (v === null) {
      fail(res, 400, 'BAD_REQUEST', `${name} must be a number between ${min} and ${max}.`);
      return null;
    }
    out[name] = v;
  }
  return out;
}

async function corpusFor(ctx, req, p) {
  return getCorpus(ctx, { maxCases: p.maxCases, maxEdges: p.maxEdges }, nocache(req));
}

const CORPUS_SPEC = [['maxCases', 2400, 50, 4000], ['maxEdges', 9000, 100, 24000]];

/** Scope rows for the spatial endpoints: dated, geocoded CaseMaster points. */
async function scopedPoints(ctx, filters, sample, defaultMonths) {
  const anchor = await anchorYm(ctx.ds, null);
  const f = Object.assign({}, filters);
  if (!f.from && !f.to) {
    f.from = `${ymAdd(anchor, -(defaultMonths - 1))}-01`;
    f.to = `${anchor}-31`;
  } else if (!f.to) {
    f.to = `${anchor}-31`;
  }
  const where = await caseScopeWhere(ctx, f);
  if (where === null) return { rows: [], anchor, scope: f, page: { pages: 0, truncated: false } };
  // One page walk per month, each with an equal share of the sample budget:
  // a single date-descending walk capped at `sample` rows would empty the
  // early months of a busy scope and every trajectory would read "new".
  const months = ymRange(String(f.from).slice(0, 7), String(f.to).slice(0, 7));
  const perMonth = Math.max(50, Math.floor(sample / Math.max(1, months.length)));
  const columns = ['CaseMasterID', 'CrimeRegisteredDate', 'latitude', 'longitude', 'PoliceStationID', 'CrimeMinorHeadID'];
  const monthPages = await Promise.all(months.map((ym) => ctx.ds.queryPaged({
    table: 'CaseMaster',
    columns,
    where: where.filter((w) => w.col !== 'CrimeRegisteredDate').concat([
      { col: 'CrimeRegisteredDate', op: '>=', val: `${ym}-01` > String(f.from) ? `${ym}-01` : String(f.from) },
      { col: 'CrimeRegisteredDate', op: '<=', val: `${ym}-31` < String(f.to) ? `${ym}-31` : String(f.to) }
    ]),
    orderBy: { col: 'CrimeRegisteredDate', tieBreak: 'CaseMasterID' }
  }, { maxRows: perMonth }).catch(() => ({ rows: [], pages: 0, truncated: false }))));
  const page = {
    rows: monthPages.flatMap((p) => p.rows),
    pages: monthPages.reduce((s, p) => s + p.pages, 0),
    truncated: monthPages.some((p) => p.truncated),
    perMonth,
    monthsTruncated: months.filter((ym, i) => monthPages[i].truncated)
  };
  const rows = [];
  for (const r of page.rows) {
    const day = parseDay(r.CrimeRegisteredDate);
    const lat = toNum(r.latitude, null);
    const lng = toNum(r.longitude, null);
    if (day === null || lat === null || lng === null || (lat === 0 && lng === 0)) continue;
    rows.push({ id: String(r.CaseMasterID), day, ym: String(r.CrimeRegisteredDate).slice(0, 7), lat: round(lat, 5), lng: round(lng, 5), unitId: String(r.PoliceStationID), subHeadId: toNum(r.CrimeMinorHeadID) });
  }
  return { rows, anchor, scope: f, page };
}

function scopeMeta(filters, scope, page, rows) {
  return {
    scope: {
      districtId: filters.districtId || null, unitId: filters.unitId || null,
      crimeHeadId: filters.crimeHeadId || null, crimeSubHeadId: filters.crimeSubHeadId || null,
      from: scope.from || null, to: scope.to || null
    },
    scan: { casesScanned: page.rows ? page.rows.length : 0, casesGeocoded: rows.length, pages: page.pages, truncated: page.truncated, perMonthCap: page.perMonth || null, monthsTruncated: page.monthsTruncated || [] }
  };
}

function register(router) {
  // ---------------------------------------------------------------- C5 corpus
  router.get('/depth/escalation', asyncH(async (req, res) => {
    const p = params(req, res, CORPUS_SPEC.concat([['minCases', 3, 2, 20], ['watchSize', 40, 5, 200]]));
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const { corpus } = await corpusFor(req.ctx, req, p);
      const out = behaviour.escalation(corpus, { minCases: p.minCases, watchSize: p.watchSize });
      out.anchorYm = corpus.anchorYm;
      out.scan = corpus.scan;
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, watchlist: value.watchlist.length }, META));
  }));

  router.get('/depth/mo-transitions', asyncH(async (req, res) => {
    const p = params(req, res, CORPUS_SPEC.concat([['topK', 10, 4, 16]]));
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(req.ctx);
      const { corpus } = await corpusFor(req.ctx, req, p);
      const out = behaviour.moTransitions(corpus, lk, { topK: p.topK });
      out.anchorYm = corpus.anchorYm;
      out.scan = corpus.scan;
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, transitions: value.summary.transitions }, META));
  }));

  router.get('/depth/recidivism', asyncH(async (req, res) => {
    const p = params(req, res, CORPUS_SPEC);
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const { corpus } = await corpusFor(req.ctx, req, p);
      const out = behaviour.recidivism(corpus);
      out.anchorYm = corpus.anchorYm;
      out.scan = corpus.scan;
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, intervals: value.summary.intervals }, META));
  }));

  router.get('/depth/reactivation', asyncH(async (req, res) => {
    const p = params(req, res, CORPUS_SPEC.concat([['dormantDays', 365, 90, 1000], ['recentDays', 365, 30, 1000]]));
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const { corpus } = await corpusFor(req.ctx, req, p);
      const out = behaviour.reactivation(corpus, { dormantDays: p.dormantDays, recentDays: p.recentDays });
      out.anchorYm = corpus.anchorYm;
      out.scan = corpus.scan;
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, reactivated: value.summary.reactivated }, META));
  }));

  router.get('/depth/corridors', asyncH(async (req, res) => {
    const p = params(req, res, CORPUS_SPEC.concat([['top', 25, 5, 60]]));
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(req.ctx);
      const { corpus } = await corpusFor(req.ctx, req, p);
      const out = behaviour.corridors(corpus, lk, { top: p.top });
      out.anchorYm = corpus.anchorYm;
      out.scan = corpus.scan;
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, corridors: value.summary.corridors }, META));
  }));

  // ---------------------------------------------------------------- C4 spatial
  router.get('/depth/near-repeat', asyncH(async (req, res) => {
    const filters = commonFilters(req);
    const dateErr = badDate(filters);
    if (dateErr) return fail(res, 400, 'BAD_REQUEST', dateErr);
    const p = params(req, res, [['distM', 500, 50, 5000], ['days', 14, 1, 120], ['sameM', 50, 0, 500], ['sample', 1200, 100, 2000], ['perms', 199, 0, 999]]);
    if (!p) return undefined;
    const ttl = ttlFor(req, 600);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const { rows, anchor, scope, page } = await scopedPoints(req.ctx, filters, p.sample, 6);
      const cls = nearrepeat.classify(rows, p);
      const kx = nearrepeat.knox(rows, p);
      const endDay = rows.length ? Math.max(...rows.map((r) => r.day)) : null;
      const zones = rows.length ? nearrepeat.predictionZones(rows, Object.assign({}, p, { endDay })) : { zones: [], asOf: null, params: p };
      return Object.assign({
        anchorYm: anchor,
        classification: cls,
        knox: kx,
        zones,
        method: 'Every pair of cases within distM metres is a candidate; a pair also within `days` is a near-repeat pair. A case with an earlier partner in both bands is a near-repeat (a repeat when the partner sits within sameM metres); a case with only later partners is an originator; the rest are isolated. Chains are the connected components of near-repeat pairs. Knox: observed space-and-time-close pairs against Ns·Nt/N; the p-value permutes the dates over the fixed locations. Prediction zones: a circle of distM around each originator whose `days` window is still open at the scope end.'
      }, scopeMeta(filters, scope, page, rows));
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, cases: value.classification.cases.length, chains: value.classification.chainCount }, META));
  }));

  router.get('/depth/hotspot-trajectory', asyncH(async (req, res) => {
    const filters = commonFilters(req);
    const dateErr = badDate(filters);
    if (dateErr) return fail(res, 400, 'BAD_REQUEST', dateErr);
    const p = params(req, res, [['cellKm', 2, 1, 25], ['months', 12, 3, 24], ['sample', 3000, 200, 4000]]);
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const { rows, anchor, scope, page } = await scopedPoints(req.ctx, filters, p.sample, p.months);
      const toYm = scope.to ? String(scope.to).slice(0, 7) : anchor;
      const months = ymRange(ymAdd(toYm, -(p.months - 1)), toYm);
      const out = trajectoryLib.trajectory(rows, months, p.cellKm);
      return Object.assign({
        anchorYm: anchor,
        trajectory: out,
        method: 'Cases are binned on a fixed square lattice (cellKm) shared by every month; each month gets a Getis–Ord Gi* z per cell (3×3 queen window, same formula as the GeoIntel grid). Hot = z ≥ 1.96. Classes follow the emerging-hot-spot rules: new (hot only this month), consecutive (unbroken hot run ending now), persistent (hot ≥ 90% of months), intensifying / diminishing (persistent with Kendall τ of z ≥ +0.3 / ≤ −0.3), sporadic (on-and-off, never cold), oscillating (hot some months, cold others), historical (hot earlier, not in the last two months). Stability = Jaccard overlap of the ten busiest cells month to month. Two-period: Gi* on the first-half and second-half totals, class change per cell.'
      }, scopeMeta(filters, scope, page, rows));
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, cells: value.trajectory.cellCount, months: value.trajectory.months.length }, META));
  }));

  // ---------------------------------------------------------------- C6 model audit
  router.get('/depth/forecast-audit', asyncH(async (req, res) => {
    const ttl = ttlFor(req, 900);
    const { value, cached } = await req.ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const bench = loadBench();
      const anchor = await anchorYm(req.ctx.ds, null);
      const fromYm = ymAdd(anchor, -5);
      const toYm = ymAdd(anchor, 3);
      const page = await req.ctx.ds.queryPaged({
        table: 'ForecastMonthly',
        columns: ['DistrictID', 'CrimeHeadID', 'Ym', 'Actual', 'Predicted', 'Lo', 'Hi', 'Model'],
        where: [{ col: 'Ym', op: '>=', val: fromYm }, { col: 'Ym', op: '<=', val: toYm }],
        orderBy: { col: 'Ym', tieBreak: 'DistrictID' }
      }, { maxRows: 3000 }).catch(() => ({ rows: [], pages: 0, truncated: false }));
      const has = (v) => v !== undefined && v !== null && v !== '';
      const series = new Set();
      const models = new Map();
      let widthSum = 0; let widthN = 0;
      const backtest = [];
      for (const r of page.rows) {
        if (!has(r.Predicted)) continue;
        const key = `${an.districtKey(r.DistrictID)}|${toNum(r.CrimeHeadID)}`;
        const pred = toNum(r.Predicted); const lo = toNum(r.Lo); const hi = toNum(r.Hi);
        if (String(r.Ym) > anchor) {
          series.add(key);
          models.set(r.Model || 'unknown', (models.get(r.Model || 'unknown') || 0) + 1);
          if (pred > 0 && has(r.Lo) && has(r.Hi)) { widthSum += (hi - lo) / pred; widthN += 1; }
        } else if (has(r.Actual)) {
          const actual = toNum(r.Actual);
          backtest.push({ key, ym: String(r.Ym), actual, pred, lo, hi, inside: has(r.Lo) && has(r.Hi) && actual >= lo && actual <= hi, ape: actual > 0 ? Math.abs(actual - pred) / actual : null });
        }
      }
      const apes = backtest.map((b) => b.ape).filter((v) => v !== null);
      const byMonth = new Map();
      for (const b of backtest) {
        if (!byMonth.has(b.ym)) byMonth.set(b.ym, { ym: b.ym, rows: 0, inside: 0, apeSum: 0, apeN: 0 });
        const m = byMonth.get(b.ym);
        m.rows += 1; if (b.inside) m.inside += 1; if (b.ape !== null) { m.apeSum += b.ape; m.apeN += 1; }
      }
      const live = {
        anchorYm: anchor,
        forecastSeries: series.size,
        modelsInUse: [...models.entries()].map(([model, rows]) => ({ model, series: Math.round(rows / 3) || rows })).sort((a, b) => b.series - a.series),
        meanBandWidthPct: widthN ? round((widthSum / widthN) * 100, 1) : null,
        storedBacktestRows: backtest.length,
        storedCoverage80: backtest.length ? round(backtest.filter((b) => b.inside).length / backtest.length, 3) : null,
        storedMape: apes.length ? round((apes.reduce((s, v) => s + v, 0) / apes.length) * 100, 1) : null,
        storedByMonth: [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((m) => ({ ym: m.ym, rows: m.rows, coverage80: round(m.inside / m.rows, 3), mape: m.apeN ? round((m.apeSum / m.apeN) * 100, 1) : null })),
        scan: { rows: page.rows.length, pages: page.pages, truncated: page.truncated, fromYm, toYm }
      };
      return {
        headline: bench.forecastMetrics ? bench.forecastMetrics.summary : null,
        coverage: bench.forecastCoverage,
        live,
        method: 'Headline numbers come from the pipeline\'s 6-month holdout over every district × head series (docs/benchmarks/forecast_metrics.json). Band coverage and drift replay that holdout offline with the 80% interval kept (docs/benchmarks/forecast_coverage.json): coverage = share of held-out actuals inside [lo, hi] (should sit near 0.80); drift = MAPE by horizon step h = 1..6 and by calendar month. The live block re-reads ForecastMonthly so the series count and models on screen are the ones the store actually holds; stored backtest rows are used when the table carries them.'
      };
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, benchmarks: Boolean(value.coverage) }, META));
  }));

  router.get('/depth/festival-uplift', asyncH(async (req, res) => {
    const filters = commonFilters(req);
    const ttl = ttlFor(req, 900);
    const ctx = req.ctx;
    const lk = await getLookups(ctx);
    let units = null;
    if (filters.districtId) {
      units = lk.unitsOfDistrict(filters.districtId).map((u) => u.unitId);
      if (!units.length) return fail(res, 400, 'BAD_REQUEST', `Unknown district ${filters.districtId}.`);
    }
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const anchor = await anchorYm(ctx.ds, null);
      const fests = festival.FESTIVALS.filter((f) => f.date.slice(0, 7) <= anchor);
      let mode = 'grouped';
      const daily = [];
      const scans = [];
      const fetchOne = async (f) => {
        const w = festival.windowsFor(f.date);
        const where = [{ col: 'CrimeRegisteredDate', op: '>=', val: w.from }, { col: 'CrimeRegisteredDate', op: '<=', val: w.to }];
        if (units) where.push({ col: 'PoliceStationID', op: 'in', val: units });
        try {
          const rows = await ctx.ds.queryAll({
            table: 'CaseMaster', columns: ['CrimeRegisteredDate', 'CrimeMajorHeadID', 'COUNT(CaseMasterID)'],
            where, groupBy: ['CrimeRegisteredDate', 'CrimeMajorHeadID'], orderBy: { col: 'CrimeRegisteredDate' }
          }, { maxRows: 1200 });
          scans.push(rows.length);
          return rows.map((r) => ({ date: String(r.CrimeRegisteredDate).slice(0, 10), headId: toNum(r.CrimeMajorHeadID), count: toNum(r['COUNT(CaseMasterID)']) }));
        } catch (e) {
          mode = 'scan';
          const page = await ctx.ds.queryPaged({
            table: 'CaseMaster', columns: ['CrimeRegisteredDate', 'CrimeMajorHeadID'], where,
            orderBy: { col: 'CrimeRegisteredDate', tieBreak: 'CaseMasterID' }
          }, { maxRows: 3000 }).catch(() => ({ rows: [], pages: 0, truncated: false }));
          scans.push(page.rows.length);
          return page.rows.map((r) => ({ date: String(r.CrimeRegisteredDate).slice(0, 10), headId: toNum(r.CrimeMajorHeadID), count: 1 }));
        }
      };
      const results = await Promise.all(fests.map(fetchOne));
      for (const rows of results) daily.push(...rows);
      const headIds = lk.heads.map((h) => h.id);
      const out = festival.estimate(daily, fests, headIds);
      for (const h of out.heads) h.headName = lk.headName(h.headId);
      out.anchorYm = anchor;
      out.scope = { districtId: filters.districtId || null, units: units ? units.length : null };
      out.scan = { mode, festivals: fests.length, dailyRows: daily.length, perFestival: scans };
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, heads: value.heads.length }, META));
  }));

  router.get('/depth/lead-lag', asyncH(async (req, res) => {
    const filters = commonFilters(req);
    const p = params(req, res, [['months', 36, 12, 60], ['maxLag', 3, 1, 6]]);
    if (!p) return undefined;
    const ttl = ttlFor(req, 900);
    const ctx = req.ctx;
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const resolve = an.makeDistrictResolver(lk);
      const anchor = await anchorYm(ctx.ds, null);
      const months = ymRange(ymAdd(anchor, -(p.months - 1)), anchor);
      const where = [{ col: 'Ym', op: '>=', val: months[0] }, { col: 'Ym', op: '<=', val: anchor }];
      const wantDistrict = filters.districtId ? (resolve(filters.districtId) || String(filters.districtId)) : null;
      if (wantDistrict) where.push({ col: 'DistrictID', op: '=', val: wantDistrict });
      const rows = await ctx.ds.queryAll({
        table: 'AggMonthly', columns: ['Ym', 'CrimeHeadID', 'SUM(CaseCount)'],
        where, groupBy: ['Ym', 'CrimeHeadID'], orderBy: { col: 'Ym' }
      }, { maxRows: 1200 }).catch(() => []);
      // The padded/unpadded district forms disagree between loads; retry the
      // other form before answering with an empty matrix.
      let used = rows;
      if (!used.length && wantDistrict) {
        const alt = wantDistrict.length === 4 ? an.districtKey(wantDistrict) : `0${wantDistrict}`;
        where[2] = { col: 'DistrictID', op: '=', val: alt };
        used = await ctx.ds.queryAll({
          table: 'AggMonthly', columns: ['Ym', 'CrimeHeadID', 'SUM(CaseCount)'],
          where, groupBy: ['Ym', 'CrimeHeadID'], orderBy: { col: 'Ym' }
        }, { maxRows: 1200 }).catch(() => []);
      }
      const byHead = new Map();
      for (const r of used) {
        const h = toNum(r.CrimeHeadID);
        if (!byHead.has(h)) byHead.set(h, new Map());
        const m = byHead.get(h);
        m.set(String(r.Ym), (m.get(String(r.Ym)) || 0) + toNum(r['SUM(CaseCount)']));
      }
      const series = [...byHead.entries()].sort((a, b) => a[0] - b[0]).map(([headId, m]) => ({
        headId, name: lk.headName(headId), values: months.map((ym) => m.get(ym) || 0)
      }));
      const out = leadlag.leadLag(series, months, p.maxLag);
      out.anchorYm = anchor;
      out.scope = { districtId: filters.districtId || null, resolved: wantDistrict };
      out.scan = { groupedRows: used.length, heads: series.length };
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, pairs: value.pairs.length, leads: value.leads.length }, META));
  }));

  // ---------------------------------------------------------------- C2 identity
  router.get('/depth/identity/:personKey', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.personKey);
    if (!KEY_RE.test(key)) return fail(res, 400, 'BAD_ID', 'Invalid personKey.');
    const ttl = ttlFor(req, 600);
    const profileRows = await ctx.ds.query({
      table: 'OffenderProfile', columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson'],
      where: [{ col: 'PersonKey', op: '=', val: key }]
    });
    if (!profileRows.length) return fail(res, 404, 'NOT_FOUND', `No offender profile for ${key}.`);
    const prof = profileRows[0];
    const { value, cached } = await ctx.cache.wrap(cacheKey(req), ttl, nocache(req), async () => {
      const lk = await getLookups(ctx);
      const bench = loadBench();
      const sample = await offenderCaseIds(ctx, key, 240);
      const accused = [];
      const districtOfCase = new Map();
      for (const ids of an.chunk(sample.ids, 80)) {
        // eslint-disable-next-line no-await-in-loop
        const [accRows, caseRows] = await Promise.all([
          ctx.ds.query({ table: 'Accused', columns: ['CaseMasterID', 'AccusedName', 'AgeYear'], where: [{ col: 'CaseMasterID', op: 'in', val: ids }], limit: { count: 300 } }).catch(() => []),
          ctx.ds.query({ table: 'CaseMaster', columns: ['CaseMasterID', 'PoliceStationID'], where: [{ col: 'CaseMasterID', op: 'in', val: ids }], limit: { count: 300 } }).catch(() => [])
        ]);
        for (const c of caseRows) {
          const unit = lk.unitById.get(String(c.PoliceStationID));
          districtOfCase.set(String(c.CaseMasterID), unit ? an.districtKey(unit.districtId) : null);
        }
        for (const a of accRows) accused.push({ name: a.AccusedName, age: a.AgeYear, caseId: a.CaseMasterID, districtId: districtOfCase.get(String(a.CaseMasterID)) || null });
      }
      const aliases = parseJsonSafe(prof.AliasesJson, []).map(String);
      const threshold = bench.identityMetrics && bench.identityMetrics.threshold ? bench.identityMetrics.threshold : 0.92;
      const out = identity.whyLinked(prof.CanonicalName || key, aliases, accused, threshold);
      out.personKey = key;
      out.caseCount = toNum(prof.CaseCount);
      out.validation = bench.identityMetrics;
      out.scan = { caseIdsLinked: sample.total, caseIdsSampled: sample.ids.length, caseIdsTruncated: sample.truncated, accusedRows: accused.length };
      return out;
    });
    return ok(res, value, Object.assign({ cached, ttlSec: ttl, personKey: key, aliases: value.aliases.length }, META));
  }));

  router.get('/depth/benchmarks', asyncH(async (req, res) => {
    const bench = loadBench();
    ok(res, {
      forecastMetrics: bench.forecastMetrics ? { summary: bench.forecastMetrics.summary, series: (bench.forecastMetrics.series || []).length } : null,
      forecastCoverage: bench.forecastCoverage ? bench.forecastCoverage.summary : null,
      identityMetrics: bench.identityMetrics,
      identitySweep: bench.identitySweep,
      recovery: bench.recovery,
      generator: 'pipeline/depth_benchmarks.py (python3.12) → docs/benchmarks/*.json + lib/depth/bench/*.json'
    }, Object.assign({
      present: ['forecastMetrics', 'forecastCoverage', 'identityMetrics', 'identitySweep', 'recovery'].filter((k) => bench[k])
    }, META));
  }));
}

module.exports = { register };
