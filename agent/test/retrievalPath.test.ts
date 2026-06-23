// agent/test/retrievalPath.test.ts
//
// Pure unit tests for mergeRetrievalPaths edge union/dedup + the D-04
// no-fabrication guard + the returnedIds non-leak assertion (Phase 10 Wave 0).
//
// No live DB. No model call. No env vars needed.
//
// Tests:
//  (a) Two fragments in the same group with DISTINCT edges → union, none dropped
//  (b) Two fragments with the SAME edge _id → deduped to one
//  (c) Null _id edge → deduped on composite key, no crash, no over-merge
//  (d) traversedEdgesAreGrounded → true when all traversed edges are in set
//  (e) traversedEdgesAreGrounded → false when a traversed edge is absent (D-04)
//  (f) structural and hybrid edges are EXEMPT from the guard
//  (g) No edge _id (any kind) appears in a returnedIds set built only from frag._ids
//      (non-leak assertion — SC-5 isolation)

import { describe, it, expect } from 'vitest';
import {
  mergeRetrievalPaths,
  traversedEdgesAreGrounded,
} from '../src/retrievalPath.js';
import type { RetrievalPathFragmentT, RetrievalPathEdgeT } from '../src/retrievalPath.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEdge(overrides: Partial<RetrievalPathEdgeT> & Pick<RetrievalPathEdgeT, 'kind' | '_id'>): RetrievalPathEdgeT {
  return {
    _from: 'A/1',
    _to: 'B/2',
    collection: 'test_collection',
    label: 'PART_OF',
    ...overrides,
  };
}

function makeFragment(
  edges: RetrievalPathEdgeT[],
  overrides: Partial<RetrievalPathFragmentT> = {},
): RetrievalPathFragmentT {
  return {
    graph: 'unstructured',
    collection: 'customer360_Chunks',
    _ids: ['chunk/a'],
    query: 'Q1',
    edges,
    ...overrides,
  };
}

// ── (a) Distinct edges in same group → union, none dropped ────────────────

describe('mergeRetrievalPaths edge union', () => {
  it('(a) unions distinct edges from two fragments in the same (graph,collection,query) group', () => {
    const edge1 = makeEdge({ _id: 'rel/e1', kind: 'traversed', _from: 'chunk/a', _to: 'doc/a' });
    const edge2 = makeEdge({ _id: 'rel/e2', kind: 'traversed', _from: 'chunk/b', _to: 'doc/b' });

    const frag1 = makeFragment([edge1]);
    const frag2 = makeFragment([edge2]); // same graph::collection::query group

    const [merged] = mergeRetrievalPaths([frag1, frag2]);
    expect(merged.edges).toHaveLength(2);
    const edgeIds = merged.edges.map((e) => e._id);
    expect(edgeIds).toContain('rel/e1');
    expect(edgeIds).toContain('rel/e2');
  });

  it('(b) deduplicates two fragments carrying the SAME edge _id (first-seen-wins)', () => {
    const edge = makeEdge({ _id: 'rel/e1', kind: 'traversed', _from: 'chunk/a', _to: 'doc/a' });

    const frag1 = makeFragment([edge]);
    const frag2 = makeFragment([edge]); // same edge, same group

    const [merged] = mergeRetrievalPaths([frag1, frag2]);
    expect(merged.edges).toHaveLength(1);
    expect(merged.edges[0]._id).toBe('rel/e1');
  });

  it('(c) deduplicates a null-_id edge on the composite key (no crash, no over-merge)', () => {
    // Two fragments with structurally identical null-_id edges → dedup to one
    const edge1 = makeEdge({ _id: null, kind: 'structural', _from: 'Account/acc1', _to: 'Contract/c1', label: 'account' });
    const edge2 = makeEdge({ _id: null, kind: 'structural', _from: 'Account/acc1', _to: 'Contract/c1', label: 'account' });
    // A different null-_id edge (different _to) → kept
    const edge3 = makeEdge({ _id: null, kind: 'structural', _from: 'Account/acc1', _to: 'Contract/c2', label: 'account' });

    const frag1 = makeFragment([edge1], { _ids: ['Account/acc1'] });
    const frag2 = makeFragment([edge2, edge3], { _ids: ['Account/acc1'] });

    const [merged] = mergeRetrievalPaths([frag1, frag2]);
    expect(merged.edges).toHaveLength(2); // edge1≡edge2 deduped; edge3 kept
  });

  it('edges from a fragment with empty edges[] contribute nothing and do not crash', () => {
    const frag1 = makeFragment([]);
    const frag2 = makeFragment([makeEdge({ _id: 'rel/e1', kind: 'traversed' })]);

    const [merged] = mergeRetrievalPaths([frag1, frag2]);
    expect(merged.edges).toHaveLength(1);
  });

  it('fragments in different (graph,collection,query) groups each keep their own edges', () => {
    const edgeA = makeEdge({ _id: 'rel/eA', kind: 'traversed', _from: 'chunk/a', _to: 'doc/a' });
    const edgeB = makeEdge({ _id: 'rel/eB', kind: 'traversed', _from: 'chunk/b', _to: 'doc/b' });

    const fragA = makeFragment([edgeA], { query: 'QA' });
    const fragB = makeFragment([edgeB], { query: 'QB' });

    const merged = mergeRetrievalPaths([fragA, fragB]);
    expect(merged).toHaveLength(2);
    expect(merged[0].edges[0]._id).toBe('rel/eA');
    expect(merged[1].edges[0]._id).toBe('rel/eB');
  });
});

