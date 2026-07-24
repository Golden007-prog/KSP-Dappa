// Category mix over time — stacked area of monthly volume for the top crime
// heads (everything else folds into a neutral-gray "Other"), with a Count vs
// Share-% toggle. One monthly query per top head; the totals query supplies
// the Other remainder, and every key matches useTrendsMonthly's cache format.
import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { apiGet, normalizeMonthlyTrends, prune, useCategoryShare, useLookups } from '../../lib/api.js';
import ChartPanel from '../../components/ChartPanel.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, monthLabel } from '../../lib/format.js';
import { shareInsight } from './insights.js';
import { downloadCsv, slug } from './csv.js';
import InsightLine from './InsightLine.jsx';

const TOP_N = 5;

export default function StackedShare({ baseParams, colors, otherColor, surface }) {
  const toast = useToast();
  const lookups = useLookups();
  const [view, setView] = useState('count');
  const share = useCategoryShare(baseParams);

  const topHeads = useMemo(() => {
    const items = [...(share.data || [])].sort((a, b) => b.count - a.count);
    return items.slice(0, TOP_N).filter((r) => r.count > 0);
  }, [share.data]);

  // Stable hue per head (index in the full lookup list) so a filter change
  // that drops a head from the top-5 never repaints the survivors.
  const heads = lookups.data?.crimeHeads || [];
  const headColor = (id) => colors[Math.max(0, heads.findIndex((h) => h.crimeHeadId === String(id))) % colors.length];

  const queryDefs = useMemo(() => {
    const defs = topHeads.map((h) => ({ id: h.id, name: h.name, params: prune({ ...baseParams, crimeHeadId: h.id }) }));
    defs.push({ id: null, name: '__total__', params: prune(baseParams) });
    return defs;
  }, [topHeads, baseParams]);

  const queries = useQueries({
    queries: queryDefs.map((d) => ({
      queryKey: ['trends-monthly', d.params],
      queryFn: ({ signal }) => apiGet('/trends/monthly', d.params, { signal }).then((r) => normalizeMonthlyTrends(r.data)),
      enabled: topHeads.length > 0,
    })),
  });

  const loading = share.isLoading || (topHeads.length > 0 && queries.some((q) => q.isLoading));

  const model = useMemo(() => {
    if (loading || !topHeads.length || queries.some((q) => !q.data)) return null;
    const sum = (t) => (t.months || []).map((_, i) => (t.series || []).reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
    const months = queries[queries.length - 1].data.months || [];
    if (!months.length) return null;
    const totals = sum(queries[queries.length - 1].data);
    const headSeries = topHeads.map((h, i) => ({ id: h.id, name: h.name, data: sum(queries[i].data) }));
    const other = months.map((_, i) => Math.max(0, totals[i] - headSeries.reduce((a, s) => a + (s.data[i] || 0), 0)));
    // trim the shared leading all-zero run (API zero-fills history)
    let start = totals.findIndex((v) => v > 0);
    if (start < 0) start = 0;
    return {
      months: months.slice(start),
      totals: totals.slice(start),
      series: [
        ...headSeries.map((s) => ({ ...s, data: s.data.slice(start), color: headColor(s.id) })),
        { id: 'other', name: 'Other heads', data: other.slice(start), color: otherColor, other: true },
      ],
    };
  }, [loading, topHeads, queries, colors, otherColor, heads]); // eslint-disable-line react-hooks/exhaustive-deps

  const option = useMemo(() => {
    if (!model) return null;
    const pct = view === 'pct';
    const toPct = (data) => data.map((v, i) => (model.totals[i] > 0 ? (v / model.totals[i]) * 100 : null));
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => (v === null || v === undefined ? '—' : pct ? `${Number(v).toFixed(1)}%` : fmtInt(v)),
      },
      legend: { bottom: 0, type: 'scroll' },
      grid: { left: 48, right: 16, top: 20, bottom: 52 },
      toolbox: {
        right: 0,
        top: -6,
        itemSize: 13,
        iconStyle: { borderColor: surface.muted },
        emphasis: { iconStyle: { borderColor: surface.ink } },
        feature: { saveAsImage: { name: 'dappa-category-mix', backgroundColor: surface.panel, title: 'PNG' } },
      },
      xAxis: { type: 'category', boundaryGap: false, data: model.months.map(monthLabel) },
      yAxis: { type: 'value', max: pct ? 100 : null, axisLabel: pct ? { formatter: '{value}%' } : {} },
      series: model.series.map((s) => ({
        name: s.name,
        type: 'line',
        stack: 'mix',
        data: pct ? toPct(s.data) : s.data,
        showSymbol: false,
        smooth: 0.15,
        lineStyle: { width: 1.5, color: s.color },
        itemStyle: { color: s.color },
        areaStyle: { color: s.color, opacity: s.other ? 0.35 : 0.5 },
        emphasis: { focus: 'series' },
      })),
    };
  }, [model, view, surface]);

  const exportCsv = () => {
    if (!model) return;
    const headers = ['month', ...model.series.map((s) => s.name), 'total'];
    const rows = model.months.map((ym, i) => [ym, ...model.series.map((s) => s.data[i]), model.totals[i]]);
    downloadCsv(`dappa-category-mix_${slug(baseParams.districtId || 'karnataka')}`, headers, rows);
    toast.success(`Exported ${model.series.length} head series × ${model.months.length} months`);
  };

  const insight = useMemo(() => shareInsight(share.data), [share.data]);

  return (
    <div className="space-y-2">
      <ChartPanel
        title="Category mix over time"
        subtitle={`Monthly volume stacked by crime head — top ${TOP_N} heads, remainder folded into Other`}
        actions={(
          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Mix view"
              value={view}
              onChange={setView}
              options={[{ value: 'count', label: 'Count' }, { value: 'pct', label: 'Share %' }]}
            />
            <Tooltip label="Download the stacked series as CSV">
              <button type="button" className="btn !py-1 !px-2 text-xs" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
        option={option}
        loading={loading}
        empty={!loading && !option}
        emptyMessage={share.error?.message || 'No category data for the current filters.'}
        height={320}
      />
      <InsightLine text={insight} loading={share.isLoading} />
    </div>
  );
}
