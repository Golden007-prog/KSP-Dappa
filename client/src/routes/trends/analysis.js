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

// ---------------------------------------------------------------------------
// Second-pass statistical helpers: decomposition, changepoints, correlation,
// YoY matrices, hour profiles. Still pure + deterministic — no React, no fetch.
// ---------------------------------------------------------------------------

const meanOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const varOf = (xs) => {
  if (xs.length < 2) return 0;
  const m = meanOf(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

/** Classic 2×12 centered moving average (even window); null at the edges. */
export function centeredMA(values, window = 12) {
  const xs = values.map(num);
  const n = xs.length;
  const out = Array(n).fill(null);
  const half = Math.floor(window / 2);
  if (n < window + 1) return out;
  for (let i = half; i < n - half; i += 1) {
    if (window % 2 === 0) {
      let s1 = 0;
      let s2 = 0;
      for (let j = i - half; j < i + half; j += 1) s1 += xs[j];
      for (let j = i - half + 1; j <= i + half; j += 1) s2 += xs[j];
      out[i] = (s1 / window + s2 / window) / 2;
    } else {
      let s = 0;
      for (let j = i - half; j <= i + half; j += 1) s += xs[j];
      out[i] = s / window;
    }
  }
  return out;
}

/**
 * Additive STL-style decomposition at monthly grain:
 * trend = 2×12 centered MA · seasonal = centered calendar-month means of the
 * detrended series · residual = observed − trend − seasonal (null at edges).
 * Strengths follow Hyndman: F = max(0, 1 − Var(R)/Var(component + R)).
 */
export function decomposeSeries(months, values) {
  const xs = values.map(num);
  if (!months?.length || xs.length < 18) return null;
  const trend = centeredMA(xs, 12);
  const detrendByMonth = Array.from({ length: 12 }, () => []);
  months.forEach((ym, i) => {
    if (trend[i] === null) return;
    const m = Number(ym.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) detrendByMonth[m].push(xs[i] - trend[i]);
  });
  const rawIdx = detrendByMonth.map((arr) => (arr.length ? meanOf(arr) : 0));
  const idxMean = meanOf(rawIdx);
  const seasonalIdx = rawIdx.map((v) => v - idxMean);
  const seasonal = months.map((ym) => {
    const m = Number(ym.slice(5, 7)) - 1;
    return m >= 0 && m < 12 ? seasonalIdx[m] : 0;
  });
  const residual = xs.map((v, i) => (trend[i] === null ? null : v - trend[i] - seasonal[i]));
  const rs = residual.filter((v) => v !== null);
  const sr = residual.map((v, i) => (v === null ? null : v + seasonal[i])).filter((v) => v !== null);
  const tr = residual.map((v, i) => (v === null ? null : v + trend[i])).filter((v) => v !== null);
  const strengthSeasonal = sr.length ? Math.max(0, 1 - varOf(rs) / (varOf(sr) || 1)) : 0;
  const strengthTrend = tr.length ? Math.max(0, 1 - varOf(rs) / (varOf(tr) || 1)) : 0;
  // Residual outliers: |z| ≥ 2 against the residual distribution.
  const rMean = meanOf(rs);
  const rSd = Math.sqrt(varOf(rs));
  const outliers = [];
  residual.forEach((v, i) => {
    if (v === null || rSd <= 0) return;
    const z = (v - rMean) / rSd;
    if (Math.abs(z) >= 2) outliers.push({ index: i, z, dir: z > 0 ? 'up' : 'down' });
  });
  return { trend, seasonal, seasonalIdx, residual, strengthTrend, strengthSeasonal, outliers };
}

/**
 * Level-shift changepoints via binary segmentation on SSE reduction.
 * Returns [{index, shiftPct, dir}] (≤ maxPoints, each split must cut total
 * squared error by ≥ minImprove of its segment).
 */
export function detectChangepoints(values, { maxPoints = 2, minSeg = 4, minImprove = 0.2 } = {}) {
  const xs = values.map(num);
  const n = xs.length;
  if (n < minSeg * 2) return [];
  const sse = (s, e) => {
    const seg = xs.slice(s, e);
    const m = meanOf(seg);
    return seg.reduce((a, b) => a + (b - m) ** 2, 0);
  };
  const segments = [[0, n]];
  const found = [];
  while (found.length < maxPoints) {
    let best = null;
    for (const [s, e] of segments) {
      if (e - s < minSeg * 2) continue;
      const total = sse(s, e);
      if (total <= 0) continue;
      for (let i = s + minSeg; i <= e - minSeg; i += 1) {
        const gain = (total - sse(s, i) - sse(i, e)) / total;
        if (!best || gain > best.gain) best = { i, gain, s, e };
      }
    }
    if (!best || best.gain < minImprove) break;
    found.push(best.i);
    const at = segments.findIndex(([s, e]) => s === best.s && e === best.e);
    segments.splice(at, 1, [best.s, best.i], [best.i, best.e]);
  }
  return found.sort((a, b) => a - b).map((i) => {
    const before = meanOf(xs.slice(Math.max(0, i - 6), i));
    const after = meanOf(xs.slice(i, Math.min(n, i + 6)));
    return {
      index: i,
      shiftPct: before > 0 ? ((after - before) / before) * 100 : null,
      dir: after >= before ? 'up' : 'down',
    };
  });
}

/** OLS over [{x,y}] → {slope, intercept, r, n} or null (needs ≥ 3 points). */
export function olsFit(points) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = meanOf(pts.map((p) => p.x));
  const my = meanOf(pts.map((p) => p.y));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return {
    slope,
    intercept: my - slope * mx,
    r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0,
    n,
  };
}

/** Cosine similarity of two equal-length numeric vectors (0 when degenerate). */
export function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a?.length || 0, b?.length || 0);
  for (let i = 0; i < len; i += 1) {
    const x = num(a[i]);
    const y = num(b[i]);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** 'YYYY-MM' months + values → YoY % matrix {years, matrix, maxAbs}.
 * A cell is null when the same month a year earlier is missing or zero. */
export function buildYoyMatrix(months, values) {
  const byYm = new Map(months.map((ym, i) => [ym, num(values[i])]));
  const years = [...new Set(months.map((ym) => ym.slice(0, 4)))].sort();
  const yIdx = new Map(years.map((y, i) => [y, i]));
  const matrix = years.map(() => Array.from({ length: 12 }, () => null));
  let maxAbs = 0;
  months.forEach((ym) => {
    const prev = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;
    const prevV = byYm.get(prev);
    if (!(prevV > 0)) return;
    const pct = ((byYm.get(ym) - prevV) / prevV) * 100;
    const row = yIdx.get(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7)) - 1;
    if (row !== undefined && m >= 0 && m < 12) {
      matrix[row][m] = pct;
      if (Math.abs(pct) > maxAbs) maxAbs = Math.abs(pct);
    }
  });
  return { years, matrix, maxAbs };
}

