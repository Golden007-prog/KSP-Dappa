// KSP DAPPA — police-unit → map-polygon mapping (pinned in docs/CONTRACTS.md).
// 38 police units (33 districts + 5 city commissionerates) map onto the 30
// 2011-census district polygons in public/data/karnataka_districts.geojson
// (feature property `district`). Commissionerates share their parent polygon;
// a choropleth SUMS every unit mapped to a polygon. City units additionally
// get a clickable circle marker at their Appendix C coordinates.

export const UNITS = [
  { unitId: '0101', name: 'Bengaluru City', polygon: 'Bengaluru Urban', lat: 12.972, lng: 77.594 },
  { unitId: '0102', name: 'Bengaluru District', polygon: 'Bengaluru Rural', lat: 13.1, lng: 77.4 },
  { unitId: '0103', name: 'Mysuru City', polygon: 'Mysuru', lat: 12.296, lng: 76.639 },
  { unitId: '0104', name: 'Mysuru District', polygon: 'Mysuru', lat: 12.4, lng: 76.5 },
  { unitId: '0105', name: 'Mangaluru City', polygon: 'Dakshina Kannada', lat: 12.87, lng: 74.843 },
  { unitId: '0106', name: 'Dakshina Kannada', polygon: 'Dakshina Kannada', lat: 12.84, lng: 75.25 },
  { unitId: '0107', name: 'Hubballi-Dharwad City', polygon: 'Dharwad', lat: 15.365, lng: 75.124 },
  { unitId: '0108', name: 'Dharwad District', polygon: 'Dharwad', lat: 15.46, lng: 75.01 },
  { unitId: '0109', name: 'Belagavi City', polygon: 'Belagavi', lat: 15.85, lng: 74.5 },
  { unitId: '0110', name: 'Belagavi District', polygon: 'Belagavi', lat: 16.1, lng: 74.8 },
  { unitId: '0111', name: 'Kalaburagi', polygon: 'Kalaburagi', lat: 17.329, lng: 76.834 },
  { unitId: '0112', name: 'Ballari', polygon: 'Ballari', lat: 15.139, lng: 76.921 },
  { unitId: '0113', name: 'Vijayapura', polygon: 'Vijayapura', lat: 16.83, lng: 75.71 },
  { unitId: '0114', name: 'Davanagere', polygon: 'Davanagere', lat: 14.464, lng: 75.921 },
  { unitId: '0115', name: 'Shivamogga', polygon: 'Shivamogga', lat: 13.93, lng: 75.56 },
  { unitId: '0116', name: 'Tumakuru', polygon: 'Tumakuru', lat: 13.34, lng: 77.101 },
  { unitId: '0117', name: 'Udupi', polygon: 'Udupi', lat: 13.34, lng: 74.747 },
  { unitId: '0118', name: 'Hassan', polygon: 'Hassan', lat: 13.005, lng: 76.103 },
  { unitId: '0119', name: 'Chikkamagaluru', polygon: 'Chikkamagaluru', lat: 13.316, lng: 75.775 },
  { unitId: '0120', name: 'Kodagu', polygon: 'Kodagu', lat: 12.42, lng: 75.74 },
  { unitId: '0121', name: 'Chamarajanagar', polygon: 'Chamarajanagara', lat: 11.926, lng: 76.94 },
  { unitId: '0122', name: 'Mandya', polygon: 'Mandya', lat: 12.523, lng: 76.897 },
  { unitId: '0123', name: 'Kolar', polygon: 'Kolar', lat: 13.137, lng: 78.13 },
  { unitId: '0124', name: 'Chikkaballapur', polygon: 'Chikkaballapura', lat: 13.435, lng: 77.728 },
  { unitId: '0125', name: 'Ramanagara', polygon: 'Ramanagara', lat: 12.72, lng: 77.28 },
  { unitId: '0126', name: 'Bagalkot', polygon: 'Bagalkote', lat: 16.18, lng: 75.7 },
  { unitId: '0127', name: 'Gadag', polygon: 'Gadag', lat: 15.43, lng: 75.63 },
  { unitId: '0128', name: 'Haveri', polygon: 'Haveri', lat: 14.795, lng: 75.4 },
  { unitId: '0129', name: 'Uttara Kannada', polygon: 'Uttara Kannada', lat: 14.8, lng: 74.13 },
  { unitId: '0130', name: 'Raichur', polygon: 'Raichur', lat: 16.207, lng: 77.356 },
  { unitId: '0131', name: 'Koppal', polygon: 'Koppal', lat: 15.35, lng: 76.15 },
  { unitId: '0132', name: 'Yadgir', polygon: 'Yadgir', lat: 16.77, lng: 77.14 },
  { unitId: '0133', name: 'Bidar', polygon: 'Bidar', lat: 17.913, lng: 77.53 },
  { unitId: '0134', name: 'Chitradurga', polygon: 'Chitradurga', lat: 14.23, lng: 76.4 },
  { unitId: '0135', name: 'Kodagu-Virajpet', polygon: 'Kodagu', lat: 12.2, lng: 75.8 },
  { unitId: '0136', name: 'KGF', polygon: 'Kolar', lat: 12.965, lng: 78.27 },
  { unitId: '0137', name: 'Vijayanagara', polygon: 'Ballari', lat: 15.27, lng: 76.39 },
  { unitId: '0138', name: 'Bengaluru Rural South', polygon: 'Bengaluru Rural', lat: 12.7, lng: 77.5 },
];

