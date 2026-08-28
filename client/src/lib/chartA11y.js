// Chart accessibility helpers shared by every ECharts surface (ChartPanel,
// DashChart, ChartBody, CopilotChart, OutcomePanel).
//
//   withChartAria(option, { description, decal })
//       Merges ECharts' `aria` component into an option: aria.enabled makes
//       ECharts stamp role="img" + a generated aria-label on its container
//       (lib/visual/aria.js), aria.decal overlays pattern fills so series are
//       told apart without colour (WCAG 1.4.1 / G111; survives a mono
//       printer). ECharts' built-in label text is English only, so callers
//       pass `description` from describeChart() to get the UI language.
//       An option that already carries `aria` is returned untouched.
//   optionToTable(option)
//       Extracts { columns, rows, kind } from the common series shapes
//       (category axis + line/bar/scatter, pie, radar, heatmap, gauge, plain
//       [x, y] pairs) for the Table view (WCAG 1.1.1 long description). Returns
//       null when nothing tabular can be read, so callers can hide the toggle.
//   describeChart(option, t, { title })
//       Short localized summary: chart kind, series count, category span and
//       per-series min/max — the aria-label and the table caption.
//
// Pure functions, no React, no DOM.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function pointValue(p) {
  if (p === null || p === undefined) return null;
  if (typeof p === 'number' || typeof p === 'string') return num(p);
  if (Array.isArray(p)) return num(p[p.length - 1]);
  if (typeof p === 'object') return num(p.value !== undefined ? (Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value) : null);
  return null;
}

function pointName(p, i, cats) {
  if (p && typeof p === 'object' && !Array.isArray(p) && p.name !== undefined) return String(p.name);
  if (Array.isArray(p) && p.length >= 2 && typeof p[0] !== 'number') return String(p[0]);
  if (cats && cats[i] !== undefined) return String(cats[i]);
  return String(i + 1);
}

/** Series considered when the option has ≥2 colour-distinguished series. */
const DECAL_TYPES = new Set(['bar', 'pie', 'funnel', 'treemap', 'sunburst']);

export function shouldDecal(option) {
  const series = arr(option?.series).filter(Boolean);
  const decalable = series.filter((s) => DECAL_TYPES.has(s.type));
  if (!decalable.length) return false;
  if (decalable.some((s) => s.type === 'pie' && arr(s.data).length >= 2)) return true;
  return decalable.filter((s) => s.type !== 'pie').length >= 2;
}

export function withChartAria(option, { description, decal = 'auto' } = {}) {
  if (!option || typeof option !== 'object' || option.aria) return option;
  const showDecal = decal === 'auto' ? shouldDecal(option) : !!decal;
  const aria = { enabled: true };
  if (description) aria.label = { description: String(description) };
  if (showDecal) {
    aria.decal = {
      show: true,
      // subtle hatch: readable on the dark panel and in print, not a wall of stripes
      decals: [
        { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: Math.PI / 6, color: 'rgba(0,0,0,0.25)' },
        { symbol: 'circle', dashArrayX: [[8, 8], [0, 8, 8, 0]], dashArrayY: [6, 0], symbolSize: 0.7, color: 'rgba(0,0,0,0.25)' },
        { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [4, 3], rotation: -Math.PI / 4, color: 'rgba(0,0,0,0.25)' },
        { symbol: 'rect', dashArrayX: [[6, 6], [0, 6, 6, 0]], dashArrayY: [6, 0], color: 'rgba(0,0,0,0.25)' },
        { symbol: 'triangle', dashArrayX: [[9, 9], [0, 9, 9, 0]], dashArrayY: [7, 2], symbolSize: 0.75, color: 'rgba(0,0,0,0.25)' },
        { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 6], rotation: Math.PI / 2, color: 'rgba(0,0,0,0.25)' },
      ],
    };
  }
  return { ...option, aria };
}

function categoriesOf(option) {
  const x = arr(option?.xAxis)[0];
  const y = arr(option?.yAxis)[0];
  const cat = [x, y].find((a) => a && (a.type === 'category' || Array.isArray(a.data)));
  return cat ? { axis: cat === x ? 'x' : 'y', data: arr(cat.data).map((c) => (c && typeof c === 'object' ? String(c.value ?? c.name ?? '') : String(c))) } : null;
}

