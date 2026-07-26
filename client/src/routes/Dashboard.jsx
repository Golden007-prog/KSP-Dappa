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
//
// Second wave (real-data command view): a census-backed per-lakh choropleth
// mode and an adjustable red-zone z threshold, a socio-economic correlation
// board with residual outlier ranking, an emerging/cooling sub-head board, a
// four-way district compare board, a district → station drill explorer with
// breadcrumbs, shift-wise (day/evening/night) split tiles, a year × month heat
// calendar that can retarget the global date filter, a patrol-deployment
// planner driven by hotspot intensity and station risk, a heinous-share KPI
// tile and an open-alert severity rollup.
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
import Badge from '../components/Badge.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import MiniChoropleth from '../components/MiniChoropleth.jsx';
import { useTheme } from '../components/ThemeProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt, fmtPct, fmtNum, monthLabel, dateLabel } from '../lib/format.js';
import { useT, useNames } from '../lib/i18n.jsx';

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
import SocioBoard from './dashboard/SocioBoard.jsx';
import EmergingBoard from './dashboard/EmergingBoard.jsx';
import CompareBoard from './dashboard/CompareBoard.jsx';
import StationExplorer from './dashboard/StationExplorer.jsx';
import ShiftSplit from './dashboard/ShiftSplit.jsx';
import HeatCalendar from './dashboard/HeatCalendar.jsx';
import DeploymentPanel from './dashboard/DeploymentPanel.jsx';
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
import {
  useSocio, useEmerging, useAlertSummary, useMonthlyRaw, useSeasonalityRaw,
} from './dashboard/dataExtra.js';
import {
  joinSocio, polygonCensusRate, monthEndDate, emergingMovers, SOCIO_INDICATOR_KEYS,
} from './dashboard/analytics.js';
import { buildDashboardPoster } from './dashboard/poster.js';

const DETECTION_TARGET = 65; // state target, %

function QueryFallback({ query, title }) {
  const t = useT();
  if (query.isLoading) return <LoadingSkeleton lines={4} />;
  return (
    <EmptyState
      compact
      title={title}
      message={query.error?.message}
      action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
    />
  );
}

