// Route 2 — /map GeoIntel. Full-bleed Leaflet command map for Karnataka:
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
import HotspotChips, { BandFilterChips } from './geointel/HotspotChips.jsx';
import SidePanel from './geointel/SidePanel.jsx';
import LocateSearch from './geointel/LocateSearch.jsx';
import MobileSheet from './geointel/MobileSheet.jsx';
import SavedViews from './geointel/SavedViews.jsx';
import ExportMenu from './geointel/ExportMenu.jsx';
import TopMovers from './geointel/TopMovers.jsx';
import ShortcutsOverlay from './geointel/ShortcutsOverlay.jsx';
import LegendBar, { LegendItems, MetricChips, OpacityControls } from './geointel/MapLegend.jsx';
import { useIncidentsLayer } from './geointel/hooks.js';
import { bandBucket, copyText, monthWindow, risk01 } from './geointel/utils.js';
import { loadPrefs, savePrefs } from './geointel/prefs.js';

const MAX_SCRUB_MONTHS = 24;
const LAYER_KEYS = ['choropleth', 'heat', 'incidents', 'hotspots', 'stations', 'alertPulse'];
// Short codes for the ?layers= URL param (shareable map composition).
const LAYER_CODES = {
  choropleth: 'choro', heat: 'heat', incidents: 'pts', hotspots: 'hot', stations: 'stn', alertPulse: 'alert',
};

