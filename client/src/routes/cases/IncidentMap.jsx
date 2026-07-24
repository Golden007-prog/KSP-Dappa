// Mini Leaflet map for one incident location. OSM tiles are an allowed
// client-side data source (docs/CONTRACTS.md guardrails).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import EmptyState from '../../components/EmptyState.jsx';

export default function IncidentMap({ lat, lng, label, height = 260 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const la = Number(lat);
  const ln = Number(lng);
  const hasCoords = Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0);

  useEffect(() => {
    if (!hasCoords || !elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.setView([la, ln], 13);
    const marker = L.circleMarker([la, ln], {
      radius: 8,
      color: '#E5484D',
      weight: 2,
      fillColor: '#F5A623',
      fillOpacity: 0.9,
    }).addTo(map);
    if (label) marker.bindTooltip(String(label), { className: 'dappa-tooltip' });
    mapRef.current = map;
  }, [hasCoords, la, ln, label]);

  useEffect(() => () => {
    // unmount only — StrictMode double-mount re-creates cleanly
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  if (!hasCoords) {
    return <EmptyState compact title="No coordinates" message="This case has no recorded incident location." />;
  }
  return <div ref={elRef} className="w-full rounded-lg overflow-hidden border border-grid" style={{ height }} />;
}
