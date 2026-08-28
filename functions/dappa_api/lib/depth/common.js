'use strict';
// Pure helpers shared by the analytical-depth endpoints (lib/depth/*). No Data
// Store, no cache, no Express — every formula here is pinned by
// test/round2/phase8-depth.test.mjs against hand-derived expectations.

const { toNum, round } = require('../util');
const constants = require('../constants');

// Offence gravity 1..10 keyed on the official sub-head ids (Appendix C). It is
// an ordering of offence seriousness only — body and women's-safety offences
// outrank property, property outranks paperwork — and mirrors the scale the
// client's BehaviourChangeCard already uses (routes/offenders/behaviour.js), so
// the per-offender card and the corpus matrix agree on every rung.
const SUBHEAD_GRAVITY = {
  101: 10, 102: 9, 103: 7, 104: 8,
  201: 10, 202: 6, 203: 6, 204: 7,
  301: 8, 302: 7, 303: 5, 304: 4, 305: 3, 306: 3, 307: 5,
  401: 3, 402: 4, 403: 4,
  501: 3, 502: 4, 503: 2,
  601: 5, 602: 2,
  701: 4, 702: 7,
  801: 1, 802: 1
};
const HEAD_GRAVITY = { 1: 8, 2: 8, 3: 4, 4: 3, 5: 3, 6: 3, 7: 5, 8: 1 };

/** Gravity rung for a case row; the head-level fallback covers an unknown sub-head. */
function gravityOf(subHeadId, headId) {
  const s = SUBHEAD_GRAVITY[toNum(subHeadId)];
  if (s) return s;
  return HEAD_GRAVITY[toNum(headId)] || 1;
}

// Four rungs of the escalation ladder. Boundaries follow the gravity scale:
// petty = theft/fraud paperwork, moderate = burglary/snatching, serious =
// robbery/dacoity/grievous hurt, heinous = murder/rape/attempt.
const BANDS = ['petty', 'moderate', 'serious', 'heinous'];
function bandOfGravity(g) {
  const n = toNum(g);
  if (n >= 9) return 'heinous';
  if (n >= 6) return 'serious';
  if (n >= 4) return 'moderate';
  return 'petty';
}
function bandIndex(band) {
  return BANDS.indexOf(band);
}

