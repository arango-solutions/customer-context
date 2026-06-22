# Phase 8: Deterministic Eval Harness — Research

**Researched:** 2026-06-22
**Domain:** LLM eval harness determinism, planner stochasticity mitigation, grounding score design, vitest gate architecture
**Confidence:** HIGH (core findings verified from official docs + codebase inspection)

---

## Summary

Phase 7 shipped a working, honest faithfulness eval (FAITHFULNESS_FLOOR = 0.6, N=3 majority
vote judge, Chat Completions seed). The Phase 8 mandate is to close the last ~5% stochastic
flake so the gate can be run pre-demo without a re-run ritual. The flake has two distinct
sources documented in 07-VERIFICATION.md: (1) the JUDGE, now fully stabilized via Chat
Completions API + majority vote — NOT the remaining problem; (2) the PLANNER, which remains
non-deterministic and can under-cite trend/multi-period claims, causing a faithfulness dip, or
stochastically refuse a valid dual-graph question. Phase 8 must address source (2) directly.

The primary PLANNER determinism lever — `temperature: 0` — is available and worth setting on
the `ToolLoopAgent` constructor; AI SDK 6 documents it. However, the planner currently uses
`openai(PLANNER_MODEL)` (the Responses API), and OpenAI's Responses API does NOT support the
`seed` parameter (confirmed via community.openai.com feature request thread — no implementation
date announced). `temperature: 0` alone reduces variance substantially but does NOT guarantee
bit-for-bit reproducibility: MoE routing and infrastructure-level floating-point variation
persist even at temperature 0. This is not an AI SDK limitation — it is fundamental to how
OpenAI hosts these models.

The recommended strategy has three coordinated levers: (1) set `temperature: 0` on the planner
(cheap, closes most variance); (2) tighten the planner prompt's trend/absence claim rule (the
SC-1 fix from 07-VERIFICATION post-update already shipped this — `ea911d4` — but needs
verification it holds across more runs); (3) accept residual stochasticity at the gate level
via a bounded N-of-M re-run strategy: if a run fails, automatically retry once and require 2/2
passes before declaring red. This distinguishes genuine regression (fails 2/2) from transient
flake (passes on retry). The gate stays honest — a looser floor is NOT the mitigation.

The EVAL-04 "single command" gate should be the hardened **vitest suite** itself (the existing
`questions.eval.test.ts` + `adversarial.ts`) plus a thin **wrapper script**
(`scripts/eval-gate.ts`) that invokes vitest programmatically, captures pass/fail per question,
prints a clean summary table, and exits 1 on any two-consecutive-failure. The wrapper is the
pre-demo command; it is NOT a replacement for vitest — it calls vitest.

The **deterministic groundingScore** for the answer envelope is a pure-code citation-coverage
ratio computed by `enforceGrounding`'s existing logic: `groundedCitationCount / totalCitationCount`
(fraction of proposed citations that survive the _id gate). This is already computable without
any new LLM call — it is a byproduct of the logic that currently runs silently. The field is
added to `EnvelopeSchema` as `groundingScore: z.number()` (always present, 0–1). The
faithfulness judge score is test-time only and NOT emitted into the live envelope.

**Primary recommendation:** Set `temperature: 0` on `ToolLoopAgent`, verify the trend-claim
prompt rule holds across 5 consecutive runs, adopt a bounded 1-retry gate in `eval-gate.ts`,
and add `groundingScore` to the envelope computed in `enforceGrounding`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Planner determinism (temperature/seed) | API / Backend (`agent.ts`) | — | `ToolLoopAgent` constructor lives in `agent.ts`; provider config belongs there |
| Judge determinism (already done) | Test-time only (`faithfulness.ts`) | — | Judge runs only in eval, never on answer path |
| Eval gate pass/fail logic | Test scripts (`scripts/eval-gate.ts`) | Vitest (`agent/test/`) | Vitest is the runner; the gate script is the pre-demo command wrapper |
| Faithfulness scoring | Test-time only (`faithfulness.ts`) | — | LLM judge; too slow/costly for live answer path |
| `groundingScore` field | API / Backend (`grounding.ts`, `envelope.ts`) | — | Pure-code, already computable in `enforceGrounding`; emitted on every live answer |
| Summary reporter output | Test scripts (`scripts/eval-gate.ts`) | — | Human-readable table for pre-demo confidence |
| Retry / flake classification | Test scripts (`scripts/eval-gate.ts`) | — | Wrapper logic, not a vitest concern |

---

## Standard Stack

### Core (already installed — no new packages needed for this phase)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `ai` (Vercel AI SDK) | 6.0.208 | `ToolLoopAgent` with `temperature` param | `temperature` is a documented constructor param [VERIFIED: ai-sdk.dev docs] |
| `@ai-sdk/openai` | 3.0.73 | Provider — Responses API (default), Chat Completions via `.chat()` | `openai()` = Responses API; `openai.chat()` = Chat Completions (seed-capable) |
| `vitest` | 4.1.9 | Existing test runner for `questions.eval.test.ts` | No change needed |
| `zod` | 4.4.3 | `EnvelopeSchema` — where `groundingScore` is added | Already in deps |

### Supporting (already installed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `tsx` | 4.22.4 | Runs `scripts/eval-gate.ts` directly | Already in devDeps |
| `dotenv` | 17.x | `loadEnv()` for eval env loading | Already in deps |

**No new packages are required for this phase.** All work is code changes to existing files.

### Package Legitimacy Audit

No new packages are being installed in Phase 8. This section is intentionally omitted.

---

