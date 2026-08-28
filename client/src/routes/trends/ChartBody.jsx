// Headerless, theme-aware ECharts body with loading / error / empty states.
// Used where a Card needs its own control rows between the header and the plot
// (ChartPanel's fixed Card layout can't host those). Unlike ChartPanel's empty
// state, a query error renders distinctly and carries an in-body Retry button.
// Accessibility (lib/chartA11y.js): ECharts' aria component (role="img" +
// localized description, decal fills for colour-only series), a "Table"
// toggle under the plot and a print-only table beneath every chart.
// Props: option, height?, loading?, error?, onRetry?, emptyMessage?,
// onEvents?, title? (names the chart in the description), tableToggle?.
import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Side-effect import: registers the shared 'dappa' / 'dappa-light' themes.
import '../../components/ChartPanel.jsx';
import ChartTable from '../../components/ChartTable.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { describeChart, optionToTable, withChartAria } from '../../lib/chartA11y.js';
import { fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export default function ChartBody({
  option, height = 300, loading = false, error = null, onRetry,
  emptyMessage, onEvents, title = '', tableToggle = true,
}) {
  const { theme } = useTheme();
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';

  const description = useMemo(() => (option ? describeChart(option, t, { title, fmt: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1) }) : ''), [option, t, title]);
  const ariaOption = useMemo(() => (option ? withChartAria(option, { description }) : option), [option, description]);
  const table = useMemo(() => optionToTable(option), [option]);

  if (loading) return <LoadingSkeleton height={height} />;
  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState
          compact
          title={t('trends.chart.errorTitle')}
          message={error.message}
          action={onRetry && (
            <button type="button" className="btn" onClick={onRetry}>{t('common.action.retry')}</button>
          )}
        />
      </div>
    );
  }
  if (!option) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState compact title={t('common.state.empty')} message={emptyMessage || t('trends.chart.empty')} />
      </div>
    );
  }
  const name = title || t('a11y.chart.a11y.untitled');
  return (
    <div>
      {!showTable && (
        <ReactECharts
          key={chartTheme}
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
}
