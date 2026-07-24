// Network Explorer — co-accused communities from shared FIRs.
// Cytoscape graph (color = community, size = degree), community picker,
// min-shared-cases filter, node/edge drawers, isolate-community and
// shortest-path-between-two-persons tools. Spec: master prompt §7 route 4.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLookups, useNetworkGraph, useOffenders } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { unitInfo } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import { fmtInt } from '../lib/format.js';
import CytoGraph from './network/CytoGraph.jsx';
import { NodeDrawer, EdgeDrawer } from './network/Drawers.jsx';
import { communityColor, computeCommunityStats, shortestPath, edgeKey } from './network/graphUtils.js';

const NODE_CAP = 400;

function PersonSelect({ label, value, onChange, options }) {
  return (
    <label className="block text-[11px] text-muted">
      <span className="block mb-1">{label}</span>
      <select className="input-dark !py-1.5 w-full" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">— pick a person —</option>
        {value && !options.some((o) => o.id === value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function Network() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { districtId } = useUrlFilters();
  const lookups = useLookups();

  const communityId = searchParams.get('communityId') || '';
  const [minShared, setMinShared] = useState(1);
  const [selected, setSelected] = useState(null); // {type:'node'|'edge', data}
  const [pathEnds, setPathEnds] = useState({ a: '', b: '' });

  // The server matches graph nodes on district NAME (OffenderProfile stores
  // names, not unit codes) — resolve the FilterBar's code via lookups, with the
  // static Appendix-C table as fallback while lookups load.
  const districtName = useMemo(() => {
    if (!districtId) return '';
    const hit = (lookups.data?.districts || []).find((d) => d.districtId === districtId);
    return hit?.districtName || unitInfo(districtId)?.name || '';
  }, [districtId, lookups.data]);

  const graph = useNetworkGraph(districtName ? { districtId: districtName } : {});
  const registry = useOffenders({ perPage: 200 }); // district enrichment for the community picker

  const districtsByPerson = useMemo(() => {
    const m = new Map();
    for (const r of registry.data?.rows || []) m.set(String(r.personKey), r.districts || []);
    return m;
  }, [registry.data]);

  const communities = useMemo(
    () => computeCommunityStats(graph.data?.nodes || [], graph.data?.edges || [], districtsByPerson),
    [graph.data, districtsByPerson],
  );

  // Client-side view filters: min shared cases (edge weight) + isolate community.
  const filtered = useMemo(() => {
    const allNodes = graph.data?.nodes || [];
    let edges = (graph.data?.edges || []).map((e) => ({ ...e, id: edgeKey(e.source, e.target) }));
    if (minShared > 1) edges = edges.filter((e) => (Number(e.weight) || 0) >= minShared);

    let nodes;
    if (communityId) {
      nodes = allNodes.filter((n) => String(n.communityId) === String(communityId));
      const ids = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => ids.has(String(e.source)) && ids.has(String(e.target)));
    } else {
      // The full profile table includes thousands of edge-less persons — the
      // explorer shows only linked people unless a community is isolated.
      const linked = new Set();
      for (const e of edges) { linked.add(String(e.source)); linked.add(String(e.target)); }
      nodes = allNodes.filter((n) => linked.has(String(n.id)));
    }

    let capped = false;
    if (nodes.length > NODE_CAP) {
      capped = true;
      nodes = [...nodes].sort((a, b) => (Number(b.degree) || 0) - (Number(a.degree) || 0)).slice(0, NODE_CAP);
      const keep = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
    }
    return { nodes, edges, capped, totalLinked: allNodes.length };
  }, [graph.data, minShared, communityId]);

  const nodesById = useMemo(() => {
    const m = new Map();
    for (const n of filtered.nodes) m.set(String(n.id), n);
    return m;
  }, [filtered.nodes]);

  const elements = useMemo(() => {
    const maxDegree = Math.max(1, ...filtered.nodes.map((n) => Number(n.degree) || 0));
    const maxWeight = Math.max(1, ...filtered.edges.map((e) => Number(e.weight) || 0));
    const nodes = filtered.nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: n.label || String(n.id),
        color: communityColor(n.communityId),
        size: Math.round(16 + 26 * Math.sqrt((Number(n.degree) || 0) / maxDegree)),
        communityId: n.communityId,
        caseCount: n.caseCount,
        degree: n.degree,
      },
    }));
    const edges = filtered.edges.map((e) => ({
      data: {
        id: e.id,
        source: String(e.source),
        target: String(e.target),
        weight: e.weight,
        caseIds: e.caseIds || [],
        width: 1 + 3 * ((Number(e.weight) || 1) / maxWeight),
      },
    }));
    return [...nodes, ...edges];
  }, [filtered]);

  // Shortest path (BFS over the visible edges).
  const path = useMemo(
    () => (pathEnds.a && pathEnds.b ? shortestPath(filtered.edges, pathEnds.a, pathEnds.b) : null),
    [filtered.edges, pathEnds],
  );
  const pathIds = useMemo(() => {
    if (!path || path.length < 2) return [];
    const ids = [...path];
    for (let i = 0; i < path.length - 1; i += 1) ids.push(edgeKey(path[i], path[i + 1]));
    return ids;
  }, [path]);

  // Deep links: /network?communityId=…&focus=<personKey> (from Offender 360).
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusApplied.current || !graph.data) return;
    const focus = searchParams.get('focus');
    if (!focus) { focusApplied.current = true; return; }
    const node = (graph.data.nodes || []).find((n) => String(n.id) === focus);
    if (node) setSelected({ type: 'node', data: { ...node, id: String(node.id) } });
    focusApplied.current = true;
  }, [graph.data, searchParams]);

  // Reset the path tool when the visible universe changes shape.
  useEffect(() => { setPathEnds({ a: '', b: '' }); }, [districtName, communityId]);

  const setCommunity = (cid) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cid) next.set('communityId', String(cid)); else next.delete('communityId');
      next.delete('focus');
      return next;
    }, { replace: true });
    setSelected(null);
  };

  const personOptions = useMemo(
    () => filtered.nodes
      .map((n) => ({ id: String(n.id), label: `${n.label || n.id} (${fmtInt(n.caseCount)} cases)` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [filtered.nodes],
  );

  const selectNode = (n) => setSelected({ type: 'node', data: { ...n, id: String(n.id) } });

  const graphBody = () => {
    if (graph.error) {
      return (
        <EmptyState
          title="Couldn't load the network graph"
          message={graph.error.message}
          action={<button type="button" className="btn" onClick={() => graph.refetch()}>Retry</button>}
        />
      );
    }
    if (graph.isLoading) return <div className="p-4"><LoadingSkeleton height={540} /></div>;
    if (!filtered.nodes.length) {
      return (
        <EmptyState
          title="No linked persons in this view"
          message={communityId
            ? `Community #${communityId} has no members under the current filters.`
            : 'No co-accused links match the current district / min-shared-cases filters.'}
          action={(communityId || minShared > 1) ? (
            <button type="button" className="btn" onClick={() => { setCommunity(''); setMinShared(1); }}>
              Clear graph filters
            </button>
          ) : undefined}
        />
      );
    }
    return (
      <CytoGraph
        elements={elements}
        selectedId={selected?.type === 'node' ? selected.data.id : selected?.type === 'edge' ? selected.data.id : ''}
        pathIds={pathIds}
        onNodeTap={(d) => setSelected({ type: 'node', data: d })}
        onEdgeTap={(d) => setSelected({ type: 'edge', data: d })}
        onBackgroundTap={() => setSelected(null)}
        height={560}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Network Explorer</h1>
        <p className="page-subtitle">Co-accused communities and shared-case links from identity-resolved persons</p>
      </div>

      <FilterBar show={['district']}>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">Min shared</span>
          <select
            className="input-dark !py-1.5"
            value={minShared}
            onChange={(e) => setMinShared(Number(e.target.value))}
            aria-label="Minimum shared cases per link"
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>≥ {n} case{n > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">Community</span>
          <select
            className="input-dark !py-1.5 max-w-[19rem]"
            value={communityId}
            onChange={(e) => setCommunity(e.target.value)}
            aria-label="Community picker"
          >
            <option value="">All communities</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {`Group #${c.id} · ${c.members} members · ${fmtInt(c.cases)} cases${c.districts ? ` · ${c.districts} district${c.districts > 1 ? 's' : ''}` : ''}`}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-grid/60 text-[11px] text-muted">
            <span className="num">{fmtInt(filtered.nodes.length)} people</span>
            <span>·</span>
            <span className="num">{fmtInt(filtered.edges.length)} links</span>
            <span>·</span>
            <span className="num">{fmtInt(communities.length)} groups</span>
            {districtName && <Badge tone="amber">{districtName}</Badge>}
            {communityId && (
              <Badge tone="teal">isolated: group #{communityId}</Badge>
            )}
            {filtered.capped && (
              <Badge tone="slate">showing top {NODE_CAP} by degree</Badge>
            )}
            <span className="ml-auto hidden md:inline">color = community · size = degree · tap node/edge for details</span>
          </div>
          {graphBody()}
          {communities.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-t border-grid/60">
              {communities.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip hover:border-amber/50 transition-colors ${String(communityId) === c.id ? '!border-amber text-amber' : ''}`}
                  onClick={() => setCommunity(String(communityId) === c.id ? '' : c.id)}
                  title={`${c.members} members — top: ${c.topLabel}`}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(c.id) }} />
                  #{c.id}
                  <span className="num text-muted">{c.members}</span>
                </button>
              ))}
              {communities.length > 8 && <span className="text-[11px] text-muted">+{communities.length - 8} more in the picker</span>}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Shortest path" subtitle="Fewest shared-case hops between two persons">
            <div className="space-y-2.5">
              <PersonSelect label="Person A" value={pathEnds.a} onChange={(v) => setPathEnds((p) => ({ ...p, a: v }))} options={personOptions} />
              <PersonSelect label="Person B" value={pathEnds.b} onChange={(v) => setPathEnds((p) => ({ ...p, b: v }))} options={personOptions} />
              {(pathEnds.a || pathEnds.b) && (
                <button type="button" className="btn !py-1 !px-2 text-[11px]" onClick={() => setPathEnds({ a: '', b: '' })}>
                  Clear path
                </button>
              )}
              {pathEnds.a && pathEnds.b && (
                path ? (
                  <div className="text-xs text-ink space-y-1">
                    <Badge tone="teal">{path.length - 1} hop{path.length - 1 === 1 ? '' : 's'}</Badge>
                    <p className="leading-5">
                      {path.map((id, i) => (
                        <span key={id}>
                          {i > 0 && <span className="text-amber"> → </span>}
                          <button type="button" className="hover:text-amber underline-offset-2 hover:underline" onClick={() => { const n = nodesById.get(id); if (n) selectNode(n); }}>
                            {nodesById.get(id)?.label || id}
                          </button>
                        </span>
                      ))}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">No path between these two persons in the current view.</p>
                )
              )}
            </div>
          </Card>

          <Card title={selected ? (selected.type === 'node' ? 'Person' : 'Link') : 'Selection'}>
            {!selected && (
              <EmptyState
                compact
                title="Nothing selected"
                message="Tap a node for the offender panel, or an edge for its shared-case list."
              />
            )}
            {selected?.type === 'node' && (
              <NodeDrawer
                node={selected.data}
                onClose={() => setSelected(null)}
                onIsolate={(cid) => setCommunity(cid)}
                onSetPathEnd={(end, id) => setPathEnds((p) => ({ ...p, [end]: String(id) }))}
              />
            )}
            {selected?.type === 'edge' && (
              <EdgeDrawer
                edge={selected.data}
                nodesById={nodesById}
                onClose={() => setSelected(null)}
                onSelectNode={selectNode}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
