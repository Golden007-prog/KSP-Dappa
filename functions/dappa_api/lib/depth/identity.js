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
    const ts = tokenSortRatio(e.name, canonical);
    const age = median(e.ages);
    const dAge = refAge === null || age === null ? null : Math.abs(age - refAge);
    const ageScore = dAge === null ? 0 : Math.max(0, 1 - dAge / 5);
    const shared = [...e.districts].filter((d) => ref.districts.has(d));
    const distScore = shared.length ? 1 : 0;
    const score = round(WEIGHTS.tokenSort * ts + WEIGHTS.age * ageScore + WEIGHTS.district * distScore, 4);
    const anchor = ts >= ANCHOR_TS && dAge !== null && dAge <= ANCHOR_AGE;
    rows.push({
      alias: e.name,
      inProfile: aliases.some((a) => an.nameKey(a) === k),
      records: e.cases.size,
      components: {
        tokenSortRatio: ts,
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
      aboveThreshold: score >= th || anchor,
      verdict: anchor ? 'exact-anchor' : score >= th ? 'linked' : score >= 0.7 ? 'candidate' : 'weak'
    });
  }
  rows.sort((a, b) => b.score - a.score || a.alias.localeCompare(b.alias));
  return {
    canonical,
    canonicalRecords: ref.cases.size,
    canonicalMedianAge: refAge,
    canonicalDistricts: [...ref.districts],
    aliases: rows,
    threshold: th,
    weights: WEIGHTS,
    anchor: { tokenSortRatio: ANCHOR_TS, ageDelta: ANCHOR_AGE },
    formula: `score = ${WEIGHTS.tokenSort}·token_sort_ratio + ${WEIGHTS.age}·max(0, 1 − |Δage|/5) + ${WEIGHTS.district}·[same district]; linked when score ≥ ${th}, or when token_sort_ratio ≥ ${ANCHOR_TS} and |Δage| ≤ ${ANCHOR_AGE} (exact-name anchor, any district).`
  };
}

module.exports = { whyLinked, WEIGHTS, ANCHOR_TS, ANCHOR_AGE };
