// web/lib/diff-envelope.ts
//
// CDC-03 grounded "what-changed" set-difference between two answer envelopes.
//
// The diff is the trustworthiness payoff for a security buyer, so it must read as
// HONEST: it is a deterministic, network-free pure function (NO LLM call, like
// enforceGrounding is pure code — D-05). The grounded signal is the citation _id
// delta: `newCitationIds` are real ArangoDB _ids present in `after.citations`, so
// the banner can name the actual new record and never fabricate a change.
//
// Imports the Envelope type from the agent package (never forks EnvelopeSchema —
// the same discipline as TrustChip/useAsk). The diff runs strictly downstream of
// the terminal-gated data-envelope; it never feeds returnedIds/enforceGrounding
// (D-07: the grounding gate is untouched).
//
// A5 caveat: claim-text diff (added/removed) can over-report on rewording; the
// citation-_id delta is the load-bearing grounded signal the banner leads with.

import type { Envelope } from 'customer360-agent';

export interface EnvelopeDiff {
  /** Indices into `after.claims` whose normalized text is absent from `before`. */
  addedClaims: number[];
  /** `before` claim texts whose normalized text is absent from `after` (dropped). */
  removedClaims: string[];
  /** Citation `_id`s present in `after.citations` but not `before` — the GROUNDED
   * delta the banner names. Invariant: every member ∈ after.citations._id. */
  newCitationIds: string[];
  /** before.groundingScore (for an at-a-glance before→after trust read). */
  groundingBefore: number;
  /** after.groundingScore. */
  groundingAfter: number;
}

/** Normalize claim text so trivial whitespace/case differences are not "changes". */
const claimKey = (t: string): string => t.trim().toLowerCase();

/**
 * Deterministic grounded set-difference between two envelopes for the same question.
 * Pure: no model call, no network. Claims are matched by normalized text; citations
 * by their real `_id`.
 */
export function diffEnvelopes(before: Envelope, after: Envelope): EnvelopeDiff {
  const beforeClaimKeys = new Set(before.claims.map((c) => claimKey(c.text)));
  const afterClaimKeys = new Set(after.claims.map((c) => claimKey(c.text)));

  const addedClaims = after.claims
    .map((claim, i) => ({ claim, i }))
    .filter(({ claim }) => !beforeClaimKeys.has(claimKey(claim.text)))
    .map(({ i }) => i);

  const removedClaims = before.claims
    .filter((claim) => !afterClaimKeys.has(claimKey(claim.text)))
    .map((claim) => claim.text);

  const beforeCitationIds = new Set(before.citations.map((c) => c._id));
  // Dedup: a record can appear in several claims' flattened citations — the banner
  // should name each new record once.
  const newCitationIds = [
    ...new Set(
      after.citations.map((c) => c._id).filter((id) => !beforeCitationIds.has(id)),
    ),
  ];

  return {
    addedClaims,
    removedClaims,
    newCitationIds,
    groundingBefore: before.groundingScore,
    groundingAfter: after.groundingScore,
  };
}