/** Extract a table from an option. Shape: { kind, columns: [string], rows: [[cell]] }. */
export function optionToTable(option) {
  if (!option || typeof option !== 'object') return null;
  const series = arr(option.series).filter((s) => s && Array.isArray(s.data) && s.data.length);
  if (!series.length) return null;
  const types = new Set(series.map((s) => s.type));

  // pie / funnel: one name/value list per series
  if (series.every((s) => s.type === 'pie' || s.type === 'funnel')) {
    const rows = [];
    for (const s of series) {
      for (const p of s.data) {
        const v = pointValue(p);
        rows.push([series.length > 1 ? `${s.name || ''}` : null, pointName(p), v].filter((c) => c !== null));
      }
    }
    const columns = series.length > 1 ? ['series', 'category', 'value'] : ['category', 'value'];
    return { kind: 'pie', columns, rows };
  }

  // radar: indicator names × series values
  if (types.has('radar') && series.every((s) => s.type === 'radar')) {
    const indicators = arr(arr(option.radar)[0]?.indicator).map((i) => String(i?.name ?? ''));
    const rows = [];
    for (const s of series) {
      for (const p of s.data) {
        const vals = Array.isArray(p?.value) ? p.value : Array.isArray(p) ? p : [];
        const label = p?.name || s.name || '';
        rows.push([label, ...vals.map((v) => num(v))]);
      }
    }
    return { kind: 'radar', columns: ['series', ...indicators], rows };
  }

  // gauge: a value per series
  if (series.every((s) => s.type === 'gauge')) {
    const rows = series.flatMap((s) => s.data.map((p) => [p?.name || s.name || '', pointValue(p)]));
    return { kind: 'gauge', columns: ['metric', 'value'], rows };
  }

  // heatmap: [x, y, v] triplets over category axes
  if (series.every((s) => s.type === 'heatmap')) {
    const xs = arr(arr(option.xAxis)[0]?.data).map(String);
    const ys = arr(arr(option.yAxis)[0]?.data).map(String);
    const rows = [];
    for (const s of series) {
      for (const p of s.data) {
        const v = Array.isArray(p) ? p : arr(p?.value);
        if (v.length < 3) continue;
        rows.push([xs[v[0]] ?? String(v[0]), ys[v[1]] ?? String(v[1]), num(v[2])]);
      }
    }
    return { kind: 'heatmap', columns: ['x', 'y', 'value'], rows };
  }

  // category axis + N series (line / bar / scatter / area): one row per category
  const cats = categoriesOf(option);
  if (cats && cats.data.length) {
    const rows = cats.data.map((c, i) => [c, ...series.map((s) => pointValue(s.data[i]))]);
    return { kind: 'category', columns: ['category', ...series.map((s, i) => String(s.name || `#${i + 1}`))], rows };
  }

  // [x, y] pairs (time axis / scatter): one row per point per series
  const rows = [];
  for (const s of series) {
    for (const p of s.data) {
      const xy = Array.isArray(p) ? p : Array.isArray(p?.value) ? p.value : null;
      if (!xy || xy.length < 2) continue;
      rows.push([series.length > 1 ? String(s.name || '') : null, String(xy[0]), num(xy[1])].filter((c) => c !== null));
    }
  }
  if (!rows.length) return null;
  return { kind: 'xy', columns: series.length > 1 ? ['series', 'x', 'y'] : ['x', 'y'], rows };
}

const KIND_KEY = {
  line: 'a11y.chart.kind.line', bar: 'a11y.chart.kind.bar', pie: 'a11y.chart.kind.pie', scatter: 'a11y.chart.kind.scatter',
  heatmap: 'a11y.chart.kind.heatmap', radar: 'a11y.chart.kind.radar', gauge: 'a11y.chart.kind.gauge', funnel: 'a11y.chart.kind.funnel',
};

/** Localized one-paragraph description for aria-label / table caption. */
export function describeChart(option, t, { title = '', fmt = (v) => String(v) } = {}) {
  const series = arr(option?.series).filter((s) => s && Array.isArray(s.data) && s.data.length);
  if (!series.length) return title ? t('a11y.chart.a11y.titled', { title }) : t('a11y.chart.a11y.untitled');
  const primary = series[0].type;
  const kind = t(KIND_KEY[primary] || 'a11y.chart.kind.generic');
  const parts = [];
  parts.push(title ? t('a11y.chart.a11y.head', { kind, title }) : t('a11y.chart.a11y.headNoTitle', { kind }));
  const cats = categoriesOf(option);
  if (cats && cats.data.length) {
    parts.push(t('a11y.chart.a11y.span', { n: cats.data.length, first: cats.data[0], last: cats.data[cats.data.length - 1] }));
  }
  if (series.length > 1) parts.push(t('a11y.chart.a11y.seriesCount', { n: series.length }));
  for (const s of series.slice(0, 4)) {
    const vals = s.data.map(pointValue).filter((v) => v !== null);
    if (!vals.length) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (primary === 'pie' || s.type === 'pie') {
      const top = s.data.map((p, i) => ({ name: pointName(p, i), v: pointValue(p) })).filter((p) => p.v !== null).sort((a, b) => b.v - a.v)[0];
      if (top) parts.push(t('a11y.chart.a11y.largest', { name: top.name, value: fmt(top.v) }));
    } else {
      parts.push(t('a11y.chart.a11y.range', { name: s.name || t('a11y.chart.a11y.values'), min: fmt(min), max: fmt(max) }));
    }
  }
  return parts.join(' ');
}
