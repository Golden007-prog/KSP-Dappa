// Full-bleed Leaflet canvas for GeoIntel. Owns the map instance and renders
// every toggleable layer imperatively: OSM tiles (an allowed client data
// source per docs/CONTRACTS.md — with a tile-error callback + 'none' basemap
// fallback so an offline demo degrades gracefully), district choropleth
// (theme-aware, metric-driven, opacity-controlled), incident heat
// (leaflet.heat), hotspot clusters, station bubbles, the alert pulse overlay,
// city-commissionerate markers, a two-click measure tool, a metric scale bar
// and a click-to-copy cursor coordinate readout. React drives it purely
// through props; fly-to commands arrive as {seq, ...} objects so repeating the
// same target still re-triggers the animation, and each seq executes at most
// once (a late-arriving GeoJSON no longer replays stale point/hotspot flights).
// All array/object props must be memoized by the parent — effects key on
// reference identity. `mapApiRef` (optional) receives { closePopup, getCamera }
// for the parent's Esc layering / saved-views features.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat'; // side-effect plugin: adds L.heatLayer
import { dateLabel, fmtInt, fmtNum } from '../../lib/format.js';
import {
  choroStroke, choroZeroFill, copyText, divergeColor, esc, haversineKm, hourBand,
  rampColor, risk01, riskColor,
} from './utils.js';

const KARNATAKA_CENTER = [14.9, 76.1];
// Individual incident markers only render from this zoom in (below it the heat
// layer tells the story and 2 000 markers would just melt into noise).
const INCIDENT_MIN_ZOOM = 12;
const INCIDENT_MARKER_CAP = 600;

// Custom panes so layer stacking is deterministic: choropleth fill sits below
// the heat canvas (overlayPane, z 400), vectors that must stay clickable above.
// The measure pane keeps overlayPane exclusive to the heat canvas so the heat
// opacity slider can drive the pane/canvas without touching other layers.
const PANES = [
  ['geointel-choro', 390],
  ['geointel-alert', 395],
  ['geointel-hotspots', 405],
  ['geointel-incidents', 406],
  ['geointel-measure', 407],
  ['geointel-stations', 408],
  ['geointel-city', 409],
];

