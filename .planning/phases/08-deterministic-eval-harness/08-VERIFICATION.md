---
phase: 08-deterministic-eval-harness
verified: 2026-06-22T21:00:00Z
status: gaps_found
score: 10/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Running the eval suite back-to-back produces the same pass/fail result — a green suite no longer turns red on re-run from stochastic planner variance"
    status: partial
    reason: "temperature:0 reduces but does not eliminate planner stochasticity. FINAL_RUN2 (committed code, post-fix) exited 1 with Q5+Q8 scoring 0.333 on BOTH run-1 AND run-2, constituting a confirmed two-run regression on the final committed code. The SUMMARY's SC-1 pair (Runs 5+6) were obtained only after additional attempts, not from the canonical first consecutive pair on final code. EVAL-03 requires 'back-to-back runs produce the same pass/fail result'; FINAL_RUN2 disproves this is reliably true — the flake frequency is reduced, not eliminated."
    artifacts:
      - path: "agent/src/agent.ts"
        issue: "temperature:0 set correctly, but the Responses API provides no seed support; MoE routing variance persists. The RESEARCH file documents this explicitly: 'temperature:0 alone reduces variance substantially but does NOT guarantee bit-for-bit reproducibility.'"
      - path: "scripts/eval-gate.ts"
        issue: "The 1-retry gate correctly distinguishes single-run flakes (FLAKE-RECOVERED, exit 0) from confirmed regressions (exit 1 on double failure). FINAL_RUN2's exit 1 demonstrates the gate is honest, but also proves the double-failure window is non-zero on final code."
    missing:
      - "EVAL-03 as written ('back-to-back runs produce the same pass/fail result') is not fully satisfied. Options to close: (a) accept residual ~5% variance and reword EVAL-03 to 'flake rate is bounded and the gate distinguishes genuine regression from transient failure via 2-of-2 confirmation'; (b) migrate the planner to openai.chat() to enable seed (deferred in SUMMARY as medium-risk); (c) add a third consecutive-run requirement before declaring RED. None of these are implemented; the SUMMARY declares EVAL-03 complete based on Runs 5+6, which does not address FINAL_RUN2."
human_verification: []
deferred: []
---

# Phase 8: Deterministic Eval Harness Verification Report

**Phase Goal:** The eval suite is trustworthy and deterministic — a single command proves the demo works before any live run, without spurious failures from LLM stochasticity or transient infra.
**Verified:** 2026-06-22T21:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from PLAN must_haves + ROADMAP SC)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running eval back-to-back produces the same pass/fail result — ~5% flake no longer causes spurious failures | PARTIAL | temperature:0 set on both constructors; FINAL_RUN2 (post-fix final code) exited 1 with Q5+Q8 confirmed double-failure. Runs 5+6 passed but are not the canonical consecutive pair. The flake is reduced, not eliminated. |
| 2 | Single command (npx tsx scripts/eval-gate.ts) runs full locked+adversarial set, prints summary table, exits 0 on green | VERIFIED | scripts/eval-gate.ts exists (302 lines), invokes vitest --reporter=json, parses JSON, prints LOCKED/REFUSAL/ADVERSARIAL sections, exits 0 on GREEN or FLAKE-RECOVERED. |
| 3 | A genuine regression exits 1 — gate is honest, not a rubber stamp; FAITHFULNESS_FLOOR stays at 0.6 | VERIFIED | FINAL_RUN2 demonstrates exactly this: Q5+Q8 scored 0.333 on both run-1 and run-2, gate correctly exited 1. FAITHFULNESS_FLOOR constant in questions.eval.test.ts is 0.6, unchanged. |
| 4 | Answer envelope emits groundingScore (deterministic pure-code ratio) usable by Phase 11 UI-06 without recomputing | VERIFIED | EnvelopeSchema.groundingScore: z.number().min(0).max(1) required field confirmed. enforceGrounding computes and injects it on every return path. Available to Phase 11 at no additional cost. |
| 5 | groundingScore is absent from SynthEnvelopeSchema and computed only by enforceGrounding after synthesis | VERIFIED | SynthEnvelopeSchema (agent.ts lines 64-71) has 6 fields: answer, refused, claims, citations, retrievalPath, reasoningTrace — no groundingScore. The only non-comment groundingScore code line in agent.ts is the inline refusal constant (line 253), not the synthesis schema. |

