# Requirements: Customer 360 (Graph-Based Demo) — v2.0

**Defined:** 2026-06-22
**Milestone:** v2.0 — "Live, Visible, Trustworthy"
**Core Value (unchanged):** A free-form question only answerable by joining the structured and unstructured graphs returns a correct, fully-sourced answer — every fact traceable to the record and graph it came from. Grounding and traceability are the whole point; a confident wrong answer in front of the audience is the failure mode to avoid.

> **v2.0 thesis:** evolve the lean v1 demo into a product-grade showcase that **updates live**, **shows the graph** behind every answer, **withstands a security audience**, and **proves its own correctness deterministically** — on richer synthetic data. Builds directly on the v1 codebase; continues phase numbering at Phase 08.

> **Tail pivot (2026-06-25):** Phases 14–18 re-aimed at the actual sell — making **ArangoDB's core-DB + AI-platform capabilities undeniable and nameable** to a Zscaler buyer, per `DEMO-STRATEGY.md`. A scout found the demo *under-uses* the platform: the structured graph (7 vertex + 7 edge collections) was queried with flat scans, the cross-graph join lived in LLM prose (not AQL), and AutoGraph's Leiden community layer was built-but-never-queried. The tail closes those gaps (real traversal, single cross-graph join, GraphRAG, time-travel-as-modeling-pattern, agent-memory-on-Arango) and surfaces them (AQL reveal, one-engine labels). See `DEMO-STRATEGY.md §6–7`.

## v2 Requirements

Each maps to a roadmap phase (assigned by the roadmapper). Grouped by the 8 confirmed milestone areas.

### Area 1 — Simulated CDC + What-Changed Diff

- [ ] **CDC-01**: A change-capture mechanism watches the synthetic source files (the system-of-record under `data_gen/` output), detects a delta (which records/docs changed), and propagates it into BOTH graphs via the existing idempotent pipeline (structured AQL UPSERT; unstructured AutoGraph `incremental` + post-build `account_id` re-stamp) — no destructive full rebuild.
- [ ] **CDC-02**: The update is triggerable as a *live* demo moment (UI/API trigger), and a re-asked question reflects the change without corrupting a previously-correct answer.
- [ ] **CDC-03**: A "what-changed" diff shows which claims/citations in an answer changed as a result of the update (before/after), grounded in the actual updated records.

### Area 2 — Answer-Provenance Graph Visualization

- [x] **VIZ-01**: The retrieval path is enriched to carry the traversed EDGES (not just node `_ids`): `hybridRetrieve` (Chunk-`PART_OF`→Document) and `bridgeResolve` (`same_as` hub→leaf) return `{_id,_from,_to,collection}` edges; `RetrievalPathFragment` gains `edges[]`. Structured cluster is an account-anchored induced subgraph (drawn as structural, not a traversal that never ran).
- [x] **VIZ-02**: A React Flow (`@xyflow/react`) cross-graph subgraph renders the ACTUAL nodes/edges that produced each answer — two clusters joined by the real `same_as` bridge edge — built strictly from the grounded `retrievalPath` the answer cites (never a decorative re-query). Distinct visual styles for traversed (`PART_OF`/`same_as`) vs. structural (`account_id`) vs. hybrid-retrieval (vector+BM25) edges; node count capped to cited records. Fully general / data-driven (renders for ANY question, never hardcoded per question).

### Area 3 — Robust / Deterministic Eval Harness

- [x] **EVAL-03**: The eval harness is stable across runs and the residual planner flake is *bounded and gate-classified* — `temperature:0` on both ToolLoopAgent constructors + N=3 majority-vote judge substantially reduce the v1 ~5% stochastic flake, and the gate's bounded 1-retry distinguishes a transient single-run flake (auto-recovered → GREEN) from a confirmed two-run regression (→ RED). Full elimination is not achievable on the OpenAI Responses API (it silently ignores `seed`); a genuine residual-variance cluster (e.g. Q5/Q8 under-citing on a given run) can still trip a confirmed RED, which is correct, honest behavior rather than a spurious failure. *(Reworded 2026-06-22 to match what is achievable on the Responses API; true seed-based determinism deferred — see VERIFICATION.md Option B.)*
- [x] **EVAL-04**: An on-demand green/red gate reports pass/fail over the full locked + adversarial question set with deterministic metrics (faithfulness, refusal-correctness, grounding) and a clear summary — runnable as the single pre-demo "is it working" command.

### Area 4 — ArangoDB-Brand UI Refresh + Latency

- [x] **UI-04**: The dashboard is refreshed to a cleaner, ArangoDB-brand-aligned visual design (typography, color, layout, citation cards, the new viz panel) without regressing v1's streamed reasoning + claim-level provenance.
- [x] **PERF-01**: Answer latency is reduced for live-demo feel (e.g. parallelized tool calls, caching, warm DB/agent path) with no loss of grounding — target a noticeably snappier first-token and total time vs. the v1 ~20–40s.

