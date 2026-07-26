// Link-analysis engine for the Network Explorer / Offender views.
//
// Everything here is pure and sized for the LIVE volumes: 23,833 NetworkEdge
// rows across 2,048 OffenderProfile rows (2,002 of them linked, median degree
// 6, max degree 263). The expensive routines therefore carry explicit budgets
// and report `truncated` rather than silently melting the main thread — an
// analyst is told when a number is a bounded estimate.
//
// Nothing in this file touches React, so the algorithms stay testable and the
// route components stay about layout.
import { edgeKey } from './graphUtils.js';

/** Adjacency as Map(id → [neighborId]) over an undirected edge list. */
export function adjacency(edges = []) {
  const adj = new Map();
  const push = (a, b) => {
    let list = adj.get(a);
    if (!list) { list = []; adj.set(a, list); }
    list.push(b);
  };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t) continue;
    push(s, t); push(t, s);
  }
  return adj;
}

/**
 * True co-offending degree per person, read off the edges rather than the
 * OffenderProfile.DegreeCentrality column (which the API forwards as a
 * NORMALIZED 0–1 centrality — 0.0205 for a person with 41 co-accused links).
 * Returns Map(id → {links, weight, cases}) where
 *   links  = distinct co-accused partners
 *   weight = Σ shared FIRs across those links
 *   cases  = distinct case ids seen on those links
 */
export function degreeIndex(edges = []) {
  const out = new Map();
  const touch = (id) => {
    let s = out.get(id);
    if (!s) { s = { links: 0, weight: 0, caseSet: new Set() }; out.set(id, s); }
    return s;
  };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t) continue;
    const w = Number(e.weight) || 1;
    const a = touch(s); const b = touch(t);
    a.links += 1; b.links += 1;
    a.weight += w; b.weight += w;
    for (const cid of e.caseIds || []) { a.caseSet.add(String(cid)); b.caseSet.add(String(cid)); }
  }
  const final = new Map();
  for (const [id, s] of out) final.set(id, { links: s.links, weight: s.weight, cases: s.caseSet.size });
  return final;
}

/**
 * k-core decomposition (Batagelj–Zaveršnik peeling, O(V+E)). A person's
 * coreness k means they sit inside a subgraph where EVERYONE has at least k
 * co-accused links — the standard structural read on "who is in the hard core
 * of this network" versus who hangs off its fringe.
 * Returns {core: Map(id → coreness), maxCore}.
 */
export function corenessMap(nodes = [], edges = []) {
  const ids = nodes.map((n) => String(n.id));
  const idSet = new Set(ids);
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t || !idSet.has(s) || !idSet.has(t)) continue;
    adj.get(s).push(t);
    adj.get(t).push(s);
  }
  const deg = new Map(ids.map((id) => [id, adj.get(id).length]));
  const order = [...ids].sort((a, b) => deg.get(a) - deg.get(b));
  const pos = new Map(order.map((id, i) => [id, i]));
  const core = new Map(ids.map((id) => [id, 0]));
  const removed = new Set();
  let maxCore = 0;
  // Simple peel: re-sortless removal by repeatedly taking the current minimum.
  // The bucket structure below keeps this linear-ish for our sizes.
  const buckets = new Map();
  for (const id of ids) {
    const d = deg.get(id);
    if (!buckets.has(d)) buckets.set(d, new Set());
    buckets.get(d).add(id);
  }
  let k = 0;
  for (let processed = 0; processed < ids.length; processed += 1) {
    let d = k;
    while (d <= ids.length && (!buckets.get(d) || !buckets.get(d).size)) d += 1;
    if (d > ids.length) break;
    k = Math.max(k, d);
    const set = buckets.get(d);
    const id = set.values().next().value;
    set.delete(id);
    removed.add(id);
    core.set(id, k);
    if (k > maxCore) maxCore = k;
    for (const nb of adj.get(id) || []) {
      if (removed.has(nb)) continue;
      const od = deg.get(nb);
      if (od > d) {
        buckets.get(od)?.delete(nb);
        const nd = od - 1;
        deg.set(nb, nd);
        if (!buckets.has(nd)) buckets.set(nd, new Set());
        buckets.get(nd).add(nb);
      }
    }
  }
  void pos;
  return { core, maxCore };
}

