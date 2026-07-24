// Route 2 — /map GeoIntel. Full-bleed Leaflet command map for Karnataka:
// OSM tiles (dark-filtered in dark theme) with layer toggles (choropleth /
// incident heat / incident popup markers / hotspot clusters / station bubbles /
// alert pulse, zustand + localStorage persisted), district click → zoom +
// station drill, station click → KPI side panel with recent cases, a month
// time-scrubber (URL-synced, play/pause + speed control) animating the heat
// layer, ranked hotspot chips with score bars, a locate-district search box,
// a fullscreen mode (F / Esc), and on phones a swipeable docked bottom info
// sheet instead of the desktop overlays.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useDistrictsGeo, useHotspots, useKarnatakaGeoJson, useLookups, useStations, useTrendsMonthly,
} from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { useUiStore } from '../lib/store.js';
import {
  CITY_UNIT_IDS, aggregateCountsPerPolygon, normalizeUnitCode, polygonForUnit, unitInfo, unitsForPolygon,
} from '../lib/districtGeoMap.js';
import FilterBar from '../components/FilterBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import PulseDot from '../components/PulseDot.jsx';
import Tooltip from '../components/Tooltip.jsx';
import MapCanvas from './geointel/MapCanvas.jsx';
import LayerToggles from './geointel/LayerToggles.jsx';
import TimeScrubber, { SCRUB_SPEEDS } from './geointel/TimeScrubber.jsx';
import HotspotChips from './geointel/HotspotChips.jsx';
import SidePanel from './geointel/SidePanel.jsx';
import LocateSearch from './geointel/LocateSearch.jsx';
import MobileSheet from './geointel/MobileSheet.jsx';
import { useIncidentsLayer } from './geointel/hooks.js';
import { monthWindow } from './geointel/utils.js';
import { loadPrefs, savePrefs } from './geointel/prefs.js';

const MAX_SCRUB_MONTHS = 24;
const LAYER_KEYS = ['choropleth', 'heat', 'incidents', 'hotspots', 'stations', 'alertPulse'];

