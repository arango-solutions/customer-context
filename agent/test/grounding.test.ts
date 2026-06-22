// agent/test/grounding.test.ts
//
// PURE unit tests for the code-level grounding gate (D-02) and the dual-graph
// reconciliation assertion (D-05). No live DB, no model call — these run on every
// commit without any env. They prove the SINGLE anti-hallucination control:
// every claim citation _id must be in the set of _ids the tools actually returned,
// otherwise the envelope is converted to a structured refusal (T-05-11).
//
// Phase 8 additions: groundingScore assertions on every enforceGrounding output path
// (fully grounded → 1.0, partially grounded → ratio, zero citations → 1.0 vacuously).

import { describe, it, expect } from 'vitest';
import { enforceGrounding, assertReconciliation } from '../src/grounding.js';
import type { Citation, PreGroundingEnvelope } from '../src/envelope.js';
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

/** Build a well-formed dual-graph pre-grounding envelope (no groundingScore yet). */
function dualGraphEnvelope(): PreGroundingEnvelope {
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
    const env: PreGroundingEnvelope = {
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

// ---------------------------------------------------------------------------
// Phase 8: groundingScore assertions (EVAL-03 / Task 2)
// These tests prove enforceGrounding injects a deterministic pure-code score
// on EVERY return path — no model call, no I/O. The score is the fraction of
// proposed citations whose _id was in returnedIds.
// ---------------------------------------------------------------------------

describe('enforceGrounding groundingScore (Phase 8 — pure-code grounding ratio)', () => {
  it('fully grounded envelope (all citations in returnedIds) → groundingScore === 1.0', () => {
    const env = dualGraphEnvelope();
    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(typeof out.groundingScore).toBe('number');
    expect(out.groundingScore).toBe(1.0);
    expect(out.refused).toBe(false);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('partially grounded (1 of 2 citations in returnedIds) → groundingScore === 0.5, refused === true', () => {
    const env = dualGraphEnvelope();
    // Replace second claim with hallucinated citation
    env.claims[1] = { text: 'Fabricated claim.', citations: [hallucinatedCite] };
    env.citations = [structuredCite, hallucinatedCite];

    const returnedIds = new Set([structuredCite._id]); // only one of two returned

    const out = enforceGrounding(env, returnedIds);

    expect(typeof out.groundingScore).toBe('number');
    expect(out.groundingScore).toBe(0.5);
    expect(out.refused).toBe(true);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('zero-citation envelope (e.g. refusal with empty citations) → groundingScore === 1.0 (vacuously grounded)', () => {
    const env: PreGroundingEnvelope = {
      answer: 'I cannot answer this question.',
      refused: true,
      claims: [],
      citations: [],
      retrievalPath: [],
      reasoningTrace: ['The model declined.'],
    };
    const returnedIds = new Set<string>();

    const out = enforceGrounding(env, returnedIds);

    expect(typeof out.groundingScore).toBe('number');
    expect(out.groundingScore).toBe(1.0);
    expect(EnvelopeSchema.safeParse(out).success).toBe(true);
  });

  it('groundingScore is present (not undefined) on a fully-grounded envelope', () => {
    const env = dualGraphEnvelope();
    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.groundingScore).not.toBeUndefined();
    expect(out.groundingScore).toBeGreaterThanOrEqual(0);
    expect(out.groundingScore).toBeLessThanOrEqual(1);
  });

  it('groundingScore is present (not undefined) on a refused envelope', () => {
    const env = dualGraphEnvelope();
    env.claims[1] = { text: 'Fabricated.', citations: [hallucinatedCite] };
    env.citations = [structuredCite, hallucinatedCite];
    const returnedIds = new Set([structuredCite._id]);

    const out = enforceGrounding(env, returnedIds);

    expect(out.groundingScore).not.toBeUndefined();
    expect(out.groundingScore).toBeGreaterThanOrEqual(0);
    expect(out.groundingScore).toBeLessThanOrEqual(1);
  });

  it('EnvelopeSchema.safeParse(result).success === true on every returned envelope shape', () => {
    // Fully grounded
    const envFull = dualGraphEnvelope();
    const outFull = enforceGrounding(envFull, new Set([structuredCite._id, unstructuredCite._id]));
    expect(EnvelopeSchema.safeParse(outFull).success).toBe(true);

    // Partial grounding → refusal
    const envPartial = dualGraphEnvelope();
    envPartial.claims[1] = { text: 'Fabricated.', citations: [hallucinatedCite] };
    envPartial.citations = [structuredCite, hallucinatedCite];
    const outPartial = enforceGrounding(envPartial, new Set([structuredCite._id]));
    expect(EnvelopeSchema.safeParse(outPartial).success).toBe(true);

    // Zero-citation → vacuously grounded
    const envZero: PreGroundingEnvelope = {
      answer: 'Refused.', refused: true, claims: [], citations: [],
      retrievalPath: [], reasoningTrace: [],
    };
    const outZero = enforceGrounding(envZero, new Set<string>());
    expect(EnvelopeSchema.safeParse(outZero).success).toBe(true);
  });
});
