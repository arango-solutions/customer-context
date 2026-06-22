// web/app/api/canary/route.ts
//
// EVAL-02 deep health/canary route (D-05): CRON_SECRET-gated, Node runtime.
// Exercises real ArangoDB connectivity + one end-to-end Q7 structured-only probe
// via the shared Q7_ANCHOR_PROMPT constant. Returns a clear green/red read.
//
// Design constraints:
//   - CRON_SECRET bearer guard (T-07-04): Vercel Cron auto-injects the bearer;
//     unauthenticated requests → bare 401 (no body, no detail). Cron bypasses SSO
//     via its internal origin (Research Pitfall 4), so we gate the route ourselves.
//   - Node runtime required — arangojs uses node:https; Edge breaks it (same as
//     /api/ask, Research Anti-Patterns).
//   - Q7_ANCHOR_PROMPT imported from the customer360-agent package (NO inline literal)
//     — single source of truth shared with the eval (Pitfall 6 / plan must_haves).
//     Resolves through the package exports map → agent/dist/index.d.ts (rebuilt by 07-01).
//   - On any throw: generic {status:'red', ms} 503 — NEVER serialize error/stack/secret
//     (T-07-05 / T-07-06, mirrors T-06-07 posture of /api/ask).
//   - Does NOT call loadEnv() — Vercel injects env; askQuestion() handles it internally.

import { askQuestion, Q7_ANCHOR_PROMPT } from 'customer360-agent';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  // CRON_SECRET guard — bare 401 on missing or wrong bearer (T-07-04 cost-DoS mitigation).
  // Vercel Cron auto-injects Authorization: Bearer $CRON_SECRET; no bypass token needed.
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const t0 = Date.now();
  try {
    // Q7 structured-only anchor: fastest, cheapest, most deterministic of the six;
    // still proves DB + planner + grounding end-to-end. The arangojs singleton inside
    // askQuestion warms with the live DB round-trip (Pitfall 3 / D-06 pre-warm).
    const env = await askQuestion(Q7_ANCHOR_PROMPT);

    // Green = agent did not refuse AND returned at least one citation.
    const ok = env.refused === false && env.citations.length > 0;

    return Response.json(
      { status: ok ? 'green' : 'red', agent: ok, ms: Date.now() - t0 },
      { status: ok ? 200 : 503 }
    );
  } catch {
    // Generic red — never echo the thrown error, stack, or any secret (T-07-05).
    return Response.json({ status: 'red', ms: Date.now() - t0 }, { status: 503 });
  }
}
