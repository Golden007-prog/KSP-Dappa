// /copilot — renders the optional chart payload from /copilot/query inside an
// answer bubble. Theme-aware (dappa / dappa-light), with a bar⇄line toggle,
// an accessible data-table view, CSV download and a PNG export — all pure
// client. Payload contract: {type:'bar'|'line'|'pie', title, categories,
// series:[{name, data}]}. Defensive: skips rendering on malformed payloads.
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Importing ChartPanel registers the shared 'dappa'/'dappa-light' echarts
// themes as a side effect.
import { DAPPA_CHART_COLORS, DAPPA_CHART_COLORS_LIGHT } from '../../components/ChartPanel.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { describeChart, withChartAria } from '../../lib/chartA11y.js';
import { useT } from '../../lib/i18n.jsx';
import { chartToCsv, downloadTextFile } from './transcript.js';

const MONTHISH = /^\d{4}-\d{2}$|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;

// ≥40px touch targets that stay visually compact inside the tight chart header
const CTRL = 'inline-flex items-center justify-center min-h-[40px] min-w-[40px] px-1.5 rounded-lg text-[10px] transition-colors';

function buildOption(chart, type, light) {
  const cats = Array.isArray(chart.categories) ? chart.categories.map(String) : [];
  const series = (Array.isArray(chart.series) ? chart.series : [])
    .filter((s) => s && Array.isArray(s.data));
  if (!cats.length || !series.length) return null;
  const colors = light ? DAPPA_CHART_COLORS_LIGHT : DAPPA_CHART_COLORS;

  if (type === 'pie') {
    return {
      color: colors,
      tooltip: { trigger: 'item', valueFormatter: (v) => Number(v).toLocaleString('en-IN') },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        data: cats.map((c, i) => ({ name: c, value: Number(series[0].data[i]) || 0 })),
        label: { color: light ? '#5C6B84' : '#8A94A8', fontSize: 10 },
        itemStyle: { borderColor: light ? '#FFFFFF' : '#0B1220', borderWidth: 2 },
      }],
    };
  }

  const rotate = cats.some((c) => c.length > 7) && type === 'bar' ? 28 : 0;
  return {
    color: colors,
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
  const chartRef = useRef(null);
  const toast = useToast();
  const t = useT();
  const { theme } = useTheme();
  const light = theme === 'light';
  const [typeOverride, setTypeOverride] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const baseType = chart?.type === 'pie' ? 'pie' : chart?.type === 'line' ? 'line' : 'bar';
  const type = baseType === 'pie' ? 'pie' : (typeOverride || baseType);
  // ECharts aria (role="img" + a localized description; decal fills for
  // colour-only series) — lib/chartA11y.js; the table view below is the
  // long description.
  const option = useMemo(() => {
    const base = chart ? buildOption(chart, type, light) : null;
    if (!base) return null;
    const description = describeChart(base, t, { title: chart.title || '', fmt: (v) => Number(v).toLocaleString('en-IN') });
    return withChartAria(base, { description });
  }, [chart, type, light, t]);
  if (!option) return null;

  const cats = chart.categories.map(String);
  const series = chart.series.filter((s) => s && Array.isArray(s.data));
  const monthly = baseType !== 'pie' && cats.some((c) => MONTHISH.test(c));

  const slug = String(chart.title || 'answer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'answer';

  const exportPng = () => {
    try {
      const inst = chartRef.current?.getEchartsInstance();
      if (!inst) return;
      // opaque, theme-matched background so the PNG reads outside the app
      const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: light ? '#FFFFFF' : '#111A2C' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `dappa-chart-${slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(t('copilot.chart.pngDone'));
    } catch {
      toast.error(t('copilot.chart.pngFailed'));
    }
  };

  const exportCsv = () => {
    const csv = chartToCsv(chart);
    if (!csv) {
      toast.error(t('copilot.chart.csvEmpty'));
      return;
    }
    downloadTextFile(`dappa-chart-${slug}.csv`, csv, 'text/csv;charset=utf-8');
    toast.success(t('copilot.chart.csvDone'));
  };

  const fmtCell = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN'));

  return (
    <div className="mt-3 rounded-lg border border-grid bg-base/60 p-2">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0 px-1">
        <p className="flex-1 min-w-[8rem] text-[11px] text-muted truncate">{chart.title || ''}</p>
        {baseType !== 'pie' && (
          <div className="no-print inline-flex rounded-lg border border-grid overflow-hidden" role="group" aria-label={t('copilot.chart.typeGroup')}>
            {['bar', 'line'].map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={type === kind}
                onClick={() => setTypeOverride(kind === baseType ? null : kind)}
                className={`inline-flex items-center min-h-[40px] px-2 text-[10px] uppercase tracking-wide transition-colors ${
                  type === kind ? 'bg-amber/15 text-amber' : 'text-muted hover:text-ink'
                }`}
              >
                {t(`copilot.chart.${kind}`)}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`no-print ${CTRL} ${showTable ? 'text-amber' : 'text-muted hover:text-primary'}`}
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-label={t(showTable ? 'copilot.chart.hideTable' : 'copilot.chart.showTable')}
        >
          {t('copilot.chart.table')}
        </button>
        <button
          type="button"
          className={`no-print ${CTRL} text-muted hover:text-primary`}
          onClick={exportCsv}
          aria-label={t('copilot.chart.csvAria')}
        >
          CSV ↓
        </button>
        <button
          type="button"
          className={`no-print ${CTRL} text-muted hover:text-primary`}
          onClick={exportPng}
          aria-label={t('copilot.chart.pngAria')}
        >
          PNG ↓
        </button>
      </div>
      <ReactECharts
        key={light ? 'dappa-light' : 'dappa'}
        ref={chartRef}
        echarts={echarts}
        theme={light ? 'dappa-light' : 'dappa'}
        option={option}
        notMerge
        style={{ height: 240, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      {showTable && (
        <div className="mt-1 overflow-x-auto rounded-lg border border-grid/60">
          <table className="w-full text-[11px]">
            <caption className="sr-only">{chart.title || t('copilot.chart.caption')}</caption>
            <thead>
              <tr className="bg-panel/60">
                <th scope="col" className="text-left font-medium text-muted px-2.5 py-1.5 border-b border-grid">{t('copilot.chart.category')}</th>
                {series.map((s, i) => (
                  <th key={i} scope="col" className="text-right font-medium text-muted px-2.5 py-1.5 border-b border-grid whitespace-nowrap">
                    {s.name || t('copilot.chart.series', { n: i + 1 })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.map((c, i) => (
                <tr key={`${c}-${i}`}>
                  <th scope="row" className="text-left font-normal text-ink px-2.5 py-1 border-b border-grid/40 whitespace-nowrap">{c}</th>
                  {series.map((s, j) => (
                    <td key={j} className="num text-right text-ink px-2.5 py-1 border-b border-grid/40">{fmtCell(s.data[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {monthly && (
        <div className="no-print mt-1 px-1">
          <Link to="/trends" className="inline-flex items-center min-h-[40px] text-[11px] text-primary hover:underline">
            {t('copilot.chart.exploreTrends')}
          </Link>
        </div>
      )}
    </div>
  );
}
