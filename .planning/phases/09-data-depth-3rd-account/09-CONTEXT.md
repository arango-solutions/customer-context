# Phase 9: Data Depth & 3rd Account - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a **3rd synthetic account (Account C)** with a *distinct* **churn / at-risk contraction** arc, generated via a new `data_gen/spine/spine_<key>.py` off the shared `event_spine` + `entity_registry` (deterministic keys, its own `entity_id` namespace), appended to `_SPINES` in `data_gen/generate.py`. Define **2–3 new question arcs for Account C** (≥1 dual-graph) and add them to the **locked eval gate**. Separately, **broadly deepen** the prose and records of the **two existing accounts** (Northwind, Meridian) across **all 8 account×source modules** (DATA-05).

Everything is gated by the existing **6-test linter** (referential integrity, chronology, cross-source agreement, field stamps, answerability, empirical near-miss guard) before ingest, and the **Phase 8 eval gate (`npx tsx scripts/eval-gate.ts`) must stay GREEN** afterward — existing answers must not be corrupted (SC-5).

**In scope:** Account C spine + generated structured/unstructured data; 2–3 new C questions added to the locked gate; broad deepening of Northwind + Meridian docs/records; full regen + full linter sweep + eval-gate re-verify.
**Out of scope (own phases):** edge-enrichment of retrievalPath (Phase 10), graph viz / UI (Phase 11), any new agent/tool behavior.
</domain>

<decisions>
## Implementation Decisions

### Account C — Arc & Identity
- **D-01 (arc):** Account C is a **churn / at-risk contraction** story — a *descending* engagement curve: peak adoption (Enterprise + ArangoGraph) → **declining usage** → **downgrade** → **renewal-at-risk / contraction**. This completes the portfolio triad: **A grows (Northwind), B holds-but-grumbles (Meridian), C is slipping (Account C)** — the "expand / hold / save" demo narrative. (ROADMAP SC-1 explicitly permits a churn arc.)
- **D-02 (distinct vertical):** Account C is a **new vertical**, clearly distinct from Analytics (Northwind) and Logistics (Meridian) — e.g. **e-commerce / retail with a recommendation-or-personalization graph use case**. The exact name + vertical is **Claude's discretion** (see below), constrained to be unmistakably non-confusable with A/B so the empirical near-miss guard stays green.
- **D-03 (distinct from Meridian specifically — load-bearing):** Account C's risk signature is **usage-and-revenue CONTRACTION** (declining usage metrics + a downgrade contract event + lost/slipped opportunities), which is **different from Meridian's existing risk framing** of *sentiment-red-on-green-usage* (Q2 "renewal risk + WHY", Q12 "usage green / sentiment red"). Keep C's data and questions from colliding with Q2/Q12 — C's churn is driven by *actual decline*, not unhappy-but-healthy usage.