export const UNIT_TO_POLYGON = Object.fromEntries(UNITS.map((u) => [u.unitId, u.polygon]));

export const POLYGON_NAMES = [...new Set(UNITS.map((u) => u.polygon))];

/** City commissionerates — render a clickable circle marker on top of the shared polygon. */
export const CITY_UNIT_IDS = ['0101', '0103', '0105', '0107', '0109'];

/** Accepts '0101', '101', 101 … → canonical 4-digit string code. */
export function normalizeUnitCode(id) {
  if (id === undefined || id === null || id === '') return null;
  return String(id).trim().padStart(4, '0');
}

/** Polygon (GeoJSON `district` property) for a police unit code, or null. */
export function polygonForUnit(unitId) {
  const code = normalizeUnitCode(unitId);
  return (code && UNIT_TO_POLYGON[code]) || null;
}

/** All police unit codes that map onto a polygon name (1..3 units). */
export function unitsForPolygon(polygonName) {
  return UNITS.filter((u) => u.polygon === polygonName).map((u) => u.unitId);
}

/** Full unit record ({unitId,name,polygon,lat,lng}) or null. */
export function unitInfo(unitId) {
  const code = normalizeUnitCode(unitId);
  return UNITS.find((u) => u.unitId === code) || null;
}

/**
 * Sum a numeric field of API rows per polygon.
 * rows: array; opts.getUnit(row) → unit code (default row.districtId ?? row.unitId);
 * opts.getValue(row) → number (default row.caseCount ?? row.count ?? 0).
 * Returns plain object { [polygonName]: sum } — feed straight into <MiniChoropleth values={...}>.
 */
export function aggregateCountsPerPolygon(rows, opts = {}) {
  const getUnit = opts.getUnit || ((r) => r.districtId ?? r.unitId);
  const getValue = opts.getValue || ((r) => r.caseCount ?? r.count ?? 0);
  const acc = {};
  for (const r of rows || []) {
    const polygon = polygonForUnit(getUnit(r));
    if (!polygon) continue;
    acc[polygon] = (acc[polygon] || 0) + (Number(getValue(r)) || 0);
  }
  return acc;
}

/** Group raw rows per polygon: { [polygonName]: row[] } (for drill-downs / tooltips). */
export function groupRowsPerPolygon(rows, getUnit = (r) => r.districtId ?? r.unitId) {
  const acc = {};
  for (const r of rows || []) {
    const polygon = polygonForUnit(getUnit(r));
    if (!polygon) continue;
    (acc[polygon] = acc[polygon] || []).push(r);
  }
  return acc;
}
