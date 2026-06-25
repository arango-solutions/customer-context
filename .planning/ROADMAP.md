# Roadmap: Customer 360 (Graph-Based Demo)

A graph-based Customer 360 demo over 100%-synthetic data: a Next.js/Vercel dashboard with a free-form question box, backed by a custom planner+specialists agent that reasons across two ArangoDB graphs (hand-modeled structured + AutoGraph-built unstructured) and returns answers where every fact is traceable to its record, graph, and traversal.

## Milestones

- ✅ **v1.0 — Lean demo (SHIPPED 2026-06-22)** — Phases 1–7, 31 plans. Architecture research → synthetic data + linter → both graphs → canonical entity bridge → custom reasoning agent → Next.js/Vercel UI → grounding eval + demo hardening. 27/29 v1 requirements complete (AGENT-04 generated-AQL fallback and AGENT-06 Q11 timeline deferred to v2). Full detail: [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md) · requirements: [milestones/v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md).

- 🔄 **v2.0 — Live, Visible, Trustworthy (IN PROGRESS)** — Phases 8–18. Evolve the lean v1 demo into a product-grade showcase that updates live, shows the graph behind every answer, withstands a security audience, and proves its own correctness deterministically — on richer synthetic data. **Tail re-aim (2026-06-25):** Phases 14–18 pivot from "finish the app" to "make ArangoDB's core-DB + AI-platform capabilities undeniable and nameable to a Zscaler buyer" — per `DEMO-STRATEGY.md`.

## v2.0 Phases

- [x] **Phase 8: Deterministic Eval Harness** — Eliminate the ~5% stochastic flake; build a trustworthy green/red gate runnable before any demo (completed 2026-06-22)
- [x] **Phase 9: Data Depth & 3rd Account** — Add a 3rd synthetic account + deepen existing docs; linter-gated, building the data foundation v2 features depend on (completed 2026-06-23)
- [x] **Phase 10: Answer-Provenance Edge Enrichment** — Enrich `hybridRetrieve` + `bridgeResolve` to return traversed edges; add `edges[]` to `RetrievalPathFragment` (completed 2026-06-23)
- [x] **Phase 11: Graph Viz + UI Refresh + Latency** — React Flow cross-graph subgraph render, ArangoDB-brand UI refresh, confidence score, and latency pass (completed 2026-06-24)
- [x] **Phase 12: Simulated CDC + What-Changed Diff** — File-watch CDC, live update trigger, and before/after diff of changed claims/citations (completed 2026-06-24)
- [x] **Phase 13: Injection-Resistance + Adversarial Mode** — Harden the agent against prompt injection from docs; add audience-facing "try-to-break-it" mode (completed 2026-06-25)
- [ ] **Phase 14: Graph-Depth + Explainability** — Real multi-hop structured traversal + single cross-graph join across `same_as`, then reveal the AQL with one-engine labels and the join as hero (GRAPH-03, EXPL-01)
- [ ] **Phase 15: GraphRAG via AutoGraph Communities** — Hierarchical global↔local retrieval over the built-but-unqueried Leiden community layer; names the GenAI platform (RAG-01)
- [ ] **Phase 16: Time-Travel (Temporal Graph)** — Effective-dated edges + `@asOf` traversal on Northwind; "as-of renewal" / "2023→2025 evolution" as a versioned graph traversal, honestly framed (TEMP-01)
- [ ] **Phase 17: Agent Memory on ArangoDB** — Answers/entities/past-questions persisted as a graph; multi-turn follow-ups powered by graph-resident memory ("agentic brain on Arango") (MEM-01, subsumes AGENT-08)
- [ ] **Phase 18: Presenter Control Panel + CDC Reframe** — Presets (wiring every capability moment) + reset + CDC trigger; CDC banner/talk-track reframed to name one-engine propagation (DEMO-01, CDC-04)
- [ ] **Demo Assets track** *(parallel, non-code)* — Talk track, maps-to-your-data one-pager, competitive one-liner, capability-naming notes (ASSET-01)

## Phase Details

### Phase 8: Deterministic Eval Harness

**Goal**: The eval suite is trustworthy and deterministic — a single command proves the demo works before any live run, without spurious failures from LLM stochasticity or transient infra.
**Depends on**: Phase 7 (faithfulness.ts, questions.eval.test.ts, adversarial.ts already exist — this phase hardenes and extends them)
**Requirements**: EVAL-03, EVAL-04
**Success Criteria** (what must be TRUE):

  1. The residual planner flake is bounded and gate-classified — `temperature:0` + N=3 majority-vote judge substantially reduce the ~5% stochastic flake, and the gate's bounded 1-retry auto-recovers a transient single-run flake (→ GREEN) while a confirmed two-run regression exits RED. Back-to-back identical results hold in the common case; full elimination is not achievable on the Responses API (ignores `seed`), so an honest RED on a genuine residual-variance cluster is correct, not spurious.
  2. A single command runs the full locked + adversarial question set and prints a clear pass/fail summary with per-question faithfulness scores, refusal-correctness outcomes, and a grounding verdict.
  3. A genuine regression (a question that should pass actually failing) produces a red exit code — the gate is honest, not a rubber stamp.
  4. The eval gate is the confirmed pre-demo command: run it, see green, demo with confidence.
  5. The answer envelope emits a deterministic `groundingScore` (and/or `faithfulnessScore`) field from the eval path, so the UI can surface it as a visible per-answer trust signal in Phase 11 (UI-06) without recomputing. *(Scope tweak, 2026-06-22 — feeds UI-06.)*

