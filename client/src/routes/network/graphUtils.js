// Pure helpers for the Network Explorer — community palette, community stats,
// BFS shortest path, bridge/broker stats, articulation points, mutual
// neighbors. No React in here so the logic stays trivially testable.
import { DAPPA_CHART_COLORS } from '../../components/ChartPanel.jsx';

const UNKNOWN_COMMUNITY = '#64748B';

/** Stable palette color for a community id (null/unknown → slate). */
export function communityColor(communityId) {
  if (communityId === null || communityId === undefined || communityId === '') return UNKNOWN_COMMUNITY;
  const n = Math.abs(Number(communityId));
  if (!Number.isFinite(n)) return UNKNOWN_COMMUNITY;
  return DAPPA_CHART_COLORS[Math.floor(n) % DAPPA_CHART_COLORS.length];
}

/** Canonical undirected edge id — same for (a,b) and (b,a). */
export function edgeKey(a, b) {
  const x = String(a); const y = String(b);
  return x < y ? `${x}~~${y}` : `${y}~~${x}`;
}

/**
 * Aggregate per-community stats from the raw graph.
 * districtsByPerson: Map(personKey → [districtName]) from the offender registry
 * (may be partial — districts count degrades gracefully to 0).
 * Returns [{id, members, cases, districts, topLabel, nodeIds:Set}] sorted by size.
 */
export function computeCommunityStats(nodes = [], edges = [], districtsByPerson = new Map()) {
  const byId = new Map();
  const commOf = new Map();
  for (const n of nodes) {
    const cid = n?.communityId;
    if (cid === null || cid === undefined || cid === '') continue;
    const key = String(cid);
    commOf.set(String(n.id), key);
    if (!byId.has(key)) {
      byId.set(key, { id: key, members: 0, caseIds: new Set(), weightSum: 0, districts: new Set(), topLabel: '', topCases: -1, nodeIds: new Set() });
    }
    const c = byId.get(key);
    c.members += 1;
    c.nodeIds.add(String(n.id));
    const cc = Number(n.caseCount) || 0;
    if (cc > c.topCases) { c.topCases = cc; c.topLabel = n.label || String(n.id); }
    for (const d of districtsByPerson.get(String(n.id)) || []) c.districts.add(String(d));
  }
  for (const e of edges) {
    const ca = commOf.get(String(e.source));
    if (!ca || ca !== commOf.get(String(e.target))) continue;
    const c = byId.get(ca);
    if (!c) continue;
    c.weightSum += Number(e.weight) || 0;
    for (const cid of e.caseIds || []) c.caseIds.add(String(cid));
  }
  return [...byId.values()]
    .map((c) => ({
      id: c.id,
      members: c.members,
      cases: c.caseIds.size || c.weightSum,
      districts: c.districts.size,
      topLabel: c.topLabel,
      nodeIds: c.nodeIds,
    }))
    .sort((a, b) => b.members - a.members || b.cases - a.cases || Number(a.id) - Number(b.id));
}

/** Edge tier from shared-case weight: 1 → 'single', 2 → 'repeat', ≥3 → 'strong'. */
export function edgeTier(weight) {
  const w = Number(weight) || 0;
  return w >= 3 ? 'strong' : w === 2 ? 'repeat' : 'single';
}

/**
 * Ego subgraph — nodes within `depth` hops of egoId over the given edges,
 * plus every edge whose endpoints both survive. Returns {nodes, edges, dist}
 * where dist maps nodeId → hop distance from the ego (0 for the ego itself).
 */
export function egoSubgraph(nodes = [], edges = [], egoId, depth = 1) {
  const id = String(egoId ?? '');
  const adj = new Map();
  const add = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    add(s, t); add(t, s);
  }
  const dist = new Map([[id, 0]]);
  let frontier = [id];
  for (let d = 1; d <= depth && frontier.length; d += 1) {
    const next = [];
    for (const n of frontier) {
      for (const nb of adj.get(n) || []) {
        if (dist.has(nb)) continue;
        dist.set(nb, d);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return {
    nodes: nodes.filter((n) => dist.has(String(n.id))),
    edges: edges.filter((e) => dist.has(String(e.source)) && dist.has(String(e.target))),
    dist,
  };
}

/** Number of connected components in the visible graph (isolates count as 1 each). */
export function countComponents(nodes = [], edges = []) {
  const ids = new Set(nodes.map((n) => String(n.id)));
  const adj = new Map();
  const add = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (ids.has(s) && ids.has(t)) { add(s, t); add(t, s); }
  }
  const seen = new Set();
  let components = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    components += 1;
    let frontier = [id];
    seen.add(id);
    while (frontier.length) {
      const next = [];
      for (const n of frontier) {
        for (const nb of adj.get(n) || []) {
          if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        }
      }
      frontier = next;
    }
  }
  return components;
}

