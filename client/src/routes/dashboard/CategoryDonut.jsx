// Category share — donut (top 8 crime heads + Other, live total in the hole)
// or Pareto mode: volume-sorted bars with a cumulative-share line and an 80%
// concentration marker. Clicking any slice/bar opens Trends with the current
// filters carried. `chartRef` (optional) exposes the DashChart PNG API so the
// dashboard poster can embed this chart.
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashChart from './DashChart.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtCompact } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref } from './lib.js';

const TOP = 8;

export default function CategoryDonut({ query, linkSearch = '', height = 264, chartRef }) {
  const navigate = useNavigate();
  const t = useT();
  const tName = useNames();
  const [mode, setMode] = useLocalPref('dappa-dash-sharemode', 'donut');
  // echarts-for-react binds onEvents once at chart init — route the handler
  // through a ref so slice clicks always use the CURRENT filter search string.
  const searchRef = useRef(linkSearch);
  searchRef.current = linkSearch;
  const events = useMemo(() => ({ click: () => navigate(`/trends${searchRef.current}`) }), [navigate]);

  const model = useMemo(() => {
    const items = query.data || [];
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));
    const data = sorted.slice(0, TOP).map((s) => ({
      name: tName('crimeHeads', s.id, s.name) || s.name,
      value: s.count || 0,
    }));
    const otherSum = sorted.slice(TOP).reduce((a, s) => a + (s.count || 0), 0);
    if (otherSum > 0) data.push({ name: t('dashboard.share.other'), value: otherSum });
    if (!data.some((d) => d.value > 0)) return null;
    const total = data.reduce((a, d) => a + d.value, 0);
    return { data, total };
  }, [query.data, t, tName]);

  const option = useMemo(() => {
    if (!model) return null;
    if (mode === 'pareto') {
      let run = 0;
      const cum = model.data.map((d) => {
        run += d.value;
        return Number(((run / model.total) * 100).toFixed(1));
      });
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 44, right: 40, top: 18, bottom: 62 },
        xAxis: {
          type: 'category',
          data: model.data.map((d) => d.name),
          axisLabel: { rotate: 38, fontSize: 9, width: 74, overflow: 'truncate' },
        },
        yAxis: [
          { type: 'value' },
          { type: 'value', max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { show: false } },
        ],
        series: [
          {
            name: t('dashboard.series.cases'),
            type: 'bar',
            barMaxWidth: 22,
            data: model.data.map((d) => d.value),
            tooltip: { valueFormatter: (v) => fmtInt(v) },
          },
          {
            name: t('dashboard.series.cumShare'),
            type: 'line',
            yAxisIndex: 1,
            symbolSize: 5,
            data: cum,
            tooltip: { valueFormatter: (v) => `${v}%` },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed' },
              label: { formatter: '80%', fontSize: 10 },
              data: [{ yAxis: 80 }],
            },
          },
        ],
      };
    }
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}: ${fmtInt(p.value)} (${p.percent}%)`,
      },
      legend: { bottom: 0, type: 'scroll' },
      title: {
        text: fmtCompact(model.total),
        subtext: t('dashboard.series.firs'),
        left: 'center',
        top: '32%',
        itemGap: 2,
        textStyle: { fontSize: 20, fontWeight: 700 },
        subtextStyle: { fontSize: 10 },
      },
      series: [{
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: false } },
        data: model.data,
      }],
    };
  }, [model, mode, t]);

  if (query.isLoading) return <LoadingSkeleton height={height} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.share.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!option) {
    return <EmptyState compact title={t('dashboard.share.empty')} message={t('dashboard.share.emptyHint')} />;
  }

  return (
    <>
      <div className="mb-2">
        <SegmentedControl
          ariaLabel={t('dashboard.share.modeAria')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'donut', label: t('dashboard.share.donut') },
            { value: 'pareto', label: t('dashboard.share.pareto') },
          ]}
        />
      </div>
      <DashChart ref={chartRef} option={option} height={height} onEvents={events} />
      <p className="mt-1 text-[10px] text-muted">
        {t(mode === 'pareto' ? 'dashboard.share.paretoNote' : 'dashboard.share.donutNote')}
      </p>
    </>
  );
}
