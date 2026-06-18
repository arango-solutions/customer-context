# Roadmap: Customer 360 (Graph-Based Demo)

## Overview

A reusable, internal graph-based Customer 360 demo over 100%-synthetic data for invented companies adopting ArangoDB's own products (Community → Enterprise → ArangoGraph → GenAI/GraphML): a free-form question box on a Next.js/Vercel dashboard, backed by a custom planner+specialists agent that reasons across two ArangoDB graphs — a hand-modeled **structured** graph (Salesforce/Snowflake/DocuSign) and an **unstructured** graph (Slack/Docs/email/PDF) built via the **deployed AutoGraph platform** (the architecture chosen at the Phase-1 sign-off gate — build-time KG construction; the agent queries the resulting `{project}_kg` collections with its own AQL) — and returns answers where every fact is traceable to the record, graph, and traversal it came from. The build is **horizontally layered** (research → data → graphs → bridge → agent → UI → eval). **Phase 1 is research-only**: it makes the architecture call on evidence, confirms the ArangoDB retrieval path is supported, locks the question set, and produces a research-grounded estimate for the rest — **no application code is written in Phase 1**. This is the **lean demo** scope: 6-question arc, 2 accounts, curated-AQL tools, citation cards. The journey ends with a hardened, eval-gated demo where a dual-graph-only question returns a correct, fully-sourced answer.

**Estimated total time to demo-ready:** **~5–6 weeks** (~4–5 if Phase 5 goes clean; single builder + AI assistance, working primarily sequentially) — the research-grounded **REVISED** estimate (see §Time Estimates and `revised-estimate.md`). This supersedes the prior PRELIMINARY 10–15 wk and the 2026-06-15 13–20 wk fully-custom numbers; the reduction is structural (lean scope + AutoGraph-hybrid via platform), not optimism. The residual long pole is Phase 5 (first-of-kind custom-agent build).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Architecture Research + Question/Data Lock** - Research the architecture (AutoGraph-hybrid vs. fully-custom — neutral call), confirm the retrieval path, lock the ~10 questions, produce the real Phase 2–7 estimate; no code (~1–2 weeks) (completed 2026-06-16)
- [x] **Phase 2: Synthetic Data + Integrity Linter** - Generate 2 coherent ArangoDB-domain accounts from a canonical event-spine + entity registry (6-question arc), gated by a linter (~1–1.5 weeks) (completed 2026-06-17)
- [x] **Phase 3: Build Both Graphs (parallel)** - Hand-modeled structured graph + unstructured graph built via the AutoGraph platform (import→build→orchestrate to Layer-3 KG in the customer360 DB) + post-build account_id UPSERT, both idempotently reloadable (~1.5–2.5 weeks) (completed 2026-06-17)
- [x] **Phase 4: Canonical Entity Layer** - The document-level cross-graph `same_as` bridge (`account_id`) that links the same entity across both graphs and shows in the trace (~0.5 weeks) (completed 2026-06-18 — 04-04 closed CR-01/CR-02: both demo-critical gates now use denominator 9, resolve via the same_as bridge path (not the KG stamp / raw mention join), proven by live-DB-free negative + positive tests; re-verification PASSED 3/3, see 04-VERIFICATION.md)
- [ ] **Phase 5: Custom Reasoning Agent** - Planner + specialists, ~6 curated AQL tools (generated-AQL fallback deferred to v2), claim-level sourcing, refusal path (~1.5–2.5 weeks)
- [ ] **Phase 6: Next.js/Vercel UI + Sourcing Display** - Free-form box, streamed reasoning, claim-level provenance, citation cards (React Flow traversal viz deferred to v2) (~1 week)
- [ ] **Phase 7: Grounding/Eval + Demo Hardening** - Light faithfulness eval over the 6 locked questions, pre-warm, backup path, adversarial rehearsal (~0.5–1 week)

## Phase Details

### Phase 1: Architecture Research + Question/Data Lock

