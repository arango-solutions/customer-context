// web/app/api/ask/route.ts
//
// The single public HTTP surface of the demo: a Next.js 15 App Router Route Handler
// that takes an untrusted free-form question, Zod-validates + length-caps it, and
// streams the Phase-5 agent's grounded answer back over SSE.
//
// CARDINAL RULE (CLAUDE.md): this route adds NO answer-synthesis surface. It returns
// `askQuestionStream(question)`'s Response DIRECTLY — that Response is already a
// `createUIMessageStreamResponse` whose persistent `data-envelope` part is the OUTPUT
// of the agent's terminal grounding gate (Plan 02). The route is pure connective tissue.
//
// Runtime / threat posture:
//   - `runtime = 'nodejs'` — arangojs uses `node:https` and the agent makes OpenAI
//     calls; Edge would break both (RESEARCH Anti-Patterns / threat T-06-07).
//   - `maxDuration = 60` — answers are 14–25s typical; 60s gives headroom under the
//     deploy's default Fluid cap (≥300s) without hanging to a 504 (RESEARCH A1).
//   - Zod-validate + `.max(2000)` length-cap the `question` (Security Domain V5 /
//     threat T-06-05): empty / non-string / oversized → 400 before the agent runs.
//   - try/catch → generic 500, NEVER echoing the error/stack/secret to the client
//     (threat T-06-07: stack-trace leakage).
//   - Does NOT invoke the agent's dotenv env-loader — Next/Vercel inject env; the db
//     singleton reads `process.env` server-side (RESEARCH Pitfall 3 / threat T-06-04).

import { z } from 'zod';
import { askQuestionStream } from 'customer360-agent/stream';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Trimmed, non-empty, length-capped free-form question (Security V5 / T-06-05).
// SEC-02: `adversarial` is a PRESENTATION-ONLY flag the UI sets in "try-to-break-it"
// mode. It is accepted here so a flag-carrying body does not 400, but it is NEVER
// forwarded to the agent — the agent path is mode-agnostic and defense (plan 13-01 +
// enforceGrounding) is unconditional (threat T-13-14: "defense off" footgun avoided).
const AskBodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
  adversarial: z.boolean().optional().default(false),
});

export async function POST(req: Request): Promise<Response> {
  // 1) Parse + Zod-validate the untrusted body. A malformed JSON body, a missing /
  //    empty / non-string / oversized `question` all collapse to a single generic
  //    400 — no detail that could aid a probe.
  let question: string;
  try {
    const raw = await req.json();
    question = AskBodySchema.parse(raw).question;
  } catch {
    return new Response('question required', { status: 400 });
  }

  // 2) Stream the grounded agent output. Any unexpected throw constructing the stream
  //    becomes a generic 500 — never the error message / stack / secret in the body.
  try {
    return askQuestionStream(question);
  } catch {
    return new Response('internal error', { status: 500 });
  }
}
