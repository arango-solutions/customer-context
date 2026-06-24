// web/components/graph-viz/buildGraph.ts
//
// PURE, React-free transform: retrievalPath[] → engine-neutral { nodes, edges }.
//
// This is THE load-bearing file for VIZ-02 (SC-1/SC-2/D-04).
//
// Render engine: the viz is drawn with a d3-force simulation in React-controlled
// SVG (see GraphViz.tsx). This transform is deliberately engine-neutral — it emits
// a plain { nodes, edges } graph with the honesty signal baked into each edge's
// `dash` (strokeDasharray) so the renderer cannot re-promote a structural/hybrid
// edge to a solid (real-traversal) stroke.
//
// Design principles (mirrors agent/src/retrievalPath.ts discipline):
//  - Pure function: no I/O, no React, no d3. Plain data in, plain data out.
//  - edgeKey is mirrored VERBATIM from agent/src/retrievalPath.ts line 21-22 so
//    the edge id inherits the merge-time dedup guarantee (Pitfall 2).
//  - DASH_BY_KIND (Pattern 2 from 11-RESEARCH.md): traversed→solid (no dash),
//    structural→dashed '6 4', hybrid→dotted '1 5'. The dash carries the honesty
//    signal; color stays neutral (--muted-foreground) at render time.
//  - D-02: a synthetic 'question/current' anchor node is emitted whenever any
//    hybrid edge is present (representing where retrieval started).
//  - Node origin ('structured'|'unstructured') flows through node.graph so the
//    renderer reads --graph-structured/--graph-unstructured CSS tokens. buildGraph
//    emits NO hardcoded hex.

import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';

// ── Type derivation (schema-derived — never duplicate envelope.ts) ──────────
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;
type RetrievalPathEdgeT = RetrievalPathFragmentT['edges'][number];
export type EdgeKind = RetrievalPathEdgeT['kind'];

// ── Engine-neutral graph shape (consumed by layout.ts + GraphViz.tsx) ────────
export type VizNodeType = 'record' | 'question';

// 'bridge' = the canonical_entities hub that joins the two graphs (rendered neutral,
// in the CENTER band, so same_as edges visibly fan in from both sides).
export type NodeOrigin = 'structured' | 'unstructured' | 'bridge';

export interface VizNode {
  id: string;
  type: VizNodeType;
  graph?: NodeOrigin;
  collection: string;
  label: string;
}

export interface VizEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  collection: string;
  /** strokeDasharray — undefined means solid. HONESTY: only 'traversed' is solid. */
  dash?: string;
  linecap?: 'butt' | 'round' | 'square';
}

export interface VizGraph {
  nodes: VizNode[];
  edges: VizEdge[];
}

// ── edgeKey — MIRRORED VERBATIM from agent/src/retrievalPath.ts line 21-22 ──
const edgeKey = (e: RetrievalPathEdgeT): string =>
  e._id ?? `${e.kind}::${e._from}::${e._to}::${e.label}`;

// ── DASH_BY_KIND — Pattern 2 from 11-RESEARCH.md ─────────────────────────────
//
// Maps edge.kind to an SVG strokeDasharray.
// HONESTY INVARIANT: only 'traversed' is solid (dash === undefined).
// structural → dashed '6 4'; hybrid → dotted '1 5'.
const DASH_BY_KIND: Record<EdgeKind, { dash?: string; linecap?: 'butt' | 'round' }> = {
  traversed: { dash: undefined, linecap: 'butt' },
  structural: { dash: '6 4', linecap: 'butt' },
  hybrid: { dash: '1 5', linecap: 'round' },
};

// ── QUESTION_NODE_ID — synthetic anchor for hybrid retrieval (D-02) ──────────
export const QUESTION_NODE_ID = 'question/current';

const collectionOf = (id: string): string =>
  id.includes('/') ? id.split('/')[0] : id;

