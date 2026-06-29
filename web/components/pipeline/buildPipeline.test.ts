// web/components/pipeline/buildPipeline.test.ts
//
// Pure unit tests for buildPipeline() — the retrievalPath[] → PipelineStage[]
// transform (EXPL-01 core). No React, no DB, no model — hand-built fragments.
//
// Required assertions (Task-2 behavior block):
//  - Conditionality / honesty (Pitfall 6): structured-only ⇒ ONLY graph-traversal;
//    unstructured-only ⇒ ONLY vector+bm25; empty/structural-only ⇒ ZERO stages.
//  - same_as fragment ⇒ a cross-graph-join stage with spotlight === true.
//  - AQL-carry: each stage's aql === its source fragment's query.
//  - Citation ownership: each stage's citationIds === the source fragment's _ids.
//  - D-03 collapse: vector+bm25 documentsMatched === distinct parent-doc count
//    (via PART_OF edges), NOT the chunk count; chunk ids still available.
//  - Ordering: vector+bm25 → cross-graph-join → graph-traversal.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import { buildPipeline } from './buildPipeline.js';

type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;
type EdgeKind = 'traversed' | 'structural' | 'hybrid';

function makeEdge(
  kind: EdgeKind,
  _from: string,
  _to: string,
  label: string,
  collection = 'customer360_Relations',
  _id: string | null = null,
) {
  return { _id, _from, _to, collection, kind, label };
}

function makeFragment(
  graph: 'structured' | 'unstructured',
  collection: string,
  _ids: string[],
  edges: ReturnType<typeof makeEdge>[] = [],
  query = 'Q_test',
): RetrievalPathFragmentT {
  return { graph, collection, _ids, query, edges };
}

// ── Fixtures mirroring the real tool fragments ──────────────────────────────

// hybridRetrieve: graph:'unstructured', collection:'customer360_Chunks', chunk _ids,
// traversed PART_OF chunk→doc edges + hybrid question→chunk edges.
const unstructuredFragment = (chunkToDoc: Record<string, string>) =>
  makeFragment(
    'unstructured',
    'customer360_Chunks',
    Object.keys(chunkToDoc),
    [
      ...Object.entries(chunkToDoc).map(([c, d], i) =>
        makeEdge('traversed', c, d, 'PART_OF', 'customer360_Relations', `rel/part_${i}`),
      ),
      ...Object.keys(chunkToDoc).map((c) => makeEdge('hybrid', 'question/current', c, 'hybrid', 'hybrid')),
    ],
    'vector+BM25+RRF over Chunks → PART_OF Document',
  );

// structuredQuery: graph:'structured', traversed HAS_* edges from the account anchor.
const structuredFragment = () =>
  makeFragment(
    'structured',
    'UsageFact',
    ['UsageFact/u1', 'UsageFact/u2'],
    [
      makeEdge('traversed', 'Account/a1', 'UsageFact/u1', 'HAS_USAGE', 'customer360_structured', 'HAS_USAGE/e1'),
      makeEdge('traversed', 'Account/a1', 'UsageFact/u2', 'HAS_USAGE', 'customer360_structured', 'HAS_USAGE/e2'),
    ],
    '1..1 OUTBOUND Account/a1 HAS_USAGE',
  );

// crossGraphJoin: graph:'unstructured', collection:'same_as', traversed same_as edges.
const crossGraphFragment = () =>
  makeFragment(
    'unstructured',
    'same_as',
    ['customer360_Documents/d9'],
    [
      makeEdge('traversed', 'canonical_entities/h1', 'customer360_Entities/k1', 'same_as', 'same_as', 'same_as/e1'),
      makeEdge('traversed', 'customer360_Entities/k1', 'customer360_Chunks/c9', 'MENTIONED_IN', 'customer360_Relations', 'rel/men1'),
      makeEdge('traversed', 'customer360_Chunks/c9', 'customer360_Documents/d9', 'PART_OF', 'customer360_Relations', 'rel/part9'),
    ],
    'canonical hub →INBOUND same_as→ KG entity →OUTBOUND MENTIONED_IN→ Chunk →OUTBOUND PART_OF→ Document (single AQL)',
  );

// account anchor (entityLookup): structural-only, no traversed edge — must NOT make a stage.
const accountAnchorFragment = () =>
  makeFragment('structured', 'Account', ['Account/a1'], [], 'FOR a IN Account FILTER a._key == @id LIMIT 1');

// ── Conditionality / honesty (Pitfall 6) ────────────────────────────────────

