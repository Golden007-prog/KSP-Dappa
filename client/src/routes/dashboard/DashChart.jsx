// Bare ECharts surface for dashboard panels (no Card — DashPanel is the frame).
// Same 'dappa'/'dappa-light' themes as ChartPanel (importing it registers them),
// plus a ref API for PNG export:
//   const ref = useRef(); …ref.current?.toDataURL() → data:image/png (2× pixel
//   ratio, panel-colored background so exports aren't transparent).
// Accessibility (lib/chartA11y.js): the option gets ECharts' aria component
// (role="img" + a localized description on the canvas container, decal
// pattern fills when series are only told apart by colour) and a "Table"
// toggle under the plot swaps the canvas for the same numbers as a real
// <table>; the table also prints under every chart (hidden print:block).
// Props: option, height?, onEvents?, title? (names the chart in the
// description and the toggle's label), tableToggle? (default true).
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import '../../components/ChartPanel.jsx'; // side effect: registers both dappa themes
import ChartTable from '../../components/ChartTable.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { describeChart, optionToTable, withChartAria } from '../../lib/chartA11y.js';
import { fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const PANEL_BG = { dark: '#111A2C', light: '#FFFFFF' };

const DashChart = forwardRef(function DashChart({ option, height = 300, onEvents, title = '', tableToggle = true }, ref) {
  const { theme } = useTheme();
  const t = useT();
  const chartRef = useRef(null);
  const [showTable, setShowTable] = useState(false);
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';

  const description = useMemo(() => (option ? describeChart(option, t, { title, fmt: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1) }) : ''), [option, t, title]);
  const ariaOption = useMemo(() => (option ? withChartAria(option, { description }) : option), [option, description]);
  const table = useMemo(() => optionToTable(option), [option]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      const inst = chartRef.current?.getEchartsInstance?.();
      if (!inst) return null;
      return inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: PANEL_BG[theme] || PANEL_BG.dark });
    },
  }), [theme]);

  const name = title || t('a11y.chart.a11y.untitled');
  return (
    <div>
      {!showTable && (
        <ReactECharts
          key={chartTheme}
          ref={chartRef}
          echarts={echarts}
          theme={chartTheme}
          option={ariaOption}
          notMerge
          lazyUpdate
          style={{ height, width: '100%' }}
          onEvents={onEvents}
          opts={{ renderer: 'canvas' }}
        />
      )}
      {table && (
        <>
          {showTable && <ChartTable table={table} caption={description} visible className="max-h-[420px] overflow-y-auto" />}
          {!showTable && <ChartTable table={table} caption={description} />}
          {tableToggle && (
            <div className="no-print flex justify-end">
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                aria-pressed={showTable}
                aria-label={t(showTable ? 'a11y.chart.showChartAria' : 'a11y.chart.showTableAria', { title: name })}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md px-2 text-[11px] text-muted hover:text-primary hover:bg-grid/30 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {showTable ? <path d="M3 17l5-6 4 3 6-8M14 6h4v4" /> : <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>}
                </svg>
                {t(showTable ? 'a11y.chart.showChart' : 'a11y.chart.showTable')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default DashChart;
