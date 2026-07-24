// Trends — deterministic insight-sentence builders + festival-month calendar.
// Pure functions over the normalized hook shapes (client/CONTRACT.md); every
// sentence is templated straight from the data — no AI/LLM calls involved.
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';

// Months containing Ugadi / Dasara (Vijayadashami) / Deepavali, from the real
// festival dates 2021–2026, at the chart's monthly grain. In some years Dasara
// and Deepavali fall in the same calendar month and share one shaded band.
export const FESTIVAL_MONTHS = {
  '2021-04': 'Ugadi',
  '2021-10': 'Dasara',
  '2021-11': 'Deepavali',
  '2022-04': 'Ugadi',
  '2022-10': 'Dasara · Deepavali',
  '2023-03': 'Ugadi',
  '2023-10': 'Dasara',
  '2023-11': 'Deepavali',
  '2024-04': 'Ugadi',
  '2024-10': 'Dasara · Deepavali',
  '2025-03': 'Ugadi',
  '2025-10': 'Dasara · Deepavali',
  '2026-03': 'Ugadi',
  '2026-10': 'Dasara',
  '2026-11': 'Deepavali',
};

const pct = (v, digits = 1) => fmtPct(v, { fraction: false, digits });
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** Seasonality heatmap → peak cell vs the hourly average + night-share. */
export function seasonalityInsight(s) {
  if (!s || !s.max || !Array.isArray(s.matrix) || !s.matrix.length) return null;
  let peak = { d: 0, h: 0, v: -1 };
  let total = 0;
  let cells = 0;
  s.matrix.forEach((row, d) => row.forEach((v, h) => {
    total += v;
    cells += 1;
    if (v > peak.v) peak = { d, h, v };
  }));
  if (total <= 0 || !cells) return null;
  const mean = total / cells;
  const nightHours = [21, 22, 23, 0, 1, 2, 3, 4];
  const night = s.matrix.reduce((a, row) => a + nightHours.reduce((b, h) => b + (row[h] || 0), 0), 0);
  const ratio = mean > 0 ? peak.v / mean : 0;
  return `Peak window is ${s.days[peak.d]} ${hh(peak.h)}–${hh((peak.h + 1) % 24)} at `
    + `${fmtNum(ratio, 1)}× the average hourly load; night hours (21:00–05:00) carry `
    + `${pct((night / total) * 100, 0)} of cases.`;
}