// Authoritative per-node origin from the COLLECTION name — overrides the fragment's
// declared `graph`, which is unreliable for the bridge fragment (bridgeResolve emits
// graph:'structured' even though its customer360_Entities endpoints are unstructured).
//  - canonical_entities  → 'bridge' (the shared-entity hub, neutral/center)
//  - customer360_*        → 'unstructured' (AutoGraph KG: Chunks, Documents, Entities)
//  - anything else        → undefined → defer to the fragment's declared graph
//    (Account, Contact, UsageFact, NPS, Contract, Opportunity, … are all structured)
function originByCollection(coll: string): NodeOrigin | undefined {
  if (coll === 'canonical_entities') return 'bridge';
  if (coll.startsWith('customer360_')) return 'unstructured';
  return undefined;
}

// ── buildGraph ────────────────────────────────────────────────────────────────
//
// Transform: retrievalPath[] → { nodes, edges } (engine-neutral).
//
// Steps:
//  1. Flatten all edges from all fragments; dedup by edgeKey.
//  2. Map each edge to a VizEdge with id = edgeKey, dash by kind (honesty).
//  3. Collect every unique _from/_to endpoint as a node.
//  4. If any hybrid edge is present, emit the question/current anchor node.
//  5. Assign each node a graph origin from the fragment that contributed it.
//
// Pure function: always returns a new object; never mutates input.
export function buildGraph(retrievalPath: RetrievalPathFragmentT[]): VizGraph {
  if (retrievalPath.length === 0) {
    return { nodes: [], edges: [] };
  }

  const seenEdgeKeys = new Set<string>();
  const edges: VizEdge[] = [];

  // Map of node id → graph origin from fragment metadata.
  const nodeOrigin = new Map<string, 'structured' | 'unstructured'>();

  for (const frag of retrievalPath) {
    for (const id of frag._ids) {
      if (!nodeOrigin.has(id)) nodeOrigin.set(id, frag.graph);
    }

    const fragEdges = frag.edges ?? [];
    for (const e of fragEdges) {
      const key = edgeKey(e);
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);

      const { dash, linecap } = DASH_BY_KIND[e.kind];
      edges.push({
        id: key,
        source: e._from,
        target: e._to,
        kind: e.kind,
        label: e.label,
        collection: e.collection,
        dash,
        linecap,
      });

      // Record origin hints from edge endpoints (hybrid edges originate from the
      // synthetic question anchor — no fragment graph assignment for _from there).
      if (!nodeOrigin.has(e._from) && e.kind !== 'hybrid') {
        nodeOrigin.set(e._from, frag.graph);
      }
      if (!nodeOrigin.has(e._to)) {
        nodeOrigin.set(e._to, frag.graph);
      }
    }
  }

  // ── Step 3: collect unique node ids from edge endpoints + fragment _ids ───
  const seenNodeIds = new Set<string>();
  const nodes: VizNode[] = [];

  const emitNode = (id: string, type: VizNodeType, graph?: NodeOrigin) => {
    if (seenNodeIds.has(id)) return;
    seenNodeIds.add(id);
    const coll = collectionOf(id);
    // Collection is authoritative; fragment graph is the fallback for unknown collections.
    const origin = originByCollection(coll) ?? graph;
    nodes.push({ id, type, graph: origin, collection: coll, label: coll });
  };

  for (const e of edges) {
    if (e.source !== QUESTION_NODE_ID) emitNode(e.source, 'record', nodeOrigin.get(e.source));
    if (e.target !== QUESTION_NODE_ID) emitNode(e.target, 'record', nodeOrigin.get(e.target));
  }

  // Also emit nodes for fragment _ids not yet covered by edges.
  for (const frag of retrievalPath) {
    for (const id of frag._ids) emitNode(id, 'record', frag.graph);
  }

  // ── Step 4: emit question/current anchor node if any hybrid edge exists ───
  const hasHybrid = edges.some((e) => e.kind === 'hybrid');
  if (hasHybrid && !seenNodeIds.has(QUESTION_NODE_ID)) {
    seenNodeIds.add(QUESTION_NODE_ID);
    nodes.push({
      id: QUESTION_NODE_ID,
      type: 'question',
      graph: undefined,
      collection: 'question',
      label: 'Question',
    });
  }

  return { nodes, edges };
}
