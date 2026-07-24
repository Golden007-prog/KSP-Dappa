// Karnataka mini-choropleth (Leaflet, no tile layer — polygons on the dark base).
// Used by the Dashboard; also reusable for Offender 360's district-hop map.
// Props:
//   values    — { [polygonName]: number } (use districtGeoMap.aggregateCountsPerPolygon)
//   alerts?   — polygon names to outline with the red animated pulse stroke
//   markers?  — [{lat, lng, label?, value?, unitId?}] → amber circle markers
//   onPolygonClick?(polygonName, feature), onMarkerClick?(marker)
//   height?   — px number, default 280
//   valueLabel? — tooltip suffix (default 'cases')
//   className?
// GeoJSON loads via useKarnatakaGeoJson() (cached forever); a skeleton shows
// while it loads and an EmptyState if it fails.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useKarnatakaGeoJson } from '../lib/api.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';
import { fmtInt } from '../lib/format.js';

const LOW = [0x23, 0x31, 0x50];   // #233150
const HIGH = [0xf5, 0xa6, 0x23];  // #F5A623
const NO_DATA = '#141d31';

function rampColor(t) {
  const c = LOW.map((lo, i) => Math.round(lo + (HIGH[i] - lo) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function MiniChoropleth({
  values = {}, alerts = [], markers = [], onPolygonClick, onMarkerClick,
  height = 280, valueLabel = 'cases', className = '',
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const handlersRef = useRef({});
  handlersRef.current = { onPolygonClick, onMarkerClick };
  const geo = useKarnatakaGeoJson();

  // The container div only mounts once the GeoJSON is loaded (skeleton shows
  // before that), so map creation must re-check when geo.data arrives — an
  // empty dependency list would run before the div exists and never again.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 0.25,
    });
    map.setView([14.5, 76.2], 6); // placeholder view until fitBounds
    mapRef.current = map;
  }, [geo.data]);

  useEffect(() => () => {
    // unmount only — StrictMode double-mount re-creates cleanly (map.remove()
    // clears the container's _leaflet_id)
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    layersRef.current = [];
  }, []);

  const valuesKey = JSON.stringify(values);
  const alertsKey = JSON.stringify(alerts);
  const markersKey = JSON.stringify(markers);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo.data) return;
    for (const layer of layersRef.current) map.removeLayer(layer);
    layersRef.current = [];

    const max = Math.max(1, ...Object.values(values).map((v) => Number(v) || 0));
    const alertSet = new Set(alerts);

    const geoLayer = L.geoJSON(geo.data, {
      style: (feature) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]) || 0;
        const alerted = alertSet.has(name);
        return {
          fillColor: v > 0 ? rampColor(v / max) : NO_DATA,
          fillOpacity: 0.9,
          color: alerted ? '#E5484D' : '#1E2A44',
          weight: alerted ? 2 : 1,
          className: alerted ? 'alert-poly' : undefined,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]) || 0;
        layer.bindTooltip(
          `<div class="text-xs"><strong>${name}</strong><br/>${fmtInt(v)} ${valueLabel}</div>`,
          { sticky: true, className: 'dappa-tooltip' },
        );
        layer.on('click', () => handlersRef.current.onPolygonClick?.(name, feature));
        layer.on('mouseover', () => layer.setStyle({ weight: 2, color: '#F5A623' }));
        layer.on('mouseout', () => geoLayer.resetStyle(layer));
      },
    }).addTo(map);
    layersRef.current.push(geoLayer);

    for (const m of markers) {
      if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lng))) continue;
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 5,
        color: '#0B1220',
        weight: 1,
        fillColor: '#F5A623',
        fillOpacity: 0.95,
      }).addTo(map);
      if (m.label) {
        marker.bindTooltip(
          `<div class="text-xs"><strong>${m.label}</strong>${m.value !== undefined ? `<br/>${fmtInt(m.value)} ${valueLabel}` : ''}</div>`,
          { sticky: true, className: 'dappa-tooltip' },
        );
      }
      marker.on('click', () => handlersRef.current.onMarkerClick?.(m));
      layersRef.current.push(marker);
    }

    try {
      map.fitBounds(geoLayer.getBounds(), { padding: [8, 8] });
    } catch { /* empty geojson — keep placeholder view */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.data, valuesKey, alertsKey, markersKey, valueLabel]);

  if (geo.isLoading) return <LoadingSkeleton height={height} className={className} />;
  if (geo.error) {
    return (
      <EmptyState
        compact
        className={className}
        title="Map unavailable"
        message="Could not load the Karnataka district GeoJSON."
        action={<button type="button" className="btn" onClick={() => geo.refetch()}>Retry</button>}
      />
    );
  }
  return <div ref={elRef} className={`w-full rounded-lg overflow-hidden ${className}`} style={{ height }} />;
}