**Goal**: De-risk the entire build through research — not code. Make the unstructured-graph architecture call on evidence, confirm the ArangoDB retrieval path is supported, lock the question set that defines all downstream schema and curated AQL, and produce the research-grounded estimate for Phases 2–7. No application code is written in this phase.
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, QMAP-01, QMAP-02
**Success Criteria** (what must be TRUE):

  1. A deep, evidenced architecture decision matrix comparing **AutoGraph-hybrid** vs. a **fully-custom graph + agent** (chunk→embed→entity-extraction) is filled in and scored across traceability, updatability, grounding, operational cost/complexity, build effort, and time-to-demo, with a signed-off recommendation made **neutrally on the evidence** (no assumed winner) — ARCH-01.
  2. Research determines the unstructured-graph approach (AutoGraph vs. fully-custom chunk→embed→extract) with documented evidence on traceability (claim-level sourcing from the graph), update behavior, and operational cost/complexity — the basis for the ARCH-01 recommendation — ARCH-02.
  3. The available ArangoDB environment is confirmed (a capability check, not a build) to support the required vector + BM25 retrieval path (3.12.9+ or a documented embed-then-index fallback) — ARCH-03.
  4. The ~10 canonical questions (Q1–Q10) + the Q12 reconciliation moment are locked, each verified to FAIL if either graph is removed — QMAP-01.
  5. Each locked question is mapped to the specific source systems and records required to answer it — QMAP-02.
  6. A REVISED, research-grounded time estimate for Phases 2–7 is produced (the "real estimate"), replacing the preliminary numbers and reflecting the chosen architecture's actual build cost.

