// Cytoscape canvas for the Network Explorer (theme-aware command-center styling).
// Props:
//   elements      — cytoscape element list ({data:{…}} nodes + edges); node data
//                   must carry color/size, edge data width (precomputed by caller);
//                   node data.isEgo === 1 gets the teal ego ring.
//                   Optional data.kind selects the entity shape — 'person'
//                   (default, round) · 'victim' (square) · 'location' (hexagon) —
//                   and on edges 'victimLink'/'locationLink' render as dotted /
//                   dashed ties so a projection never reads as co-accusal.
//                   node data.repeat === 1 adds the red repeat-victim ring;
//                   data.hub === 1 gives that node's label priority at every
//                   zoom (others hide below 7px rendered — see buildStyle —
//                   and a greedy declutter pass hides any label whose plate
//                   would overlap a higher-priority one; see declutterLabels).
//   layout        — 'fcose' (default) | 'concentric' | 'grid' | 'breadthfirst'
//                   (breadthfirst roots each component at its top-degree node
//                   for an org-chart style tier view)
//   selectedId    — element id to mark with the amber selection ring (nodes AND
//                   edges get a visible highlight)
//   pathIds       — element ids (nodes + edges) of the highlighted shortest path;
//                   everything else dims while a path is shown
//   highlightIds? — element ids to emphasize with a dashed amber style while
//                   everything else dims (path highlight wins when both given);
//                   node data.watch === 1 renders as a diamond (watchlist)
//   showLabels?   — default true; false hides node labels (selected/path nodes
//                   keep theirs so a tapped node is always identifiable)
//   neighborFocus?— default false; true dims everything except the selected
//                   node's closed neighborhood (ignored while a path is shown)
//   ariaLabel?    — accessible name for the graph region
//   onNodeTap?(nodeData), onEdgeTap?(edgeData), onBackgroundTap?()
//   onLayoutStop?() — fires after each layout animation settles
//   apiRef?       — ref; set to { fit(), flyTo(id), png(), zoomIn(), zoomOut() }
//                   once mounted (png() returns a data-URL on the live panel color)
//   height        — px number, default 560
// Touch: cytoscape's native pinch-zoom/pan stays enabled — the container gets
// touch-action:none so mobile browsers don't hijack the gesture for scrolling.
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useT } from '../../lib/i18n.jsx';

cytoscape.use(fcose);

// Per-theme canvas palette. Constants (mirroring index.css tokens) rather than
// live getComputedStyle reads: this effect fires before ThemeProvider's own
// effect swaps the html class, so a computed-style read here would see the
// OUTGOING theme's values. PNG export still reads --t-panel live (user-initiated,
// so the class is long settled by then).
const THEME_TOKENS = {
  dark: {
    label: '#8A94A8', ink: '#E6EAF2', nodeBorder: '#0B1220', edge: '#2A3A5C',
    amber: '#F5A623', teal: '#2DD4BF', signal: '#E5484D', panel: '#111A2C',
  },
  light: {
    label: '#5C6B84', ink: '#131B2E', nodeBorder: '#F3F5FA', edge: '#A9B7CF',
    amber: '#A16207', teal: '#0F766E', signal: '#B42318', panel: '#FFFFFF',
  },
};

