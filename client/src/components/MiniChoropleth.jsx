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
import { useTheme } from './ThemeProvider.jsx';
import { fmtInt } from '../lib/format.js';

// density ramp + chrome per app theme (dark stays the original command-center look)
export const PALETTES = {
  dark: {
    low: [0x23, 0x31, 0x50], high: [0xf5, 0xa6, 0x23], noData: '#141d31',
    border: '#1E2A44', hover: '#F5A623', alert: '#E5484D', markerRing: '#0B1220', markerFill: '#F5A623',
  },
  light: {
    low: [0xdb, 0xe4, 0xf5], high: [0xd9, 0x77, 0x06], noData: '#EEF2F9',
    border: '#C9D4E8', hover: '#B45309', alert: '#B42318', markerRing: '#FFFFFF', markerFill: '#D97706',
  },
};

function rampColor(t, pal) {
  const c = pal.low.map((lo, i) => Math.round(lo + (pal.high[i] - lo) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// bindTooltip takes an HTML string — escape data-derived text (district names
// from the GeoJSON, marker labels) so markup in a value can never execute.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

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
  const { theme } = useTheme();
  const pal = PALETTES[theme] || PALETTES.dark;

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
          fillColor: v > 0 ? rampColor(v / max, pal) : pal.noData,
          fillOpacity: 0.9,
          color: alerted ? pal.alert : pal.border,
          weight: alerted ? 2 : 1,
          className: alerted ? 'alert-poly' : undefined,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature?.properties?.district;
        const v = Number(values[name]) || 0;
        layer.bindTooltip(
          `<div class="text-xs"><strong>${escapeHtml(name)}</strong><br/>${fmtInt(v)} ${escapeHtml(valueLabel)}</div>`,
          { sticky: true, className: 'dappa-tooltip' },
        );
        layer.on('click', () => handlersRef.current.onPolygonClick?.(name, feature));
        layer.on('mouseover', () => layer.setStyle({ weight: 2, color: pal.hover }));
        layer.on('mouseout', () => geoLayer.resetStyle(layer));
      },
    }).addTo(map);
    layersRef.current.push(geoLayer);

    for (const m of markers) {
      if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lng))) continue;
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 5,
        color: pal.markerRing,
        weight: 1,
        fillColor: pal.markerFill,
        fillOpacity: 0.95,
      }).addTo(map);
      if (m.label) {
        marker.bindTooltip(
          `<div class="text-xs"><strong>${escapeHtml(m.label)}</strong>${m.value !== undefined ? `<br/>${fmtInt(m.value)} ${escapeHtml(valueLabel)}` : ''}</div>`,
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
  }, [geo.data, valuesKey, alertsKey, markersKey, valueLabel, theme]);

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