**Plans**: 5 plansPlans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 0: scaffold docs/research/ + obtain live ArangoDB credentials (ARCH-03 gate)
- [x] 01-02-PLAN.md — Wave 1: throwaway ArangoDB capability probe → arango-capability-check.md (ARCH-03)
- [x] 01-03-PLAN.md — Wave 1: lock 12 questions + data map + dual-graph proofs + account sketches (QMAP-01/02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Wave 2: weighted decision matrix + recommendation with flip-conditions (ARCH-01/02)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md — Wave 3: revised Phase 2–7 estimate + index + D-03 user sign-off gate

**Risk**: HIGHEST-LEVERAGE / HIGH UNKNOWN — but resolved by research, not a spike. The most expensive pivot lives here: whether the unstructured side is built via AutoGraph or a fully-custom chunk/embed/extract pipeline, decided on traceability, update behavior, and operational cost. Also flagged for deeper research: AutoGraph `{proj}_kg` schema / `incremental` semantics, a custom-pipeline alternative's effort and grounding fidelity, ArangoDB vector-index behavior on the live env, AI SDK 6 / Claude model-id pins, and the serverless Vercel→ArangoDB connection pattern. **Note:** Phase 1 produced the research-grounded REVISED Phase 2–7 estimate (~5–6 wk lean) that replaced the original preliminary numbers — see §Time Estimates.

### Phase 2: Synthetic Data + Integrity Linter

**Goal**: Produce two distinct, internally-airtight synthetic accounts whose multi-year, ArangoDB-product-ladder stories make the 6 locked questions answerable and impressive — with shared canonical entity IDs baked in from the start.
**Depends on**: Phase 1 (questions + data mapping drive what the data must support)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. Two differentiated accounts exist — one healthy/expanding, one mixed (the Q12 account) — each with a believable multi-year ArangoDB-product-ladder (Community→Enterprise→ArangoGraph→GenAI) story — DATA-01.
  2. All 7 sources (Salesforce, Snowflake, DocuSign, Slack, Google Docs, email, PDF) are generated from a single canonical event-spine + master entity registry sharing one `entity_id` namespace — DATA-02.
  3. An automated referential-integrity + timeline-coherence linter passes before ingest: every foreign key resolves, no event references a future event, contract dates bound the usage/comms timelines, monetary amounts agree across sources — DATA-03.
  4. Each locked question from Phase 1 has the underlying records present to answer it across both the structured and unstructured sides.

**Plans**: 5 plans

**Wave 1** *(no dependencies)*

- [x] 02-01-PLAN.md — Wave 1: linter scaffold (8 test stubs + pytest.ini + conftest) — Nyquist Wave 0 (DATA-02, DATA-03)

**Wave 2** *(blocked on spine sign-off — D-01 checkpoint)*

- [x] 02-02-PLAN.md — Wave 2: canonical event-spine + entity registry (both accounts) + user redline checkpoint (DATA-01, DATA-02)

**Wave 3** *(blocked on D-01 approval)*

- [x] 02-03-PLAN.md — Wave 3: structured data generators (CRM/Snowflake/DocuSign → JSON) + structural linter checks (DATA-01, DATA-02)
- [x] 02-04-PLAN.md — Wave 3: unstructured generators (Slack/Email/Docs/PDF) + LLM prose pipeline + manifest.json (DATA-01, DATA-02)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — Wave 4: generate.py entrypoint + near-miss guard (full linter suite GREEN = Phase 3 hard gate) (DATA-01, DATA-02, DATA-03)

**Risk**: HIGH UNKNOWN. Earliest-binding risk and first-principles work (LOW–MEDIUM confidence). The LLM-for-prose / code-for-facts discipline and the linter rules are design-heavy; incoherent data found late is a full redo of this phase. Worth a focused design pass before generating at volume.

### Phase 3: Build Both Graphs (parallel)

**Goal**: Stand up both ArangoDB graphs from the linted synthetic data — the hand-modeled structured graph and the unstructured graph built via the **deployed AutoGraph platform** (import → build → orchestrate to a Layer-3 KG in the `customer360` DB), then stamp the cross-graph join key via a post-build `account_id` UPSERT — each idempotently reloadable so data can be updated without a full rebuild.
**Depends on**: Phase 2 (linted data + entity registry); the Phase 1 sign-off gate locked the AutoGraph-hybrid (platform) build method
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03
**Success Criteria** (what must be TRUE):

  1. The structured graph (Account, Opportunity, Contract, UsageFact, Contact, Product …) is modeled and loaded into ArangoDB from the synthetic Salesforce/Snowflake/DocuSign data — GRAPH-01.
  2. The unstructured graph (Documents/Chunks/Entities/Communities/Relations) is built into ArangoDB **via the deployed AutoGraph platform** (import → build → strategize → orchestrate to the Layer-3 KG), with a post-build AQL UPSERT stamping `account_id`/`entity_id` onto the built collections (keyed on `file_name`/`citable_url`, since AutoGraph drops other custom import metadata) — from the synthetic Slack/Docs/email/PDF — GRAPH-02.
  3. Both graphs reload idempotently — structured via AQL UPSERT keyed on source IDs, unstructured via AutoGraph `incremental:true` append plus a re-run of the post-build `account_id` UPSERT — so a data update does not require a destructive full rebuild, and a re-run does not corrupt a previously-correct answer — GRAPH-03.
  4. Our own AQL (vector + traversal) returns attributable results from the unstructured graph good enough to support claim-level sourcing.

**Plans**: 5 plans

**Wave 1** *(no dependencies — parallel)*

- [x] 03-01-PLAN.md — Wave 1: verification harness scaffold (verify_graphs.py + verify_coref_eval.py) + pre-flight dim/auth checks (GRAPH-01, GRAPH-02, GRAPH-03)
- [x] 03-02-PLAN.md — Wave 1: D-05 coref-hard doc generation + manifest update (GRAPH-02)

**Wave 2** *(blocked on Wave 1 completion — parallel with each other)*

- [x] 03-03-PLAN.md — Wave 2: structured graph DDL + UPSERT load + idempotency proof (GRAPH-01, GRAPH-03)
- [x] 03-04-PLAN.md — Wave 2: AutoGraph unstructured KG build via REST + A1/A2/OBT-1 settlement (GRAPH-02, GRAPH-03)

**Wave 3** *(blocked on Wave 2 completion — both graphs required)*

- [x] 03-05-PLAN.md — Wave 3: post-build account_id UPSERT + D-04 thin-proof AQL probes + D-05 coref eval (GRAPH-02, GRAPH-03)

**Risk**: LOWER — the AutoGraph platform handles the well-documented build flow (chunking/embedding/extraction/Leiden/loading); the custom work is running the import→build→orchestrate flow, hand-modeling the structured graph, and the post-build `account_id` UPSERT. The two builds parallelize. Choosing the platform (vs. the rejected fully-custom arm) is what removed the +2–3 wk pipeline build that drove the prior estimate.

> **Update pipeline (GRAPH-03) — design ready:** the document-update → graph-update flow (module-scoped vs partition-scoped re-ingest; EDIT/ADD/DELETE lanes; the two open build-time tests) is fully worked out in `.planning/spikes/001-autograph-kg-claim-sourcing/UPDATE-PIPELINE.md`. The verified `{proj}_kg` schema + field gotchas (`file_name` not `filename`, text in `content`, `PART_OF`/`MENTIONED_IN` traversal, 512-dim vectors) are in that spike's README.

### Phase 4: Canonical Entity Layer

**Goal**: Build the cross-graph bridge — a canonical entity layer that deterministically links the same account/person/contract across both graphs and surfaces that link as a first-class traceability artifact.
**Depends on**: Phase 3 (needs node `_id`s from BOTH graphs — the genuine dependency gate)
**Requirements**: ENT-01, ENT-02
**Success Criteria** (what must be TRUE):

  1. A `canonical_entities` collection plus `same_as` edges link each structured-graph node and unstructured-graph node for the same real-world entity, built offline from the shared IDs (embedding-assist only inside the offline build, never on the hot path) — ENT-01.
  2. Cross-graph entity links are queryable by AQL and appear in the retrieval path, so the bridge is visible (e.g., "joined Salesforce/Account/365 ↔ KG/Entities/acme_corp via `same_as`") — ENT-02.
  3. No entity resolves to two different canonical IDs, and every entity appearing in both graphs has exactly one resolution edge (validated as part of the data-integrity checks).

**Plans**: 4 plans (2 original + 2 gap-closure)

**Wave 1** *(no dependencies)*

- [x] 04-01-PLAN.md — Wave 1: build_entity_bridge.py — alias-dict + embedding-residual + DDL + hub/edge UPSERT + entity_id stamp (ENT-01, per D-01/D-02/D-03/D-04/D-06)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Wave 2: verify_entity_bridge.py (D-04 integrity gate + ENT-02 trace probe) + extend verify_coref_eval.py (D-05 100% demo-critical gate) (ENT-01, ENT-02, per D-04/D-05)

**Gap closure** *(after re-verification)*

- [x] 04-03-PLAN.md — Gap closure: builder-side conflict detection (ValueError before DB write) + verify_coref_eval exit-code/label consistency (D-04/D-05)
- [x] 04-04-PLAN.md — Gap closure: fix the false-guarantee demo-critical gate — denominator=9 in both gates (CR-01), resolution-path join key (CR-02), hard-fail on uncovered ids, shared DEMO_CRITICAL_IDS source (IN-03) + negative test (ENT-01, ENT-02, per D-05)

**Risk**: MEDIUM. The keystone dependency for nearly every dual-graph answer, but de-risked by baking shared IDs into the generator (Phase 2) — this converts hard real-world ER into deterministic linkage. The gate is timing: it cannot start until both graphs have IDs.

### Phase 5: Custom Reasoning Agent

**Goal**: Build the custom planner + specialists agent that decomposes a question, dispatches structured- and unstructured-graph retrieval across the entity bridge, synthesizes a combined claim-level-sourced answer, and refuses gracefully when out of scope.
**Depends on**: Phase 4 (both graphs + the cross-graph bridge)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-05, AGENT-07 (AGENT-04 generated-AQL fallback and AGENT-06 Q11 timeline are deferred to v2 — see note below)
**Success Criteria** (what must be TRUE):

  1. The planner decomposes a question, routes sub-tasks to structured/unstructured/resolver specialist tools, and synthesizes a combined answer that visibly draws on both graphs — AGENT-01, AGENT-02.
  2. ~6 curated, parameterized AQL tools deterministically cover the 6 locked question patterns (the demo backbone) — AGENT-03. *(Lean scope: the validated generated-AQL fallback, AGENT-04, is deferred to v2.)*
  3. The agent performs the Q12 cross-graph reconciliation ("usage green but sentiment red") — the signature moment — AGENT-05.
  4. The agent gracefully refuses or signals uncertainty for out-of-scope/unanswerable questions instead of guessing, with claim-level grounding driving the decision — AGENT-07.
  *(AGENT-06 — the Q11 ordered timeline — is out of the lean 6-question arc and deferred to v2.)*

**Plans**: TBD
**Risk**: HIGH UNKNOWN. First-time custom-agent build (PROJECT.md). The curated-vs-generated split, the claim-level grounding check, AQL-safety gate, and planner trace assembly all warrant pattern research during planning. This is the headline-differentiator phase and a likely long pole.

### Phase 6: Next.js/Vercel UI + Sourcing Display

**Goal**: Deliver the free-form question box on a Next.js/Vercel dashboard that renders streamed reasoning and a claim-level, click-to-source retrieval-path view (citation cards) with no dead air at live-demo latency. *(Lean scope: the React Flow cross-graph traversal visualization is deferred to v2; citation cards carry the sourcing in v1.)*
**Depends on**: Phase 5 (the `/api/ask` → `{answer, trace}` contract; the UI shell can start earlier against a mocked endpoint)
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):

  1. A Next.js/Vercel dashboard presents a free-form natural-language question box (with guided example questions) — UI-01.
  2. Every fact in an answer carries source attribution (graph, collection, record id), and the answer exposes the full retrieval path (graph → records → traversal → AQL) — SRC-01, SRC-02, UI-02.
  3. A user can click a claim to view the underlying source record/thread inline, and the planner's reasoning steps are visible — SRC-03, SRC-04.
  4. Responses stream with no dead air and acceptable live-demo latency, with graceful error/timeout handling and a global-scope keep-alive ArangoDB client on the serverless path — UI-03.

