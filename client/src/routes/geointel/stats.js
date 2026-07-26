// GeoIntel spatial statistics — pure helpers, no React, no network. Everything
// here runs against the incident / station / hotspot rows the route already
// loaded from the live API, so nothing depends on fixtures.
//
// Contents:
//   · equirectangular square-grid binning of incident points (kernel-free
//     density surface that stays honest about cell size);
//   · Getis-Ord Gi* local hot/cold-spot z-scores over that grid (the classic
//     statistical spatial-hotspot test, 3x3 queen weights including self);
//   · concentration measures (top-cell share, Gini) for "how clustered is this
//     crime, really";
//   · nearest-station catchment allocation + coverage-gap detection;
//   · hotspot co-location (clusters whose footprints touch).
//
// Volumes are live-scale: 2 000 incident points x 359 stations is the worst
// case, so the nearest-station search screens with a cheap planar distance and
// only pays for haversine on the winner.
import { haversineKm } from './utils.js';

// Metres per degree at Karnataka's latitude band. Using a fixed reference
// latitude keeps every grid cell the same size in degrees, which is what makes
// the Gi* neighbour window a regular lattice.
const KM_PER_DEG_LAT = 110.574;
const REF_LAT = 15.0; // Karnataka spans ~11.6–18.5°N; 15° is the area centroid
const KM_PER_DEG_LNG = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);

/** Cell sizes offered by the grid controls (km). */
export const GRID_SIZES = [2, 5, 10, 25];

/** Gi* two-tailed significance cut-offs (95% / 99%). */
const Z_95 = 1.96;
const Z_99 = 2.58;

/** Gi* z-score → 'hot99' | 'hot95' | 'cold95' | 'cold99' | null. */
export function giBand(z) {
  if (!Number.isFinite(z)) return null;
  if (z >= Z_99) return 'hot99';
  if (z >= Z_95) return 'hot95';
  if (z <= -Z_99) return 'cold99';
  if (z <= -Z_95) return 'cold95';
  return null;
}

/** Fill colour for a Gi* band (shared by the map layer and the legend). */
export const GI_COLORS = {
  hot99: '#E5484D',
  hot95: '#F5A623',
  cold95: '#5B9DFF',
  cold99: '#2DD4BF',
};

// A study area larger than this stops being a sensible lattice (and a Gi* pass
// over it would cost more than the insight is worth) — the grid still renders,
// only the z-scores are withheld.
const MAX_STUDY_CELLS = 400000;

/**
 * Bin points into a square grid and score every occupied cell with Gi*.
 *
 * points: [{lat,lng}]; cellKm: cell edge in kilometres.
 * Returns {
 *   cells: [{key,i,j,south,west,north,east,lat,lng,count,z,band}],  // occupied only
 *   cellKm, total, occupied, studyCells, max,
 *   top10Share,   // share of incidents inside the ten busiest cells (0..1)
 *   gini,         // concentration of counts across occupied cells (0..1)
 *   hot95, hot99, // significant-cell tallies
 *   giSkipped     // true when the study area was too large to score
 * }
 */
