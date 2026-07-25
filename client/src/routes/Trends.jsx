// /trends — seasonality heatmap (hour×weekday), monthly multi-line per crime
// head with festival-window shading (Ugadi/Dasara/Deepavali), category-share
// donut, district comparison bars, plus the deep-dive strip: auto-insight
// digest, category mix over time, and the district × head compare grid.
// Deterministic auto-insight sentences under every chart (master spec §7).
// All chart colors resolve through trends/palettes.js per app theme + the
// persisted Standard/CB-safe palette preference.
import { useMemo, useState } from 'react';
import {
  useSeasonality, useTrendsMonthly, useCategoryShare, useDistrictsGeo, useLookups,
} from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import FilterBar from '../components/FilterBar.jsx';
import Card from '../components/Card.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import StatDelta from '../components/StatDelta.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useTheme } from '../components/ThemeProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import ChartBody from './trends/ChartBody.jsx';
import InsightLine from './trends/InsightLine.jsx';
import InsightStrip from './trends/InsightStrip.jsx';
import StackedShare from './trends/StackedShare.jsx';
import CompareGrid from './trends/CompareGrid.jsx';
import PinnedViews from './trends/PinnedViews.jsx';
import Decomposition from './trends/Decomposition.jsx';
import SocioScatter from './trends/SocioScatter.jsx';
import MixRadar from './trends/MixRadar.jsx';
import {
  usePalettePref, seriesColors, OTHER_COLOR, ANOMALY_COLOR, HEAT_RAMP, DIVERGING_RAMP, SURFACE,
} from './trends/palettes.js';
import {
  sumSeries, trimLeadingZeros, rollingMean, detectAnomalies, linearTrend,
  recentDeltaPct, buildMonthYearMatrix, buildYoyMatrix, calendarMonthMeans, derivePopulations,
  toPerLakh, detectChangepoints, hourProfiles, seasonalityQuickStats, monthShortNames, dayName,
} from './trends/analysis.js';
import {
  FESTIVAL_MONTHS, seasonalityInsight, monthlyInsight, shareInsight, districtInsight,
  trendDirectionInsight, seasonalPeakInsight, anomalySummaryInsight, changepointInsight,
} from './trends/insights.js';
import { downloadCsv, slug } from './trends/csv.js';
import useMediaQuery from './trends/useMediaQuery.js';
import { fmtInt, fmtNum, monthLabel } from '../lib/format.js';
import { useI18n, useT } from '../lib/i18n.jsx';
import './trends/trends-print.css';

const MAX_MONTHS = 24; // keep the line chart readable on 'All time'

