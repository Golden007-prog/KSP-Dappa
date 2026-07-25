// ECharts risk gauge (0–100) for the Offender 360 identity header.
// Segment thresholds match RiskBadge: <40 teal, 40–69 amber, ≥70 red.
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Side-effect import: registers the shared 'dappa' / 'dappa-light' themes.
import '../../components/ChartPanel.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const TONES = {
  dark: { teal: '#2DD4BF', amber: '#F5A623', red: '#E5484D', ink: '#E6EAF2' },
  light: { teal: '#0F766E', amber: '#D97706', red: '#DC2626', ink: '#131B2E' },
};

export default function RiskGauge({ score, height = 150 }) {
  const { theme } = useTheme();
  const t = useT();
  const tone = TONES[theme] || TONES.dark;
  const n = Number(score);

  if (!Number.isFinite(n)) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center rounded-lg border border-grid/60 text-muted">
        <span className="text-2xl num">—</span>
        <span className="text-[10px] uppercase tracking-wide mt-1">{t('network.gauge.caption')}</span>
      </div>
    );
  }

  const v = Math.max(0, Math.min(100, n));
  const valueColor = v >= 70 ? tone.red : v >= 40 ? tone.amber : tone.teal;
  const option = {
    animationDuration: 600,
    series: [{
      type: 'gauge',
      startAngle: 205,
      endAngle: -25,
      min: 0,
      max: 100,
      radius: '98%',
      center: ['50%', '60%'],
      axisLine: { lineStyle: { width: 10, color: [[0.4, tone.teal], [0.7, tone.amber], [1, tone.red]] } },
      pointer: { length: '60%', width: 4, itemStyle: { color: tone.ink } },
      anchor: { show: true, size: 7, itemStyle: { color: tone.ink } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (val) => fmtNum(val, 1),
        fontSize: 22,
        fontWeight: 600,
        color: valueColor,
        offsetCenter: [0, '42%'],
      },
      title: { show: false },
      data: [{ value: v }],
    }],
  };

  return (
    <div role="img" aria-label={t('network.gauge.aria', { score: fmtNum(v, 1) })}>
      <ReactECharts
        echarts={echarts}
        theme={theme === 'light' ? 'dappa-light' : 'dappa'}
        option={option}
        notMerge
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      <p className="text-center text-[10px] uppercase tracking-wide text-muted -mt-2">{t('network.gauge.scaleCaption')}</p>
    </div>
  );
}