/**
 * Local clustering for ONE person: how tightly their co-accused know each
 * other. A coefficient near 1 says "closed cell"; near 0 says "hub who
 * introduces otherwise-unconnected people" (a courier / fence signature).
 */
export function clusteringOf(edges = [], id) {
  const key = String(id ?? '');
  if (!key) return { degree: 0, triangles: 0, coeff: 0 };
  const adj = adjacency(edges);
  const nbrs = [...new Set(adj.get(key) || [])];
  const d = nbrs.length;
  if (d < 2) return { degree: d, triangles: 0, coeff: 0 };
  const nbrSet = new Set(nbrs);
  let triangles = 0;
  for (const u of nbrs) {
    for (const w of adj.get(u) || []) {
      if (w !== key && nbrSet.has(w) && u < w) triangles += 1;
    }
  }
  return { degree: d, triangles, coeff: (2 * triangles) / (d * (d - 1)) };
}

// A hub that co-offends with 200 people manufactures 20,000 meaningless
// "candidate" pairs; Adamic–Adar already discounts them, so we skip them
// outright and keep the suggestion list about genuine small-world evidence.
const HUB_CAP = 80;
// 1.5M steps ≈ 290 ms on the 400-node / 8.8k-edge default view, measured
// against the live edge table. Past that the scan reports `truncated` instead
// of blocking the render further.
const PREDICT_BUDGET = 1500000;

/**
 * Hidden-association prediction over the visible graph. For every pair that is
 * NOT already linked we score the shared-associate evidence with Adamic–Adar
 * (Σ 1/ln(degree) over common associates), which is the standard link-
 * prediction statistic for co-offending networks: two people who share four
 * low-profile associates are far more suspicious than two who share one hub.
 * Returns {rows:[{a,b,common,score,via}], truncated, considered}.
 */
export function predictLinks(edges = [], { limit = 12, budget = PREDICT_BUDGET } = {}) {
  const adj = adjacency(edges);
  const linked = new Set(edges.map((e) => edgeKey(e.source, e.target)));
  const degOf = new Map();
  for (const [id, list] of adj) degOf.set(id, new Set(list).size);
  const cand = new Map();
  let steps = 0;
  let truncated = false;
  outer:
  for (const [u, list] of adj) {
    const seen = new Set(list);
    for (const w of new Set(list)) {
      const wd = degOf.get(w) || 0;
      if (wd < 2 || wd > HUB_CAP) continue;
      const weight = 1 / Math.log(Math.max(2.001, wd));
      for (const v of adj.get(w) || []) {
        steps += 1;
        if (steps > budget) { truncated = true; break outer; }
        if (v === u || seen.has(v) || u >= v) continue;
        const k = `${u}~~${v}`;
        if (linked.has(k)) continue;
        let c = cand.get(k);
        if (!c) { c = { a: u, b: v, common: 0, score: 0, via: [] }; cand.set(k, c); }
        c.common += 1;
        c.score += weight;
        if (c.via.length < 6) c.via.push(w);
      }
    }
  }
  const rows = [...cand.values()]
    .filter((c) => c.common >= 2)
    .sort((x, y) => y.score - x.score || y.common - x.common || x.a.localeCompare(y.a))
    .slice(0, limit);
  return { rows, truncated, considered: cand.size };
}

/**
 * Structural bridges (cut EDGES) — links whose removal splits a component in
 * two. In a co-offending graph these are the single shared FIRs holding two
 * otherwise separate crews together: the highest-value corroboration targets.
 * Iterative Tarjan low-link. Returns Set of canonical edge keys.
 */
