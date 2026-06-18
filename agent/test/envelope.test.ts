// agent/test/envelope.test.ts
//
// Unit tests for the shared Zod contract (D-03a). No live DB. Proves the schema
// accepts a well-formed envelope (a claim carrying a real-looking _id citation)
// and rejects malformed shapes (missing _id; graph outside the enum).

import { describe, it, expect } from 'vitest';
import {
  EnvelopeSchema,
  CitationSchema,
  type Envelope,
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
    },
    {
      graph: 'unstructured',
      collection: 'customer360_Chunks',
      _ids: ['customer360_Chunks/chunk_8842'],
      query: 'vector+BM25+RRF over Chunks -> PART_OF Document',
    },
  ],
  reasoningTrace: [
    'Retrieve structured usage signal for Meridian.',
    'Retrieve unstructured sentiment signal for Meridian.',
    'Compare: usage green vs sentiment red -> name the contradiction.',
  ],
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
      { graph: 'structured', collection: 'UsageFact', _ids: ['UsageFact/a'], query: 'Q1' },
      { graph: 'structured', collection: 'UsageFact', _ids: ['UsageFact/a', 'UsageFact/b'], query: 'Q1' },
      { graph: 'unstructured', collection: 'customer360_Chunks', _ids: ['customer360_Chunks/c1'], query: 'Q2' },
    ]);
    expect(merged).toHaveLength(2);
    const usage = merged.find((m) => m.collection === 'UsageFact')!;
    expect(usage._ids).toEqual(['UsageFact/a', 'UsageFact/b']);
  });
});
