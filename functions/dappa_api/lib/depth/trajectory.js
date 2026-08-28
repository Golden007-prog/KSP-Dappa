'use strict';
// Emerging-hotspot trajectories over a monthly Gi* series on a fixed lattice:
//   trajectory()  per-cell class (new / consecutive / persistent / intensifying /
//                 diminishing / sporadic / oscillating / historical) over N months
//   stability     Jaccard overlap of the top-10 cells month to month
//   twoPeriod     Gi* class change per cell, first half vs second half
// Pure over [{ day, ym, lat, lng }] rows; the lattice is shared by every month so
// a cell keeps its identity across the series.

const { round } = require('../util');
const { latticeFor, cellOf, cellCentre, giStar, giBand, kendallTau, Z_95 } = require('./common');

function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  if (!A.size && !B.size) return null;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return round(inter / (A.size + B.size - inter), 3);
}

function classify(hot, cold, zs) {
  const n = hot.length;
  const hotMonths = hot.filter(Boolean).length;
  if (!hotMonths) return null;
  const lastHot = hot[n - 1];
  const persistentShare = hotMonths / n;
  // Run of hot months ending now.
  let run = 0;
  for (let i = n - 1; i >= 0 && hot[i]; i -= 1) run += 1;
  const hotBeforeRun = hot.slice(0, n - run).some(Boolean);
  const tau = kendallTau(zs);
  if (persistentShare >= 0.9) {
    if (tau !== null && tau >= 0.3) return 'intensifying';
    if (tau !== null && tau <= -0.3) return 'diminishing';
    return 'persistent';
  }
  if (lastHot && hotMonths === 1) return 'new';
  if (lastHot && run >= 2 && !hotBeforeRun) return 'consecutive';
  if (cold.some(Boolean)) return 'oscillating';
  if (!lastHot && !hot[n - 2] && hotMonths >= 2) return 'historical';
  return 'sporadic';
}

const CLASSES = ['new', 'consecutive', 'persistent', 'intensifying', 'diminishing', 'sporadic', 'oscillating', 'historical'];

