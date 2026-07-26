// Dashboard analytics — pure, deterministic maths over the live API shapes.
// Nothing here calls React or fetch; every function takes the rows a hook
// already returned and gives back a plain object the panels render.
//
// Two things this module deliberately owns:
//  1. TRUE per-lakh rates. /geo/districts ships ratePerLakh as null whenever the
//     aggregate table has no population column, which silently kills the
//     "per lakh" choropleth and the population correlation. /meta/socio always
//     carries a real census population for all 38 districts, so we join on the
//     normalised unit code and compute the rate ourselves.
//  2. Ordinary-least-squares fits, so the socio panel can draw a regression
//     line and rank districts by RESIDUAL (how far a district sits off the line
//     that its own socio-economic profile predicts) rather than by raw volume.
import { polygonForUnit, normalizeUnitCode, unitInfo } from '../../lib/districtGeoMap.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * True only for a value that is genuinely a finite number.
 *
 * `Number.isFinite(Number(v))` is NOT that test: Number(null), Number('') and
 * Number([]) are all 0, so a null socio indicator would sail through as a
 * legitimate 0. That is exactly what flattened the correlation scatter — every
 * district landed at x = 0, the x variance went to zero, and the regression
 * silently refused to fit. Reject the empty-ish values explicitly.
 */
export const isNum = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return false;
  return Number.isFinite(Number(v));
};
const finite = isNum;

// ---------------------------------------------------------------------------
// socio-economic join (C3 — the "why" behind the "where")
// ---------------------------------------------------------------------------

/** The five indicators /meta/socio exposes. `higherIsUrban` drives the axis
 *  hint only. Caste/religion are not collected and never appear here. */
export const SOCIO_INDICATORS = [
  { key: 'urbanPct', digits: 0, suffix: '%' },
  { key: 'literacyPct', digits: 1, suffix: '%' },
  { key: 'densityPerKm2', digits: 0, suffix: '' },
  { key: 'perCapitaIncomeIdx', digits: 1, suffix: '' },
  { key: 'population', digits: 0, suffix: '' },
];
export const SOCIO_INDICATOR_KEYS = SOCIO_INDICATORS.map((i) => i.key);

/** { [normalisedUnitCode]: socioRow } — '101' and '0101' both resolve. */
export function socioIndex(socioRows) {
  const map = new Map();
  for (const s of socioRows || []) {
    const code = normalizeUnitCode(s.districtId);
    if (code) map.set(code, s);
  }
  return map;
}

/**
 * Join /geo/districts case volume with /meta/socio context.
 * → [{districtId, districtName, caseCount, momDeltaPct, alert, population,
 *     urbanPct, literacyPct, densityPerKm2, perCapitaIncomeIdx, ratePerLakh}]
 * ratePerLakh is recomputed from the census population whenever one exists, so
 * it is never null for a district the socio table knows.
 */
export function joinSocio(geoRows, socioRows) {
  const idx = socioIndex(socioRows);
  const out = [];
  for (const r of geoRows || []) {
    const code = normalizeUnitCode(r.districtId ?? r.unitId);
    const s = code ? idx.get(code) : null;
    const population = s && finite(s.population) ? Number(s.population) : null;
    const caseCount = num(r.caseCount ?? r.count);
    out.push({
      districtId: r.districtId ?? r.unitId,
      districtName: r.districtName || unitInfo(code)?.name || String(r.districtId ?? ''),
      caseCount,
      momDeltaPct: finite(r.momDeltaPct) ? Number(r.momDeltaPct) : null,
      alert: !!r.alert,
      population,
      urbanPct: s && finite(s.urbanPct) ? Number(s.urbanPct) : null,
      literacyPct: s && finite(s.literacyPct) ? Number(s.literacyPct) : null,
      densityPerKm2: s && finite(s.densityPerKm2) ? Number(s.densityPerKm2) : null,
      perCapitaIncomeIdx: s && finite(s.perCapitaIncomeIdx) ? Number(s.perCapitaIncomeIdx) : null,
      // census rate first, server rate as the fallback
      ratePerLakh: population > 0
        ? (caseCount / population) * 100000
        : (finite(r.ratePerLakh) ? Number(r.ratePerLakh) : null),
    });
  }
  return out;
}

/**
 * Census population per map polygon. Units that share a polygon are reduced
 * with MAX, not SUM: a commissionerate and its parent district cover the same
 * people from two administrative angles, so adding them would double-count
 * (Bengaluru City 1.1 cr + Bengaluru Rural South 10 lakh is not 1.2 cr of
 * Bengaluru Urban). The larger unit is the one whose population actually
 * describes the polygon.
 */
