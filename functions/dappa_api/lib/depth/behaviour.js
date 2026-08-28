'use strict';
// Corpus-wide behavioural analytics over the career corpus (lib/depth/corpus.js):
//   escalation()     gravity transition matrix + per-offender ladder + watchlist
//   moTransitions()  which offence type follows which across careers
//   recidivism()     Kaplan–Meier time-to-next-case by case-count band and family
//   reactivation()   co-offending pairs dormant ≥ 12 months that resurfaced
//   corridors()      district-hop sequences aggregated into corridor arcs
// Pure functions: corpus in, JSON out. Pinned by test/round2/phase8-depth.test.mjs.

const { round, ymAdd } = require('../util');
const an = require('../analytics');
const {
  BANDS, bandOfGravity, bandIndex, normalisedEntropy, kaplanMeier, mean, median,
  dayToIso, districtInfo
} = require('./common');
const { caseIndexOf } = require('./corpus');

const HEAD_NAMES = { 1: 'Crimes Against Body', 2: 'Crimes Against Women', 3: 'Property Crimes', 4: 'Economic Offences', 5: 'Cyber Crimes', 6: 'Public Order', 7: 'Narcotics', 8: 'Others' };

function anchorDay(corpus) {
  // The window's last day: the anchor month's final case day across the corpus,
  // falling back to the anchor month's 28th when no case lands in it.
  let last = null;
  for (const p of corpus.persons) for (const c of p.cases) if (last === null || c.day > last) last = c.day;
  return last;
}

function monthsBetweenDays(a, b) {
  return (b - a) / 30.4375;
}

// ---------------------------------------------------------------------------
// Escalation ladder
// ---------------------------------------------------------------------------
function escalation(corpus, opts) {
  const o = opts || {};
  const minCases = Math.max(2, o.minCases || 3);
  const watchSize = Math.max(5, Math.min(200, o.watchSize || 40));
  const k = BANDS.length;
  const counts = BANDS.map(() => BANDS.map(() => 0));
  const firstBand = BANDS.map(() => 0);
  const lastBand = BANDS.map(() => 0);
  const ladders = [];
  let transitions = 0;
  let personsMeasured = 0;
  const lastDay = anchorDay(corpus);
  const recentFrom = lastDay === null ? null : lastDay - 365;

  for (const p of corpus.persons) {
    const seq = p.cases.map((c) => bandIndex(bandOfGravity(c.gravity)));
    if (seq.length < 2) continue;
    for (let i = 1; i < seq.length; i += 1) {
      counts[seq[i - 1]][seq[i]] += 1;
      transitions += 1;
    }
    if (seq.length < minCases) continue;
    personsMeasured += 1;
    firstBand[seq[0]] += 1;
    lastBand[seq[seq.length - 1]] += 1;
    const mid = Math.floor(seq.length / 2);
    const earlyG = mean(p.cases.slice(0, mid).map((c) => c.gravity));
    const lateG = mean(p.cases.slice(mid).map((c) => c.gravity));
    let ups = 0; let downs = 0;
    for (let i = 1; i < seq.length; i += 1) {
      if (seq[i] > seq[i - 1]) ups += 1; else if (seq[i] < seq[i - 1]) downs += 1;
    }
    // A rung climbed inside the last 12 months is what makes the flag current.
    let recentUp = false;
    for (let i = 1; i < seq.length; i += 1) {
      if (recentFrom !== null && p.cases[i].day >= recentFrom && seq[i] > seq[i - 1]) recentUp = true;
    }
    const mix = new Map();
    for (const c of p.cases) mix.set(c.subHeadId, (mix.get(c.subHeadId) || 0) + 1);
    const headMix = new Map();
    for (const c of p.cases) headMix.set(c.headId, (headMix.get(c.headId) || 0) + 1);
    const dominantHead = [...headMix.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const last = p.cases[p.cases.length - 1];
    ladders.push({
      personKey: p.key,
      name: p.name,
      riskScore: p.riskScore,
      caseCount: p.caseCount,
      casesDated: seq.length,
      // Share of the profile's cases the corpus actually dated: NetworkEdge
      // only carries cases with a co-accused and the edge walk is bounded, so
      // a trajectory read on a thin slice of a long career is not a trajectory.
      coverage: round(seq.length / Math.max(1, p.caseCount, seq.length), 3),
      firstBand: BANDS[seq[0]],
      lastBand: BANDS[seq[seq.length - 1]],
      peakBand: BANDS[Math.max(...seq)],
      netRungs: seq[seq.length - 1] - seq[0],
      ups,
      downs,
      earlyGravity: round(earlyG, 2),
      lateGravity: round(lateG, 2),
      gravityDelta: round(lateG - earlyG, 2),
      recentUp,
      specialisation: round(1 - normalisedEntropy([...mix.values()]), 3),
      offenceTypes: mix.size,
      dominantHead: dominantHead ? HEAD_NAMES[dominantHead[0]] || String(dominantHead[0]) : null,
      lastCaseDate: last.date,
      monthsSinceLast: lastDay === null ? null : round(monthsBetweenDays(last.day, lastDay), 1),
      verdict: null
    });
  }

  for (const l of ladders) {
    if (l.gravityDelta >= 1 || (l.recentUp && l.netRungs > 0)) l.verdict = 'escalating';
    else if (l.gravityDelta <= -1 || l.netRungs < 0) l.verdict = 'de-escalating';
    else l.verdict = 'stable';
  }

  const matrix = counts.map((row, i) => {
    const total = row.reduce((s, n) => s + n, 0);
    return {
      from: BANDS[i],
      total,
      to: row.map((n, j) => ({ band: BANDS[j], count: n, p: total ? round(n / total, 3) : null }))
    };
  });
  let up = 0; let down = 0; let same = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      if (j > i) up += counts[i][j]; else if (j < i) down += counts[i][j]; else same += counts[i][j];
    }
  }
  const wellCovered = (l) => l.coverage >= 0.5 || l.casesDated >= 10;
  const watchlist = ladders
    .filter((l) => l.verdict === 'escalating' && wellCovered(l))
    .sort((a, b) => b.gravityDelta - a.gravityDelta || b.riskScore - a.riskScore || a.personKey.localeCompare(b.personKey))
    .slice(0, watchSize);

  return {
    bands: BANDS,
    matrix,
    summary: {
      transitions,
      upShare: transitions ? round(up / transitions, 3) : null,
      downShare: transitions ? round(down / transitions, 3) : null,
      sameShare: transitions ? round(same / transitions, 3) : null,
      personsMeasured,
      escalating: ladders.filter((l) => l.verdict === 'escalating').length,
      deEscalating: ladders.filter((l) => l.verdict === 'de-escalating').length,
      stable: ladders.filter((l) => l.verdict === 'stable').length,
      firstBand: BANDS.map((b, i) => ({ band: b, persons: firstBand[i] })),
      lastBand: BANDS.map((b, i) => ({ band: b, persons: lastBand[i] })),
      medianSpecialisation: median(ladders.map((l) => l.specialisation)),
      windowEnd: lastDay === null ? null : dayToIso(lastDay)
    },
    watchlist,
    ladders: ladders.length,
    params: { minCases, watchSize },
    method: 'Each dated case is placed on a four-rung gravity ladder (petty 1-3, moderate 4-5, serious 6-8, heinous 9-10 on the sub-head gravity scale). The matrix counts consecutive-case transitions across every admitted career; row shares are P(next rung | this rung). A person is escalating when the mean gravity of the later half of their history exceeds the earlier half by ≥ 1 rung-point, or a rung was climbed in the last 12 months with a net rise; the watchlist keeps only people whose dated cases cover at least half of their profile case count (or ten or more cases), because the edge walk is bounded and a thin slice of a long career is not a trajectory. Specialisation = 1 − normalised entropy of the offence-type mix (0 spread, 1 single type).'
  };
}

