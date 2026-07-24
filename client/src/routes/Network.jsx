// Network Explorer — co-accused communities from shared FIRs.
// Cytoscape graph (color = community, size = degree) with a layout switcher
// (fcose/concentric/grid), min-degree slider, edge-tier checkboxes, ego-network
// focus mode with depth control (URL-synced), node search with fly-to, PNG
// export, legend panel, community picker/isolate, shortest-path tool and
// node/edge drawers (bottom sheet on mobile). Spec: master prompt §7 route 4.
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
import Sheet from '../components/Sheet.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { fmtInt } from '../lib/format.js';
import CytoGraph from './network/CytoGraph.jsx';
import { NodeDrawer, EdgeDrawer } from './network/Drawers.jsx';
import {
  communityColor, computeCommunityStats, shortestPath, edgeKey,
  edgeTier, egoSubgraph, countComponents,
} from './network/graphUtils.js';
import { downloadDataUrl } from './network/download.js';
import { useMediaQuery, readPref, writePref } from './network/hooks.js';

const NODE_CAP = 400;
const LAYOUTS = ['fcose', 'concentric', 'grid'];
const LAYOUT_PREF = 'dappa-net-layout';
const LEGEND_PREF = 'dappa-net-legend';

const EDGE_TIERS = [
  { id: 'single', label: '1 case', hint: 'links from a single shared FIR' },
  { id: 'repeat', label: '2 cases', hint: 'links from two shared FIRs' },
  { id: 'strong', label: '3+ cases', hint: 'strong ties — three or more shared FIRs' },
];

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
  const toast = useToast();
  const isDesktop = useMediaQuery('(min-width: 1280px)');

  // URL-synced analytic state (deep-linkable): community isolate, ego focus
  // (person + depth), min-degree floor, one-shot focus target.
  const communityId = searchParams.get('communityId') || '';
  const ego = searchParams.get('ego') || '';
  const depth = Math.min(3, Math.max(1, Number(searchParams.get('depth')) || 1));
  const minDegree = Math.min(8, Math.max(1, Number(searchParams.get('minDegree')) || 1));

  const [layout, setLayout] = useState(() => {
    const v = readPref(LAYOUT_PREF, 'fcose');
    return LAYOUTS.includes(v) ? v : 'fcose';
  });
  const [edgeTypes, setEdgeTypes] = useState({ single: true, repeat: true, strong: true, bridge: true });
  const [selected, setSelected] = useState(null); // {type:'node'|'edge', data}
  const [pathEnds, setPathEnds] = useState({ a: '', b: '' });
  const [searchQ, setSearchQ] = useState('');
  const [legendOpen, setLegendOpen] = useState(() => readPref(LEGEND_PREF, '1') !== '0');
  const cyApi = useRef(null);
  const pendingFly = useRef(null);

  const setParams = (patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  };

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

  const allNodesById = useMemo(() => {
    const m = new Map();
    for (const n of graph.data?.nodes || []) m.set(String(n.id), n);
    return m;
  }, [graph.data]);

  // Client-side view pipeline: edge tiers → bridges → community isolate →
  // linked-only → ego subgraph → min-degree floor → node cap.
  const filtered = useMemo(() => {
    const allNodes = graph.data?.nodes || [];
    const commOf = new Map();
    for (const n of allNodes) commOf.set(String(n.id), String(n.communityId ?? ''));

    let edges = (graph.data?.edges || []).map((e) => ({ ...e, id: edgeKey(e.source, e.target) }));
    edges = edges.filter((e) => edgeTypes[edgeTier(e.weight)]);
    if (!edgeTypes.bridge) {
      edges = edges.filter((e) => commOf.get(String(e.source)) === commOf.get(String(e.target)));
    }

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

    let egoMissing = false;
    if (ego) {
      if (nodes.some((n) => String(n.id) === ego)) {
        const sub = egoSubgraph(nodes, edges, ego, depth);
        nodes = sub.nodes;
        edges = sub.edges;
      } else {
        egoMissing = true;
      }
    }

    if (minDegree > 1) {
      nodes = nodes.filter((n) => (Number(n.degree) || 0) >= minDegree || String(n.id) === ego);
      const keep = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
    }

    let capped = false;
    if (nodes.length > NODE_CAP) {
      capped = true;
      nodes = [...nodes].sort((a, b) => (Number(b.degree) || 0) - (Number(a.degree) || 0)).slice(0, NODE_CAP);
      const keep = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
    }
    return { nodes, edges, capped, egoMissing };
  }, [graph.data, edgeTypes, communityId, ego, depth, minDegree]);

  const components = useMemo(
    () => countComponents(filtered.nodes, filtered.edges),
    [filtered.nodes, filtered.edges],
  );

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
        isEgo: ego && String(n.id) === ego ? 1 : 0,
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
  }, [filtered, ego]);

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

  // Deep links: /network?communityId=…&focus=<personKey> (from Offender 360) —
  // select the node once and fly to it after the first layout settles.
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusApplied.current || !graph.data) return;
    const focus = searchParams.get('focus');
    if (!focus) { focusApplied.current = true; return; }
    const node = allNodesById.get(focus);
    if (node) {
      setSelected({ type: 'node', data: { ...node, id: String(node.id) } });
      pendingFly.current = focus;
    }
    focusApplied.current = true;
  }, [graph.data, searchParams, allNodesById]);

  // Reset the path tool when the visible universe changes shape.
  useEffect(() => { setPathEnds({ a: '', b: '' }); }, [districtName, communityId, ego]);

  const setCommunity = (cid) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cid) next.set('communityId', String(cid)); else next.delete('communityId');
      next.delete('focus');
      return next;
    }, { replace: true });
    setSelected(null);
  };

  const setEgo = (id) => {
    if (id) setParams({ ego: String(id), depth: String(depth) });
    else setParams({ ego: '', depth: '' });
  };

  const changeLayout = (v) => { setLayout(v); writePref(LAYOUT_PREF, v); };
  const toggleLegend = () => {
    setLegendOpen((v) => { writePref(LEGEND_PREF, v ? '0' : '1'); return !v; });
  };

  const clearGraphFilters = () => {
    setCommunity('');
    setParams({ minDegree: '', ego: '', depth: '' });
    setEdgeTypes({ single: true, repeat: true, strong: true, bridge: true });
  };

  const personOptions = useMemo(
    () => filtered.nodes
      .map((n) => ({ id: String(n.id), label: `${n.label || n.id} (${fmtInt(n.caseCount)} cases)` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [filtered.nodes],
  );

  const searchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return filtered.nodes
      .filter((n) => `${n.label || ''} ${n.id}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [filtered.nodes, searchQ]);

  const selectNode = (n) => setSelected({ type: 'node', data: { ...n, id: String(n.id) } });

  const pickSearch = (n) => {
    selectNode(n);
    cyApi.current?.flyTo(String(n.id));
    setSearchQ('');
  };

  const exportPng = () => {
    const uri = cyApi.current?.png?.();
    if (!uri) { toast.error('The graph canvas is not ready yet.'); return; }
    downloadDataUrl(`dappa-network-${new Date().toISOString().slice(0, 10)}.png`, uri);
    toast.success('Network graph exported as PNG.');
  };

  const onLayoutStop = () => {
    if (pendingFly.current) {
      cyApi.current?.flyTo(pendingFly.current);
      pendingFly.current = null;
    }
  };

  const drawerFor = (sel) => {
    if (sel?.type === 'node') {
      return (
        <NodeDrawer
          node={sel.data}
          onClose={() => setSelected(null)}
          onIsolate={(cid) => setCommunity(cid)}
          onSetPathEnd={(end, id) => setPathEnds((p) => ({ ...p, [end]: String(id) }))}
          onEgo={setEgo}
          isEgo={!!ego && String(sel.data.id) === ego}
        />
      );
    }
    if (sel?.type === 'edge') {
      return (
        <EdgeDrawer
          edge={sel.data}
          nodesById={nodesById}
          onClose={() => setSelected(null)}
          onSelectNode={selectNode}
        />
      );
    }
    return null;
  };

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
            : 'No co-accused links match the current district / degree / link-type filters.'}
          action={(communityId || minDegree > 1 || ego || Object.values(edgeTypes).some((v) => !v)) ? (
            <button type="button" className="btn" onClick={clearGraphFilters}>
              Clear graph filters
            </button>
          ) : undefined}
        />
      );
    }
    return (
      <CytoGraph
        elements={elements}
        layout={layout}
        selectedId={selected?.type === 'node' ? selected.data.id : selected?.type === 'edge' ? selected.data.id : ''}
        pathIds={pathIds}
        onNodeTap={(d) => setSelected({ type: 'node', data: d })}
        onEdgeTap={(d) => setSelected({ type: 'edge', data: d })}
        onBackgroundTap={() => setSelected(null)}
        onLayoutStop={onLayoutStop}
        apiRef={cyApi}
        height={560}
      />
    );
  };

  const egoLabel = ego ? (allNodesById.get(ego)?.label || ego) : '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Network Explorer</h1>
        <p className="page-subtitle">Co-accused communities and shared-case links from identity-resolved persons</p>
      </div>

      <FilterBar show={['district']}>
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
          <span>Degree ≥ <span className="num text-ink">{minDegree}</span></span>
          <input
            type="range"
            min="1"
            max="8"
            step="1"
            value={minDegree}
            onChange={(e) => setParams({ minDegree: Number(e.target.value) > 1 ? e.target.value : '' })}
            className="accent-amber w-24"
            aria-label="Minimum node degree"
          />
        </label>
        <span className="text-xs text-muted whitespace-nowrap hidden sm:inline" aria-hidden="true">Links:</span>
        {EDGE_TIERS.map((t) => (
          <Tooltip key={t.id} label={t.hint}>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                className="accent-amber"
                checked={edgeTypes[t.id]}
                onChange={(e) => setEdgeTypes((p) => ({ ...p, [t.id]: e.target.checked }))}
              />
              {t.label}
            </label>
          </Tooltip>
        ))}
        <Tooltip label="links whose endpoints sit in different communities">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              className="accent-amber"
              checked={edgeTypes.bridge}
              onChange={(e) => setEdgeTypes((p) => ({ ...p, bridge: e.target.checked }))}
            />
            bridges
          </label>
        </Tooltip>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">Community</span>
          <select
            className="input-dark !py-1.5 max-w-[16rem]"
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
            <span className="num">{fmtInt(components)} component{components === 1 ? '' : 's'}</span>
            <span>·</span>
            <span className="num">{fmtInt(communities.length)} groups</span>
            {districtName && <Badge tone="amber">{districtName}</Badge>}
            {communityId && <Badge tone="teal">isolated: group #{communityId}</Badge>}
            {filtered.capped && <Badge tone="slate">showing top {NODE_CAP} by degree</Badge>}
            {filtered.egoMissing && <Badge tone="slate">ego person not in current view</Badge>}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0">
              <div className="relative">
                <input
                  className="input-dark !py-1.5 w-36 sm:w-48"
                  placeholder="Find person…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchMatches.length) { e.preventDefault(); pickSearch(searchMatches[0]); }
                    if (e.key === 'Escape') setSearchQ('');
                  }}
                  aria-label="Search people in the visible graph"
                />
                {searchQ.trim() && (
                  <ul className="absolute right-0 z-40 mt-1 w-60 max-h-56 overflow-y-auto rounded-lg border border-grid bg-panel shadow-lift" role="listbox" aria-label="Matching people">
                    {searchMatches.length === 0 && (
                      <li className="px-3 py-2 text-[11px] text-muted">No matching person in view</li>
                    )}
                    {searchMatches.map((n) => (
                      <li key={String(n.id)}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs text-ink hover:bg-grid/40 transition-colors flex items-center justify-between gap-2"
                          onClick={() => pickSearch(n)}
                        >
                          <span className="truncate">{n.label || String(n.id)}</span>
                          <span className="num text-muted shrink-0">{fmtInt(n.caseCount)} cases</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <SegmentedControl
                ariaLabel="Graph layout"
                value={layout}
                onChange={changeLayout}
                options={[
                  { value: 'fcose', label: 'Force' },
                  { value: 'concentric', label: 'Rings' },
                  { value: 'grid', label: 'Grid' },
                ]}
              />
              <Tooltip label="Fit graph to view">
                <button type="button" className="btn !py-1.5 !px-2.5 text-xs" onClick={() => cyApi.current?.fit()}>
                  Fit
                </button>
              </Tooltip>
              <Tooltip label="Download the graph as a PNG image">
                <button type="button" className="btn !py-1.5 !px-2.5 text-xs" onClick={exportPng}>
                  PNG
                </button>
              </Tooltip>
            </div>
          </div>

          {ego && !filtered.egoMissing && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-grid/60 text-[11px]">
              <Badge tone="teal" pulse>ego: {egoLabel}</Badge>
              <span className="text-muted">depth</span>
              <SegmentedControl
                ariaLabel="Ego network depth"
                value={String(depth)}
                onChange={(v) => setParams({ depth: v })}
                options={[
                  { value: '1', label: '1 hop' },
                  { value: '2', label: '2 hops' },
                  { value: '3', label: '3 hops' },
                ]}
              />
              <button type="button" className="btn !py-1 !px-2 text-[11px] ml-auto" onClick={() => setEgo(null)}>
                Exit ego focus
              </button>
            </div>
          )}

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

          <Card
            title="Legend"
            actions={(
              <button type="button" className="btn-ghost !py-1 !px-2 text-[11px]" onClick={toggleLegend} aria-expanded={legendOpen}>
                {legendOpen ? 'Hide' : 'Show'}
              </button>
            )}
            padded={legendOpen}
          >
            {legendOpen && (
              <div className="space-y-3 text-[11px] text-muted">
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5">Communities (color)</p>
                  <ul className="space-y-1">
                    {communities.slice(0, 8).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: communityColor(c.id) }} />
                        <span className="text-ink shrink-0">#{c.id}</span>
                        <span className="truncate">{c.topLabel}</span>
                        <span className="num ml-auto shrink-0">{fmtInt(c.members)}</span>
                      </li>
                    ))}
                    {!communities.length && <li>No communities detected in this view.</li>}
                  </ul>
                </div>
                <ul className="space-y-1.5 border-t border-grid/60 pt-2.5">
                  <li>Node size = network degree (co-accused links)</li>
                  <li>Edge width = FIRs shared by the pair</li>
                  <li><span className="text-amber">Amber ring</span> = selected person / shortest path</li>
                  <li><span className="text-teal">Teal ring</span> = ego-focus person</li>
                  <li>Pinch or scroll to zoom · drag to pan · tap for details</li>
                </ul>
              </div>
            )}
          </Card>

          {isDesktop && (
            <Card title={selected ? (selected.type === 'node' ? 'Person' : 'Link') : 'Selection'}>
              {!selected && (
                <EmptyState
                  compact
                  title="Nothing selected"
                  message="Tap a node for the offender panel, or an edge for its shared-case list."
                />
              )}
              {drawerFor(selected)}
            </Card>
          )}
        </div>
      </div>

      {!isDesktop && (
        <Sheet
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.type === 'node' ? 'Person' : 'Shared-case link'}
        >
          {drawerFor(selected)}
        </Sheet>
      )}
    </div>
  );
}
