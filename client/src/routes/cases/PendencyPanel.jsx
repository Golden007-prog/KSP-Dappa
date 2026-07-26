// Disposal-lag / pendency analytics over the scanned corpus.
//
// "Median pending age" as a single KPI hides the tail that actually matters —
// a station can look healthy on the median while carrying 200 FIRs past a year.
// This shows the whole distribution (bucketed, click-to-drill), the p50/p75/p90
// spread, and the median age split by case status so a supervisor can see
// whether the backlog sits in investigation or in trial.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import ChartPanel from '../../components/ChartPanel.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { readJson, writeJson } from './explorerState.js';
import { median, percentile } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-pendency';

// [lower bound (days), label key] — the drill sets minAge to the lower bound.
const BUCKETS = [
  [0, 'cases.pend.b0'],
  [8, 'cases.pend.b8'],
  [31, 'cases.pend.b31'],
  [61, 'cases.pend.b61'],
  [91, 'cases.pend.b91'],
  [181, 'cases.pend.b181'],
  [366, 'cases.pend.b366'],
];

const bucketOf = (age) => {
  let idx = 0;
  for (let i = 0; i < BUCKETS.length; i += 1) if (age >= BUCKETS[i][0]) idx = i;
  return idx;
};

export default function PendencyPanel({ rows, scopeLabel, onMinAge }) {
  const t = useT();
  const trName = useCaseNames();
  const { theme } = useTheme();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const agg = useMemo(() => {
    const ages = [];
    const counts = BUCKETS.map(() => 0);
    const byStatus = new Map();
    for (const r of rows || []) {
      if (!Number.isFinite(r.ageDays)) continue;
      ages.push(r.ageDays);
      counts[bucketOf(r.ageDays)] += 1;
      const s = String(r.statusName || '').trim();
      if (!s) continue;
      if (!byStatus.has(s)) byStatus.set(s, []);
      byStatus.get(s).push(r.ageDays);
    }
    if (ages.length < 5) return null;
    const sorted = [...ages].sort((a, b) => a - b);
    const statusRows = [...byStatus.entries()]
      .filter(([, list]) => list.length >= 3)
      .map(([name, list]) => ({ name, n: list.length, med: median(list) }))
      .sort((a, b) => b.med - a.med);
    return {
      n: ages.length,
      counts,
      p50: percentile(sorted, 50),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      oldest: sorted[sorted.length - 1],
      overYear: sorted.filter((a) => a >= 366).length,
      statusRows,
    };
  }, [rows]);

  if (!agg) return null;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">{t('cases.pend.collapsed', { p50: fmtInt(agg.p50), p90: fmtInt(agg.p90) })}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  const labelInk = theme === 'light' ? '#5C6B84' : '#8A94A8';
  const hot = theme === 'light' ? '#DC2626' : '#E5484D';

  const histOption = {
    grid: { left: 8, right: 12, top: 18, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: BUCKETS.map(([, k]) => t(k)), axisLabel: { fontSize: 10, interval: 0, rotate: 30 } },
    yAxis: { type: 'value', minInterval: 1 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [{
      type: 'bar',
      data: agg.counts.map((v, i) => (BUCKETS[i][0] >= 181 && v > 0 ? { value: v, itemStyle: { color: hot } } : v)),
      barMaxWidth: 34,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: 'top', fontSize: 10, color: labelInk },
      cursor: 'pointer',
    }],
  };

  const statusOption = agg.statusRows.length >= 2 ? {
    grid: { left: 8, right: 42, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: agg.statusRows.map((s) => trName('statuses', s.name)),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { width: 120, overflow: 'truncate', fontSize: 10 },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v} d` },
    series: [{
      type: 'bar',
      data: agg.statusRows.map((s) => s.med),
      barWidth: 14,
      itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', fontSize: 10, color: labelInk, formatter: '{c}d' },
    }],
  } : null;

  const tile = (labelKey, value, tone) => (
    <div className="rounded-lg border border-grid/60 px-2.5 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted truncate">{t(labelKey)}</p>
      <p className={`num text-base font-semibold mt-0.5 ${tone || 'text-ink'}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <Card
        title={t('cases.pend.title')}
        subtitle={t('cases.pend.subtitle', { scope: scopeLabel, n: fmtInt(agg.n) })}
        actions={<button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          {tile('cases.pend.p50', `${fmtInt(agg.p50)}d`)}
          {tile('cases.pend.p75', `${fmtInt(agg.p75)}d`, agg.p75 > 180 ? 'text-amber' : '')}
          {tile('cases.pend.p90', `${fmtInt(agg.p90)}d`, agg.p90 > 365 ? 'text-signal' : 'text-amber')}
          {tile('cases.pend.oldest', `${fmtInt(agg.oldest)}d`)}
          {tile('cases.pend.overYear', `${fmtInt(agg.overYear)} · ${fmtPct((agg.overYear / agg.n) * 100)}`,
            agg.overYear > 0 ? 'text-signal' : 'text-teal')}
        </div>
        <p className="text-[11px] text-muted mt-2">{t('cases.pend.note')}</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartPanel
          title={t('cases.pend.hist')}
          subtitle={t('cases.pend.histSub')}
          option={histOption}
          height={210}
          onEvents={{
            click: (p) => {
              const b = BUCKETS[p?.dataIndex];
              if (b && onMinAge) onMinAge(b[0] > 0 ? String(b[0]) : '');
            },
          }}
        />
        <ChartPanel
          title={t('cases.pend.byStatus')}
          subtitle={t('cases.pend.byStatusSub')}
          option={statusOption}
          empty={!statusOption}
          emptyMessage={t('cases.pend.byStatusEmpty')}
          height={210}
        />
      </div>
    </div>
  );
}
