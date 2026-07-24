'use strict';
// Deterministic NL copilot: intent grammar over (metric, crimeHead, district,
// timeRange, groupBy) -> ZCQL -> templated answer + optional chart payload.
// Shape per CONTRACTS: {answer, chart?, zcql?, engine}.

const { DISTRICTS, CRIME_SUBHEADS, subHeadById } = require('./constants');
const { ymOf, ymAdd, ymRange, toNum, round, pctDelta, fmtInt } = require('./util');

// --- vocabulary -------------------------------------------------------------

const CRIME_PHRASES = [];
for (const s of CRIME_SUBHEADS) CRIME_PHRASES.push({ phrase: s.name.toLowerCase(), subHeadId: s.id });
const EXTRA_CRIME = [
  ['two-wheeler theft', { subHeadId: 306 }], ['bike theft', { subHeadId: 306 }],
  ['house burglary', { subHeadId: 303 }], ['housebreaking', { subHeadId: 303 }],
  ['burglary', { subHeadId: 303 }], ['hb night', { subHeadId: 303 }], ['hb day', { subHeadId: 304 }],
  ['otp fraud', { subHeadId: 501 }], ['social media offence', { subHeadId: 503 }],
  ['cruelty', { subHeadId: 202 }],
  ['crimes against body', { headId: 1 }], ['crimes against women', { headId: 2 }],
  ['property crimes', { headId: 3 }], ['property crime', { headId: 3 }], ['property', { headId: 3 }],
  ['economic offences', { headId: 4 }], ['economic offence', { headId: 4 }],
  ['cyber crimes', { headId: 5 }], ['cyber crime', { headId: 5 }], ['cyber', { headId: 5 }],
  ['public order', { headId: 6 }], ['narcotics', { headId: 7 }], ['ndps', { headId: 7 }], ['drugs', { headId: 7 }]
];
for (const [phrase, tag] of EXTRA_CRIME) CRIME_PHRASES.push(Object.assign({ phrase }, tag));
CRIME_PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);

const DISTRICT_PHRASES = [];
for (const d of DISTRICTS) DISTRICT_PHRASES.push({ phrase: d.name.toLowerCase(), id: d.id });
const BARE_ALIASES = [
  ['bengaluru', '0101'], ['bangalore', '0101'], ['mysuru', '0103'], ['mysore', '0103'],
  ['mangaluru', '0105'], ['mangalore', '0105'], ['hubballi-dharwad', '0107'], ['hubballi', '0107'],
  ['hubli', '0107'], ['dharwad', '0108'], ['belagavi', '0109'], ['belgaum', '0109'], ['gulbarga', '0111']
];
for (const [phrase, id] of BARE_ALIASES) DISTRICT_PHRASES.push({ phrase, id });
DISTRICT_PHRASES.sort((a, b) => b.phrase.length - a.phrase.length);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --- parser -----------------------------------------------------------------

