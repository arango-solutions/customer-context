---
phase: 07-grounding-eval-demo-hardening
plan: 02
subsystem: infra
tags: [vercel, cron, canary, nextjs, route-handler, arangojs, dotenv, health-check, openai]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Q7_ANCHOR_PROMPT exported from customer360-agent + rebuilt agent dist (the shared probe constant the canary imports)"
  - phase: 05
    provides: "askQuestion() public entrypoint + grounded Envelope contract the canary asserts on"
  - phase: 06
    provides: "web/ Next.js app + /api/ask streaming route (the threat posture the canary mirrors)"
provides:
  - "CRON_SECRET-gated /api/canary route: real ArangoDB round-trip + one end-to-end Q7 probe, green/red read"
  - "Vercel Cron entry (daily, Hobby cap) warming the function + arangojs singleton"
  - "Serverless-safe loadEnv() (no-ops when dotenv/.env absent) — fixes askQuestion() on Vercel"
affects: [07-03, demo-hardening, pre-warm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deep canary distinct from secret-free /api/health: gated, env-reading, agent end-to-end"
    - "Shared Q7_ANCHOR_PROMPT constant (no literal copy) drives both the eval and the canary"
    - "loadEnv() try/catch no-op for serverless: process.env authoritative on Vercel, .env only local"

key-files:
  created:
    - web/app/api/canary/route.ts
  modified:
    - web/vercel.json
    - agent/src/db.ts

key-decisions:
  - "Cron cadence = daily (0 0 * * *) — Hobby plan caps frequency; per D-06 the MANUAL pre-warm becomes the REQUIRED pre-demo step and the cron is supplementary"
  - "loadEnv() hardened to no-op when dotenv/.env unavailable (deviation in agent/src/db.ts) — required to make askQuestion() run on Vercel"
  - "CRON_SECRET added to Vercel Production + Development via CLI; Preview deferred (CLI 54.14.0 git-branch quirk) — non-blocking"

patterns-established:
  - "Canary green = env.refused === false && env.citations.length > 0; any throw → generic {status:'red', ms} 503 with NO error/stack/secret"
  - "External curl verification of SSO-protected routes via x-vercel-protection-bypass header"

requirements-completed: [EVAL-02]

# Metrics
duration: ~40min
completed: 2026-06-22
---

# Phase 07 Plan 02: Canary + Cron Pre-warm Summary

**CRON_SECRET-gated `/api/canary` that runs a real ArangoDB round-trip + one end-to-end Q7 probe via the shared `Q7_ANCHOR_PROMPT`, returning green/red; plus a daily Vercel Cron pre-warm — verified live (200 green) after hardening `loadEnv()` for the serverless bundle.**

## Performance

- **Duration:** ~40 min (incl. live deploy + debugging the canary red)
- **Completed:** 2026-06-22
- **Tasks:** 2 auto-tasks + 1 human-action checkpoint (done) + 1 human-verify checkpoint (delegated, satisfied)
- **Files modified:** 3

## Accomplishments
- `/api/canary` route: `runtime='nodejs'`, `maxDuration=60`, CRON_SECRET bearer guard (bare 401), Q7 end-to-end probe via the imported `Q7_ANCHOR_PROMPT` (no literal copy), generic red/503 on any failure.
- `vercel.json`: `crons[]` entry hitting `/api/canary` daily + canary `maxDuration` in `functions`; existing ask entry + installCommand + `$schema` preserved.
- Fixed a latent bug in the agent's public entrypoint: `askQuestion()` threw on Vercel because `loadEnv()` ran `require('dotenv')` + read a non-existent repo-root `.env` in the traced serverless bundle. Hardened `loadEnv()` to no-op gracefully.
- CRON_SECRET provisioned: local `.env` + Vercel Production + Development.

## Task Commits

1. **Task 1: /api/canary route (CRON_SECRET-gated, DB + Q7 end-to-end)** — `6306b6c` (feat)
2. **Task 2: vercel.json crons[] + canary maxDuration** — `d242744` (feat)
3. **Deviation fix: serverless-safe loadEnv()** — `8d66da1` (fix)

## Files Created/Modified
- `web/app/api/canary/route.ts` — Deep canary: CRON_SECRET guard → Q7 `askQuestion` probe → green(200)/red(503), no error disclosure.
- `web/vercel.json` — Daily cron on `/api/canary` + canary `maxDuration:60`.
- `agent/src/db.ts` — `loadEnv()` wrapped in try/catch so a missing dotenv/.env (Vercel) no-ops instead of throwing.

## Decisions Made
- **Cron cadence = daily (`0 0 * * *`).** User confirmed Hobby plan. D-06 consequence recorded: the cron is supplementary; the **manual warm (`curl` the canary with the bearer) is the REQUIRED pre-demo step**.
- **`loadEnv()` hardening (deviation).** See below.
- **Preview env var deferred.** Vercel CLI 54.14.0 demands a git branch for `preview` even with `--value --yes`; Production (cron target) + Development (local) cover the requirement. Non-blocking follow-up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Serverless-safe `loadEnv()` (in `agent/src/db.ts`, outside declared files)**
- **Found during:** human-verify checkpoint (live canary returned `{"status":"red","ms":1}` 503)
- **Issue:** `askQuestion()` calls `loadEnv()` internally, which ran `require('dotenv')` + read a repo-root `.env` that don't exist in the Vercel serverless bundle → synchronous throw before any DB work. The streaming `/api/ask` path never calls `loadEnv()`, so only the canary surfaced it. `loadEnv`'s only real job is the LOCAL stale-shell override (D-06); on Vercel `process.env` is already authoritative.
- **Fix:** Wrapped the `loadEnv()` body in try/catch to no-op when dotenv/.env are unavailable. Rebuilt the agent dist (Vercel rebuilds it from source at deploy via installCommand; `agent/dist` is gitignored).
- **Files modified:** `agent/src/db.ts`
- **Verification:** Redeployed → canary `200 {"status":"green","agent":true,"ms":38666}` (full Q7 DB+agent+grounding end-to-end, under the 60s cap).
- **Committed in:** `8d66da1`

**2. [Rule 1 - Blocking] JSDoc comment closed early by `*/`**
- **Found during:** the loadEnv fix rebuild (tsc parse errors)
- **Issue:** the new JSDoc contained `ARANGO_*/OPENAI_API_KEY` — the `*/` terminated the block comment, so the rest parsed as code.
- **Fix:** changed to `ARANGO_ and OPENAI_API_KEY`. Build clean (exit 0).
- **Committed in:** `8d66da1` (same fix commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical agent fix, 1 blocking comment-syntax). 
**Impact on plan:** The agent fix was essential — without it the canary's core must-have ("returns green when healthy") could not be true. No scope creep; the fix is a strict bug fix to the public entrypoint.

## Issues Encountered
- **Canary red on first deploy (`ms:1`).** Root-caused by isolating against the working `/api/ask` stream path (which returned a full grounded answer), then reading `loadEnv()`. Resolved via the deviation fix above.
- **Vercel CLI 54.14.0 preview env quirk.** `vercel env add ... preview --value --yes` still demands a git branch; Production + Development set instead. Non-blocking.

## User Setup Required
**Completed during execution (human-action checkpoint):**
- `CRON_SECRET` generated and added to Vercel Production + Development + local `.env` (Preview deferred — non-blocking).
- Cron cadence confirmed: daily-only (Hobby). Manual pre-warm is the required pre-demo step (D-06).

## Verification (human-verify checkpoint — delegated to orchestrator, satisfied)
- `next build` bundled `/api/canary` (route manifest: `ƒ /api/canary`). ✓
- Auth guard: no bearer → 401 (empty body); wrong bearer → 401; correct bearer → 200 green. ✓
- Forced-red: pre-fix deploy returned `{"status":"red","ms":1}` 503 with no error detail — live proof the red path works + generic catch by inspection. ✓
- **Deferred:** cron-fires-200-in-logs — Hobby cron is daily, won't fire until midnight UTC; per D-06 the manual warm (done, green) is the required pre-demo step and the cron is supplementary. Re-confirm via `vercel logs` after the first daily fire before the live demo.

## Next Phase Readiness
- 07-03 (rehearsal harness) can now target the live deploy; the canary + green Q7 path confirm the live stack works end-to-end.
- Pre-demo checklist additions: (1) manual canary warm with the bearer, (2) confirm the daily cron logged a 200, (3) add CRON_SECRET to Vercel Preview if preview deploys are used.

---
*Phase: 07-grounding-eval-demo-hardening*
*Completed: 2026-06-22*
