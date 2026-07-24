// Cytoscape canvas for the Network Explorer (dark command-center styling).
// Props:
//   elements    — cytoscape element list ({data:{…}} nodes + edges); node data
//                 must carry color/size, edge data width (precomputed by caller);
//                 node data.isEgo === 1 gets the teal ego ring
//   layout      — 'fcose' (default) | 'concentric' | 'grid'
//   selectedId  — element id to mark with the amber selection ring
//   pathIds     — element ids (nodes + edges) of the highlighted shortest path;
//                 everything else dims while a path is shown
//   onNodeTap?(nodeData), onEdgeTap?(edgeData), onBackgroundTap?()
//   onLayoutStop?() — fires after each layout animation settles
//   apiRef?     — ref; set to { fit(), flyTo(id), png() } once mounted
//                 (png() returns a data-URL on the current theme's panel color)
//   height      — px number, default 560
// Touch: cytoscape's native pinch-zoom/pan stays enabled — the container gets
// touch-action:none so mobile browsers don't hijack the gesture for scrolling.
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';

cytoscape.use(fcose);

const STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      width: 'data(size)',
      height: 'data(size)',
      label: 'data(label)',
      'font-size': 9,
      color: '#8A94A8',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-max-width': 90,
      'text-wrap': 'ellipsis',
      'border-width': 1.5,
      'border-color': '#0B1220',
      'overlay-color': '#F5A623',
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'haystack',
      'haystack-radius': 0.2,
      width: 'data(width)',
      'line-color': '#2A3A5C',
      opacity: 0.75,
    },
  },
  // Ego focus ring (teal) — under the amber selected/path rings in priority.
  {
    selector: 'node[isEgo = 1]',
    style: { 'border-width': 3, 'border-color': '#2DD4BF', color: '#E6EAF2' },
  },
  { selector: '.dimmed', style: { opacity: 0.12, 'text-opacity': 0.1 } },
  {
    selector: 'node.selected',
    style: { 'border-width': 3, 'border-color': '#F5A623', color: '#E6EAF2', 'font-size': 10 },
  },
  {
    selector: 'node.onpath',
    style: { 'border-width': 3, 'border-color': '#F5A623', color: '#E6EAF2', opacity: 1, 'text-opacity': 1 },
  },
  { selector: 'edge.onpath', style: { 'line-color': '#F5A623', opacity: 1, width: 3.5 } },
];

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
  elements = [], layout = 'fcose', selectedId = '', pathIds = [],
  onNodeTap, onEdgeTap, onBackgroundTap, onLayoutStop, apiRef,
  height = 560, className = '',
}) {
  const elRef = useRef(null);
  const cyRef = useRef(null);
  const handlersRef = useRef({});
  handlersRef.current = { onNodeTap, onEdgeTap, onBackgroundTap, onLayoutStop };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const runLayout = () => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    const l = cy.layout(LAYOUTS[layoutRef.current] || LAYOUTS.fcose);
    l.one('layoutstop', () => handlersRef.current.onLayoutStop?.());
    l.run();
  };

  useEffect(() => {
    if (!elRef.current || cyRef.current) return undefined;
    const cy = cytoscape({
      container: elRef.current,
      style: STYLE,
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 4,
    });
    cy.on('tap', 'node', (evt) => handlersRef.current.onNodeTap?.(evt.target.data()));
    cy.on('tap', 'edge', (evt) => handlersRef.current.onEdgeTap?.(evt.target.data()));
    cy.on('tap', (evt) => { if (evt.target === cy) handlersRef.current.onBackgroundTap?.(); });
    cyRef.current = cy;

    if (apiRef) {
      apiRef.current = {
        fit: () => cy.fit(undefined, 30),
        flyTo: (id) => {
          const el = cy.getElementById(String(id));
          if (el && el.length) {
            cy.animate({ center: { eles: el }, zoom: Math.max(cy.zoom(), 1.4) }, { duration: 450, easing: 'ease-in-out' });
          }
        },
        png: () => cy.png({ full: true, scale: 2, bg: panelBg() }),
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
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('selected onpath dimmed');
      if (pathIds.length) {
        cy.elements().addClass('dimmed');
        for (const id of pathIds) {
          const el = cy.getElementById(String(id));
          if (el && el.length) el.removeClass('dimmed').addClass('onpath');
        }
      }
      if (selectedId) {
        const el = cy.getElementById(String(selectedId));
        if (el && el.length) el.removeClass('dimmed').addClass('selected');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedId, pathKey]);

  return <div ref={elRef} className={`w-full rounded-lg ${className}`} style={{ height, touchAction: 'none' }} />;
}
