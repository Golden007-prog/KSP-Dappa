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
