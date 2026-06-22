# Customer 360 (Graph-Based Demo)

## What This Is

A reusable, internal graph-based **Customer 360** demo built over 100%-synthetic data for invented companies who "use ArangoDB" (NOT real ArangoDB customers). A custom agent takes a free-form natural-language question, queries two separate ArangoDB graphs — a **structured** graph (Salesforce, Snowflake, DocuSign) and an **unstructured** graph (Slack, Google Docs, emails, PDFs) — reasons across both, and returns an answer with **full retrieval-path sourcing** (which graph, which records, the traversal). It is delivered as a Next.js/Vercel dashboard with a free-form question box, runs on fully synthetic data, and is meant to be a broadly reusable internal demo asset.

## Core Value

A free-form question that can only be answered by joining the structured and unstructured graphs returns a **correct, fully-sourced answer** — every fact traceable to the record and graph it came from. Grounding and traceability are the whole point; a confident wrong answer in front of the audience is the failure mode to avoid.

## Current State

**✅ v1.0 SHIPPED 2026-06-22** — the lean demo build is complete (Phases 1–7, 31 plans, ~6-day build, ~15.9k LOC). Live on Vercel (`customer360-demo-jade.vercel.app`, SSO-protected): free-form question box → custom planner+specialists agent over two ArangoDB graphs → grounded, fully-sourced answers with citation cards; `/api/canary` health probe + daily cron pre-warm; faithfulness eval + live rehearsal harness as pre-demo gates. Code PR (planning-free, scrubbed) open at arango-solutions/customer-context#1.

27/29 v1 requirements complete. Deferred to v2 (NEXT-04): AGENT-04 generated-AQL fallback, AGENT-06 Q11 timeline, React Flow cross-graph traversal viz. Known residuals (safe failure modes, documented in 07-VERIFICATION.md): ~5% stochastic planner refusal on dual-graph questions; serverless↔ArangoDB connection hardened but root error class uncaptured.

## Current Milestone: v2.0 — "Live, Visible, Trustworthy"

**Goal:** Evolve the lean v1 demo into a product-grade showcase that updates live, *shows* the graph behind every answer, withstands a security audience, and proves its own correctness deterministically.

**Target features (8 areas):**
1. **Simulated CDC + what-changed diff** — watch the synthetic source files (the system-of-record), capture the delta, propagate through the existing UPSERT/incremental pipeline, and show which claims/citations changed in the answer. Real change-capture semantics; live demo moment.
2. **Answer-provenance graph viz** — React Flow cross-graph subgraph rendered strictly from the grounded `retrievalPath` (the actual nodes/edges traversed to produce the answer; never a decorative re-query).
3. **Robust/deterministic eval harness** — eliminate the ~5% stochastic flake; an on-demand green/red gate with deterministic metrics that proves "this works" before any demo.
4. **ArangoDB-brand UI refresh** — cleaner, on-brand, plus a latency pass (parallel tool calls / caching / pre-warm) so answers feel fast in the room.
5. **Injection-resistance + "try-to-break-it" mode** — agent ignores adversarial instructions embedded in customer docs; an audience-driven mode to attempt injection / out-of-scope / PII and watch it refuse. The security story for a Zscaler audience.
6. **Temporal / time-travel queries** — "how did this account evolve over 2023→2025", leveraging the multi-year synthetic data.
7. **Analyst polish** — multi-turn follow-ups, a live confidence/grounding score per answer, and a demo control panel (presets, reset, trigger update).
8. **Synthetic data depth & breadth** — a 3rd account + new question arcs + richer/deeper documents, gated by the existing integrity linter.

**Key context:** Build on the existing stack (Next.js/AI SDK/arangojs/AutoGraph; React Flow already specced). Continues phase numbering from v1 (Phase 08+). The grounding/no-confident-wrong-answer bar and the shared-repo no-planning/no-sensitive rule still hold. Carry-forward residuals from v1 (07-VERIFICATION.md): the deterministic-eval work (area 3) directly targets the ~5% stochastic refusal.

