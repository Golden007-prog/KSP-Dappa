// Dashboard route-local helpers — KPI scale contract, choropleth legend ramp,
// month-vs-month compare view, trend option builder, curated omnibox questions,
// and two tiny hooks (localStorage-persisted state, matchMedia).
import { useCallback, useEffect, useState } from 'react';
import { fmtInt, monthLabel } from '../../lib/format.js';
import { PALETTES } from '../../components/MiniChoropleth.jsx';

/**
 * /summary/kpis detectionRate is a PERCENT (0–100) — the server computes
 * round(A/(A+C)*100, 1) in functions/dappa_api/lib/routes/read.js. Render it
 * as-is (clamped); no "≤1 must be a ratio" guessing, so a genuine 1% detection
 * rate no longer displays as 100%.
 */
export function detectionRatePct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

/** Legend gradient endpoints — derived from the exported PALETTES ramp in
 * src/components/MiniChoropleth.jsx so the map and its legend can never drift. */
const hexOf = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const CHORO_RAMP = {
  dark: { low: hexOf(PALETTES.dark.low), high: hexOf(PALETTES.dark.high) },
  light: { low: hexOf(PALETTES.light.low), high: hexOf(PALETTES.light.high) },
};

/** Curated demo questions — all covered by the backend's canned-utterance
 * grammar (functions/dappa_api/lib/copilot.js) AND the static-demo snapshot,
 * so every chip always produces a real answer. These stay ENGLISH: they are
 * the utterance sent to /copilot, whose parser is English-only. OmniBox shows
 * the translated label from t('dashboard.omni.q<n>') in the same order. */
export const CURATED_QUESTIONS = [
  'chain snatching in Mysuru City last 3 months',
  'top 5 districts for vehicle theft this year',
  'which stations are highest risk next month?',
  'compare murders 2024 vs 2025 in Belagavi',
];

/**
 * buildCompareView(trendsMonthlyData) → CompareStrip view or null.
 * { curYm, prevYm, total:{cur,prev,delta}, items:[{name,cur,prev,delta}] }
 * items sorted biggest riser first; deltas are signed percents. Computed once
 * here so the strip render and its CSV export share the exact same numbers.
 */
export function buildCompareView(t) {
  if (!t || !Array.isArray(t.months) || t.months.length < 2) return null;
  const n = t.months.length;
  const curYm = t.months[n - 1];
  const prevYm = t.months[n - 2];
  const pctDelta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);
  const items = (t.series || [])
    .map((s) => {
      const cur = Number(s.data?.[n - 1]) || 0;
      const prev = Number(s.data?.[n - 2]) || 0;
      return { name: s.name, cur, prev, delta: pctDelta(cur, prev) };
    })
    .filter((it) => it.cur > 0 || it.prev > 0)
    .sort((a, b) => b.delta - a.delta || b.cur - a.cur);
  if (!items.length) return null;
  const cur = items.reduce((a, it) => a + it.cur, 0);
  const prev = items.reduce((a, it) => a + it.prev, 0);
  return { curYm, prevYm, items, total: { cur, prev, delta: pctDelta(cur, prev) } };
}

/**
 * ECharts option for the 12-month trend in one of three modes:
 *   'stacked' — stacked bars (absolute counts)
 *   'share'   — 100% stacked bars (per-month percent share)
 *   'line'    — one smoothed line per crime head
 * `narrow` tunes labels/grid for <480px viewports (rotated month labels).
 * `headLabel` (optional) maps the English head name the API returns to its
 * name in the active language — the caller owns the lookup, this module is
 * plain JS and never calls a hook.
 */
export function buildTrendOption(data, mode = 'stacked', narrow = false, headLabel = (n) => n) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return null;
  const months = data.months.slice(-12);
  const offset = data.months.length - months.length;
  const series = (data.series || []).map((s) => ({
    name: headLabel(s.name),
    data: (s.data || []).slice(offset).map((v) => Number(v) || 0),
  }));
  let out;
  if (mode === 'share') {
    const totals = months.map((_, i) => series.reduce((a, s) => a + s.data[i], 0));
    out = series.map((s) => ({
      name: s.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 20,
      emphasis: { focus: 'series' },
      data: s.data.map((v, i) => (totals[i] > 0 ? Number(((v / totals[i]) * 100).toFixed(1)) : 0)),
    }));
  } else if (mode === 'line') {
    out = series.map((s) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      emphasis: { focus: 'series' },
      data: s.data,
    }));
  } else {
    out = series.map((s) => ({
      name: s.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 20,
      emphasis: { focus: 'series' },
      data: s.data,
    }));
  }
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: mode === 'line' ? 'line' : 'shadow' },
      valueFormatter: (v) => (mode === 'share' ? `${v}%` : fmtInt(v)),
    },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 44, right: 12, top: 16, bottom: narrow ? 48 : 34 },
    xAxis: {
      type: 'category',
      data: months.map(monthLabel),
      axisLabel: narrow ? { rotate: 45, fontSize: 10 } : {},
    },
    yAxis: {
      type: 'value',
      max: mode === 'share' ? 100 : undefined,
      axisLabel: mode === 'share' ? { formatter: '{value}%' } : {},
    },
    series: out,
  };
}