/** Monthly multi-line → leading head, latest MoM, festival-vs-normal delta. */
export function monthlyInsight(months, series) {
  if (!months?.length || !series?.length) return null;
  const totals = months.map((_, i) => series.reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  if (!grand) return null;
  const sums = series
    .map((s) => ({ name: s.name, sum: (s.data || []).reduce((a, v) => a + (Number(v) || 0), 0) }))
    .sort((a, b) => b.sum - a.sum);
  const top = sums[0];
  let text = `${top.name} leads with ${fmtInt(top.sum)} cases over this window.`;
  if (totals.length >= 2 && totals[totals.length - 2] > 0) {
    const prev = totals[totals.length - 2];
    const mom = ((totals[totals.length - 1] - prev) / prev) * 100;
    text += ` ${monthLabel(months[months.length - 1])} is ${mom >= 0 ? 'up' : 'down'} ${pct(Math.abs(mom))} on the prior month.`;
  }
  const fest = [];
  const rest = [];
  months.forEach((ym, i) => (FESTIVAL_MONTHS[ym] ? fest : rest).push(totals[i]));
  if (fest.length && rest.length) {
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const restMean = mean(rest);
    if (restMean > 0) {
      const d = ((mean(fest) - restMean) / restMean) * 100;
      text += ` Festival months run ${pct(Math.abs(d))} ${d >= 0 ? 'above' : 'below'} the non-festival average.`;
    }
  }
  return text;
}

/** Category-share donut → dominant head, top-3 concentration, fastest riser. */
export function shareInsight(items) {
  if (!items?.length) return null;
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  if (!top.count) return null;
  let text = Number.isFinite(top.sharePct)
    ? `${top.name} is the largest head at ${pct(top.sharePct)} of cases`
    : `${top.name} is the largest head with ${fmtInt(top.count)} cases`;
  if (sorted.length > 3) {
    const top3 = sorted.slice(0, 3).reduce((a, r) => a + (Number(r.sharePct) || 0), 0);
    if (top3 > 0) text += `; the top 3 heads cover ${pct(top3, 0)} of the total`;
  }
  const risers = sorted.filter((r) => Number.isFinite(Number(r.deltaPct)) && Number(r.deltaPct) > 0);
  if (risers.length) {
    const r = risers.sort((a, b) => Number(b.deltaPct) - Number(a.deltaPct))[0];
    text += `. Fastest riser: ${r.name} (+${pct(Number(r.deltaPct))} MoM)`;
  }
  return `${text}.`;
}

// ---------------------------------------------------------------------------
// Deep-dive additions (all deterministic — computed via ./analysis.js helpers)
// ---------------------------------------------------------------------------

/** Overall trajectory: least-squares direction + last-3-vs-prior-3 momentum. */
export function trendDirectionInsight(months, values, trend, recentPct) {
  if (!months?.length || !trend) return null;
  const dir = Math.abs(trend.pctPerMonth) < 0.5 ? 'flat'
    : trend.pctPerMonth > 0 ? 'rising' : 'falling';
  let text = dir === 'flat'
    ? `The overall trajectory is flat across ${monthLabel(months[0])}–${monthLabel(months[months.length - 1])} (${fmtNum(Math.abs(trend.pctPerMonth), 1)}% per month drift).`
    : `The overall trajectory is ${dir} at ~${fmtNum(Math.abs(trend.pctPerMonth), 1)}% per month across ${monthLabel(months[0])}–${monthLabel(months[months.length - 1])}.`;
  if (Number.isFinite(recentPct)) {
    text += ` The last 3 months run ${pct(Math.abs(recentPct))} ${recentPct >= 0 ? 'above' : 'below'} the prior 3.`;
  }
  return text;
}

/** Seasonal profile from calendar-month means → peak + trough months. */
export function seasonalPeakInsight(byMonth, monthNames) {
  if (!byMonth?.some((v) => v !== null && v > 0)) return null;
  const known = byMonth.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
  if (known.length < 4) return null;
  const mean = known.reduce((a, x) => a + x.v, 0) / known.length;
  if (mean <= 0) return null;
  const peak = known.reduce((a, x) => (x.v > a.v ? x : a));
  const trough = known.reduce((a, x) => (x.v < a.v ? x : a));
  return `Seasonal peak is ${monthNames[peak.i]} at ${fmtNum(peak.v / mean, 1)}× the monthly average; `
    + `${monthNames[trough.i]} is the quietest month (${pct((1 - trough.v / mean) * 100, 0)} below average).`;
}

/** Anomaly summary for the strip → count + the most recent flagged month. */
export function anomalySummaryInsight(months, anomalies) {
  if (!months?.length) return null;
  if (!anomalies?.length) return 'No statistically anomalous months in this window (trailing z-score, |z| ≥ 2).';
  const last = anomalies[anomalies.length - 1];
  const plural = anomalies.length === 1 ? 'month is' : 'months are';
  return `${anomalies.length} ${plural} statistically anomalous (|z| ≥ 2 vs the trailing year); `
    + `most recent: ${monthLabel(months[last.index])}, ${last.dir === 'up' ? 'a spike' : 'a drop'} at z = ${fmtNum(last.z, 1)}.`;
}

/** Compared series → biggest riser + biggest faller (last 3 vs prior 3 months). */
export function riserFallerInsight(cells) {
  const rated = (cells || []).filter((c) => Number.isFinite(c.deltaPct) && c.total >= 10);
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => b.deltaPct - a.deltaPct);
  const up = sorted[0];
  const down = sorted[sorted.length - 1];
  let text = `Fastest riser among compared series: ${up.label} (${up.deltaPct >= 0 ? '+' : '−'}${pct(Math.abs(up.deltaPct))} last 3 months vs prior 3)`;
  if (down !== up && down.deltaPct < 0) {
    text += `; biggest faller: ${down.label} (−${pct(Math.abs(down.deltaPct))})`;
  }
  return `${text}.`;
}

