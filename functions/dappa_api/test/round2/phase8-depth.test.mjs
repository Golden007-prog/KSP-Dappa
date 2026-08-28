// Round-2 phase 8 (analytical depth): /depth/* endpoints + the pure helpers
// behind them. Expectations are hand-derived from the shared fixture
// (lib/fixture.js) and from small custom tables built for one scenario each.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const common = require('../../lib/depth/common.js');
const nearrepeat = require('../../lib/depth/nearrepeat.js');
const festival = require('../../lib/depth/festival.js');
const leadlag = require('../../lib/depth/leadlag.js');
const { ymOf, ymAdd, hash32 } = require('../../lib/util.js');

const NOW_YM = ymOf();

async function withApp(h, tables, fn) {
  const app = h.createApp({ clientFactory: () => h.createStubClient(tables) });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = async (p) => {
    const res = await fetch(base + p);
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, json };
  };
  try { await fn(get); } finally { server.close(); }
}

const approx = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

export async function run(h) {
  const { get, check, hasKeys } = h;

  // ---------------------------------------------------------------- pure helpers
  check('depth: token_sort_ratio matches rapidfuzz on a suffix alias', common.tokenSortRatio('Ravi Kumar B', 'Ravi Kumar') === 0.9091);
  check('depth: token_sort_ratio matches rapidfuzz on an initial alias', common.tokenSortRatio('R Kumar', 'Ravi Kumar') === 0.8235);
  check('depth: token_sort_ratio is order-free', common.tokenSortRatio('Kumar Ravi', 'Ravi Kumar') === 1);
  check('depth: gravity ladder bands', common.bandOfGravity(3) === 'petty' && common.bandOfGravity(5) === 'moderate' && common.bandOfGravity(7) === 'serious' && common.bandOfGravity(10) === 'heinous');
  check('depth: sub-head gravity uses the head fallback for unknown ids', common.gravityOf(999, 1) === 8 && common.gravityOf(305, 3) === 3);
  check('depth: normalised entropy 0 for a specialist, 1 for an even spread', common.normalisedEntropy([10]) === 0 && common.normalisedEntropy([5, 5]) === 1 && common.normalisedEntropy([1, 1, 1, 1]) === 1);
  const km = common.kaplanMeier([{ t: 3, event: true }, { t: 5, event: false }, { t: 7, event: true }, { t: 9, event: true }], [4, 8]);
  check('depth: Kaplan–Meier steps and censoring', km.n === 4 && km.events === 3 && km.censored === 1
    && km.steps.length === 3 && km.steps[0].s === 0.75 && km.steps[1].s === 0.375 && km.steps[2].s === 0 && km.medianDays === 7
    && km.grid[0].s === 0.75 && km.grid[1].s === 0.375, JSON.stringify(km));
  const xc = common.crossCorrelation([1, 3, 2, 5, 4, 6, 3, 7], [0, 1, 3, 2, 5, 4, 6, 3], 2);
  check('depth: cross-correlation finds a pure one-month shift', xc.find((x) => x.lag === 1).r === 1, JSON.stringify(xc));
  check('depth: Kendall tau on a rising / flat series', common.kendallTau([1, 2, 3, 4]) === 1 && common.kendallTau([2, 2, 2]) === 0);
  check('depth: strictNum accepts defaults and rejects junk', common.strictNum(undefined, 5, 1, 10) === 5 && common.strictNum('7', 5, 1, 10) === 7 && common.strictNum('abc', 5, 1, 10) === null && common.strictNum('11', 5, 1, 10) === null);

  // ---------------------------------------------------------------- fixture: C5 corpus endpoints
  const esc = await get('/depth/escalation');
  check('GET /depth/escalation 200 envelope', esc.status === 200 && esc.json.ok === true && hasKeys(esc.json.data, ['bands', 'matrix', 'summary', 'watchlist', 'method', 'scan']));
  check('GET /depth/escalation meta.source is local (no AI flag involved)', esc.json.meta.source === 'local');
  const mx = esc.json.data.matrix;
  const cell = (from, to) => mx.find((r) => r.from === from).to.find((c) => c.band === to).count;
  check('depth: escalation matrix counts hand-derived from the fixture careers',
    cell('petty', 'petty') === 2 && cell('moderate', 'petty') === 1 && cell('moderate', 'moderate') === 1
    && cell('moderate', 'serious') === 2 && cell('serious', 'moderate') === 1 && cell('serious', 'petty') === 1
    && mx.find((r) => r.from === 'heinous').total === 0, JSON.stringify(mx));
  check('depth: escalation transition shares', esc.json.data.summary.transitions === 8 && esc.json.data.summary.upShare === 0.25
    && esc.json.data.summary.downShare === 0.375 && esc.json.data.summary.sameShare === 0.375, JSON.stringify(esc.json.data.summary));
  check('depth: escalation verdicts (P001 and P002 both fall down the ladder)', esc.json.data.summary.personsMeasured === 2
    && esc.json.data.summary.deEscalating === 2 && esc.json.data.summary.escalating === 0 && esc.json.data.watchlist.length === 0, JSON.stringify(esc.json.data.summary));
  check('depth: escalation row probabilities sum to 1', mx.filter((r) => r.total > 0).every((r) => approx(r.to.reduce((s, c) => s + c.p, 0), 1, 0.002)));
  check('depth: escalation specialisation is 0 for fully spread careers', esc.json.data.summary.medianSpecialisation === 0);
  const escBad = await get('/depth/escalation?minCases=99');
  check('GET /depth/escalation 400 on an out-of-range minCases', escBad.status === 400 && escBad.json.error.code === 'BAD_REQUEST');

  const mo = await get('/depth/mo-transitions');
  check('GET /depth/mo-transitions 200', mo.status === 200 && hasKeys(mo.json.data, ['subHeads', 'matrix', 'topPairs', 'summary', 'method']));
  check('depth: mo-transitions totals', mo.json.data.summary.transitions === 8 && mo.json.data.summary.stayShare === 0);
  const tp0 = mo.json.data.topPairs[0];
  check('depth: mo-transitions top pair is Cheating → Online Fraud with lift 4', tp0 && tp0.from === 'Cheating' && tp0.to === 'Online Fraud' && tp0.count === 2 && tp0.pNext === 1 && tp0.lift === 4, JSON.stringify(tp0));
  const hb = mo.json.data.topPairs.find((p) => p.from === 'HB Night' && p.to === 'Robbery');
  check('depth: mo-transitions HB Night → Robbery 2 of 3', hb && hb.count === 2 && hb.pNext === 0.667 && hb.lift === 2.67, JSON.stringify(hb));
  const moBad = await get('/depth/mo-transitions?topK=2');
  check('GET /depth/mo-transitions 400 on topK below range', moBad.status === 400);

  const rec = await get('/depth/recidivism');
  check('GET /depth/recidivism 200', rec.status === 200 && hasKeys(rec.json.data, ['grid', 'overall', 'byCaseCount', 'byFamily', 'summary', 'method']));
  const ov = rec.json.data.overall;
  check('depth: recidivism intervals (8 observed gaps + 5 censored tails from 5 careers)', ov.n === 13 && ov.events === 8 && ov.censored === 5 && rec.json.data.summary.persons === 5, JSON.stringify(rec.json.data.summary));
  check('depth: recidivism curve is monotone non-increasing and ends at 0 after the last event', ov.steps.every((s, i) => i === 0 || s.s <= ov.steps[i - 1].s) && ov.steps[ov.steps.length - 1].s === 0);
  check('depth: recidivism median falls inside the fixture gap range', ov.medianDays !== null && ov.medianDays >= 25 && ov.medianDays <= 40, String(ov.medianDays));
  check('depth: recidivism case-count bands and families present', rec.json.data.byCaseCount.length >= 1 && rec.json.data.byFamily.length >= 1 && rec.json.data.byCaseCount.every((g) => g.n >= 5));

  const re = await get('/depth/reactivation');
  check('GET /depth/reactivation 200 with no dormant pairs on the fixture', re.status === 200 && re.json.data.summary.pairsScanned === 4 && re.json.data.summary.pairsWithHistory === 3 && re.json.data.summary.reactivated === 0, JSON.stringify(re.json.data.summary));
  const reBad = await get('/depth/reactivation?dormantDays=10');
  check('GET /depth/reactivation 400 on a dormancy threshold under 90 days', reBad.status === 400);

  const co = await get('/depth/corridors');
  check('GET /depth/corridors 200', co.status === 200 && hasKeys(co.json.data, ['arcs', 'directed', 'travellers', 'summary', 'method']));
  check('depth: corridors hops and travellers hand-derived', co.json.data.summary.hops === 8 && co.json.data.summary.travellers === 5 && co.json.data.summary.corridors === 6, JSON.stringify(co.json.data.summary));
  const arc0 = co.json.data.arcs[0];
  check('depth: corridors top arc Bengaluru City ⇄ Mysuru City (2 hops, 2 persons) with centroids', arc0 && arc0.from === '101' && arc0.to === '103' && arc0.hops === 2 && arc0.persons === 2 && arc0.fromLat === 12.972 && arc0.toLng === 76.639, JSON.stringify(arc0));

  // ---------------------------------------------------------------- fixture: spatial + audit + identity
  const nr = await get('/depth/near-repeat');
  check('GET /depth/near-repeat 200', nr.status === 200 && hasKeys(nr.json.data, ['classification', 'knox', 'zones', 'scope', 'scan', 'method']));
  const nrTally = nr.json.data.classification.tally;
  check('depth: near-repeat classes account for every geocoded case', Object.values(nrTally).reduce((s, n) => s + n, 0) === nr.json.data.classification.cases.length && nr.json.data.classification.cases.length > 0);
  check('depth: near-repeat Knox block has the expected shape', hasKeys(nr.json.data.knox, ['n', 'observed', 'expected', 'ratio', 'pValue', 'perms']) && nr.json.data.knox.perms === 199);
  const nrBad = await get('/depth/near-repeat?days=0');
  check('GET /depth/near-repeat 400 on days=0', nrBad.status === 400 && nrBad.json.error.code === 'BAD_REQUEST');
  const nrBadDate = await get('/depth/near-repeat?from=yesterday');
  check('GET /depth/near-repeat 400 on a malformed date', nrBadDate.status === 400);

  const tr = await get('/depth/hotspot-trajectory?months=6');
  check('GET /depth/hotspot-trajectory 200', tr.status === 200 && hasKeys(tr.json.data.trajectory, ['months', 'cellKm', 'cells', 'classes', 'stability', 'twoPeriod']) && tr.json.data.trajectory.months.length === 6);
  const trBad = await get('/depth/hotspot-trajectory?cellKm=0');
  check('GET /depth/hotspot-trajectory 400 on cellKm=0', trBad.status === 400);

  const fa = await get('/depth/forecast-audit');
  check('GET /depth/forecast-audit 200', fa.status === 200 && hasKeys(fa.json.data, ['headline', 'coverage', 'live', 'method']));
  check('depth: forecast-audit headline is the bundled benchmark (228 series, median MAPE 47.78)', fa.json.data.headline && fa.json.data.headline.series === 228 && fa.json.data.headline.medianMape === 47.78);
  const live = fa.json.data.live;
  check('depth: forecast-audit live block reads the fixture (2 series, 12 stored backtest rows, all inside the band)',
    live.forecastSeries === 2 && live.storedBacktestRows === 12 && live.storedCoverage80 === 1 && live.storedMape >= 5 && live.storedMape <= 8
    && live.meanBandWidthPct >= 25 && live.meanBandWidthPct <= 40 && live.storedByMonth.length === 6, JSON.stringify(live));
  if (fa.json.data.coverage) {
    check('depth: forecast-audit offline coverage summary carries the holdout numbers', fa.json.data.coverage.summary.series === 228 && fa.json.data.coverage.summary.coverage80 > 0 && fa.json.data.coverage.summary.coverage80 < 1 && fa.json.data.coverage.byHorizon.length === 6);
  }

  const fu = await get('/depth/festival-uplift');
  check('GET /depth/festival-uplift 200 with an honest empty estimate on the 3-month fixture', fu.status === 200 && Array.isArray(fu.json.data.heads) && fu.json.data.heads.length === 0 && fu.json.data.total === null && fu.json.data.festivals.length === 9);
  const fuBad = await get('/depth/festival-uplift?districtId=9999');
  check('GET /depth/festival-uplift 400 on an unknown district', fuBad.status === 400);

  const ll = await get('/depth/lead-lag');
  check('GET /depth/lead-lag 200', ll.status === 200 && hasKeys(ll.json.data, ['months', 'maxLag', 'n', 'threshold', 'heads', 'pairs', 'leads', 'method']) && ll.json.data.months.length === 36);
  check('depth: lead-lag threshold is 2/√n', ll.json.data.n === 35 && ll.json.data.threshold === 0.338);
  check('depth: lead-lag every pair has a full lag ladder', ll.json.data.pairs.every((p) => p.lags.length === 7 && p.lags.every((l) => l.r === null || (l.r >= -1 && l.r <= 1))));
  const llBad = await get('/depth/lead-lag?maxLag=9');
  check('GET /depth/lead-lag 400 on maxLag above 6', llBad.status === 400);

  const id = await get('/depth/identity/P001');
  check('GET /depth/identity/:personKey 200', id.status === 200 && hasKeys(id.json.data, ['canonical', 'aliases', 'threshold', 'weights', 'formula', 'validation', 'scan']));
  check('depth: identity threshold comes from the bundled identity_metrics (0.92)', id.json.data.threshold === 0.92 && id.json.data.validation && id.json.data.validation.precision === 0.0321);
  const idBad = await get('/depth/identity/bad%20key');
  check('GET /depth/identity 400 on a malformed key', idBad.status === 400 && idBad.json.error.code === 'BAD_ID');
  const idMissing = await get('/depth/identity/NOPE');
  check('GET /depth/identity 404 on an unknown profile', idMissing.status === 404);

  const bm = await get('/depth/benchmarks');
  check('GET /depth/benchmarks 200 with the pipeline artefacts', bm.status === 200 && bm.json.data.forecastMetrics && bm.json.data.forecastMetrics.summary.series === 228 && bm.json.data.identityMetrics.threshold === 0.92);
  if (bm.json.data.recovery) {
    const r = bm.json.data.recovery;
    check('depth: recovery card carries the planted counts (6 hotspots, 4 anomalies, 200 offenders, 12 communities)',
      r.hotspots.planted === 6 && r.anomalies.planted === 4 && r.offenders.planted === 200 && r.communities.planted === 12
      && r.hotspots.recovered <= 6 && r.anomalies.recovered <= 4 && r.hotspots.rows.length === 6, JSON.stringify({ h: r.hotspots.recovered, a: r.anomalies.recovered, o: r.offenders.recovered, c: r.communities.recovered }));
  }
  if (bm.json.data.identitySweep) {
    const sw = bm.json.data.identitySweep;
    const p92 = sw.v1.points.find((p) => p.threshold === 0.92);
    check('depth: identity sweep reproduces the pipeline operating point at 0.92', p92 && p92.precision === 0.0321 && p92.recall === 0.5712, JSON.stringify(p92));
  }

  // Flags do not touch these endpoints: the same fixture answer with an AI flag on.
  const prevZia = process.env.FEATURE_ZIA;
  process.env.FEATURE_ZIA = 'on';
  try {
    await withApp(h, h.buildFixtureTables(), async (g) => {
      const r = await g('/depth/escalation');
      check('depth: FEATURE_ZIA=on leaves /depth/escalation deterministic and local', r.status === 200 && r.json.meta.source === 'local' && r.json.data.summary.transitions === 8);
    });
  } finally {
    if (prevZia === undefined) delete process.env.FEATURE_ZIA; else process.env.FEATURE_ZIA = prevZia;
  }

  // ---------------------------------------------------------------- custom scenario: near-repeat / Knox / zones
  {
    const t = h.buildFixtureTables();
    const mk = (id, date, lat, lng) => ({ CaseMasterID: id, CrimeNo: `1010110112026${String(id).padStart(5, '0')}`, CrimeRegisteredDate: date, PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: lat, longitude: lng });
    t.CaseMaster = [
      mk(1, '2026-06-01', 12.97, 77.59),          // A originator
      mk(2, '2026-06-03', 12.9702, 77.59),        // B repeat (22 m, 2 days)
      mk(3, '2026-06-10', 12.973, 77.59),         // C near-repeat (333 m, 9 days)
      mk(4, '2026-07-20', 13.5, 76.0),            // D isolated, latest date → open zone
      mk(5, '2026-06-30', 12.97, 77.59)           // E isolated (29 days after A)
    ];
    const pure = nearrepeat.classify(t.CaseMaster.map((r) => ({ id: String(r.CaseMasterID), day: common.parseDay(r.CrimeRegisteredDate), lat: r.latitude, lng: r.longitude })), { distM: 500, days: 14, sameM: 50 });
    check('depth: near-repeat pure classification A originator / B repeat / C near-repeat / D,E isolated',
      pure.tally.originator === 1 && pure.tally.repeat === 1 && pure.tally.nearRepeat === 1 && pure.tally.isolated === 2
      && pure.chainCount === 1 && pure.largestChain === 3 && pure.chains[0].originatorId === '1', JSON.stringify(pure.tally));
    await withApp(h, t, async (g) => {
      const r = await g('/depth/near-repeat?from=2026-05-01&to=2026-08-31&distM=500&days=14&sameM=50&perms=99');
      check('GET /depth/near-repeat custom scenario classification', r.status === 200 && r.json.data.classification.tally.originator === 1 && r.json.data.classification.tally.repeat === 1 && r.json.data.classification.tally.nearRepeat === 1 && r.json.data.classification.tally.isolated === 2, JSON.stringify(r.json.data && r.json.data.classification.tally));
      const kx = r.json.data.knox;
      check('depth: Knox observed 3 close pairs against 6×3/10 expected (ratio 1.67), permutation p in (0,1]', kx.n === 5 && kx.pairs === 10 && kx.spaceClose === 6 && kx.timeClose === 3 && kx.observed === 3 && kx.expected === 1.8 && kx.ratio === 1.67 && kx.pValue > 0 && kx.pValue <= 1 && kx.perms === 99, JSON.stringify(kx));
      const z = r.json.data.zones;
      // D is isolated -- no partner in either band -- so it casts no prediction
      // zone even though it is the newest case in scope, and A's chain zone
      // closed 40 days before the scope end. A near-repeat prediction zone is a
      // circle around a case that has actually repeated on.
      check('depth: an isolated case at the scope end casts no prediction zone, and the expired chain originator none either', z.asOf === '2026-07-20' && z.zones.length === 0, JSON.stringify(z));
    });
  }

  // ------------------------------------- prediction zones: originators only
  // P repeats on 6 days later, so P's band is still open at the scope end and P
  // casts a zone; R is the newest case in scope but isolated, so it does not.
  {
    const t = h.buildFixtureTables();
    const mk = (id, date, lat, lng) => ({ CaseMasterID: id, CrimeNo: `1010110112026${String(id).padStart(5, '0')}`, CrimeRegisteredDate: date, PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: lat, longitude: lng });
    t.CaseMaster = [
      mk(1, '2026-07-10', 12.97, 77.59),      // P originator
      mk(2, '2026-07-16', 12.9702, 77.59),    // Q repeat of P (22 m, 6 days)
      mk(3, '2026-07-20', 13.5, 76.0)         // R isolated, newest in scope
    ];
    await withApp(h, t, async (g) => {
      const r = await g('/depth/near-repeat?from=2026-06-01&to=2026-08-31&distM=500&days=14&sameM=50&perms=9');
      const d = r.json.data;
      const byId = new Map(d.classification.cases.map((c) => [String(c.id), c.cls]));
      check('depth: only the originator casts a zone -- the isolated newest case does not',
        r.status === 200 && d.zones.zones.length === 1 && d.zones.zones[0].caseId === '1'
        && byId.get('1') === 'originator' && byId.get('3') === 'isolated'
        && d.zones.zones[0].until === '2026-07-24' && d.zones.zones[0].daysLeft === 4, JSON.stringify({ zones: d.zones.zones, tally: d.classification.tally }));
      check('depth: every prediction zone belongs to an originator',
        d.zones.zones.every((z2) => byId.get(String(z2.caseId)) === 'originator'), JSON.stringify(d.zones.zones.map((z2) => byId.get(String(z2.caseId)))));
    });
  }

  // ---------------------------------------------------------------- custom scenario: hotspot trajectory classes
  {
    const t = h.buildFixtureTables();
    const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    const rows = [];
    let id = 1;
    const add = (ym, lat, lng, n) => { for (let k = 0; k < n; k += 1) rows.push({ CaseMasterID: id++, CrimeNo: `1${id}`, CrimeRegisteredDate: `${ym}-15`, PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: lat, longitude: lng }); };
    months.forEach((ym, m) => {
      for (let a = 0; a < 10; a += 1) for (let b = 0; b < 3; b += 1) add(ym, 12.80 + 0.036 * a, 77.40 + 0.0372 * b, 1); // background lattice, 1 case per cell
      add(ym, 13.15, 77.79, 15);                       // H: hot every month → persistent
      if (m === 5) add(ym, 12.99, 77.60, 30);          // N: hot only in the last month → new
      if (m <= 2) add(ym, 12.85, 77.70, 15);           // O: hot in months 1-3 only → historical
    });
    t.CaseMaster = rows;
    await withApp(h, t, async (g) => {
      const r = await g('/depth/hotspot-trajectory?from=2026-03-01&to=2026-08-31&months=6&cellKm=2');
      const tj = r.json.data.trajectory;
      const cls = Object.fromEntries(tj.classes.map((c) => [c.cls, c.cells]));
      check('depth: trajectory classes persistent / new / historical each found once, nothing else hot',
        r.status === 200 && cls.persistent === 1 && cls.new === 1 && cls.historical === 1 && cls.intensifying === 0 && cls.diminishing === 0 && cls.sporadic === 0 && cls.oscillating === 0 && cls.consecutive === 0 && tj.cellCount === 3, JSON.stringify(cls));
      const byCls = Object.fromEntries(tj.cells.map((c) => [c.cls, c]));
      check('depth: trajectory cell counts per month match the planted series', byCls.persistent && byCls.persistent.counts.join(',') === '15,15,15,15,15,15' && byCls.new.counts.join(',') === '0,0,0,0,0,30' && byCls.historical.counts.join(',') === '15,15,15,0,0,0', JSON.stringify(tj.cells.map((c) => [c.cls, c.counts])));
      check('depth: stability series has 5 month-to-month Jaccard values in [0.8, 1]', tj.stability.series.length === 5 && tj.stability.series.every((s) => s.jaccard >= 0.8 && s.jaccard <= 1) && tj.stability.mean >= 0.8, JSON.stringify(tj.stability));
      const ch = tj.twoPeriod.changes;
      check('depth: two-period comparison newHot 1 / persistentHot 1 / cooled 1', ch.newHot === 1 && ch.persistentHot === 1 && ch.cooled === 1 && ch.intensified === 0 && ch.weakened === 0 && tj.twoPeriod.periodA.cases === 180 && tj.twoPeriod.periodB.cases === 165, JSON.stringify(tj.twoPeriod));
    });
  }

  // ---------------------------------------------------------------- custom scenario: lead–lag pure shift
  {
    const t = h.buildFixtureTables();
    const months = [];
    for (let i = 35; i >= 0; i -= 1) months.push(ymAdd(NOW_YM, -i));
    const x = months.map((ym, i) => 20 + (hash32(`ll|${ym}|${i}`) % 17));
    t.AggMonthly = [];
    months.forEach((ym, i) => {
      t.AggMonthly.push({ Ym: ym, DistrictID: '0101', UnitID: '1011', CrimeHeadID: 3, CrimeSubHeadID: 305, CaseCount: x[i], HeinousCount: 0 });
      t.AggMonthly.push({ Ym: ym, DistrictID: '0101', UnitID: '1011', CrimeHeadID: 5, CrimeSubHeadID: 501, CaseCount: i === 0 ? 25 : x[i - 1], HeinousCount: 0 });
    });
    const pure = leadlag.leadLag([{ headId: 3, name: 'P', values: x }, { headId: 5, name: 'C', values: months.map((_, i) => (i === 0 ? 25 : x[i - 1])) }], months, 3);
    const lead = pure.pairs.find((p) => p.leader === 3 && p.follower === 5);
    check('depth: lead-lag pure function recovers the one-month shift with r = 1', lead && lead.bestLag === 1 && lead.bestR === 1 && lead.significant === true, JSON.stringify(lead));
    await withApp(h, t, async (g) => {
      const r = await g('/depth/lead-lag?districtId=0101');
      const top = r.json.data.leads[0];
      check('GET /depth/lead-lag custom shift: Property Crimes leads Cyber Crimes by 1 month', r.status === 200 && top && top.leader === 3 && top.follower === 5 && top.bestLag === 1 && top.bestR === 1, JSON.stringify(r.json.data && r.json.data.leads));
    });
  }

  // ---------------------------------------------------------------- custom scenario: festival uplift with a CI
  {
    const t = h.buildFixtureTables();
    const rows = [];
    let id = 1;
    const fill = (festivalDate, basePerDay, winPerDay) => {
      const w = festival.windowsFor(festivalDate);
      for (let d = w.baseFrom; d <= w.baseTo; d += 1) {
        const n = d >= w.winFrom && d <= w.winTo ? winPerDay : basePerDay;
        for (let k = 0; k < n; k += 1) rows.push({ CaseMasterID: id++, CrimeNo: `1${id}`, CrimeRegisteredDate: common.dayToIso(d), PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: 12.97, longitude: 77.59 });
      }
    };
    fill('2024-04-09', 2, 3); // Ugadi 2024: +50 %  (Ugadi windows never overlap another festival's ±31 days)
    fill('2026-03-19', 2, 4); // Ugadi 2026: +100 %
    t.CaseMaster = rows;
    const pure = festival.estimate(rows.map((r) => ({ date: r.CrimeRegisteredDate, headId: 3, count: 1 })), festival.FESTIVALS, [3]);
    check('depth: festival uplift pure estimate 75 % mean across two festivals (50 % and 100 %)', pure.heads.length === 1 && pure.heads[0].festivals === 2 && pure.heads[0].meanUpliftPct === 75
      && pure.heads[0].perFestival.map((f) => f.upliftPct).join(',') === '50,100' && pure.heads[0].ciLow < 0 && pure.heads[0].verdict === 'within-noise', JSON.stringify(pure.heads[0]));
    await withApp(h, t, async (g) => {
      const r = await g('/depth/festival-uplift');
      const hd = r.json.data.heads.find((x) => x.headId === 3);
      check('GET /depth/festival-uplift custom scenario via grouped ZCQL', r.status === 200 && r.json.data.scan.mode === 'grouped' && hd && hd.meanUpliftPct === 75 && hd.headName === 'Property Crimes' && r.json.data.total && r.json.data.total.meanUpliftPct === 75, JSON.stringify(r.json.data && { scan: r.json.data.scan, hd }));
    });
  }

  // -------------------------------------------- festival: overlapping windows
  // Dasara 2025-10-02 and Deepavali 2025-10-20 sit 18 days apart, so each
  // festival's +/-31-day fetch covers most of the other's. Concatenating the
  // two fetches double-counts every shared day (the 7-day window entirely, the
  // baseline only partly), which inflates the uplift. mergeDaily is what stops
  // that, and the endpoint must recover the planted rate exactly.
  {
    check('depth: mergeDaily keeps one row per (date, head) across fetches, taking the complete count',
      JSON.stringify(festival.mergeDaily([
        [{ date: '2025-10-02', headId: 3, count: 9 }, { date: '2025-10-03', headId: 3, count: 4 }],
        [{ date: '2025-10-02', headId: 3, count: 9 }, { date: '2025-10-02', headId: 5, count: 2 }],
        [{ date: '2025-10-02', headId: 3, count: 5 }]
      ]).sort((a, b) => a.headId - b.headId || a.date.localeCompare(b.date)))
      === JSON.stringify([{ date: '2025-10-02', headId: 3, count: 9 }, { date: '2025-10-03', headId: 3, count: 4 }, { date: '2025-10-02', headId: 5, count: 2 }]));
    check('depth: foldDaily sums per-case rows inside one fetch before the merge',
      JSON.stringify(festival.foldDaily([{ date: '2025-10-02', headId: 3, count: 1 }, { date: '2025-10-02', headId: 3, count: 1 }, { date: '2025-10-05', headId: 3, count: 1 }]))
      === JSON.stringify([{ date: '2025-10-02', headId: 3, count: 2 }, { date: '2025-10-05', headId: 3, count: 1 }]));

    const t2 = h.buildFixtureTables();
    const rows2 = [];
    let id2 = 500000;
    const both = ['2025-10-02', '2025-10-20'];
    const winDays = new Set();
    for (const f of both) { const w = festival.windowsFor(f); for (let d = w.winFrom; d <= w.winTo; d += 1) winDays.add(d); }
    const span = both.map((f) => festival.windowsFor(f));
    const from = Math.min(...span.map((w) => w.baseFrom));
    const to = Math.max(...span.map((w) => w.baseTo));
    for (let d = from; d <= to; d += 1) {
      const n = winDays.has(d) ? 6 : 4; // exactly +50 % inside every festival window
      for (let k = 0; k < n; k += 1) {
        rows2.push({ CaseMasterID: id2 += 1, CrimeNo: `1${id2}`, CrimeRegisteredDate: common.dayToIso(d), PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: 12.97, longitude: 77.59 });
      }
    }
    t2.CaseMaster = rows2;
    await withApp(h, t2, async (g) => {
      const r = await g('/depth/festival-uplift');
      const d = r.json.data;
      const hd = d.heads.find((x) => x.headId === 3);
      const per = hd ? hd.perFestival.filter((f) => both.includes(f.date)) : [];
      check('depth: overlapping Dasara / Deepavali windows are de-duplicated — both recover the planted +50 %, not an inflated figure',
        r.status === 200 && per.length === 2 && per.every((f) => f.upliftPct === 50), JSON.stringify(per));
      check('depth: the festival scan reports how many fetched rows the overlap duplicated',
        d.scan.overlapRows > 0 && d.scan.dailyRows + d.scan.overlapRows === d.scan.fetchedRows, JSON.stringify(d.scan));
    });
  }

  // ---------------------------------------------------------------- custom scenario: identity why-linked components
  {
    const t = h.buildFixtureTables();
    t.Accused = [
      { AccusedMasterID: 1, CaseMasterID: 1, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A1' },
      { AccusedMasterID: 2, CaseMasterID: 1, AccusedName: 'Manjunath Shetty', AgeYear: 33, GenderID: 1, PersonID: 'A2' },
      { AccusedMasterID: 3, CaseMasterID: 4, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A1' },
      { AccusedMasterID: 4, CaseMasterID: 2, AccusedName: 'Ravi Kumar B', AgeYear: 30, GenderID: 1, PersonID: 'A1' },
      { AccusedMasterID: 5, CaseMasterID: 4, AccusedName: 'R Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A2' },
      { AccusedMasterID: 6, CaseMasterID: 2, AccusedName: 'Kumar Ravi', AgeYear: 30, GenderID: 1, PersonID: 'A2' }
    ];
    await withApp(h, t, async (g) => {
      const r = await g('/depth/identity/P001');
      const d = r.json.data;
      const byAlias = Object.fromEntries((d.aliases || []).map((a) => [a.alias, a]));
      check('depth: identity canonical anchor (median age 29, districts 103 + 111)', r.status === 200 && d.canonicalMedianAge === 29 && d.canonicalDistricts.join(',') === '103,111' && d.canonicalRecords === 2, JSON.stringify({ age: d.canonicalMedianAge, dist: d.canonicalDistricts }));
      const rk = byAlias['R Kumar'];
      check('depth: identity "R Kumar" = 0.6·0.8235 + 0.2·1 + 0.2·1 = 0.8941 → candidate', rk && rk.components.tokenSortRatio === 0.8235 && rk.components.ageCloseness === 1 && rk.components.districtOverlap === 1 && rk.score === 0.8941 && rk.verdict === 'candidate', JSON.stringify(rk));
      const rkb = byAlias['Ravi Kumar B'];
      check('depth: identity "Ravi Kumar B" = 0.6·0.9091 + 0.2·0.8 + 0 = 0.7055 (other district)', rkb && rkb.components.ageDelta === 1 && rkb.components.districtOverlap === 0 && rkb.score === 0.7055 && rkb.verdict === 'candidate', JSON.stringify(rkb));
      const kr = byAlias['Kumar Ravi'];
      check('depth: identity "Kumar Ravi" passes the exact-name anchor (ts 1, Δage 1) despite a 0.76 score', kr && kr.components.tokenSortRatio === 1 && kr.score === 0.76 && kr.anchorPass === true && kr.aboveThreshold === true && kr.verdict === 'exact-anchor', JSON.stringify(kr));
      check('depth: identity rows are ranked by score', d.aliases[0].alias === 'R Kumar' && d.aliases[1].alias === 'Kumar Ravi' && d.aliases[2].alias === 'Ravi Kumar B');
      check('depth: the card reports the pipeline gates it applies (token-sort cutoff 0.6, block age 2 years)',
        d.gates && d.gates.tokenSortCutoff === 0.6 && d.gates.blockAgeYears === 2 && /out of block/i.test(d.formula), JSON.stringify(d.gates));
    });
  }

  // ---------------------------------------- identity: the pipeline's own gates
  // The pipeline scores a pair only inside a phonetic block walked in age
  // order, with token_sort_ratio(score_cutoff=60) and a 2-year age window
  // (analytics.py resolve_identities). A name it could never have compared must
  // not be shown as linked here.
  {
    const t = h.buildFixtureTables();
    t.Accused = [
      { AccusedMasterID: 1, CaseMasterID: 1, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A1' },
      { AccusedMasterID: 2, CaseMasterID: 4, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 1, PersonID: 'A1' },
      // same sorted name, 9 years apart -- outside the pipeline's age block
      { AccusedMasterID: 3, CaseMasterID: 2, AccusedName: 'Kumar Ravi', AgeYear: 38, GenderID: 1, PersonID: 'A2' },
      // nothing like the canonical name -- below the 0.60 token-sort cutoff
      { AccusedMasterID: 4, CaseMasterID: 2, AccusedName: 'Shivanna Bhat', AgeYear: 29, GenderID: 1, PersonID: 'A2' },
      // no age at all -- the pipeline never blocks the row
      { AccusedMasterID: 5, CaseMasterID: 4, AccusedName: 'R Kumar', AgeYear: null, GenderID: 1, PersonID: 'A2' }
    ];
    await withApp(h, t, async (g) => {
      const r = await g('/depth/identity/P001');
      const d = r.json.data;
      const by = Object.fromEntries((d.aliases || []).map((a) => [a.alias, a]));
      check('depth: a 9-year age gap is out of the pipeline block, never "linked"',
        by['Kumar Ravi'] && by['Kumar Ravi'].blockedBy === 'age-gap' && by['Kumar Ravi'].verdict === 'out-of-block' && by['Kumar Ravi'].aboveThreshold === false, JSON.stringify(by['Kumar Ravi']));
      check('depth: a name under the 0.60 token-sort cutoff scores 0 on the name component, as the pipeline does',
        by['Shivanna Bhat'] && by['Shivanna Bhat'].components.tokenSortRatio === 0 && by['Shivanna Bhat'].components.tokenSortRaw > 0 && by['Shivanna Bhat'].blockedBy === 'name-below-cutoff', JSON.stringify(by['Shivanna Bhat']));
      check('depth: a row with no age is out of block, not scored as a link',
        by['R Kumar'] && by['R Kumar'].blockedBy === 'age-missing' && by['R Kumar'].verdict === 'out-of-block', JSON.stringify(by['R Kumar']));
      check('depth: the panel counts how many names are out of block', d.outOfBlock === 4, String(d.outOfBlock));
    });
  }

  // ---------------------------------------------------------------- custom scenario: pair re-activation
  {
    const t = h.buildFixtureTables();
    const mk = (id, date) => ({ CaseMasterID: id, CrimeNo: `1${id}`, CrimeRegisteredDate: date, PoliceStationID: '1011', CrimeMajorHeadID: 3, CrimeMinorHeadID: 305, GravityOffenceID: 2, CaseStatusID: 1, latitude: 12.97, longitude: 77.59 });
    t.CaseMaster.push(mk(101, '2024-01-10'), mk(102, '2024-02-10'), mk(103, `${NOW_YM}-03`), mk(104, '2024-03-01'), mk(105, '2024-04-01'));
    t.NetworkEdge.push(
      { PersonKeyA: 'Q1', PersonKeyB: 'Q2', Weight: 3, CaseIDsJson: '[101,102,103]', CommunityID: null },
      { PersonKeyA: 'Q3', PersonKeyB: 'Q4', Weight: 2, CaseIDsJson: '[104,105]', CommunityID: null }
    );
    for (const k of ['Q1', 'Q2', 'Q3', 'Q4']) {
      t.OffenderProfile.push({ PersonKey: k, CanonicalName: `Person ${k}`, AliasesJson: '[]', CaseCount: 3, DistrictsJson: '["0101"]', FirstSeen: '2024-01-10', LastSeen: `${NOW_YM}-03`, MOTagsJson: '[]', CommunityID: null, DegreeCentrality: 0.1, RiskScore: 95 });
    }
    await withApp(h, t, async (g) => {
      const r = await g('/depth/reactivation');
      const s = r.json.data.summary;
      const p = r.json.data.pairs[0];
      check('depth: reactivation detects Q1–Q2 after a ≥ 12-month quiet spell and counts Q3–Q4 as dormant now',
        r.status === 200 && s.reactivated === 1 && s.dormantNow === 1 && p && p.a === 'Q1' && p.b === 'Q2' && p.dormantDays >= 800 && p.quietFrom === '2024-02-10' && p.casesSince === 1, JSON.stringify({ s, p }));
    });
  }
}