**Plans**: TBD
**UI hint**: yes
**Risk**: LOWER. Established patterns (Next.js 15 + AI SDK UI streaming + shadcn citation cards; React Flow deferred to v2). Main carry-over risks are serverless↔ArangoDB connection handling (validate on a real Vercel deploy) and mapping claim-level citations cleanly into the UI.

### Phase 7: Grounding/Eval + Demo Hardening

**Goal**: Make the live demo trustworthy and unbreakable — prove every answer is grounded against the locked question set, then harden the live path so it survives the room.
**Depends on**: Phase 6 (full end-to-end answer + UI to evaluate and rehearse)
**Requirements**: EVAL-01, EVAL-02
**Success Criteria** (what must be TRUE):

  1. An output-validation gate decomposes each answer into atomic claims and verifies each is entailed by the retrieved records, run as a light regression set over the 6 locked questions (+ adversarial/refusal variants) and passing before the demo — EVAL-01.
  2. Demo hardening is complete: serverless/DB pre-warm routine, a recorded/scripted backup path, and adversarial + concurrent rehearsal on the real Vercel deploy — EVAL-02.
  3. The Q12 reconciliation moment and at least one graceful-refusal moment are rehearsed and reliable.

**Plans**: TBD
**Risk**: MEDIUM. Last line of defense against the defined failure mode (a confident wrong answer in front of the audience). PROJECT.md makes eval-before-demo a hard constraint — treated as a gated phase, not a checkbox. Lower technical unknown than Phases 1/2/5 but high consequence.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture Research + Question/Data Lock | 5/5 | Complete    | 2026-06-16 |
| 2. Synthetic Data + Integrity Linter | 5/5 | Complete    | 2026-06-17 |
| 3. Build Both Graphs (parallel) | 5/5 | Complete    | 2026-06-17 |
| 4. Canonical Entity Layer | 4/4 | Complete   | 2026-06-18 |
| 5. Custom Reasoning Agent | 0/TBD | Not started | - |
| 6. Next.js/Vercel UI + Sourcing Display | 0/TBD | Not started | - |
| 7. Grounding/Eval + Demo Hardening | 0/TBD | Not started | - |

