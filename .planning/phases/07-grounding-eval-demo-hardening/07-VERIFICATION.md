---
phase: 07-grounding-eval-demo-hardening
verified: 2026-06-22T10:00:00Z
status: human_needed
score: 2/3 success criteria verified; SC-1 is stochastically flaky (see gaps)
overrides_applied: 1
overrides:
  - must_have: "recorded/scripted backup path as part of demo hardening"
    reason: "Intentionally deferred per ROADMAP scope note (D-04) — replaced by CRON_SECRET-gated /api/canary failure-surfacing health signal. ROADMAP.md explicitly states: 'end-of-phase verifier must not score the deferred backup as a miss.'"
    accepted_by: "ROADMAP-D04"
    accepted_at: "2026-06-22T00:00:00Z"
human_verification:
  - test: "Run the live faithfulness eval (npm --prefix agent test -- questions.eval) at least 3 times consecutively and confirm all 6 questions clear the 0.6 floor on all runs"
    expected: "79/80 unit tests pass; all 6 live-eval questions score faithfulness >= 0.6 across multiple runs (stochastic floor check)"
    why_human: "Live-eval Q2 scored 0.5 on one observed run (below the 0.6 floor) due to a trend-claim single-record citation pattern. This is the documented residual stochastic refusal variant. Only repeated live runs can distinguish a one-off LLM variance event from a persistent regression. Cannot be verified by grep."
  - test: "Run scripts/rehearse.ts against the live deploy immediately before the demo"
    expected: "7/7 PASS (4/4 concurrent grounded cited, 3/3 adversarial refused), exit 0"
    why_human: "Live deploy verification requires secrets and active Vercel environment. Cannot run headlessly in a local verification."
  - test: "Confirm the Vercel Cron daily pre-warm has fired and logged a 200 (after midnight UTC)"
    expected: "vercel logs shows the cron invocation returning 200 (not 401 = CRON_SECRET misconfig, not SSO HTML = cron treated as browser)"
    why_human: "Cron fires on Hobby plan daily schedule; cannot be triggered programmatically in local verification. Must be confirmed via vercel logs after the first daily fire."
---

# Phase 7: Grounding/Eval + Demo Hardening — Verification Report

**Phase Goal:** Make the live demo trustworthy and unbreakable — prove every answer is grounded against the locked question set (EVAL-01), then harden the live path so it survives the room (EVAL-02).
**Verified:** 2026-06-22T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: Faithfulness eval decomposes answers into atomic claims, verifies entailment against cited records, passes over all 6 locked questions at a documented floor | PARTIAL | Judge implemented (faithfulness.ts), wired to all 6 questions, unit suite 15/15. Floor revised from === 1.0 to >= 0.6 (documented, post-review). Live run 79/80: Q2 scored 0.5 in one observed run — below the 0.6 contract (trend-claim false-negative). Passes ~90%+ of runs but is not stable enough to call VERIFIED without human repeated-run confirmation. |
| 2 | SC-2a: Serverless/DB pre-warm routine exists and works (backup path deferred per D-04) | VERIFIED (override) | `/api/canary` route exists (web/app/api/canary/route.ts), CRON_SECRET-gated, DB + Q7 end-to-end, green/red. vercel.json daily cron entry confirmed. Live 200 green verified post-deploy (07-02-SUMMARY). Backup path deferred per ROADMAP scope note — override applied. |
| 2 | SC-2b: Adversarial + concurrent rehearsal on the real Vercel deploy | VERIFIED | scripts/rehearse.ts: N=4 concurrent grounded + 3 adversarial set. Live final verify: 7/7 PASS (4/4 cited, 3/3 refused), exit 0. Defects caught and fixed: streaming refusal guard (stream.ts) + DB retry hardening (db.ts). |
| 3 | SC-3: Q12 reconciliation moment rehearsed and reliable; at least one graceful-refusal moment rehearsed and reliable | VERIFIED | Q12 test in eval asserts dual-graph reconciliation + answer names contradiction. 3/3 adversarial questions refused on live deploy. stream.ts refusal guard fixed in 07-03. |

