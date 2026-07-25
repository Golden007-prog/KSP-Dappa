// Trends — deterministic insight-sentence builders + festival-month calendar.
// Pure functions over the normalized hook shapes (client/CONTRACT.md); every
// sentence is templated straight from the data — no AI/LLM calls involved.
// Each builder takes the `t` from useT() so the sentence is assembled from
// locale templates instead of concatenated English (the {slots} carry the
// numbers, which lib/format.js has already rendered in the active script).
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';

// Months containing Ugadi / Dasara (Vijayadashami) / Deepavali, from the real
// festival dates 2021–2026, at the chart's monthly grain. In some years Dasara
// and Deepavali fall in the same calendar month and share one shaded band.
// Values are `trends.festival.*` key suffixes — the chart translates them.
export const FESTIVAL_MONTHS = {
  '2021-04': 'ugadi',
  '2021-10': 'dasara',
  '2021-11': 'deepavali',
  '2022-04': 'ugadi',
  '2022-10': 'dasaraDeepavali',
  '2023-03': 'ugadi',
  '2023-10': 'dasara',
  '2023-11': 'deepavali',
  '2024-04': 'ugadi',
  '2024-10': 'dasaraDeepavali',
  '2025-03': 'ugadi',
  '2025-10': 'dasaraDeepavali',
  '2026-03': 'ugadi',
  '2026-10': 'dasara',
  '2026-11': 'deepavali',
};

const pct = (v, digits = 1) => fmtPct(v, { fraction: false, digits });
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/** Seasonality heatmap → peak cell vs the hourly average + night-share. */
export function seasonalityInsight(s, t, dayLabel) {
  if (!s || !s.max || !Array.isArray(s.matrix) || !s.matrix.length) return null;
  if (!t) return null;
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
  return t('trends.insight.seasonality', {
    day: dayLabel ? dayLabel(s.days[peak.d], peak.d) : s.days[peak.d],
    from: hh(peak.h),
    to: hh((peak.h + 1) % 24),
    ratio: fmtNum(ratio, 1),
    pct: pct((night / total) * 100, 0),
  });
}

/** Monthly multi-line → leading head, latest MoM, festival-vs-normal delta.
 * Series entries may carry a translated `label`; `name` is the API string. */
