---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Live, Visible, Trustworthy
status: executing
last_updated: "2026-06-25T16:31:57.802Z"
last_activity: 2026-06-25
progress:
  total_phases: 11
  completed_phases: 5
  total_plans: 18
  completed_plans: 17
  percent: 45
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-22)

**Core value:** A free-form question only answerable by joining the structured and unstructured graphs returns a correct, fully-sourced answer — every fact traceable to the record and graph it came from.
**Current focus:** Phase 14 — graph-depth-explainability (v2 tail RE-AIMED at nameable ArangoDB platform capabilities; see [[tail-platform-capability-pivot]] + DEMO-STRATEGY.md)

## Current Position

Phase: 14 (graph-depth-explainability) — CONTEXT captured (14-CONTEXT.md), ready to plan. Phase 13 EXECUTED+SECURED; /gsd-verify-work 13 still optional/outstanding.
Plan: 0 plans (next: /gsd-plan-phase 14)
Status: 2026-06-25 ROADMAP/REQUIREMENTS RESTRUCTURED — v2 tail is now P14 Graph-Depth+Explainability / P15 GraphRAG / P16 Time-Travel / P17 Agent-Memory / P18 Control-Panel+CDC-reframe + Demo-Assets track. SEC-02 adversarial mode HIDDEN for demo (ADVERSARIAL_MODE_ENABLED=false in web/app/page.tsx) — preview smoke showed off-script attacks answered ([[live-path-id-grounding-only]]). Prod promote HELD (current viz still congested d3 graph).
Resume file: .planning/phases/14-graph-depth-explainability/14-CONTEXT.md
Last activity: 2026-06-25 -- Strategy session: restructured roadmap tail; deployed 2 PREVIEWS (not prod) of P11-13 code; hid SEC-02 adversarial UI; SHIPPED citation-drawer fix (SourcingRail enriches citations from nodeDetails → chunk text + structured fields show on click; web typecheck clean, UNCOMMITTED working-tree change on phase-06-03-streaming-seam); locked stepped-pipeline retrieval-viz design (14-CONTEXT D-02).
Next action: /gsd-plan-phase 14 (context captured). Uncommitted working-tree changes to commit first for a clean start: web/app/page.tsx (adversarial hide), web/components/SourcingRail.tsx (citation enrich), .vercelignore (hygiene). NOTE: prod NOT promoted — ship after P14 lands the pipeline + label + de-congestion.

## Performance Metrics

**Velocity:**

- Total plans completed: 38 (v1.0, all shipped)
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
| 10 | 3 | - | - |
| 11 | 4 | - | - |

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
| Phase 09 P03 | 40min | 3 tasks | 6 files |
| Phase 10-answer-provenance-edge-enrichment P01 | 6min | 2 tasks | 9 files |
| Phase 10-answer-provenance-edge-enrichment P02 | 11min | 2 tasks | 4 files |
| Phase 10-answer-provenance-edge-enrichment P03 | 43min | 3 tasks | 4 files |
| Phase 11-graph-viz-ui-refresh-latency P01 | 25min | 2 tasks | 8 files |
| Phase 11-graph-viz-ui-refresh-latency P04 | 10min | 2 tasks | 5 files |
| Phase 11 P02 | 7min | 2 tasks | 12 files |
| Phase 11-graph-viz-ui-refresh-latency P03 | 15min | 3 tasks | 7 files |
| Phase 13-injection-resistance-adversarial-mode P01 | ~6min | 2 tasks | 4 files |
| Phase 13 P03 | 12min | 2 tasks | 2 files |

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
- [Phase ?]: Phase 10-01: EdgeKindEnum + edges[].default([]) in RetrievalPathFragment; traversedEdgesAreGrounded D-04 guard exported; edgeKey null-safe dedup
- [Phase ?]: Phase 10-03: buildPath threaded accountId synthesizes deterministic kind:'structural' account-anchored edges (SC-4/D-02); both agent loop returnedIds locked with SC-5 comment; eval gate GREEN 124/124 additive; streaming smoke-test PASSED on Q12 Meridian (38 edges, all kinds honestly labeled)
- [Phase ?]: Phase 11-01: edgeKey mirrored verbatim from agent/src/retrievalPath.ts — buildGraph.ts inherits collision-free id guarantee by construction
- [Phase ?]: Phase 11-01: StrokeStyle inline type (not React.CSSProperties) keeps buildGraph.ts React-free; agent/dist rebuild required when envelope changes
- [Phase ?]: Phase 11-04: prewarmDb() fires at module-load (ARANGO_ENDPOINT guard) as fire-and-forget
- [Phase 11-03]: Brand token VALUE swap: #5c9e31→#007339 (arango.ai primary green) + #0f1b24→#151d25 (dark surface); token NAMES + @theme inline unchanged; #3a6ea5 dual-graph retained; badge/viz parity via --graph-structured (console parity deferred to human checkpoint)
- [Phase 11-03]: GraphPathToggle default=Path (lowest-regression); SourcingRail hosts toggle; GraphViz.onOpenSource === rail.openSource (shared drawer, no new drawer created; D-06)
- [Phase 11-03]: TrustChip mounted per-answer adjacent to question echo for all terminal envelopes (grounded + refused); CARDINAL RULE: reads terminal envelope only, never mid-stream state
- [Phase 11-03]: e2e Playwright spec authored (streaming-viz.spec.ts); live run deferred to human checkpoint — requires npm run dev + live ArangoDB/OpenAI agent (pre-existing infra requirement matching ask.spec.ts)

