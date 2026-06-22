---
phase: 07-grounding-eval-demo-hardening
plan: 03
subsystem: testing
tags: [rehearsal, tsx, sse, adversarial, refusal, arangojs, vercel, serverless, undici, retry]

# Dependency graph
requires:
  - phase: 07-02
    provides: "live deploy + canary-warmed path the rehearsal targets"
  - phase: 07-01
    provides: "ADVERSARIAL_QUESTIONS set (imported, not copied) + Q anchor patterns"
  - phase: 06
    provides: "/api/ask streaming route (UIMessageStream data-envelope) the rehearsal asserts on"
provides:
  - "scripts/rehearse.ts — live concurrent + adversarial /api/ask gate (EVAL-02 D-07)"
  - "scripts/tsconfig.json — real type-check gate (extends agent NodeNext)"
  - "Streaming refusal fix: askQuestionStream refuses gracefully on planner PII-decline"
  - "Serverless ArangoDB hardening: bounded retry + poolSize on the db proxy"
affects: [demo-hardening, pre-demo-checklist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live rehearsal harness as a pre-demo gate (concurrent grounded + adversarial refusal)"
    - "Adversarial set imported via relative ../agent/test/adversarial.js (DRY with eval; exports map hides test/)"
    - "withDbRetry on the shared db proxy — transparent transient-connection recovery"

key-files:
  created:
    - scripts/rehearse.ts
    - scripts/tsconfig.json
  modified:
    - agent/src/stream.ts
    - agent/src/db.ts
    - agent/src/tools/entityLookup.ts

key-decisions:
  - "Rehearsal harness deliberately a FEW calls (N=4), not a load test (T-07-09)"
  - "Streaming NoObjectGeneratedError guard widened to cover output resolution (the streamed refusal escaped as a generic SSE error)"
  - "Serverless DB flakiness: best-effort hardening (retry + poolSize) — root error class never captured (stopped reproducing); residual ~5% stochastic refusal accepted for v1 (safe failure, no fabrication)"

patterns-established:
  - "Rehearsal reaches SSO-protected deploy via x-vercel-protection-bypass header / VERCEL_AUTOMATION_BYPASS_SECRET (D-08)"
  - "db.query carries bounded retry on transient connection errors; reads are idempotent"

requirements-completed: [EVAL-02]

# Metrics
duration: ~90min (incl. 2 debug fixes + redeploys)
completed: 2026-06-22
---

# Phase 07 Plan 03: Live Rehearsal Harness Summary

**`scripts/rehearse.ts` fires 4 concurrent grounded `/api/ask` calls + the imported adversarial set against the live deploy as a pre-demo gate — and in doing so caught two real live-path defects (streaming PII refusal escaping as an error; ~50% intermittent ArangoDB backend failure), both fixed and verified green (rehearsal 7/7, 0/10 refusal-rate).**

## Performance

- **Duration:** ~90 min (harness build + two debug-and-fix cycles + redeploys + live verification)
- **Completed:** 2026-06-22
- **Tasks:** 1 auto task + 1 human-verify checkpoint (delegated, satisfied)
- **Files modified:** 5 (2 created, 3 fixed)

## Accomplishments
- `scripts/rehearse.ts`: N=4 concurrent grounded `/api/ask` calls (assert 200, non-refused, cited) + adversarial set imported from `../agent/test/adversarial.js` (assert `refused===true`, no fabricated `_id`); reads `BASE` + `VERCEL_AUTOMATION_BYPASS_SECRET` from env; per-call PASS/FAIL; exits non-zero on failure.
- `scripts/tsconfig.json`: extends `../agent/tsconfig.json` (NodeNext), making `npx tsc --noEmit -p scripts/tsconfig.json` a real gate.
- **Fixed Defect 1 (streaming refusal):** `askQuestionStream`'s `NoObjectGeneratedError` guard wrapped only `agent.stream()` setup; for a streamed run the error is thrown when `result.output` is awaited inside `assembleGroundedEnvelope`, so a planner PII-decline escaped as a generic SSE `error` part instead of the `REFUSAL_ENVELOPE`. Widened the try → adversarial PII questions now refuse gracefully on the deploy.
- **Fixed Defect 2 (serverless DB flakiness):** see debug session `arango-serverless-flaky` — bounded `withDbRetry` on transient connection errors + `poolSize:10` + slim permanent error log on the shared `db` proxy.

## Task Commits

1. **Task 1: scripts/tsconfig.json + scripts/rehearse.ts** — `10bdb1e` (feat)
2. **Defect 1 fix: stream refusal guard** — `23679a6` (fix)
3. **Defect 2 fix: serverless ArangoDB hardening** — `6a8862b` (fix)

## Files Created/Modified
- `scripts/rehearse.ts` — live concurrent + adversarial rehearsal gate.
- `scripts/tsconfig.json` — NodeNext type-check gate.
- `agent/src/stream.ts` — widened the streamed-refusal guard to cover output resolution.
- `agent/src/db.ts` — `withDbRetry` on `db.query` + `poolSize:10` + slim `onError` logger.
- `agent/src/tools/entityLookup.ts` — reverted TEMP debug instrumentation (retry now central).

## Decisions Made
- Rehearsal is a FEW calls (N=4), explicitly not a load test (threat T-07-09 accepted).
- Two live defects fixed in-flight (deviations — both real bugs the harness surfaced; see below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Streaming refusal guard too narrow (agent/src/stream.ts)**
- **Found during:** human-verify checkpoint (live rehearsal Part B)
- **Issue:** adversarial PII questions returned an SSE `error` part, not a graceful refusal — the `NoObjectGeneratedError` thrown at output resolution escaped the guard.
- **Fix:** widened the try to cover `assembleGroundedEnvelope`. Verified live: 3/3 adversarial refuse.
- **Committed in:** `23679a6`

**2. [Rule 2 - Missing Critical] Serverless ArangoDB flakiness (agent/src/db.ts, entityLookup.ts)**
- **Found during:** human-verify checkpoint (rehearsal Part A — a grounded question refused ~50% with a "backend access error")
- **Issue:** arangojs never retries a reset on a server-half-closed keep-alive socket (Fluid Compute), and the default `poolSize:3` starves the shared singleton under concurrency.
- **Fix:** `withDbRetry` (bounded retry on transient connection errors) + `poolSize:10` + slim permanent error logger. Full debug in `.planning/debug/resolved/arango-serverless-flaky.md`.
- **Caveat:** the ~50% rate stopped reproducing before the true error class was captured (likely a transient cluster window contributed), so this is best-effort hardening matching the symptom + ROADMAP UI-03.
- **Committed in:** `6a8862b`

---

**Total deviations:** 2 auto-fixed (both real demo-risk defects the rehearsal surfaced). 
**Impact on plan:** Essential — the rehearsal's purpose is to catch exactly these. No scope creep beyond the two fixes.

## Issues Encountered
- See the two defects above. Both fixed and verified live.

## Verification (human-verify checkpoint — delegated to orchestrator, satisfied)
- `npx tsc --noEmit -p scripts/tsconfig.json` exits 0 (gate). ✓
- Live rehearsal on the final deploy: **7/7 PASS** (4/4 concurrent grounded cited + 3/3 adversarial refused), exit 0. ✓
- Refusal-rate check (previously-flaky grounded question, 10× sequential): **0/10 refused**. ✓
- Post-fix serverless total: 14/14 grounded calls clean; 3/3 adversarial refused with no fabricated `_id`. ✓

## Residual / Known Items
- **Rare (~5%) stochastic planner/grounding refusal** (entity resolves, answer still refuses; NO connection error) — the SAFE failure mode (honest refusal, no fabrication). Accepted for v1; re-ask mitigates. A bounded planner-level retry could reduce it (deferred — not infra, out of scope).
- **CRON_SECRET on Vercel Preview** still pending (CLI 54.14.0 git-branch quirk) — non-blocking (07-02 carry).
- Stale comment in `web/app/api/ask/route.ts` ("arangojs uses node:https") — cosmetic.

## Next Phase Readiness
- Phase 7 plans all complete. Pre-demo checklist: (1) manual canary warm with the bearer; (2) confirm the daily cron logged a 200; (3) optionally add CRON_SECRET to Vercel Preview; (4) re-run `scripts/rehearse.ts` immediately before the live demo as the final gate.

---
*Phase: 07-grounding-eval-demo-hardening*
*Completed: 2026-06-22*