// Choropleth metric definitions — module-scope constants so MapCanvas effects
// can key on stable identity.
const METRIC_PROPS = {
  cases: { key: 'cases', diverging: false, fmtValue: (v) => `${fmtInt(v)} cases` },
  rate: { key: 'rate', diverging: false, fmtValue: (v) => `${fmtNum(v, 1)} cases / lakh` },
  mom: { key: 'mom', diverging: true, fmtValue: (v) => `${v > 0 ? '+' : ''}${fmtNum(v, 1)}% MoM` },
  risk: { key: 'risk', diverging: false, fmtValue: (v) => `mean station risk ${fmtInt(v)}` },
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
`;

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

function ErrorChip({ label, onRetry }) {
  return (
    <div className="pointer-events-auto chip self-start !border-signal/50 bg-panel/95 text-signal shadow-lg">
      {label}
      <button type="button" className="underline ml-1 hover:text-ink transition-colors" onClick={onRetry}>
        Retry
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

  const geojson = useKarnatakaGeoJson();
  const districts = useDistrictsGeo(apiParams);
  const stations = useStations(apiParams);
  const hotspots = useHotspots(apiParams);
  const trends = useTrendsMonthly(apiParams); // months list for the scrubber
  const lookups = useLookups(); // crime-head names for incident popup cards

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
  const [hotspotBand, setHotspotBand] = useState('all'); // 'all'|'night'|'day'|'evening'
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pins, setPins] = useState([]); // up to two stations pinned for compare
  const flySeq = useRef(0);
  const mapApiRef = useRef(null);
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
    });
  }, [mapLayers, speed, loop, basemap, choroOpacity, heatOpacity, legendOpen, metric]);
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
  const incidents = useIncidentsLayer(incidentParams, mapLayers.heat || mapLayers.incidents);

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
        // help overlay, the measure tool, any open Leaflet popup, the drill
        // panel — and only then fullscreen.
        if (typing) return;
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (measuring) { setMeasuring(false); return; }
        if (mapApiRef.current?.closePopup?.()) return;
        if (drill) { setDrill(null); return; }
        setFullscreen(false);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') { setFullscreen((v) => !v); return; }
      if (e.key === '?') { setShortcutsOpen((v) => !v); return; }
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
  const choroMetric = METRIC_PROPS[metric] || METRIC_PROPS.cases;
  const choroValues = useMemo(() => {
    const rows = districts.data || [];
    if (metric === 'rate') return meanPerPolygon(rows, (r) => r.ratePerLakh);
    if (metric === 'mom') return meanPerPolygon(rows, (r) => r.momDeltaPct);
    if (metric === 'risk') {
      return meanPerPolygon(stations.data || [], (s) => {
        const r = risk01(s.riskScore);
        return r === null ? NaN : r * 100;
      });
    }
    return aggregateCountsPerPolygon(rows);
  }, [districts.data, stations.data, metric]);
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
  const heatPoints = useMemo(() => incidentRows.map((r) => [r.lat, r.lng, 0.6]), [incidentRows]);
  const headNames = useMemo(() => {
    const o = {};
    for (const h of lookups.data?.crimeHeads || []) o[String(h.crimeHeadId)] = h.headName;
    return o;
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
  // A refetch/filter change can drop the selected cluster — clear the stale highlight.
  useEffect(() => {
    if (selectedHotspotId == null) return;
    if (!filteredHotspots.some((h) => String(h.clusterId) === String(selectedHotspotId))) {
      setSelectedHotspotId(null);
    }
  }, [filteredHotspots, selectedHotspotId]);

  // ---- interactions ---------------------------------------------------------
  const openDistrict = (polygonName, opts = {}) => {
    const unitIds = opts.unitIds || unitsForPolygon(polygonName);
    if (!unitIds.length) return;
    setDrill({ type: 'district', polygon: polygonName, unitIds, title: opts.title || polygonName });
  };
  const onPolygonClick = (name) => {
    openDistrict(name);
    issueFly({ type: 'polygon', name });
  };
  const onCityClick = (c) => {
    openDistrict(c.polygon, { unitIds: [c.unitId], title: `${c.name} (commissionerate)` });
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
    if (ok) toast.success('Share link copied — filters, layers and month included');
    else toast.error('Could not copy the link');
  };

  // ---- saved views ----------------------------------------------------------
  const getCurrentView = () => ({
    camera: mapApiRef.current?.getCamera?.() || null,
    layers: { ...mapLayers },
    metric,
    m: scrubMonth,
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
    ? 'fixed inset-0 z-50 bg-base overflow-hidden'
    : 'relative -m-4 md:-m-6 h-[calc(100dvh-10rem)] min-h-[22rem] md:h-[calc(100vh-5.5rem)] overflow-hidden';

  const printFilterSummary = [
    districtId ? (lookups.data?.districts || []).find((d) => d.districtId === districtId)?.districtName || `district ${districtId}` : 'All districts',
    crimeHeadId ? (lookups.data?.crimeHeads || []).find((h) => h.crimeHeadId === crimeHeadId)?.headName || `head ${crimeHeadId}` : 'all crime heads',
    DATE_RANGES.find((r) => r.value === range)?.label || range,
    scrubMonth ? `month ${monthLabel(scrubMonth)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={shellCls}>
      <style>{GEOINTEL_CSS}</style>

      <MapCanvas
        layers={mapLayers}
        geojson={geojson.data || null}
        choroValues={choroValues}
        choroMetric={choroMetric}
        choroOpacity={choroOpacity}
        heatOpacity={heatOpacity}
        alertPolygons={alertPolygons}
        cityMarkers={cityMarkers}
        heatPoints={heatPoints}
        incidentRows={incidentRows}
        headNames={headNames}
        hotspots={filteredHotspots}
        stations={stations.data || []}
        selectedUnitId={selectedUnitId}
        fly={fly}
        light={light}
        basemap={basemap}
        onTileError={() => setTileError(true)}
        measuring={measuring}
        onMeasureEnd={(km) => setMeasureKm(km)}
        onCoordCopy={(text) => (text ? toast.success(`Copied ${text}`) : toast.error('Could not copy coordinates'))}
        mapApiRef={mapApiRef}
        onPolygonClick={onPolygonClick}
        onStationClick={onStationClick}
        onCityClick={onCityClick}
        onHotspotClick={onHotspotClick}
      />

      {/* print-only briefing header (the print rules hide interactive chrome;
          fixed light colors — the printed page is always white) */}
      <div
        className="gi-print-only absolute top-2 left-2 z-30 rounded px-3 py-2 text-xs"
        style={{ background: '#ffffff', color: '#111827', border: '1px solid #d1d5db' }}
      >
        <strong>GeoIntel — situational snapshot</strong>
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
              <h1 className="text-sm font-semibold text-ink leading-tight">GeoIntel</h1>
              <p className="text-[10px] text-muted leading-tight">Operational map · Karnataka</p>
            </div>
            <Tooltip label={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map (F)'} position="bottom">
              <button
                type="button"
                className="btn gi-tap !px-2 !py-1.5"
                aria-pressed={fullscreen}
                aria-label={fullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map'}
                onClick={() => setFullscreen((v) => !v)}
              >
                {fullscreen ? CompressIcon : ExpandIcon}
              </button>
            </Tooltip>
            <Tooltip label="Copy a share link (filters + layers + month)" position="bottom">
              <button type="button" className="btn gi-tap !px-2 !py-1.5" aria-label="Copy share link" onClick={shareLink}>
                {LinkIcon}
              </button>
            </Tooltip>
            <SavedViews getCurrent={getCurrentView} onApply={applyView} />
            <ExportMenu
              stations={stations.data || []}
              hotspots={filteredHotspots}
              incidents={incidentRows}
              apiParams={apiParams}
              scrubMonth={scrubMonth}
            />
            <Tooltip label={measuring ? 'Exit measure (Esc)' : 'Measure distance — click two points'} position="bottom">
              <button
                type="button"
                className={`btn gi-tap !px-2 !py-1.5 ${measuring ? '!text-primary !border-primary/60' : ''}`}
                aria-pressed={measuring}
                aria-label={measuring ? 'Exit distance measuring' : 'Measure a distance on the map'}
                onClick={() => { setMeasuring((v) => !v); setMeasureKm(null); }}
              >
                {RulerIcon}
              </button>
            </Tooltip>
          </div>
          <FilterBar className="pointer-events-auto !bg-panel/95 shadow-lg max-w-full" />
        </div>
        <div className="flex items-start gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg flex items-center gap-2 max-w-full overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Layers</span>
            <LayerToggles />
            <span className="h-4 w-px bg-grid shrink-0" aria-hidden="true" />
            <button
              type="button"
              className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors"
              aria-pressed={basemap === 'none'}
              onClick={() => setBasemap((b) => (b === 'osm' ? 'none' : 'osm'))}
              title="Toggle the OSM basemap — 'off' keeps a plain canvas for offline demos"
            >
              Basemap {basemap === 'osm' ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors"
              onClick={() => issueFly({ type: 'reset' })}
              title="Fly back to the full Karnataka view"
            >
              ⌂ Reset view
            </button>
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
              ? 'Measure: click two points on the map · Esc to exit'
              : `Distance ${measureKm < 10 ? measureKm.toFixed(2) : measureKm.toFixed(1)} km · click to remeasure · Esc to exit`}
          </div>
        )}
        {tileError && basemap === 'osm' && (
          <div className="pointer-events-auto chip self-start bg-panel/95 shadow-lg !border-amber/50 text-amber">
            Basemap tiles unavailable — overlays still live
            <button
              type="button"
              className="underline ml-1 hover:text-ink transition-colors"
              onClick={() => { setBasemap('none'); setTileError(false); }}
            >
              Use blank basemap
            </button>
            <button
              type="button"
              className="ml-1 hover:text-ink transition-colors"
              aria-label="Dismiss basemap notice"
              onClick={() => setTileError(false)}
            >
              ✕
            </button>
          </div>
        )}
        {anyLayerLoading && (
          <div className="pointer-events-auto chip bg-panel/95 shadow-lg">
            <span className="skeleton h-2 w-2 !rounded-full" aria-hidden="true" />
            Loading map layers…
          </div>
        )}
        {districts.error && <ErrorChip label="Choropleth failed to load" onRetry={() => districts.refetch()} />}
        {stations.error && mapLayers.stations && (
          <ErrorChip label="Stations failed to load" onRetry={() => stations.refetch()} />
        )}
        {incidents.error && wantIncidents && (
          <ErrorChip label="Incident layer failed to load" onRetry={() => incidents.refetch()} />
        )}
        {geojson.error && (
          <div className="pointer-events-auto max-w-sm">
            <EmptyState
              compact
              className="bg-panel/95 border border-grid rounded-xl shadow-lg"
              title="District polygons unavailable"
              message="Could not load the Karnataka GeoJSON — the base map still works."
              action={<button type="button" className="btn" onClick={() => geojson.refetch()}>Retry</button>}
            />
          </div>
        )}
      </div>

      {/* bottom overlay (desktop): legend/metric bar + movers + hotspot chips + scrubber */}
      <div className="hidden md:flex absolute left-3 bottom-3 right-24 z-10 pointer-events-none flex-col items-start gap-2">
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
        {metric === 'mom' && (
          <div className="gi-noprint pointer-events-none max-w-full">
            <TopMovers rows={districts.data || []} onSelect={onMoverSelect} />
          </div>
        )}
        {hotspotRows.length > 0 && (
          <div className="gi-noprint pointer-events-auto">
            <BandFilterChips value={hotspotBand} onChange={setHotspotBand} />
          </div>
        )}
        <div className="gi-noprint max-w-full">
          <HotspotChips
            hotspots={filteredHotspots.slice(0, 10)}
            loading={hotspots.isLoading}
            error={hotspots.error}
            onRetry={() => hotspots.refetch()}
            onSelect={onHotspotClick}
            selectedId={selectedHotspotId}
          />
        </div>
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
        title="Map info"
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
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Top hotspots</p>
              {hotspotRows.length > 0 && (
                <BandFilterChips className="mb-1.5 flex-wrap" value={hotspotBand} onChange={setHotspotBand} />
              )}
              <HotspotChips
                hotspots={filteredHotspots.slice(0, 10)}
                loading={hotspots.isLoading}
                error={hotspots.error}
                onRetry={() => hotspots.refetch()}
                onSelect={(h) => { onHotspotClick(h); setSheetOpen(false); }}
                selectedId={selectedHotspotId}
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Display</p>
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
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Legend</p>
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
