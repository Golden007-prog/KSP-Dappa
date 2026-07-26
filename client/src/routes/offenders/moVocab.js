// Learned MO vocabulary — turning 2,048 profiles' mined tag lists into a
// vocabulary with structure, instead of trusting the tags as they arrive.
//
// The pipeline mines exactly five MO tags per profile from free-text FIR
// narratives. Measured against the live store, ~41% of tag instances are an
// echo of the person's OWN name ("byadgi took" on Rajesh Byadgi) and a further
// slice echoes SOMEBODY's name ("reddy associates" hung on a person named
// Patil). Those are identity fragments, not modus operandi, and they dominate
// every naive frequency ranking. Filtering them is also what keeps surname
// tokens — the field most likely to be read as community identity — out of the
// analytics surface entirely.
//
// What survives is a real vocabulary: vehicle, lock, beat duty, parked market,
// loan app, threat messages, mangalsutra neck, dacoity cash. Co-occurrence lift
// over that vocabulary recovers recurring signatures (loan app + receiving loan
// + threat messages = digital loan-app extortion) that no single tag expresses.

/** Lowercase word tokens, digits kept (tags like "000 neck" are real). */
export function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

const MIN_TOKEN_LEN = 3;
/** A token must look like a name in this many distinct profiles to be lexicon. */
const LEXICON_MIN_PROFILES = 3;

/**
 * Person-name lexicon mined from the corpus itself — every token that appears
 * inside a canonical name or alias of at least LEXICON_MIN_PROFILES distinct
 * people. Learned from the data, not a hardcoded stop-list, so it tracks
 * whatever the identity-resolution stage actually produced.
 */
export function buildNameLexicon(rows = [], { minProfiles = LEXICON_MIN_PROFILES } = {}) {
  const seen = new Map(); // token -> Set(personKey)
  for (const r of rows) {
    const key = String(r?.personKey || '');
    for (const name of [r?.canonicalName, ...(r?.aliases || [])]) {
      for (const tk of tokens(name)) {
        if (tk.length < MIN_TOKEN_LEN) continue;
        if (!seen.has(tk)) seen.set(tk, new Set());
        seen.get(tk).add(key);
      }
    }
  }
  const lex = new Set();
  for (const [tk, keys] of seen) if (keys.size >= minProfiles) lex.add(tk);
  return lex;
}

/** True when any token of the tag is a known person-name token. */
export function isIdentityEcho(tag, lexicon) {
  if (!lexicon || !lexicon.size) return false;
  return tokens(tag).some((tk) => lexicon.has(tk));
}

/**
 * Split every profile's mined tags into signal (real MO) and identity echoes.
 * Returns maps keyed by personKey plus corpus-level counts for the data-quality
 * read-out — the noise share is itself a finding worth showing an investigator.
 */
export function classifyTags(rows = [], lexicon) {
  const signalByKey = new Map();
  const echoByKey = new Map();
  let signalCount = 0;
  let echoCount = 0;
  for (const r of rows) {
    const key = String(r?.personKey || '');
    const signal = [];
    const echo = [];
    for (const tag of r?.moTags || []) {
      if (isIdentityEcho(tag, lexicon)) echo.push(tag);
      else signal.push(tag);
    }
    signalByKey.set(key, signal);
    echoByKey.set(key, echo);
    signalCount += signal.length;
    echoCount += echo.length;
  }
  const total = signalCount + echoCount;
  return {
    signalByKey,
    echoByKey,
    signalCount,
    echoCount,
    total,
    noiseShare: total ? echoCount / total : 0,
    profilesWithSignal: [...signalByKey.values()].filter((v) => v.length > 0).length,
  };
}

/**
 * Per-tag reach across the corpus: how many people carry it, how many cases
 * they account for, how wide it travels, and how risky its carriers are.
 */
export function tagStats(rows = [], signalByKey) {
  const stats = new Map();
  for (const r of rows) {
    const key = String(r?.personKey || '');
    for (const tag of signalByKey.get(key) || []) {
      let s = stats.get(tag);
      if (!s) {
        s = { tag, offenders: 0, cases: 0, riskSum: 0, riskN: 0, districts: new Set(), keys: [] };
        stats.set(tag, s);
      }
      s.offenders += 1;
      s.cases += Number(r.caseCount) || 0;
      if (Number.isFinite(Number(r.riskScore))) { s.riskSum += Number(r.riskScore); s.riskN += 1; }
      for (const d of r.districts || []) s.districts.add(d);
      if (s.keys.length < 40) s.keys.push(key);
    }
  }
  return [...stats.values()]
    .map((s) => ({
      tag: s.tag,
      offenders: s.offenders,
      cases: s.cases,
      districts: s.districts.size,
      avgRisk: s.riskN ? s.riskSum / s.riskN : null,
      keys: s.keys,
    }))
    .sort((a, b) => b.offenders - a.offenders || a.tag.localeCompare(b.tag));
}

