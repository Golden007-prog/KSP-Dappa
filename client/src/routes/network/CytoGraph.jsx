// Cytoscape canvas for the Network Explorer (theme-aware command-center styling).
// Props:
//   elements      — cytoscape element list ({data:{…}} nodes + edges); node data
//                   must carry color/size, edge data width (precomputed by caller);
//                   node data.isEgo === 1 gets the teal ego ring.
//                   Optional data.kind selects the entity shape — 'person'
//                   (default, round) · 'victim' (square) · 'location' (hexagon) —
//                   and on edges 'victimLink'/'locationLink' render as dotted /
//                   dashed ties so a projection never reads as co-accusal.
//                   node data.repeat === 1 adds the red repeat-victim ring.
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
    amber: '#F5A623', teal: '#2DD4BF', signal: '#E5484D',
  },
  light: {
    label: '#5C6B84', ink: '#131B2E', nodeBorder: '#F3F5FA', edge: '#A9B7CF',
    amber: '#A16207', teal: '#0F766E', signal: '#B42318',
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
        color: tk.label,
        'text-opacity': showLabels ? 1 : 0,
        'text-valign': 'bottom',
        'text-margin-y': 4,
        'text-max-width': 90,
        'text-wrap': 'ellipsis',
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
    // Ego focus ring (teal) — under the amber selected/path rings in priority.
    {
      selector: 'node[isEgo = 1]',
      style: { 'border-width': 3, 'border-color': tk.teal, color: tk.ink, 'text-opacity': 1 },
    },
    { selector: '.dimmed', style: { opacity: 0.12, 'text-opacity': 0.1 } },
    // Bridge/broker highlight — dashed amber, defined after .dimmed so it wins.
    {
      selector: 'node.hl',
      style: { 'border-width': 3, 'border-color': tk.amber, 'border-style': 'dashed', color: tk.ink, opacity: 1, 'text-opacity': 1 },
    },
    { selector: 'edge.hl', style: { 'line-color': tk.amber, 'line-style': 'dashed', opacity: 0.9 } },
    {
      selector: 'node.selected',
      style: { 'border-width': 3, 'border-color': tk.amber, color: tk.ink, 'font-size': 10, opacity: 1, 'text-opacity': 1 },
    },
    { selector: 'edge.selected', style: { 'line-color': tk.amber, opacity: 1, width: 4 } },
    {
      selector: 'node.onpath',
      style: { 'border-width': 3, 'border-color': tk.amber, color: tk.ink, opacity: 1, 'text-opacity': 1 },
    },
    { selector: 'edge.onpath', style: { 'line-color': tk.amber, opacity: 1, width: 3.5 } },
  ];
}

const LAYOUTS = {
  fcose: {
    name: 'fcose',
    quality: 'default',
    animate: true,
    animationDuration: 450,
    randomize: true,
    padding: 24,
    idealEdgeLength: 70,
    nodeSeparation: 60,
  },
  concentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 450,
    padding: 24,
    minNodeSpacing: 14,
    startAngle: (3 / 2) * Math.PI,
    concentric: (node) => node.degree(),
    levelWidth: (nodes) => Math.max(1, nodes.maxDegree() / 4),
  },
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 450,
    padding: 24,
    avoidOverlap: true,
    condense: true,
  },
  breadthfirst: {
    name: 'breadthfirst',
    animate: true,
    animationDuration: 450,
    padding: 24,
    directed: false,
    spacingFactor: 1.15,
    avoidOverlap: true,
    grid: false,
  },
};

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
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const labelsRef = useRef(showLabels);
  labelsRef.current = showLabels;

  const runLayout = () => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    const opts = { ...(LAYOUTS[layoutRef.current] || LAYOUTS.fcose) };
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
    l.one('layoutstop', () => handlersRef.current.onLayoutStop?.());
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
        png: () => cy.png({ full: true, scale: 2, bg: panelBg() }),
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

  // Layout switcher — re-run on change only (initial run happens with elements).
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return; }
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
