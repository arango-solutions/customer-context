// agent/test/questions.eval.test.ts
//
// The 6-locked-question integration eval (AGENT-01/02/05/07). It drives the PUBLIC
// askQuestion() entrypoint headlessly against the live OpenAI planner + live ArangoDB
// cluster, and proves the envelope CONTRACT for each locked question:
//   • Q7  — structured-only anchor: non-refusal, every citation graph === 'structured'.
//   • Q2/Q5/Q8/Q9 — dual: non-refusal, assertReconciliation === true (≥1 structured AND
//     ≥1 unstructured _id).
//   • Q12 — centerpiece: non-refusal, assertReconciliation === true, the answer NAMES the
//     usage-green/sentiment-red contradiction.
//   • refusal — out-of-scope question: refused === true, no fabricated _id, partial only.
// Every test asserts EnvelopeSchema.safeParse(envelope).success === true.
//
// IMPORTANT (VALIDATION Manual-Only note): this eval proves the envelope is WELL-FORMED,
// dual-graph where required, and refuses when ungrounded. It does NOT grade faithfulness
// or answer coherence — that graded eval is Phase 7. This is the phase gate, not the
// faithfulness harness.
//
// Guarded by hasLiveDb() AND hasOpenAi() (D-06 — v1 needs OPENAI_API_KEY, not an Anthropic
// key); skips cleanly (no failure) when env is absent so the unit suite still runs in CI.

import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/db.js';

// Load .env (dotenv override) at module scope BEFORE the skip-guard is evaluated, so the
// guard sees the real env (the false-green skip lesson from 05-01).
loadEnv();

import { askQuestion, assertReconciliation } from '../src/index.js';
import { EnvelopeSchema, type Envelope } from '../src/envelope.js';
import { hasLiveDb, hasOpenAi } from './fixtures.js';

const CAN_RUN = hasLiveDb() && hasOpenAi();
const d = CAN_RUN ? describe : describe.skip;

// Live model + dual-graph DB round trips: allow a generous timeout per question.
const TIMEOUT = 180_000;

/** Shared contract assertions every locked question must satisfy. */
function assertWellFormed(env: Envelope): void {
  expect(EnvelopeSchema.safeParse(env).success).toBe(true);
}

/** A real ArangoDB _id is "Collection/key" — used to prove no fabricated _id slips through. */
function looksLikeArangoId(id: string): boolean {
  return /^[A-Za-z0-9_]+\/.+/.test(id);
}

d('6 locked questions — envelope contract (AGENT-01/02/05/07)', () => {
  it(
    'Q7 — product-ladder adoption + ROI [structured-only anchor]',
    async () => {
      const env = await askQuestion(
        'For Northwind Analytics, show how they have adopted ArangoDB across the product ' +
          'ladder (Community to Enterprise to ArangoGraph) and the ROI we have delivered. ' +
          'Answer purely from the structured graph — their usage telemetry, contracts, and ' +
          'expansion opportunities; do not use any unstructured documents for this one.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      // The intentional structured-only anchor: every citation is from the structured graph.
      expect(env.citations.length).toBeGreaterThan(0);
      for (const c of env.citations) expect(c.graph).toBe('structured');
      // Every claim carries at least one citation.
      for (const cl of env.claims) expect(cl.citations.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'Q2 — renewal risk + WHY [dual-graph]',
    async () => {
      const env = await askQuestion(
        'Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their ' +
          'contract renewal date and usage trend together with the CSM Slack notes, renewal ' +
          'emails, and QBR documents that explain any risk.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      expect(assertReconciliation(env)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Q12 — usage green / sentiment red [dual-graph CENTERPIECE]',
    async () => {
      const env = await askQuestion(
        'Meridian Logistics looks green on every usage metric and their NPS score is fine — ' +
          'but are they ACTUALLY happy? Compare the structured usage/NPS-score signal against ' +
          'the sentiment in their Slack escalations, QBR notes, exec emails, and NPS verbatim ' +
          'comments, and tell me explicitly if there is a contradiction.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      // AGENT-05: cites ≥1 structured AND ≥1 unstructured _id.
      expect(assertReconciliation(env)).toBe(true);
      // The answer must NAME the contradiction (green usage vs red sentiment/risk).
      expect(env.answer).toMatch(/green|healthy|usage|metric/i);
      expect(env.answer).toMatch(/red|risk|sentiment|dissatisf|unhappy|concern|contradict/i);
    },
    TIMEOUT,
  );

  it(
    'Q9 — is the champion still engaged? [dual-graph]',
    async () => {
      const env = await askQuestion(
        'Is our champion at Meridian Logistics still engaged? Use the CRM contact record and ' +
          'renewal context together with their recent emails, Slack notes, and meeting-notes ' +
          'attendance to judge whether they have gone quiet.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      expect(assertReconciliation(env)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Q5 — ready for ArangoGraph / GenAI upsell? [dual-graph]',
    async () => {
      const env = await askQuestion(
        'Is Northwind Analytics ready for an ArangoGraph or GenAI upsell? Use their edition, ' +
          'product whitespace, and usage thresholds from the structured graph together with ' +
          'any documented trigger (scale pain, ops burden, or RAG intent) in their Slack notes, ' +
          'success plan, and exec emails.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      expect(assertReconciliation(env)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'Q8 — what did we promise, and did we deliver? [dual-graph]',
    async () => {
      const env = await askQuestion(
        'What did we promise Meridian Logistics, and did we deliver? Reconcile the contract ' +
          'SLA and product scope and the usage telemetry that shows delivery against any ' +
          'promise made in emails, Slack, or meeting notes — including a commitment that was ' +
          'never logged in the CRM.',
      );
      assertWellFormed(env);
      expect(env.refused).toBe(false);
      expect(assertReconciliation(env)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'refusal — out-of-scope question returns a code-grounded refusal [AGENT-07]',
    async () => {
      const env = await askQuestion(
        "What is the CEO of Meridian Logistics' personal home address and mobile phone number?",
      );
      assertWellFormed(env);
      // No supporting record exists → the code grounding gate must refuse.
      expect(env.refused).toBe(true);
      // No fabricated _id anywhere: every surviving citation _id is a real ArangoDB id shape.
      const allIds = [
        ...env.citations.map((c) => c._id),
        ...env.claims.flatMap((cl) => cl.citations.map((c) => c._id)),
      ];
      for (const id of allIds) expect(looksLikeArangoId(id)).toBe(true);
    },
    TIMEOUT,
  );
});
