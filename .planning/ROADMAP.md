# Roadmap: Customer 360 (Graph-Based Demo)

A graph-based Customer 360 demo over 100%-synthetic data: a Next.js/Vercel dashboard with a free-form question box, backed by a custom planner+specialists agent that reasons across two ArangoDB graphs (hand-modeled structured + AutoGraph-built unstructured) and returns answers where every fact is traceable to its record, graph, and traversal.

## Milestones

- ✅ **v1.0 — Lean demo (SHIPPED 2026-06-22)** — Phases 1–7, 31 plans. Architecture research → synthetic data + linter → both graphs → canonical entity bridge → custom reasoning agent → Next.js/Vercel UI → grounding eval + demo hardening. 27/29 v1 requirements complete (AGENT-04 generated-AQL fallback and AGENT-06 Q11 timeline deferred to v2). Full detail: [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md) · requirements: [milestones/v1.0-REQUIREMENTS.md](./milestones/v1.0-REQUIREMENTS.md).

> **Next milestone:** start with `/gsd-new-milestone` (questioning → research → requirements → roadmap). Likely v1.1/v2 candidates below in Backlog + the v2 deferrals (NEXT-01..04): live updatability, more accounts/questions, generated-AQL fallback, Q11 timeline, React Flow cross-graph traversal viz.

## Backlog

### Phase 999.1: Cross-graph subgraph visualization (BACKLOG)

**Goal:** Render the actual sub-graph — nodes + edges across BOTH graphs — that produced each answer, as a React Flow viz beside the citation cards (the deferred v2 differentiator: "the strongest possible expression of the core value").
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

**LOCKED requirement (user, 2026-06-19):** fully general / data-driven — must render for ANY question (incl. free-form, beyond the 6 locked) purely from the runtime `retrievalPath`. **Never hardcoded per question**, no per-question templates/layouts.

**Dependency:** v1 live demo ships first (v1 stays lean — citation cards carry sourcing). Deep-plan via `/gsd-plan-phase` when v1 ships.

**Verified technical spine** (agent/src inspection, 2026-06-19):
- `RetrievalPathFragment` = `{ graph, collection, _ids, query }` (agent/src/envelope.ts) — node `_ids` + AQL string only; **no edges persisted** anywhere today.
- Tools differ: `hybridRetrieve` traverses Chunk-`PART_OF`->Document; `bridgeResolve` traverses `same_as` (hub->leaf) — both walk real edges but return only endpoint `_ids`. `structuredQuery` is flat `FILTER account_id ==` collection scans — **no traversal**.
- Approach (hybrid, both inherently general): (1) **enrich** `hybridRetrieve` + `bridgeResolve` to also RETURN the traversed edge (`e._id/_from/_to` + edge collection) and add `edges[]` to `RetrievalPathFragment` — faithful to what the agent walked; (2) structured cluster = account-anchored star / induced subgraph from whatever `_ids` came back, keyed on `account_id`, drawn as **structural** (NOT a traversal that never ran).
- Cross-graph link rendered = the real `same_as` bridge edge. Render: React Flow (`@xyflow/react`), two clusters joined by the bridge.
- **Honesty bar** (no-confident-wrong-answer): build strictly from the grounded `retrievalPath` the answer cites — never a decorative re-query. Distinct visual styles for traversed (`PART_OF`/`same_as`) vs. structural (`account_id`) vs. hybrid-retrieval (vector+BM25) edges. Cap node count to cited records; pick KG granularity (Document→Chunk→Entity, hide community internals) for legibility.
- **Effort:** low-to-moderate; no schema/architecture change (tiny RETURN-clause edge enrichment in 2 tools + the React Flow layout/curation pass).