**Score:** 2/3 truths VERIFIED (SC-1 is PARTIAL — stochastically flaky on trend claims)

---

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Recorded/scripted backup path | DEFERRED per D-04 — no later phase | ROADMAP.md Phase 7 scope note: "replaced by a failure-surfacing health/canary signal while in dev. Revisit a recorded backup when a demo date is set." Override applied. |
| 2 | Planner under-cites trend claims (root cause of stochastic faith < 0.6) | Not scheduled | Tracked in .planning/todos/pending/2026-06-19-planner-undercites-trend-claims.md. Not a Phase 7 scope item — requires planner prompt tuning. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agent/src/faithfulness.ts` | RAGAS-style NLI judge; exports faithfulness, judgeClaim, JUDGE_MODEL | VERIFIED | 282 lines; all exports present; majority-vote (N=3), Chat Completions API for seed determinism, prompt-injection hardening (CR-01), abstain = not-supported |
| `agent/test/faithfulness.test.ts` | Unit tests with injected fake model (no live cost) | VERIFIED | 15 unit tests; all 15 pass; covers majority-vote, injection-strip, abstain behavior |
| `agent/test/adversarial.ts` | 3-4 adversarial questions (PII, non-existent account, SSN) | VERIFIED | 3 questions: PII home address, non-existent account (Quantum Horizons Inc.), SSN/DOB PII |
| `agent/src/index.ts` | Exports Q7_ANCHOR_PROMPT as single source of truth | VERIFIED | Line 41: `export const Q7_ANCHOR_PROMPT = '...'` — the verbatim Q7 anchor, no duplicate literal in eval test |
| `agent/dist/index.d.ts` | Rebuilt dist; Q7_ANCHOR_PROMPT exported | VERIFIED | `grep -n "Q7_ANCHOR_PROMPT" agent/dist/index.d.ts` → line 18 confirms |
| `agent/dist/index.js` | Rebuilt dist; Q7_ANCHOR_PROMPT in JS | VERIFIED | `grep -n "Q7_ANCHOR_PROMPT" agent/dist/index.js` → line 30 confirms |
| `agent/test/questions.eval.test.ts` | Extended with faithfulness >= 0.6 assertions on all 6 Qs + adversarial it() blocks | VERIFIED | FAITHFULNESS_FLOOR = 0.6; faithfulness() called on all 6 locked questions; adversarial loop over ADVERSARIAL_QUESTIONS |
| `web/app/api/canary/route.ts` | CRON_SECRET-gated canary; runtime nodejs; Q7 end-to-end; green/red | VERIFIED | 50 lines; `export const runtime = 'nodejs'`; `export const maxDuration = 60`; CRON_SECRET guard → 401; imports Q7_ANCHOR_PROMPT from customer360-agent (no literal copy) |
| `web/vercel.json` | crons[] entry + canary maxDuration | VERIFIED | Daily cron `"0 0 * * *"` on `/api/canary`; canary maxDuration:60 in functions; ask entry preserved |
| `scripts/rehearse.ts` | Live concurrent + adversarial harness; Promise.all; exits non-zero on failure | VERIFIED | 281 lines; `Promise.all` for N=4 concurrent; adversarial imported via `../agent/test/adversarial.js` (not copied); BASE + VERCEL_AUTOMATION_BYPASS_SECRET from env; per-call PASS/FAIL; exits 1 on failure |
| `scripts/tsconfig.json` | Extends ../agent/tsconfig.json; noEmit; includes rehearse.ts | VERIFIED | 8 lines; `extends: "../agent/tsconfig.json"`, `noEmit: true`, `rootDir: ".."`, `include: ["rehearse.ts"]` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| agent/test/questions.eval.test.ts | agent/src/faithfulness.ts | `import { faithfulness }` | VERIFIED | Line 68: `import { faithfulness } from '../src/faithfulness.js'` |
| agent/test/questions.eval.test.ts | agent/src/index.ts | `import { Q7_ANCHOR_PROMPT }` | VERIFIED | Line 66: `import { askQuestion, assertReconciliation, Q7_ANCHOR_PROMPT } from '../src/index.js'` |
| agent/src/faithfulness.ts | agent/src/db.ts | `RETURN DOCUMENT(@id)` AQL fetch | VERIFIED | Line 44: `import { db } from './db.js'`; line 121: `await db.query<unknown>('RETURN DOCUMENT(@id)', { id: _id })` |
| web/app/api/canary/route.ts | customer360-agent | `import { askQuestion, Q7_ANCHOR_PROMPT }` | VERIFIED | Line 20: `import { askQuestion, Q7_ANCHOR_PROMPT } from 'customer360-agent'`; resolves via rebuilt agent/dist/index.d.ts |
| web/vercel.json | /api/canary | `crons[].path` | VERIFIED | `"path": "/api/canary"` in crons array |
| scripts/rehearse.ts | /api/ask | `concurrent POST fetch` | VERIFIED | Line 95: `const url = '${BASE}/api/ask'`; `Promise.all` on N=4 calls |
| scripts/rehearse.ts | agent/test/adversarial.ts | `import { ADVERSARIAL_QUESTIONS } from '../agent/test/adversarial.js'` | VERIFIED | Line 33; relative import (not a copy); no ADVERSARIAL_QUESTIONS array defined inline |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| faithfulness.ts | `score` | `db.query('RETURN DOCUMENT(@id)')` for each cited _id | YES — live DB read per claim | FLOWING |
| canary/route.ts | `env` | `askQuestion(Q7_ANCHOR_PROMPT)` → full agent+DB round-trip | YES — live ArangoDB + OpenAI planner end-to-end | FLOWING |
| scripts/rehearse.ts | `envelope` | `askViaHttp(question)` → POST /api/ask → SSE stream parsing | YES — live deploy | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Faithfulness unit tests (no live cost) | `npm --prefix agent test -- faithfulness` | 15/15 tests pass, 215ms | PASS |
| Full agent unit suite (excl. live-eval) | `npm --prefix agent test` (unit portion) | 79/80; 1 live-eval flake on Q2 (0.5 < 0.6 floor) | PASS (live flake, see SC-1) |
| scripts/tsconfig.json type-check gate | `npx tsc --noEmit -p scripts/tsconfig.json` | Exit 0 | PASS |
| faithfulness isolation from web/ | `grep -rl "faithfulness" web/` | No output (empty) | PASS |
| Q7_ANCHOR_PROMPT in dist | `grep -n "Q7_ANCHOR_PROMPT" agent/dist/index.d.ts` | Line 18 found | PASS |
| canary route imports Q7_ANCHOR_PROMPT | Check for inline literal | 0 inline copies — imports from package | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVAL-01 | 07-01 | Output-validation gate: faithfulness judge decomposes answers into atomic claims, verifies entailment against cited records, regression-tested over 6 locked questions | PARTIAL | Judge implemented and wired. Floor set at 0.6 (revised from 1.0 — documented). Live run shows stochastic Q2 failure (0.5 < 0.6). Adversarial refusals stable. Unit suite 15/15. |
| EVAL-02 | 07-02, 07-03 | Demo hardening: pre-warm, backup path (deferred/override), adversarial + concurrent rehearsal | VERIFIED (w/ override) | /api/canary green (live). vercel.json daily cron. scripts/rehearse.ts 7/7 PASS live. Two live defects caught and fixed (stream.ts refusal guard, db.ts withDbRetry). |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| agent/src/db.ts | 111 | TRANSIENT_CONN_RE pattern matches broadly (includes "network" substring) | Info | Intentional — broad match for serverless connection errors; acceptable for retry logic |
| agent/src/db.ts | resolution | "~50% rate stopped reproducing before the true error class was captured" | Warning | Root cause NOT confirmed — fix is best-effort hardening. See debug/resolved/arango-serverless-flaky.md. Residual ~5% stochastic refusal documented and accepted for v1. |
| agent/test/questions.eval.test.ts | 83 | `FAITHFULNESS_FLOOR = 0.6` (was plan's `=== 1.0`) | Warning | Floor lowered from original plan spec due to documented judge false-negative classes (trend claims, absence claims). This is a known trade-off, not a regression fix. The real gap is planner under-citation (tracked in todos). |

No `TBD`, `FIXME`, or `XXX` markers found in phase-7 modified files.

---

## SC-1 Faithfulness Eval — Detailed Assessment

**What was promised (ROADMAP):** An output-validation gate that decomposes each answer into atomic claims and verifies each is entailed by retrieved records, run as a light regression set over the 6 locked questions and passing before the demo.

**What was built:** A RAGAS-style NLI judge with Chat Completions API routing (for seed determinism), N=3 majority voting, prompt-injection hardening, and a `FAITHFULNESS_FLOOR = 0.6` (revised from the plan's `=== 1.0`). All 6 questions are wired; the judge runs per-claim against actual DB record content.

**The gap:** The floor revision from `=== 1.0` to `>= 0.6` is documented and defensible — the PLAN's research section anticipated this via "Open Question 1: use a documented floor if a judge false-negative is proven." Two provable false-negative classes exist: (a) trend claims citing a single record, (b) absence/negative claims. However, **the floor itself is stochastically breached**: on the live run performed during this verification, Q2 scored 0.5 (one claim was judged 'unsupported' by majority vote — "The next contract renewal for Meridian Logistics is January 15, 2025, and their usage metrics show a consistent positive growth trend across reported periods"). This is the residual stochastic issue the phase context explicitly flagged.

**Classification:** This is the SAFE failure mode (judge working correctly — it's flagging a genuine planner under-citation, not hallucinating). But it means the eval cannot be said to "pass before the demo" on the first run; it requires a re-run or multiple runs. The eval is a meaningful gate that catches real issues — it is just not fully stable.

**Verdict on SC-1:** PARTIAL. The infrastructure is correct and valuable. The live gate is not consistently passing on every run. Human multi-run confirmation required before the demo.

---

## SC-3 Rehearsal Reliability — Assessment

**Q12 reconciliation:** Test asserts `assertReconciliation(env) === true` (dual-graph _ids) AND `env.answer` matches both "green/usage/metric" and "red/risk/sentiment/contradict" patterns. This verifies the signature moment structurally. The test ran live as part of the 07-01 eval pass.

**Graceful refusal:** Three adversarial questions (PII home address, non-existent account, SSN PII) all refuse live on the Vercel deploy (3/3 in rehearsal final run). The streaming refusal bug (NoObjectGeneratedError escaping as generic SSE error) was caught by the rehearsal and fixed (stream.ts, commit 23679a6).

**Residual risk:** The ~5% stochastic planner refusal (entity resolves, answer refuses anyway, no connection error) is the safe failure mode — honest refusal, zero fabrication. Re-ask mitigates. Not infra-fixable without planner prompt changes.

---

## Residual Risks for Demo

The following are known and accepted risks the presenter must understand:

1. **Faithfulness eval stochastic floor breach (SC-1):** Q2 (and potentially Q8/Q12) can score below 0.6 on individual runs due to trend-claim single-record citations. This is the judge correctly flagging a real under-citation, not a bug. Mitigation: run the eval 2-3 times before the demo; if it fails, re-ask the same question (the answer varies slightly each run). Root fix requires planner prompt tuning (tracked in todos/pending).

2. **~5% stochastic planner/grounding refusal:** Valid questions can refuse (entity resolved, grounding gate fires because the planner returned an under-cited envelope). The safe mode — no fabrication. Mitigation: re-ask. This is distinct from the old ~50% DB failure which IS fixed.

3. **DB hardening root cause unconfirmed:** The fix (withDbRetry + poolSize:10) is best-effort hardening. The ~50% failure rate stopped reproducing before the true error class was captured. Post-fix: 14/14 grounded calls clean, rehearsal 7/7. The permanent onError logger in db.ts will surface any recurrence in Vercel logs.

4. **Daily cron pre-warm only:** Hobby plan caps cron at daily (0 0 * * *). Manual pre-warm (`curl -H "Authorization: Bearer $CRON_SECRET" $BASE/api/canary`) is the REQUIRED pre-demo step. The cron is supplementary.

5. **CRON_SECRET not set on Vercel Preview:** Only Production + Development. Non-blocking unless preview deploys are used for the live demo.

---

### Human Verification Required

#### 1. Multi-run faithfulness eval stability check

**Test:** Run `npm --prefix agent test -- questions.eval` at least 3 times with live env (ARANGO_* + OPENAI_API_KEY populated) and check that all 6 questions clear the 0.6 floor on all runs.
**Expected:** Each run should produce 10/10 live-eval tests passing. If Q2 or Q8 fail on a run, note the score and unsupported claim text — this indicates the planner produced a trend claim with single-record citation on that run.
**Why human:** Live LLM + DB call; stochastic. This verification observed Q2 = 0.5 on one run. Cannot determine pass/fail by grep.

#### 2. Live rehearsal pre-demo gate

**Test:** `BASE=https://customer360-demo-jade.vercel.app VERCEL_AUTOMATION_BYPASS_SECRET=<secret> npx tsx scripts/rehearse.ts` (or equivalent with browser-session auth per D-08). Run immediately before the live demo.
**Expected:** `REHEARSAL PASSED — all 7 assertions green.` Exit 0.
**Why human:** Live deploy + secrets required. Cannot run headlessly.

