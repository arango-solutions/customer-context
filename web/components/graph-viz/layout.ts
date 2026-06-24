// web/components/graph-viz/layout.ts
//
// PURE, deterministic d3-force layout pass over an engine-neutral VizGraph.
//
// Replaces the former dagre LR pass (Phase 11 D3 pivot). d3-force gives the
// organic "drift and settle" look; this module runs the simulation to completion
// SYNCHRONOUSLY and returns final {x,y} for each node. GraphViz.tsx uses this for
// the initial frame (so SSR / unit tests have real geometry) and, when motion is
// allowed, re-runs an animated simulation on top for the settle effect.
//
// Determinism: d3-force seeds initial node positions with a deterministic
// phyllotaxis spiral and uses NO RNG, so identical input → identical output. We
// also pin the iteration count instead of relying on alpha decay wall-clock.
//
// Pure: no React, no DOM. Safe to call in a unit test or on the server.

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';

import type { VizGraph, VizNode, VizEdge } from './buildGraph';

export interface PositionedNode extends VizNode {
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: VizEdge[];
  width: number;
  height: number;
}

// Simulation node/link datums (d3 mutates x/y/vx/vy onto these).
type SimNode = SimulationNodeDatum & VizNode;
type SimLink = SimulationLinkDatum<SimNode> & { kind: VizEdge['kind'] };

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 560;
const TICKS = 300; // enough for the layout to settle deterministically

/**
 * Run a d3-force simulation to completion and return positioned nodes.
 *
 * @param g    - engine-neutral graph from buildGraph()
 * @param opts - canvas sizing (width/height the force center targets)
 */
export function layout(
  g: VizGraph,
  opts: { width?: number; height?: number } = {},
): LayoutResult {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;

  if (g.nodes.length === 0) {
    return { nodes: [], edges: g.edges, width, height };
  }

  // Clone into mutable sim datums (never mutate the caller's nodes).
  const simNodes: SimNode[] = g.nodes.map((n) => ({ ...n }));
  const simLinks: SimLink[] = g.edges.map((e) => ({
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));

  const sim = forceSimulation<SimNode>(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(96)
        .strength(0.8),
    )
    .force('charge', forceManyBody<SimNode>().strength(-280))
    .force('center', forceCenter(width / 2, height / 2))
    // Gentle pull toward center keeps the two clusters compact (not flung apart).
    .force('x', forceX<SimNode>(width / 2).strength(0.08))
    .force('y', forceY<SimNode>(height / 2).strength(0.08))
    .force('collide', forceCollide<SimNode>(44))
    .stop();

  // Run synchronously to a settled state (deterministic — no RNG, no wall clock).
  sim.tick(TICKS);

  const nodes: PositionedNode[] = simNodes.map((n) => ({
    id: n.id,
    type: n.type,
    graph: n.graph,
    collection: n.collection,
    label: n.label,
    x: n.x ?? width / 2,
    y: n.y ?? height / 2,
  }));

  return { nodes, edges: g.edges, width, height };
}
