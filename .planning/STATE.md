---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Live, Visible, Trustworthy
status: executing
last_updated: "2026-06-22T22:20:19.173Z"
last_activity: 2026-06-22
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 4
  completed_plans: 3
  percent: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-22)

**Core value:** A free-form question only answerable by joining the structured and unstructured graphs returns a correct, fully-sourced answer — every fact traceable to the record and graph it came from.
**Current focus:** Phase 09 — data-depth-3rd-account

## Current Position

Phase: 09 (data-depth-3rd-account) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-06-22

## Performance Metrics

**Velocity:**

- Total plans completed: 31 (v1.0, all shipped)
- Average duration: —
- Total execution time: ~6 days (v1.0)

**v2.0 By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 8 — Deterministic Eval Harness | TBD | - | - |
| 9 — Data Depth & 3rd Account | TBD | - | - |
| 10 — Answer-Provenance Edge Enrichment | TBD | - | - |
| 11 — Graph Viz + UI Refresh + Latency | TBD | - | - |
| 12 — Simulated CDC + What-Changed Diff | TBD | - | - |
| 13 — Injection-Resistance + Adversarial Mode | TBD | - | - |
| 14 — Temporal Queries | TBD | - | - |
| 15 — Analyst Polish + Demo Control Panel | TBD | - | - |

**Recent Trend:**

- Last 5 plans: (v1.0 history)
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
| Phase 08-deterministic-eval-harness P01 | 38min | 4 tasks | 9 files |
| Phase 09 P01 | 35min | 3 tasks | 14 files |
| Phase 09 P02 | ~20min | 2 tasks | 7 files |

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
- [v2.0 Roadmap 2026-06-22]: Phase 08 sequenced first — closes the v1 ~5% stochastic refusal residual before any v2 feature ships; ensures later phases have a trustworthy gate to verify against.
- [v2.0 Roadmap 2026-06-22]: Phase 999.1 backlog (React Flow viz) promoted to v2.0 as Phase 10 (edge enrichment) + Phase 11 (React Flow render + UI refresh + latency). The verified technical spine and LOCKED data-driven requirement from the backlog carry forward verbatim.
- [v2.0 Roadmap 2026-06-22]: UI-06 (confidence score) placed in Phase 11 alongside the viz because it depends on eval metrics being surfaced in the answer envelope, and Phase 11 is the UI composition phase.
- [v2.0 Roadmap 2026-06-22]: DEMO-01 control panel deferred to Phase 15 (last) because the CDC trigger (Phase 12) and multi-turn (AGENT-08) must exist before a control panel can surface them.
- [Phase ?]: Phase 08-01: temperature:0 on ToolLoopAgent; seed NOT set (Responses API ignores it); EnvelopeSchema gains groundingScore required field; PreGroundingEnvelope for type safety; eval-gate.ts is the pre-demo command
- [Phase ?]: [Phase 09-01]: Account C = Helio Retail; honest contraction arc (usage+contract+NPS all falling) — load-bearing D-03 distinction from Meridian Q12; Q13/Q14/Q15 wired into locked gate; near-miss guard empirically green for Q13 with no N/M bleed
- [Phase 09]: Deepened N+M prose and all-account structured records as EDIT-lane content-only edits (no new DocEvents, no nondeterminism); DATA-05 satisfied at generator level

### Pending Todos

None yet.

### Blockers/Concerns

- [v2.0]: ~5% stochastic planner refusal residual (Phase 08 target) — safe failure mode, no fabrication, but must close before live v2 demos.
- [v2.0]: AutoGraph `incremental` re-ingest behavior on the 3rd account (Phase 09) — the existing UPDATE-PIPELINE.md design covers 2 accounts; adding a 3rd module needs verification that Leiden re-clustering is scoped correctly.
- [v2.0]: React Flow layout for arbitrary traversal shapes (Phase 11) — no prior art in this codebase; requires a design decision on KG granularity (Document vs Chunk vs Entity level) for legibility at cap.
- [Phase 09]: data_gen/output/ is git-tracked (committed 2-account data) — new helio answerability/composite linter tests fail until Plan 03 regenerates with --clean; validated correct via reverted throwaway regen (linter 26/26, near-miss Q13 green). Delete iCloud ' 2'/' 3' junk dirs before Plan 03 regen.
- [Phase 09-03 Task 2] build_unstructured.py does a FULL rebuild but never truncates Layer-3 (customer360_Documents/Chunks/Entities/Relations/Communities) before orchestrate; the importer APPENDS (spike UPDATE-PIPELINE line 77). Result: 244 docs = 105 stale (prior 2-account build, attributed) + 139 new (Option-A rebuild, module=null; Stage-7 repair scrambled across the doubled set, only 4 helio attributed); build exits non-zero (repair FAIL). Clean fix = delete-first: truncate the 5 Layer-3 collections then re-orchestrate via --build-id cb_1782166136_595ba1ef (corpus build + 7-partition strategy intact). Hand-truncating shared-prod collections was DENIED by auto-mode classifier as beyond 'single full rebuild via the build script'. Needs human decision: (A) approve truncate+resume, or (B) patch build_unstructured.py to truncate Layer-3 before Stage 4. Structured load (3 accounts) + Task 1 linter GREEN are DONE.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260619-f7c | Fix Vercel monorepo build failure (npm `-w` flag unresolvable from `web/` root dir) | 2026-06-19 | 8645ed6 | [260619-f7c-vercel-monorepo-build-fix](./quick/260619-f7c-vercel-monorepo-build-fix/) |

## Deferred Items

Items acknowledged and deferred at v1.0 milestone close on 2026-06-22:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| quick_task | 260619-f7c-vercel-monorepo-build-fix | work done (commit 8645ed6), SUMMARY missing | 2026-06-22 |
| quick_task | 260619-f7c-vercel-monorepo-build-fix 2 | iCloud sync-conflict duplicate (junk) | 2026-06-22 |
| todo | coreference-hard-entity-extraction-eval + 4 more | planning notes | 2026-06-22 |
| verification_gap | 2 outstanding Nyquist/verification gaps | non-blocking | 2026-06-22 |
| residual | ~5% stochastic planner refusal on dual-graph Qs (safe failure, no fabrication) | targeted in Phase 08 | 2026-06-22 |
| residual | serverless↔ArangoDB root error class uncaptured (hardened; onError logger watches) | accepted v1 | 2026-06-22 |
| follow-up | CRON_SECRET on Vercel Preview pending (CLI git-branch quirk) | non-blocking | 2026-06-22 |
| v2 | AGENT-04 fallback, AGENT-06 Q11 timeline | deferred to v3 | 2026-06-22 |

## Session Continuity

Last session: 2026-06-22T21:55:05.652Z
Stopped at: Completed 09-02-PLAN.md
Resume file: None
Next action: `/gsd-plan-phase 8`
