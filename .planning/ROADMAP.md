# Roadmap: Customer 360 (Graph-Based Demo)

A graph-based Customer 360 demo over 100%-synthetic data: a Next.js/Vercel dashboard with a free-form question box, backed by a custom planner+specialists agent that reasons across two ArangoDB graphs (hand-modeled structured + AutoGraph-built unstructured) and returns answers where every fact is traceable to its record, graph, and traversal.

## Milestones

- ✅ **v1.0 — Lean demo (SHIPPED 2026-06-22)** — Phases 1–7, 31 plans. Architecture research → synthetic data + linter → both graphs → canonical entity bridge → custom reasoning agent → Next.js/Vercel UI → grounding eval + demo hardening. 27/29 v1 requirements complete (AGENT-04 generated-AQL fallback and AGENT-06 Q11 timeline deferred to v2). Full detail: [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md) · requirements: [milestones/v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md).

- 🔄 **v2.0 — Live, Visible, Trustworthy (IN PROGRESS)** — Phases 8–15. Evolve the lean v1 demo into a product-grade showcase that updates live, shows the graph behind every answer, withstands a security audience, and proves its own correctness deterministically — on richer synthetic data.

## v2.0 Phases

- [ ] **Phase 8: Deterministic Eval Harness** — Eliminate the ~5% stochastic flake; build a trustworthy green/red gate runnable before any demo
- [ ] **Phase 9: Data Depth & 3rd Account** — Add a 3rd synthetic account + deepen existing docs; linter-gated, building the data foundation v2 features depend on
- [ ] **Phase 10: Answer-Provenance Edge Enrichment** — Enrich `hybridRetrieve` + `bridgeResolve` to return traversed edges; add `edges[]` to `RetrievalPathFragment`
- [ ] **Phase 11: Graph Viz + UI Refresh + Latency** — React Flow cross-graph subgraph render, ArangoDB-brand UI refresh, confidence score, and latency pass
- [ ] **Phase 12: Simulated CDC + What-Changed Diff** — File-watch CDC, live update trigger, and before/after diff of changed claims/citations
- [ ] **Phase 13: Injection-Resistance + Adversarial Mode** — Harden the agent against prompt injection from docs; add audience-facing "try-to-break-it" mode
- [ ] **Phase 14: Temporal Queries** — Time-scoped question support over multi-year synthetic data with period-correct sourcing
- [ ] **Phase 15: Analyst Polish + Demo Control Panel** — Multi-turn follow-ups, demo control panel (presets, reset, CDC trigger)

## Phase Details

### Phase 8: Deterministic Eval Harness

**Goal**: The eval suite is trustworthy and deterministic — a single command proves the demo works before any live run, without spurious failures from LLM stochasticity or transient infra.
**Depends on**: Phase 7 (faithfulness.ts, questions.eval.test.ts, adversarial.ts already exist — this phase hardenes and extends them)
**Requirements**: EVAL-03, EVAL-04
**Success Criteria** (what must be TRUE):
  1. Running the full eval suite back-to-back produces the same pass/fail result — the ~5% stochastic refusal flake no longer causes a green suite to turn red on re-run (seed/temperature control + majority vote in place).
  2. A single command runs the full locked + adversarial question set and prints a clear pass/fail summary with per-question faithfulness scores, refusal-correctness outcomes, and a grounding verdict.
  3. A genuine regression (a question that should pass actually failing) produces a red exit code — the gate is honest, not a rubber stamp.
  4. The eval gate is the confirmed pre-demo command: run it, see green, demo with confidence.
  5. The answer envelope emits a deterministic `groundingScore` (and/or `faithfulnessScore`) field from the eval path, so the UI can surface it as a visible per-answer trust signal in Phase 11 (UI-06) without recomputing. *(Scope tweak, 2026-06-22 — feeds UI-06.)*
**Plans**: 1 plan
Plans:
- [ ] 08-01-PLAN.md — Planner determinism (temperature:0) + groundingScore field + enforceGrounding injection + eval-gate.ts pre-demo command

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
  5. The eval gate (Phase 8) stays green after loading the new data — existing answers are not corrupted.
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
**Risk**: Medium — React Flow layout for arbitrary graph shapes requires design work (pick KG granularity, handle large traversals gracefully). Honesty bar is strict: viz must never fabricate edges. UI refresh + PERF-01 are well-understood work. UI-06 confidence score depends on EVAL metrics being surfaced from the answer envelope.
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
**Plans**: TBD
**Risk**: Medium — the idempotent pipeline (load_structured.py, build_unstructured.py AutoGraph incremental, stamp_account_id.py) already exists and was designed for this. The new work is the file-watch CDC layer, the UI/API trigger, and the before/after diff logic. The diff (CDC-03) is the highest-design-effort piece: it requires storing the pre-update answer envelope and comparing grounded citations. **Planning decision required up front (scope tweak, 2026-06-22):** pick the envelope-storage approach before building CDC-03 — in-memory session vs. a lightweight ArangoDB collection (no answer-envelope persistence exists in v1). Decide at `/gsd-plan-phase 12`.

### Phase 13: Injection-Resistance + Adversarial Mode