export function polygonCensusPopulation(socioRows) {
  const acc = {};
  for (const s of socioRows || []) {
    const poly = polygonForUnit(normalizeUnitCode(s.districtId));
    if (!poly || !finite(s.population)) continue;
    acc[poly] = Math.max(acc[poly] || 0, Number(s.population));
  }
  return acc;
}

/** Census-backed cases-per-lakh per polygon → { [polygon]: rate (rounded) }. */
export function polygonCensusRate(geoRows, socioRows) {
  const pop = polygonCensusPopulation(socioRows);
  const cases = {};
  for (const r of geoRows || []) {
    const poly = polygonForUnit(r.districtId ?? r.unitId);
    if (!poly) continue;
    cases[poly] = (cases[poly] || 0) + num(r.caseCount ?? r.count);
  }
  const out = {};
  for (const poly of Object.keys(cases)) {
    const p = pop[poly];
    if (p > 0) out[poly] = Math.round((cases[poly] / p) * 100000);
  }
  return out;
}

// ---------------------------------------------------------------------------
// regression / residuals
// ---------------------------------------------------------------------------

/**
 * Ordinary least squares y = a + bx over [{x, y}] → {slope, intercept, r, n,
 * predict(x)} or null when fewer than 3 points or x has no variance.
 */
export function linearFit(points) {
  const pts = (points || []).filter((p) => finite(p?.x) && finite(p?.y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + Number(p.x), 0) / n;
  const my = pts.reduce((a, p) => a + Number(p.y), 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = Number(p.x) - mx;
    const dy = Number(p.y) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  return { slope, intercept, r, n, predict: (x) => intercept + slope * Number(x) };
}

/**
 * Rank points by signed residual against a fit → [{...point, expected, resid,
 * residPct}] sorted worst-over-performer first. "Over" means the district
 * records MORE crime than its socio-economic profile predicts.
 */
export function residualRanking(points, fit) {
  if (!fit) return [];
  return (points || [])
    .filter((p) => finite(p?.x) && finite(p?.y))
    .map((p) => {
      const expected = fit.predict(p.x);
      const resid = Number(p.y) - expected;
      return {
        ...p,
        expected,
        resid,
        residPct: expected !== 0 ? (resid / Math.abs(expected)) * 100 : null,
      };
    })
    .sort((a, b) => b.resid - a.resid);
}

/** |r| → a bucket key the dictionary turns into words. */
export function strengthKey(r) {
  const a = Math.abs(Number(r) || 0);
  if (a >= 0.7) return 'strong';
  if (a >= 0.4) return 'moderate';
  return 'weak';
}

// ---------------------------------------------------------------------------
// shift analysis (C1 — time-of-day layered on location)
// ---------------------------------------------------------------------------

/** The three police shifts, as hour half-open ranges on a 24h clock. */
export const SHIFTS = [
  { key: 'day', from: 6, to: 14 },
  { key: 'evening', from: 14, to: 22 },
  { key: 'night', from: 22, to: 6 },
];

const inShift = (hour, s) => (s.from < s.to
  ? hour >= s.from && hour < s.to
  : hour >= s.from || hour < s.to);

/**
 * Split a raw /trends/seasonality payload ({weekdays, matrix}) into shifts.
 * Reads `weekdays` off the RAW server response, so weekday rows keep the
 * server's Sun-first ordering instead of being relabelled Mon-first.
 * → { total, shifts:[{key, count, pct}], byDay:[{weekday, dayIndex, day,
 *     evening, night, total}], dominant, peak:{weekday, hour, count} } or null.
 * The weekday LABEL is `weekday`, never `day` — `day` is the day-shift count,
 * and the two collided the first time this was written.
 */
export function shiftAnalysis(raw) {
  const matrix = Array.isArray(raw?.matrix) ? raw.matrix : null;
  if (!matrix || !matrix.length) return null;
  const weekdays = Array.isArray(raw.weekdays) && raw.weekdays.length === matrix.length
    ? raw.weekdays.map(String)
    : matrix.map((_, i) => `D${i}`);
  const totals = Object.fromEntries(SHIFTS.map((s) => [s.key, 0]));
  const byDay = [];
  let total = 0;
  let peak = null;
  matrix.forEach((row, d) => {
    const per = Object.fromEntries(SHIFTS.map((s) => [s.key, 0]));
    let dayTotal = 0;
    (row || []).forEach((v, h) => {
      const n = num(v);
      if (!n) return;
      total += n;
      dayTotal += n;
      for (const s of SHIFTS) {
        if (inShift(h, s)) { per[s.key] += n; totals[s.key] += n; break; }
      }
      if (!peak || n > peak.count) peak = { weekday: weekdays[d], dayIndex: d, hour: h, count: n };
    });
    byDay.push({ weekday: weekdays[d], dayIndex: d, ...per, total: dayTotal });
  });
  if (!total) return null;
  const shifts = SHIFTS.map((s) => ({
    key: s.key,
    from: s.from,
    to: s.to,
    count: totals[s.key],
    pct: (totals[s.key] / total) * 100,
  }));
  const dominant = [...shifts].sort((a, b) => b.count - a.count)[0];
  return { total, shifts, byDay, dominant, peak, sampleSize: num(raw.sampleSize) };
}

// ---------------------------------------------------------------------------
// month calendar (C4 — temporal hotspots at a glance)
// ---------------------------------------------------------------------------

/**
 * Fold flat /trends/monthly rows ([{ym, caseCount, heinousCount}]) into a
 * year × month grid with per-cell z-scores against the whole series.
 * → { years:[{year, cells:[{ym, month, value, heinous, z}|null]×12, total}],
 *     mean, sd, max, hottest, coldest } — years that are entirely empty are
 * dropped so a padded API window doesn't render three blank rows.
 *
 * A zero month is treated as ABSENT, not as a data point. /trends/monthly
 * zero-fills the whole requested window, so asking for four years returns
 * months that have not happened yet; scoring those against the series mean
 * made every future month of the current year read as a −17σ "record quiet"
 * cell. No state-month genuinely records zero FIRs, so zero means no data.
 */
export function monthCalendar(rows, { metric = 'caseCount' } = {}) {
  const clean = (rows || []).filter((r) => /^\d{4}-\d{2}$/.test(String(r?.ym || ''))
    && num(r[metric]) > 0);
  if (!clean.length) return null;
  const values = clean.map((r) => num(r[metric]));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const byYear = new Map();
  for (const r of clean) {
    const [y, m] = String(r.ym).split('-');
    const year = Number(y);
    const month = Number(m);
    if (!byYear.has(year)) byYear.set(year, new Array(12).fill(null));
    const v = num(r[metric]);
    byYear.get(year)[month - 1] = {
      ym: r.ym,
      month,
      value: v,
      heinous: num(r.heinousCount),
      z: sd > 0 ? (v - mean) / sd : 0,
    };
  }
  const years = [...byYear.entries()]
    .map(([year, cells]) => ({
      year,
      cells,
      total: cells.reduce((a, c) => a + (c ? c.value : 0), 0),
    }))
    .filter((y) => y.total > 0)
    .sort((a, b) => a.year - b.year);
  if (!years.length) return null;
  const all = years.flatMap((y) => y.cells).filter((c) => c && c.value > 0);
  const sorted = [...all].sort((a, b) => b.value - a.value);
  return {
    years,
    mean,
    sd,
    max: sorted.length ? sorted[0].value : 0,
    hottest: sorted[0] || null,
    coldest: sorted[sorted.length - 1] || null,
  };
}

/** Last calendar day of a 'YYYY-MM' month → 'YYYY-MM-DD'. */
export function monthEndDate(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return '';
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// multi-district comparison
// ---------------------------------------------------------------------------

/** Rebase a series so its first non-zero point reads 100 (shape comparison
 *  across districts of wildly different size). Zeros stay zero. */
export function indexTo100(values) {
  const base = (values || []).find((v) => num(v) > 0);
  if (!base) return (values || []).map(() => 0);
  return (values || []).map((v) => Math.round((num(v) / base) * 1000) / 10);
}

/** Compact stats for one district series → {total, avg, last, deltaPct, peakYm}. */
export function seriesStats(months, values) {
  const vals = (values || []).map(num);
  if (!vals.length) return null;
  const total = vals.reduce((a, b) => a + b, 0);
  const last = vals[vals.length - 1];
  const prev = vals.length > 1 ? vals[vals.length - 2] : 0;
  let peakIdx = 0;
  vals.forEach((v, i) => { if (v > vals[peakIdx]) peakIdx = i; });
  return {
    total,
    avg: total / vals.length,
    last,
    deltaPct: prev > 0 ? ((last - prev) / prev) * 100 : null,
    peakYm: (months || [])[peakIdx] || '',
    peak: vals[peakIdx],
  };
}

// ---------------------------------------------------------------------------
// resource deployment (C4 — hotspots into a duty roster)
// ---------------------------------------------------------------------------

/**
 * Turn hotspot clusters and station risk into a concrete patrol suggestion.
 * Intensity is the server's 0–100 cluster score; `beats` is how many patrol
 * units the cluster warrants, `hours` the length of its active window.
 * opts: { budget = total patrol units available, minBeats = 1 }.
 * → { assignments:[{id, label, districtId, band, intensity, caseCount, beats,
 *      hours, night}], stations:[{unitId, unitName, riskScore, beats}],
 *      usedBeats, budget, nightBeats, coveragePct }
 */
export function deploymentPlan(hotspots, riskRows, { budget = 24, minBeats = 1 } = {}) {
  const clusters = (hotspots || [])
    .filter((h) => finite(h?.intensity))
    .sort((a, b) => Number(b.intensity) - Number(a.intensity));
  const stations = (riskRows || [])
    .filter((r) => finite(r?.riskScore))
    .sort((a, b) => Number(b.riskScore) - Number(a.riskScore));
  if (!clusters.length && !stations.length) return null;

  // 60 % of the budget follows cluster intensity, 40 % follows station risk —
  // the split is the planning assumption the footnote states out loud.
  const clusterBudget = Math.max(0, Math.round(budget * 0.6));
  const stationBudget = Math.max(0, budget - clusterBudget);
  const intensitySum = clusters.reduce((a, h) => a + Number(h.intensity), 0) || 1;
  const riskSum = stations.slice(0, 8).reduce((a, r) => a + Number(r.riskScore), 0) || 1;

  const bandHours = (from, to) => {
    const a = ((num(from) % 24) + 24) % 24;
    const b = ((num(to) % 24) + 24) % 24;
    return b > a ? b - a : 24 - a + b;
  };

  const assignments = clusters.map((h) => {
    const share = Number(h.intensity) / intensitySum;
    const start = num(h.hourBandStart);
    return {
      id: h.clusterId || `${h.districtId}-${start}`,
      label: h.subHeadName || h.label || '',
      crimeHeadId: h.crimeHeadId,
      districtId: h.districtId,
      hourBandStart: h.hourBandStart,
      hourBandEnd: h.hourBandEnd,
      intensity: Number(h.intensity),
      caseCount: num(h.caseCount),
      radiusM: num(h.radiusM),
      beats: Math.max(minBeats, Math.round(share * clusterBudget)),
      hours: bandHours(h.hourBandStart, h.hourBandEnd),
      night: start >= 20 || start < 6,
    };
  });

  const stationPlan = stations.slice(0, 8).map((r) => ({
    unitId: r.unitId,
    unitName: r.unitName || String(r.unitId || ''),
    districtId: r.districtId,
    riskScore: Number(r.riskScore),
    drivers: Array.isArray(r.drivers) ? r.drivers : [],
    beats: Math.max(minBeats, Math.round((Number(r.riskScore) / riskSum) * stationBudget)),
  }));

  const usedBeats = assignments.reduce((a, x) => a + x.beats, 0)
    + stationPlan.reduce((a, x) => a + x.beats, 0);
  const nightBeats = assignments.filter((a) => a.night).reduce((a, x) => a + x.beats, 0);
  const covered = assignments.reduce((a, x) => a + x.caseCount, 0);
  const totalCases = clusters.reduce((a, h) => a + num(h.caseCount), 0);

  return {
    assignments,
    stations: stationPlan,
    usedBeats,
    budget,
    nightBeats,
    nightSharePct: usedBeats > 0 ? (nightBeats / usedBeats) * 100 : 0,
    coveragePct: totalCases > 0 ? (covered / totalCases) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// emerging-trend helpers (C4 / C1 red-zone pulse)
// ---------------------------------------------------------------------------

/** Sub-heads the server flagged emerging (growth ≥ 15 % vs the 9-month
 *  baseline), worst first. Safe on a missing payload. */
export function emergingMovers(payload) {
  return (payload?.rising || []).filter((m) => m && m.emerging === true);
}

/** Peak-to-trough amplitude of a spark as a percent of its mean — how volatile
 *  a sub-head is, which separates "genuinely emerging" from "noisy". */
export function volatilityPct(spark) {
  const vals = (spark || []).map(num).filter((v) => v > 0);
  if (vals.length < 3) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean <= 0) return null;
  return ((Math.max(...vals) - Math.min(...vals)) / mean) * 100;
}
