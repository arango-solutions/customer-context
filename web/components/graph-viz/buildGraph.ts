// web/components/graph-viz/buildGraph.ts
//
// PURE, React-free transform: retrievalPath[] → React Flow {nodes, edges}.
//
// This is THE load-bearing file for VIZ-02 (SC-1/SC-2/D-04).
//
// Design principles (mirrors agent/src/retrievalPath.ts discipline):
//  - Pure function: no I/O, no React, no React Flow hooks. Only TYPE imports
//    from @xyflow/react (they tree-shake to zero at runtime).
//  - edgeKey is mirrored VERBATIM from agent/src/retrievalPath.ts line 21-22 so
//    the React Flow edge id inherits the merge-time dedup guarantee (Pitfall 2).
//  - STROKE_BY_KIND (Pattern 2 from 11-RESEARCH.md): traversed→solid (no dasharray),
//    structural→dashed '6 4', hybrid→dotted '1 5'. stroke style carries the
//    honesty signal; color stays neutral (--muted-foreground).
//  - D-02: a synthetic 'question/current' anchor node is emitted whenever any
//    hybrid edge is present (representing where retrieval started).
//  - Node origin ('structured'|'unstructured') flows through node.data.graph so
//    RecordNode (Plan 02) reads --graph-structured/--graph-unstructured CSS tokens.
//    buildGraph emits NO hardcoded hex.
//
// Import guard: this file MUST NOT contain 'use client', useReactFlow,
// <ReactFlow>, or any React hook. Verified by acceptance criteria grep.

import type { Node, Edge } from '@xyflow/react';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';

// ── Type derivation (schema-derived — never duplicate envelope.ts) ──────────
//
// RetrievalPathEdge is NOT re-exported from the customer360-agent barrel (index.ts
// re-exports RetrievalPathFragment but not RetrievalPathEdge). Derive the element
// type from the fragment's edges array so this file stays contract-bound without
// touching envelope.ts.
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;
type RetrievalPathEdgeT = RetrievalPathFragmentT['edges'][number];
type EdgeKind = RetrievalPathEdgeT['kind'];

// ── edgeKey — MIRRORED VERBATIM from agent/src/retrievalPath.ts line 21-22 ──
//
// If _id is non-null (traversed + deterministic-synthetic edges), the _id is the
// natural key. If null (fallback synthetic edges), fall back to the composite
// kind::_from::_to::label. This is the exact same logic the merge-time dedup in
// retrievalPath.ts uses, so the viz inherits collision-free ids by construction.
const edgeKey = (e: RetrievalPathEdgeT): string =>
  e._id ?? `${e.kind}::${e._from}::${e._to}::${e.label}`;

// ── Stroke style shape ────────────────────────────────────────────────────────
// Inline type — avoids importing React just for CSSProperties.
type StrokeStyle = {
  strokeDasharray?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square' | 'inherit';
  stroke?: string;
};

// ── STROKE_BY_KIND — Pattern 2 from 11-RESEARCH.md ───────────────────────────
//
// Maps edge.kind to CSS stroke style properties.
// HONESTY INVARIANT: only 'traversed' is solid (no strokeDasharray).
// structural → dashed '6 4'; hybrid → dotted '1 5'.
// Color stays neutral (--muted-foreground) — stroke STYLE carries the meaning,
// not color (colorblind-safe per UI-SPEC).
const STROKE_BY_KIND: Record<EdgeKind, StrokeStyle> = {
  traversed: { strokeDasharray: undefined, strokeWidth: 2 },
  structural: { strokeDasharray: '6 4', strokeWidth: 2 },
  hybrid: { strokeDasharray: '1 5', strokeWidth: 2, strokeLinecap: 'round' },
};

// ── QUESTION_NODE_ID — synthetic anchor for hybrid retrieval (D-02) ──────────
const QUESTION_NODE_ID = 'question/current';

// ── Node type discriminators (consumed by Plan 02 nodeTypes) ─────────────────
type NodeType = 'record' | 'question';