function parseDay(s) {
  const m = String(s === undefined || s === null ? '' : s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d) ? null : Math.floor(d / 86400000);
}
function dayToIso(dayNum) {
  return new Date(dayNum * 86400000).toISOString().slice(0, 10);
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Shannon entropy of a count list normalised to 0..1 by log(k) — 0 when a
 * single category carries everything (a specialist), 1 when spread evenly. */
function normalisedEntropy(counts) {
  const nums = counts.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const total = nums.reduce((s, n) => s + n, 0);
  if (!total || nums.length < 2) return 0;
  let h = 0;
  for (const n of nums) {
    const p = n / total;
    h -= p * Math.log(p);
  }
  return round(h / Math.log(nums.length), 3);
}

function mean(xs) {
  const a = xs.map(Number).filter(Number.isFinite);
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
}
function sd(xs) {
  const a = xs.map(Number).filter(Number.isFinite);
  if (a.length < 2) return null;
  const m = a.reduce((s, n) => s + n, 0) / a.length;
  return Math.sqrt(a.reduce((s, n) => s + (n - m) ** 2, 0) / (a.length - 1));
}
function median(xs) {
  const a = xs.map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function quantile(xs, q) {
  const a = xs.map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/**
 * Kaplan–Meier survival over durations with a censoring flag.
 * obs = [{t, event}] — event=true is an observed next case after t days,
 * event=false is "no further case by the end of the data window" (censored).
 * Returns the step curve at every event time plus S(t) at a fixed grid and the
 * median where the curve actually crosses 0.5 (null otherwise — never a guess).
 */
function kaplanMeier(obs, grid) {
  const rows = obs.filter((o) => Number.isFinite(Number(o.t)) && Number(o.t) >= 0)
    .map((o) => ({ t: Number(o.t), event: Boolean(o.event) }))
    .sort((a, b) => a.t - b.t || (a.event === b.event ? 0 : a.event ? -1 : 1));
  const n = rows.length;
  let atRisk = n;
  let s = 1;
  const steps = [];
  let i = 0;
  let medianT = null;
  while (i < n) {
    const t = rows[i].t;
    let d = 0;
    let c = 0;
    while (i < n && rows[i].t === t) {
      if (rows[i].event) d += 1; else c += 1;
      i += 1;
    }
    if (d > 0 && atRisk > 0) {
      s *= 1 - d / atRisk;
      steps.push({ t, s: round(s, 4), atRisk, events: d });
      if (medianT === null && s <= 0.5) medianT = t;
    }
    atRisk -= d + c;
  }
  const at = (t) => {
    let v = 1;
    for (const st of steps) { if (st.t <= t) v = st.s; else break; }
    return round(v, 4);
  };
  const events = rows.filter((r) => r.event).length;
  return {
    n,
    events,
    censored: n - events,
    steps,
    grid: (grid || []).map((t) => ({ t, s: at(t) })),
    medianDays: medianT
  };
}

/** Pearson r between two equal-length arrays (null when n < 3 or flat). */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0; let sy = 0;
  for (let i = 0; i < n; i += 1) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n; const my = sy / n;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx; const b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Cross-correlation r(lag) = corr(x_t, y_{t+lag}); positive lag = x leads y. */
function crossCorrelation(xs, ys, maxLag) {
  const out = [];
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const a = []; const b = [];
    for (let t = 0; t < xs.length; t += 1) {
      const j = t + lag;
      if (j < 0 || j >= ys.length) continue;
      a.push(xs[t]); b.push(ys[j]);
    }
    const r = pearson(a, b);
    out.push({ lag, r: r === null ? null : round(r, 3), n: a.length });
  }
  return out;
}

/** Kendall's tau-b for a short series against its index (monotone trend). */
function kendallTau(ys) {
  const n = ys.length;
  if (n < 3) return null;
  let s = 0; let ties = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = ys[j] - ys[i];
      if (d > 0) s += 1; else if (d < 0) s -= 1; else ties += 1;
    }
  }
  const pairs = (n * (n - 1)) / 2;
  const denom = Math.sqrt(pairs * (pairs - ties));
  return denom > 0 ? round(s / denom, 3) : 0;
}

// ---------------------------------------------------------------------------
// Square-grid lattice + Getis–Ord Gi* — the same constants and 3x3 queen window
// as the client's routes/geointel/stats.js buildGrid, so a cell scored here is
// the cell the GeoIntel grid layer draws.
// ---------------------------------------------------------------------------
const KM_PER_DEG_LAT = 110.574;
const REF_LAT = 15.0;
const KM_PER_DEG_LNG = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);
const Z_95 = 1.96;
const Z_99 = 2.58;

function latticeFor(points, cellKm) {
  if (!points.length) return null;
  const dLat = cellKm / KM_PER_DEG_LAT;
  const dLng = cellKm / KM_PER_DEG_LNG;
  let minLat = Infinity; let maxLat = -Infinity; let minLng = Infinity; let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const i0 = Math.floor(minLng / dLng);
  const j0 = Math.floor(minLat / dLat);
  const w = Math.floor(maxLng / dLng) - i0 + 1;
  const h = Math.floor(maxLat / dLat) - j0 + 1;
  return { dLat, dLng, i0, j0, w, h, n: w * h, cellKm };
}

function cellOf(lat, lng, lat0) {
  const i = Math.floor(lng / lat0.dLng) - lat0.i0;
  const j = Math.floor(lat / lat0.dLat) - lat0.j0;
  if (i < 0 || j < 0 || i >= lat0.w || j >= lat0.h) return -1;
  return j * lat0.w + i;
}