### New Question Arc (scaled up — user wants the ambitious scope)
- **D-04:** Add **2–3 new questions for Account C to the LOCKED eval set** (`agent/test/questions.eval.test.ts`), growing the gate from 6 → ~8–9 locked questions:
  1. **Flagship dual-graph:** *"Is Account C at risk of churning, and why?"* — joins **structured** (declining usage + downgrade event + slipped opps) with **unstructured** (support escalations, negative sentiment, migration-away / deprioritization discussion in Slack/email/docs).
  2. **Follow-up** (e.g. remediation history / what would save the account, or the timeline of the decline).
  3. **Structured-only anchor for C** (mirrors Q7's role for Northwind — a non-refusal, all-citations-structured anchor).
- New **dual-graph** questions must also pass the **empirical near-miss guard** (their C signal docs must out-rank distractors under RRF), and all must hold `FAITHFULNESS_FLOOR = 0.6`.

### Doc/Record Deepening — DATA-05 (scaled up)
- **D-05:** **Broadly deepen** prose realism + record richness across **all 8 account×source modules for BOTH existing accounts** (Northwind + Meridian): `crm`, `contract`, `usage`, `nps` (structured) + `slack`, `docs`, `email`, `pdf` (unstructured). Implies a **full regen + full linter sweep + eval-gate re-verify**. The depth ceiling per module is Claude's discretion *so long as the linter stays green and no new ungrounded/hallucination surface is introduced*.

### Hard Gates (locked, carried forward)
- **D-06:** The **6-test linter** is the pre-ingest hard gate; the **Phase 8 eval gate must stay GREEN** post-change (SC-5). Deterministic keys (`canonical_uuid` / `make_file_name` / `make_citable_url`, `GLOBAL_SEED = 42`), per-account `entity_id` namespace, and the 8-module account×source grain are **locked** and reused as-is.

### Unstructured Ingest / Updatability (AutoGraph KG) — research item
- **D-07:** The **unstructured side** (AutoGraph `{proj}_kg`) is the only non-trivial ingest path; the structured graph is hand-modeled and updated with idempotent AQL UPSERT (trivial). The design of record is `.planning/spikes/001-autograph-kg-claim-sourcing/UPDATE-PIPELINE.md`. Two implications the **researcher/planner must confirm**:
  1. **Adding Account C = 4 NEW unstructured modules** (`c_slack`, `c_docs`, `c_email`, `c_pdf` — account×source grain). Because similarity + **Leiden run per-module**, building C's new modules via the **ADD lane** (`import-multiple` → `corpus/builds incremental:true modules:[…] cluster_threshold:1` → `rag-strategizer`) should **NOT re-cluster Northwind/Meridian modules**. This largely *mitigates* the prior STATE blocker about Leiden re-clustering scope — but **verify empirically** that existing partitions/answers are untouched after C's modules build.
  2. **DATA-05 deepening of EXISTING docs** splits across lanes: pure **content edits** (membership stable) take the partition-scoped **EDIT lane** (delete-partition + re-orchestrate, no module re-cluster); **adding new docs** to an existing module takes the **ADD lane** and **re-clusters that whole module**. The planner must decide deepening style per module accordingly, and budget the re-ingest + re-strategize cost.
  - **Concurrency constraint:** only one corpus build and one orchestration at a time (409 on collision) → ingest steps must **serialize**.
  - See memory: AutoGraph updatability = module-scoped rebuild, per-module Leiden, deterministic Layer-2 keys.

### Claude's Discretion
- Exact **Account C name + specific vertical** (must be distinct from Analytics/Logistics and clear the near-miss guard).
- Exact **wording of the 2–3 new questions** (Q13–15 or equivalent), within the framings in D-04.
- **Per-module depth ceiling** for D-05 deepening, bounded by linter-green + no new hallucination surface.
- **Plan decomposition** — this is a large phase; likely 3 plans (build C spine+data & wire C questions+near-miss; broad deepening + full regen; final linter + eval-gate re-verify). Planner decides waves.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 9: Data Depth & 3rd Account" — goal, SC-1…SC-5, risk note.
- `.planning/REQUIREMENTS.md` — **DATA-04** (3rd account + new question arcs, linter-gated) and **DATA-05** (deepen existing docs, linter-gated, no regressions).

### Data-generation spine (the reusable templates for Account C)
- `data_gen/spine/event_spine.py` — the event model: `AccountSpine`, `ArangoEdition`, `ContractEvent`, `ContactEvent`, `OpportunityEvent`, `UsageEvent`, `NpsEvent`, `DocEvent`.
- `data_gen/spine/entity_registry.py` — `GLOBAL_SEED=42`, `canonical_uuid`, `make_file_name`, `make_citable_url`, and the account-ID declarations (`NORTHWIND_ACCOUNT_ID`, `MERIDIAN_ACCOUNT_ID`) — **add `<KEY>_ACCOUNT_ID` here for C**.
- `data_gen/spine/spine_northwind.py` — Account A template (healthy expansion ladder; serves Q7, Q5).
- `data_gen/spine/spine_meridian.py` — Account B template (usage-green/sentiment-red, stable Enterprise; serves Q12, Q2, Q9, Q8). **Study to keep C distinct from B's risk framing (D-03).**

### Generation orchestration & generators
- `data_gen/generate.py` — `_SPINES = [NORTHWIND_SPINE, MERIDIAN_SPINE]` (**append C's spine**), per-account×source output dirs, `account_key = spine.account_name.lower().split()[0]`, generator iteration.
- `data_gen/generators/{crm,contract,usage,email,slack,docs,pdf}_generator.py` — the 8-module generators (per-source); deepening (D-05) edits the prose/record richness here.
- `scripts/stamp_account_id.py` — account-id stamping utility.

### Linter (the hard pre-ingest gate)
- `data_gen/linter/test_referential_integrity.py` — no orphaned FKs.
- `data_gen/linter/test_chronology.py` — timeline coherence.
- `data_gen/linter/test_cross_source_agreement.py` — structured/unstructured agreement.
- `data_gen/linter/test_field_stamps.py` — deterministic field stamps.
- `data_gen/linter/test_answerability.py` — questions answerable from data.
- `data_gen/linter/test_near_miss_guard.py` — **empirical** RRF retrieval guard (embeds all unstructured docs, asserts signal doc out-ranks distractors for each dual-graph Q). Requires `OPENAI_API_KEY` + AutoGraph at `AUTOGRAPH_PATH`; skips gracefully when absent. **New C dual-graph questions must be added to this guard's coverage.**

### Eval gate (SC-5 — must stay green after data change)
- `agent/test/questions.eval.test.ts` — the 6 locked questions (Q7 anchor; Q2/Q5/Q8/Q9 dual; Q12 centerpiece) and `FAITHFULNESS_FLOOR = 0.6`; **add C's 2–3 questions here**. `Q7_ANCHOR_PROMPT` is imported from `agent/src/index.ts` (single source of truth).
- `scripts/eval-gate.ts` — the Phase 8 green/red pre-demo command; re-run after data changes (SC-5).

### Unstructured ingest / updatability (AutoGraph KG)
- `.planning/spikes/001-autograph-kg-claim-sourcing/UPDATE-PIPELINE.md` — **the ingest design of record**: EDIT/ADD/DELETE lanes, module=account×source grain, per-module Leiden, `partition_id` scheme, concurrency (one build/orchestrate at a time). **MUST read before planning the C ingest + DATA-05 re-ingest.**
- `.planning/spikes/001-autograph-kg-claim-sourcing/README.md` — spike 001 context (claim-level sourcing validation).
- `lib/autograph_client.py` — the ingest HTTP client: `import_multiple(module=…)`, `create_corpus_build(modules, incremental, cluster_threshold)`, `orchestrate`. The mechanism for building C's 4 new modules + re-ingesting deepened docs.
- `scripts/setup_autograph.py` — AutoGraph service provisioning/discovery (URL probe, discovery file).

### Output shape (reference)
- `data_gen/output/structured/{northwind,meridian}/...` and `data_gen/output/unstructured/...` — existing per-account output layout C must mirror.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Per-account spine pattern** (`spine_northwind.py` / `spine_meridian.py`): a module that builds an `AccountSpine` from literal `*Event` lists with deterministic `canonical_uuid` / `make_file_name` / `make_citable_url`. Account C = a new `spine_<key>.py` following this exact shape.
- **Deterministic key helpers** (`entity_registry.py`): `canonical_uuid(scope, name)` namespaces every entity per account; `GLOBAL_SEED=42` reused. Account-ID constants declared here.
- **7 source generators** iterate `_SPINES`, so adding C's spine to the list auto-generates all 8 modules for C with no generator changes (structured generators take a single spine; slack/email/docs/pdf take the full `_SPINES` list).

### Established Patterns
- **`_SPINES` list + `account_key` derivation** in `generate.py`: `account_key = spine.account_name.lower().split()[0]` becomes the output dir + citable-url key. Account C's `account_name`'s first word must be a clean, unique key.
- **Linter-as-gate**: all data must pass `data_gen/linter/*` before ingest. The near-miss guard is **empirical** (real embeddings + RRF) — C's new signal docs must genuinely out-rank distractors, not just exist.
- **Single-source-of-truth question constants**: `Q7_ANCHOR_PROMPT` lives in `agent/src/index.ts`; the eval test and web canary both import it. C's structured-only anchor should follow the same constant pattern if it needs cross-file reuse.

### Integration Points
- `entity_registry.py` (new account ID) → `spine_<key>.py` (new spine) → `generate.py` `_SPINES` (append) → generators (auto) → `data_gen/output/...` → linter → ingest → `questions.eval.test.ts` (new Qs) → `eval-gate.ts` (SC-5 re-verify).
- Near-miss guard + eval gate both require `OPENAI_API_KEY` + `ARANGO_*` (repo-root `.env`); near-miss guard also needs `AUTOGRAPH_PATH`.
</code_context>

<specifics>
## Specific Ideas

- User explicitly wants to **scale up** — keep the ambitious scope (2–3 gated questions + broad all-8-module deepening), not a trimmed version.
- Portfolio narrative the demo should tell: **expand (A) / hold (B) / save (C)**.
- Account C churn is **contraction-driven** (declining usage + downgrade), deliberately *not* a re-run of Meridian's sentiment-driven risk.
</specifics>

<deferred>
## Deferred Ideas

- **"Fast new-logo expansion" arc for Account C** — considered and set aside: too thematically close to Northwind's expansion story; risked tripping the near-miss guard / conflating A and C.
- **"Stalled POC / never-converted" arc** — considered; thinner structured data (no contract ladder). Available as a future 4th-account option if ever needed.
- **Cross-account comparison flagship question** ("compare all 3 trajectories") — high wow but harder to keep deterministic/grounded across 3 accounts; revisit once C is stable. Not in this phase's locked set unless it falls out cleanly.
</deferred>

---

*Phase: 9-Data Depth & 3rd Account*
*Context gathered: 2026-06-22*