**Score (truths):** 4/5 truths fully verified (Truth 1 is PARTIAL — see gap analysis below)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agent/src/agent.ts` | ToolLoopAgent with temperature:0; toCanonicalEnvelope returns PreGroundingEnvelope without parse | VERIFIED | temperature:0 confirmed at line 225. toCanonicalEnvelope returns PreGroundingEnvelope, no EnvelopeSchema.parse call. Inline refusal has groundingScore:1.0. |
| `agent/src/stream.ts` | buildAgent() with temperature:0; REFUSAL_ENVELOPE has groundingScore:1.0 | VERIFIED | temperature:0 at line 173. REFUSAL_ENVELOPE constant has groundingScore:1.0 at lines 148-161. |
| `agent/src/envelope.ts` | EnvelopeSchema with groundingScore:z.number().min(0).max(1); PreGroundingEnvelope exported | VERIFIED | Line 64: groundingScore: z.number().min(0).max(1). Line 77: export type PreGroundingEnvelope = Omit<Envelope, 'groundingScore'>. |
| `agent/src/grounding.ts` | enforceGrounding accepts PreGroundingEnvelope, injects groundingScore on all paths, calls EnvelopeSchema.parse() | VERIFIED | Signature: enforceGrounding(envelope: PreGroundingEnvelope, returnedIds: Set<string>): Envelope. groundingScore computed at top before branching (lines 52-56). Both return paths call EnvelopeSchema.parse({...groundingScore}) at lines 71 and 82. |
| `scripts/eval-gate.ts` | Pre-demo gate: spawnSync vitest, summary table, bounded 1-retry, exits 1 on confirmed two-run regression | VERIFIED | 302 lines. run-1 full suite, run-2 retry with regex-escaped filter on failing tests only. escapeRegex() helper present. exits 0 on GREEN or FLAKE-RECOVERED, exits 1 on confirmed regression. |
| `agent/test/questions.eval.test.ts` | groundingScore assertions on all locked questions; groundingScore===1.0 for non-refused; [0,1] for refusal/adversarial | VERIFIED | All 6 locked questions assert typeof groundingScore === 'number', >= 0, <= 1, and === 1.0. Refusal test asserts [0,1] range only. Adversarial loop asserts [0,1] range. |
| `scripts/tsconfig.json` | includes eval-gate.ts | VERIFIED | include: ["rehearse.ts", "eval-gate.ts"] confirmed. |

**All 7 required artifacts exist and are substantive (not stubs).**

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| enforceGrounding (grounding.ts) | EnvelopeSchema (envelope.ts) | groundingScore injected; EnvelopeSchema.parse() inside enforceGrounding | VERIFIED | Both return paths in grounding.ts call EnvelopeSchema.parse({...envelope, groundingScore}). Import confirmed: `import { EnvelopeSchema, type Envelope, type Citation, type PreGroundingEnvelope } from './envelope.js'` |
| toCanonicalEnvelope (agent.ts) | enforceGrounding (via index.ts caller) | returns PreGroundingEnvelope without parse; enforceGrounding does final parse | VERIFIED | toCanonicalEnvelope return type is PreGroundingEnvelope. No EnvelopeSchema.parse in toCanonicalEnvelope body. Type chain clean. |
| scripts/eval-gate.ts | agent/test/questions.eval.test.ts | spawnSync npx vitest run --reporter=json -- questions.eval in ../agent | VERIFIED | args array in runVitest(): ['vitest', 'run', '--reporter=json', ...filter, '--', 'questions.eval']. cwd set to AGENT_DIR. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| grounding.ts enforceGrounding | groundingScore | citations.length / groundedCitations.length — pure code, no LLM | Yes — deterministic arithmetic over real _ids | FLOWING |
| eval-gate.ts | VitestJsonOutput | spawnSync npx vitest JSON stdout | Yes — live vitest subprocess | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for live eval behaviors — running the full eval suite requires live OPENAI_API_KEY and ArangoDB cluster; behavioral check of the gate mechanism is captured in the FINAL_RUN history instead.

Static checks run:
- `SynthEnvelopeSchema` does NOT contain groundingScore field: CONFIRMED (6 fields only)
- `enforceGrounding` imports `EnvelopeSchema` (not just the type): CONFIRMED (line 18 in grounding.ts)
- `escapeRegex` helper present in eval-gate.ts before filter construction: CONFIRMED (line 271)
- `dotenv.config({override: true})` at top of eval-gate.ts: CONFIRMED (line 32)

---

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes defined for this phase. Phase uses vitest subprocess via eval-gate.ts.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVAL-03 | 08-01-PLAN.md | Eval harness is deterministic/stable across runs — ~5% stochastic flake no longer causes spurious failures | PARTIAL | temperature:0 reduces variance; FINAL_RUN2 (confirmed 2-run failure on final code) proves elimination is incomplete. The gate architecture (1-retry, confirmed-regression exit 1) is fully implemented. The flake property is bounded, not eliminated. |
| EVAL-04 | 08-01-PLAN.md | On-demand green/red gate with deterministic metrics, clear summary, runnable as single pre-demo command | ACHIEVED | scripts/eval-gate.ts is the single command; prints LOCKED/REFUSAL/ADVERSARIAL summary; exits 0 or 1; FAITHFULNESS_FLOOR unchanged at 0.6; gate behaved honestly in FINAL_RUN2. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | — |

No `TBD`, `FIXME`, or `XXX` debt markers found in any phase-8-modified file. No placeholder implementations detected. All return paths are substantive.

---

## Honest Assessment: EVAL-03 vs. FINAL_RUN2

The SUMMARY's claim that EVAL-03 is satisfied deserves direct scrutiny. The evidence in the SUMMARY itself is:

**Run sequence on final committed code (post-regex-fix, post-f4daee8):**
- FINAL_RUN1: exit 0 — GREEN (all pass)
- FINAL_RUN2: exit 1 — RED (Q5+Q8 scored 0.333 on BOTH run-1 AND run-2 of the gate — confirmed regression)
- Run 5: exit 0 — GREEN
- Run 6: exit 0 — GREEN (Q8 flake-recovered on run-2)

The SUMMARY asserts "Runs 5 and 6 are the consecutive pair satisfying EVAL-03."

**Why this does not satisfy EVAL-03 as written:**

EVAL-03 states: "The eval harness is deterministic/stable across runs — the v1 ~5% stochastic refusal + faithfulness-score flake no longer cause spurious failures." The ROADMAP SC-1 says: "Running the full eval suite back-to-back produces the same pass/fail result — the ~5% stochastic refusal flake no longer causes a green suite to turn red on re-run."

FINAL_RUN2 is not a "green suite turning red" — it is a confirmed double-failure, which the SUMMARY correctly identifies as "a stochastic cluster event in the residual variance window." But it demonstrates that two consecutive full-suite runs can produce different pass/fail outcomes (FINAL_RUN1=exit 0, FINAL_RUN2=exit 1). That is the definition of the flake EVAL-03 was supposed to close.

**What IS achieved and should not be dismissed:**

1. The gate architecture is correct and honest — FINAL_RUN2 proves the gate doesn't rubber-stamp.
2. temperature:0 materially reduces variance; the research correctly documented it cannot eliminate MoE routing variance.
3. The 1-retry logic (transient single-run flake → FLAKE-RECOVERED, exit 0; two-run failure → exit 1) is well-designed and working.
4. EVAL-04 is fully satisfied — the single-command gate is real, functional, and honest.
5. 10 of 11 plan success criteria are met.

**The gap is definitional:** EVAL-03 promises elimination of spurious failures. temperature:0 + 1-retry gate achieved reliable detection and bounded handling of the residual variance, not elimination. This is arguably the best achievable without switching the planner to `openai.chat()` for seed support, which was explicitly deferred as medium-risk.

**Recommendation:** Either:
(a) Accept this as a scoping miss and adjust the EVAL-03 wording to reflect what was actually achieved ("flake is bounded and gate-classified" rather than "eliminated"), OR
(b) Log this as a known gap for a future phase to address via planner-model-change or N-of-3 gate policy.

The phase should NOT be marked fully passed with this counterexample in the record.

---

### Gaps Summary

**1 gap blocking full EVAL-03 satisfaction:**

FINAL_RUN2 — post-fix, post-commit, final code — produced a confirmed double-failure (exit 1, Q5+Q8 both scoring 0.333 on run-1 AND run-2). This directly contradicts the EVAL-03 claim that "back-to-back runs produce the same pass/fail result." The executor's explanation (a stochastic cluster event) is plausible and honest, but a plausible explanation of a counterexample does not satisfy the original requirement.

EVAL-04 is fully satisfied. All structural artifacts (groundingScore schema, PreGroundingEnvelope type, temperature:0, enforceGrounding injection, eval-gate.ts, extended assertions) are present, substantive, and wired. The codebase is well-implemented. The gap is in the probabilistic guarantee claimed by EVAL-03, not in any missing file or broken wiring.

**Structured gaps for /gsd-plan-phase --gaps:**

See YAML frontmatter above.

---

_Verified: 2026-06-22T21:00:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Resolution (2026-06-22, user decision — Option A)

The EVAL-03 gap was resolved by reconciling the requirement to what is achievable on the OpenAI Responses API (which ignores `seed`), per the verifier's recommendation (a):

- **REQUIREMENTS.md EVAL-03** reworded from "flake no longer cause spurious failures" → "residual planner flake is *bounded and gate-classified*"; an honest RED on a genuine residual-variance cluster (e.g. FINAL_RUN2's Q5/Q8 at 0.333) is correct behavior, not a spurious failure.
- **ROADMAP.md Phase 8 SC-1** reworded to match.
- **No code change.** `temperature:0`, the N=3 majority-vote judge, and the gate's bounded 1-retry are accepted as the bounding mechanism. The honest gate (EVAL-04) is the operative pre-demo safety control.
- Full seed-based determinism (planner → `openai.chat()`) is deferred as a future, medium-risk phase (Option B), not scheduled now.

With this reconciliation, EVAL-03 and EVAL-04 are both satisfied as worded. **Phase 08 verdict: PASSED.**
