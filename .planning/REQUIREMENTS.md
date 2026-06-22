# Requirements: Customer 360 (Graph-Based Demo) — v2.0

**Defined:** 2026-06-22
**Milestone:** v2.0 — "Live, Visible, Trustworthy"
**Core Value (unchanged):** A free-form question only answerable by joining the structured and unstructured graphs returns a correct, fully-sourced answer — every fact traceable to the record and graph it came from. Grounding and traceability are the whole point; a confident wrong answer in front of the audience is the failure mode to avoid.

> **v2.0 thesis:** evolve the lean v1 demo into a product-grade showcase that **updates live**, **shows the graph** behind every answer, **withstands a security audience**, and **proves its own correctness deterministically** — on richer synthetic data. Builds directly on the v1 codebase; continues phase numbering at Phase 08.

## v2 Requirements

Each maps to a roadmap phase (assigned by the roadmapper). Grouped by the 8 confirmed milestone areas.

### Area 1 — Simulated CDC + What-Changed Diff

- [ ] **CDC-01**: A change-capture mechanism watches the synthetic source files (the system-of-record under `data_gen/` output), detects a delta (which records/docs changed), and propagates it into BOTH graphs via the existing idempotent pipeline (structured AQL UPSERT; unstructured AutoGraph `incremental` + post-build `account_id` re-stamp) — no destructive full rebuild.
- [ ] **CDC-02**: The update is triggerable as a *live* demo moment (UI/API trigger), and a re-asked question reflects the change without corrupting a previously-correct answer.
- [ ] **CDC-03**: A "what-changed" diff shows which claims/citations in an answer changed as a result of the update (before/after), grounded in the actual updated records.

### Area 2 — Answer-Provenance Graph Visualization

- [ ] **VIZ-01**: The retrieval path is enriched to carry the traversed EDGES (not just node `_ids`): `hybridRetrieve` (Chunk-`PART_OF`→Document) and `bridgeResolve` (`same_as` hub→leaf) return `{_id,_from,_to,collection}` edges; `RetrievalPathFragment` gains `edges[]`. Structured cluster is an account-anchored induced subgraph (drawn as structural, not a traversal that never ran).
- [ ] **VIZ-02**: A React Flow (`@xyflow/react`) cross-graph subgraph renders the ACTUAL nodes/edges that produced each answer — two clusters joined by the real `same_as` bridge edge — built strictly from the grounded `retrievalPath` the answer cites (never a decorative re-query). Distinct visual styles for traversed (`PART_OF`/`same_as`) vs. structural (`account_id`) vs. hybrid-retrieval (vector+BM25) edges; node count capped to cited records. Fully general / data-driven (renders for ANY question, never hardcoded per question).

### Area 3 — Robust / Deterministic Eval Harness

- [x] **EVAL-03**: The eval harness is deterministic/stable across runs — the v1 ~5% stochastic refusal + faithfulness-score flake no longer cause spurious failures (seed/temperature control, multi-sample majority, and/or bounded retry on transient infra so a real green stays green).
- [x] **EVAL-04**: An on-demand green/red gate reports pass/fail over the full locked + adversarial question set with deterministic metrics (faithfulness, refusal-correctness, grounding) and a clear summary — runnable as the single pre-demo "is it working" command.

### Area 4 — ArangoDB-Brand UI Refresh + Latency

- [ ] **UI-04**: The dashboard is refreshed to a cleaner, ArangoDB-brand-aligned visual design (typography, color, layout, citation cards, the new viz panel) without regressing v1's streamed reasoning + claim-level provenance.
- [ ] **PERF-01**: Answer latency is reduced for live-demo feel (e.g. parallelized tool calls, caching, warm DB/agent path) with no loss of grounding — target a noticeably snappier first-token and total time vs. the v1 ~20–40s.

### Area 5 — Injection-Resistance + Adversarial Mode