function parse(text, now) {
  const nowYm = ymOf(now);
  const t = ` ${String(text || '').toLowerCase().replace(/[?.!,;:]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const intent = {
    kind: null, n: 5, districtId: null, headId: null, subHeadId: null,
    fromYm: ymAdd(nowYm, -11), toYm: nowYm, years: null, rangeText: 'last 12 months'
  };

  for (const c of CRIME_PHRASES) {
    if (t.includes(` ${c.phrase}`) || t.includes(`${c.phrase} `) || t.includes(c.phrase)) {
      if (c.subHeadId) { intent.subHeadId = c.subHeadId; intent.headId = subHeadById.get(c.subHeadId).headId; }
      else intent.headId = c.headId;
      break;
    }
  }
  for (const d of DISTRICT_PHRASES) {
    if (t.includes(d.phrase)) { intent.districtId = d.id; break; }
  }

  const vs = t.match(/\b(20\d{2})\s*(?:vs\.?|versus|v\/s|and)\s*(20\d{2})\b/);
  const lastN = t.match(/last\s+(\d+)\s+months?/);
  if (vs) {
    intent.years = [Number(vs[1]), Number(vs[2])];
    intent.rangeText = `${vs[1]} vs ${vs[2]}`;
  } else if (lastN) {
    const n = Math.max(1, Math.min(60, Number(lastN[1])));
    intent.fromYm = ymAdd(nowYm, -(n - 1));
    intent.rangeText = `last ${n} months`;
  } else if (t.includes('last month')) {
    intent.fromYm = ymAdd(nowYm, -1); intent.toYm = ymAdd(nowYm, -1); intent.rangeText = 'last month';
  } else if (t.includes('this month')) {
    intent.fromYm = nowYm; intent.rangeText = 'this month';
  } else if (t.includes('this year')) {
    intent.fromYm = `${nowYm.slice(0, 4)}-01`; intent.rangeText = `${nowYm.slice(0, 4)} year-to-date`;
  } else if (t.includes('last year')) {
    const y = Number(nowYm.slice(0, 4)) - 1;
    intent.fromYm = `${y}-01`; intent.toYm = `${y}-12`; intent.rangeText = String(y);
  } else {
    const yr = t.match(/\bin\s+(20\d{2})\b/) || t.match(/\b(20\d{2})\b/);
    if (yr) { intent.fromYm = `${yr[1]}-01`; intent.toYm = `${yr[1]}-12`; intent.rangeText = yr[1]; }
  }

  const top = t.match(/top\s+(\d+)?\s*(districts?|stations?|crime heads?|heads?|sub ?heads?|repeat offenders?|offenders?)/);
  if (top) {
    intent.n = top[1] ? Math.max(1, Math.min(20, Number(top[1]))) : 5;
    const target = top[2];
    if (target.startsWith('district')) intent.kind = 'topDistricts';
    else if (target.startsWith('station')) intent.kind = 'risk';
    else if (target.includes('head')) intent.kind = 'topHeads';
    else intent.kind = 'offenders';
  } else if (intent.years || t.includes('compare')) intent.kind = 'compareYears';
  else if (t.includes('risk')) intent.kind = 'risk';
  else if (t.includes('forecast') || t.includes('predict')) intent.kind = 'forecast';
  else if (t.includes('alert')) intent.kind = 'alerts';
  else if (t.includes('hotspot')) intent.kind = 'hotspots';
  else if (t.includes('offender')) intent.kind = 'offenders';
  else if (t.includes('detection rate')) intent.kind = 'detectionRate';
  else if (t.includes('seasonalit') || t.includes('seasonal')) intent.kind = 'seasonality';
  else if (t.includes('total fir') || t.includes('how many fir')) intent.kind = 'totalFirs';
  else intent.kind = 'trend';
  return intent;
}

// --- execution --------------------------------------------------------------

function crimeWhere(intent, opts) {
  const w = [];
  const o = opts || {};
  if (!o.noTime) {
    w.push({ col: 'Ym', op: '>=', val: intent.fromYm });
    w.push({ col: 'Ym', op: '<=', val: intent.toYm });
  }
  if (intent.subHeadId) w.push({ col: 'CrimeSubHeadID', op: '=', val: intent.subHeadId });
  else if (intent.headId) w.push({ col: 'CrimeHeadID', op: '=', val: intent.headId });
  if (!o.noDistrict && intent.districtId) w.push({ col: 'DistrictID', op: '=', val: intent.districtId });
  return w;
}

function crimeLabel(intent, lk) {
  if (intent.subHeadId) return lk.subHeadName(intent.subHeadId);
  if (intent.headId) return lk.headName(intent.headId);
  return 'All crimes';
}

function placeLabel(intent, lk) {
  return intent.districtId ? lk.districtName(intent.districtId) : 'Karnataka';
}

async function runTrend(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
    where: crimeWhere(intent), groupBy: ['Ym'], orderBy: { col: 'Ym' }
  };
  const rows = await ds.query(q);
  const byYm = new Map(rows.map((r) => [r.Ym, toNum(r['SUM(CaseCount)'])]));
  const months = ymRange(intent.fromYm, intent.toYm);
  const data = months.map((m) => byYm.get(m) || 0);
  const total = data.reduce((s, n) => s + n, 0);
  let peakIdx = 0;
  data.forEach((v, i) => { if (v > data[peakIdx]) peakIdx = i; });
  const label = crimeLabel(intent, lk);
  const place = placeLabel(intent, lk);
  let answer = `${label} in ${place}, ${intent.rangeText}: ${fmtInt(total)} cases registered.`;
  if (months.length > 1 && total > 0) {
    answer += ` Peak month was ${months[peakIdx]} with ${fmtInt(data[peakIdx])} cases.`;
    if (months.length >= 2) {
      const d = pctDelta(data[data.length - 1], data[data.length - 2]);
      answer += ` Latest month is ${d >= 0 ? 'up' : 'down'} ${Math.abs(d)}% month-on-month.`;
    }
  }
  return {
    answer,
    chart: months.length > 1 ? {
      type: 'line', title: `${label} — ${place} (${intent.rangeText})`,
      categories: months, series: [{ name: label, data }]
    } : undefined,
    zcql: ds.buildZCQL(q)
  };
}

async function runTopDistricts(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
    where: crimeWhere(intent, { noDistrict: true }), groupBy: ['DistrictID'],
    orderBy: { col: 'SUM(CaseCount)', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const label = crimeLabel(intent, lk);
  const items = rows.map((r) => ({ name: lk.districtName(r.DistrictID), count: toNum(r['SUM(CaseCount)']) }));
  const answer = items.length
    ? `Top ${items.length} districts for ${label} (${intent.rangeText}): ${items.map((i, ix) => `${ix + 1}. ${i.name} (${fmtInt(i.count)})`).join(', ')}.`
    : `No ${label} cases found for ${intent.rangeText}.`;
  return {
    answer,
    chart: { type: 'bar', title: `Top districts — ${label}`, categories: items.map((i) => i.name), series: [{ name: 'Cases', data: items.map((i) => i.count) }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runTopHeads(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'AggMonthly', columns: ['CrimeHeadID', 'SUM(CaseCount)'],
    where: [{ col: 'Ym', op: '>=', val: intent.fromYm }, { col: 'Ym', op: '<=', val: intent.toYm }]
      .concat(intent.districtId ? [{ col: 'DistrictID', op: '=', val: intent.districtId }] : []),
    groupBy: ['CrimeHeadID'], orderBy: { col: 'SUM(CaseCount)', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const items = rows.map((r) => ({ name: lk.headName(r.CrimeHeadID), count: toNum(r['SUM(CaseCount)']) }));
  const answer = items.length
    ? `Top ${items.length} crime heads in ${placeLabel(intent, deps.lk)} (${intent.rangeText}): ${items.map((i, ix) => `${ix + 1}. ${i.name} (${fmtInt(i.count)})`).join(', ')}.`
    : `No cases found in ${placeLabel(intent, deps.lk)} for ${intent.rangeText}.`;
  return {
    answer,
    chart: { type: 'pie', title: `Crime heads — ${placeLabel(intent, deps.lk)}`, categories: items.map((i) => i.name), series: [{ name: 'Cases', data: items.map((i) => i.count) }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runCompareYears(intent, deps) {
  const { ds, lk } = deps;
  const nowY = Number(intent.toYm.slice(0, 4));
  const years = intent.years || [nowY - 1, nowY];
  const sums = [];
  let lastSql = '';
  for (const y of years) {
    const q = {
      table: 'AggMonthly', columns: ['SUM(CaseCount)'],
      where: [{ col: 'Ym', op: '>=', val: `${y}-01` }, { col: 'Ym', op: '<=', val: `${y}-12` }]
        .concat(intent.subHeadId ? [{ col: 'CrimeSubHeadID', op: '=', val: intent.subHeadId }]
          : intent.headId ? [{ col: 'CrimeHeadID', op: '=', val: intent.headId }] : [])
        .concat(intent.districtId ? [{ col: 'DistrictID', op: '=', val: intent.districtId }] : [])
    };
    lastSql = ds.buildZCQL(q);
    const rows = await ds.query(q);
    sums.push(toNum(rows.length ? rows[0]['SUM(CaseCount)'] : 0));
  }
  const label = crimeLabel(intent, lk);
  const place = placeLabel(intent, lk);
  const d = pctDelta(sums[1], sums[0]);
  const dir = d > 0 ? `up ${d}%` : d < 0 ? `down ${Math.abs(d)}%` : 'flat';
  const answer = `${label} in ${place}: ${fmtInt(sums[0])} cases in ${years[0]} vs ${fmtInt(sums[1])} in ${years[1]} — ${dir} year-on-year.`;
  return {
    answer,
    chart: { type: 'bar', title: `${label} — ${place}: ${years[0]} vs ${years[1]}`, categories: years.map(String), series: [{ name: label, data: sums }] },
    zcql: lastSql
  };
}

async function runRisk(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'StationRisk', columns: ['UnitID', 'RiskScore', 'DriversJson'],
    orderBy: { col: 'RiskScore', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const items = rows.map((r) => {
    const unit = lk.unitById.get(String(r.UnitID));
    let drivers = [];
    try { drivers = JSON.parse(r.DriversJson || '[]'); } catch (e) { drivers = []; }
    return { name: unit ? unit.unitName : `Unit ${r.UnitID}`, score: round(toNum(r.RiskScore), 1), drivers };
  });
  const answer = items.length
    ? `Highest-risk stations for the next 30 days: ${items.map((i, ix) => `${ix + 1}. ${i.name} (risk ${i.score})`).join(', ')}. Top driver at ${items[0].name}: ${items[0].drivers[0] || 'rising case trend'}.`
    : 'No station risk scores are available yet — run the analytics pass first.';
  return {
    answer,
    chart: items.length ? { type: 'bar', title: 'Station risk — next 30 days', categories: items.map((i) => i.name), series: [{ name: 'Risk score', data: items.map((i) => i.score) }] } : undefined,
    zcql: ds.buildZCQL(q)
  };
}

async function runDetectionRate(intent, deps) {
  const { ds } = deps;
  const q = { table: 'ChargesheetDetails', columns: ['cstype', 'COUNT(CSID)'], groupBy: ['cstype'] };
  const rows = await ds.query(q);
  const byType = {};
  for (const r of rows) byType[String(r.cstype).toUpperCase()] = toNum(r['COUNT(CSID)']);
  const a = byType.A || 0;
  const c = byType.C || 0;
  const rate = a + c > 0 ? round((a / (a + c)) * 100, 1) : 0;
  const answer = `Detection rate (A-final / (A+C-final) chargesheets) stands at ${rate}% — ${fmtInt(a)} detected vs ${fmtInt(c)} undetected chargesheets.`;
  return {
    answer,
    chart: { type: 'pie', title: 'Chargesheet outcomes', categories: ['Detected (A)', 'Undetected (C)'], series: [{ name: 'Chargesheets', data: [a, c] }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runAlerts(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'AnomalyAlert', columns: ['AlertID', 'DistrictID', 'CrimeHeadID', 'ZScore', 'Severity', 'Narrative'],
    where: [{ col: 'Status', op: '=', val: 'OPEN' }], orderBy: { col: 'ZScore', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const answer = rows.length
    ? `${rows.length} active anomaly alert${rows.length > 1 ? 's' : ''}: ${rows.map((r) => `${lk.headName(r.CrimeHeadID)} in ${lk.districtName(r.DistrictID)} (z=${round(toNum(r.ZScore), 1)}, severity ${r.Severity})`).join('; ')}.`
    : 'No active anomaly alerts right now — all districts are tracking within expected ranges.';
  return { answer, zcql: ds.buildZCQL(q) };
}

async function runHotspots(intent, deps) {
  const { ds, lk } = deps;
  const where = intent.districtId ? [{ col: 'DistrictID', op: '=', val: intent.districtId }] : [];
  const q = {
    table: 'HotspotCluster', columns: ['ClusterID', 'Label', 'Intensity', 'CaseCount', 'DistrictID'],
    where, orderBy: { col: 'Intensity', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const answer = rows.length
    ? `Top hotspot${rows.length > 1 ? 's' : ''} in ${placeLabel(intent, lk)}: ${rows.map((r) => `${r.Label} (intensity ${round(toNum(r.Intensity), 0)}, ${fmtInt(r.CaseCount)} cases)`).join('; ')}.`
    : `No active hotspot clusters in ${placeLabel(intent, lk)} for the trailing window.`;
  return { answer, zcql: ds.buildZCQL(q) };
}

async function runOffenders(intent, deps) {
  const { ds } = deps;
  const q = {
    table: 'OffenderProfile', columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'RiskScore', 'DistrictsJson'],
    where: [{ col: 'CaseCount', op: '>=', val: 3 }], orderBy: { col: 'RiskScore', desc: true }, limit: { count: intent.n }
  };
  const rows = await ds.query(q);
  const answer = rows.length
    ? `Top repeat offenders by risk: ${rows.map((r, ix) => `${ix + 1}. ${r.CanonicalName} (${fmtInt(r.CaseCount)} linked cases, risk ${round(toNum(r.RiskScore), 1)})`).join('; ')}.`
    : 'No resolved repeat offenders found — identity resolution output is not loaded yet.';
  return { answer, zcql: ds.buildZCQL(q) };
}

async function runForecast(intent, deps) {
  const { ds, lk } = deps;
  const districtId = intent.districtId || '0101';
  const headId = intent.headId || 3;
  const q = {
    table: 'ForecastMonthly', columns: ['Ym', 'Actual', 'Predicted', 'Lo', 'Hi', 'Model'],
    where: [{ col: 'DistrictID', op: '=', val: districtId }, { col: 'CrimeHeadID', op: '=', val: headId }],
    orderBy: { col: 'Ym' }
  };
  const rows = await ds.query(q);
  const future = rows.filter((r) => (r.Actual === null || r.Actual === undefined || r.Actual === '') && r.Predicted !== null && r.Predicted !== undefined && r.Predicted !== '');
  const label = lk.headName(headId);
  const place = lk.districtName(districtId);
  let answer;
  if (future.length) {
    const next = future[0];
    answer = `Forecast for ${label} in ${place}: ${fmtInt(next.Predicted)} cases expected in ${next.Ym} (80% CI ${fmtInt(next.Lo)}–${fmtInt(next.Hi)}), model ${next.Model || 'Holt-Winters'}. ${future.length} month horizon available.`;
  } else {
    answer = `No forecast rows are loaded for ${label} in ${place} yet — run the analytics pass to populate ForecastMonthly.`;
  }
  return {
    answer,
    chart: future.length ? {
      type: 'line', title: `Forecast — ${label}, ${place}`,
      categories: future.map((r) => r.Ym), series: [{ name: 'Predicted', data: future.map((r) => toNum(r.Predicted)) }]
    } : undefined,
    zcql: ds.buildZCQL(q)
  };
}

async function runSeasonality(intent, deps) {
  const { ds, lk } = deps;
  const q = {
    table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
    where: crimeWhere(intent, { noTime: true }), groupBy: ['Ym'], orderBy: { col: 'Ym' }
  };
  const rows = await ds.query(q);
  const byMonth = new Array(12).fill(0);
  for (const r of rows) {
    const m = Number(String(r.Ym).slice(5, 7)) - 1;
    if (m >= 0 && m < 12) byMonth[m] += toNum(r['SUM(CaseCount)']);
  }
  const peak = byMonth.indexOf(Math.max(...byMonth));
  const trough = byMonth.indexOf(Math.min(...byMonth));
  const label = crimeLabel(intent, lk);
  const answer = byMonth.some((v) => v > 0)
    ? `${label} seasonality across all loaded years: peak in ${MONTH_NAMES[peak]} (${fmtInt(byMonth[peak])} cases), lowest in ${MONTH_NAMES[trough]} (${fmtInt(byMonth[trough])}). Festival windows (Dasara, Deepavali) typically lift street crime.`
    : `No historical data available to compute seasonality for ${label}.`;
  return {
    answer,
    chart: { type: 'bar', title: `Seasonality — ${label}`, categories: MONTH_NAMES, series: [{ name: 'Cases', data: byMonth }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runTotalFirs(intent, deps) {
  const { ds, lk } = deps;
  const q = { table: 'AggMonthly', columns: ['SUM(CaseCount)'], where: crimeWhere(intent) };
  const rows = await ds.query(q);
  const total = toNum(rows.length ? rows[0]['SUM(CaseCount)'] : 0);
  const answer = `${fmtInt(total)} FIRs were registered in ${placeLabel(intent, lk)} (${intent.rangeText}).`;
  return { answer, zcql: ds.buildZCQL(q) };
}

const RUNNERS = {
  trend: runTrend,
  topDistricts: runTopDistricts,
  topHeads: runTopHeads,
  compareYears: runCompareYears,
  risk: runRisk,
  detectionRate: runDetectionRate,
  alerts: runAlerts,
  hotspots: runHotspots,
  offenders: runOffenders,
  forecast: runForecast,
  seasonality: runSeasonality,
  totalFirs: runTotalFirs
};

/**
 * Answer a natural-language query deterministically.
 * deps = { ds, lk (lookups), now? }
 */
async function answer(text, deps) {
  const intent = parse(text, deps.now);
  const runner = RUNNERS[intent.kind] || runTrend;
  const result = await runner(intent, deps);
  return Object.assign({ engine: 'deterministic', intent: intent.kind }, result);
}

// Canned utterances that MUST work (smoke-tested; master spec §6 + our grammar).
const CANNED_UTTERANCES = [
  'chain snatching in Mysuru City last 3 months',
  'top 5 districts for vehicle theft this year',
  'compare murders 2024 vs 2025 in Belagavi',
  'which stations are highest risk next month?',
  'monthly trend of cyber crimes in Bengaluru City last 12 months',
  'total FIRs last month',
  'what is the detection rate this year?',
  'top 3 crime heads in Kalaburagi last 6 months',
  'show active alerts',
  'hotspots in Bengaluru City',
  'top repeat offenders',
  'forecast for property crimes in Mysuru City',
  'murders in Karnataka this year',
  'robbery trend in Hubballi-Dharwad City last 6 months',
  'seasonality of house burglary',
  'compare cheating 2025 vs 2026 in Bengaluru City'
];

module.exports = { parse, answer, CANNED_UTTERANCES };
