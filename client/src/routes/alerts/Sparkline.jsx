// Observed-vs-expected sparkline for an alert card.
// Amber line = observed history; teal band = expected ±2σ (σ recovered from
// |observed − expected| / |z|); dashed line = expected; red dot = latest period.
// Theme-aware: colors follow the active app theme (light uses the darker AA
// siblings and a white dot ring); the canvas is aria-hidden behind a text
// alternative on the wrapper.
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Side-effect import: registers the shared 'dappa'/'dappa-light' echarts themes.
import '../../components/ChartPanel.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';

export default function Sparkline({ alert, height = 72 }) {
  const { theme } = useTheme();
  const light = theme === 'light';
  const vals = (alert.sparkline || []).map((v) => Number(v) || 0);
  const observed = Number(alert.observed);
  const expected = Number(alert.expected);
  const z = Number(alert.zScore);
  if (!vals.length && Number.isFinite(observed)) vals.push(observed);
  if (!vals.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-lg border border-grid/60 text-[11px] text-muted">
        no history
      </div>
    );
  }

  let lo = null;
  let hi = null;
  if (Number.isFinite(expected) && Number.isFinite(observed) && Number.isFinite(z) && Math.abs(z) > 0.01) {
    const sigma = Math.abs(observed - expected) / Math.abs(z);
    lo = Math.max(0, expected - 2 * sigma);
    hi = expected + 2 * sigma;
  }
  const yMax = Math.max(...vals, hi ?? 0, Number.isFinite(observed) ? observed : 0) * 1.15 || 1;

  // Light theme uses the AA-contrast siblings from ChartPanel's light palette;
  // the latest-period dot ring matches the card surface in either theme.
  const lineColor = light ? '#D97706' : '#F5A623';
  const dotRing = light ? '#FFFFFF' : '#111A2C';
  const expectedColor = light ? '#5C6B84' : '#8A94A8';
  const bandColor = light ? 'rgba(15, 118, 110, 0.12)' : 'rgba(45, 212, 191, 0.10)';

  const option = {
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (ps) => `${ps[0].value} cases`,
    },
    grid: { left: 4, right: 4, top: 6, bottom: 4 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: vals.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0, max: yMax },
    series: [{
      type: 'line',
      data: vals,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      markPoint: {
        silent: true,
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: '#E5484D', borderColor: dotRing, borderWidth: 2 },
        label: { show: false },
        data: [{ coord: [vals.length - 1, vals[vals.length - 1]] }],
      },
      ...(lo !== null ? {
        markArea: {
          silent: true,
          itemStyle: { color: bandColor },
          data: [[{ yAxis: lo }, { yAxis: hi }]],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: expectedColor, width: 1 },
          label: { show: false },
          data: [{ yAxis: expected }],
        },
      } : {}),
    }],
  };

  const alt = Number.isFinite(observed) && Number.isFinite(expected)
    ? `Trend chart: observed ${fmtInt(observed)} vs expected ${fmtInt(expected)}${Number.isFinite(z) ? `, z-score ${fmtNum(z, 1)}` : ''}, over ${vals.length} periods`
    : `Trend chart over ${vals.length} periods`;

  return (
    <div role="img" aria-label={alt}>
      <div aria-hidden="true">
        <ReactECharts
          key={theme}
          echarts={echarts}
          theme={light ? 'dappa-light' : 'dappa'}
          option={option}
          notMerge
          style={{ height, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
}