export function bridgeEdges(nodes = [], edges = []) {
  const ids = nodes.map((n) => String(n.id));
  const idSet = new Set(ids);
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t || !idSet.has(s) || !idSet.has(t)) continue;
    adj.get(s).push(t);
    adj.get(t).push(s);
  }
  const disc = new Map(); const low = new Map(); const parent = new Map();
  const out = new Set();
  let time = 0;
  for (const root of ids) {
    if (disc.has(root)) continue;
    parent.set(root, null);
    disc.set(root, time); low.set(root, time); time += 1;
    const stack = [[root, 0]];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const u = frame[0];
      const nbrs = adj.get(u) || [];
      if (frame[1] < nbrs.length) {
        const v = nbrs[frame[1]];
        frame[1] += 1;
        if (!disc.has(v)) {
          parent.set(v, u);
          disc.set(v, time); low.set(v, time); time += 1;
          stack.push([v, 0]);
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u), disc.get(v)));
        }
      } else {
        stack.pop();
        const p = parent.get(u);
        if (p !== null && p !== undefined) {
          low.set(p, Math.min(low.get(p), low.get(u)));
          if (low.get(u) > disc.get(p)) out.add(edgeKey(p, u));
        }
      }
    }
  }
  return out;
}

/**
 * Strongest-evidence path — Dijkstra with cost 1/weight, so the route prefers
 * repeat co-offending over a chain of one-off FIRs even when that means an
 * extra hop. Complements the BFS fewest-hops path in graphUtils.
 * Returns [nodeId,…] or null.
 */
export function strongestPath(edges = [], from, to) {
  const a = String(from ?? ''); const b = String(to ?? '');
  if (!a || !b) return null;
  if (a === b) return [a];
  const adj = new Map();
  const push = (x, y, w) => {
    let l = adj.get(x);
    if (!l) { l = []; adj.set(x, l); }
    l.push([y, w]);
  };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t) continue;
    const w = Math.max(1, Number(e.weight) || 1);
    push(s, t, 1 / w); push(t, s, 1 / w);
  }
  if (!adj.has(a) || !adj.has(b)) return null;
  const dist = new Map([[a, 0]]);
  const prev = new Map([[a, null]]);
  const done = new Set();
  // Linear-scan frontier: the visible view is capped in the hundreds of nodes,
  // where a binary heap costs more in allocation than it saves in scanning.
  for (;;) {
    let best = null; let bestD = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < bestD) { best = id; bestD = d; }
    }
    if (best === null) return null;
    if (best === b) break;
    done.add(best);
    for (const [nb, w] of adj.get(best) || []) {
      if (done.has(nb)) continue;
      const nd = bestD + w;
      if (nd < (dist.has(nb) ? dist.get(nb) : Infinity)) { dist.set(nb, nd); prev.set(nb, best); }
    }
  }
  const path = [];
  for (let cur = b; cur !== null && cur !== undefined; cur = prev.get(cur)) path.unshift(cur);
  return path[0] === a ? path : null;
}

/**
 * Betweenness centrality (Brandes) over SAMPLED sources — the broker score.
 * Exact betweenness is O(V·E) = ~48M steps on the full live graph, so sources
 * are sampled deterministically (every kth id in sorted order) and the result
 * is flagged approximate. Returns {score: Map(id → 0..1), sources, approx}.
 */
