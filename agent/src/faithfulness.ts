// agent/src/faithfulness.ts
//
// RAGAS-style faithfulness judge (EVAL-01, D-02).
//
// TRUST ORDERING — CRITICAL:
//   • The EXISTING deterministic `_id`-grounding gate (`enforceGrounding` in
//     grounding.ts) is the HARD FLOOR. It is pure code; it already ran inside
//     askQuestion() before the eval calls this module.
//   • This judge is ADDITIVE and ADVISORY: it catches the gap the code gate
//     structurally cannot — "real `_id`, but record content does NOT support
//     the claim."
//   • The judge MUST NEVER be imported under web/ or anywhere on the runtime
//     answer path. It is a TEST-TIME grader only.
//
// ISOLATION DISCIPLINE (Pitfall 5 / T-06-04):
//   • Do NOT call loadEnv() here. The eval's module-scope `loadEnv()` in
//     questions.eval.test.ts owns the env. Calling it again would risk side
//     effects if the stream.ts no-double-load invariant is ever tightened.
//     This module reads `process.env.*` values that the test's loadEnv()
//     already populated.
//
// NON-DETERMINISM GUARD (Pitfall 2):
//   • temperature: 0 + fixed seed to minimize sampling variance.
//   • Explicit three-way rubric (supported/unsupported/abstain) with a strict
//     prompt: "do NOT use outside knowledge, do NOT be generous."
//   • abstain counts as NOT supported (conservative) — a hedging judge cannot
//     inflate faithfulness.
//
// JUDGE MODEL (A1):
//   • JUDGE_MODEL is an env-overridable constant (mirroring PLANNER_MODEL in
//     agent.ts) so a wrong model id is a one-line fix without touching source.
//   • Default: 'gpt-4o' — an OpenAI flagship that handles NLI well; cheaper
//     alternatives (gpt-4o-mini) are acceptable but may produce noisier verdicts
//     on legal/contract text (RESEARCH.md Alternatives Considered).

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from './db.js';
import type { Envelope, Claim } from './envelope.js';
import type { LanguageModelV3 } from '@ai-sdk/provider';

/**
 * The SINGLE place the judge model id lives. Default 'gpt-4o'; override via
 * JUDGE_MODEL env var (e.g. to swap to gpt-4o-mini for cost, or to update
 * the model id when OpenAI deprecates it). Mirrors PLANNER_MODEL in agent.ts.
 */
export const JUDGE_MODEL: string = process.env.JUDGE_MODEL ?? 'gpt-4o';

/**
 * Zod schema for the judge's per-claim verdict.
 * Three-way: supported / unsupported / abstain.
 * "abstain" is explicit so a hedging model does NOT silently count as supported
 * (anti-flaky per Pitfall 2 / RESEARCH.md).
 */
const VerdictSchema = z.object({
  verdict: z.enum(['supported', 'unsupported', 'abstain']),
  rationale: z.string(),
});

export type Verdict = 'supported' | 'unsupported' | 'abstain';

/**
 * The strict NLI rubric system prompt.
 * Constraints:
 *  - "supported" iff the claim is DIRECTLY inferable from the EVIDENCE text.
 *  - "unsupported" if the claim contradicts or is absent from the evidence.
 *  - "abstain" if the evidence is unreadable, empty, or wholly irrelevant.
 *  - Never use outside knowledge; never be generous.
 */
const JUDGE_SYSTEM_PROMPT =
  'You are a strict grounding judge. Decide ONLY whether the EVIDENCE entails the CLAIM. ' +
  'Use natural-language inference:\n' +
  '  "supported"   — the claim is DIRECTLY inferable from the evidence text only.\n' +
  '  "unsupported" — the claim contradicts the evidence, or is not present in it.\n' +
  '  "abstain"     — the evidence is unreadable, empty, or wholly irrelevant.\n' +
  'Do NOT use outside knowledge. Do NOT be generous. When in doubt, prefer "unsupported" ' +
  'over "abstain" — abstain is only for cases where the evidence cannot be evaluated at all.';