/** Pair-key delimiter — a control char cannot occur inside a mined tag. */
const SEP = '\u0001';

/**
 * Co-occurrence lift between MO tags across profiles.
 *
 * lift = P(a,b) / (P(a)·P(b)) — how much more often two tags ride together than
 * independence would predict. Lift is the right measure here precisely because
 * the vocabulary is long-tailed: raw co-counts would only ever surface the
 * handful of common tags, while lift promotes the rare-but-locked pairs that
 * actually describe a signature.
 */
export function tagPairs(rows = [], signalByKey, { minCo = 3, limit = 120 } = {}) {
  const df = new Map();
  const co = new Map();
  const n = rows.length || 1;
  for (const r of rows) {
    const list = [...new Set(signalByKey.get(String(r?.personKey || '')) || [])];
    for (const t of list) df.set(t, (df.get(t) || 0) + 1);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const [a, b] = list[i] < list[j] ? [list[i], list[j]] : [list[j], list[i]];
        const k = a + SEP + b;
        co.set(k, (co.get(k) || 0) + 1);
      }
    }
  }
  const out = [];
  for (const [k, count] of co) {
    if (count < minCo) continue;
    const [a, b] = k.split(SEP);
    const pa = (df.get(a) || 0) / n;
    const pb = (df.get(b) || 0) / n;
    if (!pa || !pb) continue;
    const lift = (count / n) / (pa * pb);
    out.push({ a, b, count, lift, dfA: df.get(a) || 0, dfB: df.get(b) || 0 });
  }
  out.sort((x, y) => y.lift - x.lift || y.count - x.count);
  return { pairs: out.slice(0, limit), df };
}

/**
 * Cluster the vocabulary into MO families by walking the high-lift pair graph.
 * A family is a connected component — the set of tags that keep turning up in
 * each other's company — named after its widest-reaching members, which reads
 * as the recurring signature an investigator would recognise.
 */
export function moFamilies(pairs = [], stats = [], { minLift = 8, maxFamilies = 14, minSize = 2 } = {}) {
  const statByTag = new Map(stats.map((s) => [s.tag, s]));
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  const kept = pairs.filter((p) => p.lift >= minLift);
  for (const p of kept) { link(p.a, p.b); link(p.b, p.a); }

  const seen = new Set();
  const families = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const members = [];
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    if (members.length < minSize) continue;

    const withStats = members
      .map((tag) => statByTag.get(tag) || { tag, offenders: 0, cases: 0, districts: 0, avgRisk: null, keys: [] })
      .sort((a, b) => b.offenders - a.offenders || a.tag.localeCompare(b.tag));

    const memberSet = new Set(members);
    const inner = kept.filter((p) => memberSet.has(p.a) && memberSet.has(p.b));
    const peopleKeys = new Set();
    for (const m of withStats) for (const k of m.keys) peopleKeys.add(k);

    families.push({
      id: withStats[0].tag,
      // Two widest-reaching tags name the signature — enough to recognise it
      // without inventing a label the data does not support.
      label: withStats.slice(0, 2).map((m) => m.tag).join(' + '),
      tags: withStats,
      size: members.length,
      offenders: peopleKeys.size,
      keys: [...peopleKeys],
      cases: withStats.reduce((s, m) => s + m.cases, 0),
      districts: Math.max(0, ...withStats.map((m) => m.districts)),
      avgLift: inner.length ? inner.reduce((s, p) => s + p.lift, 0) / inner.length : 0,
      topPairs: inner.sort((a, b) => b.lift - a.lift).slice(0, 5),
    });
  }
  return families
    .sort((a, b) => b.offenders - a.offenders || b.size - a.size)
    .slice(0, maxFamilies);
}

/** Inverse-document-frequency weight — rare shared tags bind harder. */
export function idf(df, tag, n) {
  const d = df.get(tag) || 0;
  if (!d) return 0;
  return Math.log((n + 1) / (d + 1));
}
