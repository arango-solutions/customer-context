---
slug: arango-serverless-flaky
status: resolved
trigger: "Intermittent (~40-60%) ArangoDB backend access error from the Vercel serverless path: a valid grounded /api/ask question refuses ~50% of the time (even sequentially) because entityLookup's arangojs call to the shared ArangoGraph cluster intermittently fails. Surfaced by the Phase 07-03 live rehearsal."
created: 2026-06-22
updated: 2026-06-22
---

# Debug Session: arango-serverless-flaky

## Symptoms

- **Expected behavior:** A valid grounded `/api/ask` question (e.g. "Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their contract terms, usage trend, and any sentiment signals.") should reliably return `refused:false` with citations, every time.
- **Actual behavior:** The same question refuses (`refused:true`, 0 citations) ~40-60% of the time, even fired SEQUENTIALLY (not just concurrently). Measured 3/5 refusals in one sequential run.
- **Error messages:** The refused envelope is honest (no fabrication — grounding is correct). `answer`: "I was unable to retrieve any data for 'Meridian Logistics' due to an issue accessing the backend service." `reasoningTrace`: ["Attempted to resolve 'Meridian Logistics' with entityLookup but encountered a backend access error.", "Cannot proceed to gather structured or unstructured data without an account_id or canonical_id."]. The TRUE underlying arangojs error is paraphrased away by the agent — must pull it from Vercel runtime logs.
- **Timeline:** Surfaced 2026-06-22 by the Phase 07-03 `scripts/rehearse.ts` live rehearsal against the prod deploy. Local eval (07-01) passes because it uses the non-stream `askQuestion` path and a local DB connection; this only reproduces on the Vercel serverless path.
- **Reproduction:** `BASE=https://customer360-demo-jade.vercel.app` reachable via header `x-vercel-protection-bypass: W0tv8apwAHAqsh2PDNDPSjnLnvqak5Tb`. POST `{"question":"Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their contract terms, usage trend, and any sentiment signals."}` to `/api/ask` several times; count `data-envelope` parts with `"refused":true`. Or run `BASE=... VERCEL_AUTOMATION_BYPASS_SECRET=W0tv8apwAHAqsh2PDNDPSjnLnvqak5Tb npx tsx scripts/rehearse.ts`.

## Key facts / leads

- Suspected cause: the db singleton in `agent/src/db.ts` (`getDbSingleton`) is module-scoped basic-auth with NO keep-alive https agent / connection config. ROADMAP UI-03 flagged "global-scope keep-alive ArangoDB client on the serverless path" as a Phase-6 carry-over risk.
- The Q7 structured-only canary (`/api/canary` via `askQuestion`) returned green earlier — so the cluster IS reachable; the failure is intermittent under repeated/concurrent load.
- Shared prod ArangoGraph cluster: `prod.demo.pilot.arango.ai`, dedicated `customer360` DB (see ARANGO_* env in Vercel Production).
- Env vars confirmed present in Vercel Production (ARANGO_ENDPOINT/USERNAME/PASSWORD/DATABASE, OPENAI_API_KEY).
- `entityLookup` is the 4th curated tool (resolves a prose name → account_id); it is the FIRST DB call in the chain, so its failure aborts the whole answer.

## Current Focus