/**
 * 'Total' trend mode — one line for total FIRs over the FULL history (not the
 * 12-month clip), a 3-month rolling mean, red 2σ spike dots and, when the
 * /forecast payload is supplied, a dashed projection with its confidence band.
 * extras: { narrow?, forecast?: {history, forecast, model, mape}, spikes?, t }.
 * `t` is the caller's useT() translator — the fixed series names are UI copy.
 */
export function buildTotalTrendOption(data, { narrow = false, forecast = null, spikes = [], t } = {}) {
  if (!data || !Array.isArray(data.months) || !data.months.length) return null;
  const tr = t || ((k) => k);
  const months = data.months.slice();
  const totals = months.map((_, i) => (data.series || []).reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
  const fc = (forecast?.forecast || []).filter((f) => f && f.ym && !months.includes(f.ym));
  const axis = [...months, ...fc.map((f) => f.ym)];
  const n = months.length;

  const roll = totals.map((_, i) => {
    if (i < 2) return null;
    return Math.round((totals[i] + totals[i - 1] + totals[i - 2]) / 3);
  });

  const pad = (arr) => [...arr, ...fc.map(() => null)];
  const ciLowName = tr('dashboard.series.ciLow');
  const series = [
    {
      name: tr('dashboard.series.totalFirs'),
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.08 },
      data: pad(totals),
    },
    {
      name: tr('dashboard.series.rollingMean'),
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { type: 'dashed', width: 1.5 },
      data: pad(roll),
    },
  ];
  if (spikes.length) {
    series.push({
      name: tr('dashboard.series.spike'),
      type: 'scatter',
      symbolSize: 8,
      itemStyle: { color: '#E5484D' },
      data: spikes.map((s) => [s.index, totals[s.index]]),
      tooltip: { valueFormatter: (v) => fmtInt(Array.isArray(v) ? v[1] : v) },
    });
  }
  if (fc.length) {
    const bridge = totals[n - 1];
    series.push({
      name: tr('dashboard.series.forecast'),
      type: 'line',
      smooth: true,
      lineStyle: { type: 'dashed' },
      symbolSize: 5,
      data: [...totals.map((_, i) => (i === n - 1 ? bridge : null)), ...fc.map((f) => Math.round(Number(f.predicted) || 0))],
    });
    const hasBand = fc.some((f) => Number.isFinite(Number(f.lo)) && Number.isFinite(Number(f.hi)));
    if (hasBand) {
      series.push({
        name: ciLowName,
        type: 'line',
        stack: 'ci',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
        data: [...months.map(() => null), ...fc.map((f) => Math.round(Number(f.lo) || 0))],
      });
      series.push({
        name: tr('dashboard.series.ciBand'),
        type: 'line',
        stack: 'ci',
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0.14 },
        data: [...months.map(() => null), ...fc.map((f) => Math.max(0, Math.round((Number(f.hi) || 0) - (Number(f.lo) || 0))))],
        tooltip: { show: false },
      });
    }
  }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, valueFormatter: (v) => fmtInt(v) },
    legend: { bottom: 0, type: 'scroll', data: series.map((s) => s.name).filter((x) => x !== ciLowName) },
    grid: { left: 48, right: 12, top: 16, bottom: narrow ? 48 : 34 },
    xAxis: {
      type: 'category',
      data: axis.map(monthLabel),
      axisLabel: narrow ? { rotate: 45, fontSize: 10 } : {},
    },
    yAxis: { type: 'value' },
    series,
  };
}

/**
 * Add a month-range brush (dataZoom slider) to a trend option. The legend
 * moves to the top so the slider owns the bottom edge. Returns a new option.
 */
export function withBrush(option, narrow = false) {
  if (!option) return option;
  return {
    ...option,
    legend: { ...(option.legend || {}), top: 0, bottom: undefined },
    grid: { ...(option.grid || {}), top: 40, bottom: narrow ? 66 : 56 },
    dataZoom: [
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 6, brushSelect: false },
      // shift+wheel zooms; plain wheel keeps scrolling the page
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false },
    ],
  };
}

/** useState persisted in localStorage (JSON). Storage failures degrade to
 * in-memory state — never a crash in private mode. */
export function useLocalPref(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
      return v;
    });
  }, [key]);
  return [value, set];
}

/** Reactive matchMedia — e.g. useMedia('(max-width: 480px)'). */
export function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
