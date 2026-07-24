// Trends deep-dive — pure numeric helpers (rolling means, anomaly detection,
// least-squares trend, month×year matrix, per-lakh derivation). No React, no
// fetch — everything is deterministic over the normalized hook shapes so the
// insight sentences and chart annotations stay reproducible.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Sum every series of a normalized {months, series} payload into one array. */
export function sumSeries(trends) {
  if (!trends?.months?.length) return { months: [], values: [] };
  const values = trends.months.map((_, i) =>
    (trends.series || []).reduce((a, s) => a + num(s.data?.[i]), 0));
  return { months: trends.months, values };
}

/** Drop leading all-zero months (the API zero-fills months before the data
 * window starts, which would flatten charts and skew trend slopes). */
export function trimLeadingZeros(months, values) {
  let start = values.findIndex((v) => num(v) > 0);
  if (start < 0) start = 0;
  return { months: months.slice(start), values: values.slice(start) };
}

/** Trailing rolling mean; null until `window` points exist (keeps chart honest). */
export function rollingMean(values, window) {
  if (!window || window < 2) return values.slice();
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j += 1) sum += num(values[j]);
    return sum / window;
  });
}

/**
 * Flag outlier months against a trailing baseline (up to 12 prior months,
 * at least `minBaseline`). Returns [{index, z, dir:'up'|'down'}].
 * z-threshold 2 keeps the synthetic data demo-visible without spamming flags.
 */
export function detectAnomalies(values, { threshold = 2, minBaseline = 6 } = {}) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - 12);
    const base = values.slice(start, i).map(num);
    if (base.length < minBaseline) continue;
    const mean = base.reduce((a, b) => a + b, 0) / base.length;
    const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
    if (sd <= 0) continue;
    const z = (num(values[i]) - mean) / sd;
    if (Math.abs(z) >= threshold) out.push({ index: i, z, dir: z > 0 ? 'up' : 'down' });
  }
  return out;
}

/** Least-squares slope over the window → {slope, mean, pctPerMonth}. */
export function linearTrend(values) {
  const ys = values.map(num);
  const n = ys.length;
  if (n < 3) return null;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  ys.forEach((y, x) => {
    cov += (x - xMean) * (y - yMean);
    varX += (x - xMean) ** 2;
  });
  const slope = varX > 0 ? cov / varX : 0;
  return { slope, mean: yMean, pctPerMonth: yMean > 0 ? (slope / yMean) * 100 : 0 };
}

/** mean(last `span`) vs mean(prior `span`) → signed % change, or null. */
export function recentDeltaPct(values, span = 3) {
  if (values.length < span * 2) return null;
  const mean = (xs) => xs.reduce((a, b) => a + num(b), 0) / xs.length;
  const cur = mean(values.slice(-span));
  const prev = mean(values.slice(-span * 2, -span));
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** 'YYYY-MM' months + values → {years:[asc], matrix:number|null[year][12], max}.
 * null marks calendar cells outside the data window (heatmap skips them). */
export function buildMonthYearMatrix(months, values) {
  const years = [...new Set(months.map((ym) => ym.slice(0, 4)))].sort();
  const yIdx = new Map(years.map((y, i) => [y, i]));
  const matrix = years.map(() => Array.from({ length: 12 }, () => null));
  months.forEach((ym, i) => {
    const row = yIdx.get(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7)) - 1;
    if (row !== undefined && m >= 0 && m < 12) matrix[row][m] = num(values[i]);
  });
  let max = 0;
  matrix.forEach((row) => row.forEach((v) => { if (v !== null && v > max) max = v; }));
  return { years, matrix, max };
}

/** Group months into calendar-month averages → {byMonth:number|null[12]}. */
export function calendarMonthMeans(months, values) {
  const sums = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  months.forEach((ym, i) => {
    const m = Number(ym.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) { sums[m] += num(values[i]); counts[m] += 1; }
  });
  return sums.map((s, m) => (counts[m] ? s / counts[m] : null));
}

/**
 * Derive district populations from /geo/districts rows — the server computes
 * ratePerLakh = caseCount / Population × 1e5 from the SocioEconomic table, so
 * Population back-solves exactly: pop = caseCount / ratePerLakh × 1e5.
 * → {byDistrict: Map<districtId, population>, statePop}
 */
export function derivePopulations(geoRows) {
  const byDistrict = new Map();
  let statePop = 0;
  (geoRows || []).forEach((r) => {
    const count = num(r.caseCount);
    const rate = num(r.ratePerLakh);
    if (count > 0 && rate > 0) {
      const pop = Math.round((count / rate) * 100000);
      byDistrict.set(String(r.districtId), pop);
      statePop += pop;
    }
  });
  return { byDistrict, statePop: statePop || null };
}

/** counts → cases per lakh for a population (null-safe passthrough). */
export function toPerLakh(values, population) {
  if (!population) return values.slice();
  return values.map((v) => (v === null || v === undefined ? null : (num(v) / population) * 100000));
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
