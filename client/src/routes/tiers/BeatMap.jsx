// Beat map tile — the station, the hotspot patches within reach and this
// week's FIR points, drawn with Leaflet on a plain background and NO tile
// layer, so it renders offline and inside a station's blocked network
// (docs/ROUND2_FEATURE_BACKLOG.md row 35). Colour is never the only signal:
// the legend names each mark and the aria-label states the counts.
// Props: center {lat,lng}, hotspots [{centroidLat, centroidLng, radiusM,
// subHeadName, thisWeekInside}], cases [{lat, lng, headName}], height?
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useI18n } from '../../lib/i18n.jsx';

const PAL = {
  dark: { bg: '#0B1220', station: '#5B9DFF', stationRing: '#0B1220', hotspot: '#F5A623', hotspotFill: 'rgba(245,166,35,0.14)', hot: '#F25F63', caseFill: '#E6EAF2', caseRing: '#0B1220' },
  light: { bg: '#F3F5FA', station: '#2563EB', stationRing: '#FFFFFF', hotspot: '#92400E', hotspotFill: 'rgba(146,64,14,0.12)', hot: '#B42318', caseFill: '#131B2E', caseRing: '#FFFFFF' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function BeatMap({ center, hotspots = [], cases = [], height = 220, className = '' }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const pal = PAL[theme] || PAL.dark;
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: true, tap: true,
      keyboard: true,
    });
    // A view must exist before any circle can report bounds (Leaflet projects
    // through the map's zoom); Karnataka's centre is the placeholder.
    map.setView([15.3, 75.7], 6, { animate: false });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }
    map.getContainer().style.background = pal.bg;
    const group = L.featureGroup();
    const lat = Number(center?.lat);
    const lng = Number(center?.lng);
    const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);
    for (const h of hotspots) {
      const hl = Number(h.centroidLat);
      const hn = Number(h.centroidLng);
      if (!Number.isFinite(hl) || !Number.isFinite(hn)) continue;
      const active = Number(h.thisWeekInside) > 0;
      L.circle([hl, hn], {
        radius: Math.max(150, Number(h.radiusM) || 300),
        color: active ? pal.hot : pal.hotspot, weight: 1.5, dashArray: active ? undefined : '4 3',
        fillColor: pal.hotspotFill, fillOpacity: 1,
      }).bindTooltip(`${esc(h.subHeadName || h.headName)} · ${esc(h.caseCount)} · ${esc(h.distanceKm ?? '—')} km`, { direction: 'top' }).addTo(group);
    }
    for (const c of cases) {
      const cl = Number(c.lat);
      const cn = Number(c.lng);
      if (!Number.isFinite(cl) || !Number.isFinite(cn)) continue;
      L.circleMarker([cl, cn], { radius: 4, color: pal.caseRing, weight: 1, fillColor: pal.caseFill, fillOpacity: 0.95 })
        .bindTooltip(`${esc(c.headName)} · ${esc(c.registeredDate)}`, { direction: 'top' }).addTo(group);
    }
    if (hasCenter) {
      L.circleMarker([lat, lng], { radius: 8, color: pal.stationRing, weight: 2, fillColor: pal.station, fillOpacity: 1 })
        .bindTooltip(t('tier.beat.map.station'), { direction: 'top', permanent: false }).addTo(group);
    }
    group.addTo(map);
    layerRef.current = group;
    let b = null;
    try { b = group.getBounds(); } catch { b = null; }
    if (b && b.isValid()) map.fitBounds(b.pad(0.25), { animate: false, maxZoom: 14 });
    else if (hasCenter) map.setView([lat, lng], 13, { animate: false });
    setTimeout(() => { try { map.invalidateSize(); } catch { /* unmounted */ } }, 0);
  }, [center, hotspots, cases, pal, t]);

  return (
    <div className={className}>
      <div
        ref={elRef}
        role="img"
        aria-label={t('tier.beat.map.aria', { hotspots: hotspots.length, cases: cases.length })}
        style={{ height }}
        className="w-full rounded-lg border border-grid overflow-hidden"
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-hidden="true">
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2" style={{ background: pal.station, borderColor: pal.stationRing }} />{t('tier.beat.map.station')}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-dashed" style={{ borderColor: pal.hotspot, background: pal.hotspotFill }} />{t('tier.beat.map.hotspot')}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: pal.caseFill }} />{t('tier.beat.map.case')}</li>
      </ul>
    </div>
  );
}
