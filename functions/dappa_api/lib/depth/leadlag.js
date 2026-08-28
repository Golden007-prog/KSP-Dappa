'use strict';
// Lead–lag cross-correlation between crime heads on the monthly series of one
// district (or the state). Series are first-differenced before correlating so a
// shared trend cannot masquerade as one head "leading" another.

const { round } = require('../util');
const { crossCorrelation } = require('./common');

function diff(xs) {
  const out = [];
  for (let i = 1; i < xs.length; i += 1) out.push(xs[i] - xs[i - 1]);
  return out;
}

/**
 * series = [{ headId, name, values }] aligned to `months`.
 * Returns every ordered pair's best lag (the lag with the largest |r| among
 * non-zero lags), the same-month r, and whether the lead clears 2/√n.
 */
function leadLag(series, months, maxLag) {
  const L = Math.max(1, Math.min(6, maxLag || 3));
  const usable = series.filter((s) => s.values.length >= 8 && s.values.some((v) => v !== s.values[0]));
  const d = new Map(usable.map((s) => [s.headId, diff(s.values)]));
  const n = months.length - 1;
  const threshold = n > 0 ? round(2 / Math.sqrt(n), 3) : null;
  const pairs = [];
  for (const a of usable) {
    for (const b of usable) {
      if (a.headId === b.headId) continue;
      const xc = crossCorrelation(d.get(a.headId), d.get(b.headId), L);
      const r0 = xc.find((x) => x.lag === 0);
      const leads = xc.filter((x) => x.lag > 0 && x.r !== null);
      const best = leads.reduce((acc, x) => (acc === null || Math.abs(x.r) > Math.abs(acc.r) ? x : acc), null);
      pairs.push({
        leader: a.headId, leaderName: a.name,
        follower: b.headId, followerName: b.name,
        r0: r0 ? r0.r : null,
        bestLag: best ? best.lag : null,
        bestR: best ? best.r : null,
        n: best ? best.n : 0,
        significant: best !== null && threshold !== null && Math.abs(best.r) >= threshold,
        lags: xc
      });
    }
  }
  pairs.sort((x, y) => Math.abs(y.bestR || 0) - Math.abs(x.bestR || 0) || x.leader - y.leader || x.follower - y.follower);
  return {
    months,
    maxLag: L,
    n,
    threshold,
    heads: usable.map((s) => ({ headId: s.headId, name: s.name })),
    pairs,
    leads: pairs.filter((p) => p.significant && p.bestR > 0).slice(0, 10),
    method: `Monthly counts per crime head are first-differenced, then r(k) = corr(Δx_t, Δy_{t+k}) for k = 1..${L} months. The best lag is the k with the largest |r|; a lead is reported when |r| ≥ 2/√n (n = ${n} differenced months). Positive r at lag k reads "a rise in the leader tends to be followed by a rise in the follower k months later".`
  };
}

module.exports = { leadLag, diff };
