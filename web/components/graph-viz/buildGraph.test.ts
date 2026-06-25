// web/components/graph-viz/buildGraph.test.ts
//
// Pure unit tests for buildGraph() — the retrievalPath[] → engine-neutral
// {nodes, edges} transform. No canvas, no React, no DB, no model.
//
// Required assertions:
//  SC-1  (honesty invariant) — kind !== 'traversed' NEVER produces a solid stroke.
//         structural → dashed; hybrid → dotted; traversed → solid (dash undefined).
//  SC-2  (data-driven generality) — empty retrievalPath returns without throwing;
//         ~50-edge retrievalPath returns without throwing; no per-question literals.
//  Pitfall-2 dedup — the edge id equals the mirrored edgeKey; two null-_id edges
//         with distinct from/to/label get DISTINCT ids.
//  Node coverage — every unique _from/_to endpoint becomes a node; a synthetic
//         'question/current' anchor node appears when any hybrid edge is present.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import { buildGraph } from './buildGraph.js';

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

const isSolid = (dash: string | undefined) => dash == null || dash === '';

// ── SC-1 : honesty invariant (kind → dash) ───────────────────────────────────

describe('buildGraph SC-1: honesty invariant — kind → dash', () => {
  it('traversed edges produce NO dash (solid)', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { edges } = buildGraph([frag]);
    const edge = edges.find((e) => e.kind === 'traversed');
    expect(edge).toBeDefined();
    expect(isSolid(edge?.dash)).toBe(true);
  });

  it('structural edges produce a dashed dash pattern', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    const edge = edges.find((e) => e.kind === 'structural');
    expect(edge).toBeDefined();
    expect(edge?.dash).toBeTruthy();
    expect(edge?.dash).not.toBe('');
  });

  it('hybrid edges produce a dotted dash pattern', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { edges } = buildGraph([frag]);
    const edge = edges.find((e) => e.kind === 'hybrid');
    expect(edge).toBeDefined();
    expect(edge?.dash).toBeTruthy();
    expect(edge?.dash).not.toBe('');
  });

  it('structural and traversed edges have DIFFERENT dash values', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1', 'Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag]);
    const traversed = edges.find((e) => e.kind === 'traversed');
    const structural = edges.find((e) => e.kind === 'structural');
    expect(isSolid(traversed?.dash)).toBe(true);
    expect(structural?.dash).toBeTruthy();
    expect(traversed?.dash).not.toBe(structural?.dash);
  });

  it('CR-03: an UNKNOWN edge kind falls back to dashed (never solid) — honesty under schema skew', () => {
    // Simulate schema skew: a kind the dash map does not know about. It must NOT
    // render solid (which would read as a real traversal).
    const frag = makeFragment('structured', 'Mystery', ['Mystery/m1'], [
      // cast through unknown — this models a runtime value outside the compiled enum
      makeEdge('quantum' as unknown as EdgeKind, 'Mystery/m1', 'Mystery/m2', 'weird'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(1);
    expect(isSolid(edges[0].dash)).toBe(false); // dashed, never solid
  });

  it('CRITICAL: NO edge with kind !== traversed is ever solid (the honesty invariant)', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1', 'Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { edges } = buildGraph([frag]);
    const nonTraversed = edges.filter((e) => e.kind !== 'traversed');
    for (const e of nonTraversed) {
      expect(
        e.dash != null && e.dash !== '',
        `Edge kind=${e.kind} id=${e.id} must not be solid`,
      ).toBe(true);
    }
  });
});

// ── Pitfall-2 dedup: edgeKey mirrors agent/src/retrievalPath.ts ──────────────