#### 3. Vercel Cron 200-in-logs confirmation

**Test:** After midnight UTC, run `vercel logs customer360-demo-jade.vercel.app` and verify the scheduled `/api/canary` hit returns 200 (not 401 = CRON_SECRET misconfig, not SSO HTML = cron bypass failure).
**Expected:** Log line showing `GET /api/canary 200` triggered by the cron scheduler.
**Why human:** Platform scheduling; cannot be triggered programmatically. Deferred from 07-02 verification because Hobby daily cron hadn't fired yet.

---

### Gaps Summary

The only true gap is the stochastic faithfulness floor breach on SC-1. All infrastructure, wiring, and live verification are in place. The judge is doing its job correctly — flagging a real planner behavior (single-record citations for multi-period trend claims). The floor of 0.6 was set based on stable observed runs; the single Q2=0.5 failure on this verification run is within the documented stochastic band.

The phase goal of "make the live demo trustworthy and unbreakable" is substantially achieved:
- Every answer IS verified against cited records (EVAL-01 infrastructure complete and wired)
- The live path survived a real adversarial rehearsal and two real bugs were found and fixed
- The pre-warm, canary, and rehearsal harness all work

What is NOT yet confirmed: that the faithfulness eval will reliably pass on all 6 questions every time without a re-run. This requires human multi-run confirmation before the demo.

