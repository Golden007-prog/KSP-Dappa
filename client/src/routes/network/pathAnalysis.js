// Deeper link analysis for the Network Explorer: ranked multi-hop routes,
// temporal edge evolution, and a switchable link-prediction scorer.
//
// A single shortest path answers "are these two connected?". An investigator
// also needs "how ELSE are they connected, and which route survives if the
// obvious associate is unavailable?" — that is what k-shortest paths gives.
// Everything here is pure and explicitly budgeted; nothing silently melts the
// main thread on the live 23,833-edge graph.
import { edgeKey, shortestPath } from './graphUtils.js';
import { adjacency, strongestPath } from './analysis.js';

/** Σ shared FIRs along a node path, plus the weakest hop (the break point). */
function pathStats(path, weightByKey) {
  let strength = 0;
  let minLink = Infinity;
  let bottleneck = null;
  for (let i = 0; i < path.length - 1; i += 1) {
    const w = weightByKey.get(edgeKey(path[i], path[i + 1])) || 0;
    strength += w;
    if (w < minLink) { minLink = w; bottleneck = [path[i], path[i + 1]]; }
  }
  return {
    strength,
    minLink: Number.isFinite(minLink) ? minLink : 0,
    bottleneck,
    hops: Math.max(0, path.length - 1),
  };
}

/**
 * Yen's k-shortest loopless paths over the visible edge set.
 *
 * mode 'hops'     — BFS base path (fewest intermediaries)
 * mode 'strength' — Dijkstra on 1/sharedFIRs (best-evidenced route)
 *
 * Each candidate spur re-runs the base search on a pruned edge list, so the
 * cost is O(k · pathLength · search). With k ≤ 6 on a capped canvas that is a
 * few milliseconds; `maxHops` additionally discards routes too long to brief.
 * Returns [{path, hops, strength, minLink, bottleneck, distinct}] ranked best
 * first, where `distinct` counts nodes not present on the top route.
 */
export function kShortestPaths(edges = [], from, to, { k = 5, mode = 'hops', maxHops = 7 } = {}) {
  const a = String(from ?? '');
  const b = String(to ?? '');
  if (!a || !b || a === b) return [];
  const weightByKey = new Map();
  for (const e of edges) weightByKey.set(edgeKey(e.source, e.target), Number(e.weight) || 1);

  const solve = (list, s, t) => (mode === 'strength' ? strongestPath(list, s, t) : shortestPath(list, s, t));
  const first = solve(edges, a, b);
  if (!first || first.length - 1 > maxHops) return [];

  const accepted = [first];
  const seen = new Set([first.join('>')]);
  const candidates = [];

  for (let round = 1; round < k; round += 1) {
    const prev = accepted[accepted.length - 1];
    for (let i = 0; i < prev.length - 1; i += 1) {
      const spur = prev[i];
      const root = prev.slice(0, i + 1);
      const bannedEdges = new Set();
      for (const p of accepted) {
        if (p.length > i && p.slice(0, i + 1).join('>') === root.join('>')) {
          bannedEdges.add(edgeKey(p[i], p[i + 1]));
        }
      }
      const bannedNodes = new Set(root.slice(0, -1));
      const pruned = edges.filter((e) => {
        const s = String(e.source); const t = String(e.target);
        if (bannedNodes.has(s) || bannedNodes.has(t)) return false;
        return !bannedEdges.has(edgeKey(s, t));
      });
      const spurPath = solve(pruned, spur, b);
      if (!spurPath) continue;
      const full = root.slice(0, -1).concat(spurPath);
      if (full.length - 1 > maxHops) continue;
      const sig = full.join('>');
      if (seen.has(sig)) continue;
      if (new Set(full).size !== full.length) continue; // loopless
      seen.add(sig);
      candidates.push(full);
    }
    if (!candidates.length) break;
    candidates.sort((x, y) => {
      const sx = pathStats(x, weightByKey);
      const sy = pathStats(y, weightByKey);
      return mode === 'strength'
        ? sy.strength / Math.max(1, sy.hops) - sx.strength / Math.max(1, sx.hops) || sx.hops - sy.hops
        : sx.hops - sy.hops || sy.strength - sx.strength;
    });
    accepted.push(candidates.shift());
  }

  const core = new Set(accepted[0]);
  return accepted.map((path, i) => {
    const st = pathStats(path, weightByKey);
    return {
      rank: i + 1,
      path,
      ...st,
      distinct: path.filter((n) => !core.has(n)).length,
    };
  });
}

// --- temporal link evolution -------------------------------------------------

export const PERIOD_GRAINS = ['year', 'quarter'];

