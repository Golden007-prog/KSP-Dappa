// Category share donut — top 8 crime heads + Other from useCategoryShare.
// Clicking any slice opens Trends with the current filters carried along.
import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashChart from './DashChart.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt } from '../../lib/format.js';

const TOP = 8;

export default function CategoryDonut({ query, linkSearch = '', height = 264 }) {
  const navigate = useNavigate();
  // echarts-for-react binds onEvents once at chart init — route the handler
  // through a ref so slice clicks always use the CURRENT filter search string.
  const searchRef = useRef(linkSearch);
  searchRef.current = linkSearch;
  const events = useMemo(() => ({ click: () => navigate(`/trends${searchRef.current}`) }), [navigate]);

  const option = useMemo(() => {
    const items = query.data || [];
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));
    const data = sorted.slice(0, TOP).map((s) => ({ name: s.name, value: s.count || 0 }));
    const otherSum = sorted.slice(TOP).reduce((a, s) => a + (s.count || 0), 0);
    if (otherSum > 0) data.push({ name: 'Other', value: otherSum });
    if (!data.some((d) => d.value > 0)) return null;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}: ${fmtInt(p.value)} (${p.percent}%)`,
      },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 600, formatter: '{b}\n{d}%' } },
        data,
      }],
    };
  }, [query.data]);

  if (query.isLoading) return <LoadingSkeleton height={height} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title="Couldn't load category share"
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
      />
    );
  }
  if (!option) return <EmptyState compact title="No share data" message="No category counts for the current filters." />;

  return (
    <>
      <DashChart option={option} height={height} onEvents={events} />
      <p className="mt-1 text-[10px] text-muted">Click a slice to open Trends</p>
    </>
  );
}
