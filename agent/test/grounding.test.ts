// agent/test/grounding.test.ts
//
// PURE unit tests for the code-level grounding gate (D-02) and the dual-graph
// reconciliation assertion (D-05). No live DB, no model call — these run on every
// commit without any env. They prove the SINGLE anti-hallucination control:
// every claim citation _id must be in the set of _ids the tools actually returned,
// otherwise the envelope is converted to a structured refusal (T-05-11).

import { describe, it, expect } from 'vitest';
import { enforceGrounding, assertReconciliation } from '../src/grounding.js';
import type { Envelope, Citation } from '../src/envelope.js';
import { EnvelopeSchema } from '../src/envelope.js';

// --- fixtures -------------------------------------------------------------

const structuredCite: Citation = {
  graph: 'structured',
  collection: 'UsageFact',
  _id: 'UsageFact/meridian_2025q1',
  aql: 'FOR u IN UsageFact FILTER u.account_id == @accountId ...',
};

const unstructuredCite: Citation = {
  graph: 'unstructured',
  collection: 'customer360_Chunks',
  _id: 'customer360_Chunks/meridian_slack_renewal_risk_2025q1',
  aql: 'vector+BM25+RRF over Chunks → PART_OF Document',
};

const hallucinatedCite: Citation = {
  graph: 'unstructured',
  collection: 'customer360_Chunks',
  _id: 'customer360_Chunks/does_not_exist_fabricated',
  aql: 'vector+BM25+RRF over Chunks → PART_OF Document',
};

/** Build a well-formed dual-graph envelope from the supplied citations. */
function dualGraphEnvelope(): Envelope {
  return {
    answer: 'Meridian usage is green but sentiment is red.',
    refused: false,
    claims: [
      { text: 'Usage is up and the cluster is growing.', citations: [structuredCite] },
      { text: 'The renewal-risk Slack thread shows cooling sentiment.', citations: [unstructuredCite] },
    ],
    citations: [structuredCite, unstructuredCite],
    retrievalPath: [],
    reasoningTrace: ['resolved Meridian', 'pulled usage', 'pulled sentiment', 'reconciled'],
  };
}

describe('enforceGrounding (D-02 code gate)', () => {
  it('(a) passes a fully-grounded both-graph envelope unchanged; assertReconciliation === true', () => {
    const env = dualGraphEnvelope();
    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.refused).toBe(false);
    expect(out.citations).toHaveLength(2);
    expect(out.answer).toBe(env.answer);
    expect(out.claims).toEqual(env.claims);
    expect(assertReconciliation(out)).toBe(true);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('(b) a citation _id NOT in returnedIds → refused, hallucinated citation dropped, grounded ones kept', () => {
    const env = dualGraphEnvelope();
    // Second claim now cites a fabricated _id.
    env.claims[1] = {
      text: 'Sentiment is red (fabricated source).',
      citations: [hallucinatedCite],
    };
    env.citations = [structuredCite, hallucinatedCite];

    // The tools only ever returned the structured _id.
    const returnedIds = new Set([structuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.refused).toBe(true);
    // The fabricated citation must NOT survive.
    expect(out.citations.map((c) => c._id)).not.toContain(hallucinatedCite._id);
    // The grounded citation IS kept as partial sourcing (D-02).
    expect(out.citations.map((c) => c._id)).toContain(structuredCite._id);
    // No fabricated _id is anywhere in the refusal envelope.
    const allIds = [
      ...out.citations.map((c) => c._id),
      ...out.claims.flatMap((cl) => cl.citations.map((c) => c._id)),
    ];
    expect(allIds).not.toContain(hallucinatedCite._id);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('(c) a claim with zero citations → refused', () => {
    const env = dualGraphEnvelope();
    env.claims.push({ text: 'Unsupported assertion with no source.', citations: [] });

    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.refused).toBe(true);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('(d) a structured-only envelope (Q7) passes grounding but assertReconciliation === false', () => {
    const env: Envelope = {
      answer: 'Northwind has climbed the product ladder and shows clear ROI.',
      refused: false,
      claims: [
        { text: 'Usage volume grew across editions.', citations: [structuredCite] },
      ],
      citations: [structuredCite],
      retrievalPath: [],
      reasoningTrace: ['resolved Northwind', 'pulled usage + contract'],
    };
    const returnedIds = new Set([structuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.refused).toBe(false);
    expect(out.citations).toHaveLength(1);
    expect(assertReconciliation(out)).toBe(false);
  });
});