// `tk` = the theme token bag above — not the i18n translator, which this file
// only uses inside the component for the accessible graph label.
function buildStyle(tk, showLabels) {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        'font-size': 9,
        // A label is drawn only when it renders at 7px or more. At overview zoom
        // on a few hundred people that hides every name except the hubs below,
        // which is what stops the names being painted over each other; zooming
        // in reveals them, and the layout has reserved room for them by then.
        'min-zoomed-font-size': 7,
        color: tk.label,
        'text-opacity': showLabels ? 1 : 0,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-max-width': 90,
        'text-wrap': 'ellipsis',
        'text-background-color': tk.panel,
        'text-background-opacity': 0.7,
        'text-background-padding': 1,
        'text-background-shape': 'roundrectangle',
        'border-width': 1.5,
        'border-color': tk.nodeBorder,
        'overlay-color': tk.amber,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'haystack',
        'haystack-radius': 0.2,
        width: 'data(width)',
        'line-color': tk.edge,
        opacity: 0.75,
      },
    },
    // Entity class is carried by shape so the three node types stay separable
    // in greyscale, in print, and for colour-vision-deficient viewers: persons
    // stay round, victims are squares, recurring locations are hexagons.
    { selector: 'node[kind = "victim"]', style: { shape: 'round-rectangle' } },
    { selector: 'node[kind = "location"]', style: { shape: 'hexagon', 'font-size': 10 } },
    // A victim recorded on more than one sampled FIR gets the alert ring.
    { selector: 'node[repeat = 1]', style: { 'border-width': 2.5, 'border-color': tk.signal } },
    // Bipartite/affiliation links read as thin dotted ties, never as co-accusal.
    { selector: 'edge[kind = "victimLink"]', style: { 'curve-style': 'bezier', 'line-style': 'dotted', 'line-color': tk.teal, opacity: 0.55 } },
    { selector: 'edge[kind = "locationLink"]', style: { 'curve-style': 'bezier', 'line-style': 'dashed', 'line-color': tk.amber, opacity: 0.45 } },
    // Watchlisted people render as diamonds (shape survives all ring states).
    { selector: 'node[watch = 1]', style: { shape: 'diamond' } },
    // Top connectors (data.hub, set by the caller) keep a readable name at any
    // zoom so the overview stays navigable while everyone else waits for a
    // zoom-in. Drawn above their neighbours so the plate is never clipped.
    {
      selector: 'node[hub = 1]',
      style: { 'min-zoomed-font-size': 0, 'font-size': 10, 'font-weight': 600, color: tk.ink, 'z-index': 5 },
    },
    // Hidden by the declutter pass because its plate would overlap a higher-
    // priority label at the current zoom. Never applied to emphasised nodes.
    // Opacity-only by design: declutterLabels measures label boxes inside a
    // batch right after toggling this class, so it must not change geometry.
    { selector: 'node.labelclash', style: { 'text-opacity': 0 } },
    // Ego focus ring (teal) — under the amber selected/path rings in priority.
    {
      selector: 'node[isEgo = 1]',
      style: { 'border-width': 3, 'border-color': tk.teal, color: tk.ink, 'text-opacity': 1, 'min-zoomed-font-size': 0, 'z-index': 6 },
    },
    { selector: '.dimmed', style: { opacity: 0.12, 'text-opacity': 0.1 } },
    // Bridge/broker highlight — dashed amber, defined after .dimmed so it wins.
    {
      selector: 'node.hl',
      style: { 'border-width': 3, 'border-color': tk.amber, 'border-style': 'dashed', color: tk.ink, opacity: 1, 'text-opacity': 1, 'min-zoomed-font-size': 0, 'z-index': 7 },
    },
    { selector: 'edge.hl', style: { 'line-color': tk.amber, 'line-style': 'dashed', opacity: 0.9 } },
    {
      selector: 'node.selected',
      style: { 'border-width': 3, 'border-color': tk.amber, color: tk.ink, 'font-size': 10, opacity: 1, 'text-opacity': 1, 'min-zoomed-font-size': 0, 'z-index': 9 },
    },
    { selector: 'edge.selected', style: { 'line-color': tk.amber, opacity: 1, width: 4 } },
    {
      selector: 'node.onpath',
      style: { 'border-width': 3, 'border-color': tk.amber, color: tk.ink, opacity: 1, 'text-opacity': 1, 'min-zoomed-font-size': 0, 'z-index': 8 },
    },
    { selector: 'edge.onpath', style: { 'line-color': tk.amber, opacity: 1, width: 3.5 } },
  ];
}

