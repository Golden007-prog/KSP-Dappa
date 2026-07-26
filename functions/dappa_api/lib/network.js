'use strict';
// Network graph loader with the mandated fallback chain:
//   1. Catalyst NoSQL snapshot  2. Stratus static file  3. build from NetworkEdge table.

const { toNum, parseJsonSafe } = require('./util');

async function buildFromTables(ds) {
  // NetworkEdge is ~24k rows and OffenderProfile ~2k: a single ZCQL SELECT
  // stops at 300, so both page under a bounded budget.
  const page = (q, maxRows) => (typeof ds.queryAll === 'function' ? ds.queryAll(q, { maxRows }) : ds.query(q));
  const [edges, profiles] = await Promise.all([
    page({
      table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson', 'CommunityID'],
      orderBy: { col: 'PersonKeyA' }
    }, 3000),
    page({
      table: 'OffenderProfile', columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'CommunityID', 'DegreeCentrality', 'DistrictsJson'],
      orderBy: { col: 'RiskScore', desc: true }
    }, 2100)
  ]);
  const nodeMap = new Map();
  for (const p of profiles) {
    nodeMap.set(String(p.PersonKey), {
      id: String(p.PersonKey),
      label: p.CanonicalName || String(p.PersonKey),
      caseCount: toNum(p.CaseCount),
      communityId: p.CommunityID === undefined || p.CommunityID === null ? null : toNum(p.CommunityID),
      degree: toNum(p.DegreeCentrality),
      districts: parseJsonSafe(p.DistrictsJson, [])
    });
  }
  const outEdges = [];
  for (const e of edges) {
    const a = String(e.PersonKeyA);
    const b = String(e.PersonKeyB);
    for (const k of [a, b]) {
      if (!nodeMap.has(k)) nodeMap.set(k, { id: k, label: k, caseCount: 0, communityId: e.CommunityID === undefined ? null : toNum(e.CommunityID), degree: 0, districts: [] });
    }
    outEdges.push({ source: a, target: b, weight: toNum(e.Weight, 1), caseIds: parseJsonSafe(e.CaseIDsJson, []) });
  }
  return { nodes: [...nodeMap.values()], edges: outEdges };
}

function filterGraph(graph, params) {
  let { nodes, edges } = graph;
  const p = params || {};
  if (p.communityId !== undefined && p.communityId !== null && p.communityId !== '') {
    const cid = toNum(p.communityId);
    nodes = nodes.filter((n) => toNum(n.communityId) === cid);
  } else if (p.districtId) {
    nodes = nodes.filter((n) => (n.districts || []).map(String).includes(String(p.districtId)));
  } else if (p.personKey) {
    const depth = Math.max(1, Math.min(4, toNum(p.depth, 1) || 1));
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
    const keep = new Set([String(p.personKey)]);
    let frontier = [String(p.personKey)];
    for (let d = 0; d < depth; d += 1) {
      const next = [];
      for (const n of frontier) {
        for (const nb of adj.get(n) || []) {
          if (!keep.has(nb)) { keep.add(nb); next.push(nb); }
        }
      }
      frontier = next;
    }
    nodes = nodes.filter((n) => keep.has(n.id));
  }
  const ids = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  // strip helper field from the response nodes (contract shape)
  const outNodes = nodes.map(({ id, label, caseCount, communityId, degree }) => ({ id, label, caseCount, communityId, degree }));
  return { nodes: outNodes, edges };
}

const GRAPH_CACHE_KEY = 'v1:network:graph';
const GRAPH_TTL_SEC = 600;

/**
 * deps = { ds, loaders?, cache? } — loaders.nosql / loaders.stratus are
 * async () => graph|null (real implementations are wired in index.js; tests
 * leave them unset). When `cache` is supplied the UNFILTERED graph is memoized:
 * the table-built path pages through thousands of NetworkEdge rows, and both
 * /network/graph and /network/path would otherwise repeat that walk on every
 * request. Filtering still happens per request, so the contract is unchanged.
 */
async function getGraph(params, deps) {
  const loaders = (deps && deps.loaders) || {};
  const cache = deps && deps.cache;
  for (const [name, load] of [['nosql', loaders.nosql], ['stratus', loaders.stratus]]) {
    if (!load) continue;
    try {
      const g = await load();
      if (g && Array.isArray(g.nodes) && g.nodes.length) {
        // A district filter needs per-node `districts`; a snapshot without the
        // field would filter to an empty graph, so fall through to the
        // table-built graph (which always carries it) instead.
        if (params && params.districtId && !g.nodes.some((n) => Array.isArray(n && n.districts))) continue;
        return { graph: filterGraph(g, params), source: name };
      }
    } catch (e) {
      // fall through the chain
    }
  }
  let built;
  if (cache) {
    const { value } = await cache.wrap(GRAPH_CACHE_KEY, GRAPH_TTL_SEC, false, () => buildFromTables(deps.ds));
    built = value;
  } else {
    built = await buildFromTables(deps.ds);
  }
  return { graph: filterGraph(built, params), source: 'datastore' };
}

module.exports = { getGraph, buildFromTables, filterGraph, GRAPH_CACHE_KEY, GRAPH_TTL_SEC };