- hypothesis: "arangojs v10 uses global fetch/undici with NO custom agent (agentOptions unset in db.ts). The default undici agent keep-alives sockets (~4s timeout) and, on a reused Vercel Fluid Compute instance idling between requests, hands back a STALE socket that the cluster/LB already half-closed → ECONNRESET / 'socket hang up' / UND_ERR_SOCKET on reuse. arangojs does NOT retry this: maxRetries default (0) only retries connection-OPEN failures (ECONNREFUSED), and per arangojs docs 'requests bound to a specific server (fetching query results) will never be retried' — so a reset during a db.query cursor fetch is unrecoverable. entityLookup (first DB hop) throws → AI SDK tool-error → model paraphrases to 'backend access error' → refusal."
- test: "Add TEMPORARY instrumentation (db.ts Database config onError callback + entityLookup try/catch console.error of err.name/err.message/err.code/cause) so the TRUE arangojs error surfaces in Vercel runtime logs, redeploy, reproduce, confirm error class is connection-level (UND_ERR_SOCKET / ECONNRESET / socket hang up) vs auth (401) vs cluster (503/429)."
- expecting: "A connection-level / undici socket error pattern that confirms the keep-alive-agent + bounded-retry fix in db.ts."
- next_action: "CHECKPOINT (human-action) returned to orchestrator: deploy the TEMP instrumentation, reproduce 8-10x, capture `[ARANGO-INSTRUMENT]` lines from `vercel logs`, paste them back. Instrumentation is written + builds clean (npm run build -w agent → exit 0). On resume: read the captured error class, confirm/deny connection-level hypothesis, then apply the real fix (agentOptions keep-alive + bounded retry) and REMOVE the TEMP instrumentation."

## Reasoning checkpoint (pre-instrumentation)

- known_pattern_candidate: none (knowledge base empty)
- The fix is NOT yet confirmed — current evidence (logs show only 200s, no raw error) is INSUFFICIENT to fix blind. The operational facts mandate pulling the TRUE error first. Proceeding to instrument, not to fix.

## Evidence

- timestamp: 2026-06-22 — Sequential reproduction: same grounded question, 5 runs → refused:false, true, true, true, false (3/5 refused). NOT a concurrency-only artifact.
- timestamp: 2026-06-22 — Refused envelope reasoningTrace names entityLookup + "backend access error"; citations=0, claims=0. Agent refuses honestly (grounding correct; no fabrication).
- timestamp: 2026-06-22 — Q7 canary (askQuestion, structured-only) returned 200 green ~38.7s earlier → cluster reachable, failure is intermittent.
- timestamp: 2026-06-22 — arangojs version is 10.3.1 (node_modules). v10 uses the global fetch API; agentOptions (undici) is unset in db.ts → default undici global-dispatcher agent governs socket keep-alive/reuse. This is the connection-lifecycle surface for the intermittency.
- timestamp: 2026-06-22 — arangojs Config (configuration.d.ts): poolSize default = 3 (extra parallel requests are QUEUED); agentOptions, if set, switches arangojs to a dedicated undici Agent (controllable keep-alive/pool); onError(err) and afterResponse(err,res) callbacks exist → instrumentation seam that needs NO change to the tool.
- timestamp: 2026-06-22 — arangojs maxRetries semantics (connection.d.ts L226-240): default 0 retries ONLY connection-OPEN failures (ECONNREFUSED), bounded by #known servers (single URL ⇒ ~1). CRITICAL: 'Requests bound to a specific server (e.g. fetching query results) will never be retried automatically.' So a mid-flight reset on a stale keep-alive socket during a cursor fetch is NEVER retried by the driver — fully consistent with the intermittent ~50% refusal.
- timestamp: 2026-06-22 — `vercel logs customer360-demo-jade.vercel.app` shows ONLY `POST /api/ask 200 (no message)` for all recent requests. The failing path returns HTTP 200 (SSE envelope refused:true); the raw arangojs error is swallowed into the AI SDK tool-error and paraphrased by the model. NO raw error is logged anywhere today → instrumentation + redeploy is REQUIRED to capture the true error.
- timestamp: 2026-06-22 — web route imports `customer360-agent/stream` (the compiled agent dist), per web/next.config.ts (transpilePackages intentionally omitted; agent ships dist via `npm run build -w agent`). So instrumentation in agent/src lands in the deployed bundle only after a dist rebuild + redeploy.
- timestamp: 2026-06-22 — TEMP instrumentation ADDED (clearly marked `[ARANGO-INSTRUMENT]`, revertible): db.ts Database config `onError` callback + entityLookup query try/catch — both console.error name/message/code/errno/cause.code/cause.message of the raw arangojs error. `npm run build -w agent` → exit 0 (compiles clean). NOT a fix; diagnostic only.
- timestamp: 2026-06-22 — Side note reinforcing the connection-model finding: web/app/api/ask/route.ts header comment claims "arangojs uses node:https" — STALE for arangojs 10 (v10 uses the fetch/undici API). The actual socket lifecycle is governed by undici's default global dispatcher, not node:https agents.