export function betweenness(nodes = [], edges = [], { sampleSize = 64 } = {}) {
  const ids = nodes.map((n) => String(n.id)).sort();
  const idSet = new Set(ids);
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === t || !idSet.has(s) || !idSet.has(t)) continue;
    adj.get(s).push(t);
    adj.get(t).push(s);
  }
  const score = new Map(ids.map((id) => [id, 0]));
  if (ids.length < 3) return { score, sources: 0, approx: false, max: 0 };
  const step = Math.max(1, Math.floor(ids.length / Math.min(sampleSize, ids.length)));
  const sources = [];
  for (let i = 0; i < ids.length; i += step) sources.push(ids[i]);
  for (const s of sources) {
    const stack = [];
    const preds = new Map(ids.map((id) => [id, []]));
    const sigma = new Map(ids.map((id) => [id, 0]));
    const dist = new Map(ids.map((id) => [id, -1]));
    sigma.set(s, 1); dist.set(s, 0);
    let queue = [s];
    while (queue.length) {
      const next = [];
      for (const v of queue) {
        stack.push(v);
        for (const w of adj.get(v) || []) {
          if (dist.get(w) < 0) { dist.set(w, dist.get(v) + 1); next.push(w); }
          if (dist.get(w) === dist.get(v) + 1) {
            sigma.set(w, sigma.get(w) + sigma.get(v));
            preds.get(w).push(v);
          }
        }
      }
      queue = next;
    }
    const delta = new Map(ids.map((id) => [id, 0]));
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const w = stack[i];
      for (const v of preds.get(w)) {
        delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      }
      if (w !== s) score.set(w, score.get(w) + delta.get(w));
    }
  }
  let max = 0;
  for (const v of score.values()) max = Math.max(max, v);
  if (max > 0) for (const [id, v] of score) score.set(id, v / max);
  return { score, sources: sources.length, approx: sources.length < ids.length, max };
}

/**
 * Inter-community contact matrix — how many co-accused links run between each
 * pair of detected groups (diagonal = links inside the group). This is the
 * organised-crime read: which crews actually touch each other, and where.
 * Returns {ids, matrix, maxCross, totalCross}.
 */
export function communityMatrix(nodes = [], edges = []) {
  const commOf = new Map();
  for (const n of nodes) {
    const cid = n?.communityId;
    if (cid === null || cid === undefined || cid === '') continue;
    commOf.set(String(n.id), String(cid));
  }
  const ids = [...new Set(commOf.values())].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const idx = new Map(ids.map((c, i) => [c, i]));
  const matrix = ids.map(() => ids.map(() => 0));
  let maxCross = 0; let totalCross = 0;
  for (const e of edges) {
    const ca = commOf.get(String(e.source));
    const cb = commOf.get(String(e.target));
    if (ca === undefined || cb === undefined) continue;
    const i = idx.get(ca); const j = idx.get(cb);
    matrix[i][j] += 1;
    if (i !== j) {
      matrix[j][i] += 1;
      totalCross += 1;
      maxCross = Math.max(maxCross, matrix[i][j]);
    }
  }
  return { ids, matrix, maxCross: Math.max(1, maxCross), totalCross };
}

/** Shared-associate overlap for two persons → {common:[id], jaccard, direct}. */
export function pairOverlap(edges = [], a, b) {
  const ka = String(a ?? ''); const kb = String(b ?? '');
  if (!ka || !kb || ka === kb) return { common: [], jaccard: 0, direct: 0, onlyA: 0, onlyB: 0 };
  const A = new Set(); const B = new Set();
  let direct = 0;
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if ((s === ka && t === kb) || (s === kb && t === ka)) direct = Number(e.weight) || 1;
    if (s === ka) A.add(t); else if (t === ka) A.add(s);
    if (s === kb) B.add(t); else if (t === kb) B.add(s);
  }
  A.delete(kb); B.delete(ka);
  const common = [...A].filter((x) => B.has(x));
  const union = new Set([...A, ...B]).size;
  return {
    common,
    jaccard: union ? common.length / union : 0,
    direct,
    onlyA: A.size - common.length,
    onlyB: B.size - common.length,
  };
}

/**
 * Second-degree associates — people reachable in exactly two hops, with the
 * intermediaries that connect them. This is where a co-offending network stops
 * being a contact list and starts being an organisation.
 */
export function secondDegree(edges = [], id, { limit = 10 } = {}) {
  const key = String(id ?? '');
  if (!key) return [];
  const adj = adjacency(edges);
  const direct = new Set(adj.get(key) || []);
  const out = new Map();
  for (const mid of direct) {
    for (const far of adj.get(mid) || []) {
      if (far === key || direct.has(far)) continue;
      let r = out.get(far);
      if (!r) { r = { personKey: far, paths: 0, via: [] }; out.set(far, r); }
      r.paths += 1;
      if (r.via.length < 4) r.via.push(mid);
    }
  }
  return [...out.values()]
    .sort((a, b) => b.paths - a.paths || a.personKey.localeCompare(b.personKey))
    .slice(0, limit);
}