export function monthlyInsight(months, series, t) {
  if (!months?.length || !series?.length || !t) return null;
  const totals = months.map((_, i) => series.reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  if (!grand) return null;
  const sums = series
    .map((s) => ({
      name: s.label || s.name,
      sum: (s.data || []).reduce((a, v) => a + (Number(v) || 0), 0),
    }))
    .sort((a, b) => b.sum - a.sum);
  const top = sums[0];
  let text = t('trends.insight.monthly.lead', { head: top.name, n: fmtInt(top.sum) });
  if (totals.length >= 2 && totals[totals.length - 2] > 0) {
    const prev = totals[totals.length - 2];
    const mom = ((totals[totals.length - 1] - prev) / prev) * 100;
    text += ` ${t(mom >= 0 ? 'trends.insight.monthly.momUp' : 'trends.insight.monthly.momDown', {
      month: monthLabel(months[months.length - 1]),
      pct: pct(Math.abs(mom)),
    })}`;
  }
  const fest = [];
  const rest = [];
  months.forEach((ym, i) => (FESTIVAL_MONTHS[ym] ? fest : rest).push(totals[i]));
  if (fest.length && rest.length) {
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const restMean = mean(rest);
    if (restMean > 0) {
      const d = ((mean(fest) - restMean) / restMean) * 100;
      text += ` ${t(d >= 0 ? 'trends.insight.monthly.festAbove' : 'trends.insight.monthly.festBelow', {
        pct: pct(Math.abs(d)),
      })}`;
    }
  }
  return text;
}

/** Category-share donut → dominant head, top-3 concentration, fastest riser.
 * `nameOf(item)` resolves the displayed head name (tName in the caller). */
export function shareInsight(items, t, nameOf) {
  if (!items?.length || !t) return null;
  const label = (r) => (nameOf ? nameOf(r) : r.name);
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  if (!top.count) return null;
  let text = Number.isFinite(top.sharePct)
    ? t('trends.insight.share.leadPct', { head: label(top), pct: pct(top.sharePct) })
    : t('trends.insight.share.leadCount', { head: label(top), n: fmtInt(top.count) });
  if (sorted.length > 3) {
    const top3 = sorted.slice(0, 3).reduce((a, r) => a + (Number(r.sharePct) || 0), 0);
    if (top3 > 0) text += t('trends.insight.share.top3', { pct: pct(top3, 0) });
  }
  const risers = sorted.filter((r) => Number.isFinite(Number(r.deltaPct)) && Number(r.deltaPct) > 0);
  if (risers.length) {
    const r = risers.sort((a, b) => Number(b.deltaPct) - Number(a.deltaPct))[0];
    text += t('trends.insight.share.riser', { head: label(r), pct: pct(Number(r.deltaPct)) });
  }
  return `${text}.`;
}

// ---------------------------------------------------------------------------
// Deep-dive additions (all deterministic — computed via ./analysis.js helpers)
// ---------------------------------------------------------------------------

/** Overall trajectory: least-squares direction + last-3-vs-prior-3 momentum. */
export function trendDirectionInsight(months, values, trend, recentPct, t) {
  if (!months?.length || !trend || !t) return null;
  const dir = Math.abs(trend.pctPerMonth) < 0.5 ? 'flat'
    : trend.pctPerMonth > 0 ? 'rising' : 'falling';
  let text = t(`trends.insight.trend.${dir}`, {
    from: monthLabel(months[0]),
    to: monthLabel(months[months.length - 1]),
    pct: fmtNum(Math.abs(trend.pctPerMonth), 1),
  });
  if (Number.isFinite(recentPct)) {
    text += ` ${t(recentPct >= 0 ? 'trends.insight.trend.recentAbove' : 'trends.insight.trend.recentBelow', {
      pct: pct(Math.abs(recentPct)),
    })}`;
  }
  return text;
}

/** Seasonal profile from calendar-month means → peak + trough months. */
export function seasonalPeakInsight(byMonth, monthNames, t) {
  if (!byMonth?.some((v) => v !== null && v > 0) || !t) return null;
  const known = byMonth.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
  if (known.length < 4) return null;
  const mean = known.reduce((a, x) => a + x.v, 0) / known.length;
  if (mean <= 0) return null;
  const peak = known.reduce((a, x) => (x.v > a.v ? x : a));
  const trough = known.reduce((a, x) => (x.v < a.v ? x : a));
  return t('trends.insight.seasonalPeak', {
    peak: monthNames[peak.i],
    ratio: fmtNum(peak.v / mean, 1),
    trough: monthNames[trough.i],
    pct: pct((1 - trough.v / mean) * 100, 0),
  });
}

/** Anomaly summary for the strip → count + the most recent flagged month. */
export function anomalySummaryInsight(months, anomalies, t) {
  if (!months?.length || !t) return null;
  if (!anomalies?.length) return t('trends.insight.anomaly.none');
  const last = anomalies[anomalies.length - 1];
  const vars = {
    n: fmtInt(anomalies.length),
    month: monthLabel(months[last.index]),
    kind: t(last.dir === 'up' ? 'trends.insight.anomaly.spike' : 'trends.insight.anomaly.drop'),
    z: fmtNum(last.z, 1),
  };
  return t(anomalies.length === 1 ? 'trends.insight.anomaly.one' : 'trends.insight.anomaly.many', vars);
}

/** Compared series → biggest riser + biggest faller (last 3 vs prior 3 months). */
export function riserFallerInsight(cells, t) {
  const rated = (cells || []).filter((c) => Number.isFinite(c.deltaPct) && c.total >= 10);
  if (rated.length < 2 || !t) return null;
  const sorted = [...rated].sort((a, b) => b.deltaPct - a.deltaPct);
  const up = sorted[0];
  const down = sorted[sorted.length - 1];
  let text = t('trends.insight.riser.up', {
    label: up.label,
    delta: `${up.deltaPct >= 0 ? '+' : '−'}${pct(Math.abs(up.deltaPct))}`,
  });
  if (down !== up && down.deltaPct < 0) {
    text += t('trends.insight.riser.down', { label: down.label, pct: pct(Math.abs(down.deltaPct)) });
  }
  return `${text}.`;
}

/** Decomposition panel → strength split, seasonal peak month, level shifts. */
export function decompositionInsight(months, dec, changepoints, monthNames, t) {
  if (!months?.length || !dec || !t) return null;
  const peakM = dec.seasonalIdx.indexOf(Math.max(...dec.seasonalIdx));
  let text = t('trends.insight.decomp.main', {
    seasonal: Math.round(dec.strengthSeasonal * 100),
    trend: Math.round(dec.strengthTrend * 100),
    month: monthNames[peakM],
  });
  if (changepoints?.length) {
    const last = changepoints[changepoints.length - 1];
    const step = Number.isFinite(last.shiftPct)
      ? t('trends.insight.decomp.step', {
        delta: `${last.dir === 'up' ? '+' : '−'}${pct(Math.abs(last.shiftPct), 0)}`,
      })
      : '';
    text += ` ${t(changepoints.length === 1 ? 'trends.insight.decomp.shiftOne' : 'trends.insight.decomp.shiftMany', {
      n: fmtInt(changepoints.length),
      month: monthLabel(months[last.index]),
      step,
    })}`;
  } else {
    text += ` ${t('trends.insight.decomp.noShift')}`;
  }
  if (dec.outliers?.length) {
    const o = dec.outliers[dec.outliers.length - 1];
    text += ` ${t('trends.insight.decomp.outlier', {
      month: monthLabel(months[o.index]),
      z: fmtNum(o.z, 1),
    })}`;
  }
  return text;
}

/** Changepoint toggle on the monthly lines → sentence per detected shift. */
export function changepointInsight(months, changepoints, t) {
  if (!months?.length || !t) return null;
  if (!changepoints?.length) return t('trends.insight.changepoint.none');
  const parts = changepoints.map((c) => {
    const step = Number.isFinite(c.shiftPct)
      ? t(c.dir === 'up' ? 'trends.insight.changepoint.stepUp' : 'trends.insight.changepoint.stepDown', {
        pct: pct(Math.abs(c.shiftPct), 0),
      })
      : '';
    return `${monthLabel(months[c.index])}${step}`;
  });
  return t(changepoints.length === 1 ? 'trends.insight.changepoint.one' : 'trends.insight.changepoint.many', {
    parts: parts.join('; '),
  });
}

/** Socio-economic scatter → correlation strength + largest positive residual. */
export function socioInsight(points, metricLabel, fit, t) {
  if (!fit || !points?.length || !t) return null;
  const a = Math.abs(fit.r);
  const word = a >= 0.7 ? 'strongly' : a >= 0.4 ? 'moderately' : a >= 0.2 ? 'weakly' : 'barely';
  let text = t(fit.r >= 0 ? 'trends.insight.socio.rises' : 'trends.insight.socio.falls', {
    n: fmtInt(points.length),
    strength: t(`trends.insight.socio.${word}`),
    metric: metricLabel,
    r: fmtNum(fit.r, 2),
  });
  const withResid = points
    .map((p) => ({ ...p, resid: p.y - (fit.slope * p.x + fit.intercept) }))
    .sort((x, y) => y.resid - x.resid);
  const top = withResid[0];
  if (top && top.resid > 0) {
    text += ` ${t('trends.insight.socio.resid', { name: top.name, value: fmtNum(top.resid, 1) })}`;
  }
  return text;
}

/** Crime-mix radar → most over- and under-indexed heads vs the state mix.
 * Rows may carry a translated `headLabel`; `head` is the API string. */
export function mixInsight(name, rows, t) {
  const rated = (rows || []).filter((r) => Number.isFinite(r.ratio) && r.base >= 1);
  if (!rated.length || !t) return null;
  const label = (r) => r.headLabel || r.head;
  const sorted = [...rated].sort((a, b) => b.ratio - a.ratio);
  const over = sorted[0];
  const under = sorted[sorted.length - 1];
  let text = t('trends.insight.mix.over', {
    name,
    head: label(over),
    ratio: fmtNum(over.ratio, 1),
  });
  if (under !== over && under.ratio < 1) {
    text += t('trends.insight.mix.under', {
      head: label(under),
      pct: pct((1 - under.ratio) * 100, 0),
    });
  }
  return `${text}.`;
}

/** District comparison bars → leader vs state median + sharpest MoM rise. */
export function districtInsight(rows, metric, t, tName) {
  if (!rows?.length || !t) return null;
  const name = (r) => (tName ? tName('districts', r.districtId, r.districtName) : r.districtName);
  const val = metric === 'rate'
    ? (r) => Number(r.ratePerLakh) || 0
    : (r) => Number(r.caseCount) || 0;
  const sorted = [...rows].filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a));
  if (!sorted.length) return null;
  const top = sorted[0];
  const median = val(sorted[Math.floor(sorted.length / 2)]);
  let text = metric === 'rate'
    ? t('trends.insight.district.rate', { name: name(top), value: fmtNum(val(top), 1) })
    : t('trends.insight.district.cases', { name: name(top), value: fmtInt(val(top)) });
  if (median > 0 && sorted.length > 2) {
    text += t('trends.insight.district.median', { ratio: fmtNum(val(top) / median, 1) });
  }
  const risers = rows.filter((r) => Number.isFinite(Number(r.momDeltaPct)) && Number(r.momDeltaPct) > 0);
  if (risers.length) {
    const r = [...risers].sort((a, b) => Number(b.momDeltaPct) - Number(a.momDeltaPct))[0];
    text += t('trends.insight.district.riser', { name: name(r), pct: pct(Number(r.momDeltaPct)) });
  }
  return `${text}.`;
}
