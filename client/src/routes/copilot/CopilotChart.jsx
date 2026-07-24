// /copilot — renders the optional chart payload from /copilot/query inside an
// answer bubble. Payload contract: {type:'bar'|'line'|'pie', title, categories,
// series:[{name, data}]}. Defensive: skips rendering on malformed payloads.
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Importing ChartPanel registers the shared 'dappa' echarts theme as a side effect.
import { DAPPA_CHART_COLORS } from '../../components/ChartPanel.jsx';

function buildOption(chart) {
  const cats = Array.isArray(chart.categories) ? chart.categories.map(String) : [];
  const series = (Array.isArray(chart.series) ? chart.series : [])
    .filter((s) => s && Array.isArray(s.data));
  if (!cats.length || !series.length) return null;

  if (chart.type === 'pie') {
    return {
      color: DAPPA_CHART_COLORS,
      tooltip: { trigger: 'item', valueFormatter: (v) => Number(v).toLocaleString('en-IN') },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        data: cats.map((c, i) => ({ name: c, value: Number(series[0].data[i]) || 0 })),
        label: { color: '#8A94A8', fontSize: 10 },
        itemStyle: { borderColor: '#0B1220', borderWidth: 2 },
      }],
    };
  }

  const type = chart.type === 'line' ? 'line' : 'bar';
  const rotate = cats.some((c) => c.length > 7) && type === 'bar' ? 28 : 0;
  return {
    color: DAPPA_CHART_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: type === 'bar' ? 'shadow' : 'line' } },
    legend: series.length > 1 ? { bottom: 0, type: 'scroll' } : undefined,
    grid: { left: 44, right: 12, top: 14, bottom: (series.length > 1 ? 30 : 8) + (rotate ? 34 : 20) },
    xAxis: { type: 'category', data: cats, axisLabel: { rotate, hideOverlap: true } },
    yAxis: { type: 'value' },
    series: series.map((s) => ({
      name: String(s.name || 'Value'),
      type,
      data: s.data.map((v) => (v === null || v === undefined ? null : Number(v))),
      smooth: type === 'line' ? 0.25 : undefined,
      symbolSize: type === 'line' ? 5 : undefined,
      lineStyle: type === 'line' ? { width: 2 } : undefined,
      barMaxWidth: type === 'bar' ? 26 : undefined,
    })),
  };
}

export default function CopilotChart({ chart }) {
  const option = useMemo(() => (chart ? buildOption(chart) : null), [chart]);
  if (!option) return null;
  return (
    <div className="mt-3 rounded-lg border border-grid bg-base/60 p-2">
      {chart.title && <p className="text-[11px] text-muted mb-1 px-1">{chart.title}</p>}
      <ReactECharts
        echarts={echarts}
        theme="dappa"
        option={option}
        notMerge
        style={{ height: 240, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
