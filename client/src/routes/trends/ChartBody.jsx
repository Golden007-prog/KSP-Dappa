// Headerless, theme-aware ECharts body with loading / error / empty states.
// Used where a Card needs its own control rows between the header and the plot
// (ChartPanel's fixed Card layout can't host those). Unlike ChartPanel's empty
// state, a query error renders distinctly and carries an in-body Retry button.
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Side-effect import: registers the shared 'dappa' / 'dappa-light' themes.
import '../../components/ChartPanel.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useT } from '../../lib/i18n.jsx';

export default function ChartBody({
  option, height = 300, loading = false, error = null, onRetry,
  emptyMessage, onEvents,
}) {
  const { theme } = useTheme();
  const t = useT();
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';

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
  return (
    <ReactECharts
      key={chartTheme}
      echarts={echarts}
      theme={chartTheme}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      onEvents={onEvents}
      opts={{ renderer: 'canvas' }}
    />
  );
}