export function buildGrid(points, cellKm = 5) {
  const km = Number(cellKm) > 0 ? Number(cellKm) : 5;
  const dLat = km / KM_PER_DEG_LAT;
  const dLng = km / KM_PER_DEG_LNG;
  const empty = {
    cells: [], cellKm: km, total: 0, occupied: 0, studyCells: 0, max: 0,
    top10Share: null, gini: null, hot95: 0, hot99: 0, giSkipped: false,
  };
  const pts = [];
  for (const p of points || []) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
  }
  if (!pts.length) return empty;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  // Snap the origin to the global lattice so the same cellKm always produces
  // the same cells regardless of which subset of incidents is loaded.
  const i0 = Math.floor(minLng / dLng);
  const j0 = Math.floor(minLat / dLat);
  const w = Math.floor(maxLng / dLng) - i0 + 1;
  const h = Math.floor(maxLat / dLat) - j0 + 1;
  const n = w * h;
  if (!Number.isFinite(n) || n <= 0) return empty;

  const giSkipped = n > MAX_STUDY_CELLS;
  const counts = new Float64Array(giSkipped ? 0 : n);
  const sparse = new Map(); // key -> count (always built; drives the render)
  for (const [lat, lng] of pts) {
    const i = Math.floor(lng / dLng) - i0;
    const j = Math.floor(lat / dLat) - j0;
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const idx = j * w + i;
    if (!giSkipped) counts[idx] += 1;
    sparse.set(idx, (sparse.get(idx) || 0) + 1);
  }

  const total = pts.length;
  // Gi* needs the mean and sd across the whole study lattice, zeros included.
  let mean = 0;
  let sd = 0;
  if (!giSkipped) {
    mean = total / n;
    let sumSq = 0;
    for (const v of sparse.values()) sumSq += v * v;
    sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  }

  const cells = [];
  let max = 0;
  let hot95 = 0;
  let hot99 = 0;
  for (const [idx, count] of sparse.entries()) {
    const i = idx % w;
    const j = (idx - i) / w;
    const west = (i0 + i) * dLng;
    const south = (j0 + j) * dLat;
    let z = null;
    if (!giSkipped && sd > 0) {
      // 3x3 window (queen contiguity + self), clipped at the lattice edge.
      let local = 0;
      let k = 0;
      for (let jj = Math.max(0, j - 1); jj <= Math.min(h - 1, j + 1); jj += 1) {
        for (let ii = Math.max(0, i - 1); ii <= Math.min(w - 1, i + 1); ii += 1) {
          local += counts[jj * w + ii];
          k += 1;
        }
      }
      const denom = sd * Math.sqrt(Math.max(1e-12, (n * k - k * k) / (n - 1 || 1)));
      z = denom > 0 ? (local - mean * k) / denom : 0;
    }
    const band = giBand(z);
    if (band === 'hot95') hot95 += 1;
    if (band === 'hot99') hot99 += 1;
    if (count > max) max = count;
    cells.push({
      key: `${i0 + i}:${j0 + j}`,
      i: i0 + i,
      j: j0 + j,
      south,
      west,
      north: south + dLat,
      east: west + dLng,
      lat: south + dLat / 2,
      lng: west + dLng / 2,
      count,
      z,
      band,
    });
  }
  cells.sort((a, b) => b.count - a.count || (b.z ?? 0) - (a.z ?? 0));

  const sortedCounts = cells.map((c) => c.count);
  const top10Share = total > 0
    ? sortedCounts.slice(0, 10).reduce((a, v) => a + v, 0) / total
    : null;

  return {
    cells,
    cellKm: km,
    total,
    occupied: cells.length,
    studyCells: n,
    max,
    top10Share,
    gini: giniIndex(sortedCounts),
    hot95,
    hot99,
    giSkipped,
  };
}

/**
 * Gini concentration of a value list (0 = every cell equal, 1 = one cell holds
 * everything). Null for fewer than two values.
 */
export function giniIndex(values) {
  const xs = (values || []).map(Number).filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  if (n < 2) return null;
  const sum = xs.reduce((a, v) => a + v, 0);
  if (sum <= 0) return null;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * xs[i];
  return Math.max(0, Math.min(1, (2 * weighted) / (n * sum) - (n + 1) / n));
}

/** Grid cells → GeoJSON FeatureCollection of square Polygons (QGIS-ready). */
export function gridFeatureCollection(cells) {
  const features = (cells || []).map((c) => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [c.west, c.south], [c.east, c.south], [c.east, c.north], [c.west, c.north], [c.west, c.south],
      ]],
    },
    properties: {
      cellId: c.key,
      count: c.count,
      giZScore: c.z === null || c.z === undefined ? null : Number(c.z.toFixed(3)),
      significance: c.band || '',
      centroidLat: Number(c.lat.toFixed(5)),
      centroidLng: Number(c.lng.toFixed(5)),
    },
  }));
  return { type: 'FeatureCollection', features };
}