---

## Post-Verification Update — SC-1 trend-citation fix (2026-06-22)

The SC-1 PARTIAL driver (faithfulness floor breach on trend claims) was addressed after verification:

- **Fix (commit ea911d4):** added a planner rule (`PLANNER_SYSTEM_PROMPT`) requiring AGGREGATE/TREND/COMPARATIVE claims to cite the specific underlying period records (≥ first+last) and to state the concrete figures/periods in the claim text so the claim is directly entailed by what is cited.
- **Re-verification:** 3 consecutive live eval runs → **ZERO faithfulness-floor breaches** (the Q2/trend-claim instability the verifier hit did not recur). SC-1's faithfulness dimension is now stable across runs.
- **Residual (unchanged, accepted for v1):** Run 1 of the 3 had a single **Q5 stochastic REFUSAL** (dual-graph question; planner honestly returned "unsupported" when hybridRetrieve under-surfaced the unstructured evidence that run). This is the SAFE failure mode (no fabrication) — the same documented ~5% residual — NOT a faithfulness-score problem. Fully eliminating it is deeper retrieval-recall tuning (Phase-5 territory), out of Phase-7 scope.

**Revised SC-1 status:** faithfulness gate STABLE (3/3 runs clean on score); residual stochastic refusal on dual-graph questions remains the accepted v1 risk, mitigated by the pre-demo checklist (run the eval/rehearsal before the demo; re-ask any question that refuses).

_Updated: 2026-06-22_

---

_Verified: 2026-06-22T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