describe('buildGraph Pitfall-2: edgeKey dedup and edge id', () => {
  it('traversed edge with real _id uses _id as edge id', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { edges } = buildGraph([frag]);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('rel/e1');
  });

  it('null-_id edge uses composite key (kind::_from::_to::label) as edge id', () => {
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
    expect(new Set(edges.map((e) => e.id)).size).toBe(2);
  });

  it('two identical null-_id edges are deduped to one (no double-render)', () => {
    const frag1 = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const frag2 = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { edges } = buildGraph([frag1, frag2]);
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
    expect(nodes.find((n) => n.id === 'question/current')).toBeDefined();
  });

  it('does NOT emit a question/current node when no hybrid edge is present', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('traversed', 'Chunk/c1', 'Document/d1', 'PART_OF', 'rel/e1'),
    ]);
    const { nodes } = buildGraph([frag]);
    expect(nodes.find((n) => n.id === 'question/current')).toBeUndefined();
  });

  it('node label = the resolved display name from fragment.labels (falls back to collection)', () => {
    const frag = {
      ...makeFragment('structured', 'Account', ['Account/a1', 'Account/a2'], [
        makeEdge('structural', 'Account/a1', 'UsageFact/u1', 'account'),
        makeEdge('structural', 'Account/a2', 'NPS/n1', 'account'),
      ]),
      labels: { 'Account/a1': 'Meridian Logistics' },
    };
    const { nodes } = buildGraph([frag]);
    expect(nodes.find((n) => n.id === 'Account/a1')?.label).toBe('Meridian Logistics');
    // a2 has no label entry → falls back to the collection
    expect(nodes.find((n) => n.id === 'Account/a2')?.label).toBe('Account');
  });

  it('drops isolated nodes (no incident edge) when the graph has edges', () => {
    const frag = makeFragment('structured', 'Account', ['Account/a1', 'Account/lonely'], [
      makeEdge('structural', 'Account/a1', 'UsageFact/u1', 'account'),
    ]);
    const { nodes } = buildGraph([frag]);
    // Account/lonely is in _ids but touches no edge → dropped from the graph.
    expect(nodes.find((n) => n.id === 'Account/lonely')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'Account/a1')).toBeDefined();
    expect(nodes.find((n) => n.id === 'UsageFact/u1')).toBeDefined();
  });

  it('nodes carry graph origin (structured/unstructured) for CSS token consumption', () => {
    const frag = makeFragment('structured', 'UsageMetric', ['UsageMetric/u1'], [
      makeEdge('structural', 'Account/a1', 'UsageMetric/u1', 'account'),
    ]);
    const { nodes } = buildGraph([frag]);
    const withOrigin = nodes.find(
      (n) => n.graph === 'structured' || n.graph === 'unstructured',
    );
    expect(withOrigin).toBeDefined();
  });

  it('bridge fix: KG entities (customer360_*) are unstructured and the hub is "bridge", even in a structured-labeled bridge fragment', () => {
    // bridgeResolve emits its fragment as graph:'structured' even though the
    // customer360_Entities endpoints are unstructured. Collection must win so the
    // same_as bridge visibly spans (structured ↔ hub ↔ unstructured).
    const bridgeFrag = makeFragment(
      'structured',
      'same_as',
      ['Contact/c1', 'customer360_Entities/e1', 'canonical_entities/h1'],
      [
        makeEdge('traversed', 'Contact/c1', 'canonical_entities/h1', 'same_as', 'same_as/1'),
        makeEdge('traversed', 'customer360_Entities/e1', 'canonical_entities/h1', 'same_as', 'same_as/2'),
      ],
    );
    const { nodes } = buildGraph([bridgeFrag]);
    const byId = (id: string) => nodes.find((n) => n.id === id);
    expect(byId('Contact/c1')?.graph).toBe('structured'); // CRM record (fragment fallback)
    expect(byId('customer360_Entities/e1')?.graph).toBe('unstructured'); // KG entity — NOT structured
    expect(byId('canonical_entities/h1')?.graph).toBe('bridge'); // shared-entity hub
  });

  it('the question node carries type "question" and record nodes carry type "record"', () => {
    const frag = makeFragment('unstructured', 'Chunk', ['Chunk/c1'], [
      makeEdge('hybrid', 'question/current', 'Chunk/c1', 'hybrid'),
    ]);
    const { nodes } = buildGraph([frag]);
    expect(nodes.find((n) => n.id === 'question/current')?.type).toBe('question');
    expect(nodes.find((n) => n.id === 'Chunk/c1')?.type).toBe('record');
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
    const { nodes, edges: out } = buildGraph([frag]);
    expect(out.length).toBeGreaterThan(0);
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
    const { nodes, edges } = buildGraph([structFrag, unstructFrag]);
    expect(edges.length).toBeGreaterThanOrEqual(3);
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
    const nonTraversed = edges.filter((e) => e.kind !== 'traversed');
    for (const e of nonTraversed) {
      expect(
        e.dash != null && e.dash !== '',
        `Edge kind=${e.kind} id=${e.id} must not be solid`,
      ).toBe(true);
    }
  });

  it('the structural edge in EDGES_ENVELOPE has null _id but gets a unique composite id', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    const { edges } = buildGraph(EDGES_ENVELOPE.retrievalPath);
    const structural = edges.find((e) => e.kind === 'structural');
    expect(structural).toBeDefined();
    expect(structural?.id).not.toBe('null');
    expect(structural?.id).not.toBe('');
    expect(structural?.id).toContain('structural::');
  });

  it('a question/current anchor node is emitted because EDGES_ENVELOPE has a hybrid edge', async () => {
    const { EDGES_ENVELOPE } = await import('../../test/fixtures.js');
    const { nodes } = buildGraph(EDGES_ENVELOPE.retrievalPath);
    expect(nodes.find((n) => n.id === 'question/current')).toBeDefined();
  });
});
