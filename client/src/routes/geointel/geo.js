// GeoIntel geo helpers: GeoJSON FeatureCollection exports (hotspots /
// stations / incidents as Point features — loads straight into QGIS/Kepler)
// and the nearest-neighbour patrol-route ordering over top hotspots.
import { haversineKm } from './utils.js';

const KIND_FIELDS = {
  hotspots: {
    lat: 'centroidLat',
    lng: 'centroidLng',
    props: ['clusterId', 'label', 'subHeadName', 'districtId', 'caseCount', 'intensity', 'radiusM', 'hourBandStart', 'hourBandEnd'],
  },
  stations: {
    lat: 'lat',
    lng: 'lng',
    props: ['unitId', 'unitName', 'districtId', 'caseCount', 'riskScore'],
  },
  incidents: {
    lat: 'lat',
    lng: 'lng',
    props: ['caseMasterId', 'crimeHeadId', 'crimeSubHeadId', 'registeredDate'],
  },
};

/** Rows of a known kind → GeoJSON FeatureCollection of Point features. */
export function buildFeatureCollection(kind, rows) {
  const def = KIND_FIELDS[kind] || KIND_FIELDS.incidents;
  const features = [];
  for (const r of rows || []) {
    const lat = Number(r[def.lat]);
    const lng = Number(r[def.lng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const properties = {};
    for (const k of def.props) {
      if (r[k] !== undefined && r[k] !== null) properties[k] = r[k];
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  }
  return { type: 'FeatureCollection', features };
}

/** Blob-download a FeatureCollection as <filename>.geojson. */
export function downloadGeoJson(filename, fc) {
  const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.geojson') ? filename : `${filename}.geojson`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PATROL_SPEED_KMH = 30; // typical urban patrol speed for the ETA estimate

/**
 * Nearest-neighbour route over the top `maxStops` hotspots (rows arrive
 * intensity-sorted; the route starts at the most intense cluster). Returns
 * { stops: [{lat,lng,label,legKm}], totalKm, etaMin } or null when no
 * routable hotspots exist. `labelOf` (optional) supplies the localised stop
 * name; without it the raw server label is used.
 */
export function nearestNeighborRoute(hotspots, maxStops = 3, labelOf = null) {
  const sel = (hotspots || [])
    .map((h) => ({
      lat: Number(h.centroidLat),
      lng: Number(h.centroidLng),
      label: (labelOf && labelOf(h))
        || h.label || h.subHeadName || (h.clusterId != null ? `Cluster ${h.clusterId}` : 'Hotspot'),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .slice(0, maxStops);
  if (!sel.length) return null;
  const remaining = [...sel];
  const stops = [{ ...remaining.shift(), legKm: 0 }];
  let totalKm = 0;
  while (remaining.length) {
    const last = stops[stops.length - 1];
    let bestIdx = 0;
    let bestKm = Infinity;
    remaining.forEach((r, i) => {
      const d = haversineKm(last.lat, last.lng, r.lat, r.lng);
      if (d < bestKm) { bestKm = d; bestIdx = i; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    stops.push({ ...next, legKm: bestKm });
    totalKm += bestKm;
  }
  return { stops, totalKm, etaMin: Math.round((totalKm / PATROL_SPEED_KMH) * 60) };
}
