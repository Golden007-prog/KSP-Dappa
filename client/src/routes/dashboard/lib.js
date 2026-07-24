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
 * so every chip always produces a real answer. */
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
 */
export function buildTrendOption(t, mode = 'stacked', narrow = false) {
  if (!t || !Array.isArray(t.months) || !t.months.length) return null;
  const months = t.months.slice(-12);
  const offset = t.months.length - months.length;
  const series = (t.series || []).map((s) => ({
    name: s.name,
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
