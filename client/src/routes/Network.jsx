// Network Explorer — co-accused communities from shared FIRs.
// Cytoscape graph (color = community, size = degree) with a layout switcher
// (fcose/concentric/grid/tree), min-degree slider, edge-tier checkboxes,
// ego-network focus mode with depth control (URL-synced), node search with
// fly-to + full combobox keyboard support, PNG/CSV export, copy-view-link,
// saved views, keyboard shortcuts (/ f + − Esc), label + neighbor-focus +
// bridge-highlight toggles, legend panel with degree histogram, community
// picker/isolate with a detail summary (top MO + key connector), top-connectors
// list, cross-route watchlist panel (diamond nodes), shortest-path tool
// (swap + strength) and node/edge drawers with bridge/cut-vertex context and
// mutual associates (bottom sheet on mobile).
// Spec: master prompt §7 route 4.
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
import { fmtInt, fmtNum, fmtPct } from '../lib/format.js';
import { useT, useNames } from '../lib/i18n.jsx';
import CytoGraph from './network/CytoGraph.jsx';
import { NodeDrawer, EdgeDrawer } from './network/Drawers.jsx';
import SavedViews from './network/SavedViews.jsx';
import TopConnectors from './network/TopConnectors.jsx';
import CommunitySummary from './network/CommunitySummary.jsx';
import WatchlistPanel from './network/WatchlistPanel.jsx';
import {
  communityColor, computeCommunityStats, shortestPath, edgeKey,
  edgeTier, egoSubgraph, countComponents, brokerStats, articulationPoints,
  mutualNeighbors,
} from './network/graphUtils.js';
import { downloadDataUrl, downloadCsv } from './network/download.js';
import { copyText } from './network/clipboard.js';
import { useMediaQuery, readPref, writePref } from './network/hooks.js';
import { useWatchlist } from './offenders/watchlistStore.js';

const NODE_CAP = 400;
const LAYOUTS = ['fcose', 'concentric', 'grid', 'breadthfirst'];
const LAYOUT_PREF = 'dappa-net-layout';
const LEGEND_PREF = 'dappa-net-legend';
const LABELS_PREF = 'dappa-net-labels';
const NEIGHBOR_PREF = 'dappa-net-neighbor';
const BRIDGE_PREF = 'dappa-net-bridges';

// Tier ids only — labels/hints resolve through t('network.tier.<id>[Hint]').
const EDGE_TIERS = ['single', 'repeat', 'strong'];

// CSV headers are user-visible, so the column sets are built per render with
// the active translator rather than frozen at module load.
const nodeCsvColumns = (t) => [
  { key: 'id', label: t('network.csv.personKey') },
  { key: 'label', label: t('network.csv.name') },
  { key: 'communityId', label: t('network.csv.community') },
  { key: 'degree', label: t('network.csv.degree') },
  { key: 'caseCount', label: t('network.csv.cases') },
];
const edgeCsvColumns = (t) => [
  { key: 'source', label: t('network.csv.personA') },
  { key: 'target', label: t('network.csv.personB') },
  { key: 'weight', label: t('network.csv.sharedCases') },
  { label: t('network.csv.caseIds'), map: (e) => (e.caseIds || []).join('; ') },
];

