// /alerts — anomaly decomposition. Pure maths over one alert row; nothing here
// talks to the API, so the same numbers back the detail sheet, the digest and
// the printed brief.
//
// The detector (pipeline/analytics.py) is a ROBUST z: z = 0.6745·(x − median) /
// MAD over a trailing 8-week baseline. That means two honest caveats which the
// UI repeats rather than hides:
//   · σ is not measured directly — it is recovered as |observed − expected| /
//     |z|, which is exact for the detector's own scale.
//   · the tail probability below is what a NORMAL variable with that σ would
//     give. Weekly counts are not normal, so it is an order-of-magnitude
//     rarity cue, not a p-value to quote in court.
import { SEV_BANDS, sevFromZ, direction } from './severity.js';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Standard-normal upper tail P(Z > |z|).
 * Abramowitz & Stegun 7.1.26 for erf — max abs error 1.5e-7, plenty for a
 * "roughly 1 week in N" caption.
 */
export function normalTail(z) {
  const a = Math.abs(Number(z));
  if (!Number.isFinite(a)) return null;
  const x = a / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-x * x);
  return Math.max(0, (1 - erf) / 2);
}

/**
 * Full decomposition of one alert.
 * Returns null-valued fields rather than throwing when the row is incomplete —
 * the corpus has rows with a zero z (suppressed) and rows with no expected.
 */
export function explainAlert(a) {
  const observed = n(a?.observed);
  const expected = n(a?.expected);
  const z = n(a?.zScore);
  const absZ = z === null ? null : Math.abs(z);
  const excess = observed !== null && expected !== null ? observed - expected : null;
  const sigma = absZ !== null && absZ > 0.01 && excess !== null ? Math.abs(excess) / absZ : null;
  const pctVsExpected = excess !== null && expected ? (excess / Math.abs(expected)) * 100 : null;
  const tail = absZ === null ? null : normalTail(absZ);
  // "about one week in N" — the reciprocal of the tail, capped so the caption
  // never reads like false precision.
  const oneIn = tail && tail > 0 ? Math.min(1e6, Math.round(1 / tail)) : null;
  return {
    observed,
    expected,
    z,
    absZ,
    excess,
    sigma,
    pctVsExpected,
    tail,
    oneIn,
    band: sevFromZ(z),
    direction: direction(a),
    // expected ± 2σ — the same band the card sparkline shades.
    lo: sigma !== null && expected !== null ? Math.max(0, expected - 2 * sigma) : null,
    hi: sigma !== null && expected !== null ? expected + 2 * sigma : null,
  };
}

/** Human range for a band key, e.g. 'high' → '|z| 3–4'. */
export function bandRange(key) {
  const b = SEV_BANDS.find((x) => x.key === key);
  if (!b) return '';
  if (b.max === null) return `≥ ${b.min}`;
  if (b.min === 0) return `< ${b.max}`;
  return `${b.min}–${b.max}`;
}

/** Whole days between the alert's period end and when it was written. */
export function detectionLagDays(createdAt, periodEnd) {
  const c = Date.parse(String(createdAt || '').replace(' ', 'T'));
  const p = Date.parse(`${String(periodEnd || '').slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  return Math.round((c - p) / 86400000);
}

/** Age of the alert in whole days, measured from its period end. */
export function alertAgeDays(a, now = Date.now()) {
  const p = Date.parse(`${String(a?.periodEnd || a?.periodStart || '').slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(p)) return null;
  return Math.max(0, Math.floor((now - p) / 86400000));
}

/** Cases per lakh population — the only fair way to compare districts. */
export function ratePerLakh(count, population) {
  const c = n(count);
  const p = n(population);
  if (c === null || !p || p <= 0) return null;
  return (c / p) * 100000;
}

/**
 * Where the alert's district sits on one socio-economic indicator, as a
 * percentile across every district that reports it (0–100, higher = larger).
 */
export function indicatorPercentile(rows, key, value) {
  const v = n(value);
  if (v === null || !Array.isArray(rows) || rows.length < 3) return null;
  const vals = rows.map((r) => n(r?.[key])).filter((x) => x !== null).sort((a, b) => a - b);
  if (vals.length < 3) return null;
  let below = 0;
  for (const x of vals) if (x < v) below += 1;
  return (below / vals.length) * 100;
}
