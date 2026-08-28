// Status discipline — one meaning, three signals. Every status the app shows
// carries a colour, a glyph and a word at the same time (docs/UX_RESEARCH.md
// §10: colour-blind officers and black-and-white station printers read the
// glyph and the word; the colour is redundant). The palette is the app's own
// token set; red and teal are a deuteranopia confusion pair, which is exactly
// why the glyph and the word do the work.
//
//   rising   ▲  RISING  / ಏರಿಕೆ   — much higher than normal (z ≥ 3), act today
//   watch    ●  WATCH   / ನಿಗಾ    — higher than normal (2 ≤ z < 3), worth a look
//   stable   ✓  STABLE  / ಸ್ಥಿರ   — within the usual range (|z| < 2)
//   falling  ▼  FALLING / ಇಳಿಕೆ   — well below normal (z ≤ −2)
//   nodata   —  NO DATA / ದತ್ತಾಂಶವಿಲ್ಲ
//
// The API's tier endpoints already ship a `statusWord` per row (same rule,
// lib/routes/tiers.js statusFromZ); these helpers exist for values the client
// derives itself (sparkline z, pendency age, risk percentile word).

export const STATUS_KEYS = ['rising', 'watch', 'stable', 'falling', 'nodata'];

export const STATUS = {
  rising: { glyph: '▲', tone: 'signal', labelKey: 'tier.status.rising' },
  watch: { glyph: '●', tone: 'amber', labelKey: 'tier.status.watch' },
  stable: { glyph: '✓', tone: 'teal', labelKey: 'tier.status.stable' },
  falling: { glyph: '▼', tone: 'primary', labelKey: 'tier.status.falling' },
  nodata: { glyph: '—', tone: 'muted', labelKey: 'tier.status.nodata' },
};

/** z-score → status key (≥3 rising · ≥2 watch · ≤−2 falling · else stable). */
export function statusFromZ(z) {
  const n = Number(z);
  if (z === null || z === undefined || !Number.isFinite(n)) return 'nodata';
  if (n >= 3) return 'rising';
  if (n >= 2) return 'watch';
  if (n <= -2) return 'falling';
  return 'stable';
}

/** Pendency age in days → status (≤30 stable · ≤60 watch · >60 rising). */
export function statusFromPendency(days) {
  const n = Number(days);
  if (days === null || days === undefined || !Number.isFinite(n)) return 'nodata';
  if (n > 60) return 'rising';
  if (n > 30) return 'watch';
  return 'stable';
}

/** Risk word from the API ('high' | 'elevated' | 'normal') → status key. */
export function statusFromRiskWord(word) {
  if (word === 'high') return 'rising';
  if (word === 'elevated') return 'watch';
  if (word === 'normal') return 'stable';
  return 'nodata';
}

/**
 * z of the latest point against the earlier points of a short series (the
 * KPI sparkline's 12-month baseline). Poisson floor on the spread so a
 * near-flat series does not turn a one-case wobble into "3 swings". Null when
 * there are fewer than four points.
 */
export function zFromSeries(series) {
  const nums = (series || []).map(Number).filter(Number.isFinite);
  if (nums.length < 4) return null;
  const last = nums[nums.length - 1];
  const base = nums.slice(0, -1);
  const mean = base.reduce((s, n) => s + n, 0) / base.length;
  const sd = Math.sqrt(base.reduce((s, n) => s + (n - mean) ** 2, 0) / (base.length - 1));
  const spread = Math.max(sd, Math.sqrt(Math.max(mean, 0)), 1);
  return (last - mean) / spread;
}

/** True when a movement should be worded "within the normal range". */
export function withinNormal(z) {
  const n = Number(z);
  return Number.isFinite(n) && Math.abs(n) < 2;
}
