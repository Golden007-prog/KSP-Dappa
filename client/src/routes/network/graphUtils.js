// Pure helpers for the Network Explorer — community palette, community stats,
// BFS shortest path. No React in here so the logic stays trivially testable.
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