// Route-scoped skins. Tiles are dark-filtered only under html.dark (the light
// theme keeps plain OSM); popups follow the theme via the --c-* CSS vars
// (index.css is off-limits, so these live here).
const GEOINTEL_CSS = `
html.dark .geointel-tiles { filter: invert(1) hue-rotate(200deg) brightness(0.6) contrast(1.05) saturate(0.35); }
.geointel-popup .leaflet-popup-content-wrapper { background:var(--c-panel); color:var(--c-ink); border:1px solid var(--c-grid); border-radius:10px; box-shadow:var(--shadow-lift); }
.geointel-popup .leaflet-popup-content { margin:10px 12px; }
.geointel-popup .leaflet-popup-content a { color:var(--c-amber); font-weight:600; }
.geointel-popup .leaflet-popup-tip { background:var(--c-panel); border:1px solid var(--c-grid); }
.geointel-range { accent-color:var(--c-amber); }
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

function LegendItems() {
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-14 rounded-full" style={{ background: 'linear-gradient(90deg,#233150,#F5A623)' }} aria-hidden="true" />
        case density
      </span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" /> low-risk station</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" /> high-risk station</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" /> commissionerate</span>
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden="true" /> incident point (zoom 12+)</span>
      <span className="flex items-center gap-1.5"><PulseDot /> anomaly district</span>
    </>
  );
}

export default function GeoIntel() {
  const { apiParams, districtId } = useUrlFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapLayers = useUiStore((s) => s.mapLayers);
  const setMapLayer = useUiStore((s) => s.setMapLayer);

  const geojson = useKarnatakaGeoJson();
  const districts = useDistrictsGeo(apiParams);
  const stations = useStations(apiParams);
  const hotspots = useHotspots(apiParams);
  const trends = useTrendsMonthly(apiParams); // months list for the scrubber
  const lookups = useLookups(); // crime-head names for incident popup cards

  const [scrubIndex, setScrubIndex] = useState(0); // 0 = whole window
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 0.5 | 1 | 2 (persisted)
  const [fullscreen, setFullscreen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // mobile info sheet
  const [drill, setDrill] = useState(null); // {type:'district',polygon,unitIds,title} | {type:'station',station}
  const [fly, setFly] = useState(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const flySeq = useRef(0);
  const issueFly = (cmd) => {
    flySeq.current += 1;
    setFly({ seq: flySeq.current, ...cmd });
  };

  // ---- persisted prefs: layer toggles + playback speed ----------------------
  useEffect(() => {
    const p = loadPrefs();
    if (p.mapLayers && typeof p.mapLayers === 'object') {
      for (const k of LAYER_KEYS) {
        if (typeof p.mapLayers[k] === 'boolean') setMapLayer(k, p.mapLayers[k]);
      }
    } else if (useUiStore.getState().mapLayers.incidents === undefined) {
      setMapLayer('incidents', true); // discoverable default for the new layer
    }
    if (SCRUB_SPEEDS.includes(p.scrubSpeed)) setSpeed(p.scrubSpeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) { firstPersist.current = false; return; }
    savePrefs({ mapLayers, scrubSpeed: speed });
  }, [mapLayers, speed]);

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

  // Deep-linked scrub month (?m=YYYY-MM) — applied once when months arrive.
  const appliedUrlMonth = useRef(false);
  useEffect(() => {
    if (appliedUrlMonth.current || !months.length) return;
    appliedUrlMonth.current = true;
    const m = searchParams.get('m');
    if (!m) return;
    const idx = months.indexOf(m);
    if (idx >= 0) {
      setScrubIndex(idx + 1);
      if (!useUiStore.getState().mapLayers.heat) setMapLayer('heat', true);
    }
  }, [months, searchParams, setMapLayer]);
  // …and mirrored back so the current animation frame is shareable.
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (scrubMonth) next.set('m', scrubMonth); else next.delete('m');
      return String(next) === String(prev) ? prev : next;
    }, { replace: true });
  }, [scrubMonth, setSearchParams]);

  // Play loop: advance a month per tick (speed-scaled), wrap to the first.
  useEffect(() => {
    if (!playing || !months.length) return undefined;
    const t = setInterval(() => {
      setScrubIndex((i) => (i >= months.length ? 1 : i + 1));
    }, Math.round(1400 / speed));
    return () => clearInterval(t);
  }, [playing, months.length, speed]);

  const togglePlay = () => {
    if (!playing) {
      if (!mapLayers.heat) setMapLayer('heat', true);
      setScrubIndex((i) => (i === 0 ? 1 : i));
    }
    setPlaying((p) => !p);
  };
  const onScrub = (i) => {
    setPlaying(false);
    setScrubIndex(i);
    if (i > 0 && !mapLayers.heat) setMapLayer('heat', true);
  };

  // ---- fullscreen mode (F toggles, Esc exits) -------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setFullscreen(false); return; }
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      setFullscreen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- derived layer data (memoized: MapCanvas keys effects on identity) ----
  const choroValues = useMemo(() => aggregateCountsPerPolygon(districts.data || []), [districts.data]);
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

  return (
    <div className={shellCls}>
      <style>{GEOINTEL_CSS}</style>

      <MapCanvas
        layers={mapLayers}
        geojson={geojson.data || null}
        choroValues={choroValues}
        alertPolygons={alertPolygons}
        cityMarkers={cityMarkers}
        heatPoints={heatPoints}
        incidentRows={incidentRows}
        headNames={headNames}
        hotspots={hotspotRows}
        stations={stations.data || []}
        selectedUnitId={selectedUnitId}
        fly={fly}
        onPolygonClick={onPolygonClick}
        onStationClick={onStationClick}
        onCityClick={onCityClick}
        onHotspotClick={onHotspotClick}
      />

      {/* top overlay: title + fullscreen, shared filter bar, layers, locate, status chips */}
      <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-stretch gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg flex items-center gap-2.5">
            <div>
              <h1 className="text-sm font-semibold text-ink leading-tight">GeoIntel</h1>
              <p className="text-[10px] text-muted leading-tight">Operational map · Karnataka</p>
            </div>
            <Tooltip label={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map (F)'} position="bottom">
              <button
                type="button"
                className="btn !px-2 !py-1.5"
                aria-pressed={fullscreen}
                aria-label={fullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map'}
                onClick={() => setFullscreen((v) => !v)}
              >
                {fullscreen ? CompressIcon : ExpandIcon}
              </button>
            </Tooltip>
          </div>
          <FilterBar className="pointer-events-auto !bg-panel/95 shadow-lg max-w-full" />
        </div>
        <div className="flex items-start gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg flex items-center gap-2 max-w-full overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Layers</span>
            <LayerToggles />
            <button
              type="button"
              className="chip shrink-0 text-muted hover:text-ink transition-colors"
              onClick={() => issueFly({ type: 'reset' })}
              title="Fly back to the full Karnataka view"
            >
              ⌂ Reset view
            </button>
          </div>
          <LocateSearch
            className="pointer-events-auto hidden md:block shrink-0"
            stations={stations.data || []}
            onPickUnit={onLocateUnit}
            onPickStation={onStationClick}
          />
        </div>
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

      {/* bottom overlay (desktop): legend + hotspot chips + heat time-scrubber */}
      <div className="hidden md:flex absolute left-3 bottom-3 right-24 z-10 pointer-events-none flex-col items-start gap-2">
        <div className="pointer-events-none flex items-center gap-3 bg-panel/95 border border-grid rounded-xl px-3 py-1.5 shadow-lg text-[10px] text-muted">
          <LegendItems />
        </div>
        <HotspotChips
          hotspots={hotspotRows.slice(0, 10)}
          loading={hotspots.isLoading}
          error={hotspots.error}
          onRetry={() => hotspots.refetch()}
          onSelect={onHotspotClick}
          selectedId={selectedHotspotId}
        />
        <div className="pointer-events-auto w-full max-w-xl">
          <TimeScrubber
            months={months}
            index={scrubIndex}
            playing={playing}
            loading={wantIncidents && incidents.isFetching}
            onIndexChange={onScrub}
            onPlayToggle={togglePlay}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </div>
      </div>

      {/* right drill panel (desktop): district → stations, station → KPIs + cases */}
      {drill && (
        <div className="hidden md:block absolute top-3 right-3 bottom-20 z-20 w-[21rem] max-w-[85vw]">
          <SidePanel
            drill={drill}
            apiParams={apiParams}
            onClose={() => setDrill(null)}
            onStationSelect={onStationClick}
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
              stations={stations.data || []}
              onPickUnit={(u) => { onLocateUnit(u); setSheetOpen(false); }}
              onPickStation={(s) => { onStationClick(s); }}
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Top hotspots</p>
              <HotspotChips
                hotspots={hotspotRows.slice(0, 10)}
                loading={hotspots.isLoading}
                error={hotspots.error}
                onRetry={() => hotspots.refetch()}
                onSelect={(h) => { onHotspotClick(h); setSheetOpen(false); }}
                selectedId={selectedHotspotId}
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Legend</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-muted">
                <LegendItems />
              </div>
            </div>
          </>
        )}
      </MobileSheet>
    </div>
  );
}
