// agent/test/envelope.test.ts
//
// Unit tests for the shared Zod contract (D-03a). No live DB. Proves the schema
// accepts a well-formed envelope (a claim carrying a real-looking _id citation)
// and rejects malformed shapes (missing _id; graph outside the enum).
//
// Also tests RetrievalPathEdge + edges[] (Phase 10, VIZ-01):
//   - A real edge _id parses successfully
//   - A null _id parses successfully (synthetic/structural/hybrid edges may have null)
//   - A RetrievalPathFragment omitting edges parses and yields edges === []
//   - kind outside ['traversed','structural','hybrid'] is rejected

import { describe, it, expect } from 'vitest';
import {
  EnvelopeSchema,
  CitationSchema,
  EdgeKindEnum,
  RetrievalPathEdge,
  RetrievalPathFragment,
  type Envelope,
  type PreGroundingEnvelope,
} from '../src/envelope.js';
import { mergeRetrievalPaths } from '../src/retrievalPath.js';

const validEnvelope: Envelope = {
  answer:
    'Meridian usage is up (query volume +18% QoQ) but sentiment is red: a QBR thread flags ops burden.',
  refused: false,
  claims: [
    {
      text: 'Meridian query volume rose 18% quarter-over-quarter.',
      citations: [
        {
          graph: 'structured',
          collection: 'UsageFact',
          _id: 'UsageFact/9eff6d7b-usage-2025q4',
          aql: 'FOR u IN UsageFact FILTER u.account_id == @accountId ... LIMIT 12',
        },
      ],
    },
    {
      text: 'A QBR thread flags partnership-health escalation and ops burden.',
      citations: [
        {
          graph: 'unstructured',
          collection: 'customer360_Chunks',
          _id: 'customer360_Chunks/chunk_8842',
          aql: 'vector+BM25+RRF over Chunks -> PART_OF Document',
          traversal: 'Chunk -PART_OF-> Document',
        },
      ],
    },
  ],
  citations: [
    {
      graph: 'structured',
      collection: 'UsageFact',
      _id: 'UsageFact/9eff6d7b-usage-2025q4',
      aql: 'FOR u IN UsageFact FILTER u.account_id == @accountId ... LIMIT 12',
    },
    {
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _id: 'customer360_Chunks/chunk_8842',
      aql: 'vector+BM25+RRF over Chunks -> PART_OF Document',
      traversal: 'Chunk -PART_OF-> Document',
    },
  ],
  retrievalPath: [
    {
      graph: 'structured',
      collection: 'UsageFact',
      _ids: ['UsageFact/9eff6d7b-usage-2025q4'],
      query: 'FOR u IN UsageFact FILTER u.account_id == @accountId ... LIMIT 12',
      edges: [],
    },
    {
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _ids: ['customer360_Chunks/chunk_8842'],
      query: 'vector+BM25+RRF over Chunks -> PART_OF Document',
      edges: [],
    },
  ],
  reasoningTrace: [
    'Retrieve structured usage signal for Meridian.',
    'Retrieve unstructured sentiment signal for Meridian.',
    'Compare: usage green vs sentiment red -> name the contradiction.',
  ],
  groundingScore: 1.0,
};

describe('EnvelopeSchema (the shared contract, D-03a)', () => {
  it('accepts a well-formed envelope with a real-looking _id citation', () => {
    const parsed = EnvelopeSchema.parse(validEnvelope);
    expect(parsed.refused).toBe(false);
    expect(parsed.claims).toHaveLength(2);
    expect(parsed.claims[0].citations[0]._id).toBe(
      'UsageFact/9eff6d7b-usage-2025q4',
    );
    // Both graphs are represented across the citations (the dual-graph promise).
    const graphs = new Set(parsed.citations.map((c) => c.graph));
    expect(graphs).toEqual(new Set(['structured', 'unstructured']));
  });

  it('applies the refused:false default when omitted', () => {
    const { refused, ...withoutRefused } = validEnvelope;
    void refused;
    const parsed = EnvelopeSchema.parse(withoutRefused);
    expect(parsed.refused).toBe(false);
  });

  it('rejects a citation missing its _id grounding anchor', () => {
    const bad = {
      ...validEnvelope,
      citations: [
        {
          graph: 'structured',
          collection: 'UsageFact',
          // _id intentionally omitted — grounding anchor is mandatory
          aql: 'FOR u IN UsageFact ...',
        },
      ],
    };
    const result = EnvelopeSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a citation whose graph is not in the enum', () => {
    const result = CitationSchema.safeParse({
      graph: 'sql', // not 'structured' | 'unstructured'
      collection: 'UsageFact',
      _id: 'UsageFact/x',
      aql: 'FOR u IN UsageFact ...',
    });
    expect(result.success).toBe(false);
  });
});