// ---------------------------------------------------------------------------
// Offence-type (MO) transition matrix across careers
// ---------------------------------------------------------------------------
function moTransitions(corpus, lk, opts) {
  const o = opts || {};
  const topK = Math.max(4, Math.min(16, o.topK || 10));
  const from = new Map();
  const pairCount = new Map();
  const freq = new Map();
  let total = 0;
  for (const p of corpus.persons) {
    for (let i = 0; i < p.cases.length; i += 1) {
      const s = p.cases[i].subHeadId;
      freq.set(s, (freq.get(s) || 0) + 1);
      if (i === 0) continue;
      const a = p.cases[i - 1].subHeadId;
      from.set(a, (from.get(a) || 0) + 1);
      const key = `${a}>${s}`;
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
      total += 1;
    }
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, topK).map(([id]) => id);
  const name = (id) => (lk ? lk.subHeadName(id) : String(id));
  const matrix = top.map((a) => ({
    fromId: a,
    from: name(a),
    total: from.get(a) || 0,
    to: top.map((b) => {
      const c = pairCount.get(`${a}>${b}`) || 0;
      return { toId: b, to: name(b), count: c, p: from.get(a) ? round(c / from.get(a), 3) : null };
    })
  }));
  const into = new Map();
  for (const [key, c] of pairCount) {
    const b = Number(key.split('>')[1]);
    into.set(b, (into.get(b) || 0) + c);
  }
  const pairs = [];
  for (const [key, c] of pairCount) {
    const [a, b] = key.split('>').map(Number);
    const pB = total ? (into.get(b) || 0) / total : 0;
    const pBgivenA = from.get(a) ? c / from.get(a) : 0;
    pairs.push({
      fromId: a, toId: b, from: name(a), to: name(b), count: c,
      pNext: round(pBgivenA, 3),
      lift: pB > 0 ? round(pBgivenA / pB, 2) : null,
      switch: a !== b
    });
  }
  pairs.sort((x, y) => y.count - x.count || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  const stay = pairs.filter((p) => !p.switch).reduce((s, p) => s + p.count, 0);
  return {
    subHeads: top.map((id) => ({ id, name: name(id), cases: freq.get(id) })),
    matrix,
    topPairs: pairs.slice(0, 25),
    topSwitches: pairs.filter((p) => p.switch && p.count >= 2).sort((x, y) => (y.lift || 0) - (x.lift || 0) || y.count - x.count).slice(0, 12),
    summary: { transitions: total, stayShare: total ? round(stay / total, 3) : null, distinctSubHeads: freq.size },
    method: 'For every admitted career the offence sub-head of each case is paired with the sub-head of the next dated case. P(next) is the row share; lift = P(next | this) ÷ P(next) over the corpus, so a lift above 1 means the second offence follows the first more often than its overall frequency would give.'
  };
}

// ---------------------------------------------------------------------------
// Recidivism: Kaplan–Meier time to the next case
// ---------------------------------------------------------------------------
const KM_GRID = [30, 60, 90, 180, 365, 540, 730];

function countBand(n) {
  if (n >= 7) return '7+';
  if (n >= 4) return '4-6';
  return '2-3';
}

function recidivism(corpus) {
  const lastDay = anchorDay(corpus);
  const all = [];
  const byBand = new Map();
  const byFamily = new Map();
  let persons = 0;
  for (const p of corpus.persons) {
    if (p.cases.length < 2) continue;
    persons += 1;
    const heads = new Map();
    for (const c of p.cases) heads.set(c.headId, (heads.get(c.headId) || 0) + 1);
    const dom = [...heads.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const family = HEAD_NAMES[dom] || String(dom);
    const band = countBand(Math.max(p.caseCount, p.cases.length));
    const obs = [];
    for (let i = 1; i < p.cases.length; i += 1) obs.push({ t: p.cases[i].day - p.cases[i - 1].day, event: true });
    if (lastDay !== null) obs.push({ t: lastDay - p.cases[p.cases.length - 1].day, event: false });
    all.push(...obs);
    if (!byBand.has(band)) byBand.set(band, []);
    byBand.get(band).push(...obs);
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(...obs);
  }
  const curve = (obs) => kaplanMeier(obs, KM_GRID);
  const groups = (m) => [...m.entries()]
    .map(([label, obs]) => Object.assign({ label }, curve(obs)))
    .filter((g) => g.n >= 5)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const overall = curve(all);
  return {
    grid: KM_GRID,
    overall,
    byCaseCount: groups(byBand).sort((a, b) => a.label.localeCompare(b.label)),
    byFamily: groups(byFamily),
    summary: {
      persons,
      intervals: all.length,
      events: overall.events,
      censored: overall.censored,
      medianDays: overall.medianDays,
      within90: overall.grid.find((g) => g.t === 90) ? round(1 - overall.grid.find((g) => g.t === 90).s, 3) : null,
      within365: overall.grid.find((g) => g.t === 365) ? round(1 - overall.grid.find((g) => g.t === 365).s, 3) : null,
      windowEnd: lastDay === null ? null : dayToIso(lastDay)
    },
    method: 'Every gap between consecutive dated cases of a person is one observed interval; the gap from the last case to the end of the data window is a censored interval (no next case seen yet). Kaplan–Meier S(t) = Π(1 − dᵢ/nᵢ) is the share still case-free t days after a case. Groups: the person\'s case-count band and their dominant crime head ("family").'
  };
}

// ---------------------------------------------------------------------------
// Co-offending pair re-activation after dormancy
// ---------------------------------------------------------------------------
function reactivation(corpus, opts) {
  const o = opts || {};
  const dormantDays = Math.max(90, o.dormantDays || 365);
  const recentDays = Math.max(30, o.recentDays || 365);
  const idx = caseIndexOf(corpus);
  const nameOf = new Map(corpus.persons.map((p) => [p.key, p.name]));
  const lastDay = anchorDay(corpus);
  const rows = [];
  let pairsWithHistory = 0;
  let dormantNow = 0;
  for (const e of corpus.pairs) {
    const days = an.uniq(e.caseIds.map((id) => idx.get(id)).filter(Boolean).map((c) => c.day)).sort((a, b) => a - b);
    if (days.length < 2) continue;
    pairsWithHistory += 1;
    let bestGap = 0; let gapEnd = null;
    for (let i = 1; i < days.length; i += 1) {
      const g = days[i] - days[i - 1];
      if (g >= dormantDays && g > bestGap) { bestGap = g; gapEnd = days[i]; }
    }
    const last = days[days.length - 1];
    if (lastDay !== null && lastDay - last >= dormantDays) dormantNow += 1;
    if (gapEnd === null) continue;
    if (lastDay !== null && lastDay - gapEnd > recentDays) continue;
    rows.push({
      a: e.a, b: e.b,
      nameA: nameOf.get(e.a) || e.a, nameB: nameOf.get(e.b) || e.b,
      sharedCases: days.length,
      dormantDays: bestGap,
      dormantMonths: round(bestGap / 30.4375, 1),
      quietFrom: dayToIso(gapEnd - bestGap),
      reactivatedOn: dayToIso(gapEnd),
      casesSince: days.filter((d) => d >= gapEnd).length
    });
  }
  rows.sort((x, y) => y.dormantDays - x.dormantDays || y.sharedCases - x.sharedCases || x.a.localeCompare(y.a));
  return {
    pairs: rows.slice(0, 60),
    summary: {
      pairsScanned: corpus.pairs.length,
      pairsWithHistory,
      reactivated: rows.length,
      dormantNow,
      windowEnd: lastDay === null ? null : dayToIso(lastDay)
    },
    params: { dormantDays, recentDays },
    method: 'A co-offending pair is the two people on a NetworkEdge; its shared cases are dated through CaseMaster. The pair is re-activated when a gap of at least the dormancy threshold separates two shared cases and the case that ends the gap falls inside the recent window. "Dormant now" counts pairs whose last shared case is older than the threshold as of the window end.'
  };
}

// ---------------------------------------------------------------------------
// Travelling-offender corridors
// ---------------------------------------------------------------------------
function corridors(corpus, lk, opts) {
  const o = opts || {};
  const top = Math.max(5, Math.min(60, o.top || 25));
  const arcs = new Map();
  const travellers = [];
  let hops = 0;
  const districtName = (id) => (lk ? lk.districtName(id) : id);
  for (const p of corpus.persons) {
    const seq = p.cases.filter((c) => c.districtId).map((c) => c.districtId);
    let personHops = 0;
    const visited = new Set(seq);
    for (let i = 1; i < seq.length; i += 1) {
      if (seq[i] === seq[i - 1]) continue;
      personHops += 1;
      hops += 1;
      const key = `${seq[i - 1]}>${seq[i]}`;
      if (!arcs.has(key)) arcs.set(key, { from: seq[i - 1], to: seq[i], hops: 0, persons: new Set() });
      const a = arcs.get(key);
      a.hops += 1;
      a.persons.add(p.key);
    }
    if (personHops > 0) {
      travellers.push({ personKey: p.key, name: p.name, riskScore: p.riskScore, hops: personHops, districts: visited.size, cases: seq.length });
    }
  }
  const rows = [...arcs.values()].map((a) => {
    const f = districtInfo(a.from); const t = districtInfo(a.to);
    return {
      from: a.from, to: a.to,
      fromName: districtName(a.from), toName: districtName(a.to),
      fromLat: f ? f.lat : null, fromLng: f ? f.lng : null,
      toLat: t ? t.lat : null, toLng: t ? t.lng : null,
      hops: a.hops, persons: a.persons.size
    };
  }).sort((x, y) => y.hops - x.hops || y.persons - x.persons || x.from.localeCompare(y.from));
  // Undirected view: A⇄B combined, so the map draws one arc per pair.
  const undirected = new Map();
  for (const r of rows) {
    const k = [r.from, r.to].sort().join('~');
    if (!undirected.has(k)) undirected.set(k, Object.assign({}, r, { hops: 0, persons: 0, forward: 0, backward: 0 }));
    const u = undirected.get(k);
    u.hops += r.hops;
    u.persons += r.persons;
    if (u.from === r.from) u.forward += r.hops; else u.backward += r.hops;
  }
  travellers.sort((a, b) => b.hops - a.hops || b.districts - a.districts || a.personKey.localeCompare(b.personKey));
  return {
    arcs: [...undirected.values()].sort((x, y) => y.hops - x.hops || x.from.localeCompare(y.from)).slice(0, top),
    directed: rows.slice(0, top),
    travellers: travellers.slice(0, 15),
    summary: {
      persons: corpus.persons.length,
      travellers: travellers.length,
      hops,
      corridors: undirected.size,
      shareTravelling: corpus.persons.length ? round(travellers.length / corpus.persons.length, 3) : null
    },
    method: 'Each person\'s dated cases are read in order; every change of district between consecutive cases is one hop. Hops are summed per ordered district pair (a corridor) and shown as arcs between the Appendix C district centroids. A traveller is anyone with at least one hop.'
  };
}

module.exports = { escalation, moTransitions, recidivism, reactivation, corridors, anchorDay, countBand, HEAD_NAMES, KM_GRID };