### Pending Todos

None yet.

### Blockers/Concerns

- [v2.0]: ~5% stochastic planner refusal residual (Phase 08 target) — safe failure mode, no fabrication, but must close before live v2 demos.
- [v2.0 — RESOLVED 2026-06-24, D-03] AutoGraph `incremental` re-ingest / Leiden re-cluster scoping. Empirically validated in Phase 12-01 Task 4: an incremental corpus build (new file only) + partition-scoped orchestrate lands the new doc in its OWN singleton Leiden community (partition default_6_b) → Documents 139→140 with ZERO churn to the other accounts' partitions (unchanged at 33/33/32/18/14/9). eval-gate GREEN before AND after. The "tiny-module" mechanism in the original design does NOT work (modules= is a no-op on this cluster); the working path is post-build partition discovery via the corpus-graph trace (source.file_id → IN_DOMAIN → cluster → INGESTED_AS → rag.rag_partition_id). KEY GOTCHA: the importer runs ASYNC and lags orchestrate kickoff — wait for the doc count to GROW past baseline, not just "stable" (a stability-only check exits early at the OLD count and looks like nothing imported). Shipped in scripts/add_lane.py (commit 4913203). See 12-01-SUMMARY.md.
- [v2.0]: React Flow layout for arbitrary traversal shapes (Phase 11) — no prior art in this codebase; requires a design decision on KG granularity (Document vs Chunk vs Entity level) for legibility at cap.
- [Phase 09]: data_gen/output/ is git-tracked (committed 2-account data) — new helio answerability/composite linter tests fail until Plan 03 regenerates with --clean; validated correct via reverted throwaway regen (linter 26/26, near-miss Q13 green). Delete iCloud ' 2'/' 3' junk dirs before Plan 03 regen.
- [Phase 09-03 Task 2 — RESOLVED 2026-06-22] build_unstructured.py append-not-replace contamination FIXED via Option C: patched self-cleaning delete-first Layer-3 truncate (commit 5240b0a) + ran ONE fresh full rebuild (corpus cb_1782167308_a2ffe336). Cleared 5766 stale records, landed exactly 139 clean docs (3 accounts: northwind=40 meridian=61 helio=38, all attributed, 0 null). verify_kg_loaded.py hardened (≈139 NOT 244) exits 0 (commit cd61d89). Structured 3 accounts loaded.
- [Phase 09-03 Task 3 — RESOLVED 2026-06-23] EVAL GATE GREEN x2 (89/89). The full fix chain is complete: truncate patch (5240b0a) → clean rebuild (cd61d89) → view drop+recreate Stage 6.5 (5dc0f74) → vector-index drop+recreate Stage 6.6 (d1725c4) → Helio entity bridge (5fff838) → null-_id strip (2f9b9c2) → force-tool-retrieval guard (42061fd). The two NON-INFRA gaps were closed WITHOUT new infra auth: (1) Helio bridge — extended scripts/demo_critical.py (9→12 ids: Helio Retail org c2de4d08, champion Priya Nair d4ca7052, downgrade contract ee5fd2b7, verbatim from the Plan-01 spine), widened build_entity_bridge.py helpers to include helio, re-ran the idempotent UPSERT (13 hubs/43 edges, verify_entity_bridge --full GREEN 12/12); entityLookup("Helio Retail") now resolves → Q13/Q15 PASS. (2) Q9 null-_id strip (SynthRetrievalPath._ids nullable + filter in toCanonicalEnvelope + mergeRetrievalPaths) removed the crash, which UNMASKED a deeper degenerate loop: with Output.object the planner could emit its plan-preamble as the final answer with ZERO tool calls (returnedIds empty) on Q9/Q14 and intermittently Q8. Closed with a prepareStep force-retrieve guard (toolChoice:'required' until ≥1 tool runs). All 9 locked questions (Q7/Q2/Q12/Q9/Q5/Q8/Q13/Q14/Q15) PASS, reconciliation true, groundingScore 1.0, faithfulness ≥0.6. D-06 INTACT (git diff clean on eval-gate.ts + questions.eval.test.ts + hybridSpike.test.ts — contract NOT loosened, data cleaned to fit it). PLAN-01 LEARNING: the canonical entity bridge for Account C was never built in Plan 01 (it wired the spine/linter/locked-gate but not demo_critical.py); closed here at materialization. WATCH: Q9 faithfulness LLM-judge occasionally scores 0.5 on a single run (flake-recovered by the gate's 1-retry) — the ~5% stochastic-judge residual, non-blocking.

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

Last session: 2026-06-25T16:31:52.575Z
Stopped at: Phase 13 context gathered
Resume file: .planning/phases/11-graph-viz-ui-refresh-latency/11-03-SUMMARY.md
Next action: Human verifies streaming path (npm run dev): Q12 streamed claim-list render, TrustChip "Grounded ✓", Graph toggle → React Flow viz with same_as bridge + legend + node-click drawer, brand-green parity vs arango.ai console, RefusalPanel + "Partially grounded". Then approve checkpoint to unlock Phase 11 Plan 04 (PERF-01 latency).
