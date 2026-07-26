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

/** All district mentions in text order, longest phrase wins overlapping spans
 * (so "hubballi-dharwad city" never double-counts as Dharwad District too). */
function findDistricts(t) {
  const spans = [];
  const found = [];
  for (const d of DISTRICT_PHRASES) {
    let idx = t.indexOf(d.phrase);
    while (idx !== -1) {
      const end = idx + d.phrase.length;
      if (!spans.some(([s, e]) => idx < e && end > s)) {
        spans.push([idx, end]);
        found.push({ id: d.id, at: idx });
      }
      idx = t.indexOf(d.phrase, idx + 1);
    }
  }
  found.sort((a, b) => a.at - b.at);
  const ids = [];
  for (const f of found) if (!ids.includes(f.id)) ids.push(f.id);
  return ids;
}

// Time-of-day bands for hotspot questions ("hotspots at night").
const HOUR_BANDS = [
  [/\bnight-?time\b|\bnight\b/, { start: 21, end: 5, label: 'night (21:00–05:00)' }],
  [/\bevening\b/, { start: 17, end: 21, label: 'evening (17:00–21:00)' }],
  [/\bmorning\b/, { start: 5, end: 12, label: 'morning (05:00–12:00)' }],
  [/\bafternoon\b/, { start: 12, end: 17, label: 'afternoon (12:00–17:00)' }]
];

/**
 * Clock hours covered by the band [start, end) — HALF-OPEN, because that is
 * what an hour band means: a cluster labelled 19:00–21:00 is active at 19 and
 * 20 and is over by 21. Treating the end hour as covered made every evening
 * cluster collide with night on hour 21, so "hotspots at night" answered with a
 * 19:00–21:00 cluster. Wraps past midnight (21→5 gives 21,22,23,0,1,2,3,4).
 * A zero-width band (start === end) covers nothing.
 */
function hoursIn(start, end) {
  const out = new Set();
  // Round before stepping. The loop advances by whole hours and exits on
  // equality, so a fractional bound (toNum lets "12.5" through — it only
  // screens NaN and Infinity) would step 12.5, 13.5, … and never reach an
  // integral stop. That is a hung function, which is worse than a wrong answer.
  const from = ((Math.round(start) % 24) + 24) % 24;
  const stop = ((Math.round(end) % 24) + 24) % 24;
  let h = from;
  while (h !== stop) {
    out.add(h);
    h = (h + 1) % 24;
  }
  return out;
}

function hourBandsOverlap(aStart, aEnd, bStart, bEnd) {
  const a = hoursIn(aStart, aEnd);
  for (const h of hoursIn(bStart, bEnd)) if (a.has(h)) return true;
  return false;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_LOOKUP = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};
const MONTH_ALT = Object.keys(MONTH_LOOKUP).sort((a, b) => b.length - a.length).join('|');
// 'in March [2025]' (preposition-gated so bare 'may' in prose doesn't trip) or 'March 2025'.
const MONTH_PREP_RE = new RegExp(`\\b(?:in|for|during)\\s+(${MONTH_ALT})\\b\\s*(20\\d{2})?`);
const MONTH_YEAR_RE = new RegExp(`\\b(${MONTH_ALT})\\s+(20\\d{2})\\b`);

/** 'in March' / 'March 2025' -> single-month window. Yearless months resolve
 * to the most recent occurrence not in the future. */
function matchMonth(t, nowYm) {
  const m = t.match(MONTH_PREP_RE) || t.match(MONTH_YEAR_RE);
  if (!m) return null;
  const mon = MONTH_LOOKUP[m[1]];
  let year = m[2] ? Number(m[2]) : Number(nowYm.slice(0, 4));
  let ym = `${year}-${String(mon).padStart(2, '0')}`;
  if (!m[2] && ym > nowYm) {
    year -= 1;
    ym = `${year}-${String(mon).padStart(2, '0')}`;
  }
  return { ym, label: `${MONTH_NAMES[mon - 1]} ${year}` };
}

// --- parser -----------------------------------------------------------------