function RisingChips({ kpis, share, linkSearch = '' }) {
  const t = useT();
  const tName = useNames();
  const chips = useMemo(() => {
    const items = [];
    const top = kpis.data?.topRisingSubhead;
    if (top?.name) {
      items.push({
        id: `kpi-${top.id}`,
        name: top.name,
        label: tName('crimeSubHeads', top.id, top.name) || top.name,
        deltaPct: Number(top.deltaPct),
      });
    }
    const withDelta = (share.data || []).filter((s) => Number.isFinite(Number(s.deltaPct)));
    const pool = withDelta.length ? withDelta : (share.data || []);
    const sorted = [...pool].sort((a, b) => (Number(b.deltaPct) || 0) - (Number(a.deltaPct) || 0) || b.count - a.count);
    for (const s of sorted) {
      if (items.length >= 5) break;
      if (items.some((it) => it.name === s.name)) continue;
      items.push({
        id: s.id,
        name: s.name,
        label: tName('crimeHeads', s.id, s.name) || s.name,
        deltaPct: Number.isFinite(Number(s.deltaPct)) ? Number(s.deltaPct) : null,
      });
    }
    return items.slice(0, 5);
  }, [kpis.data, share.data, tName]);

  // Skeleton while EITHER source is still loading — an early-empty second
  // query must not flash the empty state before the first one settles.
  if (kpis.isLoading || share.isLoading) return <LoadingSkeleton lines={2} />;
  if (!chips.length) {
    return <EmptyState compact title={t('dashboard.rising.empty')} message={t('dashboard.rising.emptyHint')} />;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <Link
          key={c.id || i}
          to={`/trends${linkSearch}`}
          className="chip min-h-[40px] px-3 hover:border-amber/50 transition-colors"
          title={t('dashboard.rising.openTrends')}
        >
          <span className="truncate max-w-[11rem]">{c.label}</span>
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

// Statewide open-alert rollup from /alerts/summary — a single server-computed
// count of every alert in the store, which the paginated feed cannot give you
// (the feed shows the top few; this says how many exist and where). Renders
// nothing at all rather than a zero row when the endpoint has no alerts.
function AlertSummaryChips({ query, linkSearch = '', onPickDistrict }) {
  const t = useT();
  const tName = useNames();
  const d = query.data;
  if (query.isLoading || query.error || !d || !d.total) return null;
  const open = Number(d.byStatus?.OPEN) || 0;
  const acked = Number(d.byStatus?.ACK) || 0;
  // The server keys severity numerically (3 = critical) — map to the same
  // vocabulary the feed and the poster already use.
  const SEV = { 3: 'critical', 2: 'high', 1: 'medium' };
  const sevBits = Object.entries(d.bySeverity || {})
    .map(([k, v]) => ({ key: SEV[k] || 'low', n: Number(v) || 0 }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <Badge tone={open > 0 ? 'red' : 'slate'} pulse={open > 0}>
        {t('dashboard.alertSummary.open', { n: fmtInt(open), total: fmtInt(d.total) })}
      </Badge>
      {acked > 0 && <Badge tone="teal">{t('dashboard.alertSummary.acked', { n: fmtInt(acked) })}</Badge>}
      {sevBits.map((s) => (
        <Badge key={s.key} tone={s.key === 'critical' ? 'red' : s.key === 'high' ? 'amber' : 'slate'}>
          {t('dashboard.alertSummary.sevBit', { n: fmtInt(s.n), sev: t(`dashboard.sev.${s.key}`) })}
        </Badge>
      ))}
      {(d.topDistricts || []).slice(0, 3).map((x) => (
        <button
          key={x.districtId}
          type="button"
          onClick={() => onPickDistrict?.(x.districtId)}
          title={t('dashboard.alertSummary.districtTitle', {
            name: tName('districts', x.districtId, x.districtName) || x.districtName,
          })}
          className="chip min-h-[32px] gap-1 px-2 text-[10px] hover:border-signal/40"
        >
          <span className="max-w-[7rem] truncate">
            {tName('districts', x.districtId, x.districtName) || x.districtName}
          </span>
          <span className="num font-semibold text-signal">{fmtInt(x.openCount)}</span>
        </button>
      ))}
      <Link to={`/alerts${linkSearch}`} className="ml-auto text-[10px] text-amber hover:underline">
        {t('dashboard.link.all')}
      </Link>
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

// Mode ids are the localStorage/preference contract; the visible label, the
// panel subtitle and the map's value caption all come from the dictionary.
// 'socio' is the census-backed per-lakh rate: /geo/districts ships ratePerLakh
// as null whenever the aggregate table has no population column, so the older
// 'rate' mode can flatten to zero — 'socio' recomputes it from /meta/socio,
// which always carries a real population for all 38 districts.
const CHORO_MODE_IDS = ['cases', 'rate', 'socio', 'mom', 'pop', 'risk'];

// Red-zone pulse sensitivity — the |z| at which an open alert makes its
// district pulse. 2σ is the default; a quiet week is read at 1.5, a flood of
// alerts at 3.
const Z_THRESHOLDS = [1.5, 2, 2.5, 3];

// How far back the heat calendar reaches. AggMonthly starts in 2023-08; five
// years of padding costs nothing (the server returns zero-filled months, which
// monthCalendar drops) and survives the dataset growing.
const CALENDAR_YEARS = 4;

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
const intervalLabel = (s, t) => (s >= 60
  ? t('dashboard.unit.min', { n: Math.round(s / 60) })
  : t('dashboard.unit.sec', { n: s }));

// ---------------------------------------------------------------------------

export default function Dashboard() {
  const toast = useToast();
  const t = useT();
  const tName = useNames();
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

  // ---- second-wave sources (see ./dashboard/dataExtra.js) -----------------
  const socioQ = useSocio();
  const emergingQ = useEmerging({ districtId });
  const alertSummaryQ = useAlertSummary();
  const seasonRawQ = useSeasonalityRaw(apiParams);
  // Multi-year window for the heat calendar — deliberately NOT apiParams, whose
  // date filter is what the calendar exists to help you choose.
  const calendarParams = useMemo(() => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = `${now.getFullYear() - CALENDAR_YEARS}-01-01`;
    return { from, to, ...(crimeHeadId ? { crimeHeadId } : {}), ...(districtId ? { districtId } : {}) };
  }, [crimeHeadId, districtId]);
  const calendarQ = useMonthlyRaw(calendarParams);

  // Crime-head names arrive from the API in English while the chart, the
  // compare strip and the insight sentences must render them in the active
  // language. byName translates for display; byLabel maps a rendered series
  // name back to its lookup row so an ECharts click still resolves a head.
  const headMaps = useMemo(() => {
    const byName = new Map();
    const byLabel = new Map();
    for (const h of lookups.data?.crimeHeads || []) {
      const label = tName('crimeHeads', h.crimeHeadId, h.headName) || h.headName;
      byName.set(h.headName, label);
      byLabel.set(label, h);
      byLabel.set(h.headName, h);
    }
    return { byName, byLabel };
  }, [lookups.data, tName]);
  const headLabel = useMemo(() => (name) => headMaps.byName.get(name) || name, [headMaps]);
  // The seasonality normalizer emits English weekday abbreviations; they stay
  // the data key and only the rendered label is translated.
  const dayLabel = useMemo(() => {
    const KEY = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };
    return (d) => (KEY[d] ? t(`dashboard.day.${KEY[d]}`) : d);
  }, [t]);

  // ---- layout prefs / refresh / shortcuts ---------------------------------
  const { pinned, collapsed, togglePin, toggleCollapse, collapseAll, expandAll, resetLayout } = usePanelPrefs();
  const [autoInt, setAutoInt] = useLocalPref('dappa-dash-autoint', 60);
  const auto = useAutoRefresh(Number(autoInt) || 60);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [maxPanelId, setMaxPanelId] = useState(null);
  const omniRef = useRef(null);
  const manualRefresh = () => { auto.refreshNow(); toast.info(t('dashboard.toast.refreshed')); };
  const cycleInterval = () => {
    const idx = AUTO_INTERVALS.indexOf(Number(autoInt));
    const next = AUTO_INTERVALS[(idx + 1) % AUTO_INTERVALS.length];
    setAutoInt(next);
    toast.info(t('dashboard.toast.cadence', { interval: intervalLabel(next, t) }));
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

  // Heinous share of the current month, with a 12-month share sparkline. Both
  // read heinousCount off the RAW monthly rows — the shared trends normalizer
  // folds that column away, so this is the only place the ratio can come from.
  const heinousPct = Number(k.totalFirs) > 0
    ? (Number(k.heinousCount) / Number(k.totalFirs)) * 100
    : null;
  const heinousSpark = useMemo(() => {
    const rows = (calendarQ.data || []).filter((r) => Number(r?.caseCount) > 0);
    if (rows.length < 3) return undefined;
    return rows.slice(-12).map((r) => Math.round(((Number(r.heinousCount) || 0) / Number(r.caseCount)) * 1000) / 10);
  }, [calendarQ.data]);
  const heinousAvgPct = useMemo(() => {
    if (!heinousSpark || !heinousSpark.length) return null;
    return heinousSpark.reduce((a, b) => a + b, 0) / heinousSpark.length;
  }, [heinousSpark]);

  const compareView = useMemo(() => {
    const v = buildCompareView(trends.data);
    if (!v) return null;
    return { ...v, items: v.items.map((it) => ({ ...it, label: headLabel(it.name) })) };
  }, [trends.data, headLabel]);

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
  const [zThreshold, setZThreshold] = useLocalPref('dappa-dash-zthreshold', 2);
  const minZ = Z_THRESHOLDS.includes(Number(zThreshold)) ? Number(zThreshold) : 2;
  const riskPoly = useMemo(() => riskPerPolygon(riskQ.data), [riskQ.data]);
  const censusRatePoly = useMemo(
    () => polygonCensusRate(geo.data, socioQ.data),
    [geo.data, socioQ.data],
  );
  const choroValues = useMemo(() => {
    if (choroMode === 'risk') return riskPoly;
    if (choroMode === 'socio') return censusRatePoly;
    return choroAggregate(geo.data, choroMode);
  }, [geo.data, choroMode, riskPoly, censusRatePoly]);
  const choroModes = useMemo(
    () => CHORO_MODE_IDS.map((value) => ({ value, label: t(`dashboard.choro.mode.${value}`) })),
    [t],
  );
  // Red zones: server anomaly flags UNION districts whose open alerts run
  // |z| ≥ the chosen threshold above their historical mean — both pulse on the
  // map. The threshold is a live control, so the pulse can be tuned to the real
  // z distribution of the week rather than a hardcoded 2σ.
  const redZones = useMemo(() => redZonesFromAlerts(alerts.data, { minZ }), [alerts.data, minZ]);
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
        label: tName('districts', id, u.name) || u.name,
        value: choroMode === 'cases' ? row?.caseCount : undefined,
        unitId: id,
      };
    }).filter(Boolean);
  }, [cityMarkersOn, geoAll.data, choroMode, tName]);
  const ramp = CHORO_RAMP[theme] || CHORO_RAMP.dark;

  // Polygon click opens the drill sheet (GeoIntel stays one tap away inside it).
  const [drillPolygon, setDrillPolygon] = useState(null);
  const onPolygonClick = (name) => setDrillPolygon(name);
  const onMarkerClick = (m) => setDrillPolygon(polygonForUnit(m.unitId));
  const choroLoading = geo.isLoading
    || (choroMode === 'risk' && riskQ.isLoading)
    || (choroMode === 'socio' && socioQ.isLoading);

  // ---- socio-economic join (C3) -------------------------------------------
  // Statewide rows so the correlation is computed across every district, not
  // just the one currently filtered.
  const socioRows = useMemo(
    () => joinSocio(geoAll.data, socioQ.data),
    [geoAll.data, socioQ.data],
  );
  const socioReady = socioRows.some((r) => SOCIO_INDICATOR_KEYS.some((k) => Number.isFinite(r[k])));
  const emergingFlagged = useMemo(() => emergingMovers(emergingQ.data), [emergingQ.data]);

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
      ? buildTotalTrendOption(trends.data, { narrow: isNarrow, forecast: forecastQ.data, spikes: totalSpikes, t })
      : buildTrendOption(trends.data, trendMode, isNarrow, headLabel);
    return brushOn ? withBrush(opt, isNarrow) : opt;
  }, [trends.data, trendMode, isNarrow, forecastQ.data, totalSpikes, brushOn, t, headLabel]);
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

  // `label` is what the series renders as — headMaps.byLabel accepts both the
  // translated label and the raw English name, so a click resolves either way.
  const focusHead = (label) => {
    const head = headMaps.byLabel.get(label);
    if (!head) return;
    if (String(crimeHeadId) === String(head.crimeHeadId)) {
      setFilter('crimeHeadId', '');
      toast.info(t('dashboard.toast.headCleared'));
    } else {
      setFilter('crimeHeadId', head.crimeHeadId);
      toast.info(t('dashboard.toast.headFiltered', { name: label }));
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
    toast.success(t('dashboard.toast.dateSet', { from: monthLabel(fromYm), to: monthLabel(toYm) }));
  };

  const exportTrendPng = () => {
    const url = trendRef.current?.toDataURL();
    if (url) {
      downloadDataUrl(url, `trend-12m-${stamp()}.png`);
      toast.success(t('dashboard.toast.trendDownloaded'));
    } else {
      toast.error(t('dashboard.toast.chartNotReady'));
    }
  };

  // ---- alerts (reconciled with the district filter) -----------------------
  const feedQuery = useMemo(() => {
    if (!districtId) return alerts;
    const target = normalizeUnitCode(districtId);
    return { ...alerts, data: (alerts.data || []).filter((a) => normalizeUnitCode(a.districtId) === target) };
  }, [alerts, districtId]);
  const openFeed = useMemo(() => (feedQuery.data || []).filter(isOpenAlert), [feedQuery]);

  const districtName = useMemo(() => {
    const raw = (lookups.data?.districts || []).find((d) => String(d.districtId) === String(districtId))?.districtName;
    return raw ? (tName('districts', districtId, raw) || raw) : undefined;
  }, [lookups.data, districtId, tName]);
  const headName = useMemo(() => {
    const raw = (lookups.data?.crimeHeads || []).find((h) => String(h.crimeHeadId) === String(crimeHeadId))?.headName;
    return raw ? (tName('crimeHeads', crimeHeadId, raw) || raw) : undefined;
  }, [lookups.data, crimeHeadId, tName]);

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
    detectionTarget: DETECTION_TARGET,
    search,
    t,
    tName,
    headLabel,
    dayLabel,
  }), [compareView, geoAll.data, alerts.data, redZones, seasonality.data,
    forecastQ.data, riskQ.data, hotspots.data, correlation, detectionPct, search,
    t, tName, headLabel, dayLabel]);

  // ---- exports / share / print --------------------------------------------
  // CSV column headers and the district / head names inside them follow the
  // active language — the file is read by the same officer who exported it.
  const districtLabel = (r) => tName('districts', r.districtId, r.districtName || r.districtId)
    || r.districtName || r.districtId;
  const yes = () => t('dashboard.csv.yes');
  const exportGeoCsv = () => downloadCsv(
    `district-density-${stamp()}.csv`,
    [t('dashboard.csv.district'), t('dashboard.csv.cases'), t('dashboard.csv.ratePerLakh'),
      t('dashboard.csv.momPct'), t('dashboard.csv.population'), t('dashboard.csv.anomaly')],
    (geo.data || []).map((r) => [districtLabel(r), r.caseCount, r.ratePerLakh, r.momDeltaPct, unitPopulation(r) || '', r.alert ? yes() : '']),
  );
  const exportLeaderboardCsv = () => downloadCsv(
    `district-leaderboard-${stamp()}.csv`,
    [t('dashboard.csv.district'), t('dashboard.csv.cases'), t('dashboard.csv.momPct'), t('dashboard.csv.anomaly')],
    (geoAll.data || []).map((r) => [districtLabel(r), r.caseCount, r.momDeltaPct, r.alert ? yes() : '']),
  );
  const exportShareCsv = () => downloadCsv(
    `category-share-${stamp()}.csv`,
    [t('dashboard.csv.crimeHead'), t('dashboard.csv.cases'), t('dashboard.csv.sharePct'), t('dashboard.csv.momPct')],
    (share.data || []).map((s) => [tName('crimeHeads', s.id, s.name) || s.name, s.count, s.sharePct == null ? '' : Number(s.sharePct).toFixed(1), s.deltaPct == null ? '' : s.deltaPct]),
  );
  const exportCompareCsv = () => {
    if (!compareView) return;
    downloadCsv(
      `month-compare-${stamp()}.csv`,
      [t('dashboard.csv.crimeHead'), monthLabel(compareView.prevYm), monthLabel(compareView.curYm), t('dashboard.csv.deltaPct')],
      compareView.items.map((it) => [it.label || it.name, it.prev, it.cur, it.delta.toFixed(1)]),
    );
  };
  const exportAlertsCsv = () => downloadCsv(
    `alerts-${stamp()}.csv`,
    [t('dashboard.csv.alert'), t('dashboard.csv.district'), t('dashboard.csv.crimeHead'),
      t('dashboard.csv.severity'), t('dashboard.csv.zScore'), t('dashboard.csv.status'), t('dashboard.csv.periodEnd')],
    (feedQuery.data || []).map((a) => [
      a.alertId,
      districtLabel(a),
      tName('crimeHeads', a.crimeHeadId, a.headName) || a.headName,
      t(`dashboard.sev.${String(a.severity || 'medium').toLowerCase()}`),
      a.zScore, a.status, a.periodEnd,
    ]),
  );
  const exportHotspotsCsv = () => downloadCsv(
    `hotspot-windows-${stamp()}.csv`,
    [t('dashboard.csv.cluster'), t('dashboard.csv.subHead'), t('dashboard.csv.policeUnit'),
      t('dashboard.csv.hourStart'), t('dashboard.csv.hourEnd'), t('dashboard.csv.cases'), t('dashboard.csv.intensity')],
    (hotspots.data || []).map((h) => [
      h.clusterId,
      tName('crimeHeads', h.crimeHeadId, h.subHeadName || h.label) || h.subHeadName || h.label,
      tName('districts', h.districtId, unitInfo(h.districtId)?.name || h.districtId) || h.districtId,
      h.hourBandStart, h.hourBandEnd, h.caseCount, h.intensity,
    ]),
  );
  const exportRiskCsv = () => downloadCsv(
    `station-risk-${stamp()}.csv`,
    [t('dashboard.csv.station'), t('dashboard.csv.district'), t('dashboard.csv.risk30d'), t('dashboard.csv.drivers')],
    (riskQ.data || []).map((r) => [
      r.unitName || r.unitId,
      tName('districts', r.districtId, unitInfo(r.districtId)?.name || '') || '',
      r.riskScore,
      Array.isArray(r.drivers) ? r.drivers.join('; ') : '',
    ]),
  );
  const exportSocioCsv = () => downloadCsv(
    `socio-correlation-${stamp()}.csv`,
    [t('dashboard.csv.district'), t('dashboard.csv.cases'), t('dashboard.csv.ratePerLakh'),
      t('dashboard.csv.population'), t('dashboard.socio.ind.urbanPct'), t('dashboard.socio.ind.literacyPct'),
      t('dashboard.socio.ind.densityPerKm2'), t('dashboard.socio.ind.perCapitaIncomeIdx')],
    socioRows.map((r) => [
      tName('districts', r.districtId, r.districtName) || r.districtName,
      r.caseCount,
      r.ratePerLakh == null ? '' : Number(r.ratePerLakh).toFixed(2),
      r.population ?? '',
      r.urbanPct ?? '', r.literacyPct ?? '', r.densityPerKm2 ?? '', r.perCapitaIncomeIdx ?? '',
    ]),
  );
  const exportEmergingCsv = () => downloadCsv(
    `emerging-subheads-${stamp()}.csv`,
    [t('dashboard.csv.subHead'), t('dashboard.csv.crimeHead'), t('dashboard.csv.recentAvg'),
      t('dashboard.csv.baselineAvg'), t('dashboard.csv.growthPct'), t('dashboard.csv.emerging')],
    [...(emergingQ.data?.rising || []), ...(emergingQ.data?.falling || [])].map((m) => [
      tName('crimeSubHeads', m.subHeadId, m.subHeadName) || m.subHeadName,
      tName('crimeHeads', m.headId, m.headName) || m.headName || '',
      m.recentAvg, m.baselineAvg, m.growthPct, m.emerging ? yes() : '',
    ]),
  );
  const exportCalendarCsv = () => downloadCsv(
    `month-calendar-${stamp()}.csv`,
    [t('dashboard.csv.month'), t('dashboard.csv.cases'), t('dashboard.csv.heinous')],
    (calendarQ.data || []).filter((r) => Number(r?.caseCount) > 0)
      .map((r) => [r.ym, r.caseCount, r.heinousCount]),
  );
  const exportShiftCsv = () => {
    const rows = seasonRawQ.data?.matrix || [];
    const days = seasonRawQ.data?.weekdays || [];
    if (!rows.length) return;
    downloadCsv(
      `shift-split-${stamp()}.csv`,
      [t('dashboard.csv.weekday'), ...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)],
      rows.map((row, i) => [days[i] ?? i, ...Array.from({ length: 24 }, (_, h) => Number(row?.[h]) || 0)]),
    );
  };

  // A month cell in the heat calendar becomes the global date filter.
  const pickCalendarMonth = (ym) => {
    const end = monthEndDate(ym);
    if (!end) return;
    setFilters({ range: '', from: `${ym}-01`, to: end });
    toast.success(t('dashboard.calendar.applied', { month: monthLabel(ym) }));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('dashboard.toast.linkCopied'));
    } catch {
      toast.error(t('dashboard.toast.linkFailed'));
    }
  };

  const donutRef = useRef(null);
  const socioRef = useRef(null);
  const exportPoster = async () => {
    const sevCounts = {};
    for (const a of openFeed) {
      const sev = String(a.severity || 'medium').toLowerCase();
      sevCounts[sev] = (sevCounts[sev] || 0) + 1;
    }
    const sevBits = ['critical', 'high', 'medium', 'low']
      .filter((s) => sevCounts[s])
      .map((s) => t('dashboard.poster.sevBit', { n: sevCounts[s], sev: t(`dashboard.sev.${s}`) }));
    const alertLine = [
      sevBits.length
        ? t('dashboard.poster.openAlerts', { bits: sevBits.join(' · ') })
        : t('dashboard.poster.noOpenAlerts'),
      redZones.length
        ? t(redZones.length > 1 ? 'dashboard.poster.redZoneMany' : 'dashboard.poster.redZoneOne', { n: redZones.length })
        : '',
    ].filter(Boolean).join(' · ');
    const movers = [...(geoAll.data || [])]
      .filter((r) => Number.isFinite(Number(r.momDeltaPct)))
      .sort((a, b) => Number(b.momDeltaPct) - Number(a.momDeltaPct))
      .slice(0, 5)
      .map((r) => ({ name: districtLabel(r), deltaPct: Number(r.momDeltaPct), caseCount: fmtInt(r.caseCount) }));
    const url = await buildDashboardPoster({
      t,
      filterSummary,
      generatedAt: dateLabel(new Date().toISOString().slice(0, 10)),
      kpis: [
        {
          label: t('dashboard.kpi.firs'),
          value: fmtInt(k.totalFirs),
          delta: momPct !== undefined
            ? t('dashboard.poster.momDelta', { arrow: momPct >= 0 ? '▲' : '▼', pct: Math.abs(momPct).toFixed(1) })
            : '',
          tone: 'amber',
        },
        { label: t('dashboard.kpi.heinous'), value: fmtInt(k.heinousCount), tone: 'red' },
        { label: t('dashboard.kpi.detection'), value: detectionPct == null ? '—' : fmtPct(detectionPct), tone: 'teal' },
        { label: t('dashboard.kpi.alerts'), value: fmtInt(k.activeAlerts), tone: 'red' },
        ...(fcNext ? [{ label: t('dashboard.poster.nextMonth'), value: fmtInt(fcNext.predicted), tone: 'amber' }] : []),
      ],
      trendImg: trendRef.current?.toDataURL() || null,
      donutImg: donutRef.current?.toDataURL() || null,
      movers,
      alertLine,
    });
    if (url) {
      downloadDataUrl(url, `dashboard-poster-${stamp()}.png`);
      toast.success(t('dashboard.toast.posterDownloaded'));
    } else {
      toast.error(t('dashboard.toast.posterFailed'));
    }
  };

  const lastUpdated = Math.max(
    kpis.dataUpdatedAt || 0, geo.dataUpdatedAt || 0, trends.dataUpdatedAt || 0,
    share.dataUpdatedAt || 0, alerts.dataUpdatedAt || 0, hotspots.dataUpdatedAt || 0,
    riskQ.dataUpdatedAt || 0, forecastQ.dataUpdatedAt || 0,
    emergingQ.dataUpdatedAt || 0, alertSummaryQ.dataUpdatedAt || 0,
    calendarQ.dataUpdatedAt || 0, seasonRawQ.dataUpdatedAt || 0,
  );

  const filterSummary = useMemo(() => {
    const bits = [];
    if (districtId) bits.push(districtName || t('dashboard.filters.district', { id: districtId }));
    if (crimeHeadId) bits.push(headName || t('dashboard.filters.head', { id: crimeHeadId }));
    if (from || to) bits.push(`${from ? dateLabel(from) : '…'} → ${to ? dateLabel(to) : '…'}`);
    return bits.length ? bits.join(' · ') : t('dashboard.filters.none');
  }, [districtId, districtName, crimeHeadId, headName, from, to, t]);

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
          title={t('dashboard.panel.choropleth.title')}
          subtitle={districtId
            ? t('dashboard.panel.choropleth.subFiltered')
            : t(`dashboard.choro.sub.${choroMode}`)}
          headerExtra={(
            <Link to={`/map${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.geointel')}
            </Link>
          )}
          onExportCsv={geo.data?.length ? exportGeoCsv : undefined}
        >
          {geo.error ? (
            <QueryFallback query={geo} title={t('dashboard.fallback.choropleth')} />
          ) : choroLoading ? (
            <LoadingSkeleton height={300} />
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                <SegmentedControl
                  ariaLabel={t('dashboard.choro.modeAria')}
                  value={choroMode}
                  onChange={setChoroMode}
                  options={choroModes}
                  className="shrink-0"
                />
                <button
                  type="button"
                  aria-pressed={cityMarkersOn}
                  title={t('dashboard.choro.cityUnitsTitle')}
                  onClick={() => setCityMarkersOn(!cityMarkersOn)}
                  className={`chip min-h-[36px] px-2.5 shrink-0 transition-colors ${
                    cityMarkersOn ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
                  }`}
                >
                  {t('dashboard.choro.cityUnits')}
                </button>
                <span className="h-4 w-px shrink-0 bg-grid" aria-hidden="true" />
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {t('dashboard.choro.zLabel')}
                </span>
                {Z_THRESHOLDS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={minZ === z}
                    title={t('dashboard.choro.zTitle', { z })}
                    onClick={() => setZThreshold(z)}
                    className={`chip num min-h-[36px] shrink-0 px-2 transition-colors ${
                      minZ === z ? '!border-signal/60 !text-signal bg-signal/5' : 'hover:border-signal/40'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
              <MiniChoropleth
                values={choroValues}
                alerts={alertPolygons}
                markers={cityMarkers}
                height={272}
                valueLabel={t(`dashboard.choro.label.${choroMode}`)}
                onPolygonClick={onPolygonClick}
                onMarkerClick={onMarkerClick}
              />
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
                <span>{t('dashboard.choro.legendLow')}</span>
                <span
                  className="h-1.5 w-24 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${ramp.low}, ${ramp.high})` }}
                />
                <span>{t('dashboard.choro.legendHigh')}</span>
                {alertPolygons.length > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <PulseDot />
                    {redZones.length
                      ? [
                        t('dashboard.choro.anomalyCount', { n: alertPolygons.length }),
                        `${t(redZones.length > 1 ? 'dashboard.choro.redZones' : 'dashboard.choro.redZone', { n: redZones.length })} ${t('dashboard.choro.redZoneSuffix', { z: minZ })}`,
                      ].join(' · ')
                      : t('dashboard.choro.anomalyDistrict')}
                  </span>
                )}
              </div>
              {correlation && (
                <p className="mt-1.5 text-[10px] text-muted">
                  {t('dashboard.choro.corr', {
                    r: fmtNum(correlation.r, 2),
                    n: correlation.n,
                    verdict: t(Math.abs(correlation.r) >= 0.6
                      ? 'dashboard.choro.corrStrong'
                      : 'dashboard.choro.corrWeak', { mode: t('dashboard.choro.mode.rate') }),
                  })}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted">{t('dashboard.choro.drillHint')}</p>
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
          title={t('dashboard.panel.trend.title')}
          subtitle={trendMode === 'total'
            ? t('dashboard.panel.trend.subTotal')
            : crimeHeadId
              ? t('dashboard.panel.trend.subFocused', { head: headName || t('dashboard.panel.trend.oneHead') })
              : t('dashboard.panel.trend.subDefault')}
          onExportPng={trendOption ? exportTrendPng : undefined}
        >
          <div className="mb-2 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            <SegmentedControl
              ariaLabel={t('dashboard.trend.modeAria')}
              value={trendMode}
              onChange={setTrendMode}
              options={[
                { value: 'stacked', label: t('dashboard.trend.mode.stacked') },
                { value: 'share', label: t('dashboard.trend.mode.share') },
                { value: 'line', label: t('dashboard.trend.mode.line') },
                { value: 'total', label: t('dashboard.trend.mode.total') },
              ]}
              className="shrink-0"
            />
            <button
              type="button"
              aria-pressed={brushOn}
              title={t('dashboard.trend.brushTitle')}
              onClick={() => setBrushOn(!brushOn)}
              className={`chip min-h-[36px] px-2.5 shrink-0 transition-colors ${
                brushOn ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
              }`}
            >
              {t('dashboard.trend.brush')}
            </button>
            {pendingRange && (
              <>
                <button
                  type="button"
                  onClick={applyBrushRange}
                  className="chip min-h-[36px] px-2.5 shrink-0 !border-teal/60 !text-teal bg-teal/5 transition-colors"
                  title={t('dashboard.trend.applyTitle')}
                >
                  {t('dashboard.trend.applyRange', {
                    from: monthLabel(pendingRange.fromYm), to: monthLabel(pendingRange.toYm),
                  })}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRange(null)}
                  aria-label={t('dashboard.trend.discardAria')}
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
              title={t('common.state.empty')}
              message={trends.error?.message || t('dashboard.trend.emptyHint')}
            />
          ) : (
            <DashChart ref={trendRef} option={trendOption} height={isNarrow ? 250 : 300} onEvents={trendEvents} />
          )}
          {trendMode === 'total' && forecastQ.data?.model && (
            <p className="mt-1 text-[10px] text-muted">
              {t('dashboard.trend.forecastNote', {
                model: forecastQ.data.model,
                mape: forecastQ.data.mape != null
                  ? t('dashboard.trend.mape', { v: fmtNum(forecastQ.data.mape, 1) })
                  : '',
              })}
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
          title={t('dashboard.panel.compare.title')}
          subtitle={compareView
            ? t('dashboard.panel.compare.sub', {
              cur: monthLabel(compareView.curYm), prev: monthLabel(compareView.prevYm),
            })
            : t('dashboard.panel.compare.subDefault')}
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
          title={t('dashboard.panel.rising.title')}
          subtitle={t('dashboard.panel.rising.sub')}
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
          title={t('dashboard.panel.alerts.title')}
          subtitle={t('dashboard.panel.alerts.sub', {
            scope: districtId
              ? (districtName || t('dashboard.panel.alerts.filteredDistrict'))
              : t('dashboard.panel.alerts.statewide'),
            n: fmtInt(openFeed.length),
          })}
          headerExtra={(
            <Link to={`/alerts${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.all')}
            </Link>
          )}
          onExportCsv={feedQuery.data?.length ? exportAlertsCsv : undefined}
        >
          <AlertSummaryChips
            query={alertSummaryQ}
            linkSearch={search}
            onPickDistrict={(id) => {
              setFilter('districtId', String(districtId) === String(id) ? '' : id);
              toast.info(t(String(districtId) === String(id)
                ? 'dashboard.toast.districtCleared'
                : 'dashboard.toast.districtFiltered'));
            }}
          />
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
          title={t('dashboard.panel.share.title')}
          subtitle={t('dashboard.panel.share.sub')}
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
          title={t('dashboard.panel.seasonality.title')}
          subtitle={t('dashboard.panel.seasonality.sub')}
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
          title={t('dashboard.panel.leaderboard.title')}
          subtitle={t('dashboard.panel.leaderboard.sub')}
          onExportCsv={geoAll.data?.length ? exportLeaderboardCsv : undefined}
        >
          {geoAll.error ? (
            <QueryFallback query={geoAll} title={t('dashboard.fallback.districtMovers')} />
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
          title={t('dashboard.panel.districts.title')}
          subtitle={t('dashboard.panel.districts.sub')}
        >
          {geoAll.error ? (
            <QueryFallback query={geoAll} title={t('dashboard.fallback.districtComparison')} />
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
          title={t('dashboard.panel.hotspots.title')}
          subtitle={t('dashboard.panel.hotspots.sub')}
          headerExtra={(
            <Link to={`/map${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.map')}
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
          title={t('dashboard.panel.risk.title')}
          subtitle={t('dashboard.panel.risk.sub')}
          headerExtra={(
            <Link to={`/predict${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.predict')}
            </Link>
          )}
          onExportCsv={riskQ.data?.length ? exportRiskCsv : undefined}
        >
          <RiskWatchlist query={riskQ} linkSearch={search} />
        </DashPanel>
      ),
    },
    {
      id: 'socio',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('socio')}
          title={t('dashboard.panel.socio.title')}
          subtitle={t('dashboard.panel.socio.sub')}
          onExportCsv={socioReady ? exportSocioCsv : undefined}
        >
          <SocioBoard
            rows={socioRows}
            loading={geoAll.isLoading || socioQ.isLoading}
            error={socioQ.error || geoAll.error}
            onRetry={() => { socioQ.refetch(); geoAll.refetch(); }}
            activeDistrictId={districtId}
            chartRef={socioRef}
            onPickDistrict={(id) => {
              setFilter('districtId', String(districtId) === String(id) ? '' : id);
              toast.info(t(String(districtId) === String(id)
                ? 'dashboard.toast.districtCleared'
                : 'dashboard.toast.districtFiltered'));
            }}
          />
        </DashPanel>
      ),
    },
    {
      id: 'emerging',
      span: '',
      node: (
        <DashPanel
          {...panelProps('emerging')}
          title={t('dashboard.panel.emerging.title')}
          subtitle={t('dashboard.panel.emerging.sub')}
          headerExtra={(
            <Link to={`/trends${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.trends')}
            </Link>
          )}
          onExportCsv={emergingQ.data?.rising?.length ? exportEmergingCsv : undefined}
        >
          <EmergingBoard
            query={emergingQ}
            linkSearch={search}
            activeHeadId={crimeHeadId}
            onPickHead={(id) => {
              if (id === null || id === undefined) return;
              const same = String(crimeHeadId) === String(id);
              setFilter('crimeHeadId', same ? '' : id);
              toast.info(same
                ? t('dashboard.toast.headCleared')
                : t('dashboard.toast.headFiltered', {
                  name: tName('crimeHeads', id, String(id)) || String(id),
                }));
            }}
          />
        </DashPanel>
      ),
    },
    {
      id: 'cmpboard',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('cmpboard')}
          title={t('dashboard.panel.cmpboard.title')}
          subtitle={t('dashboard.panel.cmpboard.sub')}
        >
          <CompareBoard
            districts={lookups.data?.districts || []}
            defaultIds={topDistricts.map((d) => d.districtId)}
            baseParams={apiParams}
            loading={lookups.isLoading}
            activeDistrictId={districtId}
            onPickDistrict={(id) => {
              setFilter('districtId', String(districtId) === String(id) ? '' : id);
              toast.info(t(String(districtId) === String(id)
                ? 'dashboard.toast.districtCleared'
                : 'dashboard.toast.districtFiltered'));
            }}
          />
        </DashPanel>
      ),
    },
    {
      id: 'stations',
      span: '',
      node: (
        <DashPanel
          {...panelProps('stations')}
          title={t('dashboard.panel.stations.title')}
          subtitle={t('dashboard.panel.stations.sub')}
        >
          <StationExplorer
            districts={geoAll.data || []}
            lookupDistricts={lookups.data?.districts || []}
            riskRows={riskQ.data || []}
            linkSearch={search}
            activeDistrictId={districtId}
            onPickDistrict={(id) => {
              setFilter('districtId', id);
              toast.info(t('dashboard.toast.districtFiltered'));
            }}
          />
        </DashPanel>
      ),
    },
    {
      id: 'shift',
      span: '',
      node: (
        <DashPanel
          {...panelProps('shift')}
          title={t('dashboard.panel.shift.title')}
          subtitle={t('dashboard.panel.shift.sub')}
          onExportCsv={seasonRawQ.data?.matrix?.length ? exportShiftCsv : undefined}
        >
          <ShiftSplit query={seasonRawQ} />
        </DashPanel>
      ),
    },
    {
      id: 'calendar',
      span: 'xl:col-span-2',
      node: (
        <DashPanel
          {...panelProps('calendar')}
          title={t('dashboard.panel.calendar.title')}
          subtitle={t('dashboard.panel.calendar.sub')}
          onExportCsv={calendarQ.data?.length ? exportCalendarCsv : undefined}
        >
          <HeatCalendar
            query={calendarQ}
            onPickMonth={pickCalendarMonth}
            activeFrom={from}
            activeTo={to}
          />
        </DashPanel>
      ),
    },
    {
      id: 'deploy',
      span: '',
      node: (
        <DashPanel
          {...panelProps('deploy')}
          title={t('dashboard.panel.deploy.title')}
          subtitle={t('dashboard.panel.deploy.sub')}
          headerExtra={(
            <Link to={`/map${search}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-amber hover:underline">
              {t('dashboard.link.map')}
            </Link>
          )}
        >
          <DeploymentPanel hotspots={hotspots} riskRows={riskQ.data || []} linkSearch={search} />
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
        <h1 className="text-lg font-bold text-ink">{t('dashboard.print.title')}</h1>
        <p className="text-xs text-muted">
          {t('dashboard.print.meta', {
            date: dateLabel(new Date().toISOString().slice(0, 10)),
            filters: filterSummary,
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <FilterBar className="!bg-transparent !border-0 !px-0 !py-0 print:hidden" />
      </div>

      {/* toolbar — refresh / auto / views / share / print / poster / layout / help */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 print:hidden" role="toolbar" aria-label={t('dashboard.toolbar.label')}>
        <ToolBtn label={t('dashboard.toolbar.refreshAria')} title={t('dashboard.toolbar.refreshTitle')} onClick={manualRefresh}>
          {ICON.refresh}<span className="hidden sm:inline">{t('dashboard.toolbar.refresh')}</span>
        </ToolBtn>
        <ToolBtn
          label={auto.enabled
            ? t('dashboard.toolbar.autoDisable')
            : t('dashboard.toolbar.autoEnable', { interval: intervalLabel(Number(autoInt) || 60, t) })}
          title={t('dashboard.toolbar.autoTitle')}
          onClick={auto.toggle}
          active={auto.enabled}
        >
          <PulseDot color={auto.enabled ? 'teal' : 'amber'} />
          <span className="num">
            {auto.enabled ? t('dashboard.toolbar.autoOn', { s: auto.remaining }) : t('dashboard.toolbar.autoOff')}
          </span>
        </ToolBtn>
        <ToolBtn
          label={t('dashboard.toolbar.cycleAria')}
          title={t('dashboard.toolbar.cycleTitle', { interval: intervalLabel(Number(autoInt) || 60, t) })}
          onClick={cycleInterval}
        >
          <span className="num">{t('dashboard.toolbar.every', { interval: intervalLabel(Number(autoInt) || 60, t) })}</span>
        </ToolBtn>
        {lastUpdated > 0 && (
          <span className="num shrink-0 px-1 text-[11px] text-muted">
            {t('dashboard.toolbar.updatedAt', { time: format(new Date(lastUpdated), 'HH:mm:ss') })}
          </span>
        )}
        <span className="h-4 w-px shrink-0 bg-grid mx-0.5" aria-hidden="true" />
        <ToolBtn label={t('dashboard.toolbar.viewsAria')} title={t('dashboard.toolbar.viewsTitle')} onClick={() => setViewsOpen(true)}>
          {ICON.views}<span>{t('dashboard.toolbar.views')}</span>
        </ToolBtn>
        <ToolBtn label={t('dashboard.toolbar.copyLinkAria')} onClick={copyLink}>
          {ICON.link}<span className="hidden sm:inline">{t('dashboard.toolbar.copyLink')}</span>
        </ToolBtn>
        <ToolBtn label={t('dashboard.toolbar.printBriefAria')} title={t('dashboard.toolbar.printBriefTitle')} onClick={() => window.print()}>
          {ICON.print}<span className="hidden sm:inline">{t('dashboard.toolbar.printBrief')}</span>
        </ToolBtn>
        <ToolBtn label={t('dashboard.toolbar.posterAria')} onClick={exportPoster}>
          {ICON.poster}<span className="hidden sm:inline">{t('dashboard.toolbar.poster')}</span>
        </ToolBtn>
        <span className="h-4 w-px shrink-0 bg-grid mx-0.5" aria-hidden="true" />
        <ToolBtn
          label={t(allCollapsed ? 'dashboard.toolbar.expandAllAria' : 'dashboard.toolbar.collapseAllAria')}
          onClick={() => (allCollapsed ? expandAll() : collapseAll(PANEL_IDS))}
        >
          {allCollapsed ? ICON.expand : ICON.collapse}
          <span className="hidden sm:inline">
            {t(allCollapsed ? 'dashboard.toolbar.expandAll' : 'dashboard.toolbar.collapseAll')}
          </span>
        </ToolBtn>
        <ToolBtn
          label={t('dashboard.toolbar.resetAria')}
          onClick={() => { resetLayout(); setMaxPanelId(null); toast.info(t('dashboard.toast.layoutReset')); }}
        >
          {ICON.reset}<span className="hidden sm:inline">{t('dashboard.toolbar.reset')}</span>
        </ToolBtn>
        <ToolBtn label={t('dashboard.toolbar.shortcutsAria')} title={t('dashboard.toolbar.shortcutsTitle')} onClick={() => setShortcutsOpen(true)}>
          {ICON.help}
        </ToolBtn>
      </div>

      <IntelTicker items={insights} className="print:hidden" />

      <OmniBox inputRef={omniRef} linkSearch={search} className="print:hidden" />

      <div className="print:hidden">
        <QuickFilters districts={topDistricts} loading={geoAll.isLoading} />
      </div>

      {/* KPI link tiles */}
      <div className={`grid grid-cols-2 gap-3 ${showForecastTile ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-3 xl:grid-cols-5'}`}>
        <KpiLinkTile
          to={`/cases${search}`}
          label={t('dashboard.kpi.firs')}
          value={k.totalFirs}
          mom={momPct}
          yoy={yoyPct}
          positiveIsGood={false}
          loading={kpis.isLoading}
          hint={firAvg12
            ? t('dashboard.kpi.firsHint', { avg: fmtInt(firAvg12) })
            : t('dashboard.kpi.firsHintPlain')}
          spark={firSpark}
          sparkBaseline
        />
        <KpiLinkTile
          to={`/cases${search}`}
          label={t('dashboard.kpi.heinous')}
          value={k.heinousCount}
          accent="red"
          loading={kpis.isLoading}
          hint={t('dashboard.kpi.heinousHint')}
        />
        <KpiLinkTile
          to={`/cases${search}`}
          label={t('dashboard.kpi.heinousShare')}
          value={heinousPct == null ? '—' : fmtPct(heinousPct)}
          accent="red"
          loading={kpis.isLoading}
          hint={heinousAvgPct == null
            ? t('dashboard.kpi.heinousShareHintPlain')
            : t('dashboard.kpi.heinousShareHint', { avg: fmtNum(heinousAvgPct, 1) })}
          spark={heinousSpark}
          sparkBaseline
        />
        <KpiLinkTile
          to={`/predict${search}`}
          label={t('dashboard.kpi.detection')}
          value={detectionPct == null ? '—' : fmtPct(detectionPct)}
          accent="teal"
          loading={kpis.isLoading}
          hint={t('dashboard.kpi.detectionHint', { target: DETECTION_TARGET })}
          progress={detectionPct == null ? undefined : { pct: detectionPct, target: DETECTION_TARGET }}
        />
        <KpiLinkTile
          to={`/alerts${search}`}
          label={t('dashboard.kpi.alerts')}
          value={k.activeAlerts}
          accent="red"
          pulse={Number(k.activeAlerts) > 0}
          loading={kpis.isLoading}
          hint={t('dashboard.kpi.alertsHint')}
        />
        {showForecastTile && (
          <KpiLinkTile
            to={`/predict${search}`}
            label={t('dashboard.kpi.forecast')}
            value={fcNext ? Math.round(Number(fcNext.predicted) || 0) : '—'}
            mom={fcDeltaPct}
            positiveIsGood={false}
            loading={forecastQ.isLoading}
            hint={fcNext
              ? `${forecastQ.data?.model || t('dashboard.kpi.forecastModel')}${
                Number.isFinite(Number(fcNext.lo)) && Number.isFinite(Number(fcNext.hi))
                  ? t('dashboard.kpi.forecastCi', { lo: fmtInt(fcNext.lo), hi: fmtInt(fcNext.hi) }) : ''}${
                forecastQ.data?.mape != null
                  ? t('dashboard.kpi.forecastMape', { v: fmtNum(forecastQ.data.mape, 1) }) : ''}`
              : t('dashboard.kpi.forecastNone')}
          />
        )}
      </div>
      {kpis.error && (
        <Card><QueryFallback query={kpis} title={t('dashboard.fallback.kpis')} /></Card>
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
            toast.info(t(id ? 'dashboard.toast.districtFiltered' : 'dashboard.toast.districtCleared'));
          }}
        />
      )}
    </div>
  );
}
