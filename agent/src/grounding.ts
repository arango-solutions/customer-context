// agent/src/grounding.ts
//
// THE central anti-hallucination control (D-02, T-05-11) — and it is PURE CODE.
//
// The planner (OpenAI flagship, D-06) PROPOSES citation _ids when it synthesizes
// the envelope. We do NOT trust those proposals. enforceGrounding() verifies every
// citation _id against `returnedIds` — the set of _ids the curated tools ACTUALLY
// returned during the agent loop — and converts any ungrounded/hallucinated-citation
// envelope into a structured refusal that keeps only the citations that were really
// sourced (partial sourcing, D-02).
//
// This is a pure function over (envelope, returnedIds): no model call, no I/O. The
// model NEVER self-certifies grounding (that would reopen exactly the hallucination
// surface this project exists to avoid — CLAUDE.md cardinal rule). Because the gate
// is code, it is PROVIDER-INDEPENDENT: the D-06 OpenAI swap does not touch this file
// and would not touch it for any future provider swap.

import { EnvelopeSchema, type Envelope, type Citation, type PreGroundingEnvelope } from './envelope.js';

/** A citation is grounded iff its _id is in the set the tools actually returned. */
function isGrounded(citation: Citation, returnedIds: Set<string>): boolean {
  return returnedIds.has(citation._id);
}

/**
 * The D-02 code gate.
 *
 * If every claim has ≥1 citation AND every citation._id ∈ returnedIds, the envelope
 * is fully grounded and returned UNCHANGED.
 *
 * Otherwise the envelope is converted to a structured refusal:
 *   - refused: true
 *   - answer: a plain "cannot answer because the supporting record was not in the
 *     retrieved set" message (NO fabricated facts, NO model re-judgement)
 *   - claims: pruned to the grounded subset (claims that still have ≥1 grounded
 *     citation), each with only its grounded citations
 *   - citations: only those whose _id ∈ returnedIds (partial sourcing, D-02)
 *   - retrievalPath + reasoningTrace: preserved (the trace of what WAS attempted)
 *
 * Pure over (envelope, returnedIds): no model call, no I/O. Provider-independent.
 */
export function enforceGrounding(
  envelope: PreGroundingEnvelope,
  returnedIds: Set<string>,
): Envelope {
  // Compute groundingScore at the top, before any branching: deterministic pure-code ratio
  // of grounded citations (no LLM call).
  // CHECKER WARNING 2: a refused/zero-citation envelope scores 1.0 (vacuously grounded —
  // no fabricated citations). Phase 11 UI-06 MUST use the `refused` flag to distinguish
  // "refused=true, groundingScore=1.0" from "refused=false, groundingScore=1.0 (fully grounded)"
  // before displaying the score, or it will read as "100% grounded" on a refusal.
  const groundedCitations = envelope.citations.filter((c) => isGrounded(c, returnedIds));
  const groundingScore =
    envelope.citations.length === 0
      ? 1.0
      : groundedCitations.length / envelope.citations.length;

  // Citations the model proposed that the tools never actually returned.
  const ungrounded = envelope.citations.filter((c) => !isGrounded(c, returnedIds));

  // Claims that are unsupported: either no citation at all, or any citation that is
  // not backed by a real tool-returned _id.
  const unsupportedClaims = envelope.claims.filter(
    (cl) =>
      cl.citations.length === 0 ||
      cl.citations.some((c) => !isGrounded(c, returnedIds)),
  );

  // The set of genuinely-grounded claims (≥1 real, tool-returned citation each).
  const groundedClaims = envelope.claims
    .map((cl) => ({
      text: cl.text,
      citations: cl.citations.filter((c) => isGrounded(c, returnedIds)),
    }))
    .filter((cl) => cl.citations.length > 0);

  // DEFENSE-IN-DEPTH (CR-01 Layer 2): a NON-refused envelope that grounds NOTHING —
  // zero grounded claims AND zero grounded citations — is the degenerate
  // confident-but-unsourced shape this system exists to stop (e.g. the planner emitted
  // its plan-preamble as the final answer with zero tool calls). The vacuous
  // groundingScore=1.0 (no citations to fail) and empty unsupportedClaims/ungrounded
  // sets would otherwise let it pass the "fully grounded" branch below UNCHANGED with
  // refused:false. Force it to a refusal here, BEFORE the passthrough.
  //
  // This intentionally does NOT touch:
  //   (a) legitimately grounded answers — they have ≥1 grounded claim/citation, so this
  //       condition is false and they fall through to the passthrough unchanged;
  //   (b) existing EXPLICIT refusals (refused === true) — e.g. the NoObjectGenerated
  //       moderation decline, which carries claims:[]/citations:[] by design and must
  //       remain a passthrough refusal with the vacuous groundingScore=1.0.
  if (
    envelope.refused === false &&
    groundedCitations.length === 0 &&
    groundedClaims.length === 0
  ) {
    return EnvelopeSchema.parse({
      answer:
        'I cannot answer this question: no supporting records were retrieved to ground ' +
        'an answer in. Returning a refusal rather than a confident but unsourced answer.',
      refused: true,
      claims: [],
      citations: [],
      retrievalPath: envelope.retrievalPath,
      reasoningTrace: envelope.reasoningTrace,
      groundingScore,
    });
  }

  // Fully grounded — every claim sourced, every citation real. Trust it.
  if (ungrounded.length === 0 && unsupportedClaims.length === 0) {
    return EnvelopeSchema.parse({ ...envelope, groundingScore });
  }

  // Otherwise refuse, keeping only what was genuinely sourced (groundedClaims computed above).
  return EnvelopeSchema.parse({
    answer:
      'I cannot confidently answer this question: the records needed to support ' +
      'one or more of the claims were not found in the retrieved data. Only the ' +
      'partially-sourced facts below are grounded in real records; the rest is ' +
      'withheld to avoid a confident-but-unsupported answer.',
    refused: true,
    claims: groundedClaims,
    citations: groundedCitations,
    retrievalPath: envelope.retrievalPath,
    reasoningTrace: envelope.reasoningTrace,
    groundingScore,
  });
}

/**
 * Dual-graph reconciliation assertion (D-05, RESEARCH Q2).
 *
 * True iff the envelope's citations include ≥1 record from the 'structured' graph
 * AND ≥1 record from the 'unstructured' graph. The Q12 centerpiece (and every dual
 * question) MUST satisfy this; Q7 (the structured-only anchor) intentionally does not.
 *
 * Pure code — used both by the eval and as the planner's Q12 post-check.
 */
export function assertReconciliation(envelope: Envelope): boolean {
  const hasStructured = envelope.citations.some((c) => c.graph === 'structured');
  const hasUnstructured = envelope.citations.some((c) => c.graph === 'unstructured');
  return hasStructured && hasUnstructured;
}
