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

/** Stop-count choices offered by the patrol controls. */
export const PATROL_STOP_COUNTS = [3, 4, 5, 6, 8];

/** Path length in km through an ordered stop list (optionally closing the loop). */
function pathKm(order, roundTrip = false) {
  let km = 0;
  for (let i = 1; i < order.length; i += 1) {
    km += haversineKm(order[i - 1].lat, order[i - 1].lng, order[i].lat, order[i].lng);
  }
  if (roundTrip && order.length > 2) {
    km += haversineKm(order[order.length - 1].lat, order[order.length - 1].lng, order[0].lat, order[0].lng);
  }
  return km;
}

/**
 * 2-opt improvement over an ordered tour: repeatedly reverse the segment
 * between two stops whenever that shortens the path. The first stop is pinned
 * (the patrol starts at the most intense cluster), so only interior edges move.
 * Converges in a handful of sweeps at these sizes (<= 8 stops).
 */
function twoOpt(order, roundTrip = false) {
  if (order.length < 4) return order;
  let best = [...order];
  let bestKm = pathKm(best, roundTrip);
  for (let sweep = 0; sweep < 12; sweep += 1) {
    let improved = false;
    for (let i = 1; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const km = pathKm(cand, roundTrip);
        if (km < bestKm - 1e-9) {
          best = cand;
          bestKm = km;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * Patrol route over the top `maxStops` hotspots (rows arrive intensity-sorted;
 * the route starts at the most intense cluster). Nearest-neighbour ordering by
 * default; `opts.optimize` runs a 2-opt pass on top and reports the km saved,
 * `opts.roundTrip` closes the loop back to the first stop.
 *
 * Returns { stops: [{lat,lng,label,legKm}], totalKm, etaMin, savedKm,
 * roundTrip, closingKm } or null when no routable hotspots exist. `labelOf`
 * (optional) supplies the localised stop name.
 */
export function nearestNeighborRoute(hotspots, maxStops = 3, labelOf = null, opts = {}) {
  const sel = (hotspots || [])
    .map((h) => ({
      lat: Number(h.centroidLat),
      lng: Number(h.centroidLng),
      label: (labelOf && labelOf(h))
        || h.label || h.subHeadName || (h.clusterId != null ? `Cluster ${h.clusterId}` : 'Hotspot'),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .slice(0, Math.max(2, Number(maxStops) || 3));
  if (!sel.length) return null;
  const roundTrip = !!opts.roundTrip;
  const remaining = [...sel];
  let order = [remaining.shift()];
  while (remaining.length) {
    const last = order[order.length - 1];
    let bestIdx = 0;
    let bestKm = Infinity;
    remaining.forEach((r, i) => {
      const d = haversineKm(last.lat, last.lng, r.lat, r.lng);
      if (d < bestKm) { bestKm = d; bestIdx = i; }
    });
    order.push(remaining.splice(bestIdx, 1)[0]);
  }
  const nnKm = pathKm(order, roundTrip);
  let savedKm = 0;
  if (opts.optimize) {
    order = twoOpt(order, roundTrip);
    savedKm = Math.max(0, nnKm - pathKm(order, roundTrip));
  }
  const stops = order.map((s, i) => ({
    ...s,
    legKm: i === 0 ? 0 : haversineKm(order[i - 1].lat, order[i - 1].lng, s.lat, s.lng),
  }));
  const closingKm = roundTrip && stops.length > 2
    ? haversineKm(stops[stops.length - 1].lat, stops[stops.length - 1].lng, stops[0].lat, stops[0].lng)
    : 0;
  const totalKm = stops.reduce((a, s) => a + s.legKm, 0) + closingKm;
  return {
    stops,
    totalKm,
    etaMin: Math.round((totalKm / PATROL_SPEED_KMH) * 60),
    savedKm,
    roundTrip,
    closingKm,
  };
}
