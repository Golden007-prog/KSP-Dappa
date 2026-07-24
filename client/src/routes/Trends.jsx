// /trends — seasonality heatmap (hour×weekday), monthly multi-line per crime
// head with festival-window shading (Ugadi/Dasara/Deepavali), category-share
// donut, district comparison bars; a deterministic auto-insight sentence under
// each chart (master spec §7, route 3).
import { useMemo, useState } from 'react';
import {
  useSeasonality, useTrendsMonthly, useCategoryShare, useDistrictsGeo,
} from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import FilterBar from '../components/FilterBar.jsx';
import ChartPanel from '../components/ChartPanel.jsx';
import InsightLine from './trends/InsightLine.jsx';
import {
  FESTIVAL_MONTHS, seasonalityInsight, monthlyInsight, shareInsight, districtInsight,
} from './trends/insights.js';
import { fmtInt, fmtNum, monthLabel } from '../lib/format.js';

// Fixed series order drawn from the shared DAPPA palette but re-ordered so no
// adjacent pair fails colorblind separation (validated with the dataviz palette
// checker: worst adjacent ΔE 14.5 deutan — the default cycle's purple↔periwinkle
// pair sits at ΔE 2.3). Colors follow the entity via this fixed order.
const SERIES_COLORS = ['#F5A623', '#2DD4BF', '#C084FC', '#A3E635', '#7C9BFF', '#F97316'];
const OTHER_COLOR = '#5B6478'; // neutral gray reserved for the "Other" fold
const DONUT_COLORS = [...SERIES_COLORS, '#38BDF8'];
const PANEL = '#111A2C';
const MUTED = '#8A94A8';

const MAX_MONTHS = 24; // keep the line chart readable on 'All time'