/** Tiny degree-distribution bar strip for the Legend card (degrees 1..7, 8+). */
function DegreeHistogram({ nodes }) {
  const t = useT();
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const n of nodes) {
    const d = Math.max(1, Math.min(8, Number(n.degree) || 1));
    counts[d - 1] += 1;
  }
  const max = Math.max(...counts, 1);
  if (!nodes.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-1.5">{t('network.legend.degreeDistribution')}</p>
      <div
        className="flex items-end gap-1"
        role="img"
        aria-label={t('network.legend.degreeDistAria', {
          list: counts.map((c, i) => `${i + 1 === 8 ? '8+' : i + 1}: ${fmtInt(c)}`).join(', '),
        })}
      >
        {counts.map((c, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <div
              className={`w-full rounded-sm ${c ? 'bg-amber/70' : 'bg-grid/50'}`}
              style={{ height: `${3 + Math.round((c / max) * 30)}px` }}
              title={t('network.legend.degreeBarTitle', { d: i + 1 === 8 ? '8+' : i + 1, n: fmtInt(c) })}
            />
            <span className="text-[9px] text-muted num" aria-hidden="true">{i + 1 === 8 ? '8+' : i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonSelect({ label, value, onChange, options }) {
  const t = useT();
  return (
    <label className="block text-[11px] text-muted">
      <span className="block mb-1">{label}</span>
      <select className="input-dark !py-1.5 w-full" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{t('network.path.pickPerson')}</option>
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
  const t = useT();
  const tName = useNames();
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
  const [searchIdx, setSearchIdx] = useState(0);
  const [legendOpen, setLegendOpen] = useState(() => readPref(LEGEND_PREF, '1') !== '0');
  const [showLabels, setShowLabels] = useState(() => readPref(LABELS_PREF, '1') !== '0');
  const [neighborFocus, setNeighborFocus] = useState(() => readPref(NEIGHBOR_PREF, '0') === '1');
  const [showBridges, setShowBridges] = useState(() => readPref(BRIDGE_PREF, '0') === '1');
  const { keys: watchKeys } = useWatchlist();
  const cyApi = useRef(null);
  const pendingFly = useRef(null);
  const searchRef = useRef(null);

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

  // Full registry rows by personKey — MO-tag enrichment for the community panel.
  const profilesByKey = useMemo(() => {
    const m = new Map();
    for (const r of registry.data?.rows || []) m.set(String(r.personKey), r);
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

  // Link-analysis depth: cross-community brokers (computed on the FULL graph —
  // community isolation and edge filters strip the very cross-links that make
  // someone a bridge), articulation points over the visible view, and the
  // bridge-highlight id set for the visible edges.
  const brokers = useMemo(
    () => brokerStats(graph.data?.nodes || [], graph.data?.edges || []),
    [graph.data],
  );
  const cutSet = useMemo(
    () => articulationPoints(filtered.nodes, filtered.edges),
    [filtered.nodes, filtered.edges],
  );
  const bridgeIds = useMemo(() => {
    if (!showBridges) return [];
    const commOf = new Map(filtered.nodes.map((n) => [String(n.id), String(n.communityId ?? '')]));
    const ids = new Set();
    for (const e of filtered.edges) {
      const cs = commOf.get(String(e.source)); const ct = commOf.get(String(e.target));
      if (cs !== undefined && ct !== undefined && cs !== '' && ct !== '' && cs !== ct) {
        ids.add(e.id); ids.add(String(e.source)); ids.add(String(e.target));
      }
    }
    return [...ids];
  }, [showBridges, filtered.nodes, filtered.edges]);

  const density = filtered.nodes.length > 1
    ? (2 * filtered.edges.length) / (filtered.nodes.length * (filtered.nodes.length - 1))
    : 0;
  const avgDegree = filtered.nodes.length ? (2 * filtered.edges.length) / filtered.nodes.length : 0;

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
        watch: watchKeys.has(String(n.id)) ? 1 : 0,
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
  }, [filtered, ego, watchKeys]);

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
  // Path strength — total shared FIRs across the hops (evidence weight).
  const pathStrength = useMemo(() => {
    if (!path || path.length < 2) return 0;
    const wByKey = new Map(filtered.edges.map((e) => [e.id, Number(e.weight) || 0]));
    let sum = 0;
    for (let i = 0; i < path.length - 1; i += 1) sum += wByKey.get(edgeKey(path[i], path[i + 1])) || 0;
    return sum;
  }, [path, filtered.edges]);

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

  // A drawer must never show an element the filters just removed — close it
  // (Isolate / ego / path actions would otherwise target an off-screen target).
  useEffect(() => {
    if (!selected || graph.isLoading) return;
    if (selected.type === 'node' && !nodesById.has(String(selected.data.id))) setSelected(null);
    else if (selected.type === 'edge'
      && !filtered.edges.some((e) => String(e.id) === String(selected.data.id))) setSelected(null);
  }, [selected, nodesById, filtered.edges, graph.isLoading]);

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
  const toggleLabels = () => {
    setShowLabels((v) => { writePref(LABELS_PREF, v ? '0' : '1'); return !v; });
  };
  const toggleNeighbor = () => {
    setNeighborFocus((v) => { writePref(NEIGHBOR_PREF, v ? '0' : '1'); return !v; });
  };
  const toggleBridges = () => {
    setShowBridges((v) => { writePref(BRIDGE_PREF, v ? '0' : '1'); return !v; });
  };

  const clearGraphFilters = () => {
    setCommunity('');
    setParams({ minDegree: '', ego: '', depth: '' });
    setEdgeTypes({ single: true, repeat: true, strong: true, bridge: true });
  };

  const personOptions = useMemo(
    () => filtered.nodes
      .map((n) => ({
        id: String(n.id),
        label: t('network.path.personOption', { name: n.label || n.id, n: fmtInt(n.caseCount) }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [filtered.nodes, t],
  );

  const searchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return filtered.nodes
      .filter((n) => `${n.label || ''} ${n.id}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [filtered.nodes, searchQ]);

  useEffect(() => { setSearchIdx(0); }, [searchQ]);

  const selectNode = (n) => setSelected({ type: 'node', data: { ...n, id: String(n.id) } });

  const pickSearch = (n) => {
    selectNode(n);
    cyApi.current?.flyTo(String(n.id));
    setSearchQ('');
  };

  const pickFromPanel = (n) => {
    selectNode(n);
    cyApi.current?.flyTo(String(n.id));
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown' && searchMatches.length) {
      e.preventDefault();
      setSearchIdx((i) => Math.min(i + 1, searchMatches.length - 1));
    } else if (e.key === 'ArrowUp' && searchMatches.length) {
      e.preventDefault();
      setSearchIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && searchMatches.length) {
      e.preventDefault();
      pickSearch(searchMatches[Math.min(searchIdx, searchMatches.length - 1)]);
    } else if (e.key === 'Escape') {
      setSearchQ('');
      e.target.blur?.();
    }
  };

  // Route keyboard shortcuts: / find · 0 fit · + − zoom · Esc clear selection.
  // ('f' belongs to the app-wide zen-mode shortcut in Layout — leave it alone.)
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return; // sheet/palette open
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === '0') cyApi.current?.fit();
      else if (e.key === '+' || e.key === '=') cyApi.current?.zoomIn?.();
      else if (e.key === '-') cyApi.current?.zoomOut?.();
      else if (e.key === 'Escape') { setSelected(null); setPathEnds({ a: '', b: '' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportPng = () => {
    const uri = cyApi.current?.png?.();
    if (!uri) { toast.error(t('network.toast.canvasNotReady')); return; }
    downloadDataUrl(`dappa-network-${new Date().toISOString().slice(0, 10)}.png`, uri);
    toast.success(t('network.toast.pngExported'));
  };

  const exportCsv = () => {
    if (!filtered.nodes.length) { toast.info(t('network.toast.nothingToExport')); return; }
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`dappa-network-nodes-${day}.csv`, nodeCsvColumns(t), filtered.nodes);
    downloadCsv(`dappa-network-edges-${day}.csv`, edgeCsvColumns(t), filtered.edges);
    toast.success(t('network.toast.csvExported', {
      n: fmtInt(filtered.nodes.length),
      m: fmtInt(filtered.edges.length),
    }));
  };

  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success(t('network.toast.linkCopied'));
    else toast.error(t('network.toast.copyFailed'));
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
          broker={brokers.get(String(sel.data.id)) || null}
          isCut={cutSet.has(String(sel.data.id))}
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
          mutuals={mutualNeighbors(filtered.edges, sel.data.source, sel.data.target)
            .map((id) => nodesById.get(id))
            .filter(Boolean)}
        />
      );
    }
    return null;
  };

  const graphBody = () => {
    if (graph.error) {
      return (
        <EmptyState
          title={t('network.error.graph')}
          message={graph.error.message}
          action={<button type="button" className="btn" onClick={() => graph.refetch()}>{t('common.action.retry')}</button>}
        />
      );
    }
    if (graph.isLoading) return <div className="p-4"><LoadingSkeleton height={540} /></div>;
    if (!filtered.nodes.length) {
      return (
        <EmptyState
          title={t('network.empty.title')}
          message={communityId
            ? t('network.empty.communityMsg', { id: communityId })
            : t('network.empty.msg')}
          action={(communityId || minDegree > 1 || ego || Object.values(edgeTypes).some((v) => !v)) ? (
            <button type="button" className="btn" onClick={clearGraphFilters}>
              {t('network.empty.clearFilters')}
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
        highlightIds={bridgeIds}
        showLabels={showLabels}
        neighborFocus={neighborFocus}
        ariaLabel={t('network.graph.aria', {
          nodes: fmtInt(filtered.nodes.length),
          edges: fmtInt(filtered.edges.length),
        })}
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
  const isolatedCommunity = communityId ? communities.find((c) => c.id === String(communityId)) : null;

  const toolBtn = 'btn !py-1.5 !px-2.5 text-xs min-h-[40px]';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t('network.title')}</h1>
        <p className="page-subtitle">{t('network.subtitle')}</p>
      </div>

      <FilterBar show={['district']}>
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap min-h-[40px]">
          <span>{t('network.control.degreeMin')} <span className="num text-ink">{fmtInt(minDegree)}</span></span>
          <input
            type="range"
            min="1"
            max="8"
            step="1"
            value={minDegree}
            onChange={(e) => setParams({ minDegree: Number(e.target.value) > 1 ? e.target.value : '' })}
            className="accent-amber w-24"
            aria-label={t('network.control.degreeMinAria')}
          />
        </label>
        <span className="text-xs text-muted whitespace-nowrap hidden sm:inline" aria-hidden="true">{t('network.control.linksLabel')}</span>
        {EDGE_TIERS.map((tier) => (
          <Tooltip key={tier} label={t(`network.tier.${tier}Hint`)}>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none whitespace-nowrap min-h-[40px] px-0.5">
              <input
                type="checkbox"
                className="accent-amber h-4 w-4"
                checked={edgeTypes[tier]}
                onChange={(e) => setEdgeTypes((p) => ({ ...p, [tier]: e.target.checked }))}
              />
              {t(`network.tier.${tier}`)}
            </label>
          </Tooltip>
        ))}
        <Tooltip label={t('network.control.bridgesToggleHint')}>
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none whitespace-nowrap min-h-[40px] px-0.5">
            <input
              type="checkbox"
              className="accent-amber h-4 w-4"
              checked={edgeTypes.bridge}
              onChange={(e) => setEdgeTypes((p) => ({ ...p, bridge: e.target.checked }))}
            />
            {t('network.control.bridgesToggle')}
          </label>
        </Tooltip>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">{t('network.control.community')}</span>
          <select
            className="input-dark !py-1.5 max-w-[16rem]"
            value={communityId}
            onChange={(e) => setCommunity(e.target.value)}
            aria-label={t('network.control.communityAria')}
          >
            <option value="">{t('network.control.allCommunities')}</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {t(
                  c.districts
                    ? (c.districts > 1 ? 'network.control.communityOptionD' : 'network.control.communityOptionD1')
                    : 'network.control.communityOption',
                  { id: c.id, members: fmtInt(c.members), cases: fmtInt(c.cases), d: fmtInt(c.districts) },
                )}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      <SavedViews
        currentQuery={searchParams.toString()}
        onApply={(qs) => { setSelected(null); setSearchParams(new URLSearchParams(qs)); }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-grid/60 text-[11px] text-muted">
            <span className="num">{t('network.stat.people', { n: fmtInt(filtered.nodes.length) })}</span>
            <span>·</span>
            <span className="num">{t('network.stat.links', { n: fmtInt(filtered.edges.length) })}</span>
            <span>·</span>
            <span className="num">
              {t(components === 1 ? 'network.stat.components.one' : 'network.stat.components.other', { n: fmtInt(components) })}
            </span>
            <span>·</span>
            <span className="num">{t('network.stat.groups', { n: fmtInt(communities.length) })}</span>
            <span className="hidden md:inline">·</span>
            <Tooltip label={t('network.stat.densityHint')}>
              <span className="num hidden md:inline">{t('network.stat.density', { pct: fmtPct(density * 100, { digits: 1 }) })}</span>
            </Tooltip>
            <span className="hidden md:inline">·</span>
            <Tooltip label={t('network.stat.avgLinksHint')}>
              <span className="num hidden md:inline">{t('network.stat.avgLinks', { n: fmtNum(avgDegree, 1) })}</span>
            </Tooltip>
            {districtName && <Badge tone="amber">{tName('districts', districtId, districtName)}</Badge>}
            {communityId && <Badge tone="teal">{t('network.badge.isolated', { id: communityId })}</Badge>}
            {filtered.capped && <Badge tone="slate">{t('network.badge.capped', { n: fmtInt(NODE_CAP) })}</Badge>}
            {filtered.egoMissing && <Badge tone="slate">{t('network.badge.egoMissing')}</Badge>}
            {showBridges && !bridgeIds.length && <Badge tone="slate">{t('network.badge.noBridges')}</Badge>}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0">
              <div className="relative">
                <input
                  ref={searchRef}
                  className="input-dark !py-2 w-40 sm:w-48"
                  placeholder={t('network.search.placeholder')}
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  role="combobox"
                  aria-expanded={!!searchQ.trim()}
                  aria-controls="net-search-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={searchQ.trim() && searchMatches.length
                    ? `net-search-opt-${Math.min(searchIdx, searchMatches.length - 1)}`
                    : undefined}
                  aria-label={t('network.search.aria')}
                />
                {searchQ.trim() && (
                  <ul
                    id="net-search-listbox"
                    className="absolute right-0 z-40 mt-1 w-60 max-h-56 overflow-y-auto rounded-lg border border-grid bg-panel shadow-lift"
                    role="listbox"
                    aria-label={t('network.search.listAria')}
                  >
                    {searchMatches.length === 0 && (
                      <li className="px-3 py-2 text-[11px] text-muted" role="presentation">{t('network.search.noMatch')}</li>
                    )}
                    {searchMatches.map((n, i) => (
                      <li
                        key={String(n.id)}
                        id={`net-search-opt-${i}`}
                        role="option"
                        aria-selected={i === searchIdx}
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`w-full text-left px-3 py-2.5 min-h-[40px] text-xs text-ink transition-colors flex items-center justify-between gap-2 ${
                            i === searchIdx ? 'bg-grid/40' : 'hover:bg-grid/40'
                          }`}
                          onClick={() => pickSearch(n)}
                          onMouseEnter={() => setSearchIdx(i)}
                        >
                          <span className="truncate">{n.label || String(n.id)}</span>
                          <span className="num text-muted shrink-0">{fmtInt(n.caseCount)} {t('common.unit.cases')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <SegmentedControl
                ariaLabel={t('network.layout.aria')}
                value={layout}
                onChange={changeLayout}
                options={[
                  { value: 'fcose', label: t('network.layout.force') },
                  { value: 'concentric', label: t('network.layout.rings') },
                  { value: 'grid', label: t('network.layout.grid') },
                  { value: 'breadthfirst', label: t('network.layout.tree') },
                ]}
              />
              <Tooltip label={t('network.tool.zoomOutHint')}>
                <button type="button" className={toolBtn} onClick={() => cyApi.current?.zoomOut?.()} aria-label={t('network.tool.zoomOut')}>−</button>
              </Tooltip>
              <Tooltip label={t('network.tool.zoomInHint')}>
                <button type="button" className={toolBtn} onClick={() => cyApi.current?.zoomIn?.()} aria-label={t('network.tool.zoomIn')}>＋</button>
              </Tooltip>
              <Tooltip label={t('network.tool.fitHint')}>
                <button type="button" className={toolBtn} onClick={() => cyApi.current?.fit()}>
                  {t('network.tool.fit')}
                </button>
              </Tooltip>
              <Tooltip label={showLabels ? t('network.tool.labelsOnHint') : t('network.tool.labelsOffHint')}>
                <button
                  type="button"
                  className={`${toolBtn} ${showLabels ? '!border-amber/60 text-amber' : ''}`}
                  onClick={toggleLabels}
                  aria-pressed={showLabels}
                >
                  {t('network.tool.labels')}
                </button>
              </Tooltip>
              <Tooltip label={neighborFocus ? t('network.tool.focusOnHint') : t('network.tool.focusOffHint')}>
                <button
                  type="button"
                  className={`${toolBtn} ${neighborFocus ? '!border-amber/60 text-amber' : ''}`}
                  onClick={toggleNeighbor}
                  aria-pressed={neighborFocus}
                >
                  {t('network.tool.focus')}
                </button>
              </Tooltip>
              <Tooltip label={showBridges ? t('network.tool.bridgesOnHint') : t('network.tool.bridgesOffHint')}>
                <button
                  type="button"
                  className={`${toolBtn} ${showBridges ? '!border-amber/60 text-amber' : ''}`}
                  onClick={toggleBridges}
                  aria-pressed={showBridges}
                >
                  {t('network.tool.bridges')}
                </button>
              </Tooltip>
              <Tooltip label={t('network.tool.pngHint')}>
                <button type="button" className={toolBtn} onClick={exportPng}>
                  {t('network.tool.png')}
                </button>
              </Tooltip>
              <Tooltip label={t('network.tool.csvHint')}>
                <button type="button" className={toolBtn} onClick={exportCsv}>
                  {t('network.tool.csv')}
                </button>
              </Tooltip>
              <Tooltip label={t('network.tool.linkHint')}>
                <button type="button" className={toolBtn} onClick={copyLink}>
                  {t('network.tool.link')}
                </button>
              </Tooltip>
            </div>
          </div>

          {ego && !filtered.egoMissing && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-grid/60 text-[11px]">
              <Badge tone="teal" pulse>{t('network.ego.badge', { name: egoLabel })}</Badge>
              <span className="text-muted">{t('network.ego.depth')}</span>
              <SegmentedControl
                ariaLabel={t('network.ego.depthAria')}
                value={String(depth)}
                onChange={(v) => setParams({ depth: v })}
                options={[
                  { value: '1', label: t('network.ego.hop1') },
                  { value: '2', label: t('network.ego.hop2') },
                  { value: '3', label: t('network.ego.hop3') },
                ]}
              />
              <button type="button" className="btn !py-1.5 !px-2.5 text-[11px] min-h-[36px] ml-auto" onClick={() => setEgo(null)}>
                {t('network.ego.exit')}
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
                  className={`chip !py-1 min-h-[36px] hover:border-amber/50 transition-colors ${String(communityId) === c.id ? '!border-amber text-amber' : ''}`}
                  onClick={() => setCommunity(String(communityId) === c.id ? '' : c.id)}
                  title={t('network.chip.communityTitle', { members: fmtInt(c.members), label: c.topLabel })}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(c.id) }} />
                  #{c.id}
                  <span className="num text-muted">{fmtInt(c.members)}</span>
                </button>
              ))}
              {communities.length > 8 && (
                <span className="text-[11px] text-muted">
                  {t('network.chip.moreCommunities', { n: fmtInt(communities.length - 8) })}
                </span>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {isolatedCommunity && (
            <CommunitySummary
              communityId={communityId}
              community={isolatedCommunity}
              nodes={filtered.nodes}
              edges={filtered.edges}
              onPick={pickFromPanel}
              onClear={() => setCommunity('')}
              profilesByKey={profilesByKey}
              brokers={brokers}
            />
          )}

          <Card title={t('network.path.title')} subtitle={t('network.path.subtitle')}>
            <div className="space-y-2.5">
              <PersonSelect label={t('network.path.personA')} value={pathEnds.a} onChange={(v) => setPathEnds((p) => ({ ...p, a: v }))} options={personOptions} />
              <PersonSelect label={t('network.path.personB')} value={pathEnds.b} onChange={(v) => setPathEnds((p) => ({ ...p, b: v }))} options={personOptions} />
              {(pathEnds.a || pathEnds.b) && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn !py-1.5 !px-2.5 text-[11px] min-h-[36px]" onClick={() => setPathEnds({ a: '', b: '' })}>
                    {t('network.path.clear')}
                  </button>
                  <button
                    type="button"
                    className="btn !py-1.5 !px-2.5 text-[11px] min-h-[36px]"
                    onClick={() => setPathEnds((p) => ({ a: p.b, b: p.a }))}
                    title={t('network.path.swapHint')}
                  >
                    {t('network.path.swap')}
                  </button>
                </div>
              )}
              {pathEnds.a && pathEnds.b && (
                path ? (
                  <div className="text-xs text-ink space-y-1">
                    <span className="inline-flex flex-wrap gap-1.5">
                      <Badge tone="teal">
                        {t(path.length - 1 === 1 ? 'network.path.hops.one' : 'network.path.hops.other', { n: fmtInt(path.length - 1) })}
                      </Badge>
                      {pathStrength > 0 && (
                        <Badge tone="amber">
                          {t(pathStrength === 1 ? 'network.path.strength.one' : 'network.path.strength.other', { n: fmtInt(pathStrength) })}
                        </Badge>
                      )}
                    </span>
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
                  <p className="text-[11px] text-muted">{t('network.path.none')}</p>
                )
              )}
            </div>
          </Card>

          <TopConnectors nodes={filtered.nodes} onPick={pickFromPanel} />

          <WatchlistPanel nodesById={nodesById} onPick={pickFromPanel} />

          <Card
            title={t('network.legend.title')}
            actions={(
              <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={toggleLegend} aria-expanded={legendOpen}>
                {legendOpen ? t('network.legend.hide') : t('network.legend.show')}
              </button>
            )}
            padded={legendOpen}
          >
            {legendOpen && (
              <div className="space-y-3 text-[11px] text-muted">
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5">{t('network.legend.communities')}</p>
                  <ul className="space-y-1">
                    {communities.slice(0, 8).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: communityColor(c.id) }} />
                        <span className="text-ink shrink-0">#{c.id}</span>
                        <span className="truncate">{c.topLabel}</span>
                        <span className="num ml-auto shrink-0">{fmtInt(c.members)}</span>
                      </li>
                    ))}
                    {!communities.length && <li>{t('network.legend.noCommunities')}</li>}
                  </ul>
                </div>
                <ul className="space-y-1.5 border-t border-grid/60 pt-2.5">
                  <li>{t('network.legend.nodeSize')}</li>
                  <li>{t('network.legend.edgeWidth')}</li>
                  <li><span className="text-amber">{t('network.legend.amberRing')}</span> {t('network.legend.amberRingText')}</li>
                  <li><span className="text-teal">{t('network.legend.tealRing')}</span> {t('network.legend.tealRingText')}</li>
                  <li><span className="text-amber">{t('network.legend.dashedAmber')}</span> {t('network.legend.dashedAmberText')}</li>
                  <li>{t('network.legend.diamond')}</li>
                  <li>{t('network.legend.gestures')}</li>
                </ul>
                <div className="border-t border-grid/60 pt-2.5">
                  <DegreeHistogram nodes={filtered.nodes} />
                </div>
                <div className="border-t border-grid/60 pt-2.5">
                  <p className="text-[10px] uppercase tracking-wide mb-1.5">{t('network.legend.keyboard')}</p>
                  <ul className="space-y-1">
                    <li><kbd className="chip !py-0 !px-1.5 text-[10px] num">/</kbd> {t('network.legend.kbdFind')} · <kbd className="chip !py-0 !px-1.5 text-[10px] num">0</kbd> {t('network.legend.kbdFit')}</li>
                    <li><kbd className="chip !py-0 !px-1.5 text-[10px] num">+</kbd> / <kbd className="chip !py-0 !px-1.5 text-[10px] num">−</kbd> {t('network.legend.kbdZoom')} · <kbd className="chip !py-0 !px-1.5 text-[10px] num">Esc</kbd> {t('network.legend.kbdClear')}</li>
                  </ul>
                </div>
              </div>
            )}
          </Card>

          {isDesktop && (
            <Card title={selected
              ? (selected.type === 'node' ? t('network.select.person') : t('network.select.link'))
              : t('network.select.none')}
            >
              {!selected && (
                <EmptyState
                  compact
                  title={t('network.select.emptyTitle')}
                  message={t('network.select.emptyMsg')}
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
          title={selected?.type === 'node' ? t('network.select.person') : t('network.edge.title')}
        >
          {drawerFor(selected)}
        </Sheet>
      )}
    </div>
  );
}