function cellCentre(idx, lat0) {
  const i = idx % lat0.w;
  const j = (idx - i) / lat0.w;
  return {
    key: `${lat0.i0 + i}:${lat0.j0 + j}`,
    lat: round((lat0.j0 + j) * lat0.dLat + lat0.dLat / 2, 5),
    lng: round((lat0.i0 + i) * lat0.dLng + lat0.dLng / 2, 5)
  };
}

/** Gi* z for every occupied cell of a count map over a fixed lattice. */
function giStar(countByCell, lat0) {
  const n = lat0.n;
  let total = 0; let sumSq = 0;
  for (const v of countByCell.values()) { total += v; sumSq += v * v; }
  const meanC = total / n;
  const sdC = Math.sqrt(Math.max(0, sumSq / n - meanC * meanC));
  const out = new Map();
  if (sdC <= 0) {
    for (const idx of countByCell.keys()) out.set(idx, 0);
    return out;
  }
  for (const idx of countByCell.keys()) {
    const i = idx % lat0.w;
    const j = (idx - i) / lat0.w;
    let local = 0; let k = 0;
    for (let jj = Math.max(0, j - 1); jj <= Math.min(lat0.h - 1, j + 1); jj += 1) {
      for (let ii = Math.max(0, i - 1); ii <= Math.min(lat0.w - 1, i + 1); ii += 1) {
        local += countByCell.get(jj * lat0.w + ii) || 0;
        k += 1;
      }
    }
    const denom = sdC * Math.sqrt(Math.max(1e-12, (n * k - k * k) / (n - 1 || 1)));
    out.set(idx, denom > 0 ? (local - meanC * k) / denom : 0);
  }
  return out;
}

function giBand(z) {
  if (!Number.isFinite(z)) return null;
  if (z >= Z_99) return 'hot99';
  if (z >= Z_95) return 'hot95';
  if (z <= -Z_99) return 'cold99';
  if (z <= -Z_95) return 'cold95';
  return null;
}

// ---------------------------------------------------------------------------
// rapidfuzz-compatible token_sort_ratio: both names token-sorted, then the
// normalised Indel similarity 1 - indel/(|a|+|b|). Reproduces the scorer in
// pipeline/analytics.py resolve_identities so the "why linked" card shows the
// number the pipeline actually used, not a look-alike.
// ---------------------------------------------------------------------------
function tokenSort(s) {
  const toks = String(s || '').toLowerCase().match(/[a-z]+/g);
  return toks ? toks.sort().join(' ') : '';
}
function lcsLength(a, b) {
  const m = a.length; const n = b.length;
  if (!m || !n) return 0;
  let prev = new Array(n + 1).fill(0);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = 0;
    for (let j = 1; j <= n; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function tokenSortRatio(a, b) {
  const x = tokenSort(a); const y = tokenSort(b);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const indel = x.length + y.length - 2 * lcsLength(x, y);
  return round(1 - indel / (x.length + y.length), 4);
}

/** District id → { id, name, lat, lng } from the pinned Appendix C table. */
function districtInfo(key) {
  const bare = String(key || '').replace(/^0+(?=\d)/, '');
  const hit = constants.DISTRICTS.find((d) => d.id.replace(/^0+(?=\d)/, '') === bare);
  return hit ? { id: hit.id, name: hit.name, lat: hit.lat, lng: hit.lng } : null;
}

/** Strict numeric query param: absent → default; present but not a finite
 * number inside [min,max] → null (the route answers 400). */
function strictNum(raw, dflt, min, max) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

module.exports = {
  SUBHEAD_GRAVITY, HEAD_GRAVITY, BANDS, gravityOf, bandOfGravity, bandIndex,
  parseDay, dayToIso, haversineM, normalisedEntropy, mean, sd, median, quantile,
  kaplanMeier, pearson, crossCorrelation, kendallTau,
  latticeFor, cellOf, cellCentre, giStar, giBand, Z_95, Z_99,
  tokenSort, tokenSortRatio, lcsLength, districtInfo, strictNum
};
