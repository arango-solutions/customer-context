// web/app/api/simulate-update/route.ts
//
// CDC-02 live "Simulate update" trigger (Phase 12 Plan 02 / D-08).
//
// The ONLY new attack surface this phase. It is NOT a generic write primitive:
// it accepts NO client-supplied module/account/doc params and fires ONE fixed,
// pre-staged escalation scenario (Plan 01's add_lane.py). Mirrors /api/ask
// discipline (Node runtime, Zod-validate, generic-500 no-leak).
//
// Runtime / threat posture:
//   - `runtime = 'nodejs'` — the kickoff spawns a child process (node:child_process);
//     Edge has no process spawn (and arangojs/platform calls need node anyway).
//   - `maxDuration = 60` — but the build is ~4-6 min, so the route MUST NOT await
//     it (threat T-12-05 / RESEARCH Pitfall 5: a synchronous route → 504 → a
//     stalled live moment). It fires-and-returns 202; the client polls
//     /api/simulate-update/status for completion.
//   - Body is `z.object({}).strict()` — an empty object only; ANY client field is
//     rejected 400 (threat T-12-02: no client-controlled scenario).
//   - try/catch → generic 500 'internal error', NEVER echoing error/stack/secret
//     (threat T-12-06, mirrors /api/ask).

import { z } from 'zod';
import { kickOffAddLane } from '@/lib/trigger-add-lane';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Empty, strict body: the scenario is fixed server-side (Security V4/V5 / T-12-02).
// `.strict()` makes any extra field a parse error → generic 400.
const SimulateBodySchema = z.object({}).strict();

export async function POST(req: Request): Promise<Response> {
  // 1) Validate the (optional) body. An empty/absent body is fine; any JSON with
  //    extra fields, or malformed JSON, collapses to a single generic 400 — no
  //    detail that could aid a probe and no client-supplied scenario gets through.
  try {
    const raw = await req.text();
    if (raw.trim().length > 0) {
      SimulateBodySchema.parse(JSON.parse(raw));
    }
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // 2) Fire the FIXED scenario out-of-band and return immediately. Do NOT await
  //    the build (Pitfall 5). Any unexpected throw → generic 500, never the
  //    error/stack/secret in the body.
  try {
    kickOffAddLane();
    return new Response(null, { status: 202 });
  } catch {
    return new Response('internal error', { status: 500 });
  }
}
