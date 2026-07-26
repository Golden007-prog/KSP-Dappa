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
import { useLookups, useNetworkGraph, useOffenders, useStationRisk, useHotspots } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { unitInfo } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Badge from '../components/Badge.jsx';
import Sheet from '../components/Sheet.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import Tabs from '../components/Tabs.jsx';
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
import LinkSuggestions from './network/LinkSuggestions.jsx';
import BrokerBoard from './network/BrokerBoard.jsx';
import GroupMatrix from './network/GroupMatrix.jsx';
import PairAnalyzer from './network/PairAnalyzer.jsx';
import {
  communityColor, computeCommunityStats, shortestPath, edgeKey,
  edgeTier, egoSubgraph, countComponents, brokerStats, articulationPoints,
  mutualNeighbors,
} from './network/graphUtils.js';
import {
  degreeIndex, corenessMap, bridgeEdges, strongestPath, graphBrief,
} from './network/analysis.js';
import { downloadDataUrl, downloadCsv, downloadBlob } from './network/download.js';
import { copyText } from './network/clipboard.js';
import { useMediaQuery, readPref, writePref } from './network/hooks.js';
import { useWatchlist } from './offenders/watchlistStore.js';
import EvidenceLoader from './network/EvidenceLoader.jsx';
import {
  RepeatVictimPanel, VictimDemographicsPanel, SuspectVictimPanel, MultiVictimPanel, VictimAgeProfile,
} from './network/VictimPanels.jsx';
import {
  RecurringLocationPanel, LocationAffiliationPanel, ColocationPanel, CommunityDistrictPanel,
  LocationFootprintPanel, HotspotEntityPanel,
} from './network/LocationPanels.jsx';
import { MultiHopPanel, TemporalPanel, PredictionLab } from './network/LinkLab.jsx';
import { VictimDrawer, LocationDrawer } from './network/EntityDrawers.jsx';
import { rankCaseIds, useCaseEvidence, DEFAULT_SAMPLE, SAMPLE_SIZES } from './network/entityData.js';
import {
  buildEntityIndex, victimElements, locationElements, isVictimId, isLocationId, LOCATION_PREFIX,
} from './network/entityGraph.js';
import { edgeTimeline } from './network/pathAnalysis.js';

// The live graph carries 23,833 links over 2,002 linked persons, so the canvas
// is capped and the cap is the analyst's choice rather than a hidden constant.
const NODE_CAPS = [200, 400, 800];
const DEFAULT_CAP = 400;
const MAX_DEGREE_FILTER = 40;
const MAX_CORE_FILTER = 30;
const LAYOUTS = ['fcose', 'concentric', 'grid', 'breadthfirst'];
const LAYOUT_PREF = 'dappa-net-layout';
const LEGEND_PREF = 'dappa-net-legend';
const LABELS_PREF = 'dappa-net-labels';
const NEIGHBOR_PREF = 'dappa-net-neighbor';
const BRIDGE_PREF = 'dappa-net-bridges';
const WEAK_PREF = 'dappa-net-weaklinks';
const CAP_PREF = 'dappa-net-cap';
const SAMPLE_PREF = 'dappa-net-sample';

// The canvas can draw three entity views over the same investigation: the
// co-accusal graph the route always had, plus the suspect↔victim and
// suspect↔location projections the challenge statement asks for. Victim and
// location entities live on the FIR, so those two modes need the evidence
// sample loaded (see network/entityData.js).
const GRAPH_MODES = ['cooffend', 'victim', 'location'];
// Bipartite fan-out is brutal: a 160-FIR sample can carry 250+ victim nodes,
// so each projection has its own honest, stated cap.
const VICTIM_NODE_CAP = 220;
const LOCATION_NODE_CAP = 80;
const ENTITY_TABS = ['victims', 'locations', 'links'];

// Drawer/sheet heading per selection class.
const SELECT_TITLE = {
  node: 'network.select.person',
  edge: 'network.edge.title',
  victim: 'network.select.victim',
  location: 'network.select.location',
};

// Tier ids only — labels/hints resolve through t('network.tier.<id>[Hint]').
const EDGE_TIERS = ['single', 'repeat', 'strong'];

// CSV headers are user-visible, so the column sets are built per render with
// the active translator rather than frozen at module load.
const nodeCsvColumns = (t, degrees = new Map(), core = new Map()) => [
  { key: 'id', label: t('network.csv.personKey') },
  { key: 'label', label: t('network.csv.name') },
  { key: 'communityId', label: t('network.csv.community') },
  { label: t('network.csv.links'), map: (n) => degrees.get(String(n.id))?.links || 0 },
  { label: t('network.csv.coreness'), map: (n) => core.get(String(n.id)) || 0 },
  { key: 'degree', label: t('network.csv.degree') },
  { key: 'caseCount', label: t('network.csv.cases') },
];
const edgeCsvColumns = (t) => [
  { key: 'source', label: t('network.csv.personA') },
  { key: 'target', label: t('network.csv.personB') },
  { key: 'weight', label: t('network.csv.sharedCases') },
  { label: t('network.csv.caseIds'), map: (e) => (e.caseIds || []).join('; ') },
];

// Co-offending degree is heavy-tailed on the real graph (median 6, max 263),
// so the histogram uses doubling buckets instead of the old 1..8 linear strip,
// which flattened the entire live distribution into its first two bars.
const DEGREE_BUCKETS = [
  { label: '1', test: (d) => d === 1 },
  { label: '2–3', test: (d) => d >= 2 && d <= 3 },
  { label: '4–7', test: (d) => d >= 4 && d <= 7 },
  { label: '8–15', test: (d) => d >= 8 && d <= 15 },
  { label: '16–31', test: (d) => d >= 16 && d <= 31 },
  { label: '32–63', test: (d) => d >= 32 && d <= 63 },
  { label: '64+', test: (d) => d >= 64 },
];

