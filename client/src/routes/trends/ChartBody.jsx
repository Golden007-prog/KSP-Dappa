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

export default function ChartBody({
  option, height = 300, loading = false, error = null, onRetry,
  emptyMessage, onEvents,
}) {
  const { theme } = useTheme();
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';

  if (loading) return <LoadingSkeleton height={height} />;
  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState
          compact
          title="Couldn't load this chart"
          message={error.message}
          action={onRetry && (
            <button type="button" className="btn" onClick={onRetry}>Retry</button>
          )}
        />
      </div>
    );
  }
  if (!option) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState compact title="No data" message={emptyMessage || 'Nothing to plot for the current filters.'} />
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