describe('mergeRetrievalPaths', () => {
  it('dedupes _ids within the same (graph, collection, query) group', () => {
    const merged = mergeRetrievalPaths([
      { graph: 'structured', collection: 'UsageFact', _ids: ['UsageFact/a'], query: 'Q1', edges: [] },
      { graph: 'structured', collection: 'UsageFact', _ids: ['UsageFact/a', 'UsageFact/b'], query: 'Q1', edges: [] },
      { graph: 'unstructured', collection: 'customer360_Chunks', _ids: ['customer360_Chunks/c1'], query: 'Q2', edges: [] },
    ]);
    expect(merged).toHaveLength(2);
    const usage = merged.find((m) => m.collection === 'UsageFact')!;
    expect(usage._ids).toEqual(['UsageFact/a', 'UsageFact/b']);
  });
});

// ── Phase 10: RetrievalPathEdge + edges[] (VIZ-01) ──────────────────────────

describe('EdgeKindEnum', () => {
  it('accepts all three valid kinds', () => {
    expect(EdgeKindEnum.options).toContain('traversed');
    expect(EdgeKindEnum.options).toContain('structural');
    expect(EdgeKindEnum.options).toContain('hybrid');
    expect(EdgeKindEnum.options).toHaveLength(3);
  });
});

describe('RetrievalPathEdge', () => {
  it('parses an edge with a real ArangoDB _id', () => {
    const edge = RetrievalPathEdge.parse({
      _id: 'customer360_Relations/rel_001',
      _from: 'customer360_Chunks/chunk_001',
      _to: 'customer360_Documents/doc_001',
      collection: 'customer360_Relations',
      kind: 'traversed',
      label: 'PART_OF',
    });
    expect(edge._id).toBe('customer360_Relations/rel_001');
    expect(edge.kind).toBe('traversed');
    expect(edge.label).toBe('PART_OF');
  });

  it('parses an edge with _id: null (synthetic/structural/hybrid edges may have null)', () => {
    const edge = RetrievalPathEdge.parse({
      _id: null,
      _from: 'Account/acc_001',
      _to: 'Contract/contract_001',
      collection: 'account',
      kind: 'structural',
      label: 'account',
    });
    expect(edge._id).toBeNull();
    expect(edge.kind).toBe('structural');
  });

  it('parses a hybrid edge', () => {
    const edge = RetrievalPathEdge.parse({
      _id: 'hybrid:question/current:customer360_Chunks/chunk_001',
      _from: 'question/current',
      _to: 'customer360_Chunks/chunk_001',
      collection: 'hybrid',
      kind: 'hybrid',
      label: 'hybrid',
    });
    expect(edge.kind).toBe('hybrid');
  });

  it('rejects kind outside the enum', () => {
    const result = RetrievalPathEdge.safeParse({
      _id: 'some_coll/some_id',
      _from: 'A/1',
      _to: 'B/2',
      collection: 'some_coll',
      kind: 'fabricated', // not in ['traversed','structural','hybrid']
      label: 'bad_kind',
    });
    expect(result.success).toBe(false);
  });
});

describe('RetrievalPathFragment edges[] (VIZ-01)', () => {
  it('defaults edges to [] when the field is omitted', () => {
    const frag = RetrievalPathFragment.parse({
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _ids: ['customer360_Chunks/chunk_001'],
      query: 'vector+BM25+RRF',
      // edges intentionally omitted — must default to []
    });
    expect(frag.edges).toEqual([]);
  });

  it('accepts a fragment with an explicit edges array', () => {
    const frag = RetrievalPathFragment.parse({
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _ids: ['customer360_Chunks/chunk_001'],
      query: 'vector+BM25+RRF',
      edges: [
        {
          _id: 'customer360_Relations/rel_001',
          _from: 'customer360_Chunks/chunk_001',
          _to: 'customer360_Documents/doc_001',
          collection: 'customer360_Relations',
          kind: 'traversed',
          label: 'PART_OF',
        },
      ],
    });
    expect(frag.edges).toHaveLength(1);
    expect(frag.edges[0].kind).toBe('traversed');
  });
});