// Planar screening distance (squared km) — good enough to pick the nearest
// station out of a few hundred; the winner is re-measured with haversine.
function planarSq(aLat, aLng, bLat, bLng) {
  const dy = (aLat - bLat) * KM_PER_DEG_LAT;
  const dx = (aLng - bLng) * KM_PER_DEG_LNG;
  return dy * dy + dx * dx;
}

/**
 * Allocate every incident to its nearest police station (the operational
 * catchment each station actually absorbs, independent of jurisdiction lines).
 *
 * Returns {
 *   rows: [{unitId,unitName,districtId,lat,lng,count,share,meanKm,maxKm,caseCount,riskScore}],
 *   links: [[incLat,incLng,stLat,stLng]],   // capped spider lines
 *   gaps:  [{lat,lng,km,unitName}],          // incidents beyond gapKm of any station
 *   assigned, unassigned, meanKm, gapKm, linkCap
 * }
 */
export function buildCatchment(incidents, stations, { gapKm = 5, linkCap = 700 } = {}) {
  const sts = [];
  for (const s of stations || []) {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) sts.push({ ...s, lat, lng });
  }
  const base = {
    rows: [], links: [], gaps: [], assigned: 0, unassigned: 0, meanKm: null, gapKm, linkCap,
  };
  if (!sts.length) return base;

  const acc = new Map();
  const links = [];
  const gaps = [];
  let sumKm = 0;
  let assigned = 0;
  const stride = Math.max(1, Math.ceil((incidents || []).length / linkCap));
  let seen = 0;
  for (const r of incidents || []) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    let best = null;
    let bestSq = Infinity;
    for (const s of sts) {
      const d = planarSq(lat, lng, s.lat, s.lng);
      if (d < bestSq) { bestSq = d; best = s; }
    }
    if (!best) continue;
    const km = haversineKm(lat, lng, best.lat, best.lng);
    const key = String(best.unitId);
    let a = acc.get(key);
    if (!a) {
      a = { station: best, count: 0, sumKm: 0, maxKm: 0 };
      acc.set(key, a);
    }
    a.count += 1;
    a.sumKm += km;
    if (km > a.maxKm) a.maxKm = km;
    assigned += 1;
    sumKm += km;
    if (km > gapKm) gaps.push({ lat, lng, km, unitName: best.unitName });
    // Thin the spider lines evenly rather than truncating — a capped sample
    // that still covers the whole state reads far more honestly.
    if (seen % stride === 0 && links.length < linkCap) links.push([lat, lng, best.lat, best.lng]);
    seen += 1;
  }

  const rows = [...acc.values()].map((a) => ({
    unitId: String(a.station.unitId),
    unitName: a.station.unitName,
    districtId: a.station.districtId,
    lat: a.station.lat,
    lng: a.station.lng,
    caseCount: Number(a.station.caseCount) || 0,
    riskScore: a.station.riskScore ?? null,
    count: a.count,
    share: assigned > 0 ? a.count / assigned : 0,
    meanKm: a.count > 0 ? a.sumKm / a.count : 0,
    maxKm: a.maxKm,
  })).sort((x, y) => y.count - x.count);

  gaps.sort((x, y) => y.km - x.km);
  return {
    rows,
    links,
    gaps: gaps.slice(0, 400),
    gapTotal: gaps.length,
    assigned,
    unassigned: 0,
    meanKm: assigned > 0 ? sumKm / assigned : null,
    gapKm,
    linkCap,
  };
}

/** Coverage-gap threshold options (km). */
export const GAP_KMS = [3, 5, 10, 15];

/**
 * Nearest station to a point, with its distance. Returns {station, km} or null.
 */
export function nearestStation(lat, lng, stations) {
  let best = null;
  let bestSq = Infinity;
  for (const s of stations || []) {
    const sLat = Number(s.lat);
    const sLng = Number(s.lng);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
    const d = planarSq(lat, lng, sLat, sLng);
    if (d < bestSq) { bestSq = d; best = s; }
  }
  if (!best) return null;
  return { station: best, km: haversineKm(lat, lng, Number(best.lat), Number(best.lng)) };
}

