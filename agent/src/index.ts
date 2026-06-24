// agent/src/index.ts
//
// THE public entrypoint (D-01) — askQuestion(question) is what Phases 6 (Next.js
// route) and 7 (eval harness) import. No HTTP route lives here; this is a standalone
// module + (separately) a thin CLI harness (cli.ts).
//
// Flow: loadEnv() (dotenv override so OPENAI_API_KEY/ARANGO_* come from .env and never
// a stale shell value — the D-06 gotcha) → runAgent() (the OpenAI ToolLoopAgent that
// composes the three specialists and synthesizes the envelope) → enforceGrounding()
// (the pure code gate that turns any ungrounded/hallucinated-citation envelope into a
// structured refusal). Every envelope returned from here is code-grounded.

import { loadEnv } from './db.js';
import { runAgent } from './agent.js';
import { enforceGrounding } from './grounding.js';
import { attachNodeLabels } from './nodeLabels.js';
import type { Envelope } from './envelope.js';

export type { Envelope, Citation, Claim, GraphKind } from './envelope.js';
export {
  EnvelopeSchema,
  CitationSchema,
  ClaimSchema,
  RetrievalPathFragment,
  GraphEnum,
} from './envelope.js';
export { assertReconciliation } from './grounding.js';
export { PLANNER_MODEL } from './agent.js';

/**
 * The Q7 structured-only anchor prompt — the SINGLE source of truth for this
 * fixed question. Consumed by BOTH:
 *   (a) the Phase-7 eval (agent/test/questions.eval.test.ts) — drives the Q7 it()
 *   (b) the Phase-7 web canary (web/app/api/canary/route.ts, plan 07-02) — uses
 *       this as the canned end-to-end probe question (cheapest / fastest / most
 *       deterministic of the six; structured-only means no hybrid embedding call).
 *
 * This constant ships through the `customer360-agent` package `.` exports map
 * (agent/dist/index.d.ts + agent/dist/index.js) so the web canary's bare-package
 * import resolves it. Do NOT inline this literal in any other file; import from here.
 */
export const Q7_ANCHOR_PROMPT =
  'For Northwind Analytics, show how they have adopted ArangoDB across the product ' +
  'ladder (Community to Enterprise to ArangoGraph) and the ROI we have delivered. ' +
  'Answer purely from the structured graph — their usage telemetry, contracts, and ' +
  'expansion opportunities; do not use any unstructured documents for this one.';

/**
 * Q15 anchor prompt for Helio Retail (Account C — structured-only contraction indicator).
 *
 * Mirrors Q7's role for Account A: a non-refusal, all-citations-structured anchor. Helio's
 * contraction (downgrade ladder + declining usage telemetry + slipped renewal opportunity)
 * is fully sourceable from the structured graph alone. Single source of truth — same
 * discipline as Q7_ANCHOR_PROMPT; do NOT inline this literal elsewhere, import from here.
 */
export const QC_ANCHOR_PROMPT =
  'For Helio Retail, summarize their product-tier history, current contract status, and ' +
  'usage trend over time. Answer purely from the structured graph — their contracts, ' +
  'usage telemetry, and CRM opportunities; do not use any unstructured documents for this one.';

/**
 * Answer a free-form question, returning a code-grounded, Zod-shaped envelope.
 *
 * The grounding gate runs over (envelope, returnedIds) where returnedIds is the set of
 * _ids the curated tools actually returned during the loop — so a hallucinated citation
 * can never survive into the returned envelope (it becomes a structured refusal instead).
 */
export async function askQuestion(question: string): Promise<Envelope> {
  loadEnv(); // dotenv override — .env wins over any stale shell value (D-06)
  const { envelope, returnedIds } = await runAgent(question);
  // enforceGrounding is the terminal gate; attachNodeLabels is display-only enrichment
  // applied AFTER it (never changes grounding). Mirrored in stream.ts for the SSE path.
  return attachNodeLabels(enforceGrounding(envelope, returnedIds));
}
