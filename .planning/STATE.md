---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
last_updated: "2026-06-19T19:40:00.000Z"
last_activity: 2026-06-19
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 29
  completed_plans: 28
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** A free-form question only answerable by joining the structured and unstructured graphs returns a correct, fully-sourced answer — every fact traceable to the record and graph it came from.
**Current focus:** Phase 07 — grounding/eval + demo hardening (next; not started)

## Current Position

Phase: 06 (next-js-vercel-ui-sourcing-display) — COMPLETE (verified + secured)
Plan: 5 of 5
Status: Phases 1–6 complete. Phase 6 deployed live (customer360-demo-jade.vercel.app), UAT 8/8 passed (2 issues found+fixed+re-verified on prod), security 14/14 threats closed. Phase 7 not started.
Last activity: 2026-06-19 - Phase 6 verified (UAT) + secured; live Vercel deploy working (Q12 end-to-end)

Carry-forward into Phase 7: per-IP rate-limit on /api/ask (AR-06-2); external-access decision (custom domain vs. SSO protection).

Progress: [█████████░] 86% (6/7 phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | - | - |
| 02 | 5 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-architecture-research-question-data-lock P01 | 2min | 2 tasks | 1 files |
| Phase 01 P02 | 17min | 2 tasks | 1 files |
| Phase 01-architecture-research-question-data-lock P03 | 3m | 2 tasks | 2 files |
| Phase 02 P01 | 10min | 2 tasks | 10 files |
| Phase 02 P03 | 8min | 2 tasks | 16 files |
| Phase 02 P04 | 45min | 2 tasks | 120 files |
| Phase 02-synthetic-data-integrity-linter P05 | 60min | 2 tasks | 220 files |
| Phase 03 P01 | 4min | 2 tasks | 2 files |
| Phase 03 P03 | 4min | 2 tasks | 1 files |
| Phase 03 P05 | 15min | 2 tasks | 2 files |
| Phase 04 P04 | 18 min | 4 tasks | 7 files |
| Phase 05 P01 | 8 min | 2 tasks | 12 files |
| Phase 05 P04 | 22 | 3 tasks | 9 files |
| Phase 06 P01 | 75min | 2 tasks | 30 files |
| Phase 06 P02 | 8min | 1 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Horizontal-layers build, but Phase 1 is a deliberate architecture spike proving the integration-risky Hybrid path end-to-end on a tiny sample before the layered build.
- [Roadmap]: Dependency chain locked — spike → data → both graphs (parallel) → canonical entity bridge (gate) → agent → UI → eval/hardening.
- [Architecture]: Hybrid recommended (AutoGraph builds unstructured KG; we own structured graph + agent + all retrieval AQL) — never call AutoGraph's opaque retriever.
- [Phase ?]: docs/research/ scaffolded; D-03 sign-off gate documented; live ArangoDB connectivity confirmed (HTTP 200) for Plan 02 probe
- [Phase 01]: ARCH-03 verdict: PASS — ArangoDB 3.12.9-1 enterprise; APPROX_NEAR_COSINE and BM25/ArangoSearch both confirmed live — PASS environment; no fallback needed; data-first ordering required
- [Phase 01]: Data-first ordering mandatory for vector index on this cluster; pre-data create fails training — Tested and confirmed; AutoGraph's datastorage.py pattern is correct
- [Phase 01]: Bearer auth-token required for DDL on live cluster; Phase 3 scripts must call POST /_open/auth first — Discovered during probe; basic auth returns 401 for collection creation
- [Phase ?]: 12 questions locked as themes (D-09/D-10): Q1–Q10 + Q11 cross-graph timeline (AGENT-06) + Q12 reconciliation usage-green/sentiment-red (AGENT-05); Q12 designated as centerpiece; data map drives Phase 3 schema and Phase 5 curated AQL
- [Phase ?]: Integrity linter scaffolded first (Wave 0): 8 test files covering D-07/D-08 checks skip cleanly with no data, providing a working feedback loop from Plan 02-02 onward
- [Phase ?]: D-01 APPROVED: Event spine accepted as-is; no redlines — all contract values, dates, entity names, and narrative arcs approved before volume generation
- [Phase ?]: entity_id imported directly from spine in generators (never re-derived) — prevents cross-account collision (T-02-03-02 / RESEARCH.md Pitfall 5)
- [Phase ?]: python-arango db() takes user_token= not auth_token= — corrected from PATTERNS.md (Rule 1 auto-fix)
- [Phase ?]: probe_dim_check() exits cleanly when AUTOGRAPH_URL absent; live 512-dim confirmation deferred to Plan 03-04
- [Phase ?]: ARANGO_ENDPOINT/USERNAME/DATABASE env fallback applied to both verify scripts per CRITICAL_ENV_DEVIATION mandate
- [Phase ?]: Account._key = account_id (not entity_id) per RESEARCH.md Gap 4 structured schema table
- [Phase ?]: GRAPH-03 structured idempotency RESOLVED — AQL UPSERT with overwrite_mode=update; OBT-1 closed for structured side
- [Phase ?]: PLANNER_MODEL=gpt-4.1 (live gpt-4.1-2025-04-14); single named constant, OpenAI provider only (D-06)
- [Phase ?]: Grounding is pure code (enforceGrounding) — no model call; ungrounded citations become a structured refusal (D-02)
- [Phase ?]: Added entityLookup (4th curated tool) so the planner resolves a prose name to an account_id
- [Phase ?]: Phase 6: agent imported into web/ as a compiled dist/ workspace dep — raw-TS transpilePackages proven unviable on Next 15
- [Phase ?]: Phase 6: web pinned to Next 15.5.19; stray root next@^16 slopcheck-probe deps removed
- [Phase ?]: [Phase 06]: askQuestionStream is ADDITIVE — reuses agent.ts seams + the SAME terminal enforceGrounding; streamed data-step parts are transient progress, the persistent data-envelope is the gated answer

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Load-bearing assumption to verify hands-on — AutoGraph `{proj}_kg` output must be directly AQL-queryable for claim-level sourcing; failure triggers a HIGH-cost pivot to a hand-modeled unstructured graph.
- [Phase 1]: Confirm ArangoDB env version (3.12.9+) for the vector + BM25 path; confirm a real Vercel→ArangoDB round-trip (not localhost).
- [Phase 2]: Synthetic-data coherence is first-principles (LOW–MEDIUM confidence) — design the LLM-for-prose/code-for-facts split + integrity linter before generating at volume.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260619-f7c | Fix Vercel monorepo build failure (npm `-w` flag unresolvable from `web/` root dir) | 2026-06-19 | 8645ed6 | [260619-f7c-vercel-monorepo-build-fix](./quick/260619-f7c-vercel-monorepo-build-fix/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-19T01:22:20.307Z
Stopped at: 06-05 Tasks 1-2 complete; Task 3 deploy gate awaiting user (D-04)
Resume file: DEPLOY.md