**Plans**: 1 plan
Plans:

- [x] 08-01-PLAN.md — Planner determinism (temperature:0) + groundingScore field + enforceGrounding injection + eval-gate.ts pre-demo command

**Risk**: Medium-low — the eval infrastructure exists (07-01 shipped faithfulness.ts + majority vote). The work is closing the residual ~5% flake, extending the adversarial set, and wiring a clean summary reporter. The open risk is that stabilizing the planner (not just the judge) is needed — an under-citing planner run will still dip trend questions. Keep the gate honest rather than loosening the floor.

### Phase 9: Data Depth & 3rd Account

**Goal**: The synthetic data is richer, more coherent, and covers a 3rd account — giving the answer visualizations more to show, TEMP-01 a deeper multi-year history to traverse, and the question set a new account arc.
**Depends on**: Phase 2 (canonical event-spine + entity registry + linter infrastructure); Phase 8 (eval gate must stay green after data changes — run as verification)
**Requirements**: DATA-04, DATA-05
**Success Criteria** (what must be TRUE):

  1. A 3rd synthetic account exists with a distinct ArangoDB-product-ladder story (e.g. a different expansion or churn arc), generated from the same canonical event-spine + entity registry with shared `entity_id` namespace.
  2. All new data passes the existing referential-integrity / timeline-coherence linter — no orphaned FKs, no timeline violations — before ingest.
  3. At least one new question arc is defined and answerable end-to-end from the 3rd account's data (structured + unstructured sides).
  4. Existing accounts' documents are deepened (more realistic prose, richer records) — answers citing them are more impressive — without introducing linter regressions.
  5. The eval gate (Phase 8) stays green after loading the new data — existing answers are not corrupted.**Plans**: 3 plans

**Wave 1**

