// web/lib/diff-envelope.test.ts
//
// Pure-function tests for the CDC-03 grounded set-difference (Plan 03, Task 1).
// Covers added/removed claims, the grounded citation-_id delta, and the
// no-fabricated-diff invariant (newCitationIds ⊆ after.citations._id — D-05).

import { describe, it, expect } from 'vitest';
import type { Envelope, Citation, Claim } from 'customer360-agent';

import { diffEnvelopes } from './diff-envelope';

// ── minimal Envelope factories (only the fields diffEnvelopes reads matter) ──
function cite(_id: string): Citation {
  return { graph: 'unstructured', collection: 'customer360_Documents', _id, aql: '' };
}
function claim(text: string, ids: string[] = []): Claim {
  return { text, citations: ids.map(cite) };
}
function envelope(claims: Claim[], groundingScore = 1): Envelope {
  return {
    answer: claims.map((c) => c.text).join(' '),
    refused: false,
    claims,
    citations: claims.flatMap((c) => c.citations),
    retrievalPath: [],
    reasoningTrace: [],
    groundingScore,
  };
}

describe('diffEnvelopes', () => {
  it('an extra claim in after → its after-index is in addedClaims', () => {
    const before = envelope([claim('Meridian renewed in Q2', ['D/1'])]);
    const after = envelope([
      claim('Meridian renewed in Q2', ['D/1']),
      claim('A renewal-risk escalation was filed in April 2025', ['D/2']),
    ]);
    const diff = diffEnvelopes(before, after);
    expect(diff.addedClaims).toEqual([1]);
  });

  it('a claim in before but not after → its text is in removedClaims', () => {
    const before = envelope([claim('Sentiment is positive', ['D/1'])]);
    const after = envelope([claim('Sentiment has turned negative', ['D/2'])]);
    const diff = diffEnvelopes(before, after);
    expect(diff.removedClaims).toContain('Sentiment is positive');
  });

  it('a citation _id only in after → it is in newCitationIds (grounded delta)', () => {
    const before = envelope([claim('c1', ['D/1'])]);
    const after = envelope([claim('c1', ['D/1']), claim('c2', ['D/2'])]);
    const diff = diffEnvelopes(before, after);
    expect(diff.newCitationIds).toEqual(['D/2']);
  });

  it('GROUNDED invariant: every newCitationIds member ∈ after.citations._id (no fabricated diff)', () => {
    const before = envelope([claim('c1', ['D/1'])]);
    const after = envelope([
      claim('c1', ['D/1']),
      claim('c2', ['D/2']),
      claim('c3', ['D/3', 'D/2']), // D/2 repeated across claims → must dedup
    ]);
    const afterIds = new Set(after.citations.map((c) => c._id));
    const diff = diffEnvelopes(before, after);
    // subset check (the no-fabrication guard) + dedup
    for (const id of diff.newCitationIds) expect(afterIds.has(id)).toBe(true);
    expect(new Set(diff.newCitationIds).size).toBe(diff.newCitationIds.length);
    expect(diff.newCitationIds.sort()).toEqual(['D/2', 'D/3']);
  });

  it('groundingBefore/After reflect the envelope groundingScores', () => {
    const before = envelope([claim('c1', ['D/1'])], 0.5);
    const after = envelope([claim('c1', ['D/1'])], 1);
    const diff = diffEnvelopes(before, after);
    expect(diff.groundingBefore).toBe(0.5);
    expect(diff.groundingAfter).toBe(1);
  });

  it('identical before/after → empty added/removed/newCitationIds', () => {
    const e = envelope([claim('c1', ['D/1']), claim('c2', ['D/2'])]);
    const diff = diffEnvelopes(e, envelope([claim('c1', ['D/1']), claim('c2', ['D/2'])]));
    expect(diff.addedClaims).toEqual([]);
    expect(diff.removedClaims).toEqual([]);
    expect(diff.newCitationIds).toEqual([]);
  });
});
