// Cytoscape canvas for the Network Explorer (dark command-center styling).
// Props:
//   elements    — cytoscape element list ({data:{…}} nodes + edges); node data
//                 must carry color/size, edge data width (precomputed by caller)
//   selectedId  — element id to mark with the amber selection ring
//   pathIds     — element ids (nodes + edges) of the highlighted shortest path;
//                 everything else dims while a path is shown
//   onNodeTap?(nodeData), onEdgeTap?(edgeData), onBackgroundTap?()
//   height      — px number, default 560
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

const LAYOUT = {
  name: 'fcose',
  quality: 'default',
  animate: true,
  animationDuration: 450,
  randomize: true,
  padding: 24,
  idealEdgeLength: 70,
  nodeSeparation: 60,
};

export default function CytoGraph({
  elements = [], selectedId = '', pathIds = [],
  onNodeTap, onEdgeTap, onBackgroundTap,
  height = 560, className = '',
}) {
  const elRef = useRef(null);
  const cyRef = useRef(null);
  const handlersRef = useRef({});
  handlersRef.current = { onNodeTap, onEdgeTap, onBackgroundTap };

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

    // Drawer open/close and sidebar collapse change the container width —
    // keep the canvas in sync so the graph never renders clipped.
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      if (elements.length) cy.add(elements);
    });
    if (elements.length) cy.layout(LAYOUT).run();
  }, [elements]);

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

  return <div ref={elRef} className={`w-full rounded-lg ${className}`} style={{ height }} />;
}
