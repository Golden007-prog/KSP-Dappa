// Leaflet mini-map over the Karnataka district outlines (no tile layer — no
// external call) for arcs, circles and points: corridors on /network, crew
// reach on /offenders, near-repeat prediction zones on /map. Same init /
// cleanup discipline as components/MiniChoropleth.jsx.
// Props: arcs [{fromLat,fromLng,toLat,toLng,weight,label}], circles
// [{lat,lng,radiusM,label,tone}], points [{lat,lng,label,tone}], height,
// fit ('all' | 'points' | 'karnataka'), ariaLabel.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useKarnatakaGeoJson } from '../../lib/api.js';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';

const PAL = {
  dark: { fill: '#141d31', border: '#1E2A44', arc: '#F5A623', circle: '#2DD4BF', point: '#E5484D', alt: '#7C9BFF', label: '#E6EAF2' },
  light: { fill: '#EEF2F9', border: '#C9D4E8', arc: '#D97706', circle: '#0F766E', point: '#B42318', alt: '#2563EB', label: '#131B2E' },
};

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function ArcMap({ arcs = [], circles = [], points = [], height = 260, fit = 'all', ariaLabel = '', className = '' }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const geo = useKarnatakaGeoJson();
  const { theme } = useTheme();
  const pal = PAL[theme] || PAL.dark;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25,
    });
    map.setView([14.5, 76.2], 6);
    mapRef.current = map;
  }, [geo.data]);

  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    layersRef.current = [];
  }, []);

  const key = JSON.stringify({ arcs, circles, points, fit, theme });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo.data) return;
    for (const l of layersRef.current) map.removeLayer(l);
    layersRef.current = [];
    const base = L.geoJSON(geo.data, { style: () => ({ fillColor: pal.fill, fillOpacity: 0.9, color: pal.border, weight: 1 }) }).addTo(map);
    layersRef.current.push(base);
    const bounds = [];
    const maxW = Math.max(1, ...arcs.map((a) => Number(a.weight) || 1));
    for (const a of arcs) {
      if (![a.fromLat, a.fromLng, a.toLat, a.toLng].every((v) => Number.isFinite(Number(v)))) continue;
      // A gentle quadratic bend so opposite corridors do not overprint.
      const mid = [(a.fromLat + a.toLat) / 2 + (a.toLng - a.fromLng) * 0.12, (a.fromLng + a.toLng) / 2 - (a.toLat - a.fromLat) * 0.12];
      const pts = [];
      for (let i = 0; i <= 16; i += 1) {
        const s = i / 16;
        const lat = (1 - s) * (1 - s) * a.fromLat + 2 * (1 - s) * s * mid[0] + s * s * a.toLat;
        const lng = (1 - s) * (1 - s) * a.fromLng + 2 * (1 - s) * s * mid[1] + s * s * a.toLng;
        pts.push([lat, lng]);
      }
      const line = L.polyline(pts, { color: pal.arc, weight: 1 + 4 * ((Number(a.weight) || 1) / maxW), opacity: 0.85 }).addTo(map);
      if (a.label) line.bindTooltip(`<div class="text-xs">${escapeHtml(a.label)}</div>`, { sticky: true, className: 'dappa-tooltip' });
      layersRef.current.push(line);
      bounds.push([a.fromLat, a.fromLng], [a.toLat, a.toLng]);
    }
    for (const c of circles) {
      if (!Number.isFinite(Number(c.lat)) || !Number.isFinite(Number(c.lng))) continue;
      const col = c.tone === 'alt' ? pal.alt : pal.circle;
      const circ = L.circle([c.lat, c.lng], { radius: Number(c.radiusM) || 500, color: col, weight: 1.2, fillColor: col, fillOpacity: 0.18 }).addTo(map);
      if (c.label) circ.bindTooltip(`<div class="text-xs">${escapeHtml(c.label)}</div>`, { sticky: true, className: 'dappa-tooltip' });
      layersRef.current.push(circ);
      bounds.push([c.lat, c.lng]);
    }
    for (const p of points) {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) continue;
      const col = p.tone === 'alt' ? pal.alt : p.tone === 'circle' ? pal.circle : pal.point;
      const m = L.circleMarker([p.lat, p.lng], { radius: p.radius || 4, color: pal.label, weight: 0.8, fillColor: col, fillOpacity: 0.95 }).addTo(map);
      if (p.label) m.bindTooltip(`<div class="text-xs">${escapeHtml(p.label)}</div>`, { sticky: true, className: 'dappa-tooltip' });
      layersRef.current.push(m);
      bounds.push([p.lat, p.lng]);
    }
    if (fit === 'karnataka' || !bounds.length) map.fitBounds(base.getBounds(), { padding: [4, 4] });
    else map.fitBounds(L.latLngBounds(bounds).pad(fit === 'points' ? 0.35 : 0.2), { padding: [8, 8], maxZoom: 13 });
  }, [key, geo.data]);

  if (geo.isLoading || !geo.data) return <LoadingSkeleton height={height} />;
  return <div ref={elRef} style={{ height }} className={`rounded-lg overflow-hidden border border-grid ${className}`} role="img" aria-label={ariaLabel} />;
}
