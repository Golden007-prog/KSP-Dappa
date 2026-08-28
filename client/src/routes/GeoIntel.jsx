// Route 2 — /map GeoIntel. Full-bleed Leaflet command map for Karnataka.
// Second pass adds: an hour-of-day lens (?h= deep link, 24-hour sweep, night
// basemap dimming, hotspots filtered by HourBandStart/End), a hotspot detail
// drill (24h histogram, nearest station, incidents-in-radius, GeoJSON export),
// numbered rank badges, a nearest-neighbour patrol-route suggestion with copy-
// as-text, an A/B month compare with a draggable heat swipe divider, district
// multi-select with aggregate stats + CSV, pulsing high-risk station halos, a
// red-zone tour, a radius probe (incident density around a point), GeoJSON
// layer exports, a click-to-jump month histogram on the scrubber, and a
// copy-text situational brief. Original capabilities below:
// OSM tiles (dark-filtered in dark theme; OSM is an allowed client data source
// per docs/CONTRACTS.md, with a tile-error notice + blank-basemap fallback for
// offline demos) with layer toggles + one-click presets (zustand + localStorage
// persisted and mirrored to ?layers= so a pasted link reproduces the exact
// composition), a metric-switchable district choropleth (cases / per-lakh rate
// / diverging MoM change with a top-movers strip / mean station risk) that
// re-skins for light theme, district click → zoom + station drill (12-month
// sparkline + day×hour seasonality strip), station click → KPI side panel with
// recent cases, status quick-filters and pin-two-to-compare, a month
// time-scrubber (URL-synced ?m= deep link, play/pause + speed + loop control,
// big month overlay while animating), ranked hotspot chips with hour-band
// filters, a fuzzy locate search with recent picks, saved views + CSV export +
// copy-share-link, a two-click measure tool, keyboard shortcuts ('?' shows the
// map), fullscreen mode (F / layered Esc), print-briefing styles, and on
// phones a swipeable docked bottom info sheet instead of the desktop overlays.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useDistrictsGeo, useHotspots, useKarnatakaGeoJson, useLookups, useStations, useTrendsMonthly,
} from '../lib/api.js';
import { useUrlFilters, DATE_RANGES } from '../lib/filters.js';
import { useUiStore } from '../lib/store.js';
import {
  CITY_UNIT_IDS, aggregateCountsPerPolygon, groupRowsPerPolygon, normalizeUnitCode,
  polygonForUnit, unitInfo, unitsForPolygon,
} from '../lib/districtGeoMap.js';
import { fmtInt, fmtNum, monthLabel } from '../lib/format.js';
import { useTheme } from '../components/ThemeProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import FilterBar from '../components/FilterBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MapCanvas from './geointel/MapCanvas.jsx';
import LayerToggles from './geointel/LayerToggles.jsx';
import TimeScrubber, { SCRUB_SPEEDS } from './geointel/TimeScrubber.jsx';
import HotspotChips, { BandFilterChips, HOUR_BANDS } from './geointel/HotspotChips.jsx';
import SidePanel from './geointel/SidePanel.jsx';
import LocateSearch from './geointel/LocateSearch.jsx';
import MobileSheet from './geointel/MobileSheet.jsx';
import SavedViews from './geointel/SavedViews.jsx';
import ExportMenu from './geointel/ExportMenu.jsx';
import TopMovers from './geointel/TopMovers.jsx';
import ShortcutsOverlay from './geointel/ShortcutsOverlay.jsx';
import LegendBar, { LegendItems, MetricChips, OpacityControls } from './geointel/MapLegend.jsx';
import HourScrubber from './geointel/HourScrubber.jsx';
import CompareStrip from './geointel/CompareStrip.jsx';
import SelectionBar from './geointel/SelectionBar.jsx';
import PatrolRoutePill from './geointel/PatrolRoutePill.jsx';
import { useIncidentsLayer, useSeasonalityGrid, useSocioMeta } from './geointel/hooks.js';
import {
  bandBucket, copyText, haversineKm, hotspotName, hourBand, hourInBand, monthWindow, risk01,
} from './geointel/utils.js';
import { downloadGeoJson, nearestNeighborRoute, PATROL_STOP_COUNTS } from './geointel/geo.js';
import { loadPrefs, savePrefs } from './geointel/prefs.js';
import AnalysisDock from './geointel/AnalysisDock.jsx';
import ViewportChip from './geointel/ViewportChip.jsx';
import HotspotTable, { sortHotspotRows } from './geointel/HotspotTable.jsx';
import GridPanel from './geointel/GridPanel.jsx';
import CatchmentPanel from './geointel/CatchmentPanel.jsx';
import SpaceTimePanel, { dayShort } from './geointel/SpaceTimePanel.jsx';
import DepthDockTab from './depth/DepthDockTab.jsx';
import {
  GAP_KMS, GRID_SIZES, boundsOf, buildCatchment, buildGrid, bivariateColor, coLocatedClusters,
  gridFeatureCollection, inBounds, nearestStation, tercileClass, terciles, weekdayOf,
} from './geointel/stats.js';
import { downloadCsv, exportName } from './geointel/csv.js';
import { useI18n, useT } from '../lib/i18n.jsx';

const MAX_SCRUB_MONTHS = 24;
const LAYER_KEYS = ['choropleth', 'heat', 'incidents', 'hotspots', 'stations', 'alertPulse'];
// Short codes for the ?layers= URL param (shareable map composition).
const LAYER_CODES = {
  choropleth: 'choro', heat: 'heat', incidents: 'pts', hotspots: 'hot', stations: 'stn', alertPulse: 'alert',
};

// Choropleth metric definitions. The number formatting is locale-aware via
// format.js; the surrounding wording is a translation key, so the route builds
// `fmtValue` per language (memoized, because MapCanvas effects key on the
// choroMetric object's identity).
const METRIC_PROPS = {
  cases: { key: 'cases', diverging: false, valueKey: 'geointel.metric.valueCases', fmt: (v) => fmtInt(v) },
  rate: { key: 'rate', diverging: false, valueKey: 'geointel.metric.valueRate', fmt: (v) => fmtNum(v, 1) },
  mom: { key: 'mom', diverging: true, valueKey: 'geointel.metric.valueMom', fmt: (v) => `${v > 0 ? '+' : ''}${fmtNum(v, 1)}` },
  risk: { key: 'risk', diverging: false, valueKey: 'geointel.metric.valueRisk', fmt: (v) => fmtInt(v) },
  // Socio-economic context metrics (/meta/socio) — the "why" layer under the
  // "where": population pressure and urbanisation next to the crime surface.
  density: { key: 'density', diverging: false, valueKey: 'geointel.metric.valueDensity', fmt: (v) => fmtInt(v) },
  urban: { key: 'urban', diverging: false, valueKey: 'geointel.metric.valueUrban', fmt: (v) => fmtNum(v, 1) },
  // Bivariate: the numeric channel stays the crime rate (tooltip + legend),
  // while the fill comes from the 3x3 rate × urbanisation class.
  bivar: { key: 'bivar', diverging: false, valueKey: 'geointel.metric.valueRate', fmt: (v) => fmtNum(v, 1) },
};

const DOCK_TABS = ['hotspots', 'grid', 'catchment', 'spacetime', 'depth'];
const CATCHMENT_COLS = [
  { key: 'unitId', label: 'unitId' },
  { key: 'unitName', label: 'unitName' },
  { key: 'districtId', label: 'districtId' },
  { key: 'catchmentIncidents', label: 'catchmentIncidents' },
  { key: 'sharePct', label: 'sharePct' },
  { key: 'meanKm', label: 'meanDistanceKm' },
  { key: 'maxKm', label: 'maxDistanceKm' },
  { key: 'caseCount', label: 'stationCaseCount' },
  { key: 'riskScore', label: 'riskScore' },
  { key: 'lat', label: 'lat' },
  { key: 'lng', label: 'lng' },
];
// Grid cells drawn on the canvas layer. Above this the render cost stops being
// worth the marginal cell, so the tail (always the low-count cells — the array
// arrives count-sorted) is dropped from the map but still counted in the stats.
const GRID_RENDER_CAP = 900;

// Shared date-range presets carry English labels; map them onto the common
// namespace so the print/brief scope line follows the active language.
const RANGE_KEYS = {
  all: 'common.filter.allTime',
  '30d': 'common.filter.last30',
  '90d': 'common.filter.last90',
  '12m': 'common.filter.last12m',
  ytd: 'common.filter.yearToDate',
};

/** Mean of a per-row value across the police units of each census polygon. */
function meanPerPolygon(rows, getVal) {
  const groups = groupRowsPerPolygon(rows);
  const out = {};
  for (const [poly, rs] of Object.entries(groups)) {
    const vals = rs.map(getVal).map(Number).filter(Number.isFinite);
    if (vals.length) out[poly] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

// Route-scoped skins. Tiles are dark-filtered only under html.dark (the light
// theme keeps plain OSM); popups follow the theme via the --c-* CSS vars
// (index.css is off-limits, so these live here). gi-tap widens the primary
// overlay controls to comfortable 40px targets on touch devices, and the print
// rules reduce the route to a one-page situational snapshot (map + legend +
// print header) for briefings.
const GEOINTEL_CSS = `
html.dark .geointel-tiles { filter: invert(1) hue-rotate(200deg) brightness(0.6) contrast(1.05) saturate(0.35); }
.geointel-popup .leaflet-popup-content-wrapper { background:var(--c-panel); color:var(--c-ink); border:1px solid var(--c-grid); border-radius:10px; box-shadow:var(--shadow-lift); }
.geointel-popup .leaflet-popup-content { margin:10px 12px; }
.geointel-popup .leaflet-popup-content a { color:var(--c-amber); font-weight:600; }
.geointel-popup .leaflet-popup-tip { background:var(--c-panel); border:1px solid var(--c-grid); }
.geointel-range { accent-color:var(--c-amber); }
@media (pointer: coarse) {
  .gi-tap { min-height: 40px; }
  .gi-tap-w { min-width: 40px; }
}
.gi-print-only { display: none; }
@media print {
  .gi-noprint { display: none !important; }
  .gi-print-only { display: block; }
}
/* hour-lens night hours — dusk-filter the basemap (both themes) */
.gi-night .geointel-tiles { filter: grayscale(0.25) brightness(0.6) saturate(0.55); }
html.dark .gi-night .geointel-tiles { filter: invert(1) hue-rotate(200deg) brightness(0.38) contrast(1.1) saturate(0.3); }
/* pulsing high-risk station halo (SVG stroke animation) */
.gi-halo { animation: gi-halo-pulse 1.9s ease-out infinite; }
@keyframes gi-halo-pulse {
  0% { stroke-opacity: 0.8; stroke-width: 1.5; }
  70% { stroke-opacity: 0.06; stroke-width: 8; }
  100% { stroke-opacity: 0; stroke-width: 9; }
}
@media (prefers-reduced-motion: reduce) { .gi-halo { animation: none; stroke-opacity: 0.55; } }
html[data-motion='reduce'] .gi-halo { animation: none; stroke-opacity: 0.55; }
/* numbered hotspot rank badges + patrol stop markers (Leaflet divIcons) */
.gi-rank { width:18px; height:18px; border-radius:9999px; background:#F5A623; color:#0B1220;
  font:700 10px/14px ui-monospace,SFMono-Regular,monospace; text-align:center;
  border:2px solid rgba(11,18,32,.85); box-shadow:0 1px 4px rgba(0,0,0,.45); }
.gi-stop { width:20px; height:20px; border-radius:9999px; background:#0B1220; color:#F5A623;
  font:700 11px/16px ui-monospace,SFMono-Regular,monospace; text-align:center;
  border:2px solid #F5A623; box-shadow:0 1px 4px rgba(0,0,0,.45); }
`;

const NO_SELECTION = []; // stable identity — MapCanvas effects key on reference
const BAND_KEYS = HOUR_BANDS.map((b) => b.key);

const ExpandIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
  </svg>
);
const CompressIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
  </svg>
);
const LinkIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);
const RulerIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 15.5 15.5 2 22 8.5 8.5 22 2 15.5Z" />
    <path d="m6.5 11 2 2m1.5-5.5 2 2m1.5-5.5 2 2" />
  </svg>
);
const ProbeIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
  </svg>
);
const AnalysisIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3v18h18" />
    <rect x="7" y="12" width="3" height="6" rx="0.5" />
    <rect x="12" y="8" width="3" height="10" rx="0.5" />
    <rect x="17" y="5" width="3" height="13" rx="0.5" />
  </svg>
);
const FitIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
const BriefIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M9 12h6m-6 4h4" />
  </svg>
);