## Eliminated

- hypothesis: "every refusal is a connection-level backend error" — ELIMINATED. Local reproduction (1/18 runs) captured a refusal where entityLookup SUCCEEDED (trace[0]: "Resolved 'Northwind Analytics' to its canonical_id and account_id") and NO `[arango]` onError/retry log fired — i.e. a refusal that is NOT a connection error. So there are TWO distinct refusal sources, not one.

## Resolution

**Status:** resolved (dominant failure mitigated + verified; rare residual documented).

**Root cause (dominant, ~50% serverless):** The 07-03 live rehearsal caught a valid grounded `/api/ask` question refusing ~50% of the time on the Vercel serverless path, traced to `entityLookup` hitting a "backend access error" (the first DB hop — its failure aborts the whole answer). arangojs 10 drives over fetch/undici with no custom agent; the singleton set no connection options. arangojs documents that requests bound to a specific server (cursor-result fetches) are NEVER retried, so a reset on a reused, server-half-closed keep-alive socket (the Fluid Compute failure mode) — and/or pool starvation at the default `poolSize:3` when one shared singleton serves several concurrent questions × ~4 queries each — surfaced as an unrecoverable throw → refusal. NOTE: the ~50% rate did NOT reproduce after instrumentation was deployed (22/22 clean) nor locally (1/18), so a transient bad cluster window likely contributed. The true error CLASS was never captured (it stopped reproducing), so the fix is best-effort hardening matching the symptom + ROADMAP UI-03, not a fix confirmed against a captured error.

**Fix (commit 6a8862b):** in `agent/src/db.ts` —
1. `withDbRetry()`: bounded retry (3 attempts, ~120ms backoff) on transient connection errors (`ECONNRESET` / `socket hang up` / `UND_ERR_SOCKET` / `fetch failed` / `ETIMEDOUT` / `EPIPE` / ...), wired into the shared `db` proxy's `query()` so every specialist read survives a transient reset (reads are idempotent; non-transient errors throw immediately).
2. `poolSize: 10` (was default 3) — concurrency headroom for the demo/rehearsal path.
3. Slim PERMANENT `onError` one-line logger (no secret/body) so any recurrence is attributable to its true error class in Vercel runtime logs.
Removed the TEMP `[ARANGO-INSTRUMENT]` diagnostics from `db.ts` + `entityLookup.ts`.

**Verification:** redeployed fixed build → 07-03 rehearsal 7/7 green (4/4 concurrent grounded cited + 3/3 adversarial refused), and a 10× sequential refusal-rate check on the previously-flaky question = 0/10 refused. Post-fix serverless total: 14/14 grounded calls clean. Agent unit suite 79/80 (the 1 failure is the rare residual below, a live-eval flake — not a unit regression).

**Residual (separate, rare ~5%, NOT fixed — accepted for v1):** a stochastic planner/grounding refusal where entityLookup SUCCEEDS but the answer still refuses, with NO connection error. This is the SAFE failure mode (honest refusal, zero fabrication — the grounding gate working as designed) and is consistent with LLM variance (why 07-01's eval uses a faithfulness FLOOR + majority vote). Mitigation if it ever bites a demo: re-ask. A bounded planner-level retry could reduce it further but is deferred (out of 07-03 scope; not infra).

**files_changed:** agent/src/db.ts, agent/src/tools/entityLookup.ts

**Follow-up:** the stale comment in `web/app/api/ask/route.ts` ("arangojs uses node:https") is inaccurate for arangojs 10 (fetch/undici) — cosmetic, left as-is.