function hexToRgba(hex, alpha) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  // eslint-disable-next-line no-bitwise
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** ≥40px toggle chip with aria-pressed (the audit's touch-target floor). */
function ToggleChip({ on, onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`chip !px-3 min-h-[40px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        on ? '!border-amber/60 !text-amber bg-amber/10' : 'hover:border-amber/40'
      }`}
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

function CsvButton({ onClick, disabled, tip }) {
  const t = useT();
  return (
    <Tooltip label={tip || t('trends.csv.tip')}>
      <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={onClick} disabled={disabled}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        CSV
      </button>
    </Tooltip>
  );
}

export default function Trends() {
  const { apiParams, districtId, crimeHeadId, from, to, setFilter } = useUrlFilters();
  const { theme } = useTheme();
  const toast = useToast();
  const { t, tName } = useI18n();
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const [paletteKey, setPaletteKey] = usePalettePref();

  const monthNames = useMemo(() => monthShortNames(t), [t]);
  const dayLabel = useMemo(() => (label, i) => dayName(label, i, t), [t]);
  // /trends/monthly series arrive keyed by head NAME only, so the reference id
  // (and with it the Kannada/Hindi name) has to come back via the lookup list.
  const lookups = useLookups();
  const headIdByName = useMemo(() => new Map(
    (lookups.data?.crimeHeads || []).map((h) => [h.headName, h.crimeHeadId]),
  ), [lookups.data]);
  const headLabel = useMemo(
    () => (name) => tName('crimeHeads', headIdByName.get(name), name),
    [headIdByName, tName],
  );
  // A crime-head filter turns the category-share rows into sub-heads.
  const shareKind = crimeHeadId ? 'crimeSubHeads' : 'crimeHeads';
  const shareLabel = useMemo(
    () => (r) => tName(shareKind, r.id, r.name),
    [shareKind, tName],
  );

  const colors = seriesColors(paletteKey, theme);
  const surface = SURFACE[theme] || SURFACE.dark;
  const heatRamp = HEAT_RAMP[theme] || HEAT_RAMP.dark;
  const divergingRamp = DIVERGING_RAMP[theme] || DIVERGING_RAMP.dark;
  const otherColor = OTHER_COLOR[theme] || OTHER_COLOR.dark;
  const anomalyColor = ANOMALY_COLOR[theme] || ANOMALY_COLOR.dark;
  const accent = colors[0];

  const [metric, setMetric] = useState('cases'); // district bars: cases | rate
  const [monthlyMode, setMonthlyMode] = useState('lines'); // lines | calendar | yoy
  const [smooth3, setSmooth3] = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showChangepoints, setShowChangepoints] = useState(false);
  const [perLakh, setPerLakh] = useState(false);
  const [seasonView, setSeasonView] = useState('heat'); // heat | profile

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

  // Populations back-solved from caseCount/ratePerLakh (filter-invariant).
  const pops = useMemo(() => derivePopulations(geo.data), [geo.data]);
  const population = districtId ? pops.byDistrict.get(String(districtId)) : pops.statePop;

  const compareWindow = useMemo(() => ({ from, to }), [from, to]);
  const topDistrictIds = useMemo(() => [...(geo.data || [])]
    .sort((a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0))
    .slice(0, 3)
    .map((r) => String(r.districtId)), [geo.data]);

  // ---- 1. hour × weekday seasonality heatmap ------------------------------
  const seasonalityOption = useMemo(() => {
    const s = seasonality.data;
    if (!s || !s.max) return null;
    const data = [];
    s.matrix.forEach((row, d) => row.forEach((v, h) => data.push([h, d, v])));
    return {
      tooltip: {
        position: 'top',
        formatter: (p) => t('trends.seasonality.tooltip', {
          day: dayLabel(s.days[p.value[1]], p.value[1]),
          hour: String(p.value[0]).padStart(2, '0'),
          n: fmtInt(p.value[2]),
        }),
      },
      grid: { left: 44, right: 12, top: 10, bottom: 44 },
      xAxis: {
        type: 'category',
        data: s.hours.map((h) => String(h).padStart(2, '0')),
        axisLabel: { interval: isNarrow ? 3 : 2 },
      },
      yAxis: { type: 'category', data: s.days.map(dayLabel), inverse: true },
      visualMap: {
        min: 0,
        max: s.max,
        orient: 'horizontal',
        right: 0,
        bottom: 0,
        itemWidth: 10,
        itemHeight: 90,
        text: [t('trends.scale.high'), t('trends.scale.low')],
        textStyle: { color: surface.muted, fontSize: 10 },
        // sequential single-hue ramp (magnitude only), theme-matched
        inRange: { color: heatRamp },
      },
      series: [{
        type: 'heatmap',
        data,
        // 2px surface gap between cells
        itemStyle: { borderColor: surface.panel, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: surface.ink, borderWidth: 1 } },
      }],
    };
  }, [seasonality.data, surface, heatRamp, isNarrow, t, dayLabel]);

  // ---- 1b. weekday vs weekend hourly profile + quick stats ----------------
  const profileOption = useMemo(() => {
    const s = seasonality.data;
    if (!s || !s.max) return null;
    const prof = hourProfiles(s);
    if (!prof?.weekday) return null;
    const hours = s.hours.map((h) => String(h).padStart(2, '0'));
    const series = [
      { name: t('trends.seasonality.weekdayAvg'), data: prof.weekday, color: accent },
      ...(prof.weekend ? [{ name: t('trends.seasonality.weekendAvg'), data: prof.weekend, color: colors[1] }] : []),
    ];
    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => t('trends.seasonality.perHour', { n: fmtNum(v, 1) }),
      },
      legend: { bottom: 0 },
      grid: { left: 40, right: 12, top: 14, bottom: 40 },
      xAxis: { type: 'category', boundaryGap: false, data: hours, axisLabel: { interval: isNarrow ? 3 : 2 } },
      yAxis: { type: 'value' },
      series: series.map((sr) => ({
        name: sr.name,
        type: 'line',
        data: sr.data.map((v) => Number(v.toFixed(1))),
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { width: 2, color: sr.color },
        itemStyle: { color: sr.color },
        areaStyle: { color: sr.color, opacity: 0.08 },
      })),
    };
  }, [seasonality.data, accent, colors, isNarrow, t]);

  const quickStats = useMemo(() => seasonalityQuickStats(seasonality.data), [seasonality.data]);

  // ---- 2. monthly trend (lines | calendar | yoy) --------------------------
  // Trim the API's zero-filled leading months FIRST (they flatten the chart
  // and skew the festival-vs-normal average), then cap at 24 months.
  const monthlyView = useMemo(() => {
    const t = monthly.data;
    if (!t?.months?.length || !t.series?.length) return null;
    const { values: fullTotals } = sumSeries(t);
    const trimmed = trimLeadingZeros(t.months, fullTotals);
    const months = trimmed.months.slice(-MAX_MONTHS);
    if (!months.length) return null;
    const offset = t.months.length - months.length;
    return {
      months,
      series: t.series.map((s) => ({ name: s.name, data: (s.data || []).slice(offset) })),
      totals: fullTotals.slice(offset),
      trimmedMonths: trimmed.months,
      trimmedTotals: trimmed.values,
    };
  }, [monthly.data]);

  const monthlyModel = useMemo(() => {
    if (!monthlyView) return null;
    const { months, series, totals } = monthlyView;
    const ranked = series
      .map((s) => ({ ...s, sum: s.data.reduce((a, v) => a + (Number(v) || 0), 0) }))
      .sort((a, b) => b.sum - a.sum);
    const shown = ranked
      .slice(0, colors.length)
      .map((s) => ({ ...s, label: headLabel(s.name) }));
    const rest = ranked.slice(colors.length);
    if (rest.length) {
      shown.push({
        name: 'Other heads',
        label: t('trends.monthly.otherHeads', { n: rest.length }),
        data: months.map((_, i) => rest.reduce((a, s) => a + (Number(s.data[i]) || 0), 0)),
        other: true,
      });
    }
    return { months, shown, totals };
  }, [monthlyView, colors.length, t, headLabel]);

  const anomalies = useMemo(
    () => (monthlyView ? detectAnomalies(monthlyView.totals) : []),
    [monthlyView],
  );

  // Level shifts on the displayed 24-month window (binary segmentation).
  const changepoints = useMemo(
    () => (monthlyView ? detectChangepoints(monthlyView.totals) : []),
    [monthlyView],
  );

  const perLakhOn = perLakh && !!population;

  const monthlyOption = useMemo(() => {
    if (!monthlyModel) return null;
    const { months, shown, totals } = monthlyModel;
    const decimals = perLakhOn || smooth3;
    const fmtVal = (v) => (v === null || v === undefined ? '—' : decimals ? fmtNum(v, 1) : fmtInt(v));
    const toolbox = {
      right: 0,
      top: 0,
      itemSize: 13,
      iconStyle: { borderColor: surface.muted },
      emphasis: { iconStyle: { borderColor: surface.ink } },
      feature: { saveAsImage: { name: 'dappa-monthly-trend', backgroundColor: surface.panel, title: 'PNG' } },
    };

    if (monthlyMode === 'yoy') {
      // YoY % calendar: each cell vs the same month a year earlier, computed
      // over the FULL trimmed history so the first displayed year resolves.
      if (!monthlyView) return null;
      const { years, matrix, maxAbs } = buildYoyMatrix(monthlyView.trimmedMonths, monthlyView.trimmedTotals);
      const data = [];
      matrix.forEach((row, yi) => row.forEach((v, mi) => {
        if (v !== null) data.push([mi, yi, Number(v.toFixed(1))]);
      }));
      if (!data.length) return null;
      const cap = Math.max(10, Math.min(75, Math.ceil(maxAbs)));
      return {
        tooltip: {
          position: 'top',
          formatter: (p) => t('trends.monthly.yoyTooltip', {
            month: monthNames[p.value[0]],
            year: years[p.value[1]],
            delta: `${p.value[2] >= 0 ? '+' : '−'}${fmtNum(Math.abs(p.value[2]), 1)}`,
            prevYear: Number(years[p.value[1]]) - 1,
          }),
        },
        toolbox,
        grid: { left: 48, right: 12, top: 28, bottom: 44 },
        xAxis: { type: 'category', data: monthNames, axisLabel: { interval: isNarrow ? 1 : 0, fontSize: 10 } },
        yAxis: { type: 'category', data: years, inverse: true },
        visualMap: {
          min: -cap,
          max: cap,
          orient: 'horizontal',
          right: 0,
          bottom: 0,
          itemWidth: 10,
          itemHeight: 90,
          text: [t('trends.scale.rising'), t('trends.scale.falling')],
          textStyle: { color: surface.muted, fontSize: 10 },
          inRange: { color: divergingRamp },
        },
        series: [{
          type: 'heatmap',
          data,
          itemStyle: { borderColor: surface.panel, borderWidth: 2, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: surface.ink, borderWidth: 1 } },
        }],
      };
    }

    if (monthlyMode === 'calendar') {
      const display = perLakhOn ? toPerLakh(totals, population) : totals;
      const { years, matrix, max } = buildMonthYearMatrix(months, display);
      const data = [];
      matrix.forEach((row, yi) => row.forEach((v, mi) => {
        if (v !== null) data.push([mi, yi, decimals ? Number(Number(v).toFixed(2)) : v]);
      }));
      if (!data.length) return null;
      return {
        tooltip: {
          position: 'top',
          formatter: (p) => t(
            perLakhOn ? 'trends.monthly.calendarTooltipPerLakh' : 'trends.monthly.calendarTooltipCases',
            { month: monthNames[p.value[0]], year: years[p.value[1]], value: fmtVal(p.value[2]) },
          ),
        },
        toolbox,
        grid: { left: 48, right: 12, top: 28, bottom: 44 },
        xAxis: { type: 'category', data: monthNames, axisLabel: { interval: isNarrow ? 1 : 0, fontSize: 10 } },
        yAxis: { type: 'category', data: years, inverse: true },
        visualMap: {
          min: 0,
          max: Math.max(1, max),
          orient: 'horizontal',
          right: 0,
          bottom: 0,
          itemWidth: 10,
          itemHeight: 90,
          text: [t('trends.scale.high'), t('trends.scale.low')],
          textStyle: { color: surface.muted, fontSize: 10 },
          inRange: { color: heatRamp },
        },
        series: [{
          type: 'heatmap',
          data,
          itemStyle: { borderColor: surface.panel, borderWidth: 2, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: surface.ink, borderWidth: 1 } },
        }],
      };
    }

    const markAreaData = [];
    months.forEach((ym, i) => {
      const f = FESTIVAL_MONTHS[ym];
      // fractional category indices → exact full-band shading for that month
      if (f) markAreaData.push([{ name: t(`trends.festival.${f}`), xAxis: i - 0.5 }, { xAxis: i + 0.5 }]);
    });
    // Anomaly flags and level-shift markers share one markLine on series 0 —
    // each datum carries its own style so the two annotation kinds coexist.
    const markLineData = [];
    if (showAnomalies) {
      anomalies.forEach((a) => markLineData.push({
        xAxis: a.index,
        lineStyle: { color: anomalyColor, type: 'dashed', width: 1 },
        label: { show: true, formatter: '⚑', color: anomalyColor, fontSize: 11 },
      }));
    }
    if (showChangepoints) {
      changepoints.forEach((c) => markLineData.push({
        xAxis: c.index,
        lineStyle: { color: colors[1], type: 'solid', width: 1.5 },
        label: {
          show: true,
          formatter: Number.isFinite(c.shiftPct)
            ? `${c.dir === 'up' ? '+' : '−'}${Math.round(Math.abs(c.shiftPct))}%`
            : t('trends.monthly.shift'),
          color: colors[1],
          fontSize: 9,
        },
      }));
    }
    const directLabels = shown.length <= 4 && !isNarrow;
    return {
      color: colors,
      tooltip: { trigger: 'axis', valueFormatter: fmtVal },
      ...(shown.length > 1 ? { legend: { bottom: 0, type: 'scroll' } } : {}),
      toolbox,
      grid: { left: 48, right: directLabels ? 110 : 16, top: 30, bottom: shown.length > 1 ? 36 : 16 },
      xAxis: { type: 'category', boundaryGap: true, data: months.map(monthLabel) },
      yAxis: { type: 'value' },
      series: shown.map((s, i) => {
        let data = s.data;
        if (perLakhOn) data = toPerLakh(data, population);
        if (smooth3) data = rollingMean(data, 3);
        if (decimals) data = data.map((v) => (v === null ? null : Number(Number(v).toFixed(2))));
        return {
          name: s.label || s.name,
          type: 'line',
          data,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2, ...(s.other ? { type: 'dashed', color: otherColor } : {}) },
          ...(s.other ? { itemStyle: { color: otherColor } } : {}),
          emphasis: { focus: 'series' },
          ...(directLabels ? {
            endLabel: { show: true, formatter: (p) => p.seriesName, color: surface.muted, fontSize: 10, distance: 8 },
            labelLayout: { moveOverlap: 'shiftY' },
          } : {}),
          ...(i === 0 ? {
            markArea: {
              silent: true,
              itemStyle: { color: hexToRgba(accent, 0.07) },
              label: { show: true, position: 'insideTop', color: surface.muted, fontSize: 9 },
              data: markAreaData,
            },
            ...(markLineData.length ? {
              markLine: {
                silent: true,
                symbol: 'none',
                data: markLineData,
              },
            } : {}),
          } : {}),
        };
      }),
    };
  }, [monthlyModel, monthlyView, monthlyMode, smooth3, showAnomalies, showChangepoints,
    perLakhOn, population, anomalies, changepoints,
    colors, surface, heatRamp, divergingRamp, otherColor, anomalyColor, accent, isNarrow,
    t, monthNames]);

  // ---- 3. category share donut --------------------------------------------
  const shareOption = useMemo(() => {
    const items = share.data || [];
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => b.count - a.count);
    const head = sorted.slice(0, colors.length);
    const rest = sorted.slice(colors.length);
    const data = head.map((r) => ({ name: shareLabel(r), value: r.count, id: r.id }));
    if (rest.length) {
      data.push({
        name: t('trends.share.other', { n: rest.length }),
        value: rest.reduce((a, r) => a + r.count, 0),
        itemStyle: { color: otherColor },
      });
    }
    return {
      color: colors,
      tooltip: {
        trigger: 'item',
        formatter: (p) => t('trends.share.tooltip', {
          name: p.name, n: fmtInt(p.value), pct: fmtNum(p.percent, 1),
        }),
      },
      series: [{
        type: 'pie',
        radius: isNarrow ? ['46%', '72%'] : ['52%', '78%'],
        center: ['50%', '50%'],
        // 2px surface gap between segments
        itemStyle: { borderColor: surface.panel, borderWidth: 2, borderRadius: 3 },
        label: { color: surface.muted, fontSize: isNarrow ? 10 : 11, formatter: (p) => `${p.name} ${Math.round(p.percent)}%` },
        labelLine: { lineStyle: { color: surface.grid } },
        emphasis: { label: { color: surface.ink } },
        data,
      }],
    };
  }, [share.data, colors, surface, otherColor, isNarrow, t, shareLabel]);

  const onShareEvents = useMemo(() => {
    if (crimeHeadId) return undefined; // items are subheads under a head filter
    return {
      click: (p) => {
        const id = p?.data?.id;
        if (id) setFilter('crimeHeadId', String(id));
      },
    };
  }, [crimeHeadId, setFilter]);

  // ---- 4. district comparison bars ----------------------------------------
  const districtView = useMemo(() => {
    const rows = geo.data || [];
    if (!rows.length) return null;
    const val = metric === 'rate'
      ? (r) => Number(r.ratePerLakh) || 0
      : (r) => Number(r.caseCount) || 0;
    const ranked = [...rows].filter((r) => val(r) > 0).sort((a, b) => val(b) - val(a));
    const sorted = ranked.slice(0, 14).reverse(); // horizontal bars grow bottom-up
    if (!sorted.length) return null;
    const fmt = (v) => (metric === 'rate' ? fmtNum(v, 1) : fmtInt(v));
    const nameOf = (r) => tName('districts', r.districtId, r.districtName);
    // Keyed by the DISPLAYED label — the click handler only ever sees that.
    const byName = new Map(rows.map((r) => [nameOf(r), r]));
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps) => t(
          metric === 'rate' ? 'trends.district.tooltipRate' : 'trends.district.tooltipCases',
          { name: ps[0].name, value: fmt(ps[0].value) },
        ),
      },
      toolbox: {
        right: 0,
        top: 0,
        itemSize: 13,
        iconStyle: { borderColor: surface.muted },
        emphasis: { iconStyle: { borderColor: surface.ink } },
        feature: { saveAsImage: { name: 'dappa-district-comparison', backgroundColor: surface.panel, title: 'PNG' } },
      },
      grid: isNarrow
        ? { left: 4, right: 44, top: 26, bottom: 24, containLabel: true }
        : { left: 150, right: 56, top: 26, bottom: 24 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: sorted.map(nameOf),
        axisLabel: { width: isNarrow ? 86 : 140, overflow: 'truncate', fontSize: isNarrow ? 10 : 11 },
      },
      series: [{
        type: 'bar',
        barMaxWidth: 14,
        data: sorted.map((r) => ({
          value: metric === 'rate' ? Number(val(r).toFixed(1)) : val(r),
          itemStyle: {
            // single-hue magnitude bars; a selected district stays solid while
            // the rest recede — same hue, lower opacity, not a repaint
            color: !districtId || String(r.districtId) === String(districtId)
              ? accent
              : hexToRgba(accent, 0.35),
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: surface.muted,
          fontSize: 10,
          formatter: (p) => fmt(p.value),
        },
      }],
    };
    return { option, byName, ranked, nameOf };
  }, [geo.data, metric, districtId, accent, surface, isNarrow, t, tName]);

  const onDistrictEvents = useMemo(() => ({
    click: (p) => {
      const row = districtView?.byName.get(p?.name);
      if (!row) return;
      // clicking the already-focused district clears the filter (toggle)
      setFilter('districtId', String(row.districtId) === String(districtId) ? '' : String(row.districtId));
    },
  }), [districtView, districtId, setFilter]);

  // ---- seasonal profile (calendar-month averages) -------------------------
  const seasonalProfile = useMemo(() => {
    if (!monthlyView) return null;
    const byMonth = calendarMonthMeans(monthlyView.trimmedMonths, monthlyView.trimmedTotals);
    return byMonth.some((v) => v !== null && v > 0) ? byMonth : null;
  }, [monthlyView]);

  const seasonalOption = useMemo(() => {
    if (!seasonalProfile) return null;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps) => t('trends.seasonal.tooltip', {
          month: ps[0].name, value: fmtNum(ps[0].value, 1),
        }),
      },
      grid: { left: 40, right: 8, top: 12, bottom: 24 },
      xAxis: { type: 'category', data: monthNames, axisLabel: { interval: isNarrow ? 1 : 0, fontSize: 10 } },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        barMaxWidth: 18,
        data: seasonalProfile.map((v) => (v === null ? 0 : Number(v.toFixed(1)))),
        itemStyle: { color: hexToRgba(accent, 0.85), borderRadius: [3, 3, 0, 0] },
      }],
    };
  }, [seasonalProfile, accent, isNarrow, t, monthNames]);

  // ---- auto-insight sentences ---------------------------------------------
  const seasonalityText = useMemo(
    () => seasonalityInsight(seasonality.data, t, dayLabel),
    [seasonality.data, t, dayLabel],
  );
  const monthlyText = useMemo(
    () => (monthlyView
      ? monthlyInsight(
        monthlyView.months,
        monthlyView.series.map((s) => ({ ...s, label: headLabel(s.name) })),
        t,
      )
      : null),
    [monthlyView, t, headLabel],
  );
  const trendText = useMemo(() => {
    if (!monthlyView) return null;
    return trendDirectionInsight(
      monthlyView.months,
      monthlyView.totals,
      linearTrend(monthlyView.totals),
      recentDeltaPct(monthlyView.totals, 3),
      t,
    );
  }, [monthlyView, t]);
  const anomalyText = useMemo(
    () => (monthlyView ? anomalySummaryInsight(monthlyView.months, anomalies, t) : null),
    [monthlyView, anomalies, t],
  );
  const seasonalText = useMemo(
    () => (seasonalProfile ? seasonalPeakInsight(seasonalProfile, monthNames, t) : null),
    [seasonalProfile, monthNames, t],
  );
  const shareText = useMemo(
    () => shareInsight(share.data, t, shareLabel),
    [share.data, t, shareLabel],
  );
  const districtText = useMemo(
    () => districtInsight(geo.data, metric, t, tName),
    [geo.data, metric, t, tName],
  );
  const changepointText = useMemo(
    () => (monthlyView && showChangepoints ? changepointInsight(monthlyView.months, changepoints, t) : null),
    [monthlyView, showChangepoints, changepoints, t],
  );

  // YoY: latest month vs the same month a year earlier (raw counts).
  const yoyPct = useMemo(() => {
    if (!monthlyView) return null;
    const t = monthlyView.totals;
    if (t.length < 13) return null;
    const prev = t[t.length - 13];
    if (!(prev > 0)) return null;
    return ((t[t.length - 1] - prev) / prev) * 100;
  }, [monthlyView]);

  const anyLoading = seasonality.isLoading || monthly.isLoading || share.isLoading || geo.isLoading;

  // ---- CSV exports ---------------------------------------------------------
  const scopeSlug = slug(districtId || 'karnataka');
  const exportSeasonality = () => {
    const s = seasonality.data;
    if (!s?.max) return;
    downloadCsv(
      `dappa-seasonality_${scopeSlug}`,
      ['day', ...s.hours.map((h) => String(h).padStart(2, '0'))],
      s.matrix.map((row, d) => [dayLabel(s.days[d], d), ...row]),
    );
    toast.success(t('trends.toast.seasonality'));
  };
  const exportMonthly = () => {
    if (!monthlyModel) return;
    downloadCsv(
      `dappa-monthly-trend_${scopeSlug}`,
      ['month', ...monthlyModel.shown.map((s) => s.label || s.name), 'total'],
      monthlyModel.months.map((ym, i) => [
        ym, ...monthlyModel.shown.map((s) => s.data[i]), monthlyModel.totals[i],
      ]),
    );
    toast.success(t('trends.toast.monthly', {
      series: monthlyModel.shown.length, months: monthlyModel.months.length,
    }));
  };
  const exportShare = () => {
    const items = share.data || [];
    if (!items.length) return;
    downloadCsv(
      `dappa-category-share_${scopeSlug}`,
      ['crime_head', 'cases', 'share_pct'],
      [...items].sort((a, b) => b.count - a.count)
        .map((r) => [shareLabel(r), r.count, r.sharePct === null ? '' : Number(r.sharePct).toFixed(2)]),
    );
    toast.success(t('trends.toast.share'));
  };
  const exportDistricts = () => {
    if (!districtView) return;
    downloadCsv(
      'dappa-district-comparison',
      ['district', 'cases', 'per_lakh', 'mom_delta_pct'],
      districtView.ranked.map((r) => [
        districtView.nameOf(r), r.caseCount, r.ratePerLakh, r.momDeltaPct ?? '',
      ]),
    );
    toast.success(t('trends.toast.districts'));
  };

  const retryBtn = (q) => (q.error ? (
    <button type="button" className="btn !px-2.5 text-xs min-h-[40px]" onClick={() => q.refetch()}>
      {t('common.action.retry')}
    </button>
  ) : null);

  return (
    <div className="trends-route space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('trends.page.title')}</h1>
          <p className="page-subtitle">{t('trends.page.subtitle')}</p>
        </div>
        <div className="trends-no-print flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={t('trends.palette.aria')}
            size="md"
            value={paletteKey}
            onChange={setPaletteKey}
            options={[
              { value: 'standard', label: t('trends.palette.standard') },
              { value: 'cb', label: t('trends.palette.cb') },
            ]}
          />
          <PinnedViews />
        </div>
      </div>

      <div className="trends-no-print">
        <FilterBar />
      </div>

      <InsightStrip
        loading={anyLoading}
        items={[trendText, seasonalityText, monthlyText, shareText, districtText, seasonalText, anomalyText]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-2">
          <Card
            title={t('trends.seasonality.title')}
            subtitle={seasonView === 'heat'
              ? t('trends.seasonality.subtitleHeat')
              : t('trends.seasonality.subtitleProfile')}
            actions={(
              <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
                <SegmentedControl
                  ariaLabel={t('trends.seasonality.viewAria')}
                  value={seasonView}
                  onChange={setSeasonView}
                  options={[
                    { value: 'heat', label: t('trends.seasonality.heatmap') },
                    { value: 'profile', label: t('trends.seasonality.profile') },
                  ]}
                />
                {retryBtn(seasonality)}
                <CsvButton onClick={exportSeasonality} disabled={!seasonalityOption} tip={t('trends.seasonality.csvTip')} />
              </div>
            )}
          >
            <ChartBody
              option={seasonView === 'profile' ? profileOption : seasonalityOption}
              height={320}
              loading={seasonality.isLoading}
              error={seasonality.error}
              onRetry={() => seasonality.refetch()}
              emptyMessage={t('trends.seasonality.empty')}
            />
            {quickStats && !seasonality.isLoading && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5" aria-label={t('trends.seasonality.quickAria')}>
                <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
                  {t('trends.seasonality.busiestDay')} <span className="font-semibold text-ink">{dayLabel(quickStats.busiestDay, quickStats.busiestDayIndex)}</span>
                  <span className="num">({fmtNum(quickStats.busiestDayPct, 0)}%)</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
                  {t('trends.seasonality.peakWindow')} <span className="font-semibold text-ink num">{String(quickStats.bandStart).padStart(2, '0')}:00–{String(quickStats.bandEnd).padStart(2, '0')}:00</span>
                  <span className="num">({fmtNum(quickStats.bandPct, 0)}%)</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2.5 py-1 text-[11px] text-muted">
                  {t('trends.seasonality.weekendShare')} <span className="font-semibold text-ink num">{fmtNum(quickStats.weekendPct, 0)}%</span>
                </span>
              </div>
            )}
          </Card>
          <InsightLine text={seasonalityText} loading={seasonality.isLoading} />
        </div>

        <div className="space-y-2">
          <Card
            title={t('trends.share.title')}
            subtitle={crimeHeadId
              ? t('trends.share.subtitleFiltered')
              : t('trends.share.subtitle')}
            actions={(
              <div className="trends-no-print flex items-center gap-1.5">
                {retryBtn(share)}
                <CsvButton onClick={exportShare} disabled={!shareOption} tip={t('trends.share.csvTip')} />
              </div>
            )}
          >
            <ChartBody
              option={shareOption}
              height={320}
              loading={share.isLoading}
              error={share.error}
              onRetry={() => share.refetch()}
              emptyMessage={t('trends.share.empty')}
              onEvents={onShareEvents}
            />
          </Card>
          <InsightLine text={shareText} loading={share.isLoading} />
        </div>
      </div>

      <div className="space-y-2">
        <Card
          title={t('trends.monthly.title')}
          subtitle={monthlyMode === 'lines'
            ? t('trends.monthly.subtitleLines', { n: MAX_MONTHS })
            : monthlyMode === 'calendar'
              ? t('trends.monthly.subtitleCalendar', { n: MAX_MONTHS })
              : t('trends.monthly.subtitleYoy')}
          actions={(
            <SegmentedControl
              ariaLabel={t('trends.monthly.viewAria')}
              value={monthlyMode}
              onChange={setMonthlyMode}
              options={[
                { value: 'lines', label: t('trends.monthly.lines') },
                { value: 'calendar', label: t('trends.monthly.calendar') },
                { value: 'yoy', label: t('trends.monthly.yoy') },
              ]}
            />
          )}
        >
          <div className="trends-no-print flex flex-wrap items-center gap-1.5 mb-3">
            <ToggleChip
              on={smooth3}
              onClick={() => setSmooth3((v) => !v)}
              disabled={monthlyMode !== 'lines'}
              title={t('trends.monthly.smoothTip')}
            >
              {t('trends.monthly.smooth')}
            </ToggleChip>
            <ToggleChip
              on={showAnomalies}
              onClick={() => setShowAnomalies((v) => !v)}
              disabled={monthlyMode !== 'lines'}
              title={t('trends.monthly.anomaliesTip')}
            >
              {t('trends.monthly.anomalies')}
            </ToggleChip>
            <ToggleChip
              on={showChangepoints}
              onClick={() => setShowChangepoints((v) => !v)}
              disabled={monthlyMode !== 'lines'}
              title={t('trends.monthly.levelShiftsTip')}
            >
              {t('trends.monthly.levelShifts')}
            </ToggleChip>
            <ToggleChip
              on={perLakhOn}
              onClick={() => setPerLakh((v) => !v)}
              disabled={!population}
              title={population ? t('trends.monthly.perLakhTip') : t('trends.monthly.perLakhUnavailable')}
            >
              {t('trends.monthly.perLakh')}
            </ToggleChip>
            <span className="flex-1" aria-hidden="true" />
            {retryBtn(monthly)}
            <CsvButton onClick={exportMonthly} disabled={!monthlyModel} tip={t('trends.monthly.csvTip')} />
          </div>
          <ChartBody
            option={monthlyOption}
            height={340}
            loading={monthly.isLoading}
            error={monthly.error}
            onRetry={() => monthly.refetch()}
            emptyMessage={t('trends.monthly.empty')}
          />
        </Card>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          <InsightLine text={monthlyText} loading={monthly.isLoading} />
          {yoyPct !== null && !monthly.isLoading && (
            <span className="inline-flex items-center gap-1.5 px-1 text-xs text-muted">
              {t('trends.monthly.vsLastYear')}
              <StatDelta value={yoyPct} positiveIsGood={false} label={t('trends.monthly.yoyLabel')} />
            </span>
          )}
        </div>
        {showAnomalies && <InsightLine text={anomalyText} />}
        {showChangepoints && <InsightLine text={changepointText} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-2">
          <Card
            title={t('trends.district.title')}
            subtitle={districtId
              ? t('trends.district.subtitleFiltered')
              : t('trends.district.subtitle')}
            actions={(
              <div className="trends-no-print flex flex-wrap items-center justify-end gap-1.5">
                <SegmentedControl
                  ariaLabel={t('trends.district.metricAria')}
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: 'cases', label: t('trends.district.cases') },
                    { value: 'rate', label: t('trends.district.perLakh') },
                  ]}
                />
                {retryBtn(geo)}
                <CsvButton onClick={exportDistricts} disabled={!districtView} tip={t('trends.district.csvTip')} />
              </div>
            )}
          >
            <ChartBody
              option={districtView?.option || null}
              height={380}
              loading={geo.isLoading}
              error={geo.error}
              onRetry={() => geo.refetch()}
              emptyMessage={t('trends.district.empty')}
              onEvents={onDistrictEvents}
            />
          </Card>
          <InsightLine text={districtText} loading={geo.isLoading} />
        </div>

        <div className="space-y-2">
          <Card
            title={t('trends.seasonal.title')}
            subtitle={t('trends.seasonal.subtitle')}
          >
            <ChartBody
              option={seasonalOption}
              height={380}
              loading={monthly.isLoading}
              error={monthly.error}
              onRetry={() => monthly.refetch()}
              emptyMessage={t('trends.seasonal.empty')}
            />
          </Card>
          <InsightLine text={seasonalText} loading={monthly.isLoading} />
        </div>
      </div>

      <StackedShare
        baseParams={apiParams}
        colors={colors}
        otherColor={otherColor}
        surface={surface}
      />

      <CompareGrid
        window={compareWindow}
        norm={perLakhOn}
        pops={pops}
        colors={colors}
        anomalyColor={anomalyColor}
        defaultDistrictIds={topDistrictIds}
      />

      <Decomposition
        months={monthlyView?.trimmedMonths || []}
        values={monthlyView?.trimmedTotals || []}
        loading={monthly.isLoading}
        error={monthly.error}
        onRetry={() => monthly.refetch()}
        scope={districtId || 'karnataka'}
        colors={colors}
        surface={surface}
        anomalyColor={anomalyColor}
        isNarrow={isNarrow}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <SocioScatter
          geoRows={geo.data}
          geoLoading={geo.isLoading}
          geoError={geo.error}
          onRetryGeo={() => geo.refetch()}
          districtId={districtId}
          setFilter={setFilter}
          accent={accent}
          surface={surface}
          isNarrow={isNarrow}
        />
        <MixRadar
          window={compareWindow}
          districtId={districtId}
          colors={colors}
          otherColor={otherColor}
          surface={surface}
        />
      </div>
    </div>
  );
}