export default function MapCanvas({
  layers,
  geojson,
  choroValues,
  choroMetric = null, // {key,label,diverging,fmtValue} — defaults to case counts
  choroOpacity = 0.55,
  heatOpacity = 1,
  alertPolygons,
  cityMarkers,
  heatPoints,
  incidentRows,
  headNames,
  hotspots,
  stations,
  selectedUnitId,
  fly,
  light = false, // active theme (drives choropleth ramp + strokes)
  basemap = 'osm', // 'osm' | 'none'
  onTileError,
  measuring = false,
  onMeasureEnd,
  onCoordCopy,
  mapApiRef,
  onPolygonClick,
  onStationClick,
  onCityClick,
  onHotspotClick,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const hotspotLayersRef = useRef({});
  const handlersRef = useRef({});
  const heatRef = useRef(null);
  const popupOpenRef = useRef(false);
  const measuringRef = useRef(false);
  const executedFlySeq = useRef(0);
  const coordRef = useRef(null); // {lat,lng} under the cursor
  const coordElRef = useRef(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  handlersRef.current = { onPolygonClick, onStationClick, onCityClick, onHotspotClick, onTileError, onMeasureEnd, onCoordCopy };
  measuringRef.current = measuring;

  // Map creation — once per mount (StrictMode double-mount recreates cleanly).
  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 6,
      maxZoom: 18,
      zoomSnap: 0.25,
    });
    map.setView(KARNATAKA_CENTER, 7);
    for (const [name, z] of PANES) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(z);
    }
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
    map.on('zoomend', () => setZoomedIn(map.getZoom() >= INCIDENT_MIN_ZOOM));
    map.on('popupopen', () => { popupOpenRef.current = true; });
    map.on('popupclose', () => { popupOpenRef.current = false; });
    map.on('mousemove', (e) => {
      coordRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
      // Direct DOM write — a 60 Hz React re-render for a readout would be waste.
      if (coordElRef.current) {
        coordElRef.current.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      }
    });
    mapRef.current = map;
    // Sidebar collapse / window resize both change the container box.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Imperative surface for the parent (Esc layering, saved views).
  useEffect(() => {
    if (!mapApiRef) return undefined;
    mapApiRef.current = {
      /** Close any open Leaflet popup; returns whether one was open. */
      closePopup: () => {
        if (!mapRef.current || !popupOpenRef.current) return false;
        mapRef.current.closePopup();
        return true;
      },
      /** Current camera as {lat,lng,zoom} (saved views). */
      getCamera: () => {
        const map = mapRef.current;
        if (!map) return null;
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      },
    };
    return () => { mapApiRef.current = null; };
  }, [mapApiRef]);

  // Basemap tiles — swappable to 'none' for the offline-degraded plain canvas.
  // A tileerror fires the parent notice once per layer instance.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemap === 'none') return undefined;
    let errored = false;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'geointel-tiles',
      maxZoom: 19,
    });
    layer.on('tileerror', () => {
      if (errored) return;
      errored = true;
      handlersRef.current.onTileError?.();
    });
    layer.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
  }, [basemap]);

  // Choropleth — census polygons filled by the active metric (case counts by
  // default; diverging metrics like MoM change split teal/red around zero).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.choropleth || !geojson) return undefined;
    const values = choroValues || {};
    const nums = Object.values(values).map((v) => Number(v)).filter(Number.isFinite);
    const diverging = !!choroMetric?.diverging;
    const max = diverging
      ? Math.max(1e-9, ...nums.map((v) => Math.abs(v)))
      : Math.max(1e-9, ...nums);
    const fmtValue = choroMetric?.fmtValue || ((v) => `${fmtInt(v)} cases`);
    const zeroFill = choroZeroFill(light);
    const stroke = choroStroke(light);
    const layer = L.geoJSON(geojson, {
      pane: 'geointel-choro',
      style: (feature) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]);
        const has = Number.isFinite(v);
        let fillColor = zeroFill;
        if (has && diverging) fillColor = divergeColor(v / max, light);
        else if (has && v > 0) fillColor = rampColor(v / max, light);
        return { fillColor, fillOpacity: choroOpacity, color: stroke, weight: 1 };
      },
      onEachFeature: (feature, lyr) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]);
        const label = Number.isFinite(v) ? fmtValue(v) : 'no data';
        lyr.bindTooltip(
          `<div class="text-xs"><strong>${esc(name)}</strong><br/>${esc(label)} · click to drill</div>`,
          { sticky: true, className: 'dappa-tooltip' },
        );
        lyr.on('click', () => {
          if (measuringRef.current) return; // measure tool owns map clicks
          handlersRef.current.onPolygonClick?.(name, feature);
        });
        lyr.on('mouseover', () => lyr.setStyle({ weight: 2, color: '#F5A623' }));
        lyr.on('mouseout', () => layer.resetStyle(lyr));
      },
    }).addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
  }, [geojson, choroValues, layers.choropleth, choroMetric, choroOpacity, light]);

  // Alert pulse overlay — animated red stroke (.alert-poly) on alerted districts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.alertPulse || !geojson || !(alertPolygons || []).length) return undefined;
    const alertSet = new Set(alertPolygons);
    const layer = L.geoJSON(geojson, {
      pane: 'geointel-alert',
      interactive: false,
      filter: (feature) => alertSet.has(feature?.properties?.district),
      style: {
        color: '#E5484D',
        weight: 2,
        fillColor: '#E5484D',
        fillOpacity: 0.07,
        className: 'alert-poly',
      },
    }).addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
  }, [geojson, alertPolygons, layers.alertPulse]);

  // Incident heat — canvas layer in the default overlayPane (above choropleth).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.heat || !(heatPoints || []).length || typeof L.heatLayer !== 'function') {
      return undefined;
    }
    const layer = L.heatLayer(heatPoints, {
      radius: 16,
      blur: 22,
      max: 1,
      minOpacity: 0.25,
      gradient: { 0.15: '#1d4ed8', 0.45: '#2DD4BF', 0.7: '#F5A623', 0.95: '#E5484D' },
    }).addTo(map);
    heatRef.current = layer;
    if (layer._canvas) layer._canvas.style.opacity = String(heatOpacity);
    return () => {
      heatRef.current = null;
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
    // heatOpacity intentionally not a dep — the effect below adjusts it live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatPoints, layers.heat]);

  // Live heat-opacity adjustment without tearing the layer down (the canvas is
  // plugin-internal but pinned: leaflet.heat 0.2.0 vendored in node_modules).
  useEffect(() => {
    const layer = heatRef.current;
    if (layer && layer._canvas) layer._canvas.style.opacity = String(heatOpacity);
  }, [heatOpacity]);

  // Individual incident markers with popup cards — only when the incidents
  // layer is on AND the user has zoomed in past INCIDENT_MIN_ZOOM (capped so a
  // 2 000-row window can't melt the DOM). Popup links deep into /cases/:id.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.incidents || !zoomedIn || !(incidentRows || []).length) return undefined;
    const names = headNames || {};
    const group = L.layerGroup();
    for (const r of incidentRows.slice(0, INCIDENT_MARKER_CAP)) {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const marker = L.circleMarker([lat, lng], {
        pane: 'geointel-incidents',
        radius: 4,
        color: '#0B1220',
        weight: 1,
        fillColor: '#2DD4BF',
        fillOpacity: 0.85,
      });
      const head = names[String(r.crimeHeadId)] || (r.crimeHeadId != null ? `Head ${r.crimeHeadId}` : 'Incident');
      marker.bindPopup(
        `<div class="text-xs leading-relaxed">`
          + `<strong>${esc(head)}</strong><br/>`
          + `Registered ${esc(dateLabel(r.registeredDate))}`
          + (r.caseMasterId !== undefined && r.caseMasterId !== null
            ? `<br/><a href="#/cases/${encodeURIComponent(String(r.caseMasterId))}">Open case →</a>`
            : '')
          + `</div>`,
        { className: 'geointel-popup', closeButton: false, offset: [0, -4] },
      );
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [incidentRows, layers.incidents, zoomedIn, headNames]);

  // Hotspot clusters — circles sized by radiusM, popup carries the hour band.
  useEffect(() => {
    const map = mapRef.current;
    hotspotLayersRef.current = {};
    if (!map || !layers.hotspots || !(hotspots || []).length) return undefined;
    const maxIntensity = Math.max(1e-9, ...hotspots.map((h) => Number(h.intensity) || 0));
    const group = L.layerGroup();
    for (const h of hotspots) {
      const lat = Number(h.centroidLat);
      const lng = Number(h.centroidLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const t = (Number(h.intensity) || 0) / maxIntensity;
      const color = t >= 0.66 ? '#E5484D' : '#F5A623';
      const circle = L.circle([lat, lng], {
        pane: 'geointel-hotspots',
        radius: Math.max(300, Number(h.radiusM) || 0),
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.14,
      });
      const band = hourBand(h.hourBandStart, h.hourBandEnd);
      circle.bindPopup(
        `<div class="text-xs leading-relaxed">`
          + `<strong>${esc(h.label || h.subHeadName || 'Hotspot')}</strong><br/>`
          + `${fmtInt(h.caseCount)} cases · intensity ${fmtNum(t, 2)}`
          + (band ? `<br/>Peak hour band <strong class="num">${band}</strong>` : '')
          + `</div>`,
        { className: 'geointel-popup', closeButton: false, offset: [0, -4] },
      );
      circle.on('click', () => {
        if (measuringRef.current) return;
        handlersRef.current.onHotspotClick?.(h);
      });
      group.addLayer(circle);
      if (h.clusterId !== undefined && h.clusterId !== null) {
        hotspotLayersRef.current[String(h.clusterId)] = circle;
      }
    }
    group.addTo(map);
    return () => {
      hotspotLayersRef.current = {};
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [hotspots, layers.hotspots]);

  // Station bubbles — radius by caseCount, color by risk band.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.stations || !(stations || []).length) return undefined;
    const maxCases = Math.max(1, ...stations.map((s) => Number(s.caseCount) || 0));
    const group = L.layerGroup();
    for (const s of stations) {
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const r = risk01(s.riskScore);
      const selected = selectedUnitId != null && String(s.unitId) === String(selectedUnitId);
      const marker = L.circleMarker([lat, lng], {
        pane: 'geointel-stations',
        radius: (selected ? 3 : 0) + 4 + 9 * Math.sqrt((Number(s.caseCount) || 0) / maxCases),
        color: selected ? (light ? '#131B2E' : '#E6EAF2') : '#0B1220',
        weight: selected ? 2 : 1,
        fillColor: riskColor(r),
        fillOpacity: 0.85,
      });
      marker.bindTooltip(
        `<div class="text-xs"><strong>${esc(s.unitName)}</strong><br/>`
          + `${fmtInt(s.caseCount)} cases${r !== null ? ` · risk ${Math.round(r * 100)}` : ''}</div>`,
        { sticky: true, className: 'dappa-tooltip' },
      );
      marker.on('click', () => {
        if (measuringRef.current) return;
        handlersRef.current.onStationClick?.(s);
      });
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [stations, layers.stations, selectedUnitId, light]);

  // City-commissionerate markers — always visible (pinned in docs/CONTRACTS.md).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(cityMarkers || []).length) return undefined;
    const group = L.layerGroup();
    for (const c of cityMarkers) {
      if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) continue;
      const marker = L.circleMarker([c.lat, c.lng], {
        pane: 'geointel-city',
        radius: 7,
        color: '#0B1220',
        weight: 1.5,
        fillColor: '#F5A623',
        fillOpacity: 0.95,
      });
      marker.bindTooltip(
        `<div class="text-xs"><strong>${esc(c.name)}</strong><br/>City commissionerate`
          + `${c.value !== undefined ? ` · ${fmtInt(c.value)} cases` : ''}</div>`,
        { sticky: true, className: 'dappa-tooltip' },
      );
      marker.on('click', () => {
        if (measuringRef.current) return;
        handlersRef.current.onCityClick?.(c);
      });
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [cityMarkers]);

  // Measure tool — two clicks draw a great-circle segment with a km label; a
  // third click starts a fresh measurement. Leaving the mode clears everything.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measuring) return undefined;
    const container = map.getContainer();
    const prevCursor = container.style.cursor;
    container.style.cursor = 'crosshair';
    let pts = [];
    const group = L.layerGroup().addTo(map);
    const onClick = (e) => {
      if (pts.length >= 2) {
        pts = [];
        group.clearLayers();
      }
      pts.push(e.latlng);
      group.addLayer(L.circleMarker(e.latlng, {
        pane: 'geointel-measure', radius: 5, color: '#5B9DFF', weight: 2, fillColor: '#5B9DFF', fillOpacity: 0.6,
      }));
      if (pts.length === 2) {
        const km = haversineKm(pts[0].lat, pts[0].lng, pts[1].lat, pts[1].lng);
        const line = L.polyline(pts, {
          pane: 'geointel-measure', color: '#5B9DFF', weight: 2.5, dashArray: '6 6',
        });
        line.bindTooltip(
          `<div class="text-xs num"><strong>${km < 10 ? km.toFixed(2) : km.toFixed(1)} km</strong></div>`,
          { permanent: true, className: 'dappa-tooltip', direction: 'center' },
        );
        group.addLayer(line);
        line.openTooltip();
        handlersRef.current.onMeasureEnd?.(km);
      }
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      container.style.cursor = prevCursor;
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [measuring]);

  // Fly commands from the parent (district zoom, station focus, hotspot fly-to).
  // Each seq executes exactly once; polygon flights wait for the GeoJSON and
  // fire on its arrival, but a completed point/hotspot flight is never replayed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly || fly.seq <= executedFlySeq.current) return;
    if (fly.type === 'polygon') {
      if (!geojson) return; // keep pending — executes when the GeoJSON arrives
      executedFlySeq.current = fly.seq;
      const feature = (geojson.features || []).find((f) => f?.properties?.district === fly.name);
      if (feature) {
        try {
          map.flyToBounds(L.geoJSON(feature).getBounds(), { padding: [60, 60], duration: 0.8, maxZoom: 11 });
        } catch {
          /* degenerate geometry — keep current view */
        }
      }
    } else if (fly.type === 'point') {
      executedFlySeq.current = fly.seq;
      map.flyTo([fly.lat, fly.lng], fly.zoom || 11, { duration: 0.8 });
    } else if (fly.type === 'hotspot') {
      executedFlySeq.current = fly.seq;
      const h = fly.hotspot || {};
      const lat = Number(h.centroidLat);
      const lng = Number(h.centroidLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.flyTo([lat, lng], 13, { duration: 0.9 });
        map.once('moveend', () => {
          const circle = hotspotLayersRef.current[String(h.clusterId)];
          try {
            if (circle && mapRef.current) circle.openPopup();
          } catch {
            /* layer was toggled away mid-flight */
          }
        });
      }
    } else if (fly.type === 'reset') {
      executedFlySeq.current = fly.seq;
      map.flyTo(KARNATAKA_CENTER, 7, { duration: 0.8 });
    }
  }, [fly, geojson]);

  const copyCoords = async () => {
    const c = coordRef.current;
    if (!c) return;
    const text = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    const ok = await copyText(text);
    handlersRef.current.onCoordCopy?.(ok ? text : null);
  };

  return (
    <>
      <div ref={elRef} className="absolute inset-0 z-0" aria-label="Karnataka operational map" />
      {/* cursor coordinate readout — desktop only, click copies (briefings) */}
      <button
        type="button"
        onClick={copyCoords}
        title="Click to copy cursor coordinates"
        className="gi-noprint hidden md:flex absolute z-10 bottom-3 right-14 items-center gap-1 rounded-lg
          border border-grid bg-panel/90 px-2 py-1 text-[10px] num text-muted hover:text-ink transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        </svg>
        <span ref={coordElRef}>—, —</span>
      </button>
    </>
  );
}
