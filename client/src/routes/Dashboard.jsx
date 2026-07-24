// Command Dashboard — strategic intelligence hub. KPI link tiles (sparkline
// with 12-mo baseline, MoM + YoY, detection-rate target bar, next-month
// forecast tile), live intelligence ticker, quick filter chips, month-vs-month
// compare strip with direction filter, Karnataka choropleth with five value
// modes (cases / per-lakh / MoM / derived population / station risk), z≥2
// red-zone pulsing, city-unit markers, population-correlation readout and a
// per-district drill sheet, 12-month trend (stacked / share / line / total
// with rolling mean + 2σ spikes + forecast band, month-range brush that can
// become the global date filter, PNG export), rising subheads, category
// donut/Pareto, seasonality heatmap with night/weekend splits, district
// leaderboard + compare, hotspot windows, station-risk watchlist, alerts feed
// with quick-ack, saved views, CSV/poster exports, panel maximize, keyboard
// shortcuts, configurable auto-refresh and a print-ready situation brief.
// Route-local modules live in ./dashboard/.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  useKpis, useDistrictsGeo, useTrendsMonthly, useCategoryShare, useSeasonality,
  useAlerts, useLookups, useHotspots, useStationRisk, useForecast,
} from '../lib/api.js';
import { useUrlFilters, filterSearchString } from '../lib/filters.js';
import {
  polygonForUnit, normalizeUnitCode, unitInfo, CITY_UNIT_IDS,
} from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import PulseDot from '../components/PulseDot.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import MiniChoropleth from '../components/MiniChoropleth.jsx';
import { useTheme } from '../components/ThemeProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt, fmtPct, fmtNum, monthLabel, dateLabel } from '../lib/format.js';

import DashPanel from './dashboard/DashPanel.jsx';
import DashChart from './dashboard/DashChart.jsx';
import KpiLinkTile from './dashboard/KpiLinkTile.jsx';
import QuickFilters from './dashboard/QuickFilters.jsx';
import CompareStrip from './dashboard/CompareStrip.jsx';
import Leaderboard from './dashboard/Leaderboard.jsx';
import AlertsFeed, { isOpenAlert } from './dashboard/AlertsFeed.jsx';
import AlertDigest from './dashboard/AlertDigest.jsx';
import ShortcutsSheet from './dashboard/ShortcutsSheet.jsx';
import useDashShortcuts from './dashboard/useDashShortcuts.js';
import OmniBox from './dashboard/OmniBox.jsx';
import SavedViews from './dashboard/SavedViews.jsx';
import CategoryDonut from './dashboard/CategoryDonut.jsx';
import SeasonalityPanel from './dashboard/SeasonalityPanel.jsx';
import CompareDistricts from './dashboard/CompareDistricts.jsx';
import IntelTicker from './dashboard/IntelTicker.jsx';
import HotspotWindows from './dashboard/HotspotWindows.jsx';
import RiskWatchlist from './dashboard/RiskWatchlist.jsx';
import DistrictDrillSheet from './dashboard/DistrictDrillSheet.jsx';
import { usePanelPrefs, useAutoRefresh } from './dashboard/prefs.js';
import { downloadCsv, downloadDataUrl, stamp } from './dashboard/exports.js';
import {
  detectionRatePct, CHORO_RAMP, buildCompareView, buildTrendOption,
  buildTotalTrendOption, withBrush, useLocalPref, useMedia,
} from './dashboard/lib.js';
import {
  unitPopulation, populationCorrelation, riskPerPolygon, redZonesFromAlerts,
  detectSpikes, seasonalitySplits, buildInsights,
} from './dashboard/insights.js';
import { buildDashboardPoster } from './dashboard/poster.js';

const DETECTION_TARGET = 65; // state target, %

function QueryFallback({ query, what }) {
  if (query.isLoading) return <LoadingSkeleton lines={4} />;
  return (
    <EmptyState
      compact
      title={`Couldn't load ${what}`}
      message={query.error?.message}
      action={<button type="button" className="btn" onClick={() => query.refetch()}>Retry</button>}
    />
  );
}