const isWeekendLabel = (label) => /^s(at|un)/i.test(String(label));

/** Seasonality matrix → per-hour weekday vs weekend mean profiles. */
export function hourProfiles(s) {
  if (!s?.matrix?.length) return null;
  const wd = [];
  const we = [];
  s.matrix.forEach((row, d) => (isWeekendLabel(s.days[d]) ? we : wd).push(row));
  const avg = (rows) => (rows.length
    ? Array.from({ length: 24 }, (_, h) => meanOf(rows.map((r) => num(r[h]))))
    : null);
  return { weekday: avg(wd), weekend: avg(we) };
}

/** Seasonality matrix → headline stats for the quick-stat chips. */
export function seasonalityQuickStats(s) {
  if (!s?.matrix?.length || !s.max) return null;
  const total = s.matrix.flat().reduce((a, b) => a + num(b), 0);
  if (!(total > 0)) return null;
  const daySums = s.matrix.map((row) => row.reduce((a, b) => a + num(b), 0));
  const busiestDay = daySums.indexOf(Math.max(...daySums));
  const hourSums = Array.from({ length: 24 }, (_, h) =>
    s.matrix.reduce((a, row) => a + num(row[h]), 0));
  let band = { start: 0, sum: -1 };
  for (let h = 0; h <= 21; h += 1) {
    const sum = hourSums[h] + hourSums[h + 1] + hourSums[h + 2];
    if (sum > band.sum) band = { start: h, sum };
  }
  const weekendSum = s.matrix.reduce(
    (a, row, d) => a + (isWeekendLabel(s.days[d]) ? daySums[d] : 0), 0);
  return {
    busiestDay: s.days[busiestDay],
    busiestDayPct: (daySums[busiestDay] / total) * 100,
    bandStart: band.start,
    bandEnd: band.start + 3,
    bandPct: (band.sum / total) * 100,
    weekendPct: (weekendSum / total) * 100,
  };
}