/**
 * Repeat co-offending pairs — the crews that keep turning up on the same FIR.
 * At live volumes 1,033 of the 23,833 links carry two shared cases and 68 carry
 * three or more, so this list is the working set for "who actually operates
 * together" rather than who once appeared in the same charge sheet.
 */
export function repeatPairs(edges = [], { minWeight = 2, limit = 20 } = {}) {
  return edges
    .filter((e) => (Number(e.weight) || 0) >= minWeight)
    .map((e) => ({
      a: String(e.source),
      b: String(e.target),
      weight: Number(e.weight) || 0,
      caseIds: e.caseIds || [],
    }))
    .sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a))
    .slice(0, limit);
}

/** Cosine similarity between two MO-tag sets (recurring modus-operandi match). */
export function moSimilarity(tagsA = [], tagsB = []) {
  const A = new Set(tagsA.map((t) => String(t).toLowerCase()));
  const B = new Set(tagsB.map((t) => String(t).toLowerCase()));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.sqrt(A.size * B.size);
}

/**
 * Offenders whose MO fingerprint most resembles the subject's — the "same
 * hands, different jurisdiction" query. Rows come from the offender registry
 * (moTags + districts), so cross-jurisdiction overlap rides along.
 */
export function similarMo(rows = [], subject, { limit = 8, min = 0.2 } = {}) {
  const key = String(subject?.personKey ?? '');
  const tags = subject?.moTags || [];
  if (!tags.length) return [];
  const subjDistricts = new Set((subject?.districts || []).map(String));
  return rows
    .filter((r) => String(r.personKey) !== key && (r.moTags || []).length)
    .map((r) => {
      const shared = (r.moTags || []).filter((t) => tags.includes(t));
      const districts = (r.districts || []).map(String);
      return {
        personKey: String(r.personKey),
        name: r.canonicalName || String(r.personKey),
        riskScore: r.riskScore,
        score: moSimilarity(tags, r.moTags || []),
        shared,
        sharedDistricts: districts.filter((d) => subjDistricts.has(d)).length,
        districts: districts.length,
      };
    })
    .filter((r) => r.score >= min && r.shared.length > 0)
    .sort((a, b) => b.score - a.score || b.shared.length - a.shared.length)
    .slice(0, limit);
}

/**
 * Cross-jurisdiction span for one offender. `districts` are NAMES (the live
 * OffenderProfile.DistrictsJson stores resolved district names, averaging 8.5
 * per person and reaching all 38), `hops` come from the case timeline.
 */
export function jurisdictionSpan(districts = [], hops = []) {
  const uniq = [...new Set(districts.map(String).filter(Boolean))];
  const hopCodes = hops.map((h) => String(h.code || h));
  let moves = 0;
  for (let i = 1; i < hopCodes.length; i += 1) if (hopCodes[i] !== hopCodes[i - 1]) moves += 1;
  return {
    districts: uniq.length,
    hops: hopCodes.length,
    moves,
    mobility: hopCodes.length > 1 ? moves / (hopCodes.length - 1) : 0,
    first: hops[0] || null,
    last: hops[hops.length - 1] || null,
  };
}

/** A view of the graph as an analyst-readable brief (clipboard / export). */
export function graphBrief({ nodes = [], edges = [], communities = [], scope = '' }) {
  const deg = degreeIndex(edges);
  const top = [...nodes]
    .map((n) => ({ n, d: deg.get(String(n.id))?.links || 0 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 5);
  const density = nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0;
  const lines = [
    scope,
    `people ${nodes.length} · links ${edges.length} · groups ${communities.length} · density ${(density * 100).toFixed(2)}%`,
    `top connectors: ${top.map((x) => `${x.n.label || x.n.id} (${x.d})`).join(', ') || '—'}`,
  ];
  return lines.filter(Boolean).join('\n');
}
