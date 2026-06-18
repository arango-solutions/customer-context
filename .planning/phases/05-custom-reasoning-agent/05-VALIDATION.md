---
phase: 05
slug: custom-reasoning-agent
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-18
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (first TS surface in the repo — Wave 0 installs) |
| **Config file** | none — Wave 0 scaffolds `vitest.config.ts` in the new TS package |
| **Quick run command** | `npm test -- --run` (from the TS package dir) |
| **Full suite command** | `npm test -- --run` + the agent CLI smoke against the 6 locked questions |
| **Estimated runtime** | ~30–90 seconds (unit) ; live-DB/agent runs longer, gated separately |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run full suite (unit + CLI smoke)
- **Before `/gsd-verify-work`:** Full suite green; the 6 locked questions return valid envelopes
- **Max feedback latency:** 90 seconds (unit); live-agent eval is a separate gated step

---

## Per-Task Verification Map

> Filled by the planner. Skeleton below reflects the research's Wave-0 prerequisites and the per-requirement coverage the planner must honor.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 05-01 | 0 | infra (ANTHROPIC_API_KEY) | T-05-01 | secret in gitignored .env, never committed | checkpoint | `grep -q '^ANTHROPIC_API_KEY=.\+' .env` | ❌ W0 | ⬜ pending |
| 05-01-T2 | 05-01 | 0 | AGENT-01/03 (envelope D-03a) | T-05-SC | pinned deps (no ai@7), Zod EnvelopeSchema contract | unit | `cd agent && npx vitest run test/envelope.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 05-01-T3 | 05-01 | 0 | AGENT-03 (hybrid spike) | T-05-02/03 | idempotent view DDL via JWT; read-only spike | integration | `cd agent && npx vitest run test/db.spike.test.ts test/hybridSpike.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-T1 | 05-02 | 1 | AGENT-03 | T-05-04/05 | structuredQuery: read-only, aql-tag, literal collections, LIMIT-bounded | integration | `cd agent && npx vitest run test/structuredQuery.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-T2 | 05-02 | 1 | AGENT-03 | T-05-06 | bridgeResolve keys on structured same_as edge (all 9), WITH clause | integration | `cd agent && npx vitest run test/bridgeResolve.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-T1 | 05-03 | 1 | AGENT-03 | — | RRF fused in TS (pure); 512-dim embedding matches index | unit | `cd agent && npx vitest run test/rrf.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-T2 | 05-03 | 1 | AGENT-03 | T-05-07/08/09 | hybridRetrieve: Chunks view (not sources), LIMIT k*4, PART_OF-sourced | integration | `cd agent && npx vitest run test/hybridRetrieve.test.ts` | ❌ W0 | ⬜ pending |
| 05-04-T1 | 05-04 | 2 | AGENT-07 | T-05-11 | grounding gate is pure code (no model self-check) → refusal | unit | `cd agent && npx vitest run test/grounding.test.ts` | ❌ W0 | ⬜ pending |
| 05-04-T2 | 05-04 | 2 | AGENT-01 | T-05-12/13/14 | planner composes 3 specialists; stepCountIs cap; no secret in output | typecheck+grep | `cd agent && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 05-04-T3 | 05-04 | 2 | AGENT-02/05/07 | T-05-11 | 6 questions valid envelopes; Q12 cites both graphs; refusal case | integration | `cd agent && npx vitest run test/questions.eval.test.ts` | ❌ W0 | ⬜ pending |
*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] TS package scaffold (package.json, tsconfig, `vitest.config.ts`) alongside `scripts/` — first TS surface in the repo
- [ ] `customer360_Chunks` BM25 `text_en` view DDL applied (RESEARCH Open Q1 — vector index is on Chunks, existing BM25 view is on the wrong collection; RRF needs both over Chunks)
- [ ] `ANTHROPIC_API_KEY` added to `.env` (currently only `OPENAI_API_KEY` present — REQUIRED before the planner/agent runs)
- [ ] arangojs basic-auth read spike (~10 min — confirm reads work without JWT; `useBearerAuth` fallback known)
- [ ] Zod envelope schema defined as the shared artifact ({answer, citations[], retrievalPath[]}) consumed by tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Demo-quality narrative coherence of the synthesized answer | AGENT-02 | Subjective answer fluency is not unit-checkable | Run CLI against each of the 6 locked questions; spot-read for coherence + that sourcing matches the data map |

*Faithfulness/grounding eval over the 6 questions is the SUBJECT of Phase 7 — Phase 5 only needs the module callable and the envelope well-formed.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (TS infra, Chunks BM25 view, ANTHROPIC_API_KEY)
- [ ] No watch-mode flags (use `--run`)
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