**Next milestone:** v2.0 — replaces the v1 "next candidates" list above (NEXT-01 live-update and the React Flow viz are now in scope; NEXT-02 partially via area 8; AGENT-04 generated-AQL stays deferred per this milestone's scoping).

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Deep architecture research across ArangoDB options (AutoGraph vs. custom-modeled graph + custom agent), producing a decision matrix and rough phase-level time estimate — *Validated in Phase 1: decision-matrix.md (AutoGraph-hybrid via platform, signed off 2026-06-16) + revised-estimate.md (~5–6 wk lean)*
- [x] Define the questions a Customer 360 should answer (ArangoDB-product-flavored) + the demo narrative, for sign-off — *Validated in Phase 1: locked-questions-and-data-map.md (6-question demo arc + 2 account sketches, post-pivot)*
- [x] Map the questions to required data across source systems (Salesforce, Snowflake, DocuSign; Slack, Google Docs, email, PDF) — *Validated in Phase 1: per-question data map (QMAP-02)*

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- [ ] Generate deep, coherent, fully-synthetic data for 2 demo customers (invented companies adopting ArangoDB's products) — multi-year stories tying contracts, usage, CRM, threads, emails together
- [ ] Build the structured graph (Salesforce / Snowflake / DocuSign) in ArangoDB
- [ ] Build the unstructured graph (Slack / Google Docs / email / PDF) in ArangoDB
- [ ] Establish cross-graph entity resolution so the agent can link the same entity across both graphs
- [ ] Build the custom reasoning agent (leaning planner + specialists; curated-AQL tools only for the lean demo — validated generated-AQL fallback deferred to v2)
- [ ] Surface full retrieval path + source attribution in agent answers
- [ ] Build the Next.js/Vercel dashboard with a free-form question box and inline answer + sourcing display
- [ ] Validate grounding: every answer traceable to real records, with output validation/eval before the live demo

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- Real / non-synthetic customer data — off limits; all data must be synthetic
- Reproducing Cadence's existing reference architecture — designing our own from first principles instead
- Blog post — unrelated to this project
- Supply chain demo, Healthcare 360, feature-tracker fixes — separate/other work, tracked elsewhere
- Click-through pre-built-button demo model — C360 uses a free-form question box instead
- Knowledge-graph-level history / time-travel as a built feature — a known AutoGraph gap; evaluate impact, don't build it for the demo

## Context

- **ArangoDB environment is available**, with **AutoGraph enabled** — the spike phase can prototype AutoGraph hands-on.
- **AutoGraph source is local** at `/Users/plosiewicz/Desktop/autograph` — Phase 1 research should mine it for concepts to borrow and shortcomings to avoid. It is a Python gRPC/REST service over ArangoDB that builds a three-layer knowledge graph (documents → Leiden clusters → per-cluster RAG strategy: VectorRAG vs FullGraphRAG), with embeddings (OpenAI/Triton), BM25+vector similarity fused via RRF, and module scoping. It is purpose-built for turning **documents** into a knowledge graph (the unstructured side); the structured/relational sources map more naturally to a hand-modeled graph.
- **AutoGraph capabilities & limits (from ArangoDB's MetaCX technical Q&A, June 11):**
  - *Query visibility:* "Retriever as a service" hides the underlying AQL today; queries are LLM-optimized and a DB user can see them but not conveniently / not in the UI. **Query TRACES are roadmap Q3/Q4 2026.** Retrievers do return metadata. → Conflicts with the "full retrieval path" requirement; a custom agent emitting its own AQL gives full traceability.
  - *Updates:* Incremental in the narrow sense (add new files to a cluster, retrieve them), but **no general incremental capability exposed in the UI.** For frequently-updated files, use a module with a VectorRAG strategy. Advanced methods don't require re-clustering the whole corpus (approximate methods exist).
  - *History:* **Re-ingest overwrites today.** ArangoDB keeps a revision marker but no queryable history; KG-level history = a "Time-Travel" feature requiring implementation effort. Default is latest-and-greatest.
  - *Modules:* Operational/scoping boundary, not a quality boundary. Extraction quality is per Leiden cluster (each gets 8–12 entity types via an LLM on sample docs). Start with "default," split into modules only for a concrete reason.
  - *Flexibility:* LLMs fully swappable (any OpenAI-compatible endpoint); data not locked in.
- **Audience:** Internal / broad / reusable (no longer a live Zscaler-buyer presentation). The 2 demo customers are invented companies who adopt ArangoDB's own products along the land-and-expand ladder (Community → Enterprise → ArangoGraph → GenAI/GraphML) — 100% synthetic, NOT real ArangoDB customers. Because the audience is internal/broad, the demo's value is **query-time** cross-graph sourcing rather than buyer-domain fidelity.
- **Immediate driver (past):** The 2026-06-16 check-in needed a roadmap with phase-level time estimates; the roadmap was the deliverable for that meeting. That check-in is now past, and the scope pivot below (ArangoDB-domain, lean ~5–6 wk AutoGraph-hybrid demo) was decided as a result.
- This is the user's first time building a custom agent; the deep research + spike phases exist specifically to de-risk that.

## Constraints

- **Tech stack**: Frontend Next.js on Vercel (shared team account); backend points to ArangoDB. — Containers are painful to maintain with frequently-changing code; Vercel avoids that.
- **Database**: ArangoDB (graph). AutoGraph available for the unstructured/GraphRAG side. — Existing environment.
- **Data**: 100% synthetic; no real customer data. Deep & coherent across 2 customers. — Real data off limits; coherence is the hardest part.
- **Grounding**: Answers must be traceable to real records; output validation/eval required before the live demo. — A confident wrong answer in front of the audience is unacceptable.
- **Updatability**: The demo must accommodate data updates, making AutoGraph's update/history limits a real architecture-selection criterion. — User confirmed updates matter.
- **Traceability**: Full retrieval path (graph + records + traversal) must be visible. — AutoGraph hides queries today, so this constrains the architecture choice.

## Key Decisions

<!-- Decisions made during questioning. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Scope to the Customer 360 demo only | Keep focus; supply chain / blog / Healthcare 360 are separate work | — Pending |
| Two separate graphs (structured + unstructured), agent bridges them | Matches the source-system split and the cross-graph reasoning story | — Pending |
| Free-form question box (not pre-built buttons) for C360 | Shows true flexibility; raises the bar on agent + grounding | — Pending |
| Full retrieval-path sourcing required | Core value; differentiator; pushes against AutoGraph's opaque queries | — Pending |
| Architecture chosen on technical merit (no obligation to feature AutoGraph) | Pick what best serves the demo (updates, traceability, grounding) | — Resolved |
| **Unstructured graph: AutoGraph-hybrid via the deployed AutoGraph platform** (build-time KG construction; agent queries the resulting `{project}_kg` collections with its own AQL) | REVERSES the 2026-06-15 fully-custom lock (matrix still scores fully-custom 3.85 vs. hybrid 3.45 — the flip is flip-conditions #1+#2 operating as designed, not a re-scoring). #1 Timeline: v1 re-scoped to a lean ~5–6 wk demo, and the hybrid removes the +2–3 wk custom-pipeline build. #2 Traceability bar met: audience is now internal/broad/reusable, and the demo's value is query-time cross-graph sourcing (Chunk → Document → source + the agent's own AQL + the cross-graph join), which the hybrid delivers fully; build-time extraction-step transparency is not required. Document-level cross-graph join via post-build `account_id` UPSERT. Signed off 2026-06-16. | **LOCKED — Phase 2/3 basis** |
| **Domain: ArangoDB's own products** (Community → Enterprise → ArangoGraph → GenAI/GraphML ladder), 100%-synthetic invented companies | Replaces the prior Zscaler-specific domain (ZIA/ZPA/ZDX); audience is internal/broad/reusable, so the demo runs on ArangoDB's product story rather than a buyer's. None of the companies are real ArangoDB customers. | — Resolved |
| **v1 re-scoped to a lean ~5–6 wk demo** (6-question arc, 2 accounts, curated-AQL tools only, citation cards) | Lean scope is the lowest-risk path to a credible internal/reusable demo. Generated-AQL fallback and the React Flow traversal viz are deferred to v2. See `revised-estimate.md` (authoritative). Signed off 2026-06-16. | — Resolved |
| Design our own architecture (ignore Cadence's) | Avoid anchoring; build from first principles | — Pending |
| Phase 1 = deep architecture research + decision matrix; spike the chosen approach next, then build | User does not want to lock in the wrong architecture; de-risk first | — Pending |
| Agent leaning planner + specialists; hybrid curated-AQL-tools + validated generated-AQL fallback | Clearer sourcing + reliable-yet-flexible querying for a live demo | — Pending (validate in research) |
| Entity resolution & cross-graph reasoning order deferred to research | Core unknowns; don't commit prematurely | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-16 — pivot to ArangoDB-domain lean AutoGraph-hybrid demo (internal/broad/reusable audience; 6 questions, 2 accounts, curated-AQL + citation cards; ~5–6 wk). Supersedes the post-Phase-1 state.*
