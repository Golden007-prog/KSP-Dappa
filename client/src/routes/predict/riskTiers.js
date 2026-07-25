// Predict — percentile risk tiers shared by the league table, the score
// histogram and the station drawer. Risk scores carry no absolute scale
// contract, so tier thresholds always derive from the distribution of the
// FULL league on screen (never a filtered subset).
// Tier names are translated by the caller: this module is not a hook, so
// makeTierOf takes the `t` from the component's useT().

export const TIERS = [
  { key: 'severe', tone: 'red', min: 0.9 },
  { key: 'high', tone: 'amber', min: 0.75 },
  { key: 'guarded', tone: 'neutral', min: 0.5 },
  { key: 'low', tone: 'slate', min: 0 },
];

export function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** rows (full league) + t → (score) => tier, with per-tier cut points attached. */
export function makeTierOf(rows, t) {
  const scores = (rows || []).map((r) => Number(r.riskScore) || 0).sort((a, b) => a - b);
  const cuts = TIERS.map((tier) => ({
    ...tier,
    at: quantile(scores, tier.min),
    label: t(`trends.predict.tier.${tier.key}`),
  }));
  const lowest = cuts[cuts.length - 1];
  const fn = (score) => cuts.find((c) => score >= c.at) || lowest;
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
