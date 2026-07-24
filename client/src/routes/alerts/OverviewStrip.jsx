// /alerts — client-side overview strip above the feed: open-alert counts by
// severity as tappable stat chips (they drive the ?sev= filter) plus a 14-day
// alert-volume mini bar chart bucketed on periodEnd, anchored at the latest
// period in the data so old synthetic windows still plot.
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
// Side-effect import: registers the shared echarts themes.
import '../../components/ChartPanel.jsx';
import Card from '../../components/Card.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtInt, dateLabel } from '../../lib/format.js';

const SEV_CHIPS = [
  { key: 'critical', label: 'Critical', cls: 'text-signal' },
  { key: 'high', label: 'High', cls: 'text-signal' },
  { key: 'medium', label: 'Medium', cls: 'text-amber' },
  { key: 'low', label: 'Low', cls: 'text-muted' },
];

export default function OverviewStrip({ openAlerts, sev, onSev }) {
  const { theme } = useTheme();
  const light = theme === 'light';

  const counts = useMemo(() => {
    const m = {};
    for (const a of openAlerts) {
      const k = String(a.severity || '').toLowerCase();
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [openAlerts]);

  const volume = useMemo(() => {
    const ends = openAlerts
      .map((a) => String(a.periodEnd || a.periodStart || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (!ends.length) return null;
    const anchor = new Date(`${ends[ends.length - 1]}T00:00:00Z`);
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - (13 - i));
      return d.toISOString().slice(0, 10);
    });
    const byDay = new Map(days.map((d) => [d, 0]));
    for (const e of ends) if (byDay.has(e)) byDay.set(e, byDay.get(e) + 1);
    const data = days.map((d) => byDay.get(d));
    return { days, data, anchor: days[13], total: data.reduce((a, b) => a + b, 0) };
  }, [openAlerts]);

  const option = volume ? {
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (ps) => `${dateLabel(volume.days[ps[0].dataIndex])}: ${ps[0].value} alert${ps[0].value === 1 ? '' : 's'}`,
    },
    grid: { left: 2, right: 2, top: 4, bottom: 2 },
    xAxis: { type: 'category', show: false, data: volume.days },
    yAxis: { type: 'value', show: false },
    series: [{
      type: 'bar',
      data: volume.data,
      barCategoryGap: '30%',
      itemStyle: { color: light ? '#D97706' : '#F5A623', borderRadius: [2, 2, 0, 0] },
    }],
  } : null;

  return (
    <Card padded={false} className="!py-0">
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-3">
        <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Open alerts by severity">
          {SEV_CHIPS.map(({ key, label, cls }) => {
            const active = sev === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onSev(active ? '' : key)}
                className={`flex shrink-0 flex-col items-start rounded-lg border px-3 py-1.5 min-h-[44px] transition-colors ${
                  active ? 'border-primary/70 bg-primary/5' : 'border-grid hover:border-primary/40'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
                <span className={`num text-base font-semibold leading-tight ${counts[key] ? cls : 'text-muted/60'}`}>
                  {fmtInt(counts[key] || 0)}
                </span>
              </button>
            );
          })}
          <div className="flex shrink-0 flex-col items-start rounded-lg border border-grid/60 bg-grid/20 px-3 py-1.5 min-h-[44px]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Open total</span>
            <span className="num text-base font-semibold leading-tight text-ink">{fmtInt(openAlerts.length)}</span>
          </div>
        </div>
        {volume && (
          <div className="flex-1 min-w-[10rem]">
            <div
              role="img"
              aria-label={`Alert volume over the 14 days ending ${dateLabel(volume.anchor)}: ${fmtInt(volume.total)} alerts`}
            >
              <div aria-hidden="true">
                <ReactECharts
                  key={theme}
                  echarts={echarts}
                  theme={light ? 'dappa-light' : 'dappa'}
                  option={option}
                  notMerge
                  style={{ height: 44, width: '100%' }}
                  opts={{ renderer: 'canvas' }}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted mt-0.5">
              alert volume · 14 days to <span className="num">{dateLabel(volume.anchor)}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
