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
import { useI18n } from '../../lib/i18n.jsx';
import { shareInsight } from './insights.js';
import { downloadCsv, slug } from './csv.js';
import InsightLine from './InsightLine.jsx';

const TOP_N = 5;

export default function StackedShare({ baseParams, colors, otherColor, surface }) {
  const toast = useToast();
  const lookups = useLookups();
  const { t, tName } = useI18n();
  const [view, setView] = useState('count');
  const share = useCategoryShare(baseParams);
  // A crime-head filter turns the share rows into sub-heads, so the reference
  // map has to follow — otherwise a sub-head id would miss the crimeHeads map.
  const shareKind = baseParams?.crimeHeadId ? 'crimeSubHeads' : 'crimeHeads';
  const headLabel = (r) => tName(shareKind, r.id, r.name);

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
  // Surface whichever fetch actually failed — a per-head monthly error must
  // not masquerade as "no category data" (the share query may be fine).
  const fetchError = share.error || queries.find((q) => q.error)?.error || null;
  const retryAll = () => {
    if (share.error) share.refetch();
    queries.forEach((q) => { if (q.error) q.refetch(); });
  };

  const model = useMemo(() => {
    if (loading || !topHeads.length || queries.some((q) => !q.data)) return null;
    const sum = (t) => (t.months || []).map((_, i) => (t.series || []).reduce((a, s) => a + (Number(s.data?.[i]) || 0), 0));
    const months = queries[queries.length - 1].data.months || [];
    if (!months.length) return null;
    const totals = sum(queries[queries.length - 1].data);
    const headSeries = topHeads.map((h, i) => ({
      id: h.id, name: h.name, label: headLabel(h), data: sum(queries[i].data),
    }));
    const other = months.map((_, i) => Math.max(0, totals[i] - headSeries.reduce((a, s) => a + (s.data[i] || 0), 0)));
    // trim the shared leading all-zero run (API zero-fills history)
    let start = totals.findIndex((v) => v > 0);
    if (start < 0) start = 0;
    return {
      months: months.slice(start),
      totals: totals.slice(start),
      series: [
        ...headSeries.map((s) => ({ ...s, data: s.data.slice(start), color: headColor(s.id) })),
        {
          id: 'other',
          name: 'Other heads',
          label: t('trends.mix.otherHeads'),
          data: other.slice(start),
          color: otherColor,
          other: true,
        },
      ],
    };
  }, [loading, topHeads, queries, colors, otherColor, heads, t, tName]); // eslint-disable-line react-hooks/exhaustive-deps

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
        name: s.label || s.name,
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
    const headers = ['month', ...model.series.map((s) => s.label || s.name), 'total'];
    const rows = model.months.map((ym, i) => [ym, ...model.series.map((s) => s.data[i]), model.totals[i]]);
    downloadCsv(`dappa-category-mix_${slug(baseParams.districtId || 'karnataka')}`, headers, rows);
    toast.success(t('trends.toast.mix', { series: model.series.length, months: model.months.length }));
  };

  const insight = useMemo(
    () => shareInsight(share.data, t, headLabel),
    [share.data, t, tName], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-2">
      <ChartPanel
        title={t('trends.mix.title')}
        subtitle={t('trends.mix.subtitle', { n: TOP_N })}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <SegmentedControl
              ariaLabel={t('trends.mix.viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'count', label: t('trends.mix.count') },
                { value: 'pct', label: t('trends.mix.sharePct') },
              ]}
            />
            {fetchError && (
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={retryAll}>{t('common.action.retry')}</button>
            )}
            <Tooltip label={t('trends.mix.csvTip')}>
              <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={exportCsv} disabled={!model}>CSV</button>
            </Tooltip>
          </div>
        )}
        option={option}
        loading={loading}
        empty={!loading && !option}
        emptyMessage={fetchError?.message || t('trends.share.empty')}
        height={320}
      />
      <InsightLine text={insight} loading={share.isLoading} />
    </div>
  );
}