// fcose's defaults (ideal edge 50, repulsion 4500) are tuned for a few dozen
// nodes. A few hundred people with ~10 links each pull together faster than
// they push apart and the result is one ball of overlapping discs. Both forces
// scale with size and density here, edges go slacker and gravity weaker, and
// node dimensions include the label box so the positions the layout settles on
// still leave room for every name once the viewer zooms in far enough to read
// them. `spread` is 1 for a small sparse graph and capped at 3 for the largest
// dense one; the visible result is a wider, flatter cloud that fit() then
// scales to the canvas without discs overlapping.
function fcoseOptions(cy) {
  const n = cy.nodes().length;
  const avgDegree = n ? (2 * cy.edges().length) / n : 0;
  const spread = Math.min(3, Math.max(1, Math.sqrt(n / 100) * Math.sqrt(Math.max(2, avgDegree) / 4)));
  return {
    name: 'fcose',
    // Always 'default': 'draft' runs the spectral stage alone and would drop
    // every force option below, so the 800-person cap gets the same treatment.
    quality: 'default',
    animate: true,
    animationDuration: 450,
    randomize: true,
    padding: 24,
    nodeDimensionsIncludeLabels: true,
    nodeSeparation: 75,
    nodeRepulsion: () => Math.round(4500 * spread * spread),
    idealEdgeLength: () => Math.round(70 * spread),
    edgeElasticity: () => 0.45 / spread,
    gravity: 0.25 / spread,
    gravityRange: 3.8,
    // fcose runs max(5·n, numIter) iterations. Measured on 400 people / 1,900
    // links: 2,500 ≈ 10 s, 1,000 ≈ 4.3 s, identical overlap counts.
    numIter: 1000,
  };
}

const LAYOUTS = {
  concentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 450,
    padding: 24,
    // Label boxes stay OUT of the ring geometry: a 400-person ring sized for
    // 90px label slots would not fit the canvas even at minimum zoom.
    minNodeSpacing: 16,
    startAngle: (3 / 2) * Math.PI,
    concentric: (node) => node.degree(),
    levelWidth: (nodes) => Math.max(1, nodes.maxDegree() / 4),
  },
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 450,
    padding: 24,
    nodeDimensionsIncludeLabels: true,
    avoidOverlap: true,
    avoidOverlapPadding: 6,
    condense: true,
  },
  breadthfirst: {
    name: 'breadthfirst',
    animate: true,
    animationDuration: 450,
    padding: 24,
    // No label boxes in the tier geometry either: a 400-person tree already
    // spans ~15k px on its widest tier; label slots doubled that.
    directed: false,
    spacingFactor: 1.15,
    avoidOverlap: true,
    grid: false,
  },
};

// Greedy label declutter. Labels are granted in priority order — emphasised
// nodes (selected / path / bridge / ego) first, then hubs, then by degree —
// and a label whose plate would overlap one already granted is hidden through
// the .labelclash class. Runs after every layout and, debounced, after every
// zoom/pan, so the overview shows the hubs that fit and zooming in reveals the
// rest as space frees up — the way a map labels its towns. Labels already
// hidden by the legibility floor (min-zoomed-font-size), dimmed, or off-screen
// are skipped, which keeps the pass to a few milliseconds on 400 nodes.
const CLASH = 'labelclash';
const LABEL_BOX = { includeNodes: false, includeEdges: false, includeLabels: true, includeOverlays: false, includeUnderlays: false };

function isPinned(node) {
  return node.hasClass('selected') || node.hasClass('onpath') || node.hasClass('hl') || node.data('isEgo') === 1;
}

function labelPriority(node) {
  return (isPinned(node) ? 1e9 : 0) + (node.data('hub') === 1 ? 1e6 : 0)
    + (Number(node.data('links')) || Number(node.data('size')) || 0);
}