function trajectory(rows, months, cellKm) {
  const pts = rows.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && months.includes(r.ym));
  const lat0 = latticeFor(pts, cellKm);
  if (!lat0 || lat0.n > 400000) {
    return { months, cellKm, cells: [], classes: CLASSES.map((c) => ({ cls: c, cells: 0 })), stability: { series: [], mean: null }, twoPeriod: null, scan: { points: pts.length, lattice: lat0 ? lat0.n : 0, skipped: true } };
  }
  const perMonth = months.map(() => new Map());
  const overall = new Map();
  for (const p of pts) {
    const idx = cellOf(p.lat, p.lng, lat0);
    if (idx < 0) continue;
    const m = months.indexOf(p.ym);
    perMonth[m].set(idx, (perMonth[m].get(idx) || 0) + 1);
    overall.set(idx, (overall.get(idx) || 0) + 1);
  }
  const zByMonth = perMonth.map((counts) => giStar(counts, lat0));
  const top10 = perMonth.map((counts) => [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10).map(([idx]) => idx));
  const stabilitySeries = [];
  for (let m = 1; m < months.length; m += 1) {
    stabilitySeries.push({ ym: months[m], prevYm: months[m - 1], jaccard: jaccard(top10[m - 1], top10[m]) });
  }
  const jac = stabilitySeries.map((s) => s.jaccard).filter((v) => v !== null);

  const cells = [];
  const tally = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (const idx of overall.keys()) {
    const zs = months.map((_, m) => (perMonth[m].has(idx) ? zByMonth[m].get(idx) : zNeighbourhood(idx, perMonth[m], zByMonth[m], lat0)));
    const hot = zs.map((z) => Number.isFinite(z) && z >= Z_95);
    const cold = zs.map((z) => Number.isFinite(z) && z <= -Z_95);
    const cls = classify(hot, cold, zs);
    if (!cls) continue;
    tally[cls] += 1;
    const c = cellCentre(idx, lat0);
    cells.push({
      key: c.key, lat: c.lat, lng: c.lng, cls,
      total: overall.get(idx),
      hotMonths: hot.filter(Boolean).length,
      lastZ: round(zs[zs.length - 1], 2),
      tau: kendallTau(zs),
      counts: months.map((_, m) => perMonth[m].get(idx) || 0),
      z: zs.map((z) => round(z, 2))
    });
  }
  cells.sort((a, b) => b.hotMonths - a.hotMonths || b.total - a.total || a.key.localeCompare(b.key));

  // Two-period comparison: first half vs second half, Gi* on the summed counts.
  const half = Math.floor(months.length / 2);
  const sum = (from, to) => {
    const m = new Map();
    for (let i = from; i < to; i += 1) for (const [idx, c] of perMonth[i]) m.set(idx, (m.get(idx) || 0) + c);
    return m;
  };
  const p1 = sum(0, half); const p2 = sum(half, months.length);
  const z1 = giStar(p1, lat0); const z2 = giStar(p2, lat0);
  const bandOf = (zmap, counts, idx) => giBand(counts.has(idx) ? zmap.get(idx) : zNeighbourhood(idx, counts, zmap, lat0)) || 'none';
  const changes = { newHot: 0, persistentHot: 0, cooled: 0, intensified: 0, weakened: 0, unchanged: 0 };
  const changed = [];
  for (const idx of overall.keys()) {
    const b1 = bandOf(z1, p1, idx); const b2 = bandOf(z2, p2, idx);
    const hot1 = b1.startsWith('hot'); const hot2 = b2.startsWith('hot');
    let kind = 'unchanged';
    if (!hot1 && hot2) kind = 'newHot';
    else if (hot1 && !hot2) kind = 'cooled';
    else if (hot1 && hot2 && b1 === 'hot95' && b2 === 'hot99') kind = 'intensified';
    else if (hot1 && hot2 && b1 === 'hot99' && b2 === 'hot95') kind = 'weakened';
    else if (hot1 && hot2) kind = 'persistentHot';
    changes[kind] += 1;
    if (kind !== 'unchanged') {
      const c = cellCentre(idx, lat0);
      changed.push({ key: c.key, lat: c.lat, lng: c.lng, kind, before: b1, after: b2, countBefore: p1.get(idx) || 0, countAfter: p2.get(idx) || 0 });
    }
  }
  changed.sort((a, b) => (b.countAfter + b.countBefore) - (a.countAfter + a.countBefore) || a.key.localeCompare(b.key));

  return {
    months,
    cellKm,
    cells: cells.slice(0, 120),
    cellCount: cells.length,
    classes: CLASSES.map((c) => ({ cls: c, cells: tally[c] })),
    stability: { series: stabilitySeries, mean: jac.length ? round(jac.reduce((s, v) => s + v, 0) / jac.length, 3) : null, top: 10 },
    twoPeriod: {
      periodA: { from: months[0], to: months[half - 1] || months[0], cases: [...p1.values()].reduce((s, n) => s + n, 0) },
      periodB: { from: months[half], to: months[months.length - 1], cases: [...p2.values()].reduce((s, n) => s + n, 0) },
      changes,
      cells: changed.slice(0, 40)
    },
    scan: { points: pts.length, lattice: lat0.n, occupiedCells: overall.size, skipped: false }
  };
}

/** A cell with no case this month still has a Gi* value from its neighbours;
 * compute it on demand rather than storing the whole lattice per month. */
function zNeighbourhood(idx, counts, zmap, lat0) {
  if (zmap.has(idx)) return zmap.get(idx);
  let total = 0; let sumSq = 0;
  for (const v of counts.values()) { total += v; sumSq += v * v; }
  const n = lat0.n;
  const meanC = total / n;
  const sdC = Math.sqrt(Math.max(0, sumSq / n - meanC * meanC));
  if (sdC <= 0) return 0;
  const i = idx % lat0.w; const j = (idx - i) / lat0.w;
  let local = 0; let k = 0;
  for (let jj = Math.max(0, j - 1); jj <= Math.min(lat0.h - 1, j + 1); jj += 1) {
    for (let ii = Math.max(0, i - 1); ii <= Math.min(lat0.w - 1, i + 1); ii += 1) {
      local += counts.get(jj * lat0.w + ii) || 0;
      k += 1;
    }
  }
  const denom = sdC * Math.sqrt(Math.max(1e-12, (n * k - k * k) / (n - 1 || 1)));
  return denom > 0 ? (local - meanC * k) / denom : 0;
}

module.exports = { trajectory, classify, jaccard, CLASSES };