/**
 * Per-node bridge stats — betweenness-ish proxy read off the community
 * boundary instead of an O(V·E) exact computation. For every edge whose
 * endpoints sit in different (known) communities, both endpoints count a
 * cross-link and record the OTHER community reached.
 * Returns Map(nodeId → {crossLinks, groups:Set<communityId>, score}) where
 * score = crossLinks × degree (the brief's bridge heuristic).
 */
export function brokerStats(nodes = [], edges = []) {
  const commOf = new Map();
  const degOf = new Map();
  for (const n of nodes) {
    const id = String(n.id);
    const cid = n?.communityId;
    commOf.set(id, cid === null || cid === undefined || cid === '' ? '' : String(cid));
    degOf.set(id, Number(n.degree) || 0);
  }
  const out = new Map();
  const bump = (id, other) => {
    if (!out.has(id)) out.set(id, { crossLinks: 0, groups: new Set(), score: 0 });
    const s = out.get(id);
    s.crossLinks += 1;
    if (other !== '') s.groups.add(other);
  };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    const cs = commOf.get(s); const ct = commOf.get(t);
    if (cs === undefined || ct === undefined || cs === '' || ct === '' || cs === ct) continue;
    bump(s, ct); bump(t, cs);
  }
  for (const [id, s] of out) s.score = s.crossLinks * Math.max(1, degOf.get(id) || 0);
  return out;
}

/**
 * Articulation points (cut vertices) — people whose removal disconnects their
 * component. Iterative Tarjan low-link (no recursion, safe on capped graphs).
 * Returns Set<nodeId>.
 */
export function articulationPoints(nodes = [], edges = []) {
  const ids = nodes.map((n) => String(n.id));
  const idSet = new Set(ids);
  const adj = new Map();
  const add = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s !== t && idSet.has(s) && idSet.has(t)) { add(s, t); add(t, s); }
  }
  const disc = new Map(); const low = new Map(); const parent = new Map();
  const cuts = new Set();
  let time = 0;
  for (const root of ids) {
    if (disc.has(root)) continue;
    let rootChildren = 0;
    parent.set(root, null);
    disc.set(root, time); low.set(root, time); time += 1;
    const stack = [[root, 0]]; // [nodeId, next-neighbor index]
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
          if (u === root) rootChildren += 1;
          stack.push([v, 0]);
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u), disc.get(v)));
        }
      } else {
        stack.pop();
        const p = parent.get(u);
        if (p !== null && p !== undefined) {
          low.set(p, Math.min(low.get(p), low.get(u)));
          if (p !== root && low.get(u) >= disc.get(p)) cuts.add(p);
        }
      }
    }
    if (rootChildren > 1) cuts.add(root);
  }
  return cuts;
}

/** Common co-accused of two persons over the given edges → [nodeId,…]. */
export function mutualNeighbors(edges = [], a, b) {
  const ka = String(a ?? ''); const kb = String(b ?? '');
  if (!ka || !kb) return [];
  const A = new Set(); const B = new Set();
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    if (s === ka) A.add(t); else if (t === ka) A.add(s);
    if (s === kb) B.add(t); else if (t === kb) B.add(s);
  }
  return [...A].filter((x) => B.has(x) && x !== ka && x !== kb);
}

/** Unweighted BFS shortest path over undirected edges → [nodeId,…] or null. */
export function shortestPath(edges = [], from, to) {
  const a = String(from ?? ''); const b = String(to ?? '');
  if (!a || !b) return null;
  if (a === b) return [a];
  const adj = new Map();
  const add = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    add(s, t); add(t, s);
  }
  if (!adj.has(a) || !adj.has(b)) return null;
  const prev = new Map([[a, null]]);
  let frontier = [a];
  while (frontier.length) {
    const next = [];
    for (const n of frontier) {
      for (const nb of adj.get(n) || []) {
        if (prev.has(nb)) continue;
        prev.set(nb, n);
        if (nb === b) {
          const path = [b];
          let cur = n;
          while (cur !== null) { path.push(cur); cur = prev.get(cur); }
          return path.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
}