## PLANNER Determinism: The Critical Finding

### What AI SDK 6 Supports

`ToolLoopAgent` accepts `temperature` and `seed` as constructor-level parameters. Per the
official AI SDK reference documentation [VERIFIED: ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent],
these are passed through to every underlying model call in the loop. Setting `temperature: 0`
is therefore straightforward:

```typescript
// agent/src/agent.ts — in runAgent()
const agent = new ToolLoopAgent({
  model: openai(PLANNER_MODEL),
  instructions: PLANNER_SYSTEM_PROMPT,
  tools: TOOLS,
  stopWhen: stepCountIs(12),
  output: Output.object({ schema: SynthEnvelopeSchema }),
  temperature: 0,   // ADD THIS — primary determinism lever
  // seed: 7 — NOT useful here (see below)
});
```

### Why `seed` Does NOT Help for the Planner

The current planner uses `openai(PLANNER_MODEL)` — which routes through the **OpenAI Responses
API** (the default since AI SDK 5). OpenAI's Responses API **does not support the `seed`
parameter** [CITED: community.openai.com/t/support-for-seed-parameter-in-the-responses-api/1230489].
Unlike the judge (which already uses `openai.chat(JUDGE_MODEL)` — Chat Completions API — where
seed IS supported), passing `seed` to `openai(PLANNER_MODEL)` via `ToolLoopAgent` would be
silently ignored or logged as "The feature 'seed' is not supported" — exactly the bug that caused
the original judge flakiness, now avoided in `faithfulness.ts` by the `openai.chat()` routing.

**Should the planner be switched to `openai.chat(PLANNER_MODEL)`?** Possibly, but with one
concrete risk: the Responses API provides native tool-call handling with OpenAI strict-mode
structured outputs; the Chat Completions API uses `response_format: { type: "json_schema" }`
for structured output. The current `SynthEnvelopeSchema + Output.object()` pattern works on
the Responses API with strict mode. Switching to `openai.chat()` would require verifying that
`Output.object()` with `SynthEnvelopeSchema` still works — specifically the
`strict: false/nullable` nuances documented in `agent.ts` comments. This is a medium-risk
change. **Recommendation: do NOT switch the planner to Chat Completions in this phase. Use
`temperature: 0` only; accept that seed is unavailable.**

### The Fundamental Residual: Infrastructure-Level Non-Determinism

Even with `temperature: 0`, OpenAI models are not bit-for-bit reproducible [CITED:
towardsdatascience.com/avoidable-and-unavoidable-randomness-in-gpt-4o]. Sources include:
- **Mixture-of-Experts (MoE) routing**: tokens compete for expert buffer slots;
  the outcome is technically non-deterministic at the sequence level
- **Infrastructure floating-point**: parallel computation on distributed GPU clusters
  introduces rounding-order variations
- **No seed on Responses API**: removes even the "best-effort" reproducibility lever

**Practical implication for the eval gate:** `temperature: 0` will reduce planner variance
substantially (most same-question runs will produce the same tool call plan and the same
claim structure). The residual ~5% refusal flake is unlikely to vanish entirely. The gate
design must account for this via bounded retry logic (see Gate Shape section).

### The Proven Planner Fix That Already Shipped

The `PLANNER_SYSTEM_PROMPT` in `agent.ts` already has the trend/absence citation rule added
in commit `ea911d4` (post-07-verification). This rule was the root cause of the Q2/Q8
faithfulness dips (planner emitting "usage growth over 2 years" citing ONE record). After
adding the rule, 3 consecutive live eval runs produced zero floor breaches. Phase 8 must
verify this holds (5+ consecutive runs) with `temperature: 0` also set.

### Planner Mitigation Strategy (Ordered by Impact)

| Lever | Risk | Expected Impact | Recommendation |
|-------|------|-----------------|----------------|
| `temperature: 0` on `ToolLoopAgent` | Very low — additive param | Reduces variance 60–80% | **DO — Wave 1** |
| Trend-cite prompt rule (already in `ea911d4`) | Already shipped | Eliminates the documented flake class | Verify it holds at temperature:0 |
| Switch planner to `openai.chat()` for seed | Medium — needs re-verify all 6 Qs | Adds "best-effort" seed coverage | Defer to v2 — risk/reward marginal given seed's best-effort nature |
| Planner majority vote (N=3 full agent runs) | High cost — 3× tokens per question | Strong flake elimination | Too expensive for pre-demo gate; reserve for research |
| Accept residual + bounded retry in gate | Zero code risk | Handles genuine residual cleanly | **DO — in eval-gate.ts** |

---

## EVAL-04 Gate Shape: Recommended Architecture

### Decision: Hardened Vitest Suite + Thin Wrapper Script

The existing vitest suite (`questions.eval.test.ts` + `adversarial.ts`) is the eval. It is
correct, honest, and already wired. The EVAL-04 requirement is a "single command" that prints
a clear summary and exits 1 on genuine failure. The right architecture is:

1. **`agent/test/questions.eval.test.ts`** — unchanged as the authoritative test suite.
   Run individually by developers; also invoked by the wrapper.
2. **`scripts/eval-gate.ts`** — the pre-demo command. Invokes vitest programmatically (or via
   `child_process`), collects per-question results, prints a formatted summary table, and
   implements the bounded retry logic. **This is the EVAL-04 "single command".**

The wrapper does NOT duplicate test logic. It is a thin shell over vitest with two additions:
- **Summary reporter**: per-question pass/fail + faithfulness scores in a table
- **Bounded retry**: on first-run failure, re-runs the failing tests once; if they pass on
  retry, marks as `FLAKE-RECOVERED` (green, with a warning); if they fail twice, exits 1