### Area 5 — Injection-Resistance + Adversarial Mode

- [x] **SEC-01**: The agent ignores adversarial instructions embedded in customer documents (prompt-injection via the unstructured graph) — injected directives in a doc do not alter the answer, change tools, or leak; the grounding/refusal gate holds.
- [~] **SEC-02**: A "try-to-break-it" mode lets the audience submit injection / out-of-scope / PII questions and watch the system refuse cleanly (no fabrication, no leak) — an interactive, audience-driven trust demonstration (on-brand for a security buyer). *(2026-06-25: **HIDDEN for the demo** behind `ADVERSARIAL_MODE_ENABLED=false` in `web/app/page.tsx`. Preview smoke showed an off-script attack getting answered: the live path enforces **`_id`-grounding** only — semantic faithfulness is **eval-only**, not on the live path — so it can't fully refuse free-form off-script attacks. Judged overkill for a presenter-driven demo; cutting the feature removes the invitation rather than half-shipping a broken security moment. **SEC-01 hardening + `enforceGrounding` remain always-on.** Flip the flag to restore. Residual risk: a determined skeptic free-forming an off-script question may still get a plausible ungrounded answer — acceptable for curated-preset demo, flag if revisiting.)*

### Area 6 — Temporal / Time-Travel Queries

- [ ] **TEMP-01**: The agent answers time-scoped questions over the multi-year synthetic data ("how did this account evolve over 2023→2025", "what did it look like at renewal time") with fully-sourced, period-correct results — implemented as **ArangoDB's documented time-travel modeling pattern**: effective-dated edges (`valid_from`/`valid_to`) on the structured edges that change over time, traversed "as-of" a date via an optional `@asOf` bind parameter in plain AQL. Scoped to the Northwind expansion arc. Framed **honestly** (a graph-modeling pattern the platform makes clean, not a native bitemporal engine) — the differentiator is "temporal + traversal + hybrid + cross-graph join, one engine, one AQL." *(Reframed 2026-06-25 from app-level date-filtering to a nameable platform capability — research-verified, see DEMO-STRATEGY.md.)*

### Area 7 — Analyst Polish

- [ ] **AGENT-08**: Multi-turn follow-ups — the agent supports conversational drilling ("why?", "show me the contract", "compare to the other account") with retained context, each turn still fully grounded. *(2026-06-25: un-demoted and **folded into MEM-01 / Phase 17** — reframed from app-polish multi-turn to a platform capability backed by graph-resident agent memory.)*
- [x] **UI-06**: A live confidence/grounding score is surfaced per answer (ties the eval metric into the UI as a visible trust signal).
- [ ] **DEMO-01**: A demo control panel — preset scenarios, state reset, and the CDC update trigger — so the presenter can drive a reliable, repeatable demo. *(Phase 18 — moved to last so presets wire every capability moment.)*

### Area 9 — Graph-Depth + Explainability (platform-capability tail)

- [ ] **GRAPH-03**: The structured retrieval performs **real named-graph traversal** over the existing structured edge collections — an Account-anchored **star**, one hop per facet (`Account → HAS_CONTRACT → Contract`, `→ HAS_USAGE → UsageFact`, `→ HAS_NPS → NPS`, `→ HAS_CONTACT → Contact`, `→ HAS_OPPORTUNITY → Opportunity`; star, not a chain — verified against `load_structured.py`) instead of flat `FILTER account_id ==` collection scans; AND the structured↔unstructured join is executed as a **single AQL query traversing the `same_as` bridge** (hub → KG entity → mentions → chunks/documents), not stitched together in agent TypeScript. Honesty bar (carried from VIZ-01/Phase 10): returns the same grounded records, no fabricated edges/traversals.
- [ ] **EXPL-01**: Each retrieval step's **actual AQL is revealed in the UI** ("show me the query" — the `retrievalPath.query` already carries it), each step **labeled by retrieval mode** (vector / BM25 / graph traversal), with the **cross-graph join spotlighted** as the centerpiece — the "no black box, one database, one query language" proof. Fully data-driven (no per-question hardcoding, per VIZ-02).

### Area 10 — Full GraphRAG / AI-Services Depth

> The agent uses **7% of the AutoGraph KG** today (only `PART_OF`); 611 entities, 42 communities (w/ embedded summaries), and 1,941 typed edges are built-but-unqueried (live-verified, `docs/research/autograph-kg-retrieval-surface.md`). This area lights up the rest.

- [ ] **RAG-01**: **Entity-anchored local expansion** — after hybrid retrieval lands chunks, the agent traverses the entity graph (`chunk →MENTIONED_IN(INBOUND)→ entity →RELATED_TO→ neighbors →MENTIONED_IN→ chunks`) to surface connected evidence the vector/BM25 pass missed — the "graph beats vector" GraphRAG differentiator, visible as a real `kind:'traversed'` expansion in the AQL reveal. Entities account-scoped via traversal to `Document.account_id` (no re-stamp). (611 vector-indexed entities, 975 `MENTIONED_IN` + 261 `RELATED_TO` edges, all unqueried today.)
- [ ] **RAG-02**: **Community / global retrieval** — the agent semantic-searches `customer360_Communities.embedding`, reads the **already-existing** `report_string` summary for thematic questions ("what are the risks across Meridian?"), then drills `Community ←IN_COMMUNITY← Entity →MENTIONED_IN→ Chunk` to source specifics. Names ArangoDB's GenAI platform / AutoGraph as what built the KG. **Grounding policy (LOCKED):** a community summary is LLM-synthesized — cite it as *provenance* (real stored `_id`) but require a drilled-down source chunk to back any specific claim; a synthesis is never the sole source for a fact. *(De-risked 2026-06-25 — 42 summaries already generated + embedded; scope is query + routing + grounding, not data gen.)*

### Area 11 — Agent Memory on ArangoDB ("agentic brain on Arango")

- [ ] **MEM-01**: The agent **persists state into ArangoDB** — each grounded answer envelope plus the entities/records it touched stored as graph nodes, and past questions embedded for related-Q&A retrieval — and **multi-turn follow-ups** (subsumes AGENT-08) are powered by this graph-resident memory, each turn still **independently grounded** (citations trace to real records, never to prior turns). Demonstrates ArangoDB as the agent's backing store: write-path + vector + graph for agent state, one engine.
- [ ] **MEM-02**: A **conversation-history UI surface** (revives backlog 999.3) — a visible list of past questions/answers in the demo, so a presenter can track the arc and revisit prior answers. It is the **front-end of MEM-01**: the history is read back out of ArangoDB, doubling as a platform-visibility moment ("this list comes from the graph"). *(Elevated from nice-to-have 2026-06-25 — user finds it useful for tracking demo progress/history.)*

### Area 12 — Demo Assets (non-code, parallel track)

- [ ] **ASSET-01**: First-class, non-code demo deliverables — a **talk track** sequencing the aha moments across the 3-account arc, a **"maps to your Salesforce / Slack / contracts" one-pager** (bridges demo → POC), a **"3 systems + glue vs. one engine" competitive one-liner**, and **capability-naming notes** (ArangoDB GenAI platform, a platform-security slide for the Zscaler audience — RBAC / encryption / audit / SSO, ArangoGraph managed cloud, multi-model umbrella).

### Area 1 (continued) — CDC reframe

- [ ] **CDC-04**: The existing live-update moment (CDC-01..03) is **reframed to name ArangoDB's role** — the what-changed banner + talk track attribute the propagation to **one-engine consistency** (one source change updates the structured graph, re-embedded vectors, and the BM25 view in one store). Presentation-only over the built CDC pipeline; describes only what the pipeline genuinely does (no implied real-time WAL streaming).

### Area 8 — Synthetic Data Depth & Breadth

- [x] **DATA-04**: A 3rd synthetic account (distinct ArangoDB-product-ladder story) plus new question arcs are generated from the canonical event-spine + entity registry, sharing the `entity_id` namespace — passing the existing referential-integrity / timeline linter before ingest.
- [x] **DATA-05**: Existing accounts' documents are deepened/enriched (more realistic, more coherent prose + records) to make answers and the new viz more impressive — linter-gated, no coherence regressions.

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
| DATA-04 | Phase 9 | Complete |
| DATA-05 | Phase 9 | Complete |
| VIZ-01 | Phase 10 | Complete |
| VIZ-02 | Phase 11 | Complete |
| UI-04 | Phase 11 | Complete |
| PERF-01 | Phase 11 | Complete |
| UI-06 | Phase 11 | Complete |
| CDC-01 | Phase 12 | Complete |
| CDC-02 | Phase 12 | Complete |
| CDC-03 | Phase 12 | Complete |
| SEC-01 | Phase 13 | Complete |
| SEC-02 | Phase 13 | Built, HIDDEN for demo (2026-06-25) |
| GRAPH-03 | Phase 14 | Pending |
| EXPL-01 | Phase 14 | Pending |
| RAG-01 | Phase 15 | Pending |
| RAG-02 | Phase 15 | Pending |
| TEMP-01 | Phase 16 | Pending |
| MEM-01 | Phase 17 | Pending |
| MEM-02 | Phase 17 | Pending |
| AGENT-08 | Phase 17 | Folded into MEM-01 |
| DEMO-01 | Phase 18 | Pending |
| CDC-04 | Phase 18 | Pending |
| ASSET-01 | parallel track | Pending |

**Coverage:** 24 v2 requirements mapped across 11 phases (Phase 08–18) + the non-code Demo Assets track. Tail (Phases 14–18) re-aimed at nameable ArangoDB platform capabilities per `DEMO-STRATEGY.md`.

---
*Requirements defined: 2026-06-22 (v2.0 milestone)*
*Traceability filled: 2026-06-22 (roadmapper)*