function declutterLabels(cy, { full = false } = {}) {
  if (!cy || cy.destroyed()) return;
  const zoom = cy.zoom();
  const W = cy.width();
  const H = cy.height();
  // Mirror the renderer's legibility test exactly (eleTextBiggerThanMin): the
  // label is drawn at a power-of-two texture level derived from zoom x device
  // pixel ratio, rounded UP — on a 1.25x screen a 9px label survives down to
  // zoom 0.4. Using plain zoom here left labels the renderer was painting out
  // of the pass, and they overlapped in the dense core.
  let pxRatio = 1;
  try { pxRatio = cy.renderer().getPixelRatio() || 1; } catch { pxRatio = window.devicePixelRatio || 1; }
  const textScale = Math.pow(2, Math.ceil(Math.log2(Math.max(1e-6, zoom * pxRatio))));
  const kept = [];
  const ranked = cy.nodes().sort((a, b) => labelPriority(b) - labelPriority(a));
  // Class writes only where the state changes: toggling a class a node does
  // not have still marks it style-dirty in cytoscape, so an unconditional
  // remove/add would restyle and redraw every node on every pass.
  const setClash = (node, on) => { if (node.hasClass(CLASH) !== on) node.toggleClass(CLASH, on); };
  cy.batch(() => {
    ranked.forEach((node) => {
      if (node.hasClass('dimmed')) { setClash(node, false); return; }
      const fontSize = parseFloat(node.style('font-size')) || 9;
      const floor = parseFloat(node.style('min-zoomed-font-size')) || 0;
      // `full` (PNG export) draws every label regardless of zoom or viewport:
      // nothing is skipped and boxes are compared in model space.
      if (!full && fontSize * textScale < floor) { setClash(node, false); return; } // the renderer hides it anyway
      const bb = full ? node.boundingBox(LABEL_BOX) : node.renderedBoundingBox(LABEL_BOX);
      if (!(bb.w > 0) || (!full && (bb.x2 < 0 || bb.y2 < 0 || bb.x1 > W || bb.y1 > H))) { setClash(node, false); return; }
      const clash = kept.some((k) => bb.x1 < k.x2 && k.x1 < bb.x2 && bb.y1 < k.y2 && k.y1 < bb.y2);
      const hide = clash && !isPinned(node);
      setClash(node, hide);
      if (!hide) kept.push(bb);
    });
  });
}

/** Panel background for PNG export — resolved from the live theme tokens. */
function panelBg() {
  try {
    const t = getComputedStyle(document.documentElement).getPropertyValue('--t-panel').trim();
    if (t) return `rgb(${t.split(/\s+/).join(',')})`;
  } catch { /* SSR / very old browser */ }
  return '#111A2C';
}