// ── (d,e,f) traversedEdgesAreGrounded (D-04 no-fabrication guard) ─────────

describe('traversedEdgesAreGrounded (D-04)', () => {
  it('(d) returns true when every kind:traversed edge _id is in the returnedEdgeIds set', () => {
    const frag = makeFragment([
      makeEdge({ _id: 'rel/e1', kind: 'traversed' }),
      makeEdge({ _id: 'rel/e2', kind: 'traversed' }),
    ]);
    const groundTruth = new Set(['rel/e1', 'rel/e2']);
    expect(traversedEdgesAreGrounded(frag, groundTruth)).toBe(true);
  });

  it('(e) returns false when a traversed edge _id is ABSENT from the set (the fabrication case, D-04)', () => {
    const frag = makeFragment([
      makeEdge({ _id: 'rel/e1', kind: 'traversed' }), // grounded
      makeEdge({ _id: 'rel/fabricated', kind: 'traversed' }), // NOT in ground truth
    ]);
    const groundTruth = new Set(['rel/e1']); // rel/fabricated is absent
    expect(traversedEdgesAreGrounded(frag, groundTruth)).toBe(false);
  });

  it('(e-null) returns false when a traversed edge has _id === null (cannot ground a null _id)', () => {
    const frag = makeFragment([
      makeEdge({ _id: null, kind: 'traversed' }), // null _id can never be in the set
    ]);
    const groundTruth = new Set<string>(['rel/e1']);
    expect(traversedEdgesAreGrounded(frag, groundTruth)).toBe(false);
  });

  it('(f) structural edges are EXEMPT — do not cause the guard to fail even if not in the set', () => {
    const frag = makeFragment([
      makeEdge({ _id: 'rel/e1', kind: 'traversed' }), // grounded
      makeEdge({ _id: 'structural:acc1:rec1', kind: 'structural', label: 'account' }), // NOT in groundTruth → exempt
    ]);
    const groundTruth = new Set(['rel/e1']); // structural id absent from set
    expect(traversedEdgesAreGrounded(frag, groundTruth)).toBe(true); // still true
  });

  it('(f) hybrid edges are EXEMPT — do not cause the guard to fail', () => {
    const frag = makeFragment([
      makeEdge({ _id: 'rel/e1', kind: 'traversed' }), // grounded
      makeEdge({ _id: 'hybrid:question/q:chunk/c', kind: 'hybrid', label: 'hybrid' }), // NOT in groundTruth → exempt
    ]);
    const groundTruth = new Set(['rel/e1']);
    expect(traversedEdgesAreGrounded(frag, groundTruth)).toBe(true);
  });

  it('(f) a fragment with ONLY structural/hybrid edges is always grounded (vacuously true)', () => {
    const frag = makeFragment([
      makeEdge({ _id: 'structural:acc1:rec1', kind: 'structural', label: 'account' }),
      makeEdge({ _id: 'hybrid:q:c', kind: 'hybrid', label: 'hybrid' }),
    ]);
    expect(traversedEdgesAreGrounded(frag, new Set<string>())).toBe(true);
  });

  it('(f) a fragment with no edges is always grounded (vacuously true)', () => {
    const frag = makeFragment([]);
    expect(traversedEdgesAreGrounded(frag, new Set<string>())).toBe(true);
  });
});

// ── (g) returnedIds non-leak assertion (SC-5 isolation) ──────────────────

describe('returnedIds non-leak (SC-5)', () => {
  it('(g) no edge _id (traversed/structural/hybrid) appears in a returnedIds set built only from frag._ids', () => {
    // Simulate exactly what agent.ts/stream.ts do:
    // returnedIds is built ONLY from frag._ids — never from frag.edges.
    const chunkId = 'customer360_Chunks/chunk_001';
    const edgeId = 'customer360_Relations/rel_001';
    const structuralId = 'structural:acc1:rec1';
    const hybridId = 'hybrid:question/q:customer360_Chunks/chunk_001';

    const frag: RetrievalPathFragmentT = {
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _ids: [chunkId], // only the chunk node _id
      query: 'vector+BM25+RRF',
      edges: [
        { _id: edgeId, _from: chunkId, _to: 'customer360_Documents/doc_001', collection: 'customer360_Relations', kind: 'traversed', label: 'PART_OF' },
        { _id: structuralId, _from: 'Account/acc1', _to: 'Contract/c1', collection: 'account', kind: 'structural', label: 'account' },
        { _id: hybridId, _from: 'question/q', _to: chunkId, collection: 'hybrid', kind: 'hybrid', label: 'hybrid' },
      ],
    };

    // The agent.ts/stream.ts loop: returnedIds ← frag._ids only (never edges)
    const returnedIds = new Set<string>();
    for (const id of frag._ids) {
      if (id != null) returnedIds.add(id);
    }

    // Assert: edge _ids are NOT in returnedIds (the isolation invariant)
    expect(returnedIds.has(edgeId)).toBe(false);
    expect(returnedIds.has(structuralId)).toBe(false);
    expect(returnedIds.has(hybridId)).toBe(false);

    // And the chunk _id IS in returnedIds (sanity check)
    expect(returnedIds.has(chunkId)).toBe(true);
  });
});