- [ ] **SEC-01**: The agent ignores adversarial instructions embedded in customer documents (prompt-injection via the unstructured graph) — injected directives in a doc do not alter the answer, change tools, or leak; the grounding/refusal gate holds.
- [ ] **SEC-02**: A "try-to-break-it" mode lets the audience submit injection / out-of-scope / PII questions and watch the system refuse cleanly (no fabrication, no leak) — an interactive, audience-driven trust demonstration (on-brand for a security buyer).

### Area 6 — Temporal / Time-Travel Queries

- [ ] **TEMP-01**: The agent answers time-scoped questions over the multi-year synthetic data ("how did this account evolve over 2023→2025", "what did it look like at renewal time") with fully-sourced, period-correct results.

### Area 7 — Analyst Polish

- [ ] **AGENT-08**: Multi-turn follow-ups — the agent supports conversational drilling ("why?", "show me the contract", "compare to the other account") with retained context, each turn still fully grounded.
- [ ] **UI-06**: A live confidence/grounding score is surfaced per answer (ties the eval metric into the UI as a visible trust signal).
- [ ] **DEMO-01**: A demo control panel — preset scenarios, state reset, and the CDC update trigger — so the presenter can drive a reliable, repeatable demo.

### Area 8 — Synthetic Data Depth & Breadth

- [ ] **DATA-04**: A 3rd synthetic account (distinct ArangoDB-product-ladder story) plus new question arcs are generated from the canonical event-spine + entity registry, sharing the `entity_id` namespace — passing the existing referential-integrity / timeline linter before ingest.
- [ ] **DATA-05**: Existing accounts' documents are deepened/enriched (more realistic, more coherent prose + records) to make answers and the new viz more impressive — linter-gated, no coherence regressions.

## v3 / Backlog (deferred)

- **AGENT-04**: Validated generated-AQL fallback for off-script free-form questions — *deferred again this milestone (scoping decision 2026-06-22); revisit when off-script coverage becomes the priority.*
- **NEXT-03**: Reference-architecture write-up as a shareable artifact.
- **Round-2 ideas not selected:** rich source viewer (K), proactive insight surfacing (L), portfolio/comparison view (M — needs more accounts).

## Out of Scope (v2.0)

| Feature | Reason |
|---------|--------|
| Real CDC off live source databases | Sources are synthetic files; file-watch simulation has real change-capture semantics without fake infra |
| Generated-AQL fallback (AGENT-04) | Explicitly deferred this milestone |
| Real / non-synthetic customer data | Off-limits (carried from v1) |
| Multi-tenant / auth / RBAC | Demo plumbing, not the point (carried from v1) |
| Live write-back / actions | Read-only credibility demo (carried from v1) |

## Traceability

Phase mapping assigned by the roadmapper (2026-06-22). Continues phase numbering from v1 (Phase 08+).

| Requirement | Phase | Status |
|-------------|-------|--------|
| EVAL-03 | Phase 8 | Complete |
| EVAL-04 | Phase 8 | Complete |
| DATA-04 | Phase 9 | Pending |
| DATA-05 | Phase 9 | Pending |
| VIZ-01 | Phase 10 | Pending |
| VIZ-02 | Phase 11 | Pending |
| UI-04 | Phase 11 | Pending |
| PERF-01 | Phase 11 | Pending |
| UI-06 | Phase 11 | Pending |
| CDC-01 | Phase 12 | Pending |
| CDC-02 | Phase 12 | Pending |
| CDC-03 | Phase 12 | Pending |
| SEC-01 | Phase 13 | Pending |
| SEC-02 | Phase 13 | Pending |
| TEMP-01 | Phase 14 | Pending |
| AGENT-08 | Phase 15 | Pending |
| DEMO-01 | Phase 15 | Pending |

**Coverage:** 17/17 v2 requirements mapped across 8 phases (Phase 08–15).

---
*Requirements defined: 2026-06-22 (v2.0 milestone)*
*Traceability filled: 2026-06-22 (roadmapper)*
