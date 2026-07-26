// Whole-group organised-crime scoring.
//
// WHY THIS IS NOT KEYED ON CommunityID. The audit asked for a score per
// CommunityID, but the live store only carries one: 1,999 of 2,044 profiles sit
// in community 0 and the rest are null (confirmed against /network/communities,
// which returns a single row of 1,999 members). Scoring "each community" would
// therefore produce exactly one row and say nothing. Re-clustering the
// co-offending graph does not rescue it either — /network/graph caps at 3,000
// edges and label propagation over that collapses into one 976-node blob with
// 1,070 isolates.
//
// So the grouping is derived here, from the signal an organised crew actually
// leaves: a SHARED MODUS OPERANDI. Two people are linked when they carry the
// same rare MO tags, weighted by inverse document frequency so that sharing
// "loan app" (rare) binds far harder than sharing "vehicle" (common). Connected
// components over those links are the crews. That is the challenge brief read
// literally — recurring modus operandi as the route into organised networks —
// and it yields ~40 crews of 3+ members instead of one useless blob.
//
// Co-offending edges from the graph endpoint, when supplied, are folded in as a
// corroborating driver rather than as the grouping key: a crew whose members
// also share FIRs is a much stronger call than one bound by MO alone.
import { idf } from './moVocab.js';

/** Tags carried by more people than this are too generic to bind a crew. */
const MAX_TAG_REACH = 140;
/** Minimum distinct shared tags for a candidate link. */
const MIN_SHARED_TAGS = 2;
/** Minimum IDF-weighted strength for a candidate link. */
const MIN_LINK_STRENGTH = 6;
/** Safety valve — never let pair generation run away on an unexpected corpus. */
const MAX_PAIR_OPS = 400000;

/**
 * Build MO-signature crews.
 * Returns [{ id, keys[], links[], sharedTags[] }] ordered by size.
 */