function parse(text, now) {
  const nowYm = ymOf(now);
  const t = ` ${String(text || '').toLowerCase().replace(/[?.!,;:]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const intent = {
    kind: null, n: 5, districtId: null, districtId2: null, headId: null, subHeadId: null,
    hourBand: null,
    fromYm: ymAdd(nowYm, -11), toYm: nowYm, years: null, rangeText: 'last 12 months'
  };

  let crimeHit = false;
  for (const c of CRIME_PHRASES) {
    if (t.includes(` ${c.phrase}`) || t.includes(`${c.phrase} `) || t.includes(c.phrase)) {
      if (c.subHeadId) { intent.subHeadId = c.subHeadId; intent.headId = subHeadById.get(c.subHeadId).headId; }
      else intent.headId = c.headId;
      crimeHit = true;
      break;
    }
  }
  const districtIds = findDistricts(t);
  intent.districtId = districtIds[0] || null;
  intent.districtId2 = districtIds[1] || null;
  for (const [re, band] of HOUR_BANDS) {
    if (re.test(t)) { intent.hourBand = band; break; }
  }

  let timeHit = true;
  const vs = t.match(/\b(20\d{2})\s*(?:vs\.?|versus|v\/s|and)\s*(20\d{2})\b/);
  const lastN = t.match(/last\s+(\d+)\s+months?/);
  const monthHit = matchMonth(t, nowYm);
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
  } else if (monthHit) {
    intent.fromYm = monthHit.ym; intent.toYm = monthHit.ym; intent.rangeText = monthHit.label;
  } else {
    const yr = t.match(/\bin\s+(20\d{2})\b/) || t.match(/\b(20\d{2})\b/);
    if (yr) { intent.fromYm = `${yr[1]}-01`; intent.toYm = `${yr[1]}-12`; intent.rangeText = yr[1]; }
    else timeHit = false;
  }

  const top = t.match(/top\s+(\d+)?\s*(districts?|stations?|crime heads?|heads?|sub ?heads?|repeat offenders?|offenders?)/);
  const whyAsk = /\bwhy\b/.test(t) && /\b(rising|increasing|surging|spiking|going up|shot up|rises|rise)\b/.test(t);
  if (top) {
    intent.n = top[1] ? Math.max(1, Math.min(20, Number(top[1]))) : 5;
    const target = top[2];
    if (target.startsWith('district')) intent.kind = 'topDistricts';
    else if (target.startsWith('station')) intent.kind = 'risk';
    else if (target.includes('head')) intent.kind = 'topHeads';
    else intent.kind = 'offenders';
  } else if (whyAsk) intent.kind = 'whyRising';
  else if (!intent.years && intent.districtId2 && (t.includes('compare') || /\bvs\b/.test(t) || t.includes('versus'))) intent.kind = 'compareDistricts';
  else if (intent.years || t.includes('compare')) intent.kind = 'compareYears';
  else if (t.includes('heinous')) intent.kind = 'heinousShare';
  else if (t.includes('per lakh') || t.includes('crime rate')) intent.kind = 'ratePerLakh';
  else if (t.includes('risk')) intent.kind = 'risk';
  else if (t.includes('forecast') || t.includes('predict')) intent.kind = 'forecast';
  else if (t.includes('alert')) intent.kind = 'alerts';
  else if (t.includes('hotspot')) intent.kind = 'hotspots';
  else if (t.includes('offender')) intent.kind = 'offenders';
  else if (t.includes('detection rate')) intent.kind = 'detectionRate';
  else if (t.includes('seasonalit') || t.includes('seasonal')) intent.kind = 'seasonality';
  else if (t.includes('total fir') || t.includes('how many fir')) intent.kind = 'totalFirs';
  else if (crimeHit || intent.districtId || timeHit || /(trend|case|fir|crime|month|how many|count)/.test(t)) intent.kind = 'trend';
  // Nothing crime-analytics-shaped matched: answer honestly with suggestions
  // instead of silently defaulting to an all-crime trend.
  else intent.kind = 'unknown';
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
  const { ds, lk } = deps;
  // Scope the rate to the asked time window (csdate) and, when a district is
  // named, to that district's IOs (ChargesheetDetails has no district column;
  // Employee.PolicePersonID -> DistrictID is the join the schema provides).
  const where = [
    { col: 'csdate', op: '>=', val: `${intent.fromYm}-01` },
    { col: 'csdate', op: '<=', val: `${intent.toYm}-31` }
  ];
  let place = 'Karnataka';
  if (intent.districtId) {
    try {
      const emp = await ds.query({
        table: 'Employee', columns: ['EmployeeID'],
        where: [{ col: 'DistrictID', op: '=', val: intent.districtId }], limit: { count: 300 }
      });
      if (emp.length) {
        where.push({ col: 'PolicePersonID', op: 'in', val: emp.map((r) => r.EmployeeID) });
        place = placeLabel(intent, lk);
      }
      // no known IOs for the district -> keep the statewide scope, honestly labelled
    } catch (e) { /* statewide fallback */ }
  }
  const q = { table: 'ChargesheetDetails', columns: ['cstype', 'COUNT(CSID)'], where, groupBy: ['cstype'] };
  const rows = await ds.query(q);
  const byType = {};
  for (const r of rows) byType[String(r.cstype).toUpperCase()] = toNum(r['COUNT(CSID)']);
  const a = byType.A || 0;
  const c = byType.C || 0;
  const rate = a + c > 0 ? round((a / (a + c)) * 100, 1) : 0;
  const answer = a + c > 0
    ? `Detection rate in ${place} (${intent.rangeText}) stands at ${rate}% — ${fmtInt(a)} detected (A-final) vs ${fmtInt(c)} undetected (C-final) chargesheets.`
    : `No chargesheets were filed in ${place} during ${intent.rangeText}, so a detection rate cannot be computed for that window.`;
  return {
    answer,
    chart: { type: 'pie', title: `Chargesheet outcomes — ${place} (${intent.rangeText})`, categories: ['Detected (A)', 'Undetected (C)'], series: [{ name: 'Chargesheets', data: [a, c] }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runHeinousShare(intent, deps) {
  const { ds, lk } = deps;
  const q = { table: 'AggMonthly', columns: ['SUM(CaseCount)', 'SUM(HeinousCount)'], where: crimeWhere(intent) };
  const rows = await ds.query(q);
  const cases = toNum(rows.length ? rows[0]['SUM(CaseCount)'] : 0);
  const heinous = toNum(rows.length ? rows[0]['SUM(HeinousCount)'] : 0);
  const share = cases > 0 ? round((heinous / cases) * 100, 1) : 0;
  const place = placeLabel(intent, lk);
  const answer = cases > 0
    ? `${fmtInt(heinous)} of ${fmtInt(cases)} cases (${share}%) registered in ${place} (${intent.rangeText}) are heinous offences.`
    : `No cases found in ${place} for ${intent.rangeText}, so the heinous share cannot be computed.`;
  return {
    answer,
    chart: { type: 'pie', title: `Heinous share — ${place} (${intent.rangeText})`, categories: ['Heinous', 'Non-heinous'], series: [{ name: 'Cases', data: [heinous, Math.max(0, cases - heinous)] }] },
    zcql: ds.buildZCQL(q)
  };
}

async function runRatePerLakh(intent, deps) {
  const { ds, lk } = deps;
  const label = crimeLabel(intent, lk);
  if (intent.districtId) {
    const q = { table: 'AggMonthly', columns: ['SUM(CaseCount)'], where: crimeWhere(intent) };
    const rows = await ds.query(q);
    const cases = toNum(rows.length ? rows[0]['SUM(CaseCount)'] : 0);
    const pop = lk.population(intent.districtId);
    const place = placeLabel(intent, lk);
    if (!pop) {
      return { answer: `Socio-economic population data is not loaded for ${place}, so a rate per lakh cannot be computed — raw count: ${fmtInt(cases)} cases (${intent.rangeText}).`, zcql: ds.buildZCQL(q) };
    }
    const rate = round((cases / pop) * 100000, 1);
    return {
      answer: `${label} rate in ${place} (${intent.rangeText}): ${rate} cases per lakh population — ${fmtInt(cases)} cases against a population of ${fmtInt(pop)}.`,
      zcql: ds.buildZCQL(q)
    };
  }
  const q = {
    table: 'AggMonthly', columns: ['DistrictID', 'SUM(CaseCount)'],
    where: crimeWhere(intent, { noDistrict: true }), groupBy: ['DistrictID']
  };
  const rows = await ds.query(q);
  const items = rows
    .map((r) => {
      const id = String(r.DistrictID);
      const pop = lk.population(id);
      return pop ? { name: lk.districtName(id), rate: round((toNum(r['SUM(CaseCount)']) / pop) * 100000, 1) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, Math.max(intent.n, 5));
  const answer = items.length
    ? `${label} rate per lakh population (${intent.rangeText}) — highest districts: ${items.slice(0, 5).map((i, ix) => `${ix + 1}. ${i.name} (${i.rate}/lakh)`).join(', ')}.`
    : 'Socio-economic population data is not loaded, so rates per lakh cannot be computed yet.';
  return {
    answer,
    chart: items.length ? { type: 'bar', title: `Rate per lakh — ${label}`, categories: items.map((i) => i.name), series: [{ name: 'Cases per lakh', data: items.map((i) => i.rate) }] } : undefined,
    zcql: ds.buildZCQL(q)
  };
}

async function runUnknown() {
  const picks = [CANNED_UTTERANCES[1], CANNED_UTTERANCES[0], CANNED_UTTERANCES[6]];
  return {
    answer: `I could not map that question to a crime-analytics intent. Try one of: ${picks.map((p) => `"${p}"`).join(' · ')} — or ask about trends, hotspots, alerts, forecasts, offenders, seasonality, or the detection rate.`,
    suggestions: picks
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
    table: 'HotspotCluster', columns: ['ClusterID', 'Label', 'Intensity', 'CaseCount', 'DistrictID', 'HourBandStart', 'HourBandEnd'],
    where, orderBy: { col: 'Intensity', desc: true }, limit: { count: 100 }
  };
  let rows = await ds.query(q);
  let when = '';
  if (intent.hourBand) {
    rows = rows.filter((r) => hourBandsOverlap(toNum(r.HourBandStart), toNum(r.HourBandEnd), intent.hourBand.start, intent.hourBand.end));
    when = ` active during ${intent.hourBand.label}`;
  }
  rows = rows.slice(0, intent.n);
  const answer = rows.length
    ? `Top hotspot${rows.length > 1 ? 's' : ''} in ${placeLabel(intent, lk)}${when}: ${rows.map((r) => `${r.Label} (intensity ${round(toNum(r.Intensity), 0)}, ${fmtInt(r.CaseCount)} cases)`).join('; ')}.`
    : `No active hotspot clusters in ${placeLabel(intent, lk)}${when} for the trailing window.`;
  return { answer, zcql: ds.buildZCQL(q) };
}

async function runCompareDistricts(intent, deps) {
  const { ds, lk } = deps;
  const months = ymRange(intent.fromYm, intent.toYm);
  const sides = [];
  let lastSql = '';
  for (const id of [intent.districtId, intent.districtId2]) {
    const q = {
      table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'],
      where: [{ col: 'Ym', op: '>=', val: intent.fromYm }, { col: 'Ym', op: '<=', val: intent.toYm }]
        .concat(intent.subHeadId ? [{ col: 'CrimeSubHeadID', op: '=', val: intent.subHeadId }]
          : intent.headId ? [{ col: 'CrimeHeadID', op: '=', val: intent.headId }] : [])
        .concat([{ col: 'DistrictID', op: '=', val: id }]),
      groupBy: ['Ym'], orderBy: { col: 'Ym' }
    };
    lastSql = ds.buildZCQL(q);
    const rows = await ds.query(q);
    const byYm = new Map(rows.map((r) => [r.Ym, toNum(r['SUM(CaseCount)'])]));
    const data = months.map((m) => byYm.get(m) || 0);
    sides.push({ name: lk.districtName(id), data, total: data.reduce((s, n) => s + n, 0) });
  }
  const label = crimeLabel(intent, lk);
  const [a, b] = sides;
  const d = pctDelta(a.total, b.total);
  const rel = a.total === b.total ? 'level with' : a.total > b.total ? `${Math.abs(d)}% higher than` : `${Math.abs(d)}% lower than`;
  const answer = `${label}, ${intent.rangeText}: ${a.name} registered ${fmtInt(a.total)} cases vs ${fmtInt(b.total)} in ${b.name} — ${a.name} is ${rel} ${b.name}.`;
  return {
    answer,
    chart: {
      type: 'line', title: `${label} — ${a.name} vs ${b.name} (${intent.rangeText})`,
      categories: months, series: sides.map((s) => ({ name: s.name, data: s.data }))
    },
    zcql: lastSql
  };
}

/** "Why is X rising": trend verdict from AggMonthly (last 3 months vs prior
 * baseline) plus corroborating insights — biggest contributing sub-pattern,
 * matching open anomaly alert, and the strongest overlapping hotspot. */
async function runWhyRising(intent, deps) {
  const { ds, lk } = deps;
  const label = crimeLabel(intent, lk);
  const place = placeLabel(intent, lk);
  const months = ymRange(intent.fromYm, intent.toYm);
  const q = { table: 'AggMonthly', columns: ['Ym', 'SUM(CaseCount)'], where: crimeWhere(intent), groupBy: ['Ym'], orderBy: { col: 'Ym' } };
  const rows = await ds.query(q);
  const byYm = new Map(rows.map((r) => [r.Ym, toNum(r['SUM(CaseCount)'])]));
  const data = months.map((m) => byYm.get(m) || 0);
  const split = Math.max(1, data.length - 3);
  const mean = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);
  const recentAvg = mean(data.slice(split));
  const baseAvg = mean(data.slice(0, split));
  const growth = pctDelta(recentAvg, baseAvg);
  let verdict;
  if (growth > 5) verdict = `is up ${growth}% — the last ${data.length - split} months averaged ${round(recentAvg, 1)} cases/month vs ${round(baseAvg, 1)} over the prior ${split}`;
  else if (growth < -5) verdict = `is actually DOWN ${Math.abs(growth)}% (${round(recentAvg, 1)}/month recently vs ${round(baseAvg, 1)} before)`;
  else verdict = `is broadly flat (${round(recentAvg, 1)}/month recently vs ${round(baseAvg, 1)} before, ${growth >= 0 ? '+' : ''}${growth}%)`;
  const causes = [];
  if (!intent.subHeadId) {
    try {
      const subRows = await ds.query({
        table: 'AggMonthly', columns: ['CrimeSubHeadID', 'Ym', 'SUM(CaseCount)'],
        where: crimeWhere(intent), groupBy: ['CrimeSubHeadID', 'Ym']
      });
      const recentSet = new Set(months.slice(split));
      const per = new Map();
      for (const r of subRows) {
        const id = toNum(r.CrimeSubHeadID);
        if (!per.has(id)) per.set(id, { recent: 0, base: 0 });
        if (recentSet.has(r.Ym)) per.get(id).recent += toNum(r['SUM(CaseCount)']);
        else per.get(id).base += toNum(r['SUM(CaseCount)']);
      }
      let best = null;
      for (const [id, v] of per) {
        const rAvg = v.recent / Math.max(1, data.length - split);
        const bAvg = v.base / Math.max(1, split);
        const g = pctDelta(rAvg, bAvg);
        if (rAvg >= 2 && (!best || g > best.g)) best = { id, g };
      }
      if (best && best.g > 0) causes.push(`the biggest contributor is ${lk.subHeadName(best.id)} (+${best.g}% vs baseline)`);
    } catch (e) { /* contributor analysis is optional */ }
  }
  try {
    const aw = [{ col: 'Status', op: '=', val: 'OPEN' }];
    if (intent.headId) aw.push({ col: 'CrimeHeadID', op: '=', val: intent.headId });
    if (intent.districtId) aw.push({ col: 'DistrictID', op: '=', val: intent.districtId });
    const alerts = await ds.query({ table: 'AnomalyAlert', columns: ['Narrative', 'ZScore'], where: aw, orderBy: { col: 'ZScore', desc: true }, limit: { count: 1 } });
    if (alerts.length) causes.push(`an open anomaly alert flags this pattern ("${alerts[0].Narrative}", z=${round(toNum(alerts[0].ZScore), 1)})`);
  } catch (e) { /* alerts are optional */ }
  try {
    const hw = [];
    if (intent.headId) hw.push({ col: 'CrimeHeadID', op: '=', val: intent.headId });
    if (intent.districtId) hw.push({ col: 'DistrictID', op: '=', val: intent.districtId });
    const hs = await ds.query({ table: 'HotspotCluster', columns: ['Label', 'Intensity'], where: hw, orderBy: { col: 'Intensity', desc: true }, limit: { count: 1 } });
    if (hs.length) causes.push(`activity concentrates in the "${hs[0].Label}" hotspot`);
  } catch (e) { /* hotspots are optional */ }
  let answer = `${label} in ${place} ${verdict} (window: ${intent.rangeText}).`;
  answer += causes.length
    ? ` ${growth > 5 ? 'Why' : 'Context'}: ${causes.join('; ')}.`
    : ' No open anomaly alert or active hotspot currently corroborates a structural shift — the movement is within normal variation.';
  return {
    answer,
    chart: {
      type: 'line', title: `${label} — ${place} (${intent.rangeText})`,
      categories: months, series: [{ name: label, data }]
    },
    zcql: ds.buildZCQL(q)
  };
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
  compareDistricts: runCompareDistricts,
  whyRising: runWhyRising,
  risk: runRisk,
  detectionRate: runDetectionRate,
  heinousShare: runHeinousShare,
  ratePerLakh: runRatePerLakh,
  alerts: runAlerts,
  hotspots: runHotspots,
  offenders: runOffenders,
  forecast: runForecast,
  seasonality: runSeasonality,
  totalFirs: runTotalFirs,
  unknown: runUnknown
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
  'compare cheating 2025 vs 2026 in Bengaluru City',
  'crime rate per lakh in Bengaluru City',
  'heinous share this year',
  'compare Bengaluru City and Mysuru City last 6 months',
  'why is chain snatching rising in Mysuru City',
  'hotspots at night in Bengaluru City'
];

// hourBandsOverlap is exported for the contract suite: the half-open boundary
// is exactly what regressed once, so it is pinned directly rather than only
// through the copilot answer string.
module.exports = { parse, answer, CANNED_UTTERANCES, hourBandsOverlap };
