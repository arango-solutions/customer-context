# Phase 7: Grounding/Eval + Demo Hardening — Research

**Researched:** 2026-06-19
**Domain:** RAG faithfulness eval (LLM-as-judge over retrieved records) + Vercel serverless hardening (canary/cron) for a dual-graph agent demo
**Confidence:** HIGH (codebase-grounded; stack pinned and read directly) / MEDIUM (RAGAS-style judge design from secondary sources, cross-verified)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** EXTEND the existing Phase-5 eval (`agent/test/questions.eval.test.ts`, currently 6 live questions + out-of-scope refusal, 7/7). Do NOT build a separate harness. Add adversarial/refusal variants to the same suite.
- **D-02:** Two-layer grounding: (a) the EXISTING deterministic `_id`-grounding gate (`enforceGrounding`) stays the hard floor; (b) ADD atomic-claim decomposition + an **LLM-judge entailment** pass that checks each atomic claim is *semantically* entailed by its cited record's content (not just that the `_id` exists). Catches "cites a real record that doesn't actually support the claim."
- **D-03:** Judge model = an OpenAI model (no Anthropic key). Planner/researcher picks exact model (gpt-4o-class default); keep judge prompts + rubric in-repo and deterministic-seeded where possible.
- **D-04:** DEFER the recorded/scripted backup path. Priority is a signal that *surfaces* failures, not a fallback that *hides* them.
- **D-05:** Build a **health/canary signal** — deepen `web/app/api/health/route.ts` (or add a sibling canary) so it exercises real ArangoDB connectivity + one end-to-end question → clear green/red read.
- **D-06:** Pre-warm via Vercel Cron (periodic ping warming the function + keep-alive arangojs client) PLUS a manual warm step. (Claude's discretion on cadence.)
- **D-07:** Rehearsal = adversarial questions (out-of-scope / privacy / not-in-data → must refuse) + LIGHT concurrent rehearsal (a few simultaneous `/api/ask` calls) on the real Vercel deploy. Not a load test.
- **D-08:** KEEP SSO protection on all `.vercel.app` URLs (no custom domain, no bypass). Presenter-driven from authenticated browser session.
- **D-09:** SKIP `/api/ask` per-IP rate-limit for v1 (keep AR-06-2 deferral).

### Claude's Discretion
- Exact eval file layout; claim-decomposition structure (one judge call per claim vs. batched); judge model id + temperature; cron cadence; precise canary endpoint shape. Deterministic `_id` gate stays the non-negotiable floor regardless.

### Deferred Ideas (OUT OF SCOPE)
- Recorded/scripted backup path (revisit when a real demo date is set).
- `/api/ask` per-IP rate-limit (re-open only on public custom domain).
- Custom domain / public access.
- Cross-graph subgraph viz (backlog 999.1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | An output-validation gate verifies each answer's claims are grounded in the retrieved records, run against the locked question set | LLM-judge entailment design (§1) layered on the existing `enforceGrounding` floor; extension of `questions.eval.test.ts` (§2). Per-claim NLI over the cited record's *content* (not just `_id` existence). |
| EVAL-02 | Demo hardening — pre-warm, a backup path, and adversarial-question rehearsal — completed before the live demo | Canary route + Vercel Cron pre-warm (§3); adversarial + light-concurrent rehearsal (§4). Recorded backup deferred per D-04. |
</phase_requirements>

## Summary

Phase 7 is an **eval + ops** phase, not a feature phase. The agent, grounding gate, envelope contract, and live deploy are all done and verified (Phase 6, 14/14 threats closed, Q12 end-to-end on `customer360-demo-jade.vercel.app`). Phase 7 must (1) prove every answer's claims are *semantically* supported by the records they cite — not just that the `_id` is real — and (2) make a live failure loud rather than silent.

The key architectural insight is the **two-tier trust model already established in the codebase**: `enforceGrounding` (pure code, `agent/src/grounding.ts`) is the hard floor — it rejects any citation `_id` not in the tool-returned set and converts ungrounded envelopes into structured refusals. The LLM judge (EVAL-01's new piece) sits *on top* and is **additive and advisory**: it catches the case the code gate structurally cannot — a citation `_id` that is real and was genuinely returned, but whose *content* does not actually entail the claim. The judge must NEVER be allowed to "rescue" a claim the code gate rejected, and must NEVER self-certify into production output. It is a **test-time grader**, not a runtime gate. This keeps the provider-independent code floor authoritative (CLAUDE.md cardinal rule: the model never self-certifies grounding).

**Primary recommendation:** Add a `faithfulness.ts` judge module (RAGAS-faithfulness pattern: atomic-claim decomposition → per-claim NLI entailment against the cited record's fetched content → score = supported/total) using AI SDK 6 `generateObject` on `gpt-4o` at `temperature: 0` + fixed `seed`. Wire it into the EXISTING `questions.eval.test.ts` as an additional assertion per non-refusal question (threshold: faithfulness === 1.0 for the 6 locked questions; ≥ a documented floor otherwise). Add 3-4 adversarial questions to the same suite asserting `refused === true`. Separately, deepen `/api/health` into a real DB-round-trip + one canned end-to-end question canary, and add a `vercel.json` cron entry (every 5-10 min) hitting it, secured by `CRON_SECRET` (which works *despite* SSO — cron requests originate inside Vercel and bypass deployment protection).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deterministic `_id` grounding (hard floor) | Agent (`grounding.ts`, pure code) | — | Already exists; provider-independent trust boundary. Never moves. |
| Atomic-claim decomposition + entailment (faithfulness grade) | Agent test layer (new `faithfulness.ts`, called from vitest) | OpenAI (judge model) | Test-time grader. Lives in `agent/` next to the eval, not on the runtime answer path. |
| Locked-question regression + adversarial refusal eval | Agent test (`questions.eval.test.ts`, extended) | ArangoDB + OpenAI (live) | The phase gate. Green/red over the 6 questions + refusals. |
| Health/canary (DB round-trip + 1 end-to-end question) | Frontend server (Next route, Node runtime) | Agent + ArangoDB | Must run on the deployed serverless path to prove the *live* path works (D-05). |
| Pre-warm scheduling | Vercel platform (Cron) | Frontend server (canary route) | Cron is a Vercel infra feature configured in `vercel.json`; hits the canary route. |
| Concurrent/adversarial rehearsal | External script / manual | Deployed `/api/ask` | A few simultaneous fetches against prod; not a tier in the app, a rehearsal harness. |

## Standard Stack

### Core (all already installed — verified from package.json)
| Library | Version (pinned) | Purpose in Phase 7 | Notes |
|---------|------------------|--------------------|-------|
| `ai` | 6.0.208 | `generateObject` for the judge; the agent it evals | Already a dependency in `agent/` and `web/`. `generateObject` is the structured-output primitive. [VERIFIED: agent/package.json] |
| `@ai-sdk/openai` | 3.0.73 | The judge model provider (`openai('gpt-4o')`) | Same provider the planner uses (D-06, OpenAI-only). [VERIFIED: agent/package.json] |
| `zod` | 4.4.3 | The judge's output schema (per-claim verdict array) | Note: this repo is on **Zod 4**, not 3. Strict-mode caveat already handled in `agent.ts` (nullable not optional). [VERIFIED: agent/package.json] |
| `vitest` | 4.1.9 | The eval harness to EXTEND (D-01) | `questions.eval.test.ts` already drives it; add assertions + adversarial `it()` blocks. [VERIFIED: agent/package.json] |
| `arangojs` | 10.3.1 | The judge fetches the cited record's *content* by `_id` to NLI against | The judge needs the record body, not just the id — fetch via `db.collection(coll).document(key)` or an AQL `DOCUMENT(_id)`. [VERIFIED: agent/package.json] |

### Supporting — no new packages required
The phase introduces **zero new runtime dependencies**. The judge, canary, and cron are all built from the installed stack + a `vercel.json` config block. This is important for the slopcheck posture (nothing to audit) and for the lean-demo scope.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled judge in `generateObject` | `ragas` / `deepeval` (Python) | A second language/runtime + a separate eval service. The eval already lives in TS/vitest against `askQuestion()`; a Python harness would re-implement the live path. Rejected — D-01 says extend the TS suite. |
| `gpt-4o` judge | `gpt-4o-mini` judge | mini is cheaper but NLI entailment over contract/legal text benefits from the larger model's discrimination; with only ~6 questions × a handful of claims, cost is negligible. Recommend `gpt-4o` for the grader; `gpt-4o-mini` acceptable if cost matters. Keep the id behind a `JUDGE_MODEL` env constant (mirror `PLANNER_MODEL`). |
| Deepening `/api/health` in place | New `/api/canary` sibling route | `/api/health` is currently a *build smoke* (pure import, no env, threat T-06-01 relies on it touching no secrets). Deepening it into a DB+OpenAI canary **changes its threat posture** (it now reads env + makes a live agent call). Recommend a **separate `/api/canary` route** so the cheap build-smoke health check stays secret-free, and the expensive canary is its own surface. (Claude's discretion per D-05 — but flag the threat-posture change either way.) |

**Installation:** None. All dependencies present.

**Version verification:** Confirmed by reading `agent/package.json` and `web/package.json` directly. `ai@6.0.208`, `@ai-sdk/openai@3.0.73`, `arangojs@10.3.1`, `zod@4.4.3`, `vitest@4.1.9`, `next@15.5.19`. No registry guess needed — these are the locked, building, deployed versions.

## Package Legitimacy Audit

> Phase 7 installs **no new external packages**. All libraries used are already present, pinned, building, and deployed (Phases 5–6). No slopcheck run required.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none — no new installs) | — | N/A |

## Architecture Patterns

### System Architecture Diagram

```
EVAL-01 (test-time, vitest, live OpenAI + live ArangoDB)
─────────────────────────────────────────────────────────
  locked question ─► askQuestion()  ──►  Envelope { claims[], citations[], refused }
                                              │
                          ┌───────────────────┴───────────────────┐
                          │                                        │
            (TIER 1 — already inside askQuestion)        (TIER 2 — NEW, test-only grader)
            enforceGrounding(env, returnedIds)           faithfulness(env) :
            • every cited _id ∈ tool-returned set          for each claim:
            • else → structured refusal                      1. fetch cited record CONTENT by _id (arangojs)
            HARD FLOOR — authoritative                       2. generateObject NLI: "does content entail claim?"
                          │                                  score = supported / total
                          ▼                                       │
            vitest asserts: refused===false,                      ▼
            reconciliation, contract              vitest asserts: faithfulness === 1.0 (locked Qs)
                                                  ADVISORY — flags real-id-but-wrong-content

  adversarial question ─► askQuestion() ─► assert refused===true, no fabricated _id


EVAL-02 (runtime/ops, on the deployed Vercel function)
─────────────────────────────────────────────────────────
  Vercel Cron (every 5–10 min, Authorization: Bearer CRON_SECRET)
        │  bypasses SSO (originates inside Vercel)
        ▼
  GET /api/canary  (Node runtime)
        │  1. arangojs round-trip (DOCUMENT/collection.count) → warms db singleton
        │  2. one canned end-to-end question → askQuestion() → assert grounded+non-refused
        ▼
  { status: "green"|"red", db: ok, agent: ok, ms }   ← clear "is it working" read

  Rehearsal (manual / script): N simultaneous POST /api/ask → assert all 200 + grounded
```

### Recommended Project Structure (additions only)
```
agent/
├── src/
│   └── faithfulness.ts        # NEW: atomic-claim decomposition + per-claim NLI judge
├── test/
│   ├── questions.eval.test.ts # EXTEND: add faithfulness assertions + adversarial it() blocks
│   ├── adversarial.ts         # NEW (optional): the adversarial question set as data
│   └── faithfulness.test.ts   # NEW (optional): unit-test the judge logic with a fake model
web/
└── app/api/
    └── canary/route.ts        # NEW: deep DB+agent canary (Node runtime, CRON_SECRET-guarded)
web/vercel.json                # EXTEND: add "crons" block + canary maxDuration
scripts/
└── rehearse.ts (or .sh)       # NEW: fire N concurrent /api/ask, assert graceful (D-07)
```

### Pattern 1: RAGAS-style faithfulness judge (the EVAL-01 core)
**What:** Decompose the answer into atomic claims, then for each claim run an NLI ("does this content entail this claim?") against the *content of the record(s) it cites*. Score = supported / total. The envelope already carries `claims[]` each with `citations[]` — so decomposition is largely **already done by the planner** (D-03 per-claim atoms). The judge's job is the per-claim entailment, not re-decomposition.
**When to use:** As an assertion inside the eval, per non-refusal question, AFTER `enforceGrounding` has already passed.
**Example (judge shape — verify exact AI SDK 6 signatures against installed `ai@6.0.208` at implement time):**
```typescript
// agent/src/faithfulness.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from './db.js';
import type { Envelope, Claim } from './envelope.js';

export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gpt-4o';

// One verdict per claim. Abstain is explicit so a judge that "isn't sure"
// does NOT silently count as supported (anti-flaky, see Pitfall 2).
const VerdictSchema = z.object({
  verdict: z.enum(['supported', 'unsupported', 'abstain']),
  rationale: z.string(),
});

/** Fetch the textual content of a cited record so the judge sees what the claim must entail. */
async function recordText(_id: string): Promise<string> {
  const doc = await db.query(
    // DOCUMENT() resolves a full record by _id; project the human-readable fields.
    // (Field set is collection-specific — keep a small per-collection projector.)
    `RETURN DOCUMENT(@id)`, { id: _id },
  ).then((c) => c.next());
  return JSON.stringify(doc); // or a projected, content-only string
}

export async function judgeClaim(claim: Claim): Promise<'supported' | 'unsupported' | 'abstain'> {
  const evidence = (await Promise.all(claim.citations.map((c) => recordText(c._id)))).join('\n---\n');
  const { object } = await generateObject({
    model: openai(JUDGE_MODEL),
    schema: VerdictSchema,
    temperature: 0,          // determinism (Pitfall 2)
    seed: 7,                 // reproducible sampling where the model supports it
    system:
      'You are a strict grounding judge. Decide ONLY whether the EVIDENCE entails the CLAIM. ' +
      'Use natural-language inference: "supported" iff the claim is directly inferable from the ' +
      'evidence text; "unsupported" if it contradicts or is not present; "abstain" if the ' +
      'evidence is unreadable/irrelevant. Do NOT use outside knowledge. Do NOT be generous.',
    prompt: `CLAIM:\n${claim.text}\n\nEVIDENCE (the cited record content):\n${evidence}`,
  });
  return object.verdict;
}

/** RAGAS faithfulness = supported / total. abstain counts as NOT supported (conservative). */
export async function faithfulness(env: Envelope): Promise<{ score: number; unsupported: Claim[] }> {
  const verdicts = await Promise.all(env.claims.map(async (cl) => ({ cl, v: await judgeClaim(cl) })));
  const supported = verdicts.filter((x) => x.v === 'supported').length;
  return {
    score: env.claims.length === 0 ? 1 : supported / env.claims.length,
    unsupported: verdicts.filter((x) => x.v !== 'supported').map((x) => x.cl),
  };
}
```
**Source:** RAGAS faithfulness definition (supported claims / total claims; NLI per claim) — [CITED: saulius.io/blog/ragas-rag-evaluation-metrics-llm-judge], [CITED: snowflake.com engineering-blog benchmarking-LLM-as-a-judge]. `generateObject` + `seed`/`temperature` — [CITED: vercel-ai.mintlify.app/reference/ai-sdk-core/generate-object].

### Pattern 2: Judge is advisory, code gate is authoritative (the trust ordering)
**What:** In the eval, run `enforceGrounding` first (it already runs *inside* `askQuestion`). Only call the judge on the SURVIVING grounded envelope. The judge's failure is a *test failure*, never a runtime refusal-override.
**When to use:** Always. The judge must not be on the `/api/ask` path.
**Why:** If the judge could promote a claim the code gate refused, you'd reopen exactly the hallucination surface the project exists to close (CLAUDE.md cardinal rule; `grounding.ts` header comment). The code gate is provider-independent; the judge is a probabilistic grader.

### Pattern 3: Canary as a real end-to-end probe (the EVAL-02 core)
**What:** A Node-runtime route that does (1) a cheap arangojs round-trip to warm/verify the DB singleton, and (2) one fixed end-to-end `askQuestion()` against a known-answerable question (e.g. the Q7 anchor — structured-only, fastest, deterministic), then asserts `refused === false` and `citations.length > 0`. Returns `{status, db, agent, ms}`.
**Why Q7 for the canary:** structured-only → no hybrid embedding call → fastest, cheapest, most deterministic of the six; still proves DB + planner + grounding end-to-end. Q12 would prove dual-graph but is slower/costlier — use it in the eval, not the every-5-min canary.

### Anti-Patterns to Avoid
- **Judge on the runtime answer path.** It adds latency, cost, non-determinism, and a self-certification surface. Test-time only.
- **Abstain counts as supported.** A hedging judge would inflate faithfulness. Count abstain as not-supported (conservative).
- **Deepening `/api/health` without acknowledging its threat-posture change.** It is currently secret-free by design (T-06-01). A DB+agent canary reads env + calls OpenAI — prefer a separate `/api/canary` route and re-state the threat note.
- **Cron hitting `/api/ask` with no auth.** Use a dedicated canary route guarded by `CRON_SECRET`; do not let cron warm the public answer surface unauthenticated.
- **Edge runtime for the canary.** arangojs needs `node:https`; canary MUST be `runtime = 'nodejs'` (same as `/api/ask`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claim decomposition | A sentence splitter / regex claim extractor | The planner already emits per-claim atoms (`Envelope.claims[]`, D-03) | Decomposition is done; re-splitting would diverge from what's actually cited. |
| Structured judge output parsing | Hand-parsed JSON from a chat completion | `generateObject` + Zod `VerdictSchema` | Schema-validated, strict-mode, same primitive the planner uses. |
| Cron scheduling / retries | A custom setInterval / external scheduler | Vercel Cron (`vercel.json` `crons`) | Native, free on the plan, auto-injects `Authorization: Bearer $CRON_SECRET`. |
| Cron auth | A custom token scheme | `CRON_SECRET` env var | Vercel injects it automatically; verify `req.headers.authorization === \`Bearer ${process.env.CRON_SECRET}\``. |
| Deterministic grounding | Anything model-based | The EXISTING `enforceGrounding` | It's the hard floor; do not replace or wrap it with the judge. |

**Key insight:** The hard part (per-claim citations, the deterministic gate, the live deploy) is already built. Phase 7 is wiring a grader and a heartbeat on top — resist rebuilding the floor.

## Common Pitfalls

### Pitfall 1: The judge "rescues" or overrides the code gate
**What goes wrong:** Treating the LLM judge as the grounding authority, letting a "supported" verdict pass a claim the `_id` gate would reject (or vice-versa).
**Why it happens:** Conflating EVAL-01's *grade* with the runtime *gate*.
**How to avoid:** Judge runs only on the post-`enforceGrounding` envelope, only in tests, and only produces an assertion. Keep them strictly ordered: code gate → (if it passed) judge grade.
**Warning signs:** `faithfulness()` imported anywhere under `web/app/api/`, or called inside `index.ts`/`stream.ts`.

### Pitfall 2: Flaky judge (non-determinism)
**What goes wrong:** The same answer scores 1.0 one run and 0.83 the next; the green/red gate becomes noisy and gets ignored.
**Why it happens:** Default temperature/sampling; ambiguous rubric; abstain treated inconsistently.
**How to avoid:** `temperature: 0` + fixed `seed`; a crisp 3-way rubric (supported/unsupported/abstain) with "do not use outside knowledge / do not be generous"; abstain = not-supported. For the 6 locked questions assert `=== 1.0` (they are designed to be fully answerable). For adversarial/edge, assert against a documented floor, not exact equality.
**Warning signs:** Eval passes/fails intermittently with no code change. (Note: OpenAI `seed` is best-effort, not a hard guarantee — temperature 0 + strict rubric is the primary lever; `seed` is belt-and-suspenders.)

### Pitfall 3: arangojs cold-start on serverless
**What goes wrong:** First request after idle pays a fresh TLS handshake + auth round-trip; under `maxDuration` pressure a cold canary or first demo question can be slow or time out.
**Why it happens:** Serverless functions freeze; the `db` singleton (`db.ts`) is per-instance and lost when the instance recycles.
**How to avoid:** This is exactly what D-06 pre-warm addresses — Vercel Cron pings the canary every 5–10 min to keep an instance warm with a live `db` singleton; PLUS a manual warm immediately before any live run. Keep `runtime='nodejs'`. Cadence trade-off: ≤5 min keeps instances reliably warm but burns more invocations + OpenAI calls (each canary does one real question); 10 min is cheaper but a cold window is more likely. **Recommend 5 min during active demo windows, with manual warm as the guaranteed belt.**
**Warning signs:** First-question latency >> subsequent; 504s only on the first call.

### Pitfall 4: Cron blocked by SSO / deployment protection
**What goes wrong:** SSO (D-08) is on; a naive assumption is that cron can't reach a protected route.
**Why it happens:** Confusing browser SSO with internal platform requests.
**How to avoid:** Vercel Cron requests originate **inside** Vercel and are **not** subject to Deployment Protection / SSO — they reach the route directly. Secure the route yourself with `CRON_SECRET` (Vercel auto-adds `Authorization: Bearer $CRON_SECRET`). So: SSO stays on for humans (D-08), cron still works, and the canary is protected by the bearer check. No bypass token, no `VERCEL_AUTOMATION_BYPASS_SECRET` needed for cron. [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]
**Warning signs:** Canary route returns the SSO HTML challenge page to a browser (expected for humans) — but cron logs show 200s. If cron logs 401, the `CRON_SECRET` check is misconfigured.

### Pitfall 5: Stale-shell env in the eval (the project's recurring gotcha)
**What goes wrong:** A stale shell `OPENAI_API_KEY` (…5CAA) 401s and shadows the valid `.env` key; the eval/judge fails for the wrong reason.
**Why it happens:** Documented machine gotcha ([[openai-key-env-gotcha]], `db.ts` header).
**How to avoid:** The eval already calls `loadEnv()` at module scope BEFORE the skip-guard (override:true — the TS analog of `load_dotenv(override=True)`). The judge reuses `process.env.OPENAI_API_KEY` loaded by that same `loadEnv()`. Do NOT add a second env loader in `faithfulness.ts` — rely on the test's `loadEnv()` (mirror the `stream.ts` no-double-load discipline, T-06-04).
**Warning signs:** 401 from OpenAI in the eval while `cat .env` shows a valid key.

### Pitfall 6: Canary cost/latency creep
**What goes wrong:** A canary that runs Q12 (dual-graph, hybrid embedding) every 5 min adds real OpenAI + embedding spend and slows the heartbeat.
**How to avoid:** Canary uses the cheapest end-to-end probe (Q7 structured-only). Reserve dual-graph coverage for the eval, which runs on demand, not on a schedule.

## Code Examples

### Vercel Cron config (`web/vercel.json`)
```jsonc
// EXTENDS the existing web/vercel.json (already has functions["app/api/ask/route.ts"].maxDuration)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install --prefix ..",
  "functions": {
    "app/api/ask/route.ts":    { "maxDuration": 60 },
    "app/api/canary/route.ts": { "maxDuration": 60 }
  },
  "crons": [
    { "path": "/api/canary", "schedule": "*/5 * * * *" }  // every 5 min; tune per Pitfall 3
  ]
}
```
**Source:** [CITED: vercel.com/docs/cron-jobs] — `crons[]` with `path` + cron `schedule`; `CRON_SECRET` auto-injected as `Authorization: Bearer`.

### Canary route (`web/app/api/canary/route.ts`)
```typescript
import { askQuestion } from 'customer360-agent';
import { db } from 'customer360-agent';   // re-export the singleton if needed, or a count probe

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  // CRON_SECRET guard — cron bypasses SSO, so we gate the route ourselves (Pitfall 4).
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const t0 = Date.now();
  try {
    // 1) DB round-trip (warms + verifies the arangojs singleton).
    // 2) one canned end-to-end question (Q7 anchor — fastest, structured-only).
    const env = await askQuestion(/* the locked Q7 anchor prompt */);
    const ok = env.refused === false && env.citations.length > 0;
    return Response.json({ status: ok ? 'green' : 'red', agent: ok, ms: Date.now() - t0 },
      { status: ok ? 200 : 503 });
  } catch {
    return Response.json({ status: 'red', error: true, ms: Date.now() - t0 }, { status: 503 });
  }
}
```
*(Do not echo error detail — same T-06-07 posture as `/api/ask`. Threat-posture note: this route reads env + calls OpenAI/DB, unlike `/api/health`; document it as a new surface in 07-SECURITY.)*

### Extending the eval (`agent/test/questions.eval.test.ts`)
```typescript
import { faithfulness } from '../src/faithfulness.js';

// inside each non-refusal it(): after assertWellFormed + refused===false
const { score, unsupported } = await faithfulness(env);
expect(score, `unsupported claims: ${unsupported.map(c => c.text).join(' | ')}`).toBe(1);

// NEW adversarial it() blocks (D-07) — out-of-scope / privacy / not-in-data:
it('adversarial — competitor pricing not in data → refuses', async () => {
  const env = await askQuestion("What is Databricks' internal pricing for Meridian Logistics?");
  expect(EnvelopeSchema.safeParse(env).success).toBe(true);
  expect(env.refused).toBe(true);                 // must refuse, never fabricate
  // no fabricated _id survives:
  for (const c of env.citations) expect(/^[A-Za-z0-9_]+\/.+/.test(c._id)).toBe(true);
}, 180_000);
```

### Light concurrent rehearsal (`scripts/rehearse.ts`)
```typescript
// D-07: a FEW simultaneous /api/ask calls against the deployed surface; assert graceful, not a load test.
const N = 4;
const q = "Is Meridian Logistics at risk at renewal, and why?";
const calls = Array.from({ length: N }, () =>
  fetch(`${BASE}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json',
    /* SSO bypass token for automation if hitting the protected deploy */ },
    body: JSON.stringify({ question: q }) }));
const results = await Promise.all(calls);
for (const r of results) console.assert(r.ok, `expected 200, got ${r.status}`);
```
*(Note: to hit the SSO-protected deploy from a script you need `VERCEL_AUTOMATION_BYPASS_SECRET` as a query param/header — Protection Bypass for Automation. Alternatively rehearse from the authenticated browser session per D-08. [CITED: vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation])*

## Runtime State Inventory

> Not a rename/refactor/migration phase. Section omitted (no stored-string surface changes).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Exact-string / overlap grounding metrics | LLM-as-judge NLI faithfulness (RAGAS-style) | 2023→ standard by 2024-25 | Catches paraphrased/semantically-unsupported claims string-match misses — exactly the "real id, wrong content" gap D-02 targets. [CITED: snowflake.com benchmarking-LLM-as-a-judge] |
| Single-temperature judge | temperature 0 + seed + explicit abstain | current best practice | Reduces eval flakiness so green/red stays trustworthy. |
| Backup recorded-demo path | Failure-surfacing canary + pre-warm | D-04/D-05 (this phase) | Project pivots from hiding failure to detecting it (dev-stage priority). |

**Deprecated/outdated:** Nothing in the installed stack is deprecated for this phase. AI SDK 6 `generateObject` is the current structured-output primitive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gpt-4o` is the right judge model id resolvable against the live `OPENAI_API_KEY` | Standard Stack / §1 | LOW — `PLANNER_MODEL` already uses `gpt-4.1`/`gpt-4o-mini` successfully; keep `JUDGE_MODEL` env-overridable so a 404 model id is a one-line fix. ASSUMED until confirmed against the live key at implement time. |
| A2 | OpenAI honors `seed` for `generateObject` deterministically enough | Pitfall 2 | LOW — `seed` is documented as best-effort; `temperature:0` + strict rubric is the primary determinism lever, seed is secondary. [ASSUMED] |
| A3 | Vercel Cron bypasses SSO/Deployment Protection (internal origin) | Pitfall 4 | MEDIUM — verified against Vercel docs (cron + CRON_SECRET pattern), but confirm in the project's Vercel plan/settings during implement (Hobby vs Pro cron limits/cadence differ). [CITED, verify on deploy] |
| A4 | `DOCUMENT(@id)` returns enough human-readable content for the judge to NLI against | §1 judge | MEDIUM — some collections (e.g. Chunk) store the text in a specific field; may need a small per-collection content projector rather than dumping the whole doc. [ASSUMED — confirm against actual collection schemas in Phase 3 output] |
| A5 | The planner's `claims[]` atoms are granular enough that per-claim NLI is meaningful (no need to re-decompose) | §1 / Don't Hand-Roll | LOW-MEDIUM — D-03 mandates per-claim atoms; if a claim bundles multiple facts, NLI may be coarse. Inspect a real Q12 envelope's `claims[]` granularity during implement. [ASSUMED] |
| A6 | Vercel cron `schedule` cadence (every 5 min) is allowed on the project's plan | §3 / vercel.json | MEDIUM — Hobby plan limits cron frequency (daily on some tiers); Pro allows minute-level. Confirm the plan; fall back to the coarsest allowed + manual warm if limited. [ASSUMED — verify on deploy] |

## Open Questions

1. **Faithfulness threshold for the 6 locked questions: exactly 1.0, or a floor?**
   - What we know: the 6 questions are designed to be fully answerable with grounded records; a non-1.0 score means either a genuinely unsupported claim (a real bug to fix) or a judge false-negative.
   - Recommendation: assert `=== 1.0` for the locked six (any drop is investigated, not tolerated); use a documented floor (e.g. ≥0.8) only if a judge false-negative is proven and can't be eliminated by rubric tuning. Surface `unsupported` claim texts in the assertion message so a red is diagnosable.

2. **Separate `/api/canary` vs. deepen `/api/health`?**
   - What we know: D-05 allows either; `/api/health` is currently secret-free (T-06-01) and deepening it changes that.
   - Recommendation: separate `/api/canary` (keeps the cheap build-smoke health check clean; isolates the new env-reading surface). Either way, add the new surface to 07-SECURITY.

3. **Cron cadence vs. cost vs. plan limits.**
   - What we know: more frequent = warmer but costs an OpenAI question per ping + may exceed plan cron limits.
   - Recommendation: 5 min if the plan allows + manual warm as the guaranteed belt; otherwise coarsest allowed + lean entirely on manual warm before a live run.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenAI API (`OPENAI_API_KEY`) | judge (§1) + planner | ✓ (in `.env`; mind stale-shell gotcha) | gpt-4o / gpt-4.1 | none — D-06 OpenAI-only; no Anthropic key |
| ArangoDB cluster (`ARANGO_*`) | eval + canary | ✓ (shared prod ArangoGraph cluster) | 3.12.9-1 enterprise | none — eval/canary self-skip when env absent (`hasLiveDb()`) |
| Vercel Cron | pre-warm (D-06) | ✓ on deploy (verify plan cadence — A6) | — | manual warm step (D-06 already pairs both) |
| `CRON_SECRET` env var | canary auth | ✗ NOT yet set | — | must be added to Vercel project env (≥16 random chars) before cron works |

**Missing dependencies with no fallback:** `CRON_SECRET` must be created in Vercel project env vars (and locally for testing the guard). This is a setup task the plan must include.
**Missing with fallback:** Cron cadence limits (A6) → fall back to manual warm.

## Validation Architecture

> `workflow.nyquist_validation: true` (config.json) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 (already configured in `agent/`) |
| Config file | `agent/` vitest (existing; `questions.eval.test.ts` runs under it) |
| Quick run command | `npm --prefix agent test -- questions.eval` (live; needs `.env`) |
| Full suite command | `npm --prefix agent test` (unit + live; live blocks self-skip when env absent) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVAL-01 | Each non-refusal locked answer's claims are entailed by their cited records (faithfulness === 1.0) | integration (live OpenAI+DB) | `npm --prefix agent test -- questions.eval` | ⚠️ EXTEND `questions.eval.test.ts` + new `faithfulness.ts` |
| EVAL-01 | Adversarial/privacy/not-in-data questions refuse (no fabricated `_id`) | integration (live) | `npm --prefix agent test -- questions.eval` | ❌ Wave 0 (add adversarial `it()` blocks) |
| EVAL-01 | The deterministic `_id` floor still passes for all six (regression) | integration (live) | (existing assertions in suite) | ✅ exists |
| EVAL-01 | Judge logic (decompose→NLI→score) is correct with a fake model | unit (no live) | `npm --prefix agent test -- faithfulness` | ❌ Wave 0 (optional `faithfulness.test.ts` with injected model) |
| EVAL-02 | Canary returns green when DB+agent healthy, red on failure | integration / manual `curl` | `curl -H "Authorization: Bearer $CRON_SECRET" $BASE/api/canary` | ❌ Wave 0 (`web/app/api/canary/route.ts`) |
| EVAL-02 | Cron is configured + reaches the canary (200, not 401/SSO) | manual (Vercel logs) | `vercel logs` after deploy; check cron invocation 200 | ❌ manual-only (platform behavior) |
| EVAL-02 | N concurrent `/api/ask` all return grounded 200 | manual/script | `node scripts/rehearse.ts` (or browser session per D-08) | ❌ Wave 0 (`scripts/rehearse.ts`) |

### Sampling Rate
- **Per task commit:** `npm --prefix agent test` (unit suite always; live blocks self-skip in CI without `.env`).
- **Per wave merge:** `npm --prefix agent test -- questions.eval` against live (the EVAL-01 gate).
- **Phase gate:** full eval green (6/6 faithfulness===1.0 + adversarial refusals) AND a manual canary `curl` returning green AND a cron 200 confirmed in `vercel logs` before `/gsd-verify-work`.

### How we know the canary/cron themselves work (the meta-validation, per focus §6)
- **Canary correctness:** assert both directions — a green path (call the real canary, expect `status:green`) AND a forced-red path (temporarily point at a bad question or break DB creds in a local run, expect `503/red`). A canary that can only ever say green is worthless.
- **Cron actually fires:** after deploy, confirm in `vercel logs` that the cron invocation hit `/api/canary` and returned 200 (not 401 → secret misconfig, not the SSO challenge page → would mean it's being treated as a browser request). This is manual-only — platform scheduling can't be unit-tested.
- **Auth guard works:** `curl $BASE/api/canary` with NO bearer → expect 401 (proves the guard); with the correct bearer → expect 200.

### Wave 0 Gaps
- [ ] `agent/src/faithfulness.ts` — the judge (decompose→NLI→score) — covers EVAL-01
- [ ] `agent/test/questions.eval.test.ts` — add faithfulness assertions + adversarial `it()` blocks — EVAL-01
- [ ] `agent/test/faithfulness.test.ts` (optional) — unit-test judge with an injected fake model (anti-flaky proof without live cost)
- [ ] `web/app/api/canary/route.ts` — deep DB+agent canary, CRON_SECRET-guarded — EVAL-02
- [ ] `web/vercel.json` — add `crons[]` + canary `maxDuration`
- [ ] `scripts/rehearse.ts` — light concurrent rehearsal — EVAL-02 (D-07)
- [ ] Vercel env: create `CRON_SECRET` (≥16 random chars) in project settings + local `.env`

## Security Domain

> `security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Canary route guarded by `CRON_SECRET` bearer check; SSO unchanged (D-08). |
| V3 Session Management | no | No new sessions; presenter-driven SSO session unchanged. |
| V4 Access Control | yes | Canary is NOT a public answer surface; bearer-gated. `/api/ask` rate-limit still deferred (AR-06-2, D-09). |
| V5 Input Validation | yes (inherited) | Canary takes no user input (fixed canned question); `/api/ask` already Zod-caps (T-06-05). |
| V6 Cryptography | no | No new crypto; `CRON_SECRET` is a shared secret, not hand-rolled crypto. |
| V7 Error Handling / Logging | yes | Canary must NOT echo error detail (same T-06-07 posture as `/api/ask`); generic 503 body. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated canary triggers expensive agent runs (cost DoS) | Denial of Service | `CRON_SECRET` bearer guard; 401 without it. |
| Canary leaks DB error / stack / secret on failure | Information Disclosure | Generic `{status:'red'}` 503; no error body (mirror T-06-07). |
| New env-reading surface (canary reads `ARANGO_*`/`OPENAI_API_KEY`) widens disclosure surface vs. secret-free `/api/health` | Information Disclosure | Separate `/api/canary` route; document as a new surface in 07-SECURITY; never serialize secrets into the response. |
| Judge model self-certifies grounding into output | Spoofing (fabricated sourcing) | Judge is test-time only, advisory; runtime gate stays `enforceGrounding` (Pitfall 1). |
| LLM judge prompt-injection via answer text inflates score | Tampering | Judge rubric: "do not use outside knowledge, do not be generous"; abstain=unsupported; test-only so no production impact. |

**Carry-forward:** AR-06-2 (no `/api/ask` rate-limit) is intentionally NOT closed in Phase 7 (D-09) — re-state it as still-accepted in 07-SECURITY.

## Sources

### Primary (HIGH confidence)
- Codebase (read directly): `agent/src/{grounding,agent,stream,index,db,envelope}.ts`, `agent/test/{questions.eval.test.ts,fixtures.ts}`, `web/app/api/{ask,health}/route.ts`, `web/vercel.json`, `agent/package.json`, `web/package.json`, `.planning/config.json`, `07-CONTEXT.md`, `REQUIREMENTS.md`, `06-SECURITY.md`, `docs/research/locked-questions-and-data-map.md`.
- [vercel.com/docs/cron-jobs/manage-cron-jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — `crons[]` config, `CRON_SECRET` bearer injection.
- [vercel.com/docs/deployment-protection/.../protection-bypass-automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) — automation bypass for scripted rehearsal against SSO-protected deploys.
- [vercel-ai.mintlify.app/reference/ai-sdk-core/generate-object](https://vercel-ai.mintlify.app/reference/ai-sdk-core/generate-object) — `generateObject`, `seed`, schema.

### Secondary (MEDIUM confidence)
- [saulius.io/blog/ragas-rag-evaluation-metrics-llm-judge](https://saulius.io/blog/ragas-rag-evaluation-metrics-llm-judge) — faithfulness = supported/total; per-claim NLI.
- [snowflake.com engineering-blog benchmarking-LLM-as-a-judge-RAG-triad-metrics](https://www.snowflake.com/en/engineering-blog/benchmarking-LLM-as-a-judge-RAG-triad-metrics/) — LLM-as-judge for RAG faithfulness.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read directly from package.json; no new packages.
- Faithfulness judge design: MEDIUM-HIGH — RAGAS pattern well-established + cross-verified; exact `generateObject` signature to confirm against `ai@6.0.208` at implement.
- Canary/cron + SSO interaction: MEDIUM-HIGH — Vercel docs confirm cron+CRON_SECRET bypasses SSO; confirm plan cron cadence on deploy (A6).
- Pitfalls: HIGH — most are codebase-grounded (env gotcha, cold start, runtime, threat posture) or directly documented.

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 (stack pinned; Vercel cron/plan behavior is the most likely to drift — confirm on deploy).