- [x] 09-01-PLAN.md — Account C (Helio Retail) churn-arc spine + new C questions + near-miss guard (DATA-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-02-PLAN.md — Broad deepening of Northwind + Meridian across all 8 modules (DATA-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 09-03-PLAN.md — Full regen + full linter sweep + KG rebuild + eval-gate GREEN (SC-1..SC-5)

**Risk**: Medium — LLM prose coherence across a 3rd account is first-principles work (same risk class as Phase 2). Mitigated by reusing the existing spine + linter + generators as templates. The linter is the hard gate; coherence regressions found late are a full regen.

### Phase 10: Answer-Provenance Edge Enrichment

**Goal**: Every tool that walks a real graph edge returns that edge — the agent's `retrievalPath` carries the actual traversed edges (`_id`, `_from`, `_to`, collection), not just endpoint node IDs, enabling the React Flow viz to render what actually happened.
**Depends on**: Phase 5 (hybridRetrieve, bridgeResolve, structuredQuery, RetrievalPathFragment — the source to enrich)
**Requirements**: VIZ-01
**Success Criteria** (what must be TRUE):

  1. `hybridRetrieve` returns the `PART_OF` edge (Chunk→Document) it traversed — `{_id, _from, _to, collection}` — alongside the endpoint node IDs.
  2. `bridgeResolve` returns the `same_as` edge (hub→leaf) it traversed in the same format.
  3. `RetrievalPathFragment` in `envelope.ts` gains an `edges[]` field; the Zod schema is updated; tsc is clean.
  4. The structured cluster path is represented as an account-anchored induced subgraph (drawn as structural via `account_id`), clearly distinguished in the fragment from traversed edges — never fabricated as a traversal that did not run.
  5. The eval gate (Phase 8) stays green — edge enrichment is additive and does not regress answer quality or grounding.

**Plans**: 3 plans
**Wave 1**

- [x] 10-01-PLAN.md — Edge data-model contract (RetrievalPathEdge + edges[]) + mergeRetrievalPaths edge union + D-04 guard / Wave 0 pure tests

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — Real-traversal edge capture: hybridRetrieve PART_OF + D-05 hybrid edges, bridgeResolve same_as (live-guarded honesty tests)
- [x] 10-03-PLAN.md — structuredQuery synthesized structural edges (D-02) + SC-5 returnedIds isolation + eval-gate additivity proof

**Risk**: Low — the v1 ROADMAP backlog note (Phase 999.1 technical spine section) already specifies the exact RETURN-clause change needed in two tools and the `edges[]` addition to `RetrievalPathFragment`. Work is mechanical with a clear honesty constraint (no invented traversals for structured data).
**UI hint**: yes

### Phase 11: Graph Viz + UI Refresh + Latency

**Goal**: The demo looks polished and brand-aligned, answers feel fast, a confidence score is visible per answer, and the React Flow cross-graph subgraph renders the actual nodes and edges that produced each answer.
**Depends on**: Phase 10 (edges[] in retrievalPath — required for React Flow to render honest traversals); Phase 8 (eval gate stays green through UI changes)
**Requirements**: VIZ-02, UI-04, PERF-01, UI-06
**Success Criteria** (what must be TRUE):

  1. A React Flow panel renders the actual nodes and edges from the grounded `retrievalPath` — two visual clusters (structured, unstructured) joined by the real `same_as` bridge edge — using distinct visual styles for traversed (`PART_OF`/`same_as`), structural (`account_id`), and hybrid-retrieval (vector+BM25) edges; node count capped to cited records.
  2. The viz is fully general and data-driven: it renders correctly for ANY question purely from the runtime `retrievalPath`, with no per-question hardcoding or template.
  3. The dashboard is refreshed to an ArangoDB-brand-aligned visual design (typography, color, layout, citation cards, viz panel) without regressing v1's streamed reasoning + claim-level provenance.
  4. A live confidence/grounding score is surfaced per answer — tied to the faithfulness eval metric — as a visible trust signal in the UI.
  5. Answer latency is noticeably improved vs. v1 (~20–40s): first-token arrives faster (parallel tool calls and/or pre-warm) with no loss of grounding.
  6. The eval gate (Phase 8) stays green — no regressions on streamed answers or claim citations.

**Plans**: 4 plans
Plans:

**Wave 1** *(parallel — no shared files)*
- [x] 11-01-PLAN.md — Install React Flow/dagre in web/ + repair broken fixtures + pure buildGraph.ts/layout.ts honesty+data-driven core (VIZ-02 SC-1/SC-2)
- [x] 11-04-PLAN.md — PERF-01 latency: baseline + ArangoDB pre-warm; eval gate GREEN; streaming smoke (PERF-01 SC-5)

**Wave 2** *(blocked on 11-01)*
- [x] 11-02-PLAN.md — GraphViz React Flow components + TrustChip (qualitative-only; faithfulnessScore absent) + AnswerBody claim-list rewrite (VIZ-02/UI-06/UI-04 D-12)

**Wave 3** *(blocked on 11-01 + 11-02)*
- [x] 11-03-PLAN.md — arango.ai brand-token swap + Graph/Path toggle in rail + page wiring + streaming smoke checkpoint (UI-04/VIZ-02/UI-06 SC-3/SC-6)

**Risk**: Medium — React Flow layout for arbitrary graph shapes requires design work (pick KG granularity, handle large traversals gracefully). Honesty bar is strict: viz must never fabricate edges. UI refresh + PERF-01 are well-understood work. PLANNING FINDINGS: (1) `faithfulnessScore` is NOT on the runtime envelope — UI-06 leads qualitative (groundingScore + refusal) and DEFERS the numeric reveal (a data change, out of this presentation-only phase). (2) The web test suite is currently RED (Phase-8 `groundingScore` never backfilled into web fixtures) — Plan 11-01 repairs it as a prerequisite. (3) ArangoDB rebranded to arango.ai (#007339) — the brand token swap is a real value change. (4) The eval gate is non-streaming only — D-12 claim-list + PERF-01 loop changes carry a mandatory streaming smoke-test.
**UI hint**: yes

### Phase 12: Simulated CDC + What-Changed Diff

**Goal**: A live update moment exists in the demo — a synthetic source file changes, the delta propagates through the existing idempotent pipeline into both graphs, and re-asking a question shows which claims/citations changed.
**Depends on**: Phase 3 (idempotent UPSERT + AutoGraph incremental + account_id re-stamp — the update pipeline); Phase 11 (viz + UI are in place so the "what changed" diff can be shown impressively); Phase 8 (eval gate confirms no corruption)
**Requirements**: CDC-01, CDC-02, CDC-03
**Success Criteria** (what must be TRUE):

  1. A change to a synthetic source file (under `data_gen/` output) is detected, and the delta propagates into BOTH graphs via the existing idempotent pipeline — structured UPSERT, unstructured AutoGraph `incremental` + post-build account_id re-stamp — with no destructive full rebuild.
  2. A UI or API trigger initiates the update as a live demo moment; re-asking a question after the trigger reflects the updated data.
  3. A re-ask after the update does not corrupt a previously-correct answer — the same question before and after the update returns consistent facts from the data that was not changed.
  4. A "what-changed" diff shows which specific claims or citations in an answer changed as a result of the update (before/after), grounded in the actual updated records.

**Plans**: 3 plans

**Wave 1** *(gates the phase — resolves the D-03 STATE blocker)*
- [ ] 12-01-PLAN.md — Build + LIVE-validate the incremental ADD lane (zero-churn tiny-module variant) + presenter reset; proves no full rebuild, no corruption, D-03 resolved (CDC-01)

**Wave 2** *(blocked on 12-01)*
- [ ] 12-02-PLAN.md — "Simulate update" trigger route (fixed scenario, fire-and-return-202, async) + status poll; security threat model on the only new attack surface (CDC-02)

**Wave 3** *(blocked on 12-02)*
- [ ] 12-03-PLAN.md — Grounded client-side what-changed diff + WhatChangedBanner + AnswerBody highlights + useAsk per-question cache + page wiring; eval-gate GREEN before/after (CDC-02, CDC-03)

**Risk**: Medium — the idempotent pipeline (load_structured.py, build_unstructured.py AutoGraph incremental, stamp_account_id.py) already exists and was designed for this. The new work is the file-watch CDC layer, the UI/API trigger, and the before/after diff logic. The diff (CDC-03) is the highest-design-effort piece: it requires storing the pre-update answer envelope and comparing grounded citations. **Planning decision required up front (scope tweak, 2026-06-22):** pick the envelope-storage approach before building CDC-03 — in-memory session vs. a lightweight ArangoDB collection (no answer-envelope persistence exists in v1). Decide at `/gsd-plan-phase 12`.

### Phase 13: Injection-Resistance + Adversarial Mode

**Goal**: The agent ignores adversarial instructions embedded in customer documents, and the demo can include a live audience moment where someone tries to break it and watches it refuse cleanly.

> **SEC-02 hidden for demo (2026-06-25):** A preview smoke showed an off-script attack getting *answered* — the live path enforces `_id`-grounding only (semantic faithfulness is eval-only, not live). Judged overkill for a presenter-driven demo, so the "try-to-break-it" UI is hidden behind `ADVERSARIAL_MODE_ENABLED=false` (`web/app/page.tsx`). **SEC-01 hardening + `enforceGrounding` stay always-on.** Flip the flag to restore. See REQUIREMENTS.md §SEC-02 and [[live-path-id-grounding-only]].
**Depends on**: Phase 7 (enforceGrounding pure-code gate + adversarial.ts — the foundation); Phase 11 (the UI mode for SEC-02 needs the refreshed UI shell); Phase 8 (eval gate covers adversarial refusal correctness)
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):

  1. Adversarial instructions embedded in a synthetic document (prompt injection via the unstructured graph) do not alter the agent's answer, change the tools it calls, or cause it to leak; the grounding/refusal gate holds.
  2. A curated injection payload can be added to a synthetic doc and the agent demonstrably ignores it — verifiable by a test, not just assertion.
  3. A "try-to-break-it" UI mode lets a presenter submit injection / out-of-scope / PII questions and watch the system refuse cleanly (refused:true, zero fabricated citations, clean structured message) — an interactive audience-facing trust demonstration.
  4. Legitimate questions continue to answer correctly through the same path — SEC-01 hardening does not regress grounded answers.

**Plans**: 4 plans

**Wave 1** *(parallel — no shared files: agent-side vs data-side)*
- [x] 13-01-PLAN.md — SEC-01 D-01 defense-in-depth: shared sanitizeUntrustedContent + content-wrap in runHybridRetrieve + DATA-not-instructions section in PLANNER_SYSTEM_PROMPT (shared-factory; stream.ts/grounding.ts untouched) — DONE 2026-06-25 (9c947b0, e06fed0)
- [x] 13-02-PLAN.md — SEC-01 D-03 planted-payload corpus: 3-4 injection payloads in ONE allowlisted meridian_slack doc + manifest + LIVE-KG ingest + hybrid-probe retrievability gate

**Wave 2** *(13-03 blocked on 13-01+13-02; 13-04 blocked on 13-01)*
- [x] 13-03-PLAN.md — SEC-01 deterministic eval: 2 direct-question injection cases + doc-injection live case (pure-code invariants, never the stochastic judge) + eval-gate GREEN no-regression (SC-1/SC-2/SC-4)
- [x] 13-04-PLAN.md — SEC-02 D-02/D-04 adversarial UI: labeled toggle/banner + AttackChips + free-form, presentation-only `adversarial` flag threaded to /api/ask, client-side attack-type label in RefusalPanel (adversarial-only) + manual streaming smoke (SC-3)

**Risk**: Medium — Phase 7's faithfulness.ts already strips injection markers from evidence (CR-01 fix in 07-01 SUMMARY). PLANNING FINDINGS: (1) injection resistance is STRUCTURAL — the read-only 4-tool surface + pure-code enforceGrounding backstop already make a confident-wrong/exfil answer impossible; D-01 prompt+sanitizer are defense-in-depth on top, never a replacement (enforceGrounding NOT loosened). (2) The #1 "looks done but isn't" trap: a planted file in data_gen/output/ is NOT retrievable until ingested+embedded into the LIVE KG — 13-02 gates on a hybrid-probe retrievability check, not a file on disk. (3) Use the allowlisted module `meridian_slack` (the existing meridian_slack_escalation module already fails test_module_names_valid). (4) SEC-01 asserted via deterministic pure-code invariants only (the ~5% stochastic judge is never used). (5) The eval gate is non-streaming only — the SEC-02 live path carries a MANDATORY manual streaming smoke ([[agent-loop-shared-factory]]). (6) The attack-type label is client-side only — no field added to the locked Envelope/SynthEnvelopeSchema.
**UI hint**: yes

> **Tail re-aim (2026-06-25):** Phases 14–18 were restructured (was: 14 Temporal, 15 Analyst Polish + Control Panel) after a capability scout found the demo *under-uses* ArangoDB. The structured graph has 7 vertex + 7 edge collections but `structuredQuery` did flat `FILTER account_id ==` scans (zero traversal); the cross-graph "join" lived in LLM prose, not AQL; and AutoGraph's Leiden `Communities` layer was built but never queried. The new tail closes these gaps and makes each capability nameable. Sequenced by sell-value-per-effort. See `DEMO-STRATEGY.md`.

### Phase 14: Graph-Depth + Explainability

**Goal**: We stop querying our graph database like SQL and start showing it doing graph work — the structured retrieval becomes a real multi-hop named-graph traversal, the structured↔unstructured join becomes a single AQL query across the `same_as` bridge, and the UI reveals the actual AQL behind every answer with retrieval-mode labels and the cross-graph join as the hero. The "no black box — one database, one query language" proof.
**Depends on**: Phase 5 (curated AQL tools — the surface to deepen); Phase 10 (edge-honesty contract — no fabricated traversals); Phase 11 (viz + UI shell to host the AQL reveal); Phase 8 (eval gate stays green through retrieval changes)
**Requirements**: GRAPH-03, EXPL-01
**Success Criteria** (what must be TRUE):

  1. `structuredQuery` traverses the existing structured edges via real named-graph traversals — Account-anchored **star**, one hop per facet: `Account → HAS_CONTRACT → Contract`, `→ HAS_USAGE → UsageFact`, `→ HAS_NPS → NPS`, `→ HAS_CONTACT → Contact`, `→ HAS_OPPORTUNITY → Opportunity` (the schema is a star, not a chain — verified against `load_structured.py`) — not six flat per-collection `FILTER account_id ==` scans — returning the same grounded records (honesty bar: no fabricated edges).
  2. The structured↔unstructured join is executed as a single AQL query traversing the `same_as` bridge (hub → KG entity → mentions → chunks/documents), not stitched in agent TypeScript.
  3. The UI reveals each retrieval step's actual AQL ("show me the query") from `retrievalPath.query`, labels each step by retrieval mode (vector / BM25 / graph traversal), and spotlights the cross-graph join — fully data-driven, no per-question hardcoding.
  4. The eval gate (Phase 8) stays green and the streaming path is smoke-tested ([[agent-loop-shared-factory]]) — the deepened retrieval does not regress grounding.

**Plans**: 4 plans
Plans:

**Wave 1** *(parallel — no shared files: structuredQuery vs new crossGraphJoin tool)*
- [ ] 14-01-PLAN.md — GRAPH-03a: rewrite structuredQuery facets as real HAS_* OUTBOUND named-graph traversals returning identical _ids + real traversed edges (GRAPH-03)
- [ ] 14-02-PLAN.md — GRAPH-03b: live same_as pre-flight + single-AQL crossGraphJoin tool (hub→KG→MENTIONED_IN→PART_OF) + register in shared TOOLS (GRAPH-03)

**Wave 2** *(blocked on 14-01 + 14-02)*
- [ ] 14-03-PLAN.md — EXPL-01 core: D-04 clean doc/chunk labels + pure buildPipeline(retrievalPath) transform (conditional/honest stages + D-03 chunk→doc collapse) (EXPL-01)

**Wave 3** *(blocked on 14-03)*
- [ ] 14-04-PLAN.md — EXPL-01 UI: RetrievalPipeline stepped component (AQL-on-demand, spotlighted join) replacing GraphViz + page wiring + eval-gate GREEN + manual streaming smoke (EXPL-01 / SC-4)

**Risk**: Low–Med — the edges already exist and are populated (`load_structured.py`, 7 edge collections; `verify_graphs.py` asserts non-empty), so the traversal rewrite is mechanical; the single cross-graph join query is the only genuinely new AQL. The dangling-bridge blocker is ALREADY FIXED (build_entity_bridge.py re-run + verified live); 14-02 only adds a pre-flight verification, not a repair. Honesty constraint is strict (same grounded records, no invented traversals). Retrieval-path change rides the eval-gate + streaming-smoke discipline.
**UI hint**: yes

### Phase 15: GraphRAG via AutoGraph Communities

**Goal**: Exercise the half of the AI platform we currently pay for and ignore — AutoGraph's Leiden community layer + summaries — so a "what are the themes across Meridian?" question does hierarchical global→local retrieval (community summary → drill to chunks) instead of uniform flat vector+BM25. Names ArangoDB's GenAI platform as what built the knowledge graph.
**Depends on**: Phase 3 / build pipeline (AutoGraph builds `customer360_Communities` + `customer360_rags`); Phase 14 (AQL-reveal surface to show the hierarchical retrieval); Phase 8 (eval gate)
**Requirements**: RAG-01
**Success Criteria** (what must be TRUE):

  1. A retrieval mode queries the `customer360_Communities` layer + community summaries for global/thematic questions and drills into chunks for local specifics — the community layer is no longer built-but-unqueried.
  2. The hierarchical retrieval is visible in the AQL reveal + viz (community → chunk), and the talk track names ArangoDB's GenAI platform / AutoGraph.
  3. Community summaries exist (generated at build time if absent) and are grounded — citations still trace to real records.
  4. The eval gate stays green; legitimate questions still answer correctly through the existing flat path where appropriate.

**Plans**: TBD
**Risk**: Med–High — may require generating community summaries at build time and a routing decision (when to go global vs. local). The grounding bar applies to summary-derived claims. Keep the flat hybrid path as the default so this is additive.

### Phase 16: Time-Travel (Temporal Graph)

**Goal**: "Show me the Northwind account graph as it was at renewal" — and watch the traversal re-resolve when we flip the date. Implemented as ArangoDB's documented time-travel modeling pattern (effective-dated edges + `@asOf` traversal in plain AQL), framed honestly as a pattern the platform makes clean, not a native time machine.
**Depends on**: Phase 9 (multi-year Northwind history); Phase 14 (the traversal + AQL-reveal surface the `@asOf` filter rides on); Phase 8 (eval gate covers a temporal question)
**Requirements**: TEMP-01
**Success Criteria** (what must be TRUE):

  1. The relevant Northwind structured edges carry `valid_from`/`valid_to` (effective-dated), derived from the dates already on the connected records; curated tools accept an optional `@asOf` bind parameter (default "now" — existing behavior unchanged when absent).
  2. The agent answers "how did Northwind evolve 2023→2025" and "what did it look like at renewal" as a versioned graph traversal — every cited record is valid within the stated window; the `valid_from <= @asOf < valid_to` filter is visible in the revealed AQL.
  3. Temporal claims are individually grounded — the eval gate flags claims citing out-of-window records — and is extended with at least one temporal question that stays green.
  4. The pitch is honest: positioned as effective-dated modeling on one engine (not native bitemporality), parity-acknowledged vs. Neo4j, differentiated on "temporal + traversal + hybrid + cross-graph join, one AQL."

**Plans**: TBD
**Risk**: High (relative to the tail) — the heaviest remaining item: synthetic-data coherence. The validity intervals across Account/Contract/Usage/Slack/email must line up so the as-of snapshot tells a consistent story (Phase-9-class generation effort, not engine effort). *(Opportunistic add at plan time: compute trends in AQL via COLLECT/WINDOW and cite the engine's number — a cheap grounding win on the known trend-claim faithfulness gap; not committed, flag during /gsd-plan-phase.)*

### Phase 17: Agent Memory on ArangoDB

**Goal**: Make ArangoDB the agent's brain, not just its retriever — persist each grounded answer + the entities/records it touched as a graph, embed past questions for related-Q&A recall, and power multi-turn follow-ups from that graph-resident memory. The "agentic brain on Arango" moment: write-path + vector + graph for agent state, one engine.
**Depends on**: Phase 14 (graph-resident entities to link memory into); Phase 11 (UI shell for multi-turn); Phase 8 (eval gate covers a multi-turn scenario)
**Requirements**: MEM-01 (subsumes AGENT-08), MEM-02 (conversation-history UI, revives 999.3)
**Success Criteria** (what must be TRUE):

  1. The agent writes state into ArangoDB — each answer envelope + the entities/records it cited stored as graph nodes; past questions embedded for retrieval — demonstrating the DB as the agent's backing store (the agent is no longer fully stateless).
  2. Multi-turn follow-ups ("why?", "show me the contract", "compare to the other account") retain context across turns, each turn independently grounded (citations trace to real records, never to prior turns).
  3. Related-Q&A / memory retrieval is a graph+vector query over the persisted memory, visible in the AQL reveal.
  4. A conversation-history UI surface (MEM-02) lists past questions/answers — read back out of ArangoDB — so a presenter tracks the arc and revisits prior answers; doubles as a platform-visibility moment ("this history comes from the graph").
  5. The eval gate covers at least one multi-turn scenario and stays green; the per-turn grounding invariant holds (no prior-turn ungrounded content leaks into a later grounded answer).

**Plans**: TBD
**Risk**: Med–High — new write-path on a previously read-only agent (the read-only credibility property must be preserved for *source* data; memory is a separate, agent-owned namespace). Scope risk: keep memory bounded and the per-turn grounding invariant strict. Revives AGENT-08 as a platform capability.
**UI hint**: yes

### Phase 18: Presenter Control Panel + CDC Reframe

**Goal**: The demo is fully presenter-ready and the live-update moment finally *names ArangoDB* — a control panel gives one-click access to every capability moment (traversal, cross-graph join, GraphRAG, time-travel, memory) plus reset and the CDC trigger; the what-changed moment is reframed so the buyer attributes the propagation to one-engine consistency.
**Depends on**: Phases 14–17 (the moments the presets wire up); Phase 12 (the built CDC pipeline + trigger to reframe); Phase 11 (UI shell)
**Requirements**: DEMO-01, CDC-04
**Success Criteria** (what must be TRUE):

  1. A control panel provides one-click access to ≥6 preset scenarios spanning the capability moments, a state reset to a clean start, and the CDC update trigger.
  2. A presenter can run the full demo arc — pick a preset, reveal the AQL, flip the time-travel date, trigger an update, ask a follow-up, see the diff — without touching the keyboard beyond those interactions.
  3. The CDC what-changed banner + talk track name ArangoDB's role: one source change updates the structured graph, re-embedded vectors, and the BM25 view in one store — describing only what the pipeline genuinely does (no implied real-time WAL streaming).
  4. The eval gate stays green and the streaming path is smoke-tested.

**Plans**: TBD
**Risk**: Low–Med — mostly a UI build on existing primitives (Phase 12 trigger, Phase 13 toggle/banner pattern). Placed last (per discussion 2026-06-25) so presets wire every capability moment in one clean build rather than being reworked as moments land. CDC-04 is presentation-only.
**UI hint**: yes

### Demo Assets track *(parallel, non-code — ASSET-01)*

**Goal**: Make the sales narrative a first-class deliverable, not an afterthought — runs alongside Phases 14–18.
**Requirements**: ASSET-01
**Deliverables**: a talk track sequencing the aha moments across the 3-account arc (Northwind expansion / Meridian hidden-risk / Helio churn); a "maps to your Salesforce / Slack / contracts" one-pager that bridges demo → POC; a "3 systems + glue vs. one engine" competitive one-liner; capability-naming notes (ArangoDB GenAI platform, a platform-security slide for the Zscaler audience — RBAC / encryption / audit / SSO, ArangoGraph managed cloud, multi-model umbrella).
**Risk**: Low — non-code; highest strategic leverage per `DEMO-STRATEGY.md §6.4`. Should track the capability moments as they land so the talk track stays accurate.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Deterministic Eval Harness | 1/1 | Complete   | 2026-06-22 |
| 9. Data Depth & 3rd Account | 3/3 | Complete   | 2026-06-23 |
| 10. Answer-Provenance Edge Enrichment | 3/3 | Complete    | 2026-06-23 |
| 11. Graph Viz + UI Refresh + Latency | 4/4 | Complete    | 2026-06-24 |
| 12. Simulated CDC + What-Changed Diff | 3/3 | Complete | 2026-06-24 |
| 13. Injection-Resistance + Adversarial Mode | 4/4 | Complete   | 2026-06-25 |
| 14. Graph-Depth + Explainability | 0/4 | Planned | - |
| 15. GraphRAG via AutoGraph Communities | 0/TBD | Not started | - |
| 16. Time-Travel (Temporal Graph) | 0/TBD | Not started | - |
| 17. Agent Memory on ArangoDB | 0/TBD | Not started | - |
| 18. Presenter Control Panel + CDC Reframe | 0/TBD | Not started | - |
| Demo Assets track (parallel, non-code) | 0/TBD | Not started | - |

---

## Backlog

### Phase 999.1: Cross-graph subgraph visualization ~~(BACKLOG)~~ — **PROMOTED to v2.0 as Phase 11 (VIZ-01/VIZ-02)**

**Original backlog entry preserved for history:**

**Goal:** Render the actual sub-graph — nodes + edges across BOTH graphs — that produced each answer, as a React Flow viz beside the citation cards (the deferred v2 differentiator: "the strongest possible expression of the core value").
**Requirements:** VIZ-01, VIZ-02 (promoted — see Phase 10 + Phase 11 above)
**Plans:** Promoted — deep-plan via `/gsd-plan-phase 10` and `/gsd-plan-phase 11`

**LOCKED requirement (user, 2026-06-19):** fully general / data-driven — must render for ANY question (incl. free-form, beyond the 6 locked) purely from the runtime `retrievalPath`. **Never hardcoded per question**, no per-question templates/layouts.

**Promotion note (2026-06-22):** VIZ-01 (edge enrichment) is Phase 10; VIZ-02 (React Flow render) is bundled into Phase 11 with the UI refresh and latency pass. The honesty bar, verified technical spine, and LOCKED requirement above are carried into Phase 10 + Phase 11 success criteria verbatim.

**Verified technical spine** (agent/src inspection, 2026-06-19):

- `RetrievalPathFragment` = `{ graph, collection, _ids, query }` (agent/src/envelope.ts) — node `_ids` + AQL string only; **no edges persisted** anywhere today.
- Tools differ: `hybridRetrieve` traverses Chunk-`PART_OF`->Document; `bridgeResolve` traverses `same_as` (hub->leaf) — both walk real edges but return only endpoint `_ids`. `structuredQuery` is flat `FILTER account_id ==` collection scans — **no traversal**.
- Approach (hybrid, both inherently general): (1) **enrich** `hybridRetrieve` + `bridgeResolve` to also RETURN the traversed edge (`e._id/_from/_to` + edge collection) and add `edges[]` to `RetrievalPathFragment` — faithful to what the agent walked; (2) structured cluster = account-anchored star / induced subgraph from whatever `_ids` came back, keyed on `account_id`, drawn as **structural** (NOT a traversal that never ran).
- Cross-graph link rendered = the real `same_as` bridge edge. Render: React Flow (`@xyflow/react`), two clusters joined by the bridge.
- **Honesty bar** (no-confident-wrong-answer): build strictly from the grounded `retrievalPath` the answer cites — never a decorative re-query. Distinct visual styles for traversed (`PART_OF`/`same_as`) vs. structural (`account_id`) vs. hybrid-retrieval (vector+BM25) edges. Cap node count to cited records; pick KG granularity (Document→Chunk→Entity, hide community internals) for legibility.
- **Effort:** low-to-moderate; no schema/architecture change (tiny RETURN-clause edge enrichment in 2 tools + the React Flow layout/curation pass).

### Phase 999.2: Inline per-claim citation markers in answer surface (BACKLOG)

**Goal:** Render inline numbered markers (superscripts ¹²³) in the streamed answer prose, each tying a specific claim/sentence to its supporting citation(s) — the literal "per-fact citation linking to `_id`" differentiator from CLAUDE.md. Surfaced during Phase 10 review (2026-06-23): a buyer cannot currently tell which claim each citation refers to.
**Requirements:** UI-04 (Phase 11) — FOLDED IN via CONTEXT D-12.
**Plans:** Folded into Phase 11 (Plan 11-02 rewrites `AnswerBody` as a numbered claim list per D-12 — sidesteps fuzzy claim→prose-span mapping by rendering the answer AS the claim list).

**Context (data already exists — this is a rendering gap, not a data gap):**
- `env.claims[]` (`ClaimSchema = { text, citations[] }`, decision D-03) already decomposes the answer into discrete factual claims, each carrying its supporting ArangoDB `_id`(s). Everything needed to draw markers is in the envelope.
- The UI (`web/app/page.tsx`) renders answer prose + clickable source cards (`onOpenSource(citations)`) but NO inline markers. Phase 11 wording says only "citation cards," which is ambiguous about inline markers — make it explicit.
- **Design decision required (not just CSS):** claims are a *decomposition*, so claim text is not guaranteed to be a verbatim substring of the prose answer. Phase 11 must choose between (a) mapping each claim to a span in the prose, or (b) rendering the answer AS the numbered claim list.

Plans:
- [x] TBD (promote with /gsd-review-backlog when ready, or fold into Phase 11 UI-04) (completed 2026-06-24)

### Phase 999.3: Conversation history in demo UI (BACKLOG)

> **Update 2026-06-25:** The *multi-turn* half of this (AGENT-08) was un-demoted and folded into **Phase 17 (Agent Memory on ArangoDB / MEM-01)** — reframed as a platform capability (graph-resident agent memory) rather than UI polish. What remains in backlog is the optional *history list* UI affordance; revisit only if it serves a specific demo moment.

**Goal:** The demo should keep and display past questions/answers — a history list and/or multi-turn conversation — so a buyer can revisit prior questions during a live demo. Surfaced during Phase 10 review (2026-06-23).
**Requirements:** TBD
**Plans:** 0 plans

**Context / architectural implication:**
- The app is currently a single-shot question box: `page.tsx` owns one answer surface and retains no answer-synthesis state across questions.
- Supporting history means accommodating a *list* of past grounded envelopes while preserving the terminal-gated grounding model (the persistent answer is only the terminal-gated grounded envelope — transient progress is never an answer). Plan the state model so history does not regress the no-confident-wrong-answer bar.

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
