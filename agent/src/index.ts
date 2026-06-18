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
import type { Envelope } from './envelope.js';

export type { Envelope } from './envelope.js';
export { assertReconciliation } from './grounding.js';
export { PLANNER_MODEL } from './agent.js';

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
  return enforceGrounding(envelope, returnedIds);
}