### Summary Reporter Design

```
=== Customer360 Eval Gate (Phase 8) ===
Date: 2026-06-22  Run: 1/1

LOCKED QUESTIONS (6)
  Q7  [PASS]  faithfulness=0.83  refused=false  graph=structured-only
  Q2  [PASS]  faithfulness=0.75  refused=false  reconciliation=true
  Q12 [PASS]  faithfulness=0.80  refused=false  reconciliation=true
  Q9  [PASS]  faithfulness=0.67  refused=false  reconciliation=true
  Q5  [PASS]  faithfulness=0.71  refused=false  reconciliation=true
  Q8  [PASS]  faithfulness=0.67  refused=false  reconciliation=true

REFUSAL (1)
  out-of-scope [PASS]  refused=true  no-fabricated-id=true

ADVERSARIAL (3)
  PII home address      [PASS]  refused=true  no-fabricated-id=true
  non-existent account  [PASS]  refused=true  no-fabricated-id=true
  SSN/DOB PII           [PASS]  refused=true  no-fabricated-id=true

SUMMARY:  10/10 PASS  |  GATE: GREEN  |  exit 0
```

On failure with retry:
```
  Q2  [FAIL run-1 → FLAKE-RECOVERED run-2]  faithfulness=0.5 → 0.75  WARN: transient flake detected
SUMMARY:  9/10 PASS on run-1; 10/10 on run-2  |  GATE: GREEN (flake recovered)  |  exit 0
```

On genuine regression:
```
  Q2  [FAIL run-1]  faithfulness=0.33  refused=false
  Q2  [FAIL run-2]  faithfulness=0.40  refused=false  << confirmed regression
SUMMARY:  9/10 PASS (both runs)  |  GATE: RED — 1 confirmed failure  |  exit 1
```

### Honest Gate: Distinguishing Regression from Flake

The key design constraint from the roadmap: **do NOT loosen the floor to force green.** The
floor stays at `FAITHFULNESS_FLOOR = 0.6`. The retry logic is the ONLY safety valve:

| Outcome | Exit Code | Classification | Action |
|---------|-----------|----------------|--------|
| All pass on run-1 | 0 (GREEN) | Clean pass | Demo with confidence |
| ≥1 fail on run-1, all pass on run-2 | 0 (GREEN + WARN) | Flake recovered | Demo; investigate the flake class |
| ≥1 fail on BOTH run-1 AND run-2 | 1 (RED) | Genuine regression | Fix before demo |
| Planner stochastic refusal (refused=true) | Retry once — if refused both times, exit 1 | Persistent refusal | Real issue |

**Why one retry is right:** The documented residual is ~5% per run. The probability of the
same question failing twice in a row from pure stochasticity is ~0.25%. If a question fails
twice, it is almost certainly a genuine regression (bad data, broken AQL, model API change,
regression in planner prompt).

**What NOT to do:**
- Do NOT lower `FAITHFULNESS_FLOOR` below 0.6 — this hides real grounding issues
- Do NOT increase the retry count beyond 1 — that's a rubber stamp, not a gate
- Do NOT skip the faithfulness judge on retry — the retry runs the full suite, not a stripped version

### vitest vs. New Standalone Script

Do not replace vitest with a standalone script. Reasons:
- The existing vitest suite has skip guards (`CAN_RUN`), proper TIMEOUT (180s), and fixture
  isolation — duplicating these in a standalone is pointless maintenance
- `tsx scripts/eval-gate.ts` CALLS vitest; it is additive
- Developers run `npm --prefix agent test -- questions.eval` for exploration; the gate script
  is for pre-demo ceremony only

**Invocation pattern for eval-gate.ts:**

```typescript
// scripts/eval-gate.ts — pseudocode shape
import { execa } from 'execa'; // or child_process.spawn — no new dep needed with tsx

async function runVitest(attempt: number): Promise<VitestResult> {
  const result = await spawn('npx', ['vitest', 'run', '--reporter=json',
    '--', 'questions.eval'], { cwd: '../agent', env: process.env });
  return parseVitestJson(result.stdout);
}

async function main() {
  const run1 = await runVitest(1);
  const failures = run1.tests.filter(t => t.status === 'fail');

  if (failures.length === 0) {
    printSummary(run1, null);
    process.exit(0);
  }

  // Retry only the failing tests
  const run2 = await runVitestFiltered(failures.map(t => t.name));
  const stillFailing = run2.tests.filter(t => t.status === 'fail');

  printSummary(run1, run2);
  process.exit(stillFailing.length > 0 ? 1 : 0);
}
```

Note: vitest's `--reporter=json` outputs structured results that can be parsed. The reporter
captures per-test status and failure messages including the faithfulness score from the
`expect(score, \`Q2 unsupported claims: ...\`)` message format already in the tests.

---

## Deterministic groundingScore: Design and Implementation

### The Core Insight

The `enforceGrounding` function in `grounding.ts` already computes everything needed for a
grounding score — it counts ungrounded citations. The score is free: no new LLM call, no new
I/O, pure arithmetic on existing values. The only work is:
1. Compute and return the ratio
2. Add it to `EnvelopeSchema`
3. Emit it from `enforceGrounding`

### Exact Definition

```
groundingScore = grounded_citations / total_proposed_citations
```

Where:
- `total_proposed_citations` = `envelope.citations.length` (what the planner synthesized)
- `grounded_citations` = citations whose `_id ∈ returnedIds` (what the tools actually returned)