## Time Estimates (research-grounded REVISED — lean demo)

Single builder + AI assistance, working primarily **sequentially** (Phase 6 UI can overlap Phase 5 against a mock endpoint). This is the research-grounded **REVISED** estimate produced as a Phase 1 deliverable (`revised-estimate.md`, authoritative); it **supersedes** the prior PRELIMINARY 10–15 wk and the 2026-06-15 13–20 wk fully-custom numbers. The reduction to **~5–6 weeks** is structural — lean scope (6 questions, 2 accounts, curated-AQL only, citation cards) plus AutoGraph-hybrid via the deployed platform (which removes the custom-pipeline build) — not optimism.

| Phase | Estimate | Status | Confidence | Notes |
|-------|----------|--------|------------|-------|
| 1. Architecture Research + Question/Data Lock | ~1–2 weeks | Complete | Medium | Research-only, no code. Resolved the architecture call (AutoGraph-hybrid via platform) and produced this revised estimate. |
| 2. Synthetic Data + Integrity Linter | ~1–1.5 weeks | REVISED | Medium | 2 accounts, 6 questions, ArangoDB-product domain, shallower multi-year stories; disciplined LLM-for-prose / code-for-facts split. |
| 3. Build Both Graphs (parallel) | ~1.5–2.5 weeks | REVISED | Medium | Deployed AutoGraph platform handles chunking/embedding/extraction/Leiden/loading; custom work = run the import→build→orchestrate flow + hand-model the structured graph + post-build `account_id` UPSERT. |
| 4. Canonical Entity Layer | ~0.5 weeks | REVISED | Medium–High | Document-level deterministic join (`account_id`) + shared `entity_id`; no fuzzy ER. Keystone dependency gate. |
| 5. Custom Reasoning Agent | ~1.5–2.5 weeks | REVISED | Medium — residual risk: first custom-agent build | ~6 curated AQL tools (NO generated-AQL fallback), planner + specialists, Q12 reconciliation, graceful refusal. The residual long pole. |
| 6. Next.js/Vercel UI + Sourcing Display | ~1 week | REVISED | Medium–High | AI SDK UI streaming + shadcn citation cards (React Flow deferred). Can scaffold against a mock during Phase 5. |
| 7. Grounding/Eval + Demo Hardening | ~0.5–1 week | REVISED | Medium | Light eval over the 6 locked questions + adversarial/refusal rehearsal. Gated, non-negotiable. |
| **Total to demo-ready** | **~5–6 weeks** (~4–5 if Phase 5 goes clean) | **REVISED** | — | Supersedes the 13–20-week fully-custom estimate. Reduction is structural (scope + architecture). |

**Riskiest / most-unknown phase:** Phase 5 (first-of-kind custom-agent build) — the planner orchestration, Q12 cross-graph reconciliation, and claim-level sourcing are the residual variance; the ~6 curated AQL tools are a firm work item. ~4 weeks is a stretch, not the expectation; iteration on the Q12 reconciliation likely lands the task nearer 5–6.
