// Route 2 — /map GeoIntel. Full-bleed Leaflet command map for Karnataka:
// OSM dark tiles with layer toggles (choropleth / incident heat / hotspot
// clusters / station bubbles / alert pulse overlay, zustand-persisted),
// district click → zoom + station drill, station click → KPI side panel with
// recent cases, a month time-scrubber animating the heat layer, and a hotspot
// chips row that flies the map to a cluster with its hour-band annotation.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDistrictsGeo, useHotspots, useKarnatakaGeoJson, useStations, useTrendsMonthly,
} from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { useUiStore } from '../lib/store.js';
import {
  CITY_UNIT_IDS, aggregateCountsPerPolygon, normalizeUnitCode, polygonForUnit, unitInfo, unitsForPolygon,
} from '../lib/districtGeoMap.js';
import FilterBar from '../components/FilterBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import PulseDot from '../components/PulseDot.jsx';
import MapCanvas from './geointel/MapCanvas.jsx';
import LayerToggles from './geointel/LayerToggles.jsx';
import TimeScrubber from './geointel/TimeScrubber.jsx';
import HotspotChips from './geointel/HotspotChips.jsx';
import SidePanel from './geointel/SidePanel.jsx';
import { useIncidentsLayer } from './geointel/hooks.js';
import { monthWindow } from './geointel/utils.js';

const MAX_SCRUB_MONTHS = 24;

// Route-scoped skins: dark-filtered OSM raster tiles and the dark Leaflet
// popup used for hotspot hour-band annotations (index.css is off-limits).
const GEOINTEL_CSS = `
.geointel-tiles { filter: invert(1) hue-rotate(200deg) brightness(0.6) contrast(1.05) saturate(0.35); }
.geointel-popup .leaflet-popup-content-wrapper { background:#111A2C; color:#E6EAF2; border:1px solid #1E2A44; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.5); }
.geointel-popup .leaflet-popup-content { margin:10px 12px; }
.geointel-popup .leaflet-popup-tip { background:#111A2C; border:1px solid #1E2A44; }
.geointel-range { accent-color:#F5A623; }
`;

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
  const { apiParams, districtId } = useUrlFilters();
  const mapLayers = useUiStore((s) => s.mapLayers);
  const setMapLayer = useUiStore((s) => s.setMapLayer);

  const geojson = useKarnatakaGeoJson();
  const districts = useDistrictsGeo(apiParams);
  const stations = useStations(apiParams);
  const hotspots = useHotspots(apiParams);
  const trends = useTrendsMonthly(apiParams); // months list for the scrubber

  const [scrubIndex, setScrubIndex] = useState(0); // 0 = whole window
  const [playing, setPlaying] = useState(false);
  const [drill, setDrill] = useState(null); // {type:'district',polygon,unitIds,title} | {type:'station',station}
  const [fly, setFly] = useState(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const flySeq = useRef(0);
  const issueFly = (cmd) => {
    flySeq.current += 1;
    setFly({ seq: flySeq.current, ...cmd });
  };

  const months = useMemo(() => (trends.data?.months || []).slice(-MAX_SCRUB_MONTHS), [trends.data]);
  const scrubMonth = scrubIndex > 0 && scrubIndex <= months.length ? months[scrubIndex - 1] : null;
  const incidentParams = useMemo(
    () => (scrubMonth ? { ...apiParams, ...monthWindow(scrubMonth) } : apiParams),
    [apiParams, scrubMonth],
  );
  const incidents = useIncidentsLayer(incidentParams, mapLayers.heat);

  // Filter change can shrink the month list — clamp the scrub position.
  useEffect(() => {
    setScrubIndex((i) => (i > months.length ? 0 : i));
  }, [months.length]);

  // Play loop: advance a month every 1.4 s, wrap back to the first month.
  useEffect(() => {
    if (!playing || !months.length) return undefined;
    const t = setInterval(() => {
      setScrubIndex((i) => (i >= months.length ? 1 : i + 1));
    }, 1400);
    return () => clearInterval(t);
  }, [playing, months.length]);

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
  const heatPoints = useMemo(() => {
    const pts = [];
    for (const r of incidents.data || []) {
      const lat = Number(r.lat ?? r.latitude);
      const lng = Number(r.lng ?? r.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng, 0.6]);
    }
    return pts;
  }, [incidents.data]);
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

  return (
    <div className="relative -m-4 md:-m-6 h-[calc(100vh-1.75rem)] overflow-hidden">
      <style>{GEOINTEL_CSS}</style>

      <MapCanvas
        layers={mapLayers}
        geojson={geojson.data || null}
        choroValues={choroValues}
        alertPolygons={alertPolygons}
        cityMarkers={cityMarkers}
        heatPoints={heatPoints}
        hotspots={hotspotRows}
        stations={stations.data || []}
        selectedUnitId={selectedUnitId}
        fly={fly}
        onPolygonClick={onPolygonClick}
        onStationClick={onStationClick}
        onCityClick={onCityClick}
        onHotspotClick={onHotspotClick}
      />

      {/* top overlay: title, shared filter bar, layer toggles, status chips */}
      <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-stretch gap-2 max-w-full">
          <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-3 py-2 shadow-lg">
            <h1 className="text-sm font-semibold text-ink leading-tight">GeoIntel</h1>
            <p className="text-[10px] text-muted leading-tight">Operational map · Karnataka</p>
          </div>
          <FilterBar className="pointer-events-auto !bg-panel/95 shadow-lg max-w-full" />
        </div>
        <div className="pointer-events-auto bg-panel/95 border border-grid rounded-xl px-2.5 py-1.5 shadow-lg flex items-center gap-2 max-w-full overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-muted shrink-0">Layers</span>
          <LayerToggles />
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
        {incidents.error && mapLayers.heat && (
          <ErrorChip label="Incident heat failed to load" onRetry={() => incidents.refetch()} />
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

      {/* bottom overlay: hotspot chips + heat time-scrubber + legend */}
      <div className="absolute left-3 bottom-3 right-3 sm:right-24 z-10 pointer-events-none flex flex-col items-start gap-2">
        <div className="pointer-events-none hidden md:flex items-center gap-3 bg-panel/95 border border-grid rounded-xl px-3 py-1.5 shadow-lg text-[10px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-14 rounded-full" style={{ background: 'linear-gradient(90deg,#233150,#F5A623)' }} aria-hidden="true" />
            case density
          </span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" /> low-risk station</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" aria-hidden="true" /> high-risk station</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" /> commissionerate</span>
          <span className="flex items-center gap-1.5"><PulseDot /> anomaly district</span>
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
            loading={mapLayers.heat && incidents.isFetching}
            onIndexChange={onScrub}
            onPlayToggle={togglePlay}
          />
        </div>
      </div>

      {/* right drill panel: district → stations, station → KPIs + recent cases */}
      {drill && (
        <div className="absolute top-3 right-3 bottom-20 z-20 w-[21rem] max-w-[85vw]">
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
    </div>
  );
}