export default function Trends() {
  const { apiParams, districtId } = useUrlFilters();
  const [metric, setMetric] = useState('cases');

  const seasonality = useSeasonality(apiParams);
  const monthly = useTrendsMonthly(apiParams);
  const share = useCategoryShare(apiParams);
  // District comparison needs every district — keep date/head filters, drop the
  // district filter and highlight the selected district instead.
  const compareParams = useMemo(() => {
    const p = { ...apiParams };
    delete p.districtId;
    return p;
  }, [apiParams]);
  const geo = useDistrictsGeo(compareParams);

  // ---- 1. hour × weekday seasonality heatmap ------------------------------
  const seasonalityOption = useMemo(() => {
    const s = seasonality.data;
    if (!s || !s.max) return null;
    const data = [];
    s.matrix.forEach((row, d) => row.forEach((v, h) => data.push([h, d, v])));
    return {
      tooltip: {
        position: 'top',
        formatter: (p) =>
          `${s.days[p.value[1]]} · ${String(p.value[0]).padStart(2, '0')}:00 — ${fmtInt(p.value[2])} cases`,
      },
      grid: { left: 44, right: 12, top: 10, bottom: 44 },
      xAxis: {
        type: 'category',
        data: s.hours.map((h) => String(h).padStart(2, '0')),
        axisLabel: { interval: 2 },
      },
      yAxis: { type: 'category', data: s.days, inverse: true },
      visualMap: {
        min: 0,
        max: s.max,
        orient: 'horizontal',
        right: 0,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 90,
        text: ['high', 'low'],
        textStyle: { color: MUTED, fontSize: 10 },
        // sequential single-hue ramp: near-surface → amber (magnitude only)
        inRange: { color: ['#1A2440', '#4E3F1F', '#8A6420', '#C08221', '#F5A623'] },
      },
      series: [{
        type: 'heatmap',
        data,
        // 2px surface gap between cells
        itemStyle: { borderColor: PANEL, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: '#E6EAF2', borderWidth: 1 } },
      }],
    };
  }, [seasonality.data]);

  // ---- 2. monthly multi-line per head + festival shading ------------------
  const monthlyView = useMemo(() => {
    const t = monthly.data;
    if (!t?.months?.length || !t.series?.length) return null;
    const months = t.months.slice(-MAX_MONTHS);
    const offset = t.months.length - months.length;
    const aligned = t.series.map((s) => ({ name: s.name, data: (s.data || []).slice(offset) }));
    return { months, series: aligned };
  }, [monthly.data]);

  const monthlyOption = useMemo(() => {
    if (!monthlyView) return null;
    const { months, series } = monthlyView;
    const ranked = series
      .map((s) => ({ ...s, sum: s.data.reduce((a, v) => a + (Number(v) || 0), 0) }))
      .sort((a, b) => b.sum - a.sum);
    const shown = ranked.slice(0, SERIES_COLORS.length);
    const rest = ranked.slice(SERIES_COLORS.length);
    if (rest.length) {
      shown.push({
        name: `Other heads (${rest.length})`,
        data: months.map((_, i) => rest.reduce((a, s) => a + (Number(s.data[i]) || 0), 0)),
        other: true,
      });
    }
    const markAreaData = [];
    months.forEach((ym, i) => {
      const f = FESTIVAL_MONTHS[ym];
      // fractional category indices → exact full-band shading for that month
      if (f) markAreaData.push([{ name: f, xAxis: i - 0.5 }, { xAxis: i + 0.5 }]);
    });
    const directLabels = shown.length <= 4; // direct-label small series counts
    return {
      color: SERIES_COLORS,
      tooltip: { trigger: 'axis' },
      ...(shown.length > 1 ? { legend: { bottom: 0, type: 'scroll' } } : {}),
      grid: { left: 48, right: directLabels ? 120 : 16, top: 22, bottom: shown.length > 1 ? 36 : 16 },
      xAxis: { type: 'category', boundaryGap: true, data: months.map(monthLabel) },
      yAxis: { type: 'value' },
      series: shown.map((s, i) => ({
        name: s.name,
        type: 'line',
        data: s.data,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2, ...(s.other ? { type: 'dashed', color: OTHER_COLOR } : {}) },
        ...(s.other ? { itemStyle: { color: OTHER_COLOR } } : {}),
        emphasis: { focus: 'series' },
        ...(directLabels ? {
          endLabel: { show: true, formatter: (p) => p.seriesName, color: MUTED, fontSize: 10, distance: 8 },
          labelLayout: { moveOverlap: 'shiftY' },
        } : {}),
        ...(i === 0 ? {
          markArea: {
            silent: true,
            itemStyle: { color: 'rgba(245, 166, 35, 0.07)' },
            label: { show: true, position: 'insideTop', color: MUTED, fontSize: 9 },
            data: markAreaData,
          },
        } : {}),
      })),
    };
  }, [monthlyView]);

  // ---- 3. category share donut --------------------------------------------
  const shareOption = useMemo(() => {
    const items = share.data || [];
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => b.count - a.count);
    const head = sorted.slice(0, DONUT_COLORS.length);
    const rest = sorted.slice(DONUT_COLORS.length);
    const data = head.map((r) => ({ name: r.name, value: r.count }));
    if (rest.length) {
      data.push({
        name: `Other (${rest.length})`,
        value: rest.reduce((a, r) => a + r.count, 0),
        itemStyle: { color: OTHER_COLOR },
      });
    }
    return {
      color: DONUT_COLORS,
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name} — ${fmtInt(p.value)} cases (${fmtNum(p.percent, 1)}%)`,
      },
      series: [{
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '50%'],
        // 2px surface gap between segments
        itemStyle: { borderColor: PANEL, borderWidth: 2, borderRadius: 3 },
        label: { color: MUTED, fontSize: 11, formatter: (p) => `${p.name} ${Math.round(p.percent)}%` },
        labelLine: { lineStyle: { color: '#1E2A44' } },
        emphasis: { label: { color: '#E6EAF2' } },
        data,
      }],
    };
  }, [share.data]);

  // ---- 4. district comparison bars ----------------------------------------
  const districtOption = useMemo(() => {
    const rows = geo.data || [];
    if (!rows.length) return null;
    const val = metric === 'rate'
      ? (r) => Number(r.ratePerLakh) || 0
      : (r) => Number(r.caseCount) || 0;
    const sorted = [...rows].filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a))
      .slice(0, 14)
      .reverse(); // horizontal bars grow bottom-up
    if (!sorted.length) return null;
    const fmt = (v) => (metric === 'rate' ? fmtNum(v, 1) : fmtInt(v));
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps) => `${ps[0].name} — ${fmt(ps[0].value)} ${metric === 'rate' ? 'cases per lakh' : 'cases'}`,
      },
      grid: { left: 150, right: 56, top: 8, bottom: 24 },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: sorted.map((r) => r.districtName), axisLabel: { width: 140, overflow: 'truncate' } },
      series: [{
        type: 'bar',
        barMaxWidth: 14,
        data: sorted.map((r) => ({
          value: metric === 'rate' ? Number(val(r).toFixed(1)) : val(r),
          itemStyle: {
            // single-hue magnitude bars; a selected district stays solid amber
            // while the rest recede — same hue, lower opacity, not a repaint
            color: !districtId || String(r.districtId) === String(districtId)
              ? '#F5A623'
              : 'rgba(245, 166, 35, 0.35)',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: MUTED,
          fontSize: 10,
          formatter: (p) => fmt(p.value),
        },
      }],
    };
  }, [geo.data, metric, districtId]);

  // ---- auto-insight sentences ---------------------------------------------
  const seasonalityText = useMemo(() => seasonalityInsight(seasonality.data), [seasonality.data]);
  const monthlyText = useMemo(
    () => (monthlyView ? monthlyInsight(monthlyView.months, monthlyView.series) : null),
    [monthlyView],
  );
  const shareText = useMemo(() => shareInsight(share.data), [share.data]);
  const districtText = useMemo(() => districtInsight(geo.data, metric), [geo.data, metric]);

  const metricToggle = (
    <div className="flex items-center gap-1" role="group" aria-label="Comparison metric">
      {[['cases', 'Cases'], ['rate', 'Per lakh']].map(([v, l]) => (
        <button
          key={v}
          type="button"
          className={`chip !py-0.5 transition-colors ${metric === v ? '!border-amber/60 !text-amber' : 'hover:border-amber/40'}`}
          aria-pressed={metric === v}
          onClick={() => setMetric(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div>
        <h1 className="page-title">Trends</h1>
        <p className="page-subtitle">Seasonality, monthly movement per crime head, category mix, district comparison</p>
      </div>

      <FilterBar />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-2">
          <ChartPanel
            title="Seasonality — hour × weekday"
            subtitle="Case registrations by incident hour and day of week"
            option={seasonalityOption}
            loading={seasonality.isLoading}
            empty={!seasonality.isLoading && !seasonalityOption}
            emptyMessage={seasonality.error?.message || 'No seasonality data for the current filters.'}
            height={320}
          />
          <InsightLine text={seasonalityText} loading={seasonality.isLoading} />
        </div>

        <div className="space-y-2">
          <ChartPanel
            title="Category share"
            subtitle="Share of cases by crime head"
            option={shareOption}
            loading={share.isLoading}
            empty={!share.isLoading && !shareOption}
            emptyMessage={share.error?.message || 'No category data for the current filters.'}
            height={320}
          />
          <InsightLine text={shareText} loading={share.isLoading} />
        </div>
      </div>

      <div className="space-y-2">
        <ChartPanel
          title="Monthly trend by crime head"
          subtitle="Amber bands mark festival windows — Ugadi · Dasara · Deepavali (top heads by volume; last 24 months)"
          option={monthlyOption}
          loading={monthly.isLoading}
          empty={!monthly.isLoading && !monthlyOption}
          emptyMessage={monthly.error?.message || 'No monthly aggregates for the current filters.'}
          height={340}
        />
        <InsightLine text={monthlyText} loading={monthly.isLoading} />
      </div>

      <div className="space-y-2">
        <ChartPanel
          title="District comparison"
          subtitle={districtId
            ? 'All police units shown for comparison — the filtered district is highlighted'
            : 'Top police units for the current period and crime-head filters'}
          actions={metricToggle}
          option={districtOption}
          loading={geo.isLoading}
          empty={!geo.isLoading && !districtOption}
          emptyMessage={geo.error?.message || 'No district data for the current filters.'}
          height={380}
        />
        <InsightLine text={districtText} loading={geo.isLoading} />
      </div>
    </div>
  );
}
