// Workspace import proof + the single source of the agent contract for the web app.
//
// The web app NEVER re-defines the Envelope/Citation shapes (RESEARCH anti-pattern):
// it re-exports them from the `customer360-agent` workspace package. This import is
// also what the Task-1 `next build` smoke exercises — it forces Next/Turbopack to
// resolve the agent's raw NodeNext `.js`-extension TypeScript across the workspace
// boundary via `transpilePackages` (RESEARCH Pitfall 4 / Assumption A2).
//
// IMPORTANT: do NOT call the agent's dotenv `loadEnv()` at module scope here — Next
// owns its own env on Vercel (RESEARCH Pitfall 3 / threat T-06-01). This module only
// re-exports the contract type + the pure grounding helpers; no env, no DB handle.

export type { Envelope } from 'customer360-agent';
export { assertReconciliation } from 'customer360-agent';
