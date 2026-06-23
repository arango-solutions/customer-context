// web/components/graph-viz/buildGraph.test.ts
//
// Pure unit tests for buildGraph() — the retrievalPath[] → React Flow {nodes, edges}
// transform. No canvas, no React, no DB, no model.
//
// Mirrors the discipline of agent/test/retrievalPath.test.ts (vitest, fixture-driven,
// no I/O). Required assertions:
//
//  SC-1  (honesty invariant) — kind !== 'traversed' NEVER produces a solid stroke.
//         structural → dashed; hybrid → dotted; traversed → solid (no dasharray).
//  SC-2  (data-driven generality) — empty retrievalPath returns without throwing;
//         ~50-edge retrievalPath returns without throwing; no per-question literals.
//  Pitfall-2 dedup — the React Flow edge id equals the mirrored edgeKey;
//         two null-_id edges with distinct from/to/label get DISTINCT ids.
//  Node coverage — every unique _from/_to endpoint becomes a node; a synthetic
//         'question/current' anchor node appears when any hybrid edge is present.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import { buildGraph } from './buildGraph.js';

// Derive the fragment type from the barrel-exported Zod schema (same pattern as
// buildGraph.ts itself — never duplicate envelope.ts).
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

// ── Helpers ──────────────────────────────────────────────────────────────────

type EdgeKind = 'traversed' | 'structural' | 'hybrid';

function makeEdge(
  kind: EdgeKind,
  _from: string,
  _to: string,
  label: string,
  _id: string | null = null,
) {
  return { _id, _from, _to, collection: 'test_col', kind, label };
}

function makeFragment(
  graph: 'structured' | 'unstructured',
  collection: string,
  _ids: string[],
  edges: ReturnType<typeof makeEdge>[],
): RetrievalPathFragmentT {
  return { graph, collection, _ids, query: 'Q_test', edges };
}

// ── SC-1 : honesty invariant (kind → stroke style) ───────────────────────────

describe('buildGraph SC-1: honesty invariant — kind → stroke style', () => {
  it('traversed edges produce NO strokeDasharray (solid)', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { edges } = buildGraph([frag]);
    const rfEdge = edges.find((e) => e.data?.kind === 'traversed');
    expect(rfEdge).toBeDefined();
    const dashArray = rfEdge?.style?.strokeDasharray;
    // solid = undefined or '' — explicitly NOT a dash pattern
    expect(dashArray == null || dashArray === '').toBe(true);
  });

  it('structural edges produce a dashed strokeDasharray', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    const rfEdge = edges.find((e) => e.data?.kind === 'structural');
    expect(rfEdge).toBeDefined();
    // Must have a non-empty dasharray (dashed)
    expect(rfEdge?.style?.strokeDasharray).toBeTruthy();
    expect(rfEdge?.style?.strokeDasharray).not.toBe('');
  });

  it('hybrid edges produce a dotted strokeDasharray', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { edges } = buildGraph([frag]);
    const rfEdge = edges.find((e) => e.data?.kind === 'hybrid');
    expect(rfEdge).toBeDefined();
    // Must have a non-empty dasharray (dotted)
    expect(rfEdge?.style?.strokeDasharray).toBeTruthy();
    expect(rfEdge?.style?.strokeDasharray).not.toBe('');
  });

  it('structural and traversed edges have DIFFERENT dasharray values', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1', 'Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    const traversedEdge = edges.find((e) => e.data?.kind === 'traversed');
    const structuralEdge = edges.find((e) => e.data?.kind === 'structural');
    expect(traversedEdge).toBeDefined();
    expect(structuralEdge).toBeDefined();
    // traversed is solid (no/undefined dasharray)
    expect(traversedEdge?.style?.strokeDasharray == null || traversedEdge?.style?.strokeDasharray === '').toBe(true);
    // structural has a dasharray; they differ
    expect(structuralEdge?.style?.strokeDasharray).toBeTruthy();
    expect(traversedEdge?.style?.strokeDasharray).not.toBe(structuralEdge?.style?.strokeDasharray);
  });

  it('CRITICAL: NO edge with kind !== traversed is ever solid (the honesty invariant)', () => {
    // This is the load-bearing assertion that proves SC-1. Structural and hybrid
    // edges drawn as solid is the worst possible honesty failure in the demo.
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1', 'Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { edges } = buildGraph([frag]);
    const nonTraversed = edges.filter((e) => e.data?.kind !== 'traversed');
    // Every non-traversed edge must have a non-empty strokeDasharray (dashed or dotted)
    for (const e of nonTraversed) {
      expect(
        e.style?.strokeDasharray != null && e.style.strokeDasharray !== '',
        `Edge kind=${e.data?.kind} id=${e.id} must not be solid`,
      ).toBe(true);
    }
  });
});

// ── Pitfall-2 dedup: edgeKey mirrors agent/src/retrievalPath.ts ──────────────

describe('buildGraph Pitfall-2: edgeKey dedup and React Flow edge id', () => {
  it('traversed edge with real _id uses _id as React Flow edge id', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('rel/e1');
  });

  it('null-_id edge uses composite key (kind::_from::_to::label) as React Flow edge id', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('structural::Account/a1::UsageMetric/u1::account');
  });

  it('two null-_id edges with different _to produce DISTINCT ids (no collision/drop)', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1', 'UsageMetric/u2'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
      makeEdge('structural', 'Account/a1', 'UsageMetric/u2', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(2);
    const ids = edges.map((e) => e.id);
    // Both ids must be distinct
    expect(new Set(ids).size).toBe(2);
  });

  it('two identical null-_id edges are deduped to one (no double-render)', () => {
    const frag1 = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const frag2 = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag1, frag2]);
    // deduped to 1 — same composite key
    expect(edges).toHaveLength(1);
  });

  it('edge count equals de-duped input edge count (no silent drops or extras)', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1', 'Chunk/c2'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('traversed', 'Chunk/c2', 'Document/d1', 'PART_OF', 'rel/e2'),
      makeEdge('structural', 'Account/a1', 'Chunk/c1', 'account'),
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(4);
  });
});

