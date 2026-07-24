'use strict';
// Network graph loader with the mandated fallback chain:
//   1. Catalyst NoSQL snapshot  2. Stratus static file  3. build from NetworkEdge table.

const { toNum, parseJsonSafe } = require('./util');

async function buildFromTables(ds) {
  const [edges, profiles] = await Promise.all([
    ds.query({ table: 'NetworkEdge', columns: ['PersonKeyA', 'PersonKeyB', 'Weight', 'CaseIDsJson', 'CommunityID'] }),
    ds.query({ table: 'OffenderProfile', columns: ['PersonKey', 'CanonicalName', 'CaseCount', 'CommunityID', 'DegreeCentrality', 'DistrictsJson'] })
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

/**
 * deps = { ds, loaders? } — loaders.nosql / loaders.stratus are async () => graph|null
 * (real implementations are wired in index.js; tests leave them unset).
 */
async function getGraph(params, deps) {
  const loaders = (deps && deps.loaders) || {};
  for (const [name, load] of [['nosql', loaders.nosql], ['stratus', loaders.stratus]]) {
    if (!load) continue;
    try {
      const g = await load();
      if (g && Array.isArray(g.nodes) && g.nodes.length) {
        return { graph: filterGraph(g, params), source: name };
      }
    } catch (e) {
      // fall through the chain
    }
  }
  const built = await buildFromTables(deps.ds);
  return { graph: filterGraph(built, params), source: 'datastore' };
}

module.exports = { getGraph, buildFromTables, filterGraph };