/**
 * Hotspot pairs close enough that their footprints interact — a compound zone
 * one patrol can cover. `slackKm` is added to the sum of the two radii.
 * Returns [{a,b,km,overlap}] sorted by distance.
 */
export function coLocatedClusters(hotspots, slackKm = 1.5) {
  const hs = (hotspots || []).map((h) => ({
    row: h,
    lat: Number(h.centroidLat),
    lng: Number(h.centroidLng),
    rKm: Math.max(0.3, (Number(h.radiusM) || 0) / 1000),
  })).filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng));
  const out = [];
  for (let i = 0; i < hs.length; i += 1) {
    for (let j = i + 1; j < hs.length; j += 1) {
      const km = haversineKm(hs[i].lat, hs[i].lng, hs[j].lat, hs[j].lng);
      const reach = hs[i].rKm + hs[j].rKm + slackKm;
      if (km <= reach) {
        out.push({
          a: hs[i].row,
          b: hs[j].row,
          aLat: hs[i].lat,
          aLng: hs[i].lng,
          bLat: hs[j].lat,
          bLng: hs[j].lng,
          km,
          overlap: km <= hs[i].rKm + hs[j].rKm,
        });
      }
    }
  }
  return out.sort((x, y) => x.km - y.km);
}

/** Whether a lat/lng falls inside a {north,south,east,west} box. */
export function inBounds(lat, lng, b) {
  if (!b) return true;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= b.south && la <= b.north && ln >= b.west && ln <= b.east;
}

/** Bounding box of [{lat,lng}] rows → {north,south,east,west} or null. */
export function boundsOf(rowSets) {
  let n = -Infinity;
  let s = Infinity;
  let e = -Infinity;
  let w = Infinity;
  let any = false;
  for (const rows of rowSets || []) {
    for (const r of rows || []) {
      const lat = Number(r.lat ?? r.centroidLat);
      const lng = Number(r.lng ?? r.centroidLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      any = true;
      if (lat > n) n = lat;
      if (lat < s) s = lat;
      if (lng > e) e = lng;
      if (lng < w) w = lng;
    }
  }
  return any ? { north: n, south: s, east: e, west: w } : null;
}

/**
 * Terciles of a numeric list → [t1, t2] cut points (null when too few values).
 * Used to class the bivariate choropleth.
 */
export function terciles(values) {
  const xs = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const at = (q) => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(q * (xs.length - 1))))];
  return [at(1 / 3), at(2 / 3)];
}

/** value + tercile cuts → class index 0|1|2. */
export function tercileClass(v, cuts) {
  const n = Number(v);
  if (!Number.isFinite(n) || !cuts) return 0;
  if (n > cuts[1]) return 2;
  if (n > cuts[0]) return 1;
  return 0;
}

// 3x3 bivariate palette: X axis = crime rate (left → right), Y axis =
// urbanisation (bottom → top). Indexed [urbanClass][rateClass]. Tuned to stay
// legible over both the dark and the plain-OSM basemap.
export const BIVARIATE_PALETTE = [
  ['#d9e6ec', '#a3c3cf', '#5aa1b4'],
  ['#dfc4d6', '#a89fb8', '#5f83a4'],
  ['#e0a0b4', '#b47f9c', '#6b5f8c'],
];

/** Bivariate fill for (rate, urbanisation) class pair. */
export function bivariateColor(rateClass, urbanClass) {
  const row = BIVARIATE_PALETTE[Math.max(0, Math.min(2, urbanClass))] || BIVARIATE_PALETTE[0];
  return row[Math.max(0, Math.min(2, rateClass))] || row[0];
}

/**
 * Weekday index of an ISO date string using the same 0=Sunday convention the
 * server's seasonality matrix uses. Returns -1 when unparseable.
 */
export function weekdayOf(iso) {
  if (!iso) return -1;
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return -1;
  // Constructed as UTC so a browser east/west of the server never shifts a
  // date-only value onto the neighbouring day.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? -1 : d.getUTCDay();
}