export function deriveCrews(rows = [], signalByKey, df, {
  minSharedTags = MIN_SHARED_TAGS,
  minStrength = MIN_LINK_STRENGTH,
  minSize = 3,
} = {}) {
  const n = rows.length || 1;

  // Invert the vocabulary: tag -> carriers. Over-reaching tags are dropped
  // because they would wire half the corpus into a single component.
  const byTag = new Map();
  for (const r of rows) {
    const key = String(r?.personKey || '');
    for (const tag of new Set(signalByKey.get(key) || [])) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(key);
    }
  }

  const pair = new Map(); // "a|b" -> { tags[], strength }
  let ops = 0;
  for (const [tag, keys] of byTag) {
    if (keys.length < 2 || keys.length > MAX_TAG_REACH) continue;
    const w = idf(df, tag, n);
    if (ops + (keys.length * (keys.length - 1)) / 2 > MAX_PAIR_OPS) break;
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        ops += 1;
        const a = keys[i];
        const b = keys[j];
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        let p = pair.get(k);
        if (!p) { p = { tags: [], strength: 0 }; pair.set(k, p); }
        p.tags.push(tag);
        p.strength += w;
      }
    }
  }

  const links = [];
  const adj = new Map();
  for (const [k, p] of pair) {
    if (p.tags.length < minSharedTags || p.strength < minStrength) continue;
    const [a, b] = k.split('|');
    links.push({ a, b, tags: p.tags, strength: p.strength });
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }

  const linkIndex = new Map();
  for (const l of links) {
    linkIndex.set(`${l.a}|${l.b}`, l);
  }

  const seen = new Set();
  const crews = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const keys = [];
    while (stack.length) {
      const cur = stack.pop();
      keys.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    if (keys.length < minSize) continue;

    const memberSet = new Set(keys);
    const inner = links.filter((l) => memberSet.has(l.a) && memberSet.has(l.b));
    const tagFreq = new Map();
    for (const l of inner) for (const tg of l.tags) tagFreq.set(tg, (tagFreq.get(tg) || 0) + 1);

    crews.push({
      id: keys.slice().sort()[0],
      keys,
      links: inner,
      sharedTags: [...tagFreq.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .map(([tag, count]) => ({ tag, count })),
    });
  }
  return crews.sort((a, b) => b.keys.length - a.keys.length);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** log-scaled 0..1 ramp — group metrics are heavy-tailed, linear ramps flatten them. */
const logRamp = (v, full) => clamp01(Math.log1p(Math.max(0, v)) / Math.log1p(full));

/** Driver weights — sum to 1. Order is the order shown in the UI. */
export const CREW_DRIVERS = [
  { id: 'size', weight: 0.22 },
  { id: 'cohesion', weight: 0.18 },
  { id: 'signature', weight: 0.18 },
  { id: 'reach', weight: 0.16 },
  { id: 'repeat', weight: 0.16 },
  { id: 'corroboration', weight: 0.1 },
];

// Cut points sit where the live score distribution actually breaks (scores run
// 39–73 over 39 crews), not on round numbers that would strand every crew in
// one band.
export const CREW_BANDS = [
  { id: 'organised', min: 62 },
  { id: 'emerging', min: 50 },
  { id: 'loose', min: 0 },
];

export function crewBand(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'loose';
  return (CREW_BANDS.find((b) => n >= b.min) || CREW_BANDS[CREW_BANDS.length - 1]).id;
}

/**
 * Score one crew for organised-crime character and return the drivers behind
 * the number, so an investigator can see WHY it ranked where it did rather than
 * being handed an opaque total.
 *
 * @param signalByKey     Map personKey -> signal MO tags, for the homogeneity read.
 * @param sharedCaseIndex Map personKey -> Set(personKey) of real co-accused
 *        links from the graph endpoint. Optional; drives `corroboration`.
 */
export function scoreCrew(crew, rowsByKey, signalByKey, sharedCaseIndex) {
  const members = crew.keys.map((k) => rowsByKey.get(k)).filter(Boolean);
  const size = members.length || 1;

  const districts = new Set();
  let cases = 0;
  let repeat = 0;
  let riskSum = 0;
  let riskN = 0;
  for (const m of members) {
    for (const d of m.districts || []) districts.add(d);
    cases += Number(m.caseCount) || 0;
    if ((Number(m.caseCount) || 0) >= 3) repeat += 1;
    if (Number.isFinite(Number(m.riskScore))) { riskSum += Number(m.riskScore); riskN += 1; }
  }

  // Cohesion: realised links over possible links, lifted by mean tie strength.
  const possible = (size * (size - 1)) / 2 || 1;
  const density = clamp01(crew.links.length / possible);
  const meanStrength = crew.links.length
    ? crew.links.reduce((s, l) => s + l.strength, 0) / crew.links.length
    : 0;
  const cohesion = clamp01(density * 0.65 + logRamp(meanStrength, 30) * 0.35);

  // Signature concentration — measured over MEMBERS, not over links. An
  // earlier link-ratio version scored every 3-person crew a perfect 100
  // (three members give three links give three shared tags), which floated
  // trivia to the top of the ranking. Two honest questions instead: how much
  // of the crew carries its single defining tag, and how much of a typical
  // member's own repertoire is crew business rather than freelancing.
  const bindingTags = new Set(crew.sharedTags.map((s) => s.tag));
  const topTag = crew.sharedTags.length ? crew.sharedTags[0].tag : null;
  let topTagCarriers = 0;
  let sharedFractionSum = 0;
  for (const m of members) {
    const own = signalByKey?.get(String(m.personKey)) || [];
    if (topTag && own.includes(topTag)) topTagCarriers += 1;
    const inCrew = own.filter((tg) => bindingTags.has(tg)).length;
    sharedFractionSum += own.length ? inCrew / own.length : 0;
  }
  const topTagShare = size ? topTagCarriers / size : 0;
  const meanSharedFraction = size ? sharedFractionSum / size : 0;
  const signature = clamp01(topTagShare * 0.6 + meanSharedFraction * 0.4);

  // Corroboration: share of MO links that are ALSO real shared-FIR links.
  let corroborated = 0;
  if (sharedCaseIndex && sharedCaseIndex.size) {
    for (const l of crew.links) {
      if (sharedCaseIndex.get(l.a)?.has(l.b)) corroborated += 1;
    }
  }
  const corroboration = crew.links.length ? corroborated / crew.links.length : 0;

  const raw = {
    size,
    cohesion,
    signature,
    reach: districts.size,
    repeat: size ? repeat / size : 0,
    corroboration,
  };

  const norm = {
    size: logRamp(size, 40),
    cohesion,
    signature,
    reach: logRamp(districts.size, 38),
    repeat: raw.repeat,
    corroboration,
  };

  const score = CREW_DRIVERS.reduce((s, d) => s + (norm[d.id] || 0) * d.weight, 0) * 100;

  return {
    ...crew,
    size,
    members,
    cases,
    districts: [...districts],
    districtCount: districts.size,
    repeatShare: raw.repeat,
    avgRisk: riskN ? riskSum / riskN : null,
    maxRisk: members.reduce((m, x) => Math.max(m, Number(x.riskScore) || 0), 0),
    corroboratedLinks: corroborated,
    topTag,
    topTagShare,
    meanSharedFraction,
    score,
    band: crewBand(score),
    drivers: CREW_DRIVERS.map((d) => ({
      id: d.id,
      weight: d.weight,
      value: norm[d.id] || 0,
      raw: raw[d.id],
      contribution: (norm[d.id] || 0) * d.weight * 100,
    })),
  };
}

/** Score and rank every crew. */
export function scoreCrews(crews = [], rowsByKey, signalByKey, sharedCaseIndex) {
  return crews
    .map((c) => scoreCrew(c, rowsByKey, signalByKey, sharedCaseIndex))
    .sort((a, b) => b.score - a.score || b.size - a.size);
}

/** graph edges -> Map(personKey -> Set(personKey)) for the corroboration driver. */
export function buildSharedCaseIndex(edges = []) {
  const idx = new Map();
  for (const e of edges) {
    const a = String(e?.source || '');
    const b = String(e?.target || '');
    if (!a || !b) continue;
    if (!idx.has(a)) idx.set(a, new Set());
    if (!idx.has(b)) idx.set(b, new Set());
    idx.get(a).add(b);
    idx.get(b).add(a);
  }
  return idx;
}