/** Decomposition panel → strength split, seasonal peak month, level shifts. */
export function decompositionInsight(months, dec, changepoints, monthNames) {
  if (!months?.length || !dec) return null;
  const seasonalPct = Math.round(dec.strengthSeasonal * 100);
  const trendPct = Math.round(dec.strengthTrend * 100);
  const peakM = dec.seasonalIdx.indexOf(Math.max(...dec.seasonalIdx));
  let text = `Seasonality explains ~${seasonalPct}% and the underlying trend ~${trendPct}% of month-to-month variation; `
    + `the recurring seasonal peak lands in ${monthNames[peakM]}.`;
  if (changepoints?.length) {
    const last = changepoints[changepoints.length - 1];
    const step = Number.isFinite(last.shiftPct)
      ? ` (${last.dir === 'up' ? '+' : '−'}${pct(Math.abs(last.shiftPct), 0)} step in the 6-month means)`
      : '';
    text += ` ${changepoints.length === 1 ? 'One level shift' : `${changepoints.length} level shifts`} detected — most recent around ${monthLabel(months[last.index])}${step}.`;
  } else {
    text += ' No structural level shifts detected in this window.';
  }
  if (dec.outliers?.length) {
    const o = dec.outliers[dec.outliers.length - 1];
    text += ` After removing trend and season, ${monthLabel(months[o.index])} still stands out (residual z = ${fmtNum(o.z, 1)}).`;
  }
  return text;
}

/** Changepoint toggle on the monthly lines → sentence per detected shift. */
export function changepointInsight(months, changepoints) {
  if (!months?.length) return null;
  if (!changepoints?.length) return 'No statistically supported level shifts in this window (binary segmentation on squared error).';
  const parts = changepoints.map((c) => {
    const step = Number.isFinite(c.shiftPct)
      ? ` — the 6-month mean steps ${c.dir === 'up' ? 'up' : 'down'} ${pct(Math.abs(c.shiftPct), 0)}`
      : '';
    return `${monthLabel(months[c.index])}${step}`;
  });
  return `${changepoints.length === 1 ? 'Level shift' : 'Level shifts'} detected at ${parts.join('; ')}.`;
}

/** Socio-economic scatter → correlation strength + largest positive residual. */
export function socioInsight(points, metricLabel, fit) {
  if (!fit || !points?.length) return null;
  const a = Math.abs(fit.r);
  const strength = a >= 0.7 ? 'strongly' : a >= 0.4 ? 'moderately' : a >= 0.2 ? 'weakly' : 'barely';
  let text = `Across ${points.length} districts, the case rate per lakh ${strength} `
    + `${fit.r >= 0 ? 'rises' : 'falls'} with ${metricLabel} (r = ${fmtNum(fit.r, 2)}).`;
  const withResid = points
    .map((p) => ({ ...p, resid: p.y - (fit.slope * p.x + fit.intercept) }))
    .sort((x, y) => y.resid - x.resid);
  const top = withResid[0];
  if (top && top.resid > 0) {
    text += ` ${top.name} sits furthest above the fitted line (+${fmtNum(top.resid, 1)} per lakh vs expected) — worth a closer look beyond demographics.`;
  }
  return text;
}

/** Crime-mix radar → most over- and under-indexed heads vs the state mix. */
export function mixInsight(name, rows) {
  const rated = (rows || []).filter((r) => Number.isFinite(r.ratio) && r.base >= 1);
  if (!rated.length) return null;
  const sorted = [...rated].sort((a, b) => b.ratio - a.ratio);
  const over = sorted[0];
  const under = sorted[sorted.length - 1];
  let text = `${name}'s crime mix over-indexes on ${over.head} at ${fmtNum(over.ratio, 1)}× the state share`;
  if (under !== over && under.ratio < 1) {
    text += `, while ${under.head} runs ${pct((1 - under.ratio) * 100, 0)} below the state share`;
  }
  return `${text}.`;
}

/** District comparison bars → leader vs state median + sharpest MoM rise. */
export function districtInsight(rows, metric) {
  if (!rows?.length) return null;
  const val = metric === 'rate'
    ? (r) => Number(r.ratePerLakh) || 0
    : (r) => Number(r.caseCount) || 0;
  const sorted = [...rows].filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a));
  if (!sorted.length) return null;
  const top = sorted[0];
  const median = val(sorted[Math.floor(sorted.length / 2)]);
  let text = metric === 'rate'
    ? `${top.districtName} has the highest rate at ${fmtNum(val(top), 1)} cases per lakh`
    : `${top.districtName} registers the most cases (${fmtInt(val(top))})`;
  if (median > 0 && sorted.length > 2) text += ` — ${fmtNum(val(top) / median, 1)}× the state median`;
  const risers = rows.filter((r) => Number.isFinite(Number(r.momDeltaPct)) && Number(r.momDeltaPct) > 0);
  if (risers.length) {
    const r = [...risers].sort((a, b) => Number(b.momDeltaPct) - Number(a.momDeltaPct))[0];
    text += `; sharpest MoM rise is ${r.districtName} (+${pct(Number(r.momDeltaPct))})`;
  }
  return `${text}.`;
}