**Goal**: The agent ignores adversarial instructions embedded in customer documents, and the demo can include a live audience moment where someone tries to break it and watches it refuse cleanly.
**Depends on**: Phase 7 (enforceGrounding pure-code gate + adversarial.ts — the foundation); Phase 11 (the UI mode for SEC-02 needs the refreshed UI shell); Phase 8 (eval gate covers adversarial refusal correctness)
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Adversarial instructions embedded in a synthetic document (prompt injection via the unstructured graph) do not alter the agent's answer, change the tools it calls, or cause it to leak; the grounding/refusal gate holds.
  2. A curated injection payload can be added to a synthetic doc and the agent demonstrably ignores it — verifiable by a test, not just assertion.
  3. A "try-to-break-it" UI mode lets a presenter submit injection / out-of-scope / PII questions and watch the system refuse cleanly (refused:true, zero fabricated citations, clean structured message) — an interactive audience-facing trust demonstration.
  4. Legitimate questions continue to answer correctly through the same path — SEC-01 hardening does not regress grounded answers.
**Plans**: TBD
**Risk**: Medium — Phase 7's faithfulness.ts already strips injection markers from evidence (CR-01 fix in 07-01 SUMMARY). The incremental work is: document-level injection hardening in the retrieval path (not just evidence wrapping), the UI mode toggle for SEC-02, and a suite of curated adversarial payloads that are demonstrably defeatable. The "try-to-break-it" mode is mostly a UI/UX design decision.
**UI hint**: yes

### Phase 14: Temporal Queries

**Goal**: The agent answers time-scoped questions over the multi-year synthetic data with fully-sourced, period-correct results — enabling "how did this account evolve" and "what did it look like at renewal" demo moments.
**Depends on**: Phase 9 (3rd account + deeper data — temporal queries need rich multi-year history to traverse); Phase 5 (structured curated AQL tools — time-scoped filters extend the existing patterns); Phase 8 (eval gate covers new temporal questions)
**Requirements**: TEMP-01
**Success Criteria** (what must be TRUE):
  1. The agent answers a time-scoped question ("how did Northwind evolve from 2023 to 2025") with a period-correct, fully-sourced answer — every cited record is dated within the stated window.
  2. The agent answers a point-in-time question ("what did the account look like at renewal") drawing on both the structured timeline (contract dates, usage facts) and the unstructured record (Slack threads, emails from that period) with citations.
  3. Temporal claims are individually grounded — each claim cites a record with a date or period within the stated range; the eval gate flags claims that cite out-of-window records.
  4. The eval gate (Phase 8) is extended to cover at least one temporal question and stays green.
**Plans**: TBD
**Risk**: Medium — temporal filtering in AQL is straightforward (WHERE doc.date >= @start AND doc.date <= @end). The design challenge is the planner's ability to decompose time-scoped questions and cite records with date provenance. The LLM may still under-cite multi-period trend claims (the known faithfulness gap from 07-01-SUMMARY). Temporal queries may need a dedicated curated AQL tool pattern.

### Phase 15: Analyst Polish + Demo Control Panel

**Goal**: The demo is fully presenter-ready — a control panel gives instant access to preset scenarios, state reset, and the CDC trigger; multi-turn follow-ups let an analyst drill deeper into any answer; every interaction is still fully grounded.
**Depends on**: Phase 11 (refreshed UI shell — control panel and multi-turn are UI additions); Phase 12 (CDC trigger is a control panel button); Phase 8 (eval gate stays green through multi-turn)
**Requirements**: AGENT-08, DEMO-01
**Success Criteria** (what must be TRUE):
  1. The agent supports conversational follow-ups ("why?", "show me the contract", "compare to the other account") with retained context across turns — each turn's answer is independently grounded (citations trace to real records, not to prior turns).
  2. A demo control panel provides: one-click access to at least 6 preset question scenarios, a state reset that returns the UI to a clean start, and a CDC update trigger that initiates the Phase 12 live update moment.
  3. A presenter can run the full demo arc — open demo, pick a preset, ask a follow-up, trigger an update, ask the same question again, see the diff — without touching the keyboard beyond those interactions.
  4. The eval gate (Phase 8) covers at least one multi-turn scenario and stays green.
**Plans**: TBD
**Risk**: Medium — multi-turn (AGENT-08) requires the agent to maintain a conversation history that does not inflate the context unboundedly and does not allow a prior turn's ungrounded content to influence a later grounded answer. The demo control panel (DEMO-01) is mostly a UI build on top of existing primitives. The hardest part is enforcing the per-turn grounding invariant through multi-turn context.
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Deterministic Eval Harness | 0/1 | In progress | - |
| 9. Data Depth & 3rd Account | 0/TBD | Not started | - |
| 10. Answer-Provenance Edge Enrichment | 0/TBD | Not started | - |
| 11. Graph Viz + UI Refresh + Latency | 0/TBD | Not started | - |
| 12. Simulated CDC + What-Changed Diff | 0/TBD | Not started | - |
| 13. Injection-Resistance + Adversarial Mode | 0/TBD | Not started | - |
| 14. Temporal Queries | 0/TBD | Not started | - |
| 15. Analyst Polish + Demo Control Panel | 0/TBD | Not started | - |

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