function ErrorChip({ label, onRetry }) {
  const t = useT();
  return (
    <div className="pointer-events-auto chip self-start !border-signal/50 bg-panel/95 text-signal shadow-lg">
      {label}
      <button type="button" className="underline ml-1 hover:text-ink transition-colors" onClick={onRetry}>
        {t('common.action.retry')}
      </button>
    </div>
  );
}

export default function GeoIntel() {
  const { apiParams, districtId, crimeHeadId, range, setFilters } = useUrlFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapLayers = useUiStore((s) => s.mapLayers);
  const setMapLayer = useUiStore((s) => s.setMapLayer);
  const { theme } = useTheme();
  const light = theme === 'light';
  const toast = useToast();
  const { t, tName } = useI18n();

  const geojson = useKarnatakaGeoJson();
  const districts = useDistrictsGeo(apiParams);
  const stations = useStations(apiParams);
  const hotspots = useHotspots(apiParams);
  const trends = useTrendsMonthly(apiParams); // months list for the scrubber
  const lookups = useLookups(); // crime-head names for incident popup cards
  const socio = useSocioMeta(); // population / urbanisation context metrics

  const [scrubIndex, setScrubIndex] = useState(0); // 0 = whole window
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2 (persisted)
  const [loop, setLoop] = useState(true); // wrap-around vs stop-at-last (persisted)
  const [fullscreen, setFullscreen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // mobile info sheet
  const [drill, setDrill] = useState(null); // {type:'district',polygon,unitIds,title} | {type:'station',station}
  const [fly, setFly] = useState(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [metric, setMetric] = useState('cases'); // choropleth metric (persisted)
  const [choroOpacity, setChoroOpacity] = useState(0.55); // persisted
  const [heatOpacity, setHeatOpacity] = useState(1); // persisted
  const [legendOpen, setLegendOpen] = useState(true); // persisted
  const [basemap, setBasemap] = useState('osm'); // 'osm' | 'none' (persisted)
  const [tileError, setTileError] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measureKm, setMeasureKm] = useState(null);
  const [hotspotBand, setHotspotBand] = useState('all'); // 'all'|'night'|'day'|'evening' (persisted)
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pins, setPins] = useState([]); // up to two stations pinned for compare
  const [halos, setHalos] = useState(false); // pulsing high-risk station rings (persisted)
  const [hourPlaying, setHourPlaying] = useState(false);
  const [hour, setHour] = useState(() => {
    // ?h= deep link — the hour lens is shareable spatiotemporal state
    const v = searchParams.get('h');
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) && n >= 0 && n <= 23 ? Math.round(n) : null;
  });
  const [compareOn, setCompareOn] = useState(false); // A/B month heat swipe
  const [compareMonth, setCompareMonth] = useState(null); // month A (left side)
  const [comparePct, setComparePct] = useState(50); // divider position %
  const [selectMode, setSelectMode] = useState(false); // district multi-select
  const [selectedPolygons, setSelectedPolygons] = useState([]);
  const [probing, setProbing] = useState(false); // radius probe placement mode
  const [probe, setProbe] = useState(null); // {lat,lng}
  const [probeKm, setProbeKm] = useState(2);
  const [patrolOn, setPatrolOn] = useState(false); // patrol-route suggestion
  const [tourIdx, setTourIdx] = useState(0); // red-zone tour position
  // ---- analysis workbench ---------------------------------------------------
  const [dockOpen, setDockOpen] = useState(false); // persisted
  const [dockTab, setDockTab] = useState('hotspots'); // persisted
  const [tableSort, setTableSort] = useState('cases'); // persisted
  const [hoverHotspotId, setHoverHotspotId] = useState(null); // table row → map ring
  const [coLocateOn, setCoLocateOn] = useState(true); // compound-zone chords
  const [gridOn, setGridOn] = useState(false); // statistical density grid (persisted)
  const [gridKm, setGridKm] = useState(5); // grid cell edge (persisted)
  const [giMode, setGiMode] = useState(false); // paint Gi* significance (persisted)
  const [spiderOn, setSpiderOn] = useState(false); // catchment allocation lines
  const [gapsOn, setGapsOn] = useState(false); // coverage-gap markers
  const [gapKm, setGapKm] = useState(5); // coverage threshold (persisted)
  const [weekday, setWeekday] = useState(null); // 0=Sun..6=Sat lens, null = all days
  const [patrolStopCount, setPatrolStopCount] = useState(3); // persisted
  const [patrolOptimize, setPatrolOptimize] = useState(true); // 2-opt (persisted)
  const [patrolRoundTrip, setPatrolRoundTrip] = useState(false); // persisted
  const [viewport, setViewport] = useState(null); // {north,south,east,west,zoom}
  const flySeq = useRef(0);
  const mapApiRef = useRef(null);
  const shellRef = useRef(null); // compare divider drag needs the shell box
  const issueFly = (cmd) => {
    flySeq.current += 1;
    setFly({ seq: flySeq.current, ...cmd });
  };

  // ---- persisted prefs + ?layers= deep link ---------------------------------
  const layersReady = useRef(false);
  useEffect(() => {
    const p = loadPrefs();
    if (p.mapLayers && typeof p.mapLayers === 'object') {
      for (const k of LAYER_KEYS) {
        if (typeof p.mapLayers[k] === 'boolean') setMapLayer(k, p.mapLayers[k]);
      }
    }
    // Per-key migration: prefs saved before a layer existed leave that key
    // undefined in the store — default the incidents layer on so returning
    // users still discover it.
    if (useUiStore.getState().mapLayers.incidents === undefined) setMapLayer('incidents', true);
    if (SCRUB_SPEEDS.includes(p.scrubSpeed)) setSpeed(p.scrubSpeed);
    if (typeof p.loop === 'boolean') setLoop(p.loop);
    if (p.basemap === 'none' || p.basemap === 'osm') setBasemap(p.basemap);
    if (typeof p.choroOpacity === 'number') setChoroOpacity(Math.max(0.1, Math.min(0.9, p.choroOpacity)));
    if (typeof p.heatOpacity === 'number') setHeatOpacity(Math.max(0.2, Math.min(1, p.heatOpacity)));
    if (typeof p.legendOpen === 'boolean') setLegendOpen(p.legendOpen);
    if (METRIC_PROPS[p.choroMetric]) setMetric(p.choroMetric);
    if (typeof p.halos === 'boolean') setHalos(p.halos);
    if (BAND_KEYS.includes(p.hotspotBand)) setHotspotBand(p.hotspotBand);
    if (typeof p.dockOpen === 'boolean') setDockOpen(p.dockOpen);
    if (DOCK_TABS.includes(p.dockTab)) setDockTab(p.dockTab);
    if (typeof p.tableSort === 'string' && p.tableSort) setTableSort(p.tableSort);
    if (typeof p.gridOn === 'boolean') setGridOn(p.gridOn);
    if (GRID_SIZES.includes(p.gridKm)) setGridKm(p.gridKm);
    if (typeof p.giMode === 'boolean') setGiMode(p.giMode);
    if (GAP_KMS.includes(p.gapKm)) setGapKm(p.gapKm);
    if (PATROL_STOP_COUNTS.includes(p.patrolStopCount)) setPatrolStopCount(p.patrolStopCount);
    if (typeof p.patrolOptimize === 'boolean') setPatrolOptimize(p.patrolOptimize);
    if (typeof p.patrolRoundTrip === 'boolean') setPatrolRoundTrip(p.patrolRoundTrip);
    if (typeof p.coLocateOn === 'boolean') setCoLocateOn(p.coLocateOn);
    // URL beats prefs: a pasted ?layers= link reproduces the exact composition.
    const lp = searchParams.get('layers');
    if (lp !== null) {
      const on = new Set(lp.split('-'));
      for (const k of LAYER_KEYS) setMapLayer(k, on.has(LAYER_CODES[k]));
    }
    layersReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) { firstPersist.current = false; return; }
    savePrefs({
      mapLayers, scrubSpeed: speed, loop, basemap, choroOpacity, heatOpacity, legendOpen, choroMetric: metric,
      halos, hotspotBand, dockOpen, dockTab, tableSort, gridOn, gridKm, giMode, gapKm,
      patrolStopCount, patrolOptimize, patrolRoundTrip, coLocateOn,
    });
  }, [mapLayers, speed, loop, basemap, choroOpacity, heatOpacity, legendOpen, metric, halos, hotspotBand,
    dockOpen, dockTab, tableSort, gridOn, gridKm, giMode, gapKm,
    patrolStopCount, patrolOptimize, patrolRoundTrip, coLocateOn]);
  // Hour lens mirrored to ?h= — a pasted link reproduces the exact hour view.
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (hour === null) next.delete('h'); else next.set('h', String(hour));
      return String(next) === String(prev) ? prev : next;
    }, { replace: true });
  }, [hour, setSearchParams]);
  // Hour sweep — one hour per tick, wraps at midnight.
  useEffect(() => {
    if (!hourPlaying || hour === null) return undefined;
    const t = setInterval(() => setHour((h) => (h === null ? 0 : (h + 1) % 24)), 900);
    return () => clearInterval(t);
  }, [hourPlaying, hour === null]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and the active layer set mirrored into the URL (share = same composition).
  useEffect(() => {
    if (!layersReady.current) return;
    const code = LAYER_KEYS.filter((k) => mapLayers[k]).map((k) => LAYER_CODES[k]).join('-') || 'none';
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('layers', code);
      return String(next) === String(prev) ? prev : next;
    }, { replace: true });
  }, [mapLayers, setSearchParams]);

  const months = useMemo(() => (trends.data?.months || []).slice(-MAX_SCRUB_MONTHS), [trends.data]);
  const scrubMonth = scrubIndex > 0 && scrubIndex <= months.length ? months[scrubIndex - 1] : null;
  const incidentParams = useMemo(
    () => (scrubMonth ? { ...apiParams, ...monthWindow(scrubMonth) } : apiParams),
    [apiParams, scrubMonth],
  );
  // The radius probe also needs incident rows, even with both layers off.
  const incidents = useIncidentsLayer(
    incidentParams,
    mapLayers.heat || mapLayers.incidents || probing || !!probe,
  );
  // Month-A incidents for the compare swipe (only fetched while comparing).
  const compareParams = useMemo(
    () => (compareOn && compareMonth ? { ...apiParams, ...monthWindow(compareMonth) } : apiParams),
    [apiParams, compareOn, compareMonth],
  );
  const compareIncidents = useIncidentsLayer(compareParams, compareOn && !!compareMonth);

  // Filter change can shrink the month list — clamp the scrub position.
  useEffect(() => {
    setScrubIndex((i) => (i > months.length ? 0 : i));
  }, [months.length]);

  // Deep-linked scrub month (?m=YYYY-MM). The value is captured at first
  // render — before the mirror effect below could delete it — and applied once
  // the month list arrives. Saved views reuse the same pending slot.
  const pendingMonth = useRef(searchParams.get('m'));
  const monthApplied = useRef(false);
  useEffect(() => {
    if (monthApplied.current || !months.length) return;
    monthApplied.current = true;
    const m = pendingMonth.current;
    pendingMonth.current = null;
    if (!m) return;
    const idx = months.indexOf(m);
    if (idx >= 0) {
      setScrubIndex(idx + 1);
      if (!useUiStore.getState().mapLayers.heat) setMapLayer('heat', true);
    }
  }, [months, setMapLayer]);
  // …and mirrored back so the current animation frame is shareable. Gated
  // until the deep link has applied, so a cold load never wipes ?m= first.
  useEffect(() => {
    if (!monthApplied.current) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (scrubMonth) next.set('m', scrubMonth); else next.delete('m');
      return String(next) === String(prev) ? prev : next;
    }, { replace: true });
  }, [scrubMonth, setSearchParams]);

  // Play loop: advance a month per tick (speed-scaled); wrap to the first when
  // looping, otherwise hold the last frame (the effect below pauses playback).
  useEffect(() => {
    if (!playing || !months.length) return undefined;
    const t = setInterval(() => {
      setScrubIndex((i) => (i >= months.length ? (loop ? 1 : i) : i + 1));
    }, Math.round(1400 / speed));
    return () => clearInterval(t);
  }, [playing, months.length, speed, loop]);
  useEffect(() => {
    if (playing && !loop && months.length && scrubIndex >= months.length) setPlaying(false);
  }, [playing, loop, scrubIndex, months.length]);

  const togglePlay = () => {
    if (!playing) {
      if (!useUiStore.getState().mapLayers.heat) setMapLayer('heat', true);
      setScrubIndex((i) => (i === 0 || i >= months.length ? 1 : i));
    }
    setPlaying((p) => !p);
  };
  const onScrub = (i) => {
    setPlaying(false);
    setScrubIndex(i);
    if (i > 0 && !useUiStore.getState().mapLayers.heat) setMapLayer('heat', true);
  };

  // ---- keyboard: F fullscreen, layered Esc, space/arrows, '/', '?' ----------
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape') {
        // Inner-most first: inputs (locate search) own their Esc; then the
        // help overlay, the measure/probe tools, any open Leaflet popup, the
        // drill panel, selection mode, compare — and only then fullscreen.
        if (typing) return;
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (measuring) { setMeasuring(false); return; }
        if (probing || probe) { setProbing(false); setProbe(null); return; }
        if (mapApiRef.current?.closePopup?.()) return;
        if (drill) { setDrill(null); return; }
        if (dockOpen) { setDockOpen(false); return; }
        if (selectMode) { setSelectMode(false); setSelectedPolygons([]); return; }
        if (compareOn) { setCompareOn(false); return; }
        setFullscreen(false);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') { setFullscreen((v) => !v); return; }
      if (e.key === '?') { setShortcutsOpen((v) => !v); return; }
      if (e.key === 'm' || e.key === 'M') { toggleMeasure(); return; }
      if (e.key === 'h' || e.key === 'H') { toggleHourLens(); return; }
      if (e.key === 'c' || e.key === 'C') { toggleCompare(); return; }
      if (e.key === 'p' || e.key === 'P') { setPatrolOn((v) => !v); return; }
      if (e.key === 'a' || e.key === 'A') { setDockOpen((v) => !v); return; }
      if (e.key === 'g' || e.key === 'G') { setGridOn((v) => !v); return; }
      if (e.key === 'w' || e.key === 'W') { cycleWeekday(); return; }
      if (e.key === 'z' || e.key === 'Z') { fitToData(); return; }
      if (e.key === '/') {
        e.preventDefault();
        const el = document.getElementById('gi-locate');
        if (el && el.offsetParent !== null) { el.focus(); return; }
        // <md: the locate box lives in the bottom sheet
        setDrill(null);
        setSheetOpen(true);
        setTimeout(() => document.getElementById('gi-locate-m')?.focus(), 80);
        return;
      }
      if (e.key === ' ') {
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return; // native activation
        e.preventDefault();
        togglePlay();
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && months.length) {
        e.preventDefault();
        const next = e.key === 'ArrowRight'
          ? Math.min(scrubIndex + 1, months.length)
          : Math.max(scrubIndex - 1, 0);
        onScrub(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- derived layer data (memoized: MapCanvas keys effects on identity) ----
  const choroMetric = useMemo(() => {
    const m = METRIC_PROPS[metric] || METRIC_PROPS.cases;
    return { key: m.key, diverging: m.diverging, fmtValue: (v) => t(m.valueKey, { v: m.fmt(v) }) };
  }, [metric, t]);
  // Population per census polygon (socio rows carry 3-digit unit codes; the
  // polygon mapper normalises them). Powers the locally derived per-lakh rate
  // and the bivariate classing.
  const polygonPopulation = useMemo(() => {
    const acc = {};
    for (const r of socio.data || []) {
      const poly = polygonForUnit(r.districtId);
      const pop = Number(r.population);
      if (!poly || !Number.isFinite(pop)) continue;
      acc[poly] = (acc[poly] || 0) + pop;
    }
    return acc;
  }, [socio.data]);
  const polygonCasesRaw = useMemo(
    () => aggregateCountsPerPolygon(districts.data || []),
    [districts.data],
  );
  const polygonUrban = useMemo(
    () => meanPerPolygon(socio.data || [], (r) => r.urbanPct),
    [socio.data],
  );
  // Cases per lakh. The server computes this when it can resolve a population
  // for the unit and sends null when it cannot, so the socio table fills the
  // holes with the same formula rather than leaving the polygon unpainted.
  const polygonRate = useMemo(() => {
    const fromServer = meanPerPolygon(districts.data || [], (r) => r.ratePerLakh);
    const out = { ...fromServer };
    for (const [poly, cases] of Object.entries(polygonCasesRaw)) {
      if (Number.isFinite(out[poly])) continue;
      const pop = polygonPopulation[poly];
      if (pop > 0) out[poly] = (cases / pop) * 100000;
    }
    return out;
  }, [districts.data, polygonCasesRaw, polygonPopulation]);
  const choroValues = useMemo(() => {
    const rows = districts.data || [];
    if (metric === 'rate' || metric === 'bivar') return polygonRate;
    if (metric === 'mom') return meanPerPolygon(rows, (r) => r.momDeltaPct);
    if (metric === 'density') return meanPerPolygon(socio.data || [], (r) => r.densityPerKm2);
    if (metric === 'urban') return polygonUrban;
    if (metric === 'risk') {
      return meanPerPolygon(stations.data || [], (s) => {
        const r = risk01(s.riskScore);
        return r === null ? NaN : r * 100;
      });
    }
    return aggregateCountsPerPolygon(rows);
  }, [districts.data, stations.data, socio.data, metric, polygonRate, polygonUrban]);
  // Bivariate fill: crime rate on the X axis, urbanisation on the Y, both cut
  // at their terciles across the polygons that have both values.
  const bivariate = useMemo(() => {
    if (metric !== 'bivar') return { colors: null, labels: null };
    const polys = Object.keys(polygonRate).filter((p) => Number.isFinite(polygonUrban[p]));
    const rateCuts = terciles(polys.map((p) => polygonRate[p]));
    const urbanCuts = terciles(polys.map((p) => polygonUrban[p]));
    if (!rateCuts || !urbanCuts) return { colors: null, labels: null };
    const colors = {};
    const labels = {};
    for (const p of polys) {
      const rc = tercileClass(polygonRate[p], rateCuts);
      const uc = tercileClass(polygonUrban[p], urbanCuts);
      colors[p] = bivariateColor(rc, uc);
      labels[p] = t('geointel.metric.bivarValue', {
        rate: fmtNum(polygonRate[p], 1),
        urban: fmtNum(polygonUrban[p], 0),
        rateClass: t(`geointel.metric.class.${rc}`),
        urbanClass: t(`geointel.metric.class.${uc}`),
      });
    }
    return { colors, labels };
  }, [metric, polygonRate, polygonUrban, t]);
  const alertPolygons = useMemo(
    () => [...new Set(
      (districts.data || []).filter((d) => d.alert).map((d) => polygonForUnit(d.districtId)).filter(Boolean),
    )],
    [districts.data],
  );
  const cityMarkers = useMemo(
    () => CITY_UNIT_IDS.map((id) => {
      const u = unitInfo(id);
      if (!u) return null;
      const row = (districts.data || []).find((d) => normalizeUnitCode(d.districtId) === id);
      return { ...u, value: row ? Number(row.caseCount) || 0 : undefined };
    }).filter(Boolean),
    [districts.data],
  );
  const incidentRows = useMemo(() => {
    const rows = [];
    for (const r of incidents.data || []) {
      const lat = Number(r.lat ?? r.latitude);
      const lng = Number(r.lng ?? r.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) rows.push({ ...r, lat, lng });
    }
    return rows;
  }, [incidents.data]);
  // Weekday lens — the incident surface restricted to one day of the week.
  // CaseMaster exposes a date (not a timestamp) on this endpoint, so the day is
  // taken from the registration date; the hour side of the story comes from the
  // seasonality matrix, which the server derives from IncidentFromDate.
  const activeIncidents = useMemo(
    () => (weekday === null ? incidentRows : incidentRows.filter((r) => weekdayOf(r.registeredDate) === weekday)),
    [incidentRows, weekday],
  );
  const heatPoints = useMemo(() => activeIncidents.map((r) => [r.lat, r.lng, 0.6]), [activeIncidents]);
  const headNames = useMemo(() => {
    const o = {};
    for (const h of lookups.data?.crimeHeads || []) o[String(h.crimeHeadId)] = h.headName;
    return o;
  }, [lookups.data]);
  // /cases rows carry names but no lookup ids; these reverse maps let the
  // station drill run a statusName / subHeadName back through tName.
  const nameIds = useMemo(() => {
    const lk = lookups.data || {};
    const rev = (rows, idKey, nameKey) => {
      const o = {};
      for (const r of rows || []) if (r[nameKey]) o[r[nameKey]] = r[idKey];
      return o;
    };
    return {
      statuses: rev(lk.statuses, 'id', 'name'),
      crimeHeads: rev(lk.crimeHeads, 'crimeHeadId', 'headName'),
      crimeSubHeads: rev(lk.crimeSubHeads, 'crimeSubHeadId', 'subHeadName'),
    };
  }, [lookups.data]);
  const hotspotRows = useMemo(() => {
    const rows = (hotspots.data || []).filter(
      (h) => Number.isFinite(Number(h.centroidLat)) && Number.isFinite(Number(h.centroidLng)),
    );
    return rows.sort(
      (a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0)
        || (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0),
    );
  }, [hotspots.data]);
  // Hour-band filter (Night / Day / Evening) applies to circles AND chips.
  const filteredHotspots = useMemo(
    () => (hotspotBand === 'all'
      ? hotspotRows
      : hotspotRows.filter((h) => bandBucket(h.hourBandStart) === hotspotBand)),
    [hotspotRows, hotspotBand],
  );
  // …then the hour lens narrows further to clusters active at the chosen hour.
  const visibleHotspots = useMemo(
    () => (hour === null
      ? filteredHotspots
      : filteredHotspots.filter((h) => hourInBand(h.hourBandStart, h.hourBandEnd, hour))),
    [filteredHotspots, hour],
  );
  // A refetch/filter change can drop the selected cluster — clear the stale highlight.
  useEffect(() => {
    if (selectedHotspotId == null) return;
    if (!visibleHotspots.some((h) => String(h.clusterId) === String(selectedHotspotId))) {
      setSelectedHotspotId(null);
    }
  }, [visibleHotspots, selectedHotspotId]);

  // Month-A heat points for the compare swipe.
  const comparePoints = useMemo(() => {
    const pts = [];
    for (const r of compareIncidents.data || []) {
      const lat = Number(r.lat ?? r.latitude);
      const lng = Number(r.lng ?? r.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng, 0.6]);
    }
    return pts;
  }, [compareIncidents.data]);
  // Numbered rank badges on the top-3 visible hotspots (mirrors the chips).
  const rankBadges = useMemo(
    () => visibleHotspots.slice(0, 3)
      .map((h, i) => ({ lat: Number(h.centroidLat), lng: Number(h.centroidLng), rank: i + 1 }))
      .filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)),
    [visibleHotspots],
  );
  // Patrol-route suggestion — nearest-neighbour over the top-3 visible hotspots.
  const patrolRoute = useMemo(
    () => (patrolOn
      ? nearestNeighborRoute(visibleHotspots, patrolStopCount,
        (h) => hotspotName(h, tName, t('geointel.hotspot.cluster', { id: h.clusterId })),
        { optimize: patrolOptimize, roundTrip: patrolRoundTrip })
      : null),
    [patrolOn, visibleHotspots, patrolStopCount, patrolOptimize, patrolRoundTrip, t, tName],
  );
  // High-risk stations for the pulsing halo layer (risk ≥ 70).
  const haloRows = useMemo(
    () => (halos
      ? (stations.data || []).filter((s) => {
        const r = risk01(s.riskScore);
        return r !== null && r >= 0.7;
      })
      : NO_SELECTION),
    [halos, stations.data],
  );
  // Case totals per polygon — powers the district multi-select aggregate.
  const polygonCases = polygonCasesRaw;
  const stateTotal = useMemo(
    () => Object.values(polygonCases).reduce((a, v) => a + (Number(v) || 0), 0),
    [polygonCases],
  );
  // Radius-probe stats against the loaded incident window.
  const probeObj = useMemo(() => (probe ? { ...probe, radiusKm: probeKm } : null), [probe, probeKm]);
  const probeStats = useMemo(() => {
    if (!probe) return null;
    let count = 0;
    const heads = {};
    for (const r of activeIncidents) {
      if (haversineKm(probe.lat, probe.lng, r.lat, r.lng) <= probeKm) {
        count += 1;
        const k = String(r.crimeHeadId ?? '');
        heads[k] = (heads[k] || 0) + 1;
      }
    }
    let topHead = null;
    let topN = 0;
    for (const [k, n] of Object.entries(heads)) {
      if (n > topN) { topN = n; topHead = k; }
    }
    return {
      count,
      topHead: topHead
        ? tName('crimeHeads', topHead, headNames[topHead] || t('geointel.popup.head', { id: topHead }))
        : null,
      perKm2: count / (Math.PI * probeKm * probeKm),
    };
  }, [probe, probeKm, activeIncidents, headNames, t, tName]);
  // Per-month case totals aligned to the scrubber window (histogram bars).
  const monthTotals = useMemo(() => {
    const d = trends.data;
    if (!d || !d.months?.length || !months.length) return null;
    const sums = d.months.map((_, i) => d.series.reduce((a, s) => a + (Number(s.data[i]) || 0), 0));
    const offset = d.months.length - months.length;
    return months.map((_, i) => sums[offset + i] ?? 0);
  }, [trends.data, months]);

  // ---- analysis workbench: statistical layers --------------------------------
  // Every one of these runs over the rows already fetched for the map, so the
  // workbench costs no extra API calls — but they are gated behind the toggles
  // that use them, because at 2 000 incidents the grid and the catchment pass
  // are the two most expensive things this route does.
  // The workbench also lives inside the mobile sheet, where `dockOpen` is not
  // what decides visibility — the sheet being open (and not showing a drill) is.
  const dockActive = dockOpen || (sheetOpen && !drill);
  const needGrid = gridOn || (dockActive && dockTab === 'grid');
  const grid = useMemo(
    () => (needGrid ? buildGrid(activeIncidents, gridKm) : null),
    [needGrid, activeIncidents, gridKm],
  );
  const gridRenderCells = useMemo(
    () => (gridOn && grid ? grid.cells.slice(0, GRID_RENDER_CAP) : null),
    [gridOn, grid],
  );
  const needCatchment = spiderOn || gapsOn || (dockActive && dockTab === 'catchment');
  const catchment = useMemo(
    () => (needCatchment ? buildCatchment(activeIncidents, stations.data || [], { gapKm }) : null),
    [needCatchment, activeIncidents, stations.data, gapKm],
  );
  const spiderLinks = useMemo(
    () => (spiderOn && catchment ? catchment.links : null),
    [spiderOn, catchment],
  );
  const gapPoints = useMemo(
    () => (gapsOn && catchment ? catchment.gaps : null),
    [gapsOn, catchment],
  );
  // Hotspot ranking table rows: the visible clusters plus their distance to the
  // nearest police station, re-sorted by the active column.
  const tableRows = useMemo(() => {
    const sts = stations.data || [];
    const withDist = visibleHotspots.map((h) => {
      const near = sts.length
        ? nearestStation(Number(h.centroidLat), Number(h.centroidLng), sts)
        : null;
      return { ...h, nearestKm: near ? near.km : null, nearestName: near ? near.station.unitName : null };
    });
    return sortHotspotRows(withDist, tableSort);
  }, [visibleHotspots, stations.data, tableSort]);
  const tableCases = useMemo(
    () => tableRows.reduce((a, h) => a + (Number(h.caseCount) || 0), 0),
    [tableRows],
  );
  const coLocated = useMemo(
    () => (visibleHotspots.length > 1 ? coLocatedClusters(visibleHotspots) : []),
    [visibleHotspots],
  );
  const coLocatedChords = useMemo(
    () => (coLocateOn && coLocated.length ? coLocated.slice(0, 24) : null),
    [coLocateOn, coLocated],
  );
  // Seasonality for the weekday × hour explorer — only fetched with the tab open.
  const seasonality = useSeasonalityGrid(apiParams, dockActive && dockTab === 'spacetime');

  // ---- viewport-scoped counts + exports --------------------------------------
  const viewIncidents = useMemo(
    () => (viewport ? activeIncidents.filter((r) => inBounds(r.lat, r.lng, viewport)) : activeIncidents),
    [activeIncidents, viewport],
  );
  const viewStations = useMemo(
    () => (viewport ? (stations.data || []).filter((s) => inBounds(s.lat, s.lng, viewport)) : (stations.data || [])),
    [stations.data, viewport],
  );
  const viewHotspots = useMemo(
    () => (viewport ? visibleHotspots.filter((h) => inBounds(h.centroidLat, h.centroidLng, viewport)) : visibleHotspots),
    [visibleHotspots, viewport],
  );

  // ---- interactions ---------------------------------------------------------
  const openDistrict = (polygonName, opts = {}) => {
    const unitIds = opts.unitIds || unitsForPolygon(polygonName);
    if (!unitIds.length) return;
    setDrill({ type: 'district', polygon: polygonName, unitIds, title: opts.title || polygonName });
  };
  const togglePolygonSelect = (name) => {
    setSelectedPolygons((cur) => (
      cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
    ));
  };
  const onPolygonClick = (name) => {
    if (selectMode) {
      togglePolygonSelect(name);
      return;
    }
    openDistrict(name);
    issueFly({ type: 'polygon', name });
  };
  const onCityClick = (c) => {
    if (selectMode) {
      togglePolygonSelect(c.polygon);
      return;
    }
    openDistrict(c.polygon, {
      unitIds: [c.unitId],
      title: t('geointel.commissionerateTitle', { name: tName('districts', c.unitId, c.name) }),
    });
    issueFly({ type: 'point', lat: c.lat, lng: c.lng, zoom: 11 });
  };
  const onStationClick = (s) => {
    setDrill({ type: 'station', station: s });
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) issueFly({ type: 'point', lat, lng, zoom: 12 });
  };
  const onHotspotClick = (h) => {
    if (!mapLayers.hotspots) setMapLayer('hotspots', true);
    setSelectedHotspotId(h.clusterId ?? null);
    setDrill({ type: 'hotspot', hotspot: h }); // cluster detail panel
    issueFly({ type: 'hotspot', hotspot: h });
  };
  const onLocateUnit = (u) => {
    openDistrict(u.polygon, { unitIds: [u.unitId], title: u.name });
    if (CITY_UNIT_IDS.includes(u.unitId)) issueFly({ type: 'point', lat: u.lat, lng: u.lng, zoom: 11 });
    else issueFly({ type: 'polygon', name: u.polygon });
  };
  const onTogglePin = (station) => {
    setPins((cur) => {
      if (cur.some((p) => String(p.unitId) === String(station.unitId))) {
        return cur.filter((p) => String(p.unitId) !== String(station.unitId));
      }
      return [...cur.slice(-1), station]; // keep at most two, newest wins
    });
  };
  const onMoverSelect = (row) => {
    const polygon = polygonForUnit(row.districtId);
    if (!polygon) return;
    openDistrict(polygon, {
      unitIds: [normalizeUnitCode(row.districtId)],
      title: row.districtName || polygon,
    });
    issueFly({ type: 'polygon', name: polygon });
  };

  const shareLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success(t('geointel.share.copied'));
    else toast.error(t('geointel.share.failed'));
  };

  // ---- new tool toggles -----------------------------------------------------
  const toggleMeasure = () => {
    setProbing(false);
    setProbe(null);
    setMeasuring((v) => !v);
    setMeasureKm(null);
  };
  const toggleProbe = () => {
    if (probing || probe) {
      setProbing(false);
      setProbe(null);
      return;
    }
    setMeasuring(false);
    setMeasureKm(null);
    setProbing(true);
  };
  const toggleHourLens = () => {
    setHourPlaying(false);
    setHour((h) => (h === null ? 20 : null));
  };
  const toggleSelectMode = () => {
    setSelectMode((v) => {
      const next = !v;
      if (next && !useUiStore.getState().mapLayers.choropleth) setMapLayer('choropleth', true);
      if (!next) setSelectedPolygons([]);
      return next;
    });
  };
  const toggleCompare = () => {
    if (compareOn) {
      setCompareOn(false);
      return;
    }
    if (months.length < 2) return;
    setPlaying(false);
    if (!useUiStore.getState().mapLayers.heat) setMapLayer('heat', true);
    const bIdx = scrubIndex > 0 ? scrubIndex : months.length; // B = current or latest month
    setScrubIndex(bIdx);
    setCompareMonth(months[Math.max(0, bIdx - 2)]); // A defaults to the previous month
    setCompareOn(true);
  };
  const redZoneTour = () => {
    if (!alertPolygons.length) return;
    if (!useUiStore.getState().mapLayers.alertPulse) setMapLayer('alertPulse', true);
    const i = tourIdx % alertPolygons.length;
    issueFly({ type: 'polygon', name: alertPolygons[i] });
    setTourIdx(i + 1);
  };
  // ---- workbench actions ----------------------------------------------------
  const openDock = (tab) => {
    setDockTab(tab);
    setDockOpen(true);
  };
  const focusGridCell = (c) => {
    issueFly({
      type: 'bounds',
      bounds: { south: c.south, west: c.west, north: c.north, east: c.east },
      maxZoom: 14,
    });
    toast.success(c.band
      ? t('geointel.grid.cellToastSig', { n: fmtInt(c.count), z: fmtNum(c.z, 2), band: t(`geointel.grid.band.${c.band}`) })
      : t('geointel.grid.cellToast', { n: fmtInt(c.count) }));
  };
  const focusGap = (g) => {
    issueFly({ type: 'point', lat: g.lat, lng: g.lng, zoom: 13 });
  };
  const selectCatchmentStation = (row) => {
    const full = (stations.data || []).find((s) => String(s.unitId) === String(row.unitId));
    onStationClick(full || row);
  };
  const selectPair = (p) => {
    setSelectedHotspotId(p.a.clusterId ?? null);
    issueFly({
      type: 'bounds',
      bounds: {
        south: Math.min(p.aLat, p.bLat), north: Math.max(p.aLat, p.bLat),
        west: Math.min(p.aLng, p.bLng), east: Math.max(p.aLng, p.bLng),
      },
      maxZoom: 13,
    });
  };
  const fitToData = () => {
    const box = boundsOf([activeIncidents, visibleHotspots.map((h) => ({ lat: h.centroidLat, lng: h.centroidLng }))]);
    if (!box) {
      toast.error(t('geointel.fit.empty'));
      return;
    }
    issueFly({ type: 'bounds', bounds: box, maxZoom: 12 });
  };
  const exportGrid = () => {
    if (!grid || !grid.cells.length) return;
    const fc = gridFeatureCollection(grid.cells);
    const name = exportName(`grid${grid.cellKm}km`, apiParams, scrubMonth);
    downloadGeoJson(name, fc);
    toast.success(t('geointel.export.doneGeo', { n: fmtInt(fc.features.length), name }));
  };
  const exportCatchment = () => {
    if (!catchment || !catchment.rows.length) return;
    const rows = catchment.rows.map((r) => ({
      unitId: r.unitId,
      unitName: r.unitName,
      districtId: r.districtId ?? '',
      catchmentIncidents: r.count,
      sharePct: (r.share * 100).toFixed(2),
      meanKm: r.meanKm.toFixed(2),
      maxKm: r.maxKm.toFixed(2),
      caseCount: r.caseCount,
      riskScore: r.riskScore ?? '',
      lat: r.lat,
      lng: r.lng,
    }));
    const name = exportName('catchment', apiParams, scrubMonth);
    downloadCsv(name, CATCHMENT_COLS, rows);
    toast.success(t('geointel.export.doneCsv', { n: fmtInt(rows.length), name }));
  };
  const pickSpaceTimeCell = (d, h) => {
    setWeekday(d);
    setHourPlaying(false);
    setHour(h);
  };
  const resetSpaceTime = () => {
    setWeekday(null);
    setHourPlaying(false);
    setHour(null);
  };
  const cycleWeekday = () => {
    setWeekday((w) => (w === null ? 0 : (w >= 6 ? null : w + 1)));
  };

  const copyRoute = async () => {
    if (!patrolRoute || !patrolRoute.stops.length) return;
    const band = t(HOUR_BANDS.find((b) => b.key === hotspotBand)?.label || 'geointel.band.all');
    const lines = patrolRoute.stops.map((s, i) => (
      t('geointel.patrol.textStop', { i: i + 1, label: s.label, lat: s.lat.toFixed(4), lng: s.lng.toFixed(4) })
      + (i > 0 ? t('geointel.patrol.textLeg', { km: s.legKm.toFixed(1) }) : '')
    ));
    const text = [
      scrubMonth
        ? t('geointel.patrol.textHeaderMonth', { band, month: monthLabel(scrubMonth) })
        : t('geointel.patrol.textHeader', { band }),
      ...lines,
      patrolRoute.roundTrip && patrolRoute.closingKm > 0
        ? t('geointel.patrol.textReturn', { km: patrolRoute.closingKm.toFixed(1) })
        : null,
      t('geointel.patrol.textTotal', { km: patrolRoute.totalKm.toFixed(1), min: patrolRoute.etaMin }),
      patrolRoute.savedKm > 0.05 ? t('geointel.patrol.textSaved', { km: patrolRoute.savedKm.toFixed(1) }) : null,
    ].filter(Boolean).join('\n');
    const ok = await copyText(text);
    if (ok) toast.success(t('geointel.patrol.copied'));
    else toast.error(t('geointel.patrol.copyFailed'));
  };
  const copyBrief = async () => {
    const lines = [
      t('geointel.brief.title', { date: new Date().toISOString().slice(0, 10) }),
      t('geointel.brief.scope', { scope: printFilterSummary }),
    ];
    if (visibleHotspots.length) {
      lines.push(t('geointel.brief.topHotspots'));
      visibleHotspots.slice(0, 3).forEach((h, i) => {
        const band = hourBand(h.hourBandStart, h.hourBandEnd);
        const dName = tName('districts', h.districtId, unitInfo(h.districtId)?.name || h.districtId) || '—';
        const label = hotspotName(h, tName, t('geointel.hotspot.cluster', { id: h.clusterId }));
        lines.push(
          t('geointel.brief.hotspotLine', { i: i + 1, label, district: dName, n: fmtInt(Number(h.caseCount) || 0) })
          + (band ? t('geointel.brief.hotspotPeak', { band }) : ''),
        );
      });
    }
    const movers = (districts.data || [])
      .filter((r) => Number.isFinite(Number(r.momDeltaPct)))
      .sort((a, b) => Math.abs(Number(b.momDeltaPct)) - Math.abs(Number(a.momDeltaPct)))
      .slice(0, 3);
    if (movers.length) {
      lines.push(t('geointel.brief.movers', {
        list: movers.map((r) => {
          const d = Number(r.momDeltaPct);
          const name = tName('districts', r.districtId, r.districtName || r.districtId);
          return `${name} ${d > 0 ? '+' : ''}${d.toFixed(0)}%`;
        }).join(' · '),
      }));
    }
    if (weekdayLabel) lines.push(t('geointel.brief.weekday', { day: weekdayLabel }));
    // Statistical section — only when the grid has actually been computed, so
    // the brief never claims an analysis the officer did not run.
    if (grid && grid.cells.length) {
      lines.push(t('geointel.brief.grid', {
        km: grid.cellKm,
        cells: fmtInt(grid.occupied),
        hot: fmtInt(grid.hot95 + grid.hot99),
        top: grid.top10Share === null ? '—' : fmtNum(grid.top10Share * 100, 0),
      }));
    }
    if (catchment && catchment.rows.length) {
      lines.push(t('geointel.brief.catchment', {
        station: catchment.rows[0].unitName,
        n: fmtInt(catchment.rows[0].count),
        gaps: fmtInt(catchment.gapTotal || 0),
        km: gapKm,
      }));
    }
    if (coLocated.length) lines.push(t('geointel.brief.colocate', { n: fmtInt(coLocated.length) }));
    if (alertPolygons.length) lines.push(t('geointel.brief.redZones', { list: alertPolygons.join(', ') }));
    lines.push(t('geointel.brief.footer', {
      stations: fmtInt((stations.data || []).length), clusters: fmtInt(hotspotRows.length),
    }));
    const ok = await copyText(lines.join('\n'));
    if (ok) toast.success(t('geointel.brief.copied'));
    else toast.error(t('geointel.brief.copyFailed'));
  };
  // Compare-divider drag (pointer events on the handle, moves on the shell).
  const onDividerPointerDown = (e) => {
    e.preventDefault();
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev) => {
      const pct = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      setComparePct(Math.round(Math.min(92, Math.max(8, pct))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // New alert set → restart the red-zone tour from the top.
  useEffect(() => {
    setTourIdx(0);
  }, [alertPolygons]);

  // ---- saved views ----------------------------------------------------------
  const getCurrentView = () => ({
    camera: mapApiRef.current?.getCamera?.() || null,
    layers: { ...mapLayers },
    metric,
    m: scrubMonth,
    band: hotspotBand,
    hour,
    halos,
    weekday,
    grid: { on: gridOn, km: gridKm, gi: giMode },
    dock: { open: dockOpen, tab: dockTab },
    filters: {
      districtId,
      crimeHeadId,
      range,
      from: searchParams.get('from') || '',
      to: searchParams.get('to') || '',
    },
  });
  const applyView = (v) => {
    setPlaying(false);
    setFilters({
      range: v.filters?.range || 'all',
      districtId: v.filters?.districtId || '',
      crimeHeadId: v.filters?.crimeHeadId || '',
      from: v.filters?.from || '',
      to: v.filters?.to || '',
    });
    if (v.layers) for (const k of LAYER_KEYS) setMapLayer(k, !!v.layers[k]);
    if (METRIC_PROPS[v.metric]) setMetric(v.metric);
    setHotspotBand(BAND_KEYS.includes(v.band) ? v.band : 'all');
    if (typeof v.halos === 'boolean') setHalos(v.halos);
    setWeekday(Number.isInteger(v.weekday) && v.weekday >= 0 && v.weekday <= 6 ? v.weekday : null);
    if (v.grid && typeof v.grid === 'object') {
      setGridOn(!!v.grid.on);
      if (GRID_SIZES.includes(v.grid.km)) setGridKm(v.grid.km);
      setGiMode(!!v.grid.gi);
    }
    if (v.dock && typeof v.dock === 'object') {
      setDockOpen(!!v.dock.open);
      if (DOCK_TABS.includes(v.dock.tab)) setDockTab(v.dock.tab);
    }
    setHourPlaying(false);
    const hv = Number(v.hour);
    setHour(v.hour === null || v.hour === undefined || !Number.isFinite(hv)
      ? null
      : Math.min(23, Math.max(0, Math.round(hv))));
    if (v.m) {
      const idx = months.indexOf(v.m);
      if (idx >= 0) setScrubIndex(idx + 1);
      else { pendingMonth.current = v.m; monthApplied.current = false; } // re-applies when months refetch
    } else {
      setScrubIndex(0);
    }
    const cam = v.camera;
    if (cam && Number.isFinite(Number(cam.lat)) && Number.isFinite(Number(cam.lng))) {
      issueFly({ type: 'point', lat: Number(cam.lat), lng: Number(cam.lng), zoom: Number(cam.zoom) || 7 });
    }
  };

  // Tapping into a drill on a phone pulls the info sheet up to show it.
  useEffect(() => {
    if (drill) setSheetOpen(true);
  }, [drill]);

  // Arriving with ?districtId= (e.g. from the dashboard choropleth) auto-drills
  // once the GeoJSON is ready; clearing the filter re-arms the trigger.
  const lastAutoDistrict = useRef(null);
  useEffect(() => {
    if (!districtId) {
      lastAutoDistrict.current = null;
      return;
    }
    if (!geojson.data || lastAutoDistrict.current === districtId) return;
    lastAutoDistrict.current = districtId;
    const polygon = polygonForUnit(districtId);
    if (!polygon) return;
    openDistrict(polygon, {
      unitIds: [normalizeUnitCode(districtId)],
      title: unitInfo(districtId)?.name || polygon,
    });
    issueFly({ type: 'polygon', name: polygon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, geojson.data]);

  const anyLayerLoading = districts.isLoading || stations.isLoading || hotspots.isLoading || geojson.isLoading;
  const selectedUnitId = drill?.type === 'station' ? drill.station.unitId : null;
  const wantIncidents = mapLayers.heat || mapLayers.incidents;

  const shellCls = fullscreen
    ? 'fixed inset-0 z-50 bg-canvas overflow-hidden'
    : 'relative -m-4 md:-m-6 h-[calc(100dvh-10rem)] min-h-[22rem] md:h-[calc(100vh-5.5rem)] overflow-hidden';

  const printFilterSummary = [
    districtId
      ? tName('districts', districtId,
        (lookups.data?.districts || []).find((d) => d.districtId === districtId)?.districtName
          || t('geointel.scope.district', { id: districtId }))
      : t('geointel.scope.allDistricts'),
    crimeHeadId
      ? tName('crimeHeads', crimeHeadId,
        (lookups.data?.crimeHeads || []).find((h) => h.crimeHeadId === crimeHeadId)?.headName
          || t('geointel.scope.head', { id: crimeHeadId }))
      : t('geointel.scope.allCrimeHeads'),
    RANGE_KEYS[range] ? t(RANGE_KEYS[range]) : (DATE_RANGES.find((r) => r.value === range)?.label || range),
    scrubMonth ? t('geointel.scope.month', { m: monthLabel(scrubMonth) }) : null,
  ].filter(Boolean).join(' · ');

  // Workbench tabs. Built here (not inside the dock) so the identical nodes can
  // be dropped into the mobile sheet at 360px without a second implementation.
  const weekdayLabel = weekday === null
    ? null
    : dayShort(t, (seasonality.data?.weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[weekday]);
  const dockTabs = [
    {
      key: 'hotspots',
      label: t('geointel.dock.tabHotspots'),
      node: (
        <HotspotTable
          rows={tableRows}
          sort={tableSort}
          onSort={setTableSort}
          selectedId={selectedHotspotId}
          onSelect={onHotspotClick}
          onHover={setHoverHotspotId}
          coLocated={coLocated}
          onSelectPair={selectPair}
          totalCases={tableCases}
          coLocateOn={coLocateOn}
          onCoLocate={setCoLocateOn}
        />
      ),
    },
    {
      key: 'grid',
      label: t('geointel.dock.tabGrid'),
      node: (
        <GridPanel
          grid={grid}
          cellKm={gridKm}
          onCellKm={setGridKm}
          gridOn={gridOn}
          onGridOn={setGridOn}
          giMode={giMode}
          onGiMode={setGiMode}
          onFocusCell={focusGridCell}
          onExport={exportGrid}
          light={light}
          loading={wantIncidents && incidents.isFetching && !grid}
        />
      ),
    },
    {
      key: 'catchment',
      label: t('geointel.dock.tabCatchment'),
      node: (
        <CatchmentPanel
          catchment={catchment}
          gapKm={gapKm}
          onGapKm={setGapKm}
          spider={spiderOn}
          onSpider={setSpiderOn}
          gapsOn={gapsOn}
          onGapsOn={setGapsOn}
          onStationSelect={selectCatchmentStation}
          onFocusGap={focusGap}
          onExport={exportCatchment}
        />
      ),
    },
    {
      key: 'spacetime',
      label: t('geointel.dock.tabSpacetime'),
      node: (
        <SpaceTimePanel
          data={seasonality.data}
          loading={seasonality.isLoading}
          error={seasonality.error}
          onRetry={() => seasonality.refetch()}
          hour={hour}
          weekday={weekday}
          onPick={pickSpaceTimeCell}
          onHour={(h) => { setHourPlaying(false); setHour(h); }}
          onWeekday={setWeekday}
          onReset={resetSpaceTime}
          light={light}
        />
      ),
    },
    { key: 'depth', label: t('depth.dock.tab'), node: <DepthDockTab apiParams={apiParams} /> },
  ];

  return (
    <div className={shellCls} ref={shellRef}>
      <style>{GEOINTEL_CSS}</style>

      <MapCanvas
        layers={mapLayers}
        geojson={geojson.data || null}
        choroValues={choroValues}
        choroMetric={choroMetric}
        choroColors={bivariate.colors}
        choroLabels={bivariate.labels}
        choroOpacity={choroOpacity}
        heatOpacity={heatOpacity}
        alertPolygons={alertPolygons}
        cityMarkers={cityMarkers}
        heatPoints={heatPoints}
        incidentRows={activeIncidents}
        headNames={headNames}
        hotspots={visibleHotspots}
        stations={stations.data || []}
        selectedUnitId={selectedUnitId}
        selectedPolygons={selectMode ? selectedPolygons : null}
        rankBadges={rankBadges}
        patrolStops={patrolRoute ? patrolRoute.stops : null}
        haloStations={haloRows}
        probe={probeObj}
        probing={probing}
        onProbeSet={(pt) => setProbe(pt)}
        compareHeatPoints={compareOn && compareMonth ? comparePoints : null}
        comparePct={compareOn && compareMonth && scrubMonth ? comparePct : null}
        nightDim={hour !== null && (hour >= 19 || hour < 6)}
        gridCells={gridRenderCells}
        gridMax={grid ? grid.max : 1}
        giMode={giMode}
        onGridCellClick={focusGridCell}
        spiderLinks={spiderLinks}
        gapPoints={gapPoints}
        coLocatedPairs={coLocatedChords}
        highlightHotspotId={hoverHotspotId}
        onViewportChange={setViewport}
        fly={fly}
        light={light}
        basemap={basemap}
        onTileError={() => setTileError(true)}
        measuring={measuring}
        onMeasureEnd={(km) => setMeasureKm(km)}
        onCoordCopy={(text) => (text
          ? toast.success(t('geointel.coords.copied', { text }))
          : toast.error(t('geointel.coords.failed')))}
        mapApiRef={mapApiRef}
        onPolygonClick={onPolygonClick}
        onStationClick={onStationClick}
        onCityClick={onCityClick}
        onHotspotClick={onHotspotClick}
      />

      {/* month-compare swipe divider (drag to reveal A left / B right) */}
      {compareOn && compareMonth && scrubMonth && mapLayers.heat && (
        <div
          className="gi-noprint hidden md:block absolute inset-y-0 z-10 pointer-events-none"
          style={{ left: `calc(${comparePct}% - 1px)` }}
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/80" aria-hidden="true" />
          <span className="absolute top-24 left-0 -translate-x-full pr-2">
            <span className="chip bg-panel/95 shadow-lg !border-primary/50 text-primary num whitespace-nowrap">
              A · {monthLabel(compareMonth)}
            </span>
          </span>
          <span className="absolute top-24 left-0 pl-2">
            <span className="chip bg-panel/95 shadow-lg !border-amber/50 text-amber num whitespace-nowrap">
              B · {monthLabel(scrubMonth)}
            </span>
          </span>
          <button
            type="button"
            onPointerDown={onDividerPointerDown}
            aria-label={t('geointel.compare.dividerAria')}
            title={t('geointel.compare.dividerTitle')}
            className="pointer-events-auto absolute top-1/2 -translate-y-1/2 -left-3.5 h-9 w-7 rounded-lg border border-primary/60 bg-panel/95 shadow-lg flex items-center justify-center cursor-ew-resize text-primary touch-none"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 7 3 12l5 5M16 7l5 5-5 5" />
            </svg>
          </button>
        </div>
      )}

      {/* print-only briefing header (the print rules hide interactive chrome;
          fixed light colors — the printed page is always white) */}
      <div
        className="gi-print-only absolute top-2 left-2 z-30 rounded px-3 py-2 text-xs"
        style={{ background: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}
      >
        <strong>{t('geointel.printTitle')}</strong>
        <br />
        {printFilterSummary}
      </div>

      {/* big translucent month label while the heat animation runs */}
      {playing && scrubMonth && (
        <div className="gi-noprint pointer-events-none absolute inset-x-0 top-[38%] z-10 flex justify-center" aria-hidden="true">
          <span className="num text-4xl md:text-6xl font-bold tracking-wider text-ink/20 select-none">
            {monthLabel(scrubMonth)}
          </span>
        </div>
      )}

      {/* top overlay: title + toolbar, shared filter bar, layers, locate, status chips */}
      <div className="gi-noprint absolute top-3 left-3 right-3 z-10 pointer-events-none flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-stretch gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg flex flex-wrap items-center gap-2">
            <div>
              <h1 className="text-sm font-semibold text-ink leading-tight">{t('geointel.title')}</h1>
              <p className="text-[10px] text-muted leading-tight">{t('geointel.subtitle')}</p>
            </div>
            <Tooltip label={fullscreen ? t('geointel.toolbar.fullscreenExit') : t('geointel.toolbar.fullscreen')} position="bottom">
              <button
                type="button"
                className="btn gi-tap !px-2 !py-1.5"
                aria-pressed={fullscreen}
                aria-label={fullscreen ? t('geointel.toolbar.fullscreenExitAria') : t('geointel.toolbar.fullscreenAria')}
                onClick={() => setFullscreen((v) => !v)}
              >
                {fullscreen ? CompressIcon : ExpandIcon}
              </button>
            </Tooltip>
            <Tooltip label={t('geointel.toolbar.share')} position="bottom">
              <button type="button" className="btn gi-tap !px-2 !py-1.5" aria-label={t('geointel.toolbar.shareAria')} onClick={shareLink}>
                {LinkIcon}
              </button>
            </Tooltip>
            <SavedViews getCurrent={getCurrentView} onApply={applyView} />
            <ExportMenu
              stations={stations.data || []}
              hotspots={visibleHotspots}
              incidents={activeIncidents}
              viewStations={viewStations}
              viewHotspots={viewHotspots}
              viewIncidents={viewIncidents}
              apiParams={apiParams}
              scrubMonth={scrubMonth}
            />
            <Tooltip label={dockOpen ? t('geointel.dock.hide') : t('geointel.dock.show')} position="bottom">
              <button
                type="button"
                className={`btn gi-tap !px-2 !py-1.5 ${dockOpen ? '!text-primary !border-primary/60' : ''}`}
                aria-pressed={dockOpen}
                aria-label={dockOpen ? t('geointel.dock.hideAria') : t('geointel.dock.showAria')}
                onClick={() => setDockOpen((v) => !v)}
              >
                {AnalysisIcon}
              </button>
            </Tooltip>
            <Tooltip label={t('geointel.fit.title')} position="bottom">
              <button
                type="button"
                className="btn gi-tap !px-2 !py-1.5"
                aria-label={t('geointel.fit.aria')}
                onClick={fitToData}
              >
                {FitIcon}
              </button>
            </Tooltip>
            <Tooltip label={measuring ? t('geointel.toolbar.measureExit') : t('geointel.toolbar.measure')} position="bottom">
              <button
                type="button"
                className={`btn gi-tap !px-2 !py-1.5 ${measuring ? '!text-primary !border-primary/60' : ''}`}
                aria-pressed={measuring}
                aria-label={measuring ? t('geointel.toolbar.measureExitAria') : t('geointel.toolbar.measureAria')}
                onClick={toggleMeasure}
              >
                {RulerIcon}
              </button>
            </Tooltip>
            <Tooltip label={probing || probe ? t('geointel.toolbar.probeExit') : t('geointel.toolbar.probe')} position="bottom">
              <button
                type="button"
                className={`btn gi-tap !px-2 !py-1.5 ${probing || probe ? '!text-primary !border-primary/60' : ''}`}
                aria-pressed={probing || !!probe}
                aria-label={probing || probe ? t('geointel.toolbar.probeExitAria') : t('geointel.toolbar.probeAria')}
                onClick={toggleProbe}
              >
                {ProbeIcon}
              </button>
            </Tooltip>
            <Tooltip label={t('geointel.toolbar.brief')} position="bottom">
              <button
                type="button"
                className="btn gi-tap !px-2 !py-1.5"
                aria-label={t('geointel.toolbar.briefAria')}
                onClick={copyBrief}
              >
                {BriefIcon}
              </button>
            </Tooltip>
          </div>
          <FilterBar className="pointer-events-auto !bg-panel/95 shadow-lg max-w-full" />
        </div>
        <div className="flex items-start gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg flex items-center gap-2 max-w-full overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">{t('geointel.layers.label')}</span>
            <LayerToggles />
            <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
            <button
              type="button"
              className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors"
              aria-pressed={basemap === 'none'}
              onClick={() => setBasemap((b) => (b === 'osm' ? 'none' : 'osm'))}
              title={t('geointel.basemap.hint')}
            >
              {basemap === 'osm' ? t('geointel.basemap.on') : t('geointel.basemap.off')}
            </button>
            <button
              type="button"
              className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors"
              onClick={() => issueFly({ type: 'reset' })}
              title={t('geointel.reset.hint')}
            >
              ⌂ {t('geointel.reset.label')}
            </button>
            <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
            <button
              type="button"
              className={`chip gi-tap shrink-0 transition-colors ${halos ? '!border-signal/60 !text-signal !bg-signal/10' : 'text-muted hover:text-ink'}`}
              aria-pressed={halos}
              onClick={() => {
                if (!halos && !useUiStore.getState().mapLayers.stations) setMapLayer('stations', true);
                setHalos((v) => !v);
              }}
              title={t('geointel.halos.hint')}
            >
              {t('geointel.halos.label')}
            </button>
            <button
              type="button"
              className={`chip gi-tap shrink-0 transition-colors ${selectMode ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'}`}
              aria-pressed={selectMode}
              onClick={toggleSelectMode}
              title={t('geointel.select.hint')}
            >
              ▣ {t('geointel.select.label')}
            </button>
            {alertPolygons.length > 0 && (
              <button
                type="button"
                className="chip gi-tap shrink-0 text-signal hover:text-ink transition-colors"
                onClick={redZoneTour}
                title={t('geointel.redZones.hint')}
              >
                ⚠ {t('geointel.redZones.label')} {alertPolygons.length}
                {tourIdx > 0 && (
                  <span className="num text-muted">
                    {((tourIdx - 1) % alertPolygons.length) + 1}/{alertPolygons.length}
                  </span>
                )}
              </button>
            )}
          </div>
          <LocateSearch
            className="pointer-events-auto hidden md:block shrink-0"
            inputId="gi-locate"
            stations={stations.data || []}
            onPickUnit={onLocateUnit}
            onPickStation={onStationClick}
          />
        </div>
        {measuring && (
          <div className="pointer-events-auto chip bg-panel/95 shadow-lg !border-primary/50 text-primary">
            {measureKm === null
              ? t('geointel.measure.hint')
              : t('geointel.measure.result', { km: measureKm < 10 ? measureKm.toFixed(2) : measureKm.toFixed(1) })}
          </div>
        )}
        {(probing || probe) && (
          <div className="pointer-events-auto chip bg-panel/95 shadow-lg !border-primary/50 text-primary max-w-full flex-wrap">
            {!probe || !probeStats ? (
              t('geointel.probe.hint')
            ) : (
              <>
                <span className="num font-semibold">{fmtInt(probeStats.count)}</span>
                <span>{t('geointel.probe.within')}</span>
                <button
                  type="button"
                  className="btn !px-1.5 !py-0 num"
                  aria-label={t('geointel.probe.shrink')}
                  onClick={() => setProbeKm((k) => Math.max(0.5, +(k - 0.5).toFixed(1)))}
                >
                  −
                </button>
                <span className="num">{t('geointel.patrol.km', { km: probeKm })}</span>
                <button
                  type="button"
                  className="btn !px-1.5 !py-0 num"
                  aria-label={t('geointel.probe.grow')}
                  onClick={() => setProbeKm((k) => Math.min(25, +(k + 0.5).toFixed(1)))}
                >
                  +
                </button>
                {probeStats.topHead && <span className="text-muted">{t('geointel.probe.mostly', { head: probeStats.topHead })}</span>}
                <span className="text-muted num">{t('geointel.probe.density', { n: fmtNum(probeStats.perKm2, 1) })}</span>
                <span className="text-muted hidden sm:inline">{t('geointel.probe.replace')}</span>
                <button
                  type="button"
                  className="hover:text-ink transition-colors"
                  aria-label={t('geointel.probe.exit')}
                  onClick={toggleProbe}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        )}
        {selectMode && (
          <SelectionBar
            selected={selectedPolygons}
            values={polygonCases}
            stateTotal={stateTotal}
            onRemove={togglePolygonSelect}
            onClear={() => setSelectedPolygons([])}
            onFocus={() => selectedPolygons.length && issueFly({ type: 'polygons', names: selectedPolygons })}
            onExit={() => { setSelectMode(false); setSelectedPolygons([]); }}
          />
        )}
        {tileError && basemap === 'osm' && (
          <div className="pointer-events-auto chip self-start bg-panel/95 shadow-lg !border-amber/50 text-amber">
            {t('geointel.tile.error')}
            <button
              type="button"
              className="underline ml-1 hover:text-ink transition-colors"
              onClick={() => { setBasemap('none'); setTileError(false); }}
            >
              {t('geointel.tile.useBlank')}
            </button>
            <button
              type="button"
              className="ml-1 hover:text-ink transition-colors"
              aria-label={t('geointel.tile.dismiss')}
              onClick={() => setTileError(false)}
            >
              ✕
            </button>
          </div>
        )}
        {anyLayerLoading && (
          <div className="pointer-events-auto chip bg-panel/95 shadow-lg">
            <span className="skeleton h-2 w-2 !rounded-full" aria-hidden="true" />
            {t('geointel.status.loadingLayers')}
          </div>
        )}
        {districts.error && <ErrorChip label={t('geointel.error.choropleth')} onRetry={() => districts.refetch()} />}
        {stations.error && mapLayers.stations && (
          <ErrorChip label={t('geointel.error.stations')} onRetry={() => stations.refetch()} />
        )}
        {incidents.error && wantIncidents && (
          <ErrorChip label={t('geointel.error.incidents')} onRetry={() => incidents.refetch()} />
        )}
        {geojson.error && (
          <div className="pointer-events-auto max-w-sm">
            <EmptyState
              compact
              className="bg-panel/95 border border-grid rounded-xl shadow-lg"
              title={t('geointel.error.geojsonTitle')}
              message={t('geointel.error.geojsonMsg')}
              action={<button type="button" className="btn" onClick={() => geojson.refetch()}>{t('common.action.retry')}</button>}
            />
          </div>
        )}
      </div>

      {/* analysis workbench (desktop): hotspot table, grid statistics, station
          catchment and the weekday × hour explorer. The bottom overlay stack
          slides right by the dock width while it is open. */}
      {dockOpen && (
        <AnalysisDock
          className="gi-noprint hidden md:flex absolute left-3 bottom-3 w-[23rem] max-w-[46vw] z-20"
          // Grows upward from the bottom-left, capped so it never reaches under
          // the top overlay (title + filter + layer rows, which wrap on narrow
          // desktops). The tab body scrolls inside whatever height is left.
          style={{ maxHeight: 'calc(100% - 16.5rem)', minHeight: '17rem' }}
          tabs={dockTabs}
          tab={dockTab}
          onTab={setDockTab}
          onClose={() => setDockOpen(false)}
        />
      )}

      {/* bottom overlay (desktop): legend/metric bar + movers + hotspot chips + scrubber */}
      <div
        className={`hidden md:flex absolute bottom-3 right-24 z-10 pointer-events-none flex-col items-start gap-2 ${
          dockOpen ? 'left-[24.75rem]' : 'left-3'
        }`}
      >
        <LegendBar
          light={light}
          metricKey={metric}
          onMetric={setMetric}
          open={legendOpen}
          onToggle={() => setLegendOpen((v) => !v)}
          choroOpacity={choroOpacity}
          heatOpacity={heatOpacity}
          onChoroOpacity={setChoroOpacity}
          onHeatOpacity={setHeatOpacity}
        />
        <div className="gi-noprint max-w-full">
          <ViewportChip
            incidents={viewIncidents.length}
            stations={viewStations.length}
            hotspots={viewHotspots.length}
            totalIncidents={activeIncidents.length}
            weekdayLabel={weekdayLabel}
            onFit={fitToData}
            onClearWeekday={() => setWeekday(null)}
          />
        </div>
        {metric === 'mom' && (
          <div className="gi-noprint pointer-events-none max-w-full">
            <TopMovers rows={districts.data || []} onSelect={onMoverSelect} />
          </div>
        )}
        {hotspotRows.length > 0 && (
          <div className="gi-noprint pointer-events-auto flex flex-wrap items-center gap-1">
            <BandFilterChips value={hotspotBand} onChange={setHotspotBand} />
            <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
            <button
              type="button"
              className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
                hour !== null ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={hour !== null}
              onClick={toggleHourLens}
              title={t('geointel.hour.lensHint')}
            >
              ◔ {t('geointel.hour.lens')}
            </button>
            <button
              type="button"
              className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
                patrolOn ? '!border-amber/60 !text-amber' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={patrolOn}
              onClick={() => setPatrolOn((v) => !v)}
              title={t('geointel.patrol.hint')}
            >
              ⇢ {t('geointel.patrol.label')}
            </button>
            <button
              type="button"
              className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
                compareOn ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'
              } disabled:opacity-45`}
              aria-pressed={compareOn}
              disabled={months.length < 2}
              onClick={toggleCompare}
              title={t('geointel.compare.hint')}
            >
              ⇆ {t('geointel.compare.label')}
            </button>
            <button
              type="button"
              className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
                gridOn ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={gridOn}
              onClick={() => { setGridOn((v) => !v); if (!gridOn) openDock('grid'); }}
              title={t('geointel.grid.chipHint')}
            >
              ▦ {t('geointel.grid.chip')}
            </button>
            <button
              type="button"
              className={`chip gi-tap shrink-0 bg-panel/95 shadow-lg transition-colors text-[11px] ${
                weekday !== null ? '!border-primary/60 !text-primary' : 'text-muted hover:text-ink'
              }`}
              aria-pressed={weekday !== null}
              onClick={cycleWeekday}
              title={t('geointel.weekday.hint')}
            >
              ▤ {weekdayLabel || t('geointel.weekday.label')}
            </button>
          </div>
        )}
        {hour !== null && (
          <div className="gi-noprint pointer-events-auto w-full max-w-md">
            <HourScrubber
              hour={hour}
              onHourChange={setHour}
              playing={hourPlaying}
              onPlayToggle={() => setHourPlaying((v) => !v)}
              onExit={toggleHourLens}
              activeCount={visibleHotspots.length}
              totalCount={filteredHotspots.length}
            />
          </div>
        )}
        {patrolOn && (
          <div className="gi-noprint max-w-full">
            <PatrolRoutePill
              route={patrolRoute}
              bandLabel={hotspotBand === 'all'
                ? null
                : t(HOUR_BANDS.find((b) => b.key === hotspotBand)?.label || 'geointel.band.all')}
              onCopy={copyRoute}
              onExit={() => setPatrolOn(false)}
              stopCount={patrolStopCount}
              onStopCount={setPatrolStopCount}
              optimize={patrolOptimize}
              onOptimize={setPatrolOptimize}
              roundTrip={patrolRoundTrip}
              onRoundTrip={setPatrolRoundTrip}
            />
          </div>
        )}
        <div className="gi-noprint max-w-full">
          <HotspotChips
            hotspots={visibleHotspots.slice(0, 10)}
            loading={hotspots.isLoading}
            error={hotspots.error}
            onRetry={() => hotspots.refetch()}
            onSelect={onHotspotClick}
            selectedId={selectedHotspotId}
          />
        </div>
        {compareOn && (
          <div className="gi-noprint max-w-full">
            <CompareStrip
              months={months}
              monthA={compareMonth}
              monthB={scrubMonth}
              onMonthA={setCompareMonth}
              onMonthB={(ym) => {
                const idx = months.indexOf(ym);
                if (idx >= 0) { setPlaying(false); setScrubIndex(idx + 1); }
              }}
              countA={comparePoints.length}
              countB={heatPoints.length}
              loading={compareIncidents.isFetching || incidents.isFetching}
              onSwap={() => {
                if (!scrubMonth || !compareMonth) return;
                const idx = months.indexOf(compareMonth);
                setCompareMonth(scrubMonth);
                if (idx >= 0) setScrubIndex(idx + 1);
              }}
              onExit={() => setCompareOn(false)}
            />
          </div>
        )}
        <div className="gi-noprint pointer-events-auto w-full max-w-xl">
          <TimeScrubber
            months={months}
            index={scrubIndex}
            playing={playing}
            loading={wantIncidents && incidents.isFetching}
            onIndexChange={onScrub}
            onPlayToggle={togglePlay}
            speed={speed}
            onSpeedChange={setSpeed}
            loop={loop}
            onLoopToggle={() => setLoop((v) => !v)}
            totals={monthTotals}
          />
        </div>
      </div>

      {/* right drill panel (desktop): district → stations, station → KPIs + cases */}
      {drill && (
        <div className="gi-noprint hidden md:block absolute top-3 right-3 bottom-20 z-20 w-[21rem] max-w-[85vw]">
          <SidePanel
            drill={drill}
            apiParams={apiParams}
            onClose={() => setDrill(null)}
            onStationSelect={onStationClick}
            pins={pins}
            onTogglePin={onTogglePin}
            incidentRows={activeIncidents}
            stationsAll={stations.data || []}
            headNames={headNames}
            nameIds={nameIds}
            onBackToDistrict={(station) => {
              const polygon = polygonForUnit(station.districtId);
              if (polygon) {
                openDistrict(polygon);
                issueFly({ type: 'polygon', name: polygon });
              } else {
                setDrill(null);
              }
            }}
          />
        </div>
      )}

      {/* keyboard shortcuts help ('?') */}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}

      {/* mobile: swipeable docked bottom info sheet (scrubber peek + details) */}
      <MobileSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={t('geointel.sheet.title')}
        peek={(
          <TimeScrubber
            compact
            months={months}
            index={scrubIndex}
            playing={playing}
            loading={wantIncidents && incidents.isFetching}
            onIndexChange={onScrub}
            onPlayToggle={togglePlay}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        )}
      >
        {drill ? (
          <div className="h-[46vh]">
            <SidePanel
              drill={drill}
              apiParams={apiParams}
              onClose={() => setDrill(null)}
              onStationSelect={onStationClick}
              pins={pins}
              onTogglePin={onTogglePin}
              incidentRows={activeIncidents}
              stationsAll={stations.data || []}
              headNames={headNames}
              nameIds={nameIds}
              onBackToDistrict={(station) => {
                const polygon = polygonForUnit(station.districtId);
                if (polygon) openDistrict(polygon);
                else setDrill(null);
              }}
            />
          </div>
        ) : (
          <>
            <LocateSearch
              className="w-full"
              inputId="gi-locate-m"
              stations={stations.data || []}
              onPickUnit={(u) => { onLocateUnit(u); setSheetOpen(false); }}
              onPickStation={(s) => { onStationClick(s); }}
            />
            <ViewportChip
              incidents={viewIncidents.length}
              stations={viewStations.length}
              hotspots={viewHotspots.length}
              totalIncidents={activeIncidents.length}
              weekdayLabel={weekdayLabel}
              onFit={() => { fitToData(); setSheetOpen(false); }}
              onClearWeekday={() => setWeekday(null)}
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{t('geointel.hotspot.top')}</p>
              {hotspotRows.length > 0 && (
                <BandFilterChips className="mb-1.5 flex-wrap" value={hotspotBand} onChange={setHotspotBand} />
              )}
              <HotspotChips
                hotspots={visibleHotspots.slice(0, 10)}
                loading={hotspots.isLoading}
                error={hotspots.error}
                onRetry={() => hotspots.refetch()}
                onSelect={(h) => { onHotspotClick(h); setSheetOpen(false); }}
                selectedId={selectedHotspotId}
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{t('geointel.sheet.tools')}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`chip gi-tap transition-colors ${hour !== null ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'}`}
                  aria-pressed={hour !== null}
                  onClick={toggleHourLens}
                >
                  ◔ {t('geointel.hour.lens')}
                </button>
                <button
                  type="button"
                  className={`chip gi-tap transition-colors ${patrolOn ? '!border-amber/60 !text-amber !bg-amber/10' : 'text-muted hover:text-ink'}`}
                  aria-pressed={patrolOn}
                  onClick={() => setPatrolOn((v) => !v)}
                >
                  ⇢ {t('geointel.patrol.label')}
                </button>
                <button
                  type="button"
                  className={`chip gi-tap transition-colors ${halos ? '!border-signal/60 !text-signal !bg-signal/10' : 'text-muted hover:text-ink'}`}
                  aria-pressed={halos}
                  onClick={() => {
                    if (!halos && !useUiStore.getState().mapLayers.stations) setMapLayer('stations', true);
                    setHalos((v) => !v);
                  }}
                >
                  {t('geointel.halos.label')}
                </button>
                {alertPolygons.length > 0 && (
                  <button
                    type="button"
                    className="chip gi-tap text-signal"
                    onClick={() => { redZoneTour(); setSheetOpen(false); }}
                  >
                    ⚠ {t('geointel.redZones.label')} {alertPolygons.length}
                  </button>
                )}
              </div>
              {hour !== null && (
                <div className="mt-2">
                  <HourScrubber
                    compact
                    hour={hour}
                    onHourChange={setHour}
                    playing={hourPlaying}
                    onPlayToggle={() => setHourPlaying((v) => !v)}
                    onExit={toggleHourLens}
                    activeCount={visibleHotspots.length}
                    totalCount={filteredHotspots.length}
                  />
                </div>
              )}
              {patrolOn && (
                <div className="mt-2">
                  <PatrolRoutePill
                    route={patrolRoute}
                    bandLabel={hotspotBand === 'all'
                      ? null
                      : t(HOUR_BANDS.find((b) => b.key === hotspotBand)?.label || 'geointel.band.all')}
                    onCopy={copyRoute}
                    onExit={() => setPatrolOn(false)}
                    stopCount={patrolStopCount}
                    onStopCount={setPatrolStopCount}
                    optimize={patrolOptimize}
                    onOptimize={setPatrolOptimize}
                    roundTrip={patrolRoundTrip}
                    onRoundTrip={setPatrolRoundTrip}
                  />
                </div>
              )}
            </div>
            {/* The sheet keeps its children mounted while collapsed, so the
                workbench is gated on `sheetOpen` — otherwise a phone-sized DOM
                copy of every tab would render behind the desktop layout too. */}
            {sheetOpen && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{t('geointel.dock.title')}</p>
                <AnalysisDock
                  className="h-[52vh]"
                  tabs={dockTabs}
                  tab={dockTab}
                  onTab={setDockTab}
                />
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{t('geointel.sheet.display')}</p>
              <div className="space-y-2">
                <MetricChips value={metric} onChange={setMetric} className="flex-wrap" />
                <OpacityControls
                  choroOpacity={choroOpacity}
                  heatOpacity={heatOpacity}
                  onChoroOpacity={setChoroOpacity}
                  onHeatOpacity={setHeatOpacity}
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{t('geointel.legend.label')}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-muted">
                <LegendItems light={light} metricKey={metric} />
              </div>
            </div>
          </>
        )}
      </MobileSheet>
    </div>
  );
}