function RisingChips({ kpis, share, linkSearch = '' }) {
  const chips = useMemo(() => {
    const items = [];
    const top = kpis.data?.topRisingSubhead;
    if (top?.name) items.push({ id: `kpi-${top.id}`, name: top.name, deltaPct: Number(top.deltaPct) });
    const withDelta = (share.data || []).filter((s) => Number.isFinite(Number(s.deltaPct)));
    const pool = withDelta.length ? withDelta : (share.data || []);
    const sorted = [...pool].sort((a, b) => (Number(b.deltaPct) || 0) - (Number(a.deltaPct) || 0) || b.count - a.count);
    for (const s of sorted) {
      if (items.length >= 5) break;
      if (items.some((it) => it.name === s.name)) continue;
      items.push({ id: s.id, name: s.name, deltaPct: Number.isFinite(Number(s.deltaPct)) ? Number(s.deltaPct) : null });
    }
    return items.slice(0, 5);
  }, [kpis.data, share.data]);

  // Skeleton while EITHER source is still loading — an early-empty second
  // query must not flash the empty state before the first one settles.
  if (kpis.isLoading || share.isLoading) return <LoadingSkeleton lines={2} />;
  if (!chips.length) return <EmptyState compact title="No rising categories" message="Nothing trending upward in this window." />;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <Link
          key={c.id || i}
          to={`/trends${linkSearch}`}
          className="chip min-h-[40px] px-3 hover:border-amber/50 transition-colors"
          title="Open Trends"
        >
          <span className="truncate max-w-[11rem]">{c.name}</span>
          {c.deltaPct !== null && Number.isFinite(c.deltaPct) && (
            <span className={`num font-semibold ${c.deltaPct >= 0 ? 'text-signal' : 'text-teal'}`}>
              {c.deltaPct >= 0 ? '▲' : '▼'}{fmtPct(Math.abs(c.deltaPct), { fraction: false, digits: 0 })}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ---- toolbar chrome --------------------------------------------------------

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Ic = ({ children }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" {...S} aria-hidden="true" className="shrink-0">{children}</svg>
);
const ICON = {
  refresh: <Ic><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Ic>,
  views: <Ic><path d="M6 3h12v18l-6-4-6 4Z" /></Ic>,
  link: <Ic><path d="M10.5 13.5a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7l-1.5 1.5" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3.3 3.3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></Ic>,
  print: <Ic><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 14h10v7H7Z" /></Ic>,
  poster: <Ic><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></Ic>,
  collapse: <Ic><path d="m7 10 5-5 5 5M7 19l5-5 5 5" /></Ic>,
  expand: <Ic><path d="m7 5 5 5 5-5M7 14l5 5 5-5" /></Ic>,
  reset: <Ic><path d="M3 12a9 9 0 1 0 2.64-6.36" /><path d="M3 3v6h6" /></Ic>,
  help: <Ic><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.7c0 1.6-2.5 2.1-2.5 3.6" /><path d="M12 17h.01" strokeWidth="2.6" /></Ic>,
};

function ToolBtn({ label, title, onClick, active = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
        active
          ? 'border-amber/60 bg-amber/5 text-amber'
          : 'border-grid bg-panel text-muted hover:border-primary/50 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// ---- choropleth value modes ------------------------------------------------

const CHORO_MODES = [
  { value: 'cases', label: 'Cases' },
  { value: 'rate', label: 'Per lakh' },
  { value: 'mom', label: 'MoM' },
  { value: 'pop', label: 'Population' },
  { value: 'risk', label: 'Risk' },
];
const CHORO_SUB = {
  cases: 'All police units, summed per census district',
  rate: 'Average cases per lakh population',
  mom: 'Positive month-over-month change (falling districts muted)',
  pop: 'Socio-economic overlay — derived population per district',
  risk: 'Socio-economic overlay — average predicted station risk (30d)',
};
const CHORO_LABEL = {
  cases: 'cases', rate: 'per lakh (avg)', mom: '% MoM rise', pop: 'people (derived)', risk: 'avg station risk',
};

function choroAggregate(rows, mode) {
  const acc = {};
  const cnt = {};
  for (const r of rows || []) {
    const poly = polygonForUnit(r.districtId ?? r.unitId);
    if (!poly) continue;
    let v;
    if (mode === 'rate') v = Number(r.ratePerLakh) || 0;
    else if (mode === 'mom') v = Math.max(0, Number(r.momDeltaPct) || 0);
    else if (mode === 'pop') v = unitPopulation(r) || 0;
    else v = Number(r.caseCount ?? r.count) || 0;
    acc[poly] = (acc[poly] || 0) + v;
    cnt[poly] = (cnt[poly] || 0) + 1;
  }
  for (const key of Object.keys(acc)) {
    // rates don't sum across the units sharing a polygon — average them
    acc[key] = Math.round(mode === 'rate' ? acc[key] / cnt[key] : acc[key]);
  }
  return acc;
}

const AUTO_INTERVALS = [30, 60, 300];
const intervalLabel = (s) => (s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`);

// ---------------------------------------------------------------------------

export default function Dashboard() {
  const toast = useToast();
  const { theme } = useTheme();
  const [searchParams] = useSearchParams();
  const search = filterSearchString(searchParams);
  const { apiParams, districtId, crimeHeadId, from, to, setFilter, setFilters } = useUrlFilters();
  const lookups = useLookups();

  const kpis = useKpis(apiParams);
  const geo = useDistrictsGeo(apiParams);
  // District-unfiltered variant (same date/head filters) — the leaderboard,
  // quick-filter chips and district compare always rank the whole state.
  // When no district filter is set this shares geo's query key (deduped).
  const geoAllParams = useMemo(() => {
    const p = { ...apiParams };
    delete p.districtId;
    return p;
  }, [apiParams]);
  const geoAll = useDistrictsGeo(geoAllParams);
  const trends = useTrendsMonthly(apiParams);
  const share = useCategoryShare(apiParams);
  const seasonality = useSeasonality(apiParams);
  const alerts = useAlerts();
  const hotspots = useHotspots({});
  const riskQ = useStationRisk({});
  const forecastQ = useForecast(apiParams);

  // ---- layout prefs / refresh / shortcuts ---------------------------------
  const { pinned, collapsed, togglePin, toggleCollapse, collapseAll, expandAll, resetLayout } = usePanelPrefs();
  const [autoInt, setAutoInt] = useLocalPref('dappa-dash-autoint', 60);
  const auto = useAutoRefresh(Number(autoInt) || 60);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [maxPanelId, setMaxPanelId] = useState(null);
  const omniRef = useRef(null);
  const manualRefresh = () => { auto.refreshNow(); toast.info('Dashboard refreshed'); };
  const cycleInterval = () => {
    const idx = AUTO_INTERVALS.indexOf(Number(autoInt));
    const next = AUTO_INTERVALS[(idx + 1) % AUTO_INTERVALS.length];
    setAutoInt(next);
    toast.info(`Auto-refresh cadence: every ${intervalLabel(next)}`);
  };
  useDashShortcuts({
    onRefresh: manualRefresh,
    onToggleAuto: auto.toggle,
    onFocusSearch: () => omniRef.current?.focus(),
    onOpenViews: () => setViewsOpen(true),
    onPrint: () => window.print(),
  });

  // ---- KPI derivations ----------------------------------------------------
  const k = kpis.data || {};
  const detectionPct = detectionRatePct(k.detectionRate);
  const momPct = Number.isFinite(Number(k.momPct)) ? Number(k.momPct) : undefined;

  const monthlyTotals = useMemo(() => {
    const t = trends.data;
    if (!t || !t.months.length) return null;
    const totals = t.months.map((_, i) => t.series.reduce((a, s) => a + (Number(s.data[i]) || 0), 0));
    return { months: t.months, totals };
  }, [trends.data]);

  const firSpark = monthlyTotals ? monthlyTotals.totals.slice(-12) : undefined;
  const firAvg12 = useMemo(() => {
    if (!firSpark || !firSpark.length) return null;
    return firSpark.reduce((a, b) => a + b, 0) / firSpark.length;
  }, [firSpark]);
  const yoyPct = useMemo(() => {
    if (!monthlyTotals || monthlyTotals.totals.length < 13) return undefined;
    const n = monthlyTotals.totals.length;
    const cur = monthlyTotals.totals[n - 1];
    const prior = monthlyTotals.totals[n - 13];
    return prior > 0 ? ((cur - prior) / prior) * 100 : undefined;
  }, [monthlyTotals]);

  const compareView = useMemo(() => buildCompareView(trends.data), [trends.data]);

  // Next-month projection (model + confidence interval) for the 5th KPI tile.
  const fcNext = forecastQ.data?.forecast?.[0] || null;
  const fcDeltaPct = useMemo(() => {
    const hist = forecastQ.data?.history;
    const last = hist?.length ? Number(hist[hist.length - 1].actual) : null;
    if (!fcNext || !last || last <= 0) return undefined;
    return ((Number(fcNext.predicted) - last) / last) * 100;
  }, [forecastQ.data, fcNext]);
  const showForecastTile = !forecastQ.error;

  // ---- choropleth ---------------------------------------------------------
  const [choroMode, setChoroMode] = useLocalPref('dappa-dash-choromode', 'cases');
  const [cityMarkersOn, setCityMarkersOn] = useLocalPref('dappa-dash-citymarkers', false);
  const riskPoly = useMemo(() => riskPerPolygon(riskQ.data), [riskQ.data]);
  const choroValues = useMemo(
    () => (choroMode === 'risk' ? riskPoly : choroAggregate(geo.data, choroMode)),
    [geo.data, choroMode, riskPoly],
  );
  // Red zones: server anomaly flags UNION districts whose open alerts run
  // |z| ≥ 2 above their historical mean — both pulse on the map.
  const redZones = useMemo(() => redZonesFromAlerts(alerts.data), [alerts.data]);
  const alertPolygons = useMemo(
    () => [...new Set([
      ...(geo.data || []).filter((d) => d.alert).map((d) => polygonForUnit(d.districtId)).filter(Boolean),
      ...redZones.map((z) => z.polygon),
    ])],
    [geo.data, redZones],
  );
  const correlation = useMemo(() => populationCorrelation(geoAll.data), [geoAll.data]);
  const cityMarkers = useMemo(() => {
    if (!cityMarkersOn) return [];
    return CITY_UNIT_IDS.map((id) => {
      const u = unitInfo(id);
      if (!u) return null;
      const row = (geoAll.data || []).find((r) => normalizeUnitCode(r.districtId) === id);
      return {
        lat: u.lat,
        lng: u.lng,
        label: u.name,
        value: choroMode === 'cases' ? row?.caseCount : undefined,
        unitId: id,
      };
    }).filter(Boolean);
  }, [cityMarkersOn, geoAll.data, choroMode]);
  const ramp = CHORO_RAMP[theme] || CHORO_RAMP.dark;

  // Polygon click opens the drill sheet (GeoIntel stays one tap away inside it).
  const [drillPolygon, setDrillPolygon] = useState(null);
  const onPolygonClick = (name) => setDrillPolygon(name);
  const onMarkerClick = (m) => setDrillPolygon(polygonForUnit(m.unitId));
  const choroLoading = geo.isLoading || (choroMode === 'risk' && riskQ.isLoading);

  // ---- trend chart --------------------------------------------------------
  const [trendMode, setTrendMode] = useLocalPref('dappa-dash-trendmode', 'stacked');
  const [brushOn, setBrushOn] = useLocalPref('dappa-dash-trendbrush', false);
  const [pendingRange, setPendingRange] = useState(null);
  const isNarrow = useMedia('(max-width: 480px)');
  const totalSpikes = useMemo(
    () => (trendMode === 'total' && monthlyTotals ? detectSpikes(monthlyTotals.totals) : []),
    [trendMode, monthlyTotals],
  );
  const trendOption = useMemo(() => {
    const opt = trendMode === 'total'
      ? buildTotalTrendOption(trends.data, { narrow: isNarrow, forecast: forecastQ.data, spikes: totalSpikes })
      : buildTrendOption(trends.data, trendMode, isNarrow);
    return brushOn ? withBrush(opt, isNarrow) : opt;
  }, [trends.data, trendMode, isNarrow, forecastQ.data, totalSpikes, brushOn]);
  const trendRef = useRef(null);

  // months currently on the x-axis (actual data only, forecast excluded) — the
  // brush handler maps slider percents back onto these.
  const brushMonths = useMemo(() => {
    const m = trends.data?.months || [];
    return trendMode === 'total' ? m : m.slice(-12);
  }, [trends.data, trendMode]);
  const brushAxisLen = useMemo(() => {
    if (trendMode !== 'total') return brushMonths.length;
    const extra = (forecastQ.data?.forecast || [])
      .filter((f) => f?.ym && !(trends.data?.months || []).includes(f.ym)).length;
    return brushMonths.length + extra;
  }, [trendMode, brushMonths, forecastQ.data, trends.data]);
  const brushRef = useRef({});
  brushRef.current = { months: brushMonths, axisLen: brushAxisLen };

  useEffect(() => { setPendingRange(null); }, [search, trendMode, brushOn]);

  const focusHead = (name) => {
    const head = (lookups.data?.crimeHeads || []).find((h) => h.headName === name);
    if (!head) return;
    if (String(crimeHeadId) === String(head.crimeHeadId)) {
      setFilter('crimeHeadId', '');
      toast.info('Crime-head filter cleared');
    } else {
      setFilter('crimeHeadId', head.crimeHeadId);
      toast.info(`Dashboard filtered to ${name}`);
    }
  };
  // echarts-for-react binds onEvents at chart init — route through refs so
  // clicks/zooms always see the current crimeHeadId/lookups/months.
  const trendClickRef = useRef(focusHead);
  trendClickRef.current = focusHead;
  const trendEvents = useMemo(() => ({
    click: (p) => p?.seriesName && trendClickRef.current(p.seriesName),
    datazoom: (e) => {
      const { months, axisLen } = brushRef.current;
      if (!months.length) return;
      const b = e?.batch?.[0] || e || {};
      let i0;
      let i1;
      if (Number.isFinite(Number(b.startValue)) && Number.isFinite(Number(b.endValue))) {
        i0 = Number(b.startValue);
        i1 = Number(b.endValue);
      } else if (Number.isFinite(Number(b.start)) && Number.isFinite(Number(b.end))) {
        i0 = Math.round((Number(b.start) / 100) * (axisLen - 1));
        i1 = Math.round((Number(b.end) / 100) * (axisLen - 1));
      } else return;
      i0 = Math.max(0, Math.min(i0, months.length - 1));
      i1 = Math.max(0, Math.min(i1, months.length - 1));
      if (i1 < i0) [i0, i1] = [i1, i0];
      const full = i0 === 0 && i1 >= months.length - 1;
      setPendingRange(full ? null : { fromYm: months[i0], toYm: months[i1] });
    },
  }), []);

  const applyBrushRange = () => {
    if (!pendingRange) return;
    const { fromYm, toYm } = pendingRange;
    const [y, m] = toYm.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setFilters({ range: '', from: `${fromYm}-01`, to: `${toYm}-${String(lastDay).padStart(2, '0')}` });
    setPendingRange(null);
    toast.success(`Date filter set to ${monthLabel(fromYm)} – ${monthLabel(toYm)}`);
  };

  const exportTrendPng = () => {
    const url = trendRef.current?.toDataURL();
    if (url) {
      downloadDataUrl(url, `trend-12m-${stamp()}.png`);
      toast.success('Trend chart downloaded');
    } else {
      toast.error('Chart is not ready yet');
    }
  };

  // ---- alerts (reconciled with the district filter) -----------------------
  const feedQuery = useMemo(() => {
    if (!districtId) return alerts;
    const target = normalizeUnitCode(districtId);
    return { ...alerts, data: (alerts.data || []).filter((a) => normalizeUnitCode(a.districtId) === target) };
  }, [alerts, districtId]);
  const openFeed = useMemo(() => (feedQuery.data || []).filter(isOpenAlert), [feedQuery]);

  const districtName = useMemo(
    () => (lookups.data?.districts || []).find((d) => String(d.districtId) === String(districtId))?.districtName,
    [lookups.data, districtId],
  );
  const headName = useMemo(
    () => (lookups.data?.crimeHeads || []).find((h) => String(h.crimeHeadId) === String(crimeHeadId))?.headName,
    [lookups.data, crimeHeadId],
  );

  // ---- quick filters / leaderboard sources --------------------------------
  const topDistricts = useMemo(
    () => [...(geoAll.data || [])].sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0)).slice(0, 6),
    [geoAll.data],
  );

  // ---- intelligence ticker ------------------------------------------------
  const insights = useMemo(() => buildInsights({
    compareView,
    geoRows: geoAll.data,
    openAlerts: (alerts.data || []).filter(isOpenAlert),
    redZones,
    seasonalityData: seasonality.data,
    splits: seasonalitySplits(seasonality.data),
    forecast: forecastQ.data,
    riskRows: riskQ.data,
    hotspots: hotspots.data,
    correlation,
    detectionPct,
    search,
  }), [compareView, geoAll.data, alerts.data, redZones, seasonality.data,
    forecastQ.data, riskQ.data, hotspots.data, correlation, detectionPct, search]);

  // ---- exports / share / print --------------------------------------------
  const exportGeoCsv = () => downloadCsv(
    `district-density-${stamp()}.csv`,
    ['District', 'Cases', 'Rate per lakh', 'MoM %', 'Population (derived)', 'Anomaly'],
    (geo.data || []).map((r) => [r.districtName || r.districtId, r.caseCount, r.ratePerLakh, r.momDeltaPct, unitPopulation(r) || '', r.alert ? 'yes' : '']),
  );
  const exportLeaderboardCsv = () => downloadCsv(
    `district-leaderboard-${stamp()}.csv`,
    ['District', 'Cases', 'MoM %', 'Anomaly'],
    (geoAll.data || []).map((r) => [r.districtName || r.districtId, r.caseCount, r.momDeltaPct, r.alert ? 'yes' : '']),
  );
  const exportShareCsv = () => downloadCsv(
    `category-share-${stamp()}.csv`,
    ['Crime head', 'Cases', 'Share %', 'MoM %'],
    (share.data || []).map((s) => [s.name, s.count, s.sharePct == null ? '' : Number(s.sharePct).toFixed(1), s.deltaPct == null ? '' : s.deltaPct]),
  );
  const exportCompareCsv = () => {
    if (!compareView) return;
    downloadCsv(
      `month-compare-${stamp()}.csv`,
      ['Crime head', monthLabel(compareView.prevYm), monthLabel(compareView.curYm), 'Δ %'],
      compareView.items.map((it) => [it.name, it.prev, it.cur, it.delta.toFixed(1)]),
    );
  };
  const exportAlertsCsv = () => downloadCsv(
    `alerts-${stamp()}.csv`,
    ['Alert', 'District', 'Crime head', 'Severity', 'z-score', 'Status', 'Period end'],
    (feedQuery.data || []).map((a) => [a.alertId, a.districtName || a.districtId, a.headName, a.severity, a.zScore, a.status, a.periodEnd]),
  );
  const exportHotspotsCsv = () => downloadCsv(
    `hotspot-windows-${stamp()}.csv`,
    ['Cluster', 'Sub head', 'Police unit', 'Hour start', 'Hour end', 'Cases', 'Intensity'],
    (hotspots.data || []).map((h) => [h.clusterId, h.subHeadName || h.label, unitInfo(h.districtId)?.name || h.districtId, h.hourBandStart, h.hourBandEnd, h.caseCount, h.intensity]),
  );
  const exportRiskCsv = () => downloadCsv(
    `station-risk-${stamp()}.csv`,
    ['Station', 'District', 'Risk (30d)', 'Drivers'],
    (riskQ.data || []).map((r) => [r.unitName || r.unitId, unitInfo(r.districtId)?.name || '', r.riskScore, Array.isArray(r.drivers) ? r.drivers.join('; ') : '']),
  );
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied — filters included');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const donutRef = useRef(null);
  const exportPoster = async () => {
    const sevCounts = {};
    for (const a of openFeed) {
      const sev = String(a.severity || 'medium').toLowerCase();
      sevCounts[sev] = (sevCounts[sev] || 0) + 1;
    }
    const sevBits = ['critical', 'high', 'medium', 'low']
      .filter((s) => sevCounts[s])
      .map((s) => `${sevCounts[s]} ${s}`);
    const alertLine = [
      sevBits.length ? `Open alerts — ${sevBits.join(' · ')}` : 'No open alerts',
      redZones.length ? `${redZones.length} red-zone district${redZones.length > 1 ? 's' : ''} at z ≥ 2` : '',
    ].filter(Boolean).join(' · ');
    const movers = [...(geoAll.data || [])]
      .filter((r) => Number.isFinite(Number(r.momDeltaPct)))
      .sort((a, b) => Number(b.momDeltaPct) - Number(a.momDeltaPct))
      .slice(0, 5)
      .map((r) => ({ name: r.districtName || r.districtId, deltaPct: Number(r.momDeltaPct), caseCount: fmtInt(r.caseCount) }));
    const url = await buildDashboardPoster({
      filterSummary,
      generatedAt: dateLabel(new Date().toISOString().slice(0, 10)),
      kpis: [
        {
          label: 'FIRs this month',
          value: fmtInt(k.totalFirs),
          delta: momPct !== undefined ? `${momPct >= 0 ? '▲' : '▼'}${Math.abs(momPct).toFixed(1)}% MoM` : '',
          tone: 'amber',
        },
        { label: 'Heinous cases', value: fmtInt(k.heinousCount), tone: 'red' },
        { label: 'Detection rate', value: detectionPct == null ? '—' : `${detectionPct.toFixed(1)}%`, tone: 'teal' },
        { label: 'Active alerts', value: fmtInt(k.activeAlerts), tone: 'red' },
        ...(fcNext ? [{ label: 'Next-month proj.', value: fmtInt(fcNext.predicted), tone: 'amber' }] : []),
      ],
      trendImg: trendRef.current?.toDataURL() || null,
      donutImg: donutRef.current?.toDataURL() || null,
      movers,
      alertLine,
    });
    if (url) {
      downloadDataUrl(url, `dashboard-poster-${stamp()}.png`);
      toast.success('Situation poster downloaded');
    } else {
      toast.error('Could not build the poster');
    }
  };

  const lastUpdated = Math.max(
    kpis.dataUpdatedAt || 0, geo.dataUpdatedAt || 0, trends.dataUpdatedAt || 0,
    share.dataUpdatedAt || 0, alerts.dataUpdatedAt || 0, hotspots.dataUpdatedAt || 0,
    riskQ.dataUpdatedAt || 0, forecastQ.dataUpdatedAt || 0,
  );

  const filterSummary = useMemo(() => {
    const bits = [];
    if (districtId) bits.push(districtName || `District ${districtId}`);
    if (crimeHeadId) bits.push(headName || `Head ${crimeHeadId}`);
    if (from || to) bits.push(`${from ? dateLabel(from) : '…'} → ${to ? dateLabel(to) : '…'}`);
    return bits.length ? bits.join(' · ') : 'Statewide · all crime heads · all time';
  }, [districtId, districtName, crimeHeadId, headName, from, to]);

  // ---- panels (pinned first, spans preserved) -----------------------------
  const panelProps = (id) => ({
    id,
    pinned: pinned.includes(id),
    collapsed: collapsed.includes(id),
    onTogglePin: () => togglePin(id),
    onToggleCollapse: () => toggleCollapse(id),
    maximized: maxPanelId === id,
    onToggleMax: () => setMaxPanelId((prev) => (prev === id ? null : id)),
  });

  const panels = [
    {
      id: 'choropleth',
      span: '',
      node: (
        <DashPanel
          {...panelProps('choropleth')}
          title="Karnataka — case density"
          subtitle={districtId ? 'Filtered district highlighted by volume' : CHORO_SUB[choroMode]}
          headerExtra={(
            <Link to={`/map${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              GeoIntel →
            </Link>
          )}
          onExportCsv={geo.data?.length ? exportGeoCsv : undefined}
        >
          {geo.error ? (
            <QueryFallback query={geo} what="the choropleth" />
          ) : choroLoading ? (
            <LoadingSkeleton height={300} />
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                <SegmentedControl
                  ariaLabel="Choropleth value mode"
                  value={choroMode}
                  onChange={setChoroMode}
                  options={CHORO_MODES}
                  className="shrink-0"
                />
                <button
                  type="button"
                  aria-pressed={cityMarkersOn}
                  title="Show the five city commissionerate markers"
                  onClick={() => setCityMarkersOn(!cityMarkersOn)}
                  className={`chip min-h-[36px] px-2.5 shrink-0 transition-colors ${
                    cityMarkersOn ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
                  }`}
                >
                  City units
                </button>
              </div>
              <MiniChoropleth
                values={choroValues}
                alerts={alertPolygons}
                markers={cityMarkers}
                height={272}
                valueLabel={CHORO_LABEL[choroMode]}
                onPolygonClick={onPolygonClick}
                onMarkerClick={onMarkerClick}
              />
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
                <span>Low</span>
                <span
                  className="h-1.5 w-24 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${ramp.low}, ${ramp.high})` }}
                />
                <span>High</span>
                {alertPolygons.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <PulseDot />
                    {redZones.length
                      ? `${alertPolygons.length} anomaly · ${redZones.length} red zone${redZones.length > 1 ? 's' : ''} (z ≥ 2)`
                      : 'anomaly district'}
                  </span>
                )}
              </div>
              {correlation && (
                <p className="mt-1.5 text-[10px] text-muted">
                  Cases vs population: r = <span className="num text-ink">{correlation.r.toFixed(2)}</span> across{' '}
                  {correlation.n} units — {Math.abs(correlation.r) >= 0.6
                    ? 'volume largely tracks population; Per lakh isolates the true outliers'
                    : 'volume diverges from population — worth a Per lakh look'}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted">Click a district for the drill sheet</p>
            </>
          )}
        </DashPanel>
      ),
    },
    {
      id: 'trend',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('trend')}
          title="12-month trend by crime head"
          subtitle={trendMode === 'total'
            ? 'Full history — total FIRs, 3-month mean, 2σ spikes and forecast band'
            : crimeHeadId
              ? `Focused on ${headName || 'one head'} — click the series again to clear`
              : 'Click a series to focus the whole dashboard on that head'}
          onExportPng={trendOption ? exportTrendPng : undefined}
        >
          <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            <SegmentedControl
              ariaLabel="Trend chart mode"
              value={trendMode}
              onChange={setTrendMode}
              options={[
                { value: 'stacked', label: 'Stacked' },
                { value: 'share', label: '100%' },
                { value: 'line', label: 'Line' },
                { value: 'total', label: 'Total+F' },
              ]}
              className="shrink-0"
            />
            <button
              type="button"
              aria-pressed={brushOn}
              title="Toggle the month-range brush"
              onClick={() => setBrushOn(!brushOn)}
              className={`chip min-h-[36px] px-2.5 shrink-0 transition-colors ${
                brushOn ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
              }`}
            >
              Brush
            </button>
            {pendingRange && (
              <>
                <button
                  type="button"
                  onClick={applyBrushRange}
                  className="chip min-h-[36px] px-2.5 shrink-0 !border-teal/60 !text-teal bg-teal/5 transition-colors"
                  title="Set the global date filter to the brushed months"
                >
                  Apply {monthLabel(pendingRange.fromYm)} – {monthLabel(pendingRange.toYm)}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRange(null)}
                  aria-label="Discard the brushed range"
                  className="chip min-h-[36px] px-2.5 shrink-0 hover:border-signal/50"
                >
                  ✕
                </button>
              </>
            )}
          </div>
          {trends.isLoading ? (
            <LoadingSkeleton height={isNarrow ? 250 : 300} />
          ) : !trendOption ? (
            <EmptyState
              compact
              title="No data"
              message={trends.error?.message || 'No monthly aggregates for the current filters.'}
            />
          ) : (
            <DashChart ref={trendRef} option={trendOption} height={isNarrow ? 250 : 300} onEvents={trendEvents} />
          )}
          {trendMode === 'total' && forecastQ.data?.model && (
            <p className="mt-1 text-[10px] text-muted">
              Forecast: {forecastQ.data.model}
              {forecastQ.data.mape != null && ` · MAPE ${fmtNum(forecastQ.data.mape, 1)}%`}
              {' '}· dashed line + shaded confidence band
            </p>
          )}
        </DashPanel>
      ),
    },
    {
      id: 'compare',
      span: 'xl:col-span-3',
      node: (
        <DashPanel
          {...panelProps('compare')}
          title="This month vs last"
          subtitle={compareView
            ? `${monthLabel(compareView.curYm)} against ${monthLabel(compareView.prevYm)} · biggest risers first`
            : 'Month-over-month comparison by crime head'}
          onExportCsv={compareView ? exportCompareCsv : undefined}
        >
          <CompareStrip view={compareView} loading={trends.isLoading} linkSearch={search} />
        </DashPanel>
      ),
    },
    {
      id: 'rising',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('rising')}
          title="Rising crime subheads"
          subtitle="Largest month-over-month increases"
        >
          <RisingChips kpis={kpis} share={share} linkSearch={search} />
        </DashPanel>
      ),
    },
    {
      id: 'alerts',
      span: '',
      node: (
        <DashPanel
          {...panelProps('alerts')}
          title="Live alerts"
          subtitle={`${districtId ? (districtName || 'Filtered district') : 'Statewide'} · ${fmtInt(openFeed.length)} open`}
          headerExtra={(
            <Link to={`/alerts${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              All →
            </Link>
          )}
          onExportCsv={feedQuery.data?.length ? exportAlertsCsv : undefined}
        >
          <AlertDigest alerts={openFeed} linkSearch={search} />
          <AlertsFeed query={feedQuery} linkSearch={search} />
        </DashPanel>
      ),
    },
    {
      id: 'share',
      span: '',
      node: (
        <DashPanel
          {...panelProps('share')}
          title="Category share"
          subtitle="Share of FIRs by crime head"
          onExportCsv={share.data?.length ? exportShareCsv : undefined}
        >
          <CategoryDonut query={share} linkSearch={search} chartRef={donutRef} />
        </DashPanel>
      ),
    },
    {
      id: 'seasonality',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('seasonality')}
          title="Seasonality — day × hour"
          subtitle="When incidents happen across the week"
        >
          <SeasonalityPanel query={seasonality} />
        </DashPanel>
      ),
    },
    {
      id: 'leaderboard',
      span: '',
      node: (
        <DashPanel
          {...panelProps('leaderboard')}
          title="District movers"
          subtitle="Risers, fallers and the busiest districts"
          onExportCsv={geoAll.data?.length ? exportLeaderboardCsv : undefined}
        >
          {geoAll.error ? (
            <QueryFallback query={geoAll} what="district movers" />
          ) : (
            <Leaderboard
              rows={geoAll.data || []}
              loading={geoAll.isLoading}
              activeDistrictId={districtId}
              onPick={(id) => setFilter('districtId', id)}
              linkSearch={search}
            />
          )}
        </DashPanel>
      ),
    },
    {
      id: 'districts',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('districts')}
          title="Compare districts"
          subtitle="Any two districts, side by side"
        >
          {geoAll.error ? (
            <QueryFallback query={geoAll} what="district comparison" />
          ) : (
            <CompareDistricts rows={geoAll.data || []} loading={geoAll.isLoading} />
          )}
        </DashPanel>
      ),
    },
    {
      id: 'hotspots',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('hotspots')}
          title="Hotspot windows"
          subtitle="Spatiotemporal clusters — where and when they burn"
          headerExtra={(
            <Link to={`/map${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              Map →
            </Link>
          )}
          onExportCsv={hotspots.data?.length ? exportHotspotsCsv : undefined}
        >
          <HotspotWindows query={hotspots} linkSearch={search} />
        </DashPanel>
      ),
    },
    {
      id: 'risk',
      span: '',
      node: (
        <DashPanel
          {...panelProps('risk')}
          title="Station risk watchlist"
          subtitle="Predicted 30-day station risk"
          headerExtra={(
            <Link to={`/predict${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              Predict →
            </Link>
          )}
          onExportCsv={riskQ.data?.length ? exportRiskCsv : undefined}
        >
          <RiskWatchlist query={riskQ} linkSearch={search} />
        </DashPanel>
      ),
    },
  ];

  const PANEL_IDS = panels.map((p) => p.id);
  const allCollapsed = PANEL_IDS.every((id) => collapsed.includes(id));
  const rank = (id) => {
    const i = pinned.indexOf(id);
    return i === -1 ? 1e9 : i;
  };
  const ordered = [...panels].sort((a, b) => rank(a.id) - rank(b.id) || 0);

  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      {/* print-only brief header (window.print → one-page situation brief) */}
      <div className="hidden print:block border-b border-grid pb-2">
        <h1 className="text-lg font-bold text-ink">DAPPA — Command Dashboard situation brief</h1>
        <p className="text-xs text-muted">
          Generated {dateLabel(new Date().toISOString().slice(0, 10))} · {filterSummary} · synthetic demonstration data
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Command Dashboard</h1>
          <p className="page-subtitle">Statewide crime intelligence at a glance</p>
        </div>
        <FilterBar className="!bg-transparent !border-0 !px-0 !py-0 print:hidden" />
      </div>

      {/* toolbar — refresh / auto / views / share / print / poster / layout / help */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 print:hidden" role="toolbar" aria-label="Dashboard tools">
        <ToolBtn label="Refresh all panels" title="Refresh now (r)" onClick={manualRefresh}>
          {ICON.refresh}<span className="hidden sm:inline">Refresh</span>
        </ToolBtn>
        <ToolBtn
          label={auto.enabled ? 'Turn off auto-refresh' : `Turn on ${intervalLabel(Number(autoInt) || 60)} auto-refresh`}
          title="Toggle auto-refresh (a)"
          onClick={auto.toggle}
          active={auto.enabled}
        >
          <PulseDot color={auto.enabled ? 'teal' : 'amber'} />
          <span className="num">{auto.enabled ? `Auto ${auto.remaining}s` : 'Auto off'}</span>
        </ToolBtn>
        <ToolBtn
          label="Cycle the auto-refresh interval"
          title={`Auto-refresh every ${intervalLabel(Number(autoInt) || 60)} — click to change`}
          onClick={cycleInterval}
        >
          <span className="num">every {intervalLabel(Number(autoInt) || 60)}</span>
        </ToolBtn>
        {lastUpdated > 0 && (
          <span className="num shrink-0 px-1 text-[11px] text-muted">
            Updated {format(new Date(lastUpdated), 'HH:mm:ss')}
          </span>
        )}
        <span className="h-4 w-px shrink-0 bg-grid mx-0.5" aria-hidden="true" />
        <ToolBtn label="Saved views" title="Saved views (v)" onClick={() => setViewsOpen(true)}>
          {ICON.views}<span>Views</span>
        </ToolBtn>
        <ToolBtn label="Copy a shareable link with the current filters" onClick={copyLink}>
          {ICON.link}<span className="hidden sm:inline">Copy link</span>
        </ToolBtn>
        <ToolBtn label="Print a one-page situation brief" title="Print brief (b)" onClick={() => window.print()}>
          {ICON.print}<span className="hidden sm:inline">Print brief</span>
        </ToolBtn>
        <ToolBtn label="Download the dashboard as a PNG situation poster" onClick={exportPoster}>
          {ICON.poster}<span className="hidden sm:inline">Poster</span>
        </ToolBtn>
        <span className="h-4 w-px shrink-0 bg-grid mx-0.5" aria-hidden="true" />
        <ToolBtn
          label={allCollapsed ? 'Expand all panels' : 'Collapse all panels'}
          onClick={() => (allCollapsed ? expandAll() : collapseAll(PANEL_IDS))}
        >
          {allCollapsed ? ICON.expand : ICON.collapse}
          <span className="hidden sm:inline">{allCollapsed ? 'Expand all' : 'Collapse all'}</span>
        </ToolBtn>
        <ToolBtn
          label="Reset dashboard layout (clears pins and collapsed panels)"
          onClick={() => { resetLayout(); setMaxPanelId(null); toast.info('Dashboard layout reset'); }}
        >
          {ICON.reset}<span className="hidden sm:inline">Reset</span>
        </ToolBtn>
        <ToolBtn label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
          {ICON.help}
        </ToolBtn>
      </div>

      <IntelTicker items={insights} className="print:hidden" />

      <OmniBox inputRef={omniRef} linkSearch={search} className="print:hidden" />

      <div className="print:hidden">
        <QuickFilters districts={topDistricts} loading={geoAll.isLoading} />
      </div>

      {/* KPI link tiles */}
      <div className={`grid grid-cols-2 gap-3 ${showForecastTile ? 'md:grid-cols-3 xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
        <KpiLinkTile
          to={`/cases${search}`}
          label="FIRs this month"
          value={k.totalFirs}
          mom={momPct}
          yoy={yoyPct}
          positiveIsGood={false}
          loading={kpis.isLoading}
          hint={firAvg12 ? `12-mo avg ${fmtInt(firAvg12)} (dashed) · tap for cases` : 'vs previous month · tap for cases'}
          spark={firSpark}
          sparkBaseline
        />
        <KpiLinkTile
          to={`/cases${search}`}
          label="Heinous cases"
          value={k.heinousCount}
          accent="red"
          loading={kpis.isLoading}
          hint="gravity: heinous"
        />
        <KpiLinkTile
          to={`/predict${search}`}
          label="Detection rate"
          value={detectionPct == null ? '—' : `${detectionPct.toFixed(1)}%`}
          accent="teal"
          loading={kpis.isLoading}
          hint={`chargesheet A / (A + C) · target ${DETECTION_TARGET}%`}
          progress={detectionPct == null ? undefined : { pct: detectionPct, target: DETECTION_TARGET }}
        />
        <KpiLinkTile
          to={`/alerts${search}`}
          label="Active alerts"
          value={k.activeAlerts}
          accent="red"
          pulse={Number(k.activeAlerts) > 0}
          loading={kpis.isLoading}
          hint="unacknowledged anomalies"
        />
        {showForecastTile && (
          <KpiLinkTile
            to={`/predict${search}`}
            label="Next-month projection"
            value={fcNext ? Math.round(Number(fcNext.predicted) || 0) : '—'}
            mom={fcDeltaPct}
            positiveIsGood={false}
            loading={forecastQ.isLoading}
            hint={fcNext
              ? `${forecastQ.data?.model || 'model'}${Number.isFinite(Number(fcNext.lo)) && Number.isFinite(Number(fcNext.hi))
                ? ` · CI ${fmtInt(fcNext.lo)}–${fmtInt(fcNext.hi)}` : ''}${forecastQ.data?.mape != null
                ? ` · MAPE ${fmtNum(forecastQ.data.mape, 1)}%` : ''}`
              : 'no forecast for this selection'}
          />
        )}
      </div>
      {kpis.error && (
        <Card><QueryFallback query={kpis} what="headline KPIs" /></Card>
      )}

      {/* panels — pinned first */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {ordered.map((p) => (
          <div key={p.id} className={p.span}>{p.node}</div>
        ))}
      </div>

      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SavedViews open={viewsOpen} onClose={() => setViewsOpen(false)} />
      {drillPolygon && (
        <DistrictDrillSheet
          polygon={drillPolygon}
          onClose={() => setDrillPolygon(null)}
          baseParams={geoAllParams}
          rows={geoAll.data || []}
          alerts={alerts.data || []}
          hotspots={hotspots.data || []}
          riskRows={riskQ.data || []}
          linkSearch={search}
          activeDistrictId={districtId}
          onFilterDistrict={(id) => {
            setFilter('districtId', id);
            setDrillPolygon(null);
            toast.info(id ? 'Dashboard filtered to the district' : 'District filter cleared');
          }}
        />
      )}
    </div>
  );
}