/**
 * Fetch the textual content of a cited record by its ArangoDB `_id` so the
 * judge can evaluate entailment against what the record ACTUALLY says.
 *
 * Uses a bare DOCUMENT() AQL fetch (the pattern established in db.ts).
 * Returns a JSON-serialised string of the document for maximum coverage;
 * callers may later add a per-collection content projector if the full doc
 * is too noisy for NLI (RESEARCH.md Assumption A4).
 */
async function recordText(_id: string): Promise<string> {
  const cursor = await db.query<unknown>('RETURN DOCUMENT(@id)', { id: _id });
  const doc = await cursor.next();
  if (doc == null) {
    return '(no record found for _id: ' + _id + ')';
  }
  return JSON.stringify(doc);
}

/**
 * Judge whether a single atomic claim is entailed by the content of its
 * cited records.
 *
 * @param claim          - The atomic factual claim from the envelope.
 * @param model          - The language model to use (optional; defaults to the
 *                         live `openai(JUDGE_MODEL)` provider). Pass a fake
 *                         model in unit tests to avoid live cost.
 * @param fetchEvidence  - Optional override for the evidence-fetching function.
 *                         Defaults to the live `recordText` AQL fetch. Pass a
 *                         stub in unit tests to avoid touching the DB.
 * @returns              - 'supported' | 'unsupported' | 'abstain'
 */
export async function judgeClaim(
  claim: Claim,
  model?: LanguageModelV3,
  fetchEvidence?: (id: string) => Promise<string>,
): Promise<Verdict> {
  const fetcher = fetchEvidence ?? recordText;
  // Fetch evidence from every cited record and join with a separator.
  const evidenceParts = await Promise.all(
    claim.citations.map((c) => fetcher(c._id)),
  );
  const evidence = evidenceParts.join('\n---\n');

  const effectiveModel = model ?? openai(JUDGE_MODEL);

  const { object } = await generateObject({
    model: effectiveModel,
    schema: VerdictSchema,
    temperature: 0,   // primary determinism lever (Pitfall 2)
    seed: 7,          // secondary: best-effort reproducible sampling
    system: JUDGE_SYSTEM_PROMPT,
    prompt: `CLAIM:\n${claim.text}\n\nEVIDENCE (the cited record content):\n${evidence}`,
  });

  return object.verdict;
}

/**
 * RAGAS-style faithfulness score for a full envelope.
 *
 * faithfulness = supported_claims / total_claims
 *
 * - Empty claims → 1.0 (vacuously faithful, mirrors enforceGrounding's handling)
 * - abstain counts as NOT supported (conservative; Pitfall 2 / anti-flaky)
 *
 * @param env           - The code-grounded envelope (must have already passed enforceGrounding)
 * @param model         - Optional fake model for unit tests (defaults to live gpt-4o)
 * @param fetchEvidence - Optional evidence fetcher override (defaults to live DB lookup)
 * @returns             - { score: number, unsupported: Claim[] } where unsupported
 *                        includes every claim whose verdict was NOT 'supported'
 *                        (i.e. 'unsupported' AND 'abstain').
 */
export async function faithfulness(
  env: Envelope,
  model?: LanguageModelV3,
  fetchEvidence?: (id: string) => Promise<string>,
): Promise<{ score: number; unsupported: Claim[] }> {
  if (env.claims.length === 0) {
    return { score: 1, unsupported: [] };
  }

  const verdicts = await Promise.all(
    env.claims.map(async (cl) => ({ cl, v: await judgeClaim(cl, model, fetchEvidence) })),
  );

  const supportedCount = verdicts.filter((x) => x.v === 'supported').length;
  const score = supportedCount / env.claims.length;
  const unsupported = verdicts
    .filter((x) => x.v !== 'supported')
    .map((x) => x.cl);

  return { score, unsupported };
}
