// Predict — percentile risk tiers shared by the league table, the score
// histogram and the station drawer. Risk scores carry no absolute scale
// contract, so tier thresholds always derive from the distribution of the
// FULL league on screen (never a filtered subset).

export const TIERS = [
  { label: 'Severe', tone: 'red', min: 0.9 },
  { label: 'High', tone: 'amber', min: 0.75 },
  { label: 'Guarded', tone: 'neutral', min: 0.5 },
  { label: 'Low', tone: 'slate', min: 0 },
];

export function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** rows (full league) → (score) => tier, with per-tier cut points attached. */
export function makeTierOf(rows) {
  const scores = (rows || []).map((r) => Number(r.riskScore) || 0).sort((a, b) => a - b);
  const cuts = TIERS.map((t) => ({ ...t, at: quantile(scores, t.min) }));
  const fn = (score) => cuts.find((t) => score >= t.at) || TIERS[TIERS.length - 1];
  fn.cuts = cuts;
  return fn;
}

/** Percentile of a score within the league (0–100). */
export function percentileOf(rows, score) {
  const scores = (rows || []).map((r) => Number(r.riskScore) || 0);
  if (!scores.length) return null;
  const below = scores.filter((s) => s < score).length;
  return (below / scores.length) * 100;
}