/** Degree-distribution bar strip for the Legend card (doubling buckets). */
function DegreeHistogram({ nodes, degrees }) {
  const t = useT();
  const counts = DEGREE_BUCKETS.map(() => 0);
  for (const n of nodes) {
    const d = degrees.get(String(n.id))?.links || 0;
    const i = DEGREE_BUCKETS.findIndex((b) => b.test(d));
    if (i >= 0) counts[i] += 1;
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
          list: counts.map((c, i) => `${DEGREE_BUCKETS[i].label}: ${fmtInt(c)}`).join(', '),
        })}
      >
        {counts.map((c, i) => (
          <div key={DEGREE_BUCKETS[i].label} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <div
              className={`w-full rounded-sm ${c ? 'bg-amber/70' : 'bg-grid/50'}`}
              style={{ height: `${3 + Math.round((c / max) * 30)}px` }}
              title={t('network.legend.degreeBarTitle', { d: DEGREE_BUCKETS[i].label, n: fmtInt(c) })}
            />
            <span className="text-[9px] text-muted num" aria-hidden="true">{DEGREE_BUCKETS[i].label}</span>
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
  const minDegree = Math.min(MAX_DEGREE_FILTER, Math.max(1, Number(searchParams.get('minDegree')) || 1));
  // The live graph peels to a 34-core, so the ceiling is 30 rather than a
  // token single digit — the slider has to be able to reach the nucleus.
  const minCore = Math.min(MAX_CORE_FILTER, Math.max(0, Number(searchParams.get('core')) || 0));
  // Entity-view state is URL-synced too, so "the Whitefield PS crew in 2025"
  // is a link an investigator can paste into a case file.
  const rawMode = searchParams.get('mode') || '';
  const graphMode = GRAPH_MODES.includes(rawMode) ? rawMode : 'cooffend';
  const unitFocus = searchParams.get('unit') || '';
  const period = searchParams.get('period') || '';

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
  const [showWeak, setShowWeak] = useState(() => readPref(WEAK_PREF, '0') === '1');
  const [pathMode, setPathMode] = useState('hops');
  const [suggestion, setSuggestion] = useState(null); // predicted-link inspection
  const [groupPair, setGroupPair] = useState(null); // [communityA, communityB]
  const [nodeCap, setNodeCap] = useState(() => {
    const v = Number(readPref(CAP_PREF, String(DEFAULT_CAP)));
    return NODE_CAPS.includes(v) ? v : DEFAULT_CAP;
  });
  const [sampleSize, setSampleSize] = useState(() => {
    const v = Number(readPref(SAMPLE_PREF, String(DEFAULT_SAMPLE)));
    return SAMPLE_SIZES.includes(v) ? v : DEFAULT_SAMPLE;
  });
  const [evidenceOn, setEvidenceOn] = useState(false);
  const [entityTab, setEntityTab] = useState(ENTITY_TABS[0]);
  const [routePick, setRoutePick] = useState(null);
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
  // Location entities are enriched from two cheap reads: the 282 StationRisk
  // rows give each unit a live risk score, the 17 HotspotCluster rows are
  // recurring places in their own right.
  const stationRisk = useStationRisk();
  const hotspots = useHotspots();

  const riskByUnit = useMemo(() => {
    const m = new Map();
    for (const r of stationRisk.data || []) {
      if (r.unitName) m.set(String(r.unitName), Number(r.riskScore));
    }
    return m;
  }, [stationRisk.data]);

  const districtNameById = useMemo(() => {
    const m = new Map();
    for (const d of lookups.data?.districts || []) {
      m.set(String(d.districtId), d.districtName);
      m.set(String(d.districtId).replace(/^0+(?=\d)/, ''), d.districtName);
    }
    return m;
  }, [lookups.data]);

  // Crime-head names arrive as strings on the FIR; the translated name lives
  // under the numeric id, so resolve one from the other for the demographics
  // table rather than showing English inside a Kannada screen.
  const headLabel = useMemo(() => {
    const byName = new Map();
    for (const h of lookups.data?.crimeHeads || []) byName.set(h.headName, h.crimeHeadId);
    return (name) => (name ? tName('crimeHeads', byName.get(name) ?? name, name) || name : '');
  }, [lookups.data, tName]);

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

  /** personKey → community label, over the FULL graph (co-location needs it). */
  const communityOf = useMemo(() => {
    const m = new Map();
    for (const n of graph.data?.nodes || []) {
      const cid = n?.communityId;
      if (cid === null || cid === undefined || cid === '') continue;
      m.set(String(n.id), String(cid));
    }
    return m;
  }, [graph.data]);

  // Tier-filtered edge universe — the basis for TRUE co-offending degree. The
  // API forwards OffenderProfile.DegreeCentrality as a normalized 0–1 value
  // (0.0205 for a person with 41 partners), so every degree read in this route
  // is recomputed from the edges instead.
  const tierEdges = useMemo(() => {
    const allNodes = graph.data?.nodes || [];
    const commOf = new Map();
    for (const n of allNodes) commOf.set(String(n.id), String(n.communityId ?? ''));
    let edges = (graph.data?.edges || []).map((e) => ({ ...e, id: edgeKey(e.source, e.target) }));
    edges = edges.filter((e) => edgeTypes[edgeTier(e.weight)]);
    if (!edgeTypes.bridge) {
      edges = edges.filter((e) => commOf.get(String(e.source)) === commOf.get(String(e.target)));
    }
    return edges;
  }, [graph.data, edgeTypes]);

  const degrees = useMemo(() => degreeIndex(tierEdges), [tierEdges]);
  const maxLinks = useMemo(() => {
    let m = 0;
    for (const s of degrees.values()) m = Math.max(m, s.links);
    return m;
  }, [degrees]);

  // Client-side view pipeline: edge tiers → bridges → community isolate →
  // linked-only → ego subgraph → min-degree floor → k-core floor → node cap.
  const filtered = useMemo(() => {
    const allNodes = graph.data?.nodes || [];
    let edges = tierEdges;

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
      nodes = nodes.filter((n) => (degrees.get(String(n.id))?.links || 0) >= minDegree || String(n.id) === ego);
      const keep = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
    }

    // k-core floor — peel everyone who is not inside a subgraph where every
    // member keeps at least `minCore` co-accused links. This is the structural
    // way to get from 2,000 fringe names to the nucleus that matters.
    let coreOfView = new Map();
    let maxCoreOfView = 0;
    if (nodes.length) {
      const c = corenessMap(nodes, edges);
      coreOfView = c.core;
      maxCoreOfView = c.maxCore;
      if (minCore > 0) {
        nodes = nodes.filter((n) => (coreOfView.get(String(n.id)) || 0) >= minCore || String(n.id) === ego);
        const keep = new Set(nodes.map((n) => String(n.id)));
        edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
      }
    }

    let capped = 0;
    if (nodes.length > nodeCap) {
      capped = nodes.length;
      nodes = [...nodes]
        .sort((a, b) => (degrees.get(String(b.id))?.links || 0) - (degrees.get(String(a.id))?.links || 0))
        .slice(0, nodeCap);
      const keep = new Set(nodes.map((n) => String(n.id)));
      edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
    }
    return { nodes, edges, capped, egoMissing, core: coreOfView, maxCore: maxCoreOfView };
  }, [graph.data, tierEdges, degrees, communityId, ego, depth, minDegree, minCore, nodeCap]);

  // ── FIR evidence sample → victim + location entities ──────────────────────
  // The co-accusal edges name the FIRs that bind each pair; the FIRs name the
  // victims and the registering unit. One bounded fetch therefore unlocks both
  // missing entity classes at once, and `caseRank.total` keeps the honest
  // denominator in front of the analyst everywhere the sample is used.
  const caseRank = useMemo(() => rankCaseIds(filtered.edges, sampleSize), [filtered.edges, sampleSize]);
  const evidence = useCaseEvidence(caseRank.ids, { enabled: evidenceOn });
  const entityIndex = useMemo(
    () => buildEntityIndex(evidence.cases, caseRank.suspectsByCase),
    [evidence.cases, caseRank.suspectsByCase],
  );
  const dateByCase = useMemo(() => {
    const m = new Map();
    for (const c of entityIndex.caseById.values()) if (c.registeredDate) m.set(c.caseId, c.registeredDate);
    return m;
  }, [entityIndex]);
  const timeline = useMemo(
    () => edgeTimeline(filtered.edges, dateByCase, { grain: period.includes('-Q') ? 'quarter' : 'year' }),
    [filtered.edges, dateByCase, period],
  );

  // Two further view stages, both driven by the entity model above: a
  // location-centred subgraph (everyone whose sampled FIRs touch one unit) and
  // a period slice (edges evidenced by a FIR registered in that window).
  // Coreness/cap stats stay those of the parent view — they describe the
  // structure these slices were cut out of, which is the useful reading.
  const view = useMemo(() => {
    let { nodes, edges } = filtered;
    let unitMissing = false;
    if (unitFocus) {
      const loc = entityIndex.locations.get(LOCATION_PREFIX + unitFocus);
      if (loc && loc.suspects.size) {
        nodes = nodes.filter((n) => loc.suspects.has(String(n.id)));
        const keep = new Set(nodes.map((n) => String(n.id)));
        edges = edges.filter((e) => keep.has(String(e.source)) && keep.has(String(e.target)));
      } else {
        unitMissing = true;
      }
    }
    if (period && timeline.byPeriod.has(period)) {
      const live = timeline.byPeriod.get(period);
      edges = edges.filter((e) => live.has(e.id));
      const keep = new Set();
      for (const e of edges) { keep.add(String(e.source)); keep.add(String(e.target)); }
      nodes = nodes.filter((n) => keep.has(String(n.id)));
    }
    return { ...filtered, nodes, edges, unitMissing };
  }, [filtered, unitFocus, period, entityIndex, timeline]);

  const components = useMemo(
    () => countComponents(view.nodes, view.edges),
    [view.nodes, view.edges],
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
    () => articulationPoints(view.nodes, view.edges),
    [view.nodes, view.edges],
  );
  // Structural bridges (cut EDGES) — a single shared FIR holding two crews
  // together. Removing it splits the component, which makes it the highest
  // value corroboration target in the view.
  const weakSet = useMemo(
    () => (showWeak ? bridgeEdges(view.nodes, view.edges) : new Set()),
    [showWeak, view.nodes, view.edges],
  );

  const crossCommunityIds = useMemo(() => {
    const commOf = new Map(view.nodes.map((n) => [String(n.id), String(n.communityId ?? '')]));
    const ids = new Set();
    for (const e of view.edges) {
      const cs = commOf.get(String(e.source)); const ct = commOf.get(String(e.target));
      if (cs !== undefined && ct !== undefined && cs !== '' && ct !== '' && cs !== ct) {
        ids.add(e.id); ids.add(String(e.source)); ids.add(String(e.target));
      }
    }
    return ids;
  }, [view.nodes, view.edges]);

  // Highlight precedence: an inspected prediction, then a picked group pair,
  // then the standing Bridges / Weak-link toggles.
  const bridgeIds = useMemo(() => {
    if (suggestion) {
      // If a filter change dropped an endpoint, highlight nothing rather than
      // dimming the whole canvas around elements that are no longer drawn.
      const visible = new Set(view.nodes.map((n) => String(n.id)));
      if (!visible.has(String(suggestion.a)) || !visible.has(String(suggestion.b))) return [];
      const ids = new Set([String(suggestion.a), String(suggestion.b),
        ...(suggestion.via || []).map(String).filter((v) => visible.has(v))]);
      for (const e of view.edges) {
        const s = String(e.source); const tg = String(e.target);
        if (ids.has(s) && ids.has(tg)) ids.add(e.id);
      }
      return [...ids];
    }
    if (groupPair) {
      const commOf = new Map(view.nodes.map((n) => [String(n.id), String(n.communityId ?? '')]));
      const ids = new Set();
      for (const e of view.edges) {
        const cs = commOf.get(String(e.source)); const ct = commOf.get(String(e.target));
        const hit = (cs === groupPair[0] && ct === groupPair[1]) || (cs === groupPair[1] && ct === groupPair[0]);
        if (hit) { ids.add(e.id); ids.add(String(e.source)); ids.add(String(e.target)); }
      }
      return [...ids];
    }
    const ids = new Set();
    if (showBridges) for (const id of crossCommunityIds) ids.add(id);
    if (showWeak) {
      for (const e of view.edges) {
        if (!weakSet.has(e.id)) continue;
        ids.add(e.id); ids.add(String(e.source)); ids.add(String(e.target));
      }
    }
    return [...ids];
  }, [suggestion, groupPair, showBridges, showWeak, weakSet, crossCommunityIds, view.nodes, view.edges]);

  const density = view.nodes.length > 1
    ? (2 * view.edges.length) / (view.nodes.length * (view.nodes.length - 1))
    : 0;
  const avgDegree = view.nodes.length ? (2 * view.edges.length) / view.nodes.length : 0;

  const nodesById = useMemo(() => {
    const m = new Map();
    for (const n of view.nodes) m.set(String(n.id), n);
    return m;
  }, [view.nodes]);

  const coElements = useMemo(() => {
    const maxDegree = Math.max(1, ...view.nodes.map((n) => degrees.get(String(n.id))?.links || 0));
    const maxWeight = Math.max(1, ...view.edges.map((e) => Number(e.weight) || 0));
    const nodes = view.nodes.map((n) => ({
      data: {
        id: String(n.id),
        label: n.label || String(n.id),
        color: communityColor(n.communityId),
        size: Math.round(16 + 26 * Math.sqrt((degrees.get(String(n.id))?.links || 0) / maxDegree)),
        communityId: n.communityId,
        caseCount: n.caseCount,
        degree: n.degree,
        links: degrees.get(String(n.id))?.links || 0,
        coreness: view.core.get(String(n.id)) || 0,
        isEgo: ego && String(n.id) === ego ? 1 : 0,
        watch: watchKeys.has(String(n.id)) ? 1 : 0,
      },
    }));
    const edges = view.edges.map((e) => ({
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
  }, [view, degrees, ego, watchKeys]);

  // The suspect↔victim and suspect↔location projections. Both are built off
  // the whole visible edge set rather than the unit/period slice so the
  // projection stays a stable frame of reference while those slices move.
  const projection = useMemo(() => {
    if (graphMode === 'victim') {
      return victimElements(entityIndex, {
        nodesById: allNodesById, colorOf: communityColor, cap: VICTIM_NODE_CAP, watchKeys,
      });
    }
    if (graphMode === 'location') {
      return locationElements(entityIndex, {
        nodesById: allNodesById, colorOf: communityColor, cap: LOCATION_NODE_CAP, watchKeys, riskByUnit,
      });
    }
    return null;
  }, [graphMode, entityIndex, allNodesById, watchKeys, riskByUnit]);

  const elements = graphMode === 'cooffend' ? coElements : (projection?.elements || []);

  // Association path over the visible edges — fewest hops (BFS) or strongest
  // evidence (Dijkstra on 1/shared-FIRs, so repeat co-offending beats a chain
  // of one-off links even when that costs an extra hop). A route picked in the
  // multi-hop panel overrides the default single answer.
  const basePath = useMemo(() => {
    if (!pathEnds.a || !pathEnds.b) return null;
    return pathMode === 'strength'
      ? strongestPath(view.edges, pathEnds.a, pathEnds.b)
      : shortestPath(view.edges, pathEnds.a, pathEnds.b);
  }, [view.edges, pathEnds, pathMode]);
  const path = routePick?.path || basePath;
  const pathIds = useMemo(() => {
    if (graphMode !== 'cooffend' || !path || path.length < 2) return [];
    const ids = [...path];
    for (let i = 0; i < path.length - 1; i += 1) ids.push(edgeKey(path[i], path[i + 1]));
    return ids;
  }, [path, graphMode]);
  // Path strength — total shared FIRs across the hops (evidence weight).
  const pathStrength = useMemo(() => {
    if (!path || path.length < 2) return 0;
    const wByKey = new Map(view.edges.map((e) => [e.id, Number(e.weight) || 0]));
    let sum = 0;
    for (let i = 0; i < path.length - 1; i += 1) sum += wByKey.get(edgeKey(path[i], path[i + 1])) || 0;
    return sum;
  }, [path, view.edges]);

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

  // Reset the pair tools and any standing highlight when the visible universe
  // changes shape — a suggestion or group pair from the old slice is not an
  // answer about the new one.
  useEffect(() => {
    setPathEnds({ a: '', b: '' });
    setSuggestion(null);
    setGroupPair(null);
    setRoutePick(null);
  }, [districtName, communityId, ego]);

  // A ranked route is an answer about one edge set; changing the slice or the
  // endpoints invalidates it.
  useEffect(() => { setRoutePick(null); }, [pathEnds.a, pathEnds.b, pathMode, unitFocus, period]);

  // Switching projection clears any co-accusal selection: a person drawer opened
  // on the co-offending canvas is not what a tap on the victim canvas means.
  useEffect(() => { setSelected(null); }, [graphMode]);

  // A drawer must never show an element the filters just removed — close it
  // (Isolate / ego / path actions would otherwise target an off-screen target).
  // Victim/location selections live in the entity index rather than the
  // co-accusal view, so they are validated against that index instead.
  useEffect(() => {
    if (!selected || graph.isLoading) return;
    if (selected.type === 'victim') {
      if (!entityIndex.victims.has(String(selected.data.id))) setSelected(null);
    } else if (selected.type === 'location') {
      if (!entityIndex.locations.has(String(selected.data.id))) setSelected(null);
    } else if (graphMode !== 'cooffend') {
      // person node inside a projection — validated by the projection itself
    } else if (selected.type === 'node' && !nodesById.has(String(selected.data.id))) setSelected(null);
    else if (selected.type === 'edge'
      && !view.edges.some((e) => String(e.id) === String(selected.data.id))) setSelected(null);
  }, [selected, nodesById, view.edges, graph.isLoading, entityIndex, graphMode]);

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
    setSuggestion(null); setGroupPair(null);
    setShowBridges((v) => { writePref(BRIDGE_PREF, v ? '0' : '1'); return !v; });
  };
  const toggleWeak = () => {
    setSuggestion(null); setGroupPair(null);
    setShowWeak((v) => { writePref(WEAK_PREF, v ? '0' : '1'); return !v; });
  };
  const changeCap = (v) => { setNodeCap(v); writePref(CAP_PREF, String(v)); };
  const changeSample = (v) => { setSampleSize(v); writePref(SAMPLE_PREF, String(v)); };

  const changeMode = (m) => {
    setParams({ mode: m === 'cooffend' ? '' : m });
    // Both projections are FIR-derived: switching into one without the sample
    // would show an empty canvas, so ask for it in the same gesture.
    if (m !== 'cooffend' && !evidenceOn) setEvidenceOn(true);
  };
  const setUnitFocus = (unit) => setParams({ unit: unit || '' });
  const setPeriod = (p) => setParams({ period: p || '' });

  const clearGraphFilters = () => {
    setCommunity('');
    setParams({ minDegree: '', ego: '', depth: '', core: '', unit: '', period: '' });
    setEdgeTypes({ single: true, repeat: true, strong: true, bridge: true });
    setSuggestion(null);
    setGroupPair(null);
    setRoutePick(null);
  };

  // A predicted link is inspected, not applied: both people load into the pair
  // tools and the canvas highlights them with the associates that connect them.
  const inspectSuggestion = (r) => {
    setSuggestion((prev) => (prev && prev.a === r.a && prev.b === r.b ? null : r));
    setGroupPair(null);
    setPathEnds({ a: String(r.a), b: String(r.b) });
    cyApi.current?.flyTo(String(r.a));
  };

  const pickGroupPair = (a, b) => {
    setSuggestion(null);
    setGroupPair((prev) => (prev && prev[0] === a && prev[1] === b ? null : [a, b]));
  };

  const personOptions = useMemo(
    () => view.nodes
      .map((n) => ({
        id: String(n.id),
        label: t('network.path.personOption', { name: n.label || n.id, n: fmtInt(n.caseCount) }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [view.nodes, t],
  );

  const searchMatches = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return view.nodes
      .filter((n) => `${n.label || ''} ${n.id}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [view.nodes, searchQ]);

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

  // Panels hand back bare ids; resolve them against the widest node map so a
  // person named on a victim row is still openable when the co-accusal cap
  // dropped them from the canvas.
  const pickPersonKey = (personKey) => {
    const n = nodesById.get(String(personKey)) || allNodesById.get(String(personKey));
    if (n) pickFromPanel(n);
  };
  const pickVictim = (victimId) => {
    const v = entityIndex.victims.get(String(victimId));
    if (!v) return;
    setSelected({ type: 'victim', data: { id: v.id, label: v.name, age: v.age, gender: v.gender } });
    if (graphMode === 'victim') cyApi.current?.flyTo(v.id);
  };
  const pickLocationNode = (unitName) => {
    const loc = entityIndex.locations.get(LOCATION_PREFIX + String(unitName));
    if (!loc) return;
    setSelected({ type: 'location', data: { id: loc.id, label: loc.unitName, unitName: loc.unitName, districtName: loc.districtName } });
    if (graphMode === 'location') cyApi.current?.flyTo(loc.id);
  };
  const onCanvasNodeTap = (d) => {
    const id = String(d.id);
    if (isVictimId(id)) setSelected({ type: 'victim', data: d });
    else if (isLocationId(id)) setSelected({ type: 'location', data: d });
    else setSelected({ type: 'node', data: d });
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
    if (!view.nodes.length) { toast.info(t('network.toast.nothingToExport')); return; }
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`dappa-network-nodes-${day}.csv`, nodeCsvColumns(t, degrees, view.core), view.nodes);
    downloadCsv(`dappa-network-edges-${day}.csv`, edgeCsvColumns(t), view.edges);
    toast.success(t('network.toast.csvExported', {
      n: fmtInt(view.nodes.length),
      m: fmtInt(view.edges.length),
    }));
  };

  // Subgraph handoff — the exact visible slice as a graph-exchange JSON
  // (nodes with community/degree/coreness + weighted edges with case ids), so
  // the view can travel into a case file or another tool without a re-query.
  const exportJson = () => {
    if (!view.nodes.length) { toast.info(t('network.toast.nothingToExport')); return; }
    const payload = {
      generatedAt: new Date().toISOString(),
      scope: {
        district: districtName || null,
        communityId: communityId || null,
        ego: ego || null,
        depth: ego ? depth : null,
        minDegree,
        minCore,
        edgeTiers: Object.entries(edgeTypes).filter(([, v]) => v).map(([k]) => k),
        nodeCap,
        capped: view.capped || 0,
      },
      stats: {
        people: view.nodes.length,
        links: view.edges.length,
        components,
        groups: communities.length,
        density,
      },
      nodes: view.nodes.map((n) => ({
        personKey: String(n.id),
        name: n.label || String(n.id),
        communityId: n.communityId ?? null,
        caseCount: Number(n.caseCount) || 0,
        links: degrees.get(String(n.id))?.links || 0,
        sharedFirs: degrees.get(String(n.id))?.weight || 0,
        coreness: view.core.get(String(n.id)) || 0,
      })),
      edges: view.edges.map((e) => ({
        source: String(e.source),
        target: String(e.target),
        sharedCases: Number(e.weight) || 0,
        caseIds: e.caseIds || [],
      })),
    };
    downloadBlob(
      `dappa-network-subgraph-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
    toast.success(t('network.toast.jsonExported', {
      n: fmtInt(view.nodes.length),
      m: fmtInt(view.edges.length),
    }));
  };

  const copyBrief = async () => {
    const scope = [
      districtName ? tName('districts', districtId, districtName) : t('network.brief.statewide'),
      communityId ? t('network.badge.isolated', { id: communityId }) : '',
      ego ? t('network.ego.badge', { name: egoLabel }) : '',
    ].filter(Boolean).join(' · ');
    const text = graphBrief({
      nodes: view.nodes, edges: view.edges, communities, scope,
    });
    const ok = await copyText(text);
    if (ok) toast.success(t('network.toast.briefCopied'));
    else toast.error(t('network.toast.copyFailed'));
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
          links={degrees.get(String(sel.data.id))?.links ?? null}
          sharedFirs={degrees.get(String(sel.data.id))?.weight ?? null}
          coreness={view.core.get(String(sel.data.id)) ?? null}
          viewEdges={view.edges}
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
          mutuals={mutualNeighbors(view.edges, sel.data.source, sel.data.target)
            .map((id) => nodesById.get(id))
            .filter(Boolean)}
        />
      );
    }
    if (sel?.type === 'victim') {
      return (
        <VictimDrawer
          victim={sel.data}
          index={entityIndex}
          nodesById={allNodesById}
          onClose={() => setSelected(null)}
          onPickPerson={pickPersonKey}
        />
      );
    }
    if (sel?.type === 'location') {
      return (
        <LocationDrawer
          location={sel.data}
          index={entityIndex}
          nodesById={allNodesById}
          onClose={() => setSelected(null)}
          onPickPerson={pickPersonKey}
          onIsolateUnit={setUnitFocus}
          activeUnit={unitFocus}
          riskScore={riskByUnit.get(sel.data.unitName || sel.data.label) ?? null}
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
    // The two projections need the FIR sample; say so and offer it in one tap
    // rather than rendering an unexplained empty canvas.
    if (graphMode !== 'cooffend') {
      if (!evidenceOn) {
        return (
          <EmptyState
            title={t(graphMode === 'victim' ? 'network.mode.victimNeedTitle' : 'network.mode.locationNeedTitle')}
            message={t('network.mode.needMsg', { n: fmtInt(Math.min(sampleSize, caseRank.total)), total: fmtInt(caseRank.total) })}
            action={(
              <button type="button" className="btn btn-primary" onClick={() => setEvidenceOn(true)} disabled={!caseRank.total}>
                {t('network.sample.load', { n: fmtInt(Math.min(sampleSize, caseRank.total)) })}
              </button>
            )}
          />
        );
      }
      if (evidence.isFetching && !elements.length) return <div className="p-4"><LoadingSkeleton height={540} /></div>;
      if (!elements.length) {
        return (
          <EmptyState
            title={t('network.mode.emptyTitle')}
            message={t('network.mode.emptyMsg')}
            action={(
              <button type="button" className="btn" onClick={() => changeMode('cooffend')}>
                {t('network.mode.back')}
              </button>
            )}
          />
        );
      }
      return (
        <CytoGraph
          elements={elements}
          layout={layout === 'breadthfirst' ? 'fcose' : layout}
          selectedId={selected ? String(selected.data.id) : ''}
          pathIds={[]}
          highlightIds={[]}
          showLabels={showLabels}
          neighborFocus={neighborFocus}
          ariaLabel={t(graphMode === 'victim' ? 'network.mode.victimAria' : 'network.mode.locationAria', {
            people: fmtInt(projection?.persons || 0),
            others: fmtInt(graphMode === 'victim' ? (projection?.shownVictims || 0) : (projection?.shownLocations || 0)),
            links: fmtInt(projection?.links || 0),
          })}
          onNodeTap={onCanvasNodeTap}
          onEdgeTap={() => {}}
          onBackgroundTap={() => setSelected(null)}
          onLayoutStop={onLayoutStop}
          apiRef={cyApi}
          height={560}
        />
      );
    }
    if (!view.nodes.length) {
      return (
        <EmptyState
          title={t('network.empty.title')}
          message={communityId
            ? t('network.empty.communityMsg', { id: communityId })
            : t('network.empty.msg')}
          action={(communityId || minDegree > 1 || minCore > 0 || ego || Object.values(edgeTypes).some((v) => !v)) ? (
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
          nodes: fmtInt(view.nodes.length),
          edges: fmtInt(view.edges.length),
        })}
        onNodeTap={onCanvasNodeTap}
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
        <Tooltip label={t('network.mode.hint')}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">{t('network.mode.label')}</span>
            <SegmentedControl
              ariaLabel={t('network.mode.aria')}
              value={graphMode}
              onChange={changeMode}
              options={[
                { value: 'cooffend', label: t('network.mode.cooffend') },
                { value: 'victim', label: t('network.mode.victim') },
                { value: 'location', label: t('network.mode.location') },
              ]}
            />
          </div>
        </Tooltip>
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap min-h-[40px]">
          <span>{t('network.control.degreeMin')} <span className="num text-ink">{fmtInt(minDegree)}</span></span>
          <input
            type="range"
            min="1"
            max={MAX_DEGREE_FILTER}
            step="1"
            value={minDegree}
            onChange={(e) => setParams({ minDegree: Number(e.target.value) > 1 ? e.target.value : '' })}
            className="accent-amber w-24"
            aria-label={t('network.control.degreeMinAria')}
          />
        </label>
        <Tooltip label={t('network.control.coreHint')}>
          <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap min-h-[40px]">
            <span>{t('network.control.core')} <span className="num text-ink">{fmtInt(minCore)}</span></span>
            <input
              type="range"
              min="0"
              max={MAX_CORE_FILTER}
              step="1"
              value={minCore}
              onChange={(e) => setParams({ core: Number(e.target.value) > 0 ? e.target.value : '' })}
              className="accent-amber w-20"
              aria-label={t('network.control.coreAria')}
            />
          </label>
        </Tooltip>
        <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
          <span className="hidden sm:inline">{t('network.control.cap')}</span>
          <select
            className="input-dark !py-1.5"
            value={nodeCap}
            onChange={(e) => changeCap(Number(e.target.value))}
            aria-label={t('network.control.capAria')}
          >
            {NODE_CAPS.map((c) => (
              <option key={c} value={c}>{t('network.control.capOption', { n: fmtInt(c) })}</option>
            ))}
          </select>
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
            {graphMode === 'cooffend' ? (
              <>
                <span className="num">{t('network.stat.people', { n: fmtInt(view.nodes.length) })}</span>
                <span>·</span>
                <span className="num">{t('network.stat.links', { n: fmtInt(view.edges.length) })}</span>
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
                <span className="hidden lg:inline">·</span>
                <Tooltip label={t('network.stat.maxCoreHint')}>
                  <span className="num hidden lg:inline">{t('network.stat.maxCore', { n: fmtInt(view.maxCore) })}</span>
                </Tooltip>
              </>
            ) : (
              <>
                <span className="num">{t('network.stat.people', { n: fmtInt(projection?.persons || 0) })}</span>
                <span>·</span>
                <span className="num text-teal">
                  {graphMode === 'victim'
                    ? t('network.stat.victims', { n: fmtInt(projection?.shownVictims || 0) })
                    : t('network.stat.locations', { n: fmtInt(projection?.shownLocations || 0) })}
                </span>
                <span>·</span>
                <span className="num">{t('network.stat.ties', { n: fmtInt(projection?.links || 0) })}</span>
                {graphMode === 'victim' && (projection?.totalVictims || 0) > (projection?.shownVictims || 0) && (
                  <Badge tone="slate">{t('network.stat.victimCap', { n: fmtInt(projection.shownVictims), total: fmtInt(projection.totalVictims) })}</Badge>
                )}
                {graphMode === 'location' && (projection?.totalLocations || 0) > (projection?.shownLocations || 0) && (
                  <Badge tone="slate">{t('network.stat.locationCap', { n: fmtInt(projection.shownLocations), total: fmtInt(projection.totalLocations) })}</Badge>
                )}
                <Badge tone="teal">{t('network.stat.fromSample', { n: fmtInt(evidence.loaded), total: fmtInt(caseRank.total) })}</Badge>
              </>
            )}
            {districtName && <Badge tone="amber">{tName('districts', districtId, districtName)}</Badge>}
            {communityId && <Badge tone="teal">{t('network.badge.isolated', { id: communityId })}</Badge>}
            {/* Co-accusal-view bookkeeping — a node cap or k-core floor says
                nothing about a projection, so it is not shown against one. */}
            {graphMode === 'cooffend' && !unitFocus && !period && view.capped > 0 && (
              <Badge tone="slate">{t('network.badge.cappedOf', { n: fmtInt(nodeCap), total: fmtInt(view.capped) })}</Badge>
            )}
            {graphMode === 'cooffend' && minCore > 0 && <Badge tone="teal">{t('network.badge.core', { n: fmtInt(minCore) })}</Badge>}
            {graphMode === 'cooffend' && view.egoMissing && <Badge tone="slate">{t('network.badge.egoMissing')}</Badge>}
            {unitFocus && (
              <button type="button" className="chip !py-0.5 !px-2 text-[10px] min-h-[32px] !border-amber text-amber" onClick={() => setUnitFocus('')}>
                {t('network.badge.unitFocus', { unit: unitFocus })} ✕
              </button>
            )}
            {view.unitMissing && <Badge tone="slate">{t('network.badge.unitMissing')}</Badge>}
            {period && (
              <button type="button" className="chip !py-0.5 !px-2 text-[10px] min-h-[32px] !border-teal text-teal" onClick={() => setPeriod('')}>
                {t('network.badge.period', { p: period })} ✕
              </button>
            )}
            {routePick && <Badge tone="amber" pulse>{t('network.badge.route', { n: routePick.rank })}</Badge>}
            {graphMode === 'cooffend' && showWeak && <Badge tone="red">{t('network.badge.weak', { n: fmtInt(weakSet.size) })}</Badge>}
            {graphMode === 'cooffend' && suggestion && <Badge tone="amber" pulse>{t('network.badge.inspecting')}</Badge>}
            {graphMode === 'cooffend' && groupPair && <Badge tone="amber">{t('network.badge.groupPair', { a: groupPair[0], b: groupPair[1] })}</Badge>}
            {graphMode === 'cooffend' && showBridges && !crossCommunityIds.size && <Badge tone="slate">{t('network.badge.noBridges')}</Badge>}
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
              <Tooltip label={showWeak ? t('network.tool.weakOnHint') : t('network.tool.weakOffHint')}>
                <button
                  type="button"
                  className={`${toolBtn} ${showWeak ? '!border-signal/60 text-signal' : ''}`}
                  onClick={toggleWeak}
                  aria-pressed={showWeak}
                >
                  {t('network.tool.weak')}
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
              <Tooltip label={t('network.tool.jsonHint')}>
                <button type="button" className={toolBtn} onClick={exportJson}>
                  {t('network.tool.json')}
                </button>
              </Tooltip>
              <Tooltip label={t('network.tool.briefHint')}>
                <button type="button" className={toolBtn} onClick={copyBrief}>
                  {t('network.tool.brief')}
                </button>
              </Tooltip>
              <Tooltip label={t('network.tool.linkHint')}>
                <button type="button" className={toolBtn} onClick={copyLink}>
                  {t('network.tool.link')}
                </button>
              </Tooltip>
            </div>
          </div>

          {ego && !view.egoMissing && (
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
              nodes={view.nodes}
              edges={view.edges}
              onPick={pickFromPanel}
              onClear={() => setCommunity('')}
              profilesByKey={profilesByKey}
              brokers={brokers}
              degrees={degrees}
            />
          )}

          <Card
            title={t('network.path.title')}
            subtitle={t(pathMode === 'strength' ? 'network.path.subtitleStrength' : 'network.path.subtitle')}
            actions={(
              <SegmentedControl
                ariaLabel={t('network.path.modeAria')}
                value={pathMode}
                onChange={setPathMode}
                options={[
                  { value: 'hops', label: t('network.path.modeHops') },
                  { value: 'strength', label: t('network.path.modeStrength') },
                ]}
              />
            )}
          >
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

          <TopConnectors nodes={view.nodes} degrees={degrees} onPick={pickFromPanel} />

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
                  <li>{t('network.legend.coreness')}</li>
                  <li>{t('network.legend.weakLink')}</li>
                  <li>{t('network.legend.predicted')}</li>
                  <li>{t('network.legend.gestures')}</li>
                </ul>
                <div className="border-t border-grid/60 pt-2.5">
                  <DegreeHistogram nodes={view.nodes} degrees={degrees} />
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
            <Card title={selected ? t(SELECT_TITLE[selected.type] || 'network.select.person') : t('network.select.none')}>
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

      {!graph.isLoading && !graph.error && view.nodes.length > 0 && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('network.analysis.title')}</h2>
            <p className="text-[11px] text-muted">{t('network.analysis.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <LinkSuggestions
              edges={view.edges}
              nodesById={nodesById}
              activeKey={suggestion ? `${suggestion.a}~~${suggestion.b}` : ''}
              onInspect={inspectSuggestion}
            />
            <BrokerBoard
              nodes={view.nodes}
              edges={view.edges}
              degrees={degrees}
              core={view.core}
              brokers={brokers}
              cutSet={cutSet}
              onPick={pickFromPanel}
            />
            <PairAnalyzer
              edges={view.edges}
              nodesById={nodesById}
              a={pathEnds.a}
              b={pathEnds.b}
              onSelectNode={pickFromPanel}
            />
            <GroupMatrix
              nodes={view.nodes}
              edges={view.edges}
              activePair={groupPair}
              onIsolate={setCommunity}
              onPickPair={pickGroupPair}
            />
          </div>
        </>
      )}

      {!graph.isLoading && !graph.error && filtered.nodes.length > 0 && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-ink">{t('network.entity.sectionTitle')}</h2>
            <p className="text-[11px] text-muted">{t('network.entity.sectionSubtitle')}</p>
          </div>

          <EvidenceLoader
            sampleSize={sampleSize}
            onSampleSize={changeSample}
            enabled={evidenceOn}
            onLoad={() => setEvidenceOn(true)}
            onClear={() => { setEvidenceOn(false); setUnitFocus(''); setPeriod(''); changeMode('cooffend'); }}
            requested={evidence.requested}
            loaded={evidence.loaded}
            failed={evidence.failed}
            isFetching={evidence.isFetching}
            progress={evidence.progress}
            totalCases={caseRank.total}
            victimCount={entityIndex.victimCount}
            locationCount={entityIndex.locationCount}
          />

          <Tabs
            ariaLabel={t('network.entity.tabsAria')}
            value={entityTab}
            onChange={setEntityTab}
            tabs={[
              { value: 'victims', label: t('network.entity.tabVictims'), badge: entityIndex.victimCount || undefined },
              { value: 'locations', label: t('network.entity.tabLocations'), badge: entityIndex.locationCount || undefined },
              { value: 'links', label: t('network.entity.tabLinks') },
            ]}
          />

          {entityTab === 'victims' && (
            entityIndex.victimCount === 0 ? (
              <Card>
                <EmptyState
                  title={t('network.entity.noSampleTitle')}
                  message={t('network.entity.noSampleMsg')}
                  action={!evidenceOn ? (
                    <button type="button" className="btn btn-primary" onClick={() => setEvidenceOn(true)} disabled={!caseRank.total}>
                      {t('network.sample.load', { n: fmtInt(Math.min(sampleSize, caseRank.total)) })}
                    </button>
                  ) : undefined}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <RepeatVictimPanel
                  index={entityIndex}
                  nodesById={allNodesById}
                  onPickPerson={pickPersonKey}
                  onPickVictim={pickVictim}
                />
                <VictimDemographicsPanel index={entityIndex} headLabel={headLabel} />
                <SuspectVictimPanel
                  index={entityIndex}
                  nodesById={allNodesById}
                  onPickPerson={pickPersonKey}
                  onPickVictim={pickVictim}
                />
                <VictimAgeProfile index={entityIndex} />
                <MultiVictimPanel index={entityIndex} nodesById={allNodesById} onPickPerson={pickPersonKey} />
              </div>
            )
          )}

          {entityTab === 'locations' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {entityIndex.locationCount === 0 ? (
                <Card className="lg:col-span-2">
                  <EmptyState
                    title={t('network.entity.noSampleTitle')}
                    message={t('network.entity.noSampleLocMsg')}
                    action={!evidenceOn ? (
                      <button type="button" className="btn btn-primary" onClick={() => setEvidenceOn(true)} disabled={!caseRank.total}>
                        {t('network.sample.load', { n: fmtInt(Math.min(sampleSize, caseRank.total)) })}
                      </button>
                    ) : undefined}
                  />
                </Card>
              ) : (
                <>
                  <RecurringLocationPanel
                    index={entityIndex}
                    activeUnit={unitFocus}
                    onPickLocation={setUnitFocus}
                    riskByUnit={riskByUnit}
                  />
                  <LocationAffiliationPanel index={entityIndex} nodesById={allNodesById} onPickPerson={pickPersonKey} />
                  <ColocationPanel
                    index={entityIndex}
                    commOf={communityOf}
                    edges={graph.data?.edges || []}
                    activeUnit={unitFocus}
                    onPickLocation={setUnitFocus}
                  />
                </>
              )}
              {selected?.type === 'node' && (
                <LocationFootprintPanel
                  personKey={String(selected.data.id)}
                  personName={selected.data.label}
                  onOpenUnit={setUnitFocus}
                />
              )}
              <CommunityDistrictPanel
                nodes={graph.data?.nodes || []}
                districtsByPerson={districtsByPerson}
                onIsolate={setCommunity}
              />
              <HotspotEntityPanel
                hotspots={hotspots.data || []}
                loading={hotspots.isLoading}
                districtNameById={districtNameById}
                index={entityIndex}
              />
            </div>
          )}

          {entityTab === 'links' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <MultiHopPanel
                edges={view.edges}
                nodesById={nodesById}
                a={pathEnds.a}
                b={pathEnds.b}
                mode={pathMode}
                activeRank={routePick?.rank || 0}
                onSelectRoute={setRoutePick}
                onSelectNode={pickPersonKey}
              />
              <TemporalPanel
                edges={filtered.edges}
                dateByCase={dateByCase}
                activePeriod={period}
                onPickPeriod={setPeriod}
              />
              <div className="lg:col-span-2">
                <PredictionLab
                  edges={view.edges}
                  nodesById={nodesById}
                  activeKey={suggestion ? `${suggestion.a}~~${suggestion.b}` : ''}
                  onInspect={inspectSuggestion}
                />
              </div>
            </div>
          )}
        </>
      )}

      {!isDesktop && (
        <Sheet
          open={!!selected}
          onClose={() => setSelected(null)}
          title={t(SELECT_TITLE[selected?.type] || 'network.select.person')}
        >
          {drawerFor(selected)}
        </Sheet>
      )}
    </div>
  );
}
