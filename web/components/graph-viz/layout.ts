// web/components/graph-viz/layout.ts
//
// PURE dagre LR layout pass over a {nodes, edges} graph.
//
// Source pattern: reactflow.dev/examples/layout/dagre (RESEARCH Pattern 3).
//
// Design:
//  - Pure function: no I/O, no React, no React Flow hooks. Type-only imports from
//    @xyflow/react (Node/Edge types tree-shake to zero at runtime).
//  - Deterministic: dagre's layout algorithm is deterministic for the same input
//    shape (no randomness), so `position` values are stable across calls — correct
//    for D-07 (render once from the terminal grounded envelope).
//  - Returns a new nodes array with computed position.{x,y}; edges are returned
//    unchanged (dagre only positions nodes, not edge paths).
//  - The executor MAY post-process node x by graph origin (structured→left band,
//    unstructured→right band) if cluster separation is muddy — at executor discretion,
//    must stay deterministic. For now, dagre LR provides sufficient cluster separation.
//
// Import guard: MUST NOT contain 'use client', useReactFlow, <ReactFlow>.

import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';

/** Default node dimensions for dagre layout sizing. */
const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

/**
 * Run a dagre LR layout pass over the input graph and return a new nodes array
 * with computed `position.{x,y}`. Edges are returned unchanged.
 *
 * @param g   - The graph to lay out: { nodes, edges }
 * @param dir - Rank direction: 'LR' (left-to-right, default) or 'TB' (top-to-bottom)
 */
export function layout(
  g: { nodes: Node[]; edges: Edge[] },
  dir: 'LR' | 'TB' = 'LR',
): { nodes: Node[]; edges: Edge[] } {
  if (g.nodes.length === 0) {
    return { nodes: [], edges: g.edges };
  }

  const dg = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dg.setGraph({ rankdir: dir, nodesep: 40, ranksep: 90 });

  g.nodes.forEach((n) => {
    dg.setNode(n.id, {
      width: (n as Node & { width?: number }).width ?? NODE_WIDTH,
      height: (n as Node & { height?: number }).height ?? NODE_HEIGHT,
    });
  });

  g.edges.forEach((e) => {
    dg.setEdge(e.source as string, e.target as string);
  });

  dagre.layout(dg);

  const nodes = g.nodes.map((n) => {
    const nodeWithDims = n as Node & { width?: number; height?: number };
    const { x, y } = dg.node(n.id);
    const width = nodeWithDims.width ?? NODE_WIDTH;
    const height = nodeWithDims.height ?? NODE_HEIGHT;
    return {
      ...n,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
      // sourcePosition/targetPosition for React Flow handles (consumed by Plan 02).
      // String literals match the Position enum values ('left'|'right'|'top'|'bottom')
      // without requiring a runtime import from @xyflow/react (type-only module discipline).
      sourcePosition: (dir === 'LR' ? 'right' : 'bottom') as 'right' | 'bottom',
      targetPosition: (dir === 'LR' ? 'left' : 'top') as 'left' | 'top',
    } as Node;
  });

  return { nodes, edges: g.edges };
}
