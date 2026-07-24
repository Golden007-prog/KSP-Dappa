// ECharts wrapper on the Command Center theme, inside a Card with
// loading/empty states. Props:
//   option        — echarts option (theme colors/text are applied for you)
//   height?       — px number, default 300
//   loading?      — show skeleton
//   error?        — Error | string | truthy → in-card error state (beats empty;
//                  loading beats both). ApiError messages surface verbatim.
//   onRetry?      — with error, renders a Retry button (in the body and as a
//                  header action) that calls it
//   empty?        — force empty state (also shown when option is falsy)
//   emptyMessage? — text under 'No data'
//   title?, subtitle?, actions? — forwarded to Card
//   onEvents?     — echarts-for-react events map, e.g. {click: fn}
//   notMerge?     — default true (option replaces previous fully)
//   exportable?   — default true; appends PNG-download + expand buttons to the
//                  card actions (theme-correct background; fullscreen overlay)
//   className?
// Both 'dappa' (dark) and 'dappa-light' themes are registered at module load;
// the active app theme picks one and the chart re-instantiates on toggle.
// Route fillers can also `import { DAPPA_CHART_COLORS } from '../components/ChartPanel.jsx'`.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import Card from './Card.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';
import Tooltip from './Tooltip.jsx';
import { useTheme } from './ThemeProvider.jsx';
import { useFocusTrap, useScrollLock } from '../lib/modal.js';

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

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

/** Fullscreen chart overlay — Esc / overlay click close, focus trapped. */
function ExpandedChart({ title, subtitle, option, chartTheme, onEvents, onClose, onDownload }) {
  const panelRef = useRef(null);
  const expandedRef = useRef(null);
  useScrollLock(true);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const prev = document.activeElement;
    requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-70" role="presentation">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${title || 'Chart'} — expanded view`}
        className="absolute inset-2 md:inset-8 flex flex-col rounded-2xl border border-grid bg-panel shadow-lift overflow-hidden animate-scale-in focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-grid/60 shrink-0">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1 -mr-2 -mt-1 shrink-0">
            <Tooltip label="Download PNG" position="bottom">
              <button
                type="button"
                onClick={() => onDownload?.(expandedRef.current?.getEchartsInstance?.())}
                aria-label={`Download ${title || 'chart'} as PNG`}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-grid/40 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
                  <path d="M12 4v11m-5-4 5 5 5-5" /><path d="M4.5 20h15" />
                </svg>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close expanded chart"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-2">
          <ReactECharts
            ref={expandedRef}
            key={`${chartTheme}-expanded`}
            echarts={echarts}
            theme={chartTheme}
            option={option}
            notMerge
            lazyUpdate
            style={{ height: '100%', width: '100%' }}
            onEvents={onEvents}
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ChartPanel({
  option, height = 300, loading = false, error = null, onRetry, empty = false, emptyMessage,
  title, subtitle, actions, onEvents, notMerge = true, exportable = true, className = '',
}) {
  const { theme } = useTheme();
  const chartRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';
  const hasChart = !loading && !error && !empty && !!option;

  const downloadPng = (instance) => {
    const inst = instance || chartRef.current?.getEchartsInstance?.();
    if (!inst) return;
    const url = inst.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: theme === 'light' ? '#FFFFFF' : '#0B1220',
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const chartActions = exportable && hasChart ? (
    <>
      {actions}
      <Tooltip label="Download PNG" position="bottom">
        <button
          type="button"
          onClick={() => downloadPng()}
          aria-label={`Download ${title || 'chart'} as PNG`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-grid/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
            <path d="M12 4v11m-5-4 5 5 5-5" /><path d="M4.5 20h15" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Expand chart" position="bottom">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Expand ${title || 'chart'} to fullscreen`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-grid/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
          </svg>
        </button>
      </Tooltip>
    </>
  ) : actions;

  const retryHeaderAction = error && onRetry ? (
    <>
      {actions}
      <Tooltip label="Retry" position="bottom">
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Retry loading ${title || 'chart'}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-signal hover:bg-grid/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 3.5v4.6h-4.6" />
          </svg>
        </button>
      </Tooltip>
    </>
  ) : null;

  let body;
  if (loading) {
    body = <LoadingSkeleton height={height} />;
  } else if (error) {
    const message = typeof error === 'string'
      ? error
      : String(error?.message || 'The data for this chart could not be loaded.');
    body = (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState
          compact
          title="Chart failed to load"
          message={message}
          icon={(
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          )}
          action={onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>Retry</button>
          ) : undefined}
        />
      </div>
    );
  } else if (empty || !option) {
    body = (
      <div style={{ height }} className="flex items-center justify-center">
        <EmptyState compact title="No data" message={emptyMessage || 'Nothing to plot for the current filters.'} />
      </div>
    );
  } else {
    body = (
      <ReactECharts
        ref={chartRef}
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
    <Card title={title} subtitle={subtitle} actions={retryHeaderAction || chartActions} className={className}>
      {body}
      {expanded && hasChart && (
        <ExpandedChart
          title={title}
          subtitle={subtitle}
          option={option}
          chartTheme={chartTheme}
          onEvents={onEvents}
          onClose={() => setExpanded(false)}
          onDownload={(inst) => downloadPng(inst)}
        />
      )}
    </Card>
  );
}