describe('buildPipeline conditionality (Pitfall 6 — honesty)', () => {
  it('structured-only path yields ONLY a graph-traversal stage', () => {
    const stages = buildPipeline([structuredFragment()]);
    expect(stages.map((s) => s.mode)).toEqual(['graph-traversal']);
  });

  it('unstructured-only path yields ONLY a vector+bm25 stage', () => {
    const stages = buildPipeline([unstructuredFragment({ 'customer360_Chunks/c1': 'customer360_Documents/d1' })]);
    expect(stages.map((s) => s.mode)).toEqual(['vector+bm25']);
  });

  it('empty path yields ZERO stages', () => {
    expect(buildPipeline([])).toEqual([]);
  });

  it('structural-only (account anchor) path yields ZERO stages — never fabricated', () => {
    expect(buildPipeline([accountAnchorFragment()])).toEqual([]);
  });
});

// ── Cross-graph join spotlight ──────────────────────────────────────────────

describe('buildPipeline cross-graph join', () => {
  it('a same_as fragment yields a cross-graph-join stage with spotlight === true', () => {
    const stages = buildPipeline([crossGraphFragment()]);
    const join = stages.find((s) => s.mode === 'cross-graph-join');
    expect(join).toBeDefined();
    expect(join?.spotlight).toBe(true);
  });

  it('detects a cross-graph join from a same_as EDGE label even when collection differs', () => {
    const frag = makeFragment('unstructured', 'customer360_Chunks', ['customer360_Chunks/c1'], [
      makeEdge('traversed', 'canonical_entities/h1', 'customer360_Entities/k1', 'same_as', 'same_as', 'same_as/e1'),
    ]);
    const stages = buildPipeline([frag]);
    expect(stages.some((s) => s.mode === 'cross-graph-join' && s.spotlight === true)).toBe(true);
  });
});

// ── AQL-carry (the EXPL-01 reveal) ──────────────────────────────────────────

describe('buildPipeline AQL-carry', () => {
  it('each stage aql equals the source fragment query', () => {
    const u = unstructuredFragment({ 'customer360_Chunks/c1': 'customer360_Documents/d1' });
    const s = structuredFragment();
    const j = crossGraphFragment();
    const stages = buildPipeline([u, j, s]);
    const byMode = Object.fromEntries(stages.map((st) => [st.mode, st.aql]));
    expect(byMode['vector+bm25']).toBe(u.query);
    expect(byMode['cross-graph-join']).toBe(j.query);
    expect(byMode['graph-traversal']).toBe(s.query);
  });
});

// ── Citation ownership ──────────────────────────────────────────────────────

describe('buildPipeline citation ownership', () => {
  it('each stage citationIds are exactly its source fragment _ids', () => {
    const u = unstructuredFragment({
      'customer360_Chunks/c1': 'customer360_Documents/d1',
      'customer360_Chunks/c2': 'customer360_Documents/d1',
    });
    const s = structuredFragment();
    const stages = buildPipeline([u, s]);
    const vec = stages.find((st) => st.mode === 'vector+bm25');
    const trav = stages.find((st) => st.mode === 'graph-traversal');
    expect(vec?.citationIds.sort()).toEqual([...u._ids].sort());
    expect(trav?.citationIds.sort()).toEqual([...s._ids].sort());
  });
});

// ── D-03 chunk → document collapse ──────────────────────────────────────────

describe('buildPipeline D-03 chunk→document collapse', () => {
  it('documentsMatched = distinct parent-doc count (not chunk count) via PART_OF', () => {
    // 3 chunks, 2 distinct parent documents
    const u = unstructuredFragment({
      'customer360_Chunks/c1': 'customer360_Documents/d1',
      'customer360_Chunks/c2': 'customer360_Documents/d1',
      'customer360_Chunks/c3': 'customer360_Documents/d2',
    });
    const [vec] = buildPipeline([u]);
    expect(vec.mode).toBe('vector+bm25');
    expect(vec.documentsMatched).toBe(2);
    // chunk ids remain available (grounding/drawer unchanged)
    expect(vec.citationIds.length).toBe(3);
  });
});

// ── Ordering ────────────────────────────────────────────────────────────────

describe('buildPipeline ordering', () => {
  it('orders vector+bm25 → cross-graph-join → graph-traversal regardless of input order', () => {
    const u = unstructuredFragment({ 'customer360_Chunks/c1': 'customer360_Documents/d1' });
    const s = structuredFragment();
    const j = crossGraphFragment();
    // intentionally scrambled input order
    const stages = buildPipeline([s, u, j]);
    expect(stages.map((st) => st.mode)).toEqual(['vector+bm25', 'cross-graph-join', 'graph-traversal']);
  });
});

// ── Purity / type-derivation guard ──────────────────────────────────────────

describe('buildPipeline exports', () => {
  it('returns a new array (does not mutate input)', () => {
    const input: RetrievalPathFragmentT[] = [structuredFragment()];
    const before = JSON.stringify(input);
    buildPipeline(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