// ── Node coverage ─────────────────────────────────────────────────────────────

describe('buildGraph: node coverage', () => {
  it('produces a node for every unique _from/_to endpoint', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { nodes } = buildGraph([frag]);
    const nodeIds = nodes.map((n) => n.id);
    expect(nodeIds).toContain('Chunk/c1');
    expect(nodeIds).toContain('Document/d1');
  });

  it('emits a synthetic question/current anchor node when a hybrid edge is present', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { nodes } = buildGraph([frag]);
    const questionNode = nodes.find((n) => n.id === 'question/current');
    expect(questionNode).toBeDefined();
  });

  it('does NOT emit a question/current node when no hybrid edge is present', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { nodes } = buildGraph([frag]);
    const questionNode = nodes.find((n) => n.id === 'question/current');
    expect(questionNode).toBeUndefined();
  });

  it('nodes carry graph origin (structured/unstructured) in data for CSS token consumption', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { nodes } = buildGraph([frag]);
    // At least one node should carry the fragment's graph origin
    const nodeWithOrigin = nodes.find(
      (n) => n.data?.graph === 'structured' || n.data?.graph === 'unstructured',
    );
    expect(nodeWithOrigin).toBeDefined();
  });
});

// ── SC-2 : data-driven generality (empty + large) ────────────────────────────

describe('buildGraph SC-2: data-driven generality — no per-question branching', () => {
  it('empty retrievalPath returns {nodes:[], edges:[]} without throwing', () => {
    expect(() => buildGraph([])).not.toThrow();
    const { nodes, edges } = buildGraph([]);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('retrievalPath with no edges returns without throwing', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], []);
    expect(() => buildGraph([frag])).not.toThrow();
  });

  it('large retrievalPath (~50 edges) returns without throwing (SC-2 generality)', () => {
    // Generate ~50 edges across two collections to prove SC-2 with no per-question branching
    const edgeCount = 50;
    const edges = Array.from({ length: edgeCount }, (_, i) =>
      makeEdge(
        i % 3 === 0 ? 'traversed' : i % 3 === 1 ? 'structural' : 'hybrid',
        i % 3 === 2 ? 'question/current' : `Chunk/c${i}`,
        `Document/d${i % 10}`,
        i % 3 === 0 ? 'PART_OF' : i % 3 === 1 ? 'account' : 'hybrid',
        i % 3 === 0 ? `rel/e${i}` : null,
      ),
    );
    const frag = makeFragment(
      'unstructured',
      'Chunk',
      edges.filter((e) => e._id != null).map((e) => e._to),
      edges,
    );
    expect(() => buildGraph([frag])).not.toThrow();
    const { nodes, edges: rfEdges } = buildGraph([frag]);
    expect(rfEdges.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('multi-fragment retrievalPath spanning both graphs returns without throwing', () => {
    const structFrag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const unstructFrag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    expect(() => buildGraph([structFrag, unstructFrag])).not.toThrow();
    const { nodes, edges: rfEdges } = buildGraph([structFrag, unstructFrag]);
    expect(rfEdges.length).toBeGreaterThanOrEqual(3);
    expect(nodes.length).toBeGreaterThan(0);
  });
});

// ── EDGES_ENVELOPE fixture integration ────────────────────────────────────────

describe('buildGraph: EDGES_ENVELOPE fixture (all 3 edge kinds)', () => {
  it('processes the EDGES_ENVELOPE fixture without throwing', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    expect(() => buildGraph(EDGES_ENVELOPE.retrievalPath)).not.toThrow();
  });

  it('honesty invariant holds on EDGES_ENVELOPE: no non-traversed edge is solid', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    const { edges } = buildGraph(EDGES_ENVELOPE.retrievalPath);
    const nonTraversed = edges.filter((e) => e.data?.kind !== 'traversed');
    for (const e of nonTraversed) {
      expect(
        e.style?.strokeDasharray != null && e.style.strokeDasharray !== '',
        `Edge kind=${e.data?.kind} id=${e.id} must not be solid`,
      ).toBe(true);
    }
  });

  it('the structural edge in EDGES_ENVELOPE has null _id but gets a unique composite id', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    const { edges } = buildGraph(EDGES_ENVELOPE.retrievalPath);
    const structuralEdge = edges.find((e) => e.data?.kind === 'structural');
    expect(structuralEdge).toBeDefined();
    // id should be a composite key, not 'null' or empty
    expect(structuralEdge?.id).not.toBe('null');
    expect(structuralEdge?.id).not.toBe('');
    expect(structuralEdge?.id).toContain('structural::');
  });

  it('a question/current anchor node is emitted because EDGES_ENVELOPE has a hybrid edge', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    const { nodes } = buildGraph(EDGES_ENVELOPE.retrievalPath);
    const questionNode = nodes.find((n) => n.id === 'question/current');
    expect(questionNode).toBeDefined();
  });
});