export default function CytoGraph({
  elements = [], layout = 'fcose', selectedId = '', pathIds = [], highlightIds = [],
  showLabels = true, neighborFocus = false, ariaLabel,
  onNodeTap, onEdgeTap, onBackgroundTap, onLayoutStop, apiRef,
  height = 560, className = '',
}) {
  const { theme } = useTheme();
  const t = useT();
  const elRef = useRef(null);
  const cyRef = useRef(null);
  const handlersRef = useRef({});
  handlersRef.current = { onNodeTap, onEdgeTap, onBackgroundTap, onLayoutStop };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const lastLayoutRun = useRef(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const labelsRef = useRef(showLabels);
  labelsRef.current = showLabels;

  const runLayout = () => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    // The height prop can change in the same commit as the elements; cytoscape
    // caches the container size until resize(), and the layout's fit reads it.
    cy.resize();
    const opts = LAYOUTS[layoutRef.current] ? { ...LAYOUTS[layoutRef.current] } : fcoseOptions(cy);
    if (opts.name === 'breadthfirst') {
      // Root each component at its highest-degree node → org-chart tiers with
      // the key connector on top, instead of cytoscape's arbitrary default.
      const roots = [];
      for (const comp of cy.elements().components()) {
        let best = null;
        comp.nodes().forEach((n) => { if (!best || n.degree(false) > best.degree(false)) best = n; });
        if (best) roots.push(best.id());
      }
      if (roots.length) opts.roots = roots;
    }
    const l = cy.layout(opts);
    lastLayoutRun.current = layoutRef.current;
    l.one('layoutstop', () => {
      // Explicit fit: the animated layouts leave the viewport where it was
      // (measured: zoom stayed at 1.0 with the cloud overflowing the canvas),
      // and the old compact ball only ever fit by coincidence.
      cy.fit(undefined, 24);
      handlersRef.current.onLayoutStop?.();
    });
    l.run();
  };

  useEffect(() => {
    if (!elRef.current || cyRef.current) return undefined;
    const cy = cytoscape({
      container: elRef.current,
      style: buildStyle(THEME_TOKENS[themeRef.current] || THEME_TOKENS.dark, labelsRef.current),
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 4,
    });
    cy.on('tap', 'node', (evt) => handlersRef.current.onNodeTap?.(evt.target.data()));
    cy.on('tap', 'edge', (evt) => handlersRef.current.onEdgeTap?.(evt.target.data()));
    cy.on('tap', (evt) => { if (evt.target === cy) handlersRef.current.onBackgroundTap?.(); });
    cy.on('layoutstop', () => declutterLabels(cy));
    let viewportTimer = null;
    // cy.resize() (container size change) emits 'resize', never 'viewport',
    // yet it changes the on-screen window the pass arbitrates.
    cy.on('viewport resize', () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => declutterLabels(cy), 120);
    });
    cyRef.current = cy;

    if (apiRef) {
      const zoomBy = (factor) => {
        const level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
        cy.animate(
          { zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } },
          { duration: 180, easing: 'ease-out' },
        );
      };
      apiRef.current = {
        fit: () => cy.fit(undefined, 30),
        flyTo: (id) => {
          const el = cy.getElementById(String(id));
          if (el && el.length) {
            cy.animate({ center: { eles: el }, zoom: Math.max(cy.zoom(), 1.4) }, { duration: 450, easing: 'ease-in-out' });
          }
        },
        png: () => {
          // The export draws every label regardless of zoom or viewport, so
          // arbitrate the whole graph in model space first, then restore the
          // on-screen arbitration.
          declutterLabels(cy, { full: true });
          try { return cy.png({ full: true, scale: 2, bg: panelBg() }); } finally { declutterLabels(cy); }
        },
        zoomIn: () => zoomBy(1.35),
        zoomOut: () => zoomBy(1 / 1.35),
      };
    }

    // Drawer open/close and sidebar collapse change the container width —
    // keep the canvas in sync so the graph never renders clipped.
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(viewportTimer);
      cy.destroy();
      cyRef.current = null;
      if (apiRef) apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live restyle on theme switch / label toggle (classes on elements survive).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(buildStyle(THEME_TOKENS[theme] || THEME_TOKENS.dark, showLabels)).update();
    declutterLabels(cy);
  }, [theme, showLabels]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      if (elements.length) cy.add(elements);
    });
    if (elements.length) runLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Layout switcher — re-run only when the layout differs from the one last
  // run (the elements effect runs the initial one). Tracking the name rather
  // than "is this the first pass" survives StrictMode's dev-only effect
  // replay, which would otherwise queue a second multi-second layout.
  useEffect(() => {
    if (lastLayoutRun.current === layout) return;
    runLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const pathKey = pathIds.join('|');
  const hlKey = highlightIds.join('|');
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('selected onpath dimmed hl');
      if (pathIds.length) {
        cy.elements().addClass('dimmed');
        for (const id of pathIds) {
          const el = cy.getElementById(String(id));
          if (el && el.length) el.removeClass('dimmed').addClass('onpath');
        }
      } else if (highlightIds.length) {
        // Bridge/broker emphasis — dashed amber over a dimmed graph.
        cy.elements().addClass('dimmed');
        for (const id of highlightIds) {
          const el = cy.getElementById(String(id));
          if (el && el.length) el.removeClass('dimmed').addClass('hl');
        }
      }
      if (selectedId) {
        const el = cy.getElementById(String(selectedId));
        if (el && el.length) {
          // Neighbor-focus: dim everything except the selection's closed
          // neighborhood (path/bridge highlights win when active).
          if (neighborFocus && !pathIds.length && !highlightIds.length) {
            cy.elements().addClass('dimmed');
            if (el.isNode()) el.closedNeighborhood().removeClass('dimmed');
            else el.union(el.connectedNodes()).removeClass('dimmed');
          }
          el.removeClass('dimmed').addClass('selected');
        }
      }
    });
    // Emphasis changed → the pinned set changed → re-grant label space.
    declutterLabels(cy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedId, pathKey, hlKey, neighborFocus]);

  return (
    <div
      ref={elRef}
      role="img"
      aria-label={ariaLabel || t('network.graph.ariaDefault')}
      className={`w-full rounded-lg ${className}`}
      style={{ height, touchAction: 'none' }}
    />
  );
}