/** 'YYYY-MM-DD' → '2024' or '2024-Q3'. */
export function periodOf(dateStr, grain = 'year') {
  const s = String(dateStr || '');
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return '';
  if (grain === 'quarter') return `${m[1]}-Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
  return m[1];
}

/**
 * Bucket the visible edges into periods using the sampled FIR dates.
 *
 * Only the FIRs in the loaded evidence sample carry a registration date, so an
 * edge is datable when at least one of its case ids was sampled. `coverage`
 * reports exactly what share of edges that is — a period slider over 12% of the
 * graph is useful, but only if it says so.
 * Returns {periods, byPeriod:Map(period→Set(edgeId)), datedEdges, totalEdges,
 *          coverage, counts:Map(period→{edges, newEdges})}.
 */
export function edgeTimeline(edges = [], dateByCase = new Map(), { grain = 'year' } = {}) {
  const byPeriod = new Map();
  const firstPeriod = new Map();
  let dated = 0;
  for (const e of edges) {
    const id = e.id || edgeKey(e.source, e.target);
    let earliest = '';
    const hits = [];
    for (const cid of e.caseIds || []) {
      const d = dateByCase.get(String(cid));
      if (!d) continue;
      hits.push(d);
      if (!earliest || d < earliest) earliest = d;
    }
    if (!hits.length) continue;
    dated += 1;
    for (const d of hits) {
      const p = periodOf(d, grain);
      if (!p) continue;
      if (!byPeriod.has(p)) byPeriod.set(p, new Set());
      byPeriod.get(p).add(id);
    }
    const fp = periodOf(earliest, grain);
    if (fp) firstPeriod.set(id, fp);
  }
  const periods = [...byPeriod.keys()].sort();
  const counts = new Map();
  for (const p of periods) {
    let newEdges = 0;
    for (const [, fp] of firstPeriod) if (fp === p) newEdges += 1;
    counts.set(p, { edges: byPeriod.get(p).size, newEdges });
  }
  return {
    periods,
    byPeriod,
    firstPeriod,
    counts,
    datedEdges: dated,
    totalEdges: edges.length,
    coverage: edges.length ? dated / edges.length : 0,
  };
}

// --- switchable link prediction ----------------------------------------------

export const PREDICT_METHODS = ['adamic', 'common', 'jaccard', 'pref'];

// A hub co-offending with 200 people manufactures 20,000 meaningless candidate
// pairs; every scorer here except preferential attachment is meant to REWARD
// low-profile shared associates, so hubs are skipped as intermediaries.
const HUB_CAP = 80;
const BUDGET = 1500000;

/**
 * Candidate hidden associations, scored by the analyst's chosen statistic.
 *
 *   adamic  — Σ 1/ln(deg(w)) over common associates (rare associates weigh more)
 *   common  — plain count of common associates
 *   jaccard — |common| / |union of the two neighbourhoods|
 *   pref    — deg(u)·deg(v), the preferential-attachment baseline
 *
 * Offering the switch matters: Adamic–Adar and preferential attachment
 * disagree hard on hubs, and a suggestion that survives both readings is a
 * different quality of lead from one that only one statistic likes.
 * Returns {rows:[{a,b,common,score,via}], truncated, considered, method}.
 */
export function predictLinksBy(edges = [], { method = 'adamic', limit = 12, budget = BUDGET } = {}) {
  const adj = adjacency(edges);
  const nbrs = new Map();
  for (const [id, list] of adj) nbrs.set(id, new Set(list));
  const linked = new Set(edges.map((e) => edgeKey(e.source, e.target)));
  const degOf = new Map();
  for (const [id, set] of nbrs) degOf.set(id, set.size);

  const cand = new Map();
  let steps = 0;
  let truncated = false;
  outer:
  for (const [u, uset] of nbrs) {
    for (const w of uset) {
      const wd = degOf.get(w) || 0;
      if (wd < 2 || (method !== 'pref' && wd > HUB_CAP)) continue;
      const weight = method === 'adamic' ? 1 / Math.log(Math.max(2.001, wd)) : 1;
      for (const v of nbrs.get(w) || []) {
        steps += 1;
        if (steps > budget) { truncated = true; break outer; }
        if (v === u || uset.has(v) || u >= v) continue;
        const key = `${u}~~${v}`;
        if (linked.has(key)) continue;
        let c = cand.get(key);
        if (!c) { c = { a: u, b: v, common: 0, raw: 0, via: [] }; cand.set(key, c); }
        c.common += 1;
        c.raw += weight;
        if (c.via.length < 6) c.via.push(w);
      }
    }
  }

  const rows = [...cand.values()]
    .filter((c) => c.common >= 2)
    .map((c) => {
      let score = c.raw;
      if (method === 'common') score = c.common;
      else if (method === 'jaccard') {
        const A = nbrs.get(c.a) || new Set();
        const B = nbrs.get(c.b) || new Set();
        const union = new Set([...A, ...B]).size;
        score = union ? c.common / union : 0;
      } else if (method === 'pref') {
        score = (degOf.get(c.a) || 0) * (degOf.get(c.b) || 0);
      }
      return { a: c.a, b: c.b, common: c.common, score, via: c.via };
    })
    .sort((x, y) => y.score - x.score || y.common - x.common || x.a.localeCompare(y.a))
    .slice(0, limit);

  return { rows, truncated, considered: cand.size, method };
}

/**
 * Agreement across all four scorers for one candidate set. A pair ranked in the
 * top slice by three or four independent statistics is a materially stronger
 * suggestion than one only Adamic–Adar likes; the count rides along on every
 * row so the UI can say so instead of asserting a single ranking as truth.
 */
export function consensusPredictions(edges = [], { limit = 12, poolPerMethod = 40 } = {}) {
  const tally = new Map();
  for (const method of PREDICT_METHODS) {
    const { rows } = predictLinksBy(edges, { method, limit: poolPerMethod });
    rows.forEach((r, i) => {
      const key = `${r.a}~~${r.b}`;
      let t = tally.get(key);
      if (!t) { t = { a: r.a, b: r.b, common: r.common, via: r.via, methods: [], bestRank: Infinity, score: 0 }; tally.set(key, t); }
      t.methods.push(method);
      t.bestRank = Math.min(t.bestRank, i + 1);
      if (method === 'adamic') t.score = r.score;
    });
  }
  return [...tally.values()]
    .sort((x, y) => y.methods.length - x.methods.length || x.bestRank - y.bestRank || y.common - x.common)
    .slice(0, limit);
}
