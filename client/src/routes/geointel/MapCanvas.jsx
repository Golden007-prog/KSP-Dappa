// Full-bleed Leaflet canvas for GeoIntel. Owns the map instance and renders
// every toggleable layer imperatively: OSM dark tiles, district choropleth,
// incident heat (leaflet.heat), hotspot clusters, station bubbles, the alert
// pulse overlay and city-commissionerate markers. React drives it purely
// through props; fly-to commands arrive as {seq, ...} objects so repeating the
// same target still re-triggers the animation. All array/object props must be
// memoized by the parent — effects key on reference identity.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat'; // side-effect plugin: adds L.heatLayer
import { dateLabel, fmtInt, fmtNum } from '../../lib/format.js';
import { esc, rampColor, risk01, riskColor, hourBand } from './utils.js';

const KARNATAKA_CENTER = [14.9, 76.1];
// Individual incident markers only render from this zoom in (below it the heat
// layer tells the story and 2 000 markers would just melt into noise).
const INCIDENT_MIN_ZOOM = 12;
const INCIDENT_MARKER_CAP = 600;

// Custom panes so layer stacking is deterministic: choropleth fill sits below
// the heat canvas (overlayPane, z 400), vectors that must stay clickable above.
const PANES = [
  ['geointel-choro', 390],
  ['geointel-alert', 395],
  ['geointel-hotspots', 405],
  ['geointel-incidents', 406],
  ['geointel-stations', 408],
  ['geointel-city', 409],
];

export default function MapCanvas({
  layers,
  geojson,
  choroValues,
  alertPolygons,
  cityMarkers,
  heatPoints,
  incidentRows,
  headNames,
  hotspots,
  stations,
  selectedUnitId,
  fly,
  onPolygonClick,
  onStationClick,
  onCityClick,
  onHotspotClick,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const hotspotLayersRef = useRef({});
  const handlersRef = useRef({});
  const [zoomedIn, setZoomedIn] = useState(false);
  handlersRef.current = { onPolygonClick, onStationClick, onCityClick, onHotspotClick };

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
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'geointel-tiles',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('zoomend', () => setZoomedIn(map.getZoom() >= INCIDENT_MIN_ZOOM));
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

  // Choropleth — census polygons filled by summed unit counts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layers.choropleth || !geojson) return undefined;
    const values = choroValues || {};
    const max = Math.max(1, ...Object.values(values).map((v) => Number(v) || 0));
    const layer = L.geoJSON(geojson, {
      pane: 'geointel-choro',
      style: (feature) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]) || 0;
        return {
          fillColor: v > 0 ? rampColor(v / max) : '#141d31',
          fillOpacity: 0.55,
          color: '#1E2A44',
          weight: 1,
        };
      },
      onEachFeature: (feature, lyr) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]) || 0;
        lyr.bindTooltip(
          `<div class="text-xs"><strong>${esc(name)}</strong><br/>${fmtInt(v)} cases · click to drill</div>`,
          { sticky: true, className: 'dappa-tooltip' },
        );
        lyr.on('click', () => handlersRef.current.onPolygonClick?.(name, feature));
        lyr.on('mouseover', () => lyr.setStyle({ weight: 2, color: '#F5A623' }));
        lyr.on('mouseout', () => layer.resetStyle(lyr));
      },
    }).addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
  }, [geojson, choroValues, layers.choropleth]);

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
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(layer);
    };
  }, [heatPoints, layers.heat]);

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
      circle.on('click', () => handlersRef.current.onHotspotClick?.(h));
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
        color: selected ? '#E6EAF2' : '#0B1220',
        weight: selected ? 2 : 1,
        fillColor: riskColor(r),
        fillOpacity: 0.85,
      });
      marker.bindTooltip(
        `<div class="text-xs"><strong>${esc(s.unitName)}</strong><br/>`
          + `${fmtInt(s.caseCount)} cases${r !== null ? ` · risk ${Math.round(r * 100)}` : ''}</div>`,
        { sticky: true, className: 'dappa-tooltip' },
      );
      marker.on('click', () => handlersRef.current.onStationClick?.(s));
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [stations, layers.stations, selectedUnitId]);

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
      marker.on('click', () => handlersRef.current.onCityClick?.(c));
      group.addLayer(marker);
    }
    group.addTo(map);
    return () => {
      if (mapRef.current) mapRef.current.removeLayer(group);
    };
  }, [cityMarkers]);

  // Fly commands from the parent (district zoom, station focus, hotspot fly-to).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly) return;
    if (fly.type === 'polygon' && geojson) {
      const feature = (geojson.features || []).find((f) => f?.properties?.district === fly.name);
      if (feature) {
        try {
          map.flyToBounds(L.geoJSON(feature).getBounds(), { padding: [60, 60], duration: 0.8, maxZoom: 11 });
        } catch {
          /* degenerate geometry — keep current view */
        }
      }
    } else if (fly.type === 'point') {
      map.flyTo([fly.lat, fly.lng], fly.zoom || 11, { duration: 0.8 });
    } else if (fly.type === 'hotspot') {
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
      map.flyTo(KARNATAKA_CENTER, 7, { duration: 0.8 });
    }
  }, [fly, geojson]);

  return <div ref={elRef} className="absolute inset-0 z-0" aria-label="Karnataka operational map" />;
}
