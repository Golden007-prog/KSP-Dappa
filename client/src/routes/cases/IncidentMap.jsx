// Mini Leaflet map for one incident location. OSM tiles are an allowed
// client-side data source (docs/CONTRACTS.md guardrails).
// v2: optional `others` overlay ([{lat,lng,label?,highlight?,id?}]) plots
// related incidents as small teal dots (amber when highlighted as a similar
// match) with auto fit-bounds and a legend; a tileerror notice chip mirrors
// the GeoIntel offline pattern so a dead basemap is called out instead of
// silently rendering a grey void.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import EmptyState from '../../components/EmptyState.jsx';
import PulseDot from '../../components/PulseDot.jsx';

export default function IncidentMap({ lat, lng, label, height = 260, others = [], onOtherClick, othersLabel = 'related incident' }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const clickRef = useRef(onOtherClick);
  clickRef.current = onOtherClick;
  const [tileError, setTileError] = useState(false);
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
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    // One notice per layer instance — mirrors the GeoIntel tileerror pattern.
    let errored = false;
    tiles.on('tileerror', () => {
      if (errored) return;
      errored = true;
      setTileError(true);
    });
    tiles.addTo(map);
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

  // Related-incident overlay — rebuilt whenever the list changes; fits the
  // view to the point cloud (base marker included) and restores the default
  // zoom when the overlay empties.
  const othersKey = JSON.stringify((others || []).map((o) => [o.lat, o.lng, o.highlight ? 1 : 0]));
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const group = L.layerGroup();
    const pts = [];
    for (const o of others || []) {
      const ola = Number(o.lat);
      const oln = Number(o.lng);
      if (!Number.isFinite(ola) || !Number.isFinite(oln) || (ola === 0 && oln === 0)) continue;
      const mk = L.circleMarker([ola, oln], {
        radius: o.highlight ? 6 : 4,
        color: o.highlight ? '#F5A623' : '#2DD4BF',
        weight: o.highlight ? 2 : 1.5,
        fillColor: o.highlight ? '#F5A623' : '#2DD4BF',
        fillOpacity: o.highlight ? 0.85 : 0.45,
      });
      if (o.label) mk.bindTooltip(String(o.label), { className: 'dappa-tooltip' });
      mk.on('click', () => clickRef.current?.(o));
      mk.addTo(group);
      pts.push([ola, oln]);
    }
    group.addTo(map);
    if (pts.length) {
      try {
        map.fitBounds(L.latLngBounds(pts.concat([[la, ln]])).pad(0.2), { maxZoom: 14 });
      } catch { /* degenerate bounds — keep the current view */ }
    } else {
      map.setView([la, ln], 13);
    }
    return () => { map.removeLayer(group); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey, hasCoords, la, ln]);

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
  const shownOthers = (others || []).filter((o) => Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng)));
  const anyHighlight = shownOthers.some((o) => o.highlight);
  return (
    <>
      {/* Leaflet tiles don't rasterize reliably in print — swap for the coords. */}
      <div ref={elRef} className="w-full rounded-lg overflow-hidden border border-grid print:hidden" style={{ height }} />
      {tileError && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-amber print:hidden">
          <PulseDot color="amber" />
          Basemap tiles unreachable — markers still plot on the blank canvas.
        </p>
      )}
      {shownOthers.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted print:hidden" aria-label="Map legend">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber ring-1 ring-signal shrink-0" aria-hidden="true" />this case</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal/70 shrink-0" aria-hidden="true" />{othersLabel}</span>
          {anyHighlight && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber shrink-0" aria-hidden="true" />similar match</span>}
          <span>tap a dot to open that case</span>
        </p>
      )}
      <p className="hidden print:block num text-xs text-muted">
        Incident location: {la.toFixed(5)}, {ln.toFixed(5)} (WGS84)
      </p>
    </>
  );
}