// ── buildGraph ────────────────────────────────────────────────────────────────
//
// Transform: retrievalPath[] → { nodes: Node[], edges: Edge[] }
//
// Steps:
//  1. Flatten all edges from all fragments; dedup by edgeKey.
//  2. Map each edge to a React Flow Edge with:
//     - id = edgeKey (collision-free by construction)
//     - style = neutral stroke + STROKE_BY_KIND[kind]
//     - type = 'kind' (so Plan 02's edgeTypes: { kind: KindEdge } resolves)
//     - data = { kind, label, collection } for KindEdge renderer
//  3. Collect every unique _from/_to endpoint as a node.
//  4. If any hybrid edge is present, emit the question/current anchor node.
//  5. Assign each node a graph origin from the fragment that contributed it;
//     fall back to 'unstructured' for endpoints whose collection origin is unknown.
//
// Pure function: always returns a new object; never mutates input.
export function buildGraph(retrievalPath: RetrievalPathFragmentT[]): {
  nodes: Node[];
  edges: Edge[];
} {
  if (retrievalPath.length === 0) {
    return { nodes: [], edges: [] };
  }

  // ── Step 1: collect all edges, dedup by edgeKey ───────────────────────────
  const seenEdgeKeys = new Set<string>();
  const rfEdges: Edge[] = [];

  // Build a map of node id → graph origin from fragment metadata.
  // _ids in each fragment are the "source" records of that fragment's graph/collection.
  const nodeOrigin = new Map<string, 'structured' | 'unstructured'>();

  for (const frag of retrievalPath) {
    // Record origin for the fragment's _ids (the cited records)
    for (const id of frag._ids) {
      if (!nodeOrigin.has(id)) {
        nodeOrigin.set(id, frag.graph);
      }
    }

    const fragEdges = frag.edges ?? [];
    for (const e of fragEdges) {
      const key = edgeKey(e);
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);

      // ── Step 2: map edge to React Flow Edge ──────────────────────────────
      const strokeStyle = STROKE_BY_KIND[e.kind];
      rfEdges.push({
        id: key,
        source: e._from,
        target: e._to,
        type: 'kind',
        data: { kind: e.kind, label: e.label, collection: e.collection },
        style: {
          stroke: 'var(--muted-foreground)',
          ...strokeStyle,
        },
      });

      // Record origin hints from edge endpoints
      // _from and _to typically live in the same graph as the fragment
      if (!nodeOrigin.has(e._from)) {
        // hybrid edges always originate from question/current — no fragment graph
        if (e.kind === 'hybrid') {
          // question/current is its own synthetic origin — no graph assignment
        } else {
          nodeOrigin.set(e._from, frag.graph);
        }
      }
      if (!nodeOrigin.has(e._to)) {
        nodeOrigin.set(e._to, frag.graph);
      }
    }
  }

  // ── Step 3: collect unique node ids from edge endpoints + fragment _ids ───
  const seenNodeIds = new Set<string>();
  const rfNodes: Node[] = [];

  // Helper to emit a node
  const emitNode = (
    id: string,
    type: NodeType,
    graph?: 'structured' | 'unstructured',
    label?: string,
  ) => {
    if (seenNodeIds.has(id)) return;
    seenNodeIds.add(id);
    rfNodes.push({
      id,
      type,
      position: { x: 0, y: 0 }, // dagre layout pass assigns final positions
      data: {
        label: label ?? id,
        graph: graph ?? 'unstructured',
        collection: id.includes('/') ? id.split('/')[0] : id,
      },
    });
  };

  // Emit nodes from edge endpoints
  for (const e of rfEdges) {
    const sourceId: string = e.source as string;
    const targetId: string = e.target as string;

    if (sourceId !== QUESTION_NODE_ID) {
      emitNode(sourceId, 'record', nodeOrigin.get(sourceId));
    }
    if (targetId !== QUESTION_NODE_ID) {
      emitNode(targetId, 'record', nodeOrigin.get(targetId));
    }
  }

  // Also emit nodes for fragment _ids not yet covered by edges
  for (const frag of retrievalPath) {
    for (const id of frag._ids) {
      emitNode(id, 'record', frag.graph);
    }
  }

  // ── Step 4: emit question/current anchor node if any hybrid edge exists ───
  const hasHybrid = rfEdges.some((e) => (e.data as { kind: EdgeKind }).kind === 'hybrid');
  if (hasHybrid) {
    if (!seenNodeIds.has(QUESTION_NODE_ID)) {
      rfNodes.push({
        id: QUESTION_NODE_ID,
        type: 'question',
        position: { x: 0, y: 0 },
        data: { label: 'Question', graph: undefined, collection: 'question' },
      });
      seenNodeIds.add(QUESTION_NODE_ID);
    }
  }

  return { nodes: rfNodes, edges: rfEdges };
}
