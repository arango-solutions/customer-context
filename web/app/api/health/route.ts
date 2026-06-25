// Wave-0 build-smoke route: proves the agent imports cleanly across the workspace
// boundary (transpilePackages raw-TS resolution, RESEARCH Pitfall 4 / A2).
//
// Node runtime — the agent module is server-only (arangojs uses node:https; the
// real /api/ask route in Plan 03 makes DB + OpenAI calls). NOT edge.
//
// This route does NOT call loadEnv() and reads no secrets (threat T-06-01). It only
// exercises a pure value export (assertReconciliation) so `next build` must resolve
// and bundle the agent's transpiled source.

import { assertReconciliation } from 'customer360-agent';

export const runtime = 'nodejs';

export function GET() {
  // assertReconciliation is pure; calling it on an empty-citation shape proves the
  // agent value export resolved through transpilePackages at build time.
  const ok = assertReconciliation({
    answer: '',
    refused: false,
    claims: [],
    citations: [],
    retrievalPath: [],
    reasoningTrace: [],
    groundingScore: 1,
  });
  return Response.json({ agentImport: 'ok', reconciliation: ok });
}
