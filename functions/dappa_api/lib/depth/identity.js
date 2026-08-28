'use strict';
// Identity-resolution transparency: the per-alias "why linked" breakdown built
// from the same three components the pipeline scores with
// (0.6·token_sort_ratio + 0.2·age-closeness + 0.2·district-overlap, plus the
// exact-name anchor rule), evaluated on the Accused rows behind a profile.

const { round, toNum } = require('../util');
const an = require('../analytics');
const { tokenSortRatio, median } = require('./common');

const WEIGHTS = { tokenSort: 0.6, age: 0.2, district: 0.2 };
const ANCHOR_TS = 0.95;
const ANCHOR_AGE = 2;
// The pipeline scores a pair only inside its blocking window, and those gates
// decide as much as the weights do (analytics.py resolve_identities):
//   token_sort_ratio(score_cutoff=60) — below 0.60 the ratio comes back 0 and
//   the pair is dropped outright; and the block is walked in age order with a
//   `break` once the gap exceeds 2 years, so a pair more than 2 years apart —
//   or with an age missing on either side — is never scored at all.
// Scoring an alias without those gates would show a link the pipeline could not
// have made, so they are applied here and reported per row.
const TS_CUTOFF = 0.6;
const BLOCK_AGE = 2;

/**
 * accused = [{ name, age, districtId, caseId }] for the profile's cases.
 * Every distinct name is scored against the canonical name.
 */
function whyLinked(canonical, aliases, accused, threshold) {
  const th = threshold || 0.92;
  const byName = new Map();
  for (const r of accused) {
    const k = an.nameKey(r.name);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, { name: String(r.name).trim(), ages: [], districts: new Set(), cases: new Set() });
    const e = byName.get(k);
    const age = toNum(r.age, null);
    if (age !== null && age > 0) e.ages.push(age);
    if (r.districtId) e.districts.add(String(r.districtId));
    if (r.caseId !== undefined && r.caseId !== null) e.cases.add(String(r.caseId));
  }
  const canonKey = an.nameKey(canonical);
  const ref = byName.get(canonKey) || { name: canonical, ages: [], districts: new Set(), cases: new Set() };
  const refAge = median(ref.ages);
  const names = new Set([...aliases.map(an.nameKey), ...byName.keys()].filter((k) => k && k !== canonKey));
  const rows = [];
  for (const k of names) {
    const e = byName.get(k) || { name: aliases.find((a) => an.nameKey(a) === k) || k, ages: [], districts: new Set(), cases: new Set() };
    const rawTs = tokenSortRatio(e.name, canonical);
    const ts = rawTs < TS_CUTOFF ? 0 : rawTs;
    const age = median(e.ages);
    const dAge = refAge === null || age === null ? null : Math.abs(age - refAge);
    const ageScore = dAge === null ? 0 : Math.max(0, 1 - dAge / 5);
    const shared = [...e.districts].filter((d) => ref.districts.has(d));
    const distScore = shared.length ? 1 : 0;
    const score = round(WEIGHTS.tokenSort * ts + WEIGHTS.age * ageScore + WEIGHTS.district * distScore, 4);
    const anchor = ts >= ANCHOR_TS && dAge !== null && dAge <= ANCHOR_AGE;
    // Could the pipeline's blocked pass have scored this pair at all?
    const blocked = ts === 0 ? 'name-below-cutoff' : dAge === null ? 'age-missing' : dAge > BLOCK_AGE ? 'age-gap' : null;
    rows.push({
      alias: e.name,
      inProfile: aliases.some((a) => an.nameKey(a) === k),
      records: e.cases.size,
      blockedBy: blocked,
      components: {
        tokenSortRatio: ts,
        tokenSortRaw: rawTs,
        ageCloseness: round(ageScore, 3),
        districtOverlap: distScore,
        ageDelta: dAge === null ? null : round(dAge, 1),
        sharedDistricts: shared,
        medianAge: age,
        canonicalMedianAge: refAge
      },
      contributions: {
        tokenSort: round(WEIGHTS.tokenSort * ts, 4),
        age: round(WEIGHTS.age * ageScore, 4),
        district: round(WEIGHTS.district * distScore, 4)
      },
      score,
      anchorPass: anchor,
      aboveThreshold: !blocked && (score >= th || anchor),
      verdict: blocked ? 'out-of-block' : anchor ? 'exact-anchor' : score >= th ? 'linked' : score >= 0.7 ? 'candidate' : 'weak'
    });
  }
  // Names the pipeline could actually have compared come first — a high score
  // on a row it never blocked is not evidence of anything.
  rows.sort((a, b) => (a.blockedBy ? 1 : 0) - (b.blockedBy ? 1 : 0) || b.score - a.score || a.alias.localeCompare(b.alias));
  return {
    canonical,
    canonicalRecords: ref.cases.size,
    canonicalMedianAge: refAge,
    canonicalDistricts: [...ref.districts],
    aliases: rows,
    threshold: th,
    weights: WEIGHTS,
    anchor: { tokenSortRatio: ANCHOR_TS, ageDelta: ANCHOR_AGE },
    gates: { tokenSortCutoff: TS_CUTOFF, blockAgeYears: BLOCK_AGE },
    outOfBlock: rows.filter((r) => r.blockedBy).length,
    formula: `score = ${WEIGHTS.tokenSort}·token_sort_ratio + ${WEIGHTS.age}·max(0, 1 − |Δage|/5) + ${WEIGHTS.district}·[same district]; linked when score ≥ ${th}, or when token_sort_ratio ≥ ${ANCHOR_TS} and |Δage| ≤ ${ANCHOR_AGE} (exact-name anchor, any district). The pipeline's own gates apply first: a token-sort ratio under ${TS_CUTOFF} scores 0, and a pair is only scored when both ages are known and within ${BLOCK_AGE} years — rows failing either are marked out of block, because the pipeline could not have linked them. Its phonetic-token × gender blocking is not replayed here (gender is not read on this route), so a row inside the block may still not have been compared by the pipeline.`
  };
}

module.exports = { whyLinked, WEIGHTS, ANCHOR_TS, ANCHOR_AGE };
