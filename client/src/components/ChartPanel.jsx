// ECharts wrapper on the Command Center theme, inside a Card with
// loading/empty states. Props:
//   option        — echarts option (theme colors/text are applied for you)
//   height?       — px number, default 300
//   loading?      — show skeleton
//   empty?        — force empty state (also shown when option is falsy)
//   emptyMessage? — text under 'No data'
//   title?, subtitle?, actions? — forwarded to Card
//   onEvents?     — echarts-for-react events map, e.g. {click: fn}
//   notMerge?     — default true (option replaces previous fully)
//   className?
// Both 'dappa' (dark) and 'dappa-light' themes are registered at module load;
// the active app theme picks one and the chart re-instantiates on toggle.
// Route fillers can also `import { DAPPA_CHART_COLORS } from '../components/ChartPanel.jsx'`.
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import Card from './Card.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';
import { useTheme } from './ThemeProvider.jsx';

export const DAPPA_CHART_COLORS = [
  '#F5A623', '#2DD4BF', '#E5484D', '#7C9BFF', '#C084FC', '#F97316', '#38BDF8', '#A3E635',
];

// darker siblings that hold AA-ish contrast on white panels
export const DAPPA_CHART_COLORS_LIGHT = [
  '#D97706', '#0F766E', '#DC2626', '#2563EB', '#9333EA', '#EA580C', '#0284C7', '#65A30D',
];

echarts.registerTheme('dappa', {
  color: DAPPA_CHART_COLORS,
  backgroundColor: 'transparent',
  textStyle: { color: '#8A94A8', fontFamily: 'Inter, sans-serif' },
  title: { textStyle: { color: '#E6EAF2', fontSize: 13 }, subtextStyle: { color: '#8A94A8' } },
  legend: { textStyle: { color: '#8A94A8', fontSize: 11 }, inactiveColor: '#3a4663', itemWidth: 12, itemHeight: 8 },
  tooltip: {
    backgroundColor: '#111A2C',
    borderColor: '#1E2A44',
    textStyle: { color: '#E6EAF2', fontSize: 12 },
    axisPointer: { lineStyle: { color: '#1E2A44' }, crossStyle: { color: '#1E2A44' } },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#1E2A44' } },
    axisTick: { show: false },
    axisLabel: { color: '#8A94A8', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8A94A8', fontSize: 11 },
    splitLine: { lineStyle: { color: '#1E2A44', type: 'dashed' } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: '#1E2A44' } },
    axisLabel: { color: '#8A94A8', fontSize: 11 },
    splitLine: { show: false },
  },
});

echarts.registerTheme('dappa-light', {
  color: DAPPA_CHART_COLORS_LIGHT,
  backgroundColor: 'transparent',
  textStyle: { color: '#5C6B84', fontFamily: 'Inter, sans-serif' },
  title: { textStyle: { color: '#131B2E', fontSize: 13 }, subtextStyle: { color: '#5C6B84' } },
  legend: { textStyle: { color: '#5C6B84', fontSize: 11 }, inactiveColor: '#B9C4D8', itemWidth: 12, itemHeight: 8 },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE3F0',
    textStyle: { color: '#131B2E', fontSize: 12 },
    axisPointer: { lineStyle: { color: '#C9D4E8' }, crossStyle: { color: '#C9D4E8' } },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#DCE3F0' } },
    axisTick: { show: false },
    axisLabel: { color: '#5C6B84', fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#5C6B84', fontSize: 11 },
    splitLine: { lineStyle: { color: '#E7ECF5', type: 'dashed' } },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: '#DCE3F0' } },
    axisLabel: { color: '#5C6B84', fontSize: 11 },
    splitLine: { show: false },
  },
});

export default function ChartPanel({
  option, height = 300, loading = false, empty = false, emptyMessage,
  title, subtitle, actions, onEvents, notMerge = true, className = '',
}) {
  const { theme } = useTheme();
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';
  let body;
  if (loading) {
    body = <LoadingSkeleton height={height} />;
  } else if (empty || !option) {
    body = (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState compact title="No data" message={emptyMessage || 'Nothing to plot for the current filters.'} />
      </div>
    );
  } else {
    body = (
      <ReactECharts
        key={chartTheme}
        echarts={echarts}
        theme={chartTheme}
        option={option}
        notMerge={notMerge}
        lazyUpdate
        style={{ height, width: '100%' }}
        onEvents={onEvents}
        opts={{ renderer: 'canvas' }}
      />
    );
  }
  return (
    <Card title={title} subtitle={subtitle} actions={actions} className={className}>
      {body}
    </Card>
  );
}