Special cases (parallel with `faithfulness` in `faithfulness.ts`):
- `total_proposed_citations === 0`: `groundingScore = 1.0` (vacuously grounded — consistent
  with the refusal path for a fully refused envelope with no citations)
- `groundingScore === 1.0`: fully grounded, envelope returned unchanged
- `groundingScore < 1.0`: partial grounding; envelope is a structured refusal with
  `refused: true`

**This is a PURE CODE metric — always deterministic, zero latency, zero cost.** It measures
what fraction of the planner's proposed citations were actually retrieved from the DB (not
hallucinated). It is meaningfully different from the faithfulness score (which asks whether
the cited record's CONTENT supports the claim). Both are useful signals; they measure
complementary failure modes.

### Why NOT Emit the Faithfulness Score Into the Envelope

The faithfulness score requires an LLM judge call per claim (3× majority vote). For 6 claims
× 3 votes × ~1s each ≈ 18+ seconds of additional latency. This is incompatible with the Phase
11 latency goal. More importantly: the judge is test-time advisory; putting it on the hot
answer path would violate the isolation discipline documented in `faithfulness.ts` ("The judge
MUST NEVER be imported under web/ or anywhere on the runtime answer path").

The `groundingScore` is the right on-path signal. The faithfulness score remains test-only.

### envelope.ts Schema Change

```typescript
// agent/src/envelope.ts — add to EnvelopeSchema
export const EnvelopeSchema = z.object({
  answer: z.string(),
  refused: z.boolean().default(false),
  claims: z.array(ClaimSchema),
  citations: z.array(CitationSchema),
  retrievalPath: z.array(RetrievalPathFragment),
  reasoningTrace: z.array(z.string()),
  groundingScore: z.number().min(0).max(1),  // ADD THIS — pure code, always present
});
```

**Why not `.optional()`?** The field is always computable — `enforceGrounding` always runs
before `askQuestion` returns. Making it optional would mean the UI has to handle `undefined`
with no benefit. Required with a default-from-computation is cleaner.

**Why not `.default(1.0)`?** A Zod `.default()` would allow the field to be absent in the
synthesized envelope (before `enforceGrounding` runs). The SynthEnvelopeSchema (in `agent.ts`)
does NOT include `groundingScore` — the planner does not emit it. `enforceGrounding` computes
and injects it. So the schema evolution is: SynthEnvelopeSchema (no score) → `toCanonicalEnvelope`
(no score) → `enforceGrounding` (injects score) → returned Envelope (has score). This means
`enforceGrounding`'s return type already satisfies `EnvelopeSchema` if it always sets the field.

### grounding.ts Change

```typescript
// agent/src/grounding.ts — enforceGrounding return type addition

export function enforceGrounding(
  envelope: Envelope,
  returnedIds: Set<string>,
): Envelope {
  const groundedCitations = envelope.citations.filter((c) => isGrounded(c, returnedIds));
  const ungrounded = envelope.citations.filter((c) => !isGrounded(c, returnedIds));

  // Compute groundingScore: fraction of proposed citations that are real tool-returned _ids.
  const groundingScore = envelope.citations.length === 0
    ? 1.0
    : groundedCitations.length / envelope.citations.length;

  // Unsupported claims check ...
  const unsupportedClaims = envelope.claims.filter(...)

  if (ungrounded.length === 0 && unsupportedClaims.length === 0) {
    return { ...envelope, groundingScore };  // fully grounded — inject score, return unchanged
  }

  // Refusal path — return with partial grounded citations + score
  return {
    answer: '...',
    refused: true,
    claims: groundedClaims,
    citations: groundedCitations,
    retrievalPath: envelope.retrievalPath,
    reasoningTrace: envelope.reasoningTrace,
    groundingScore,  // will be < 1.0 on any refusal path
  };
}
```

### SynthEnvelopeSchema Compatibility

`SynthEnvelopeSchema` in `agent.ts` does NOT gain `groundingScore` — the planner does not
compute it, and the strict-mode OpenAI schema would require adding it to `required` (breaking
the planner). The field is injected by `enforceGrounding` after synthesis. `toCanonicalEnvelope`
passes through to `EnvelopeSchema.parse()`, which would fail if `groundingScore` is absent.
**Solution:** Keep `groundingScore` absent from `SynthEnvelopeSchema`; `toCanonicalEnvelope`
continues as-is; `enforceGrounding` injects the field; `EnvelopeSchema.parse()` is called
AFTER `enforceGrounding` in `index.ts`, not inside `toCanonicalEnvelope`. The parse in
`toCanonicalEnvelope` uses `EnvelopeSchema.parse({...})` — this WILL fail if `groundingScore`
is required and missing.

**Concrete fix:** Either (a) make `groundingScore` optional in `EnvelopeSchema` with
`.optional()` but document it as "always present post-`enforceGrounding`", or (b) do not call
`EnvelopeSchema.parse()` inside `toCanonicalEnvelope` — return the raw object and let
`enforceGrounding` produce the final parse-validated result. Option (b) is architecturally
cleaner: `toCanonicalEnvelope` does shape normalization (nullable→undefined), not validation;
`enforceGrounding` produces the final validated envelope. The planner should check for option
(b) when editing `agent.ts`.

### Web Route Compatibility (Phase 11 consumer)

The `groundingScore` field is part of the envelope returned from `askQuestion()`. The Next.js
route (`web/app/api/ask/route.ts`) streams the envelope as a `data-envelope` SSE part. Phase
11 reads it from `envelope.groundingScore` — no changes needed to the streaming logic.

---

## Architecture Patterns

### System Architecture: Eval Gate Flow

```
scripts/eval-gate.ts (pre-demo command)
  │
  ├─ [Run 1] → npx vitest run --reporter=json -- questions.eval
  │              │
  │              ├─ questions.eval.test.ts: 6 locked Qs + 1 refusal
  │              │     └─ askQuestion() → runAgent() → enforceGrounding() → faithfulness()
  │              └─ adversarial.ts: 3 adversarial refusals
  │
  ├─ Parse results → per-Q status + faithfulness scores
  │
  ├─ All pass? → GATE: GREEN → exit 0
  │
  └─ Any fail? → [Run 2 retry — failing Qs only]
                  ├─ All recovered? → GATE: GREEN + WARN (flake) → exit 0
                  └─ Still failing?  → GATE: RED → print confirmed failures → exit 1

grounding.ts: enforceGrounding()
  │
  ├─ counts proposed citations vs grounded (returnedIds)
  ├─ computes groundingScore = grounded/total (or 1.0 if 0 citations)
  └─ injects groundingScore into every returned Envelope

envelope.ts: EnvelopeSchema
  └─ adds groundingScore: z.number().min(0).max(1)
```

### Recommended Project Structure (no new directories — changes to existing files)

```
agent/
├── src/
│   ├── envelope.ts        ← ADD groundingScore field to EnvelopeSchema
│   ├── grounding.ts       ← COMPUTE + INJECT groundingScore in enforceGrounding()
│   └── agent.ts           ← ADD temperature: 0 to ToolLoopAgent constructor
scripts/
└── eval-gate.ts           ← NEW: pre-demo gate script (wrapper over vitest)
```

### Pattern: Temperature on ToolLoopAgent

```typescript
// Source: ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent [VERIFIED: WebFetch]
// agent/src/agent.ts — add temperature: 0
const agent = new ToolLoopAgent({
  model: openai(PLANNER_MODEL),     // Responses API (no seed support — accepted)
  instructions: PLANNER_SYSTEM_PROMPT,
  tools: TOOLS,
  stopWhen: stepCountIs(12),
  output: Output.object({ schema: SynthEnvelopeSchema }),
  temperature: 0,   // ADD: primary planner determinism lever
  // No seed — silently ignored on Responses API; confirmed NOT supported
});
```

### Pattern: groundingScore Computation in enforceGrounding

```typescript
// agent/src/grounding.ts — ILLUSTRATIVE (not complete; planner fills in the rest)
// Source: derived from existing enforceGrounding logic [VERIFIED: codebase inspection]
export function enforceGrounding(
  envelope: Envelope,
  returnedIds: Set<string>,
): Envelope {
  const ungrounded = envelope.citations.filter((c) => !isGrounded(c, returnedIds));
  const groundedCitations = envelope.citations.filter((c) => isGrounded(c, returnedIds));

  // Pure-code grounding score — deterministic, zero latency, zero cost.
  const groundingScore = envelope.citations.length === 0
    ? 1.0
    : groundedCitations.length / envelope.citations.length;

  if (ungrounded.length === 0 && unsupportedClaims.length === 0) {
    return { ...envelope, groundingScore };
  }

  return {
    // ... existing refusal fields
    groundingScore,
  };
}
```

### Anti-Patterns to Avoid

- **Loosening FAITHFULNESS_FLOOR below 0.6**: The floor was set empirically at 0.6 because
  all 6 questions clear it on stable runs. Lowering it to hide a regression would break the
  "honest gate" requirement. The floor stays.

- **Emitting faithfulness judge score into the live envelope**: The judge adds ~18s latency
  (6 claims × 3 votes) and violates the isolation discipline. Use `groundingScore` on the
  live path; faithfulness is test-time advisory.

- **Switching planner to `openai.chat()` for seed without re-verifying all 6 Qs**: The Responses
  API and Chat Completions API have slightly different structured-output behavior (strict mode
  vs `response_format`). The current `SynthEnvelopeSchema + Output.object()` pattern was
  validated on the Responses API. Switching is a medium-risk change that needs its own
  verification pass.

- **Calling `EnvelopeSchema.parse()` before `enforceGrounding` injects `groundingScore`**:
  Will fail Zod validation if `groundingScore` is required. Ensure the parse order is:
  `toCanonicalEnvelope` (shape normalization, no full parse) → `enforceGrounding` (score
  injection + optional final parse).

- **Adding `groundingScore` to `SynthEnvelopeSchema`**: The planner cannot compute it (it
  doesn't know `returnedIds`). Adding it would require the LLM to emit a number it cannot
  honestly know, which undermines the grounding-by-code principle.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vitest JSON output parsing | Custom test runner | `vitest --reporter=json` | Vitest's built-in JSON reporter includes per-test status, error messages (the faithfulness score is in the error message), and timing |
| Planner determinism via custom sampling | Custom temperature/top_k token sampling | `temperature: 0` on ToolLoopAgent | The AI SDK exposes this; the provider handles the rest |
| Custom retry test logic | Custom vitest plugin | `execa` + vitest `--reporter=json` in the wrapper script | Simple child_process is sufficient; the retry is at the question level, not at the vitest internals level |
| Citation-coverage LLM judge | A second LLM call to evaluate citations | `enforceGrounding`'s pure-code logic | The _id gate already computes this; it's deterministic and free |

---

## Common Pitfalls

### Pitfall 1: Adding seed to the Responses API planner and expecting it to work

**What goes wrong:** Developer adds `seed: 7` to `ToolLoopAgent` constructor alongside
`temperature: 0`. The Responses API silently ignores it (same root cause as the original judge
flakiness diagnosed in Phase 7). No error; no improvement. Time wasted diagnosing residual
variance that was never going to be fixed by seed.

**Why it happens:** The judge fix in `faithfulness.ts` used `openai.chat()` for seed. It is
tempting to apply the same fix to the planner. But the planner uses `openai()` (Responses API)
and the APIs are different.

**How to avoid:** Only set `temperature: 0` on the planner. Document explicitly in `agent.ts`
that `seed` is not available on the Responses API. If seed is desired in a future phase,
switch to `openai.chat()` with a full 6-question verification pass first.

**Warning signs:** Log lines saying "The feature 'seed' is not supported" in Vercel function
logs if the Responses API ever starts emitting warnings instead of silently ignoring.

### Pitfall 2: groundingScore added to SynthEnvelopeSchema breaks OpenAI strict mode

**What goes wrong:** Developer adds `groundingScore` to `SynthEnvelopeSchema` in `agent.ts`
to make the data flow explicit. OpenAI strict mode requires all fields to be in `required[]`
and every `optional()` field becomes a `nullable()`. The LLM is now expected to emit a
`groundingScore` number that it cannot honestly compute. Either the LLM fabricates a value or
the parse fails.

**Why it happens:** The symmetric reflex — "if it's in EnvelopeSchema, put it in
SynthEnvelopeSchema."

**How to avoid:** Keep `groundingScore` OUT of `SynthEnvelopeSchema`. It is computed by
`enforceGrounding` (pure code) and injected after synthesis. Only code can compute it because
only code knows `returnedIds`.

### Pitfall 3: EnvelopeSchema.parse() in toCanonicalEnvelope fails on missing groundingScore

**What goes wrong:** `toCanonicalEnvelope` calls `EnvelopeSchema.parse({...})` (line 84 of
current `agent.ts`). After `groundingScore` is added to `EnvelopeSchema` as required, this
parse fails because `groundingScore` is not in the synthesized output.

**Why it happens:** The existing `toCanonicalEnvelope` already calls `EnvelopeSchema.parse()`.
Adding a required field to the schema without removing that call causes a cascade failure.

**How to avoid:** Either (a) use `.optional()` for `groundingScore` in `EnvelopeSchema` and
document that it is always present post-`enforceGrounding`, or (b) remove the `EnvelopeSchema.parse()`
call from `toCanonicalEnvelope` and let it be a pure shape normalizer (the recommended option).
The planner should choose (b) and verify tsc passes.

**File reference:** `agent/src/agent.ts` line 84: `return EnvelopeSchema.parse({...})`.

### Pitfall 4: Retry logic re-runs the FULL suite instead of only failing tests

**What goes wrong:** `eval-gate.ts` re-runs all 10 tests on retry. This doubles the eval
runtime (already 10–20 minutes at 180s/question) for no benefit — passing tests don't need
re-verification.

**Why it happens:** `vitest run` runs everything by default.

**How to avoid:** Use `vitest run -t "Q2 — renewal risk"` (test name filter) to run only the
failing test(s) on retry. Extract the failing test names from the JSON reporter output.

### Pitfall 5: Summary reporter obscures the faithfulness scores on failure

**What goes wrong:** On a failing run, the exit code is 1 but the faithfulness score that
triggered the failure isn't shown. The presenter has to go dig in vitest output to understand
whether it's the floor breach, a refusal, or a reconciliation failure.

**Why it happens:** Generic "test failed" reporting.

**How to avoid:** Parse the vitest `--reporter=json` output and extract the `expect(score, ...)` 
failure message, which already contains the score and unsupported claim text (this is the
`assertionErrorMessage` pattern in vitest's JSON output). Surface it in the eval-gate summary.

### Pitfall 6: groundingScore interpretation confusion in Phase 11 UI

**What goes wrong:** Phase 11 displays `groundingScore` as "faithfulness" in the UI. Users
interpret it as "the answer is accurate." But `groundingScore = 1.0` only means every citation
`_id` the planner proposed was real — the CONTENT of those records may not support the claims
(that's faithfulness). A high grounding score is necessary but not sufficient for accuracy.

**Why it happens:** The two scores look similar numerically and both live in the envelope.

**How to avoid:** Name the field `groundingScore` (not `faithfulnessScore`) and add a tooltip
in the Phase 11 UI: "Fraction of citations grounded in real retrieved records (code-verified)."
Document the distinction in the envelope.ts comment.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 |
| Config file | `agent/vitest.config.ts` (or `package.json#vitest`) |
| Quick run command | `npm --prefix agent test -- faithfulness` (unit only) |
| Full suite command | `npm --prefix agent test -- questions.eval` (live eval) |
| Gate command (new) | `npx tsx scripts/eval-gate.ts` (pre-demo, requires live env) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVAL-03 | Back-to-back eval runs produce same pass/fail | Integration smoke | `npx tsx scripts/eval-gate.ts` (2 runs) | No — Wave 0 |
| EVAL-04 | Single command prints pass/fail summary, exits 1 on regression | Integration gate | `npx tsx scripts/eval-gate.ts` | No — Wave 0 |
| SC-5 | `groundingScore` present in returned envelope | Unit | `npm --prefix agent test -- envelope` | Extend envelope.test.ts — Wave 0 |

### Wave 0 Gaps

- [ ] `scripts/eval-gate.ts` — the new pre-demo command (covers EVAL-03 + EVAL-04)
- [ ] `agent/src/envelope.ts` — add `groundingScore: z.number().min(0).max(1)` field
- [ ] `agent/src/grounding.ts` — compute and inject `groundingScore` in `enforceGrounding`
- [ ] `agent/src/agent.ts` — add `temperature: 0` to `ToolLoopAgent`; remove `EnvelopeSchema.parse()` from `toCanonicalEnvelope` (or make `groundingScore` optional)
- [ ] `agent/test/envelope.test.ts` — extend to assert `groundingScore` present and in [0,1]
- [ ] `agent/test/grounding.test.ts` — extend to assert `groundingScore` computed correctly on full-grounded, partial, and zero-citation envelopes
- [ ] `agent/test/questions.eval.test.ts` — add `env.groundingScore` assertion to each locked question (present, in [0,1], === 1.0 for non-refused)

---

## Security Domain

Phase 8 is eval harness + schema extension — no new user-facing surface, no new auth, no new
injection vectors. Existing security considerations are unchanged:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Minimal | `groundingScore` is computed from trusted internal data (returnedIds + citation count); no user input involved |
| V6 Cryptography | No | No secrets, no crypto |
| Prompt injection in eval | Pre-existing | `faithfulness.ts` CR-01 injection strip already in place; eval-gate.ts only invokes vitest, no new prompt surface |

`eval-gate.ts` requires `OPENAI_API_KEY` and `ARANGO_*` env vars. It must NOT log these values
(existing `loadEnv()` discipline applies). The script exits non-zero on failure — no secret is
ever emitted in the summary output.

---

## Code Examples

### Adding groundingScore to EnvelopeSchema

```typescript
// Source: agent/src/envelope.ts [VERIFIED: codebase inspection — field is absent today]
// Add after reasoningTrace:
export const EnvelopeSchema = z.object({
  answer: z.string(),
  refused: z.boolean().default(false),
  claims: z.array(ClaimSchema),
  citations: z.array(CitationSchema),
  retrievalPath: z.array(RetrievalPathFragment),
  reasoningTrace: z.array(z.string()),
  groundingScore: z.number().min(0).max(1),
  // NOTE: not .optional() — enforceGrounding always injects this before returning.
  // SynthEnvelopeSchema in agent.ts does NOT include this field (computed post-synthesis).
});
```

### temperature: 0 on ToolLoopAgent

```typescript
// Source: agent/src/agent.ts; ToolLoopAgent param from ai-sdk.dev docs [VERIFIED: WebFetch]
const agent = new ToolLoopAgent({
  model: openai(PLANNER_MODEL),   // Responses API — no seed support; accepted
  instructions: PLANNER_SYSTEM_PROMPT,
  tools: TOOLS,
  stopWhen: stepCountIs(12),
  output: Output.object({ schema: SynthEnvelopeSchema }),
  temperature: 0,
  // seed: NOT set — Responses API silently ignores it (confirmed OpenAI community thread)
});
```

### eval-gate.ts skeleton (implementation-ready)

```typescript
// scripts/eval-gate.ts — shape for the planner
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const AGENT_DIR = path.resolve(__dirname, '../agent');

function runVitest(testNameFilter?: string): { passed: boolean; output: string } {
  const args = ['vitest', 'run', '--reporter=json'];
  if (testNameFilter) args.push('-t', testNameFilter);
  args.push('--', 'questions.eval');
  const result = spawnSync('npx', args, { cwd: AGENT_DIR, env: process.env, encoding: 'utf-8' });
  // Parse result.stdout as JSON (vitest json reporter)
  return { passed: result.status === 0, output: result.stdout };
}

async function main() {
  console.log('=== Customer360 Eval Gate ===');
  const run1 = runVitest();
  // ... parse failures, retry, print summary, exit
}
main();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Responses API with seed (silently ignored) | Chat Completions API for JUDGE via `openai.chat()` | Phase 7 (2026-06-19) | Judge determinism achieved; applies to `faithfulness.ts` only |
| No temperature control on planner | `temperature: 0` on `ToolLoopAgent` | Phase 8 (this phase) | Reduces planner variance; cannot achieve full determinism due to MoE routing |
| Re-run manually on flake | Bounded 1-retry in `eval-gate.ts` | Phase 8 (this phase) | Automated flake/regression distinction |
| No grounding score in envelope | `groundingScore` injected by `enforceGrounding` | Phase 8 (this phase) | Enables Phase 11 UI-06 trust signal without LLM judge on hot path |

**Deprecated/outdated:**
- The `>= 0.25` faithfulness floor (pre-07-review): was raised to 0.6 in Phase 7. Do not
  reference 0.25 anywhere in Phase 8 code or documentation.
- Judge via `openai()` (Responses API): replaced by `openai.chat()` in `faithfulness.ts`.
  Never revert the judge to the Responses API.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ToolLoopAgent` in `ai@6.0.208` accepts a top-level `temperature` constructor param | Planner Determinism | If not supported, temperature must be passed via `providerOptions` instead; would need to verify the AI SDK source |
| A2 | OpenAI Responses API does not support `seed` as of 2026-06-22 | Planner Determinism | If OpenAI ships seed support for the Responses API, planner seed becomes viable; would improve determinism but not change the recommended architecture |
| A3 | vitest `--reporter=json` output includes per-test failure messages (including the faithfulness score from the `expect(score, message)` assertion) | Gate Shape | If the message is not in JSON output, the summary reporter needs a different mechanism to extract per-Q scores (e.g., parse stdout) |
| A4 | `toCanonicalEnvelope` in `agent.ts` calls `EnvelopeSchema.parse()` directly (line 84) | groundingScore Pitfall 3 | If the parse call has been refactored away between Phase 7 and now, this pitfall is moot |

---

## Open Questions

1. **Does `ToolLoopAgent` in `ai@6.0.208` actually accept `temperature` at the constructor level?**
   - What we know: The AI SDK reference docs list `temperature` as a `ToolLoopAgent` constructor
     param. The installed version is 6.0.208. These should match.
   - What's unclear: Whether the installed version's TypeScript types expose it (the docs may
     describe a slightly newer minor version).
   - Recommendation: Run `tsc --noEmit` after adding `temperature: 0` — a type error confirms
     the param is absent; clean compile confirms it's present.

2. **How much does `temperature: 0` reduce planner variance in practice?**
   - What we know: The residual flake is ~5% (one in 20 runs). `temperature: 0` is the primary
     lever and should reduce this substantially.
   - What's unclear: Whether it eliminates the flake entirely or reduces it to ~1–2%.
   - Recommendation: After setting `temperature: 0`, run 5 consecutive eval runs before merging
     the phase. If any flake survives, the bounded retry in `eval-gate.ts` is the safety net.

3. **Will removing `EnvelopeSchema.parse()` from `toCanonicalEnvelope` break anything downstream?**
   - What we know: `toCanonicalEnvelope` is called in `runAgent()` in `agent.ts`. The result
     flows to `enforceGrounding()` in `index.ts`.
   - What's unclear: Whether any code path relies on parse-validation happening inside
     `toCanonicalEnvelope` vs. in `enforceGrounding`.
   - Recommendation: Move the parse to the end of `enforceGrounding` (after injecting
     `groundingScore`); run full vitest suite to confirm no regressions.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenAI API | planner + judge LLM calls | ✓ (via OPENAI_API_KEY in .env) | — | Skip guard `hasOpenAi()` in fixtures.ts |
| ArangoDB cluster | live eval DB reads | ✓ (via ARANGO_ENDPOINT in .env) | 3.12.x | Skip guard `hasLiveDb()` in fixtures.ts |
| `tsx` | `scripts/eval-gate.ts` | ✓ (devDep `tsx@4.22.4`) | 4.22.4 | — |
| `vitest` | test runner | ✓ (devDep `vitest@4.1.9`) | 4.1.9 | — |

**Missing dependencies with no fallback:** None — all required tools are installed.

---

## Sources

### Primary (HIGH confidence)

- `agent/src/faithfulness.ts` — module header, `JUDGE_MODEL`, `judgeClaimMajority`, `faithfulness`; verified chat vs. responses API distinction [VERIFIED: codebase inspection]
- `agent/src/agent.ts` — `PLANNER_MODEL`, `ToolLoopAgent` constructor, `openai(PLANNER_MODEL)` routing, `PLANNER_SYSTEM_PROMPT`, trend-cite rule [VERIFIED: codebase inspection]
- `agent/src/grounding.ts` — `enforceGrounding` logic; basis for groundingScore computation [VERIFIED: codebase inspection]
- `agent/src/envelope.ts` — `EnvelopeSchema` current shape; where groundingScore goes [VERIFIED: codebase inspection]
- `agent/test/questions.eval.test.ts` — `FAITHFULNESS_FLOOR = 0.6`, per-Q assertions, current gate structure [VERIFIED: codebase inspection]
- `.planning/phases/07-grounding-eval-demo-hardening/07-01-SUMMARY.md` — post-review fix history, root cause analysis, deferred items [VERIFIED: codebase inspection]
- `.planning/phases/07-grounding-eval-demo-hardening/07-VERIFICATION.md` — SC-1 PARTIAL status, trend-claim fix (ea911d4), residual ~5% flake classification [VERIFIED: codebase inspection]
- `.planning/todos/pending/2026-06-19-planner-undercites-trend-claims.md` — planner under-citation root cause, proposed solutions [VERIFIED: codebase inspection]
- ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent — `temperature`, `seed`, `providerOptions` as constructor params [CITED: ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent via WebFetch]

### Secondary (MEDIUM confidence)

- community.openai.com/t/support-for-seed-parameter-in-the-responses-api — seed NOT supported in Responses API [CITED: community.openai.com/t/support-for-seed-parameter-in-the-responses-api/1230489]
- ai-sdk.dev/providers/ai-sdk-providers/openai — `openai()` = Responses API (default since AI SDK 5); `openai.chat()` = Chat Completions [CITED: ai-sdk.dev/providers/ai-sdk-providers/openai via WebFetch]
- developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter — seed is "best-effort, not guaranteed"; system_fingerprint [CITED: official OpenAI cookbook]

### Tertiary (LOW confidence — for background only)

- towardsdatascience.com/avoidable-and-unavoidable-randomness-in-gpt-4o — MoE routing as source of non-determinism even at temperature=0; "no workaround" claim [LOW: single analysis article, not OpenAI official]

---

## Metadata

**Confidence breakdown:**
- Planner determinism (temperature param, seed unavailability): HIGH — verified via AI SDK docs + OpenAI community thread
- Gate architecture (vitest + wrapper + retry): HIGH — derived from existing codebase patterns
- groundingScore design: HIGH — pure-code derivation from existing `enforceGrounding` logic
- OpenAI Responses API seed status: MEDIUM — confirmed via community thread, not official OpenAI docs release notes
- MoE non-determinism claims: LOW — single article; directionally correct but not officially documented

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable domain; could change if OpenAI ships seed support for Responses API)
