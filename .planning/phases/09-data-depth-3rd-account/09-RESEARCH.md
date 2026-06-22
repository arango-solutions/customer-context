# Phase 9: Data Depth & 3rd Account - Research

**Researched:** 2026-06-22
**Domain:** Synthetic data generation (deterministic event-spine), AutoGraph KG incremental ingest, linter/eval gating
**Confidence:** HIGH (all load-bearing claims verified by reading repo source)

## Summary

This is a **pure data-generation phase**. No agent/tool/UI code changes. The deliverables are: (a) a 3rd account "Account C" with a churn/contraction arc built from a new `spine_<key>.py`, (b) 2–3 new C questions added to the locked eval gate + near-miss guard, and (c) broad deepening of Northwind + Meridian prose/records across all 8 existing modules. Everything is gated by the 6-test linter (pre-ingest) and the Phase 8 eval gate (`scripts/eval-gate.ts`) staying GREEN.

The repo's spine pattern is exceptionally clean and the additive change-list for Account C is **mechanical and low-risk**: declare `<KEY>_ACCOUNT_ID` in `entity_registry.py`, write `spine_<key>.py` mirroring `spine_meridian.py`, append to `_SPINES` in `generate.py`. All 7 generators then auto-produce C's 8 modules with **zero generator edits** (verified: structured generators take a single `spine`; slack/email/docs/pdf take the full `_SPINES` list and filter by module suffix). The non-mechanical parts are three coupling constants that must be widened (`MODULE_NAMES` in two files, `QUESTION_IDS`, `LOCKED_QUESTION_LABELS`) and the empirical near-miss guard, which requires C's signal docs to genuinely out-rank distractors under RRF.

**On D-07 (the load-bearing ingest question): the lane-isolation concern from STATE.md is *partially* mitigated but the *current* `build_unstructured.py` does NOT use the module-scoped ADD lane** — it does a full `file_ids` corpus build with `incremental=False` over the entire manifest, then orchestrates *all* partitions. So as-shipped, adding C = a **full rebuild of the whole KG** (all 12 modules), not an isolated 4-module add. The UPDATE-PIPELINE.md ADD-lane design (per-module `incremental:true`) is **designed but not yet built into the script**. The planner has two viable paths (see Architecture Patterns); the lowest-risk one for this phase is a single full rebuild of all 12 modules after regenerating all data, which sidesteps lane-isolation verification entirely.

**Primary recommendation:** Add Account C as a new `spine_<key>.py` (recommend vertical: **"Helio Retail" — e-commerce personalization/recommendation**, churn arc), widen the four coupling constants, deepen existing prose in-place (EDIT-style content only, no new DocEvents to existing modules where avoidable), then run ONE full `--clean` regen → full linter sweep → ONE full `build_unstructured.py` rebuild → eval-gate. Decompose into 3 plans as CONTEXT D-04 suggests.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (arc):** Account C is a **churn / at-risk contraction** story — descending engagement curve: peak adoption (Enterprise + ArangoGraph) → declining usage → downgrade → renewal-at-risk/contraction. Portfolio triad: A grows (Northwind), B holds-but-grumbles (Meridian), C is slipping. Demo narrative: **expand / hold / save**.
- **D-02 (distinct vertical):** Account C is a **new vertical**, clearly distinct from Analytics (Northwind) and Logistics (Meridian) — e.g. e-commerce/retail with a recommendation-or-personalization graph use case. Exact name + vertical is Claude's discretion, constrained to be non-confusable with A/B so the near-miss guard stays green.
- **D-03 (distinct from Meridian — load-bearing):** C's risk signature is **usage-and-revenue CONTRACTION** (declining usage metrics + a downgrade contract event + lost/slipped opportunities), *different* from Meridian's *sentiment-red-on-green-usage* framing (Q2/Q12). C's churn is driven by *actual decline*, not unhappy-but-healthy usage. Keep C's data and questions from colliding with Q2/Q12.
- **D-04:** Add **2–3 new C questions to the LOCKED eval set** (`agent/test/questions.eval.test.ts`), growing 6 → ~8–9 locked questions: (1) flagship dual-graph *"Is Account C at risk of churning, and why?"*; (2) follow-up (remediation/timeline); (3) structured-only anchor for C (mirrors Q7). Dual-graph questions must pass the empirical near-miss guard and hold `FAITHFULNESS_FLOOR = 0.6`.
- **D-05:** **Broadly deepen** prose realism + record richness across **all 8 account×source modules for BOTH existing accounts**. Implies a full regen + full linter sweep + eval-gate re-verify. Depth ceiling per module is Claude's discretion so long as the linter stays green and no new ungrounded/hallucination surface is introduced.
- **D-06:** The 6-test linter is the pre-ingest hard gate; the Phase 8 eval gate must stay GREEN post-change (SC-5). Deterministic keys (`canonical_uuid`/`make_file_name`/`make_citable_url`, `GLOBAL_SEED=42`), per-account `entity_id` namespace, and the 8-module account×source grain are LOCKED and reused as-is.
- **D-07:** Unstructured side (AutoGraph `{proj}_kg`) is the only non-trivial ingest path; structured graph is hand-modeled idempotent AQL UPSERT (trivial). Design of record: `.planning/spikes/001-autograph-kg-claim-sourcing/UPDATE-PIPELINE.md`. Adding C = 4 NEW unstructured modules; per-module Leiden *should* isolate from N/M — verify empirically. DATA-05 deepening splits across EDIT (content-only) and ADD (new docs, re-clusters module) lanes. Concurrency: one build + one orchestration at a time (409 on collision) → serialize. *(Researcher finding: the as-shipped script does not yet implement these lanes — see Architecture Patterns and Open Questions.)*

### Claude's Discretion
- Exact Account C name + specific vertical (distinct from Analytics/Logistics; clear the near-miss guard).
- Exact wording of the 2–3 new questions (Q13–15 or equivalent), within the D-04 framings.
- Per-module depth ceiling for D-05, bounded by linter-green + no new hallucination surface.
- Plan decomposition — likely 3 plans; planner decides waves.

### Deferred Ideas (OUT OF SCOPE)
- "Fast new-logo expansion" arc for Account C (too close to Northwind).
- "Stalled POC / never-converted" arc (thinner structured data; future 4th-account option).
- Cross-account comparison flagship question ("compare all 3 trajectories") — revisit once C is stable; not in this phase's locked set unless it falls out cleanly.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-04 | 3rd synthetic account (distinct product-ladder story) + new question arcs, from canonical event-spine + entity registry sharing `entity_id` namespace, passing the integrity/timeline linter before ingest. | Mechanical change-list (Architecture Patterns §"Account C end-to-end"); near-miss distinctness recommendation; linter coupling constants enumerated. |
| DATA-05 | Existing accounts' documents deepened/enriched (more realistic prose + records), linter-gated, no coherence regressions. | Per-module EDIT-vs-ADD lane decision; deepening style recommendation (favor EDIT/in-place content edits); generator file map. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Account C spine (structured events) | Data-gen (Python spine) | — | Mirrors `spine_meridian.py`; pure literal `*Event` lists with deterministic keys. |
| Account C structured records (CRM/usage/contract) | Data-gen generators | — | `generate_crm/usage/contracts(spine, …)` auto-iterate `_SPINES`; no edits. |
| Account C unstructured docs (slack/email/docs/pdf) | Data-gen generators (LLM prose) | LLM cache | `generate_slack/emails/docs/pdfs(_SPINES, …)` filter by module suffix; no edits. |
| Unstructured ingest into KG | AutoGraph service (`build_unstructured.py`) | ArangoDB Layer-3 | File Manager upload → corpus build → strategize → orchestrate; concurrency-serialized. |
| Structured ingest into KG | `scripts/load_structured.py` (AQL UPSERT) | ArangoDB | Idempotent; trivial; account-agnostic. |
| Pre-ingest validation | Linter (`data_gen/linter/*`) | OpenAI (near-miss guard) | Hard gate before any ingest. |
| Post-change correctness | Eval gate (`scripts/eval-gate.ts`) | OpenAI + live ArangoDB | SC-5: existing answers not corrupted. |
| New C questions | `agent/test/questions.eval.test.ts` + near-miss guard | — | Question CONTRACT lives in TS; near-miss is empirical Python. |

## Standard Stack

This phase adds **no new packages**. It reuses the existing, verified stack.

### Core (already installed — reused as-is)
| Library | Version (pinned in repo) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib (`uuid`, `hashlib`, `dataclasses`, `datetime`) | — | Deterministic keys + event dataclasses | `entity_registry.py` / `event_spine.py` are stdlib-only by design (no Faker dep in spines). |
| `faker` | (repo-pinned) | Deterministic names/emails in generators (`Faker.seed(42)`) | Already used; seeded for D-06 determinism. |
| `openai` | 2.x (repo) | `text-embedding-3-small` @ 512-dim (near-miss guard); LLM prose | `[CITED: data_gen/linter/test_near_miss_guard.py:48-49]` EMBED_MODEL="text-embedding-3-small", EMBED_DIM=512. |
| `corpus_graph` (AutoGraph) | v0.0.8 local checkout via `AUTOGRAPH_PATH` | `ReciprocalRankFusion` for the empirical near-miss guard | `[CITED: test_near_miss_guard.py:184]` `from corpus_graph.rrf import ReciprocalRankFusion`. |
| `python-arango` | 8.x | Structured load + KG stamping AQL | Used by `build_unstructured.py`, `load_structured.py`. |
| `pdfplumber` | 0.10.x | PDF text extraction in near-miss guard + generators | `[CITED: test_near_miss_guard.py:164]`. |
| `requests` + `tenacity` | (repo) | `lib/autograph_client.py` HTTP + retry | Verified in client source. |
| Vitest | (repo, agent/) | Eval gate runner | `scripts/eval-gate.ts` runs `vitest … questions.eval`. |

**Installation:** None required. Confirm env (`OPENAI_API_KEY`, `ARANGO_*` in repo-root `.env`) and **export `AUTOGRAPH_PATH`** in the shell (it is NOT in `.env` — only `AUTOGRAPH_URL` is; verified by reading `.env` keys). The near-miss guard reads `AUTOGRAPH_PATH` from the shell environment and skips gracefully if unset.

## Package Legitimacy Audit

No external packages are installed in this phase (data-generation + test reuse only). Audit N/A. All libraries above are already present and pinned in the existing repo.

## Architecture Patterns

### System data flow (Phase 9)

```
spine_<key>.py (NEW) ─┐
spine_northwind.py    ├─► _SPINES (generate.py) ──► structured generators (per-spine)  ──► output/structured/<key>/{crm,snowflake,docusign}/*.json
spine_meridian.py ────┘                          └─► unstructured generators (_SPINES) ──► output/unstructured/<module>/*.{txt,md,pdf}
                                                                                          + output/manifest.json (keyed by file_name)
                                                          │
                                                          ▼
                              LINTER (6 tests, pre-ingest HARD GATE) ── near-miss guard needs OPENAI_API_KEY + AUTOGRAPH_PATH
                                                          │ (green)
                                                          ▼
            scripts/load_structured.py (AQL UPSERT)      scripts/build_unstructured.py (AutoGraph: FM upload → corpus build → strategize → orchestrate → repair_kg_attribution)
                                                          │ (serialize: one build + one orchestrate at a time)
                                                          ▼
                              agent/test/questions.eval.test.ts  ──► scripts/eval-gate.ts (SC-5 GREEN/RED, live OpenAI + ArangoDB)
```

### Pattern 1: Account C end-to-end — the exact mechanical change-list

This is the prescriptive checklist for DATA-04. File:line references are to current repo state.

1. **`data_gen/spine/entity_registry.py`**
   - Add after line 54: `HELIO_ACCOUNT_ID: str = canonical_uuid("helio", "helio_retail")` (or chosen key).
   - Extend `MODULE_NAMES` (lines 60-69) to 12: append `"helio_slack", "helio_email", "helio_docs", "helio_pdf"`. **This is the locked "one-way door" constant — `test_field_stamps.py::test_module_names_valid` enforces every manifest module ∈ MODULE_NAMES.** `[VERIFIED: data_gen/linter/test_field_stamps.py:51-64]`

2. **`data_gen/spine/spine_helio.py` (NEW)** — mirror `spine_meridian.py` structure exactly:
   - Import the same helpers + `HELIO_ACCOUNT_ID`.
   - Build `_contracts`, `_usage_records`, `_contacts`, `_opportunities`, `_nps_records` as literal lists (the *contraction* arc — see Pattern 4).
   - Build `_signal_docs` (for C's new questions), `_near_miss_docs`, `_noise_docs`.
   - Assemble `HELIO_SPINE = AccountSpine(account_id=HELIO_ACCOUNT_ID, account_name="Helio Retail", …)`.
   - **`account_key` is derived as `account_name.lower().split()[0]`** → must be a clean single first word ("Helio" → `helio`). `[VERIFIED: generate.py:74, 111]` Avoid two-word first tokens or punctuation.
   - All `entity_id` via `canonical_uuid("helio", …)`; all `file_name` via `make_file_name`; all `citable_url` via `make_citable_url("helio", source, event_id)`. The per-account scope prevents cross-account `entity_id` collision. `[VERIFIED: entity_registry.py:34-46]`

3. **`data_gen/generate.py`**
   - Add import (after line 43): `from data_gen.spine.spine_helio import HELIO_SPINE`.
   - Extend `_SPINES` (line 62): `_SPINES = [NORTHWIND_SPINE, MERIDIAN_SPINE, HELIO_SPINE]`.
   - **No other edits.** `_create_output_dirs`, the structured loop, and the four unstructured generator calls all iterate `_SPINES` and `MODULE_NAMES` generically. `[VERIFIED: generate.py:62, 73-80, 110-133]`

4. **Generators — NO edits required.** Verified signatures:
   - Single-spine (auto via `_SPINES` loop in generate.py): `generate_crm(spine, output_dir)` `[crm_generator.py:32]`, `generate_usage(spine, output_dir)` `[usage_generator.py:21]`, `generate_contracts(spine, output_dir)` `[contract_generator.py:18]`.
   - Full-list (filter by module suffix): `generate_slack(spines, output_dir, cache_dir)` `[slack_generator.py:177]` — iterates `for spine in spines: for doc in spine.docs: if not doc.module.endswith("_slack"): continue`. Same shape for `generate_emails` `[email_generator.py:197]`, `generate_docs` `[docs_generator.py:253]`, `generate_pdfs` `[pdf_generator.py:263]`.
   - **Confirms CONTEXT D-07.1 / code_context claim:** appending C's spine auto-generates all 8 of C's modules (4 structured sources written per `account_key` dir; 4 unstructured modules filtered by suffix) with no generator changes.

5. **Linter coupling — `data_gen/linter/conftest.py`**
   - `MODULE_NAMES` (lines 16-25) is **DUPLICATED** here (not imported from `entity_registry`). Must add the 4 `helio_*` modules so `test_field_stamps` and module fixtures cover C. `[VERIFIED: conftest.py:16-25]`
   - `QUESTION_IDS` (line 27) lists the 6 locked Qs. Add C's new question IDs (e.g. `Q13, Q14, Q15`). `[VERIFIED: conftest.py:27]`

6. **Linter answerability — `data_gen/linter/test_answerability.py`**
   - Per-question tests are **hand-written one function per question** (Q7/Q2/Q12/Q9/Q5/Q8). Add 2–3 new test functions for C's questions (signal-doc-present for dual; structured-records-present for the C anchor). Helpers `_signal_docs_for`, `_has_records` are reusable. `[VERIFIED: test_answerability.py:25-80]`

7. **Near-miss guard — `data_gen/linter/test_near_miss_guard.py`**
   - Add C's dual-graph question(s) to `QUESTION_TEXTS` (lines 55-80) using vocabulary present in C's signal docs.
   - Add a `test_near_miss_guard_q13(...)` scoped to `helio_*` modules (mirror `test_near_miss_guard_q12`, lines 221-234, swapping the module list). C's signal docs must rank top-1 over C's near-miss distractors under RRF. `[VERIFIED: test_near_miss_guard.py:221-302]`

8. **Eval gate — `agent/test/questions.eval.test.ts`**
   - Add 2–3 `it(...)` blocks for C's questions following the existing dual-graph pattern (assert `!refused`, `assertReconciliation(env)` for dual / `every citation.graph==='structured'` for the C anchor, `groundingScore===1.0`, `faithfulness >= FAITHFULNESS_FLOOR`). `[VERIFIED: questions.eval.test.ts:99-257]`
   - The C structured-only anchor should follow the `Q7_ANCHOR_PROMPT` single-source-of-truth pattern: if reused cross-file (web canary), define a `QC_ANCHOR_PROMPT` constant in `agent/src/index.ts` and import it. `[VERIFIED: questions.eval.test.ts:66, 104]`

9. **Eval gate classifier — `scripts/eval-gate.ts`**
   - `LOCKED_QUESTION_LABELS = ['Q7','Q2','Q12','Q9','Q5','Q8']` (line 157) classifies test output into locked/refusal/adversarial buckets. Add C's labels so the new tests are classified as `locked` (otherwise they fall into `other` and may not gate). `[VERIFIED: scripts/eval-gate.ts:157-161]`

10. **Structured ingest — `scripts/load_structured.py`** is account-agnostic (linter confirms generic `structured.values()` iteration); C's structured JSON loads with no edits. (Recommend the planner verify by reading it, but no change is anticipated.)

### Pattern 2: Unstructured ingest for Phase 9 — what actually runs

**Critical finding (grounds D-07):** The shipped `scripts/build_unstructured.py` does NOT use the UPDATE-PIPELINE.md per-module ADD lane. It does:
- Stage 1: File-Manager-upload **all** manifest docs (or `--modules`-filtered) → `file_ids`. `[VERIFIED: build_unstructured.py:129-151]`
- Stage 2: `create_corpus_build(file_ids=…, cluster_threshold=1, incremental=False)` — **full build, not incremental, not module-scoped via the `modules` field.** `[VERIFIED: build_unstructured.py:154-162]`
- Stage 3-4: strategize + `orchestrate_with_wait(replicas=2)` with **no `partition_ids`** → orchestrates ALL partitions. `[VERIFIED: build_unstructured.py:188-203]`
- Stage 7: attribution via `scripts/repair_kg_attribution.py` (content-derived, NOT manifest-keyed) because AutoGraph scrambles `Document.file_name`. `[VERIFIED: build_unstructured.py:311-325]` + memory `autograph-filename-scramble`.

**Implication:** Three ingest options for the planner. Option A is the safe default for this phase.

| Option | What it does | Cost | Lane-isolation risk | Recommendation |
|--------|-------------|------|---------------------|----------------|
| **A. Full rebuild (as-shipped)** | After full `--clean` regen, run `build_unstructured.py` with no `--modules` → rebuilds entire KG (all 12 modules). | Highest (~one full corpus build + strategize + orchestrate over ~120+ docs; minutes-to-tens-of-minutes, dominated by orchestrate). | **Zero** — everything is rebuilt fresh; no isolation question to answer. | **DEFAULT for Phase 9.** Because DATA-05 deepens existing docs anyway, a full rebuild is the honest, simplest path and sidesteps the unverified ADD-lane isolation. |
| **B. `--modules helio_slack helio_email helio_docs helio_pdf` add** | Upload only C's docs; corpus build over just C's `file_ids`; orchestrate all. | Lower upload, but Stage 2 still `incremental=False` over the passed `file_ids`, and Stage 4 orchestrates ALL partitions (no `partition_ids` filter) — so it can still touch N/M Layer-3. | Medium — the script as-written does not scope orchestrate; would need a `partition_ids` patch (out-of-scope code change). | Only if rebuild cost is unacceptable; requires a small script change + empirical isolation test (UPDATE-PIPELINE.md Open Item 1). |
| **C. Implement true ADD lane** | Per UPDATE-PIPELINE.md: `incremental:true modules:[…]` + read-back partition_ids + scoped orchestrate. | Lowest per-module. | Requires building + verifying the lane (the STATE blocker). | Defer — this is CDC (Phase 12) territory; do not build in Phase 9. |

**Why STATE's "Leiden re-clustering scope" blocker is mitigated for Phase 9:** Option A rebuilds everything, so re-clustering scope is moot. The UPDATE-PIPELINE.md mechanic that *per-module Leiden + `cluster_threshold:1` keeps a small module ≈ one partition* is real `[CITED: UPDATE-PIPELINE.md §"design recipe", lines 24-31]` and confirms the *concept* that C's modules would form their own partitions — but the shipped script doesn't exercise the isolated path, so the planner should not depend on isolation in this phase.

### Pattern 3: DATA-05 deepening — per-module EDIT-vs-ADD decision

Deepening edits the **generators' prose templates and record richness**, not the spine event *counts* where avoidable. Two styles, mapped to UPDATE-PIPELINE.md lanes:

| Deepening style | What changes | Lane (if doing incremental ingest) | Phase-9 cost under Option-A full rebuild |
|-----------------|--------------|-------------------------------------|------------------------------------------|
| **Content-edit (PREFERRED)** | Richer prose for an *existing* DocEvent (same `file_name`, same module membership); richer structured field values for existing records. | EDIT lane (partition-scoped, no re-cluster). | Free — full rebuild re-reads all bytes regardless. |
| **Add-doc** | A *new* DocEvent appended to an existing module (new `file_name`). | ADD lane (re-clusters that whole module). | Free under full rebuild, but **raises near-miss risk**: more docs per module = more distractors the signal must out-rank. |

**Prescriptive guidance:** Favor **content-edit** deepening (make existing slack/email/docs/pdf prose longer, more specific, more cross-referenced; enrich existing CRM/usage/contract/nps field values). Add new DocEvents sparingly and only when a new question demands a new signal doc — every added doc to a module increases the empirical near-miss guard's discrimination burden for that module's questions. Because Phase 9 does a single full regen + full rebuild (Option A), the lane distinction has **no runtime-cost impact this phase**; it matters for cost only if/when CDC (Phase 12) does incremental updates. **Document the lane intent per changed module in the plan anyway**, so Phase 12 inherits a clean delta map.

**Determinism caveat for deepening:** Prose is LLM-generated and **cached by prompt-hash** (`data_gen/llm/prose_client.py`). Editing a generator's prompt/template **changes the prompt hash → cache miss → new LLM call**. A `--clean` run wipes the cache and regenerates everything. Budget for real LLM calls on every deepened doc (the completion summary reports `real_llm` vs `cache_hit` vs `stub` counts — watch for `stub` fallbacks which indicate a failed LLM call producing deterministic filler). `[VERIFIED: generate.py:167-179]`

### Pattern 4: Account C contraction arc — concrete spine shape

To satisfy D-01/D-03 and stay safely distinct under the near-miss guard, model C's structured spine as a **mirror image of the existing growth ladders** — a *descending* curve with a hard downgrade event:

- **Contracts:** land Enterprise (or ArangoGraph) at peak → renew → then a **downgrade contract** (ArangoGraph→Enterprise, or Enterprise→Community) with *lower* `value_usd`, and a final renewal-at-risk/`auto_renew=False` contract. This is the structural signature absent from A (only climbs) and B (flat Enterprise).
- **Usage (`UsageEvent`):** `query_volume_m` that **rises then falls** (e.g. 8.0 → 12.0 peak → 9.0 → 6.0 → 4.5) and `cluster_nodes` that **shrink** (e.g. 10 → 8 → 6). Northwind/Meridian both monotonically rise `[VERIFIED: spine_northwind.py:148-172, spine_meridian.py:121-140]` — a *declining* series is unambiguously C's.
- **Opportunities:** a **closed-lost expansion** AND a **slipped/at-risk renewal** (stage="negotiation" or "closed-lost" with declining `amount_usd`). Distinct from Meridian's one lost expansion on an otherwise-renewing base.
- **NPS:** score *and* sentiment both decline together (e.g. 8/positive → 6/neutral → 4/negative). **This is the key D-03 distinction from Q12:** Meridian is *green score / red sentiment* (a contradiction); C is *both falling together* (no contradiction — honest decline). C's questions therefore must NOT be framed as "looks fine but isn't" (that's Q12) — frame as "the numbers themselves are dropping; why, and can it be saved."
- **Signal docs:** support escalations, a migration-away/de-prioritization Slack thread, a downgrade-rationale email, a "save plan" / remediation doc. Vocabulary should center on *contraction/downgrade/migration-away/declining-usage*, which is lexically distinct from Meridian's *renewal-pricing-objection/champion-quiet* and Northwind's *scale-limit/GenAI-intent*.

### Anti-Patterns to Avoid
- **Reusing Meridian's "green-usage/red-sentiment" framing for C** — collides with Q12/Q2 under RRF and violates D-03. C must show *actual numeric decline*.
- **Two-word/punctuated first token in `account_name`** — breaks `account_key` derivation (`split()[0]`) and output-dir/citable-url paths.
- **Adding many new DocEvents to existing N/M modules during DATA-05** — inflates distractor count and risks flipping an existing near-miss guard to RED. Prefer in-place content enrichment.
- **Assuming incremental/module-scoped ingest works** — the shipped script does a full rebuild; do not depend on isolated-add behavior in Phase 9.
- **Forgetting the duplicated `MODULE_NAMES`** in `conftest.py` — a manifest with `helio_*` modules will fail `test_module_names_valid` if only `entity_registry.py` is updated.
- **Editing question IDs that the existing 6 tests depend on** — additive only; never renumber Q2/Q5/Q7/Q8/Q9/Q12.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deterministic IDs / file names / URLs | Custom hashing | `canonical_uuid`, `make_file_name`, `make_citable_url` | Locked (D-06); linter asserts the URL prefix and stamp format. |
| Account spine | Ad-hoc dicts | `AccountSpine` + `*Event` dataclasses | All generators consume these typed structures. |
| RRF fusion in the near-miss guard | New RRF impl | `corpus_graph.rrf.ReciprocalRankFusion` | Matches production retrieval; guard already imports it. |
| AutoGraph ingest HTTP | New client | `lib/autograph_client.py` (`build_unstructured.py`) | Handles JWT re-auth, batching, 409-retry serialization, polling. |
| Embeddings for the guard | Local model | OpenAI `text-embedding-3-small` @ 512-dim | Matches AutoGraph's 512-dim KG (spike 001); dim mismatch invalidates the guard. |
| KG attribution after build | Manifest-keyed UPSERT | `scripts/repair_kg_attribution.py` (content-derived) | AutoGraph scrambles `Document.file_name`; manifest keying is wrong on this service. |

## Runtime State Inventory

This phase **adds** data and **rebuilds** the KG; it is additive, not a rename. The relevant "runtime state" question is *what carries the old 2-account assumption after the spine grows*.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | ArangoDB `customer360_*` KG collections (`_Documents`, `_Chunks`, etc.) hold only N/M docs today; structured graph holds N/M accounts. | Full regen + `load_structured.py` (C structured) + `build_unstructured.py` full rebuild (all 12 modules). Existing N/M Layer-3 is rebuilt fresh under Option A — no stale partitions. |
| Live service config | AutoGraph service URL in `service_discovery.json` / `AUTOGRAPH_URL`; no per-account config. | None — account-agnostic. |
| OS-registered state | None — no scheduled tasks/daemons embed account identity. | None — verified (no scheduler refs in scripts). |
| Secrets/env vars | `OPENAI_API_KEY`, `ARANGO_*`, `AUTOGRAPH_URL` in `.env`. **`AUTOGRAPH_PATH` is NOT in `.env`** (verified) — near-miss guard reads it from shell. | Ensure `AUTOGRAPH_PATH` exported in the shell that runs the linter, else the near-miss guard *skips* (false-green risk — see Pitfall 1). |
| Build artifacts | `data_gen/output/` (all generated files + `manifest.json`); `data_gen/llm/cache/` (prompt-hash cache); `build_manifest.json` (last build ids). **iCloud sync junk:** `output/structured/{meridian 2, meridian 3, northwind 2, northwind 3}` duplicate dirs observed. | `--clean` regen rebuilds `output/`. **Clean the iCloud " 2"/" 3" duplicate dirs first** (memory `icloud-desktop-sync-conflicts`) — they can pollute the linter's `structured.values()` iteration and the FM upload set. |

**Hard coupling constants that encode the 2-account / 6-question assumption** (must widen for C — the de-facto "runtime state" of this phase):
1. `data_gen/spine/entity_registry.py` `MODULE_NAMES` (8 → 12).
2. `data_gen/linter/conftest.py` `MODULE_NAMES` (duplicated, 8 → 12) and `QUESTION_IDS` (6 → 8–9).
3. `data_gen/linter/test_answerability.py` per-question test functions (add C's).
4. `data_gen/linter/test_near_miss_guard.py` `QUESTION_TEXTS` + a new `test_near_miss_guard_q*` (add C's).
5. `agent/test/questions.eval.test.ts` `it()` blocks (add C's 2–3).
6. `scripts/eval-gate.ts` `LOCKED_QUESTION_LABELS` (add C's).

## Common Pitfalls

### Pitfall 1: Near-miss guard silently SKIPS (false green)
**What goes wrong:** The guard `pytest.skip`s when `OPENAI_API_KEY` is absent — and the RRF import requires `AUTOGRAPH_PATH` (not in `.env`). A run missing either env shows the linter "passing" while the empirical guard never ran.
**Why it happens:** Graceful-skip design + `AUTOGRAPH_PATH` lives only in the shell. `[VERIFIED: test_near_miss_guard.py:38-41, 88-91]`
**How to avoid:** Before declaring the linter green, assert the near-miss tests *ran* (not skipped). Plan a step that fails if `OPENAI_API_KEY`/`AUTOGRAPH_PATH` are unset, or grep pytest output for `skipped` on the guard tests.
**Warning signs:** `s` markers / "skipped" in pytest summary for `test_near_miss_guard_*`.

### Pitfall 2: Stale shell `OPENAI_API_KEY` shadows the valid `.env` key
**What goes wrong:** A stale shell key (…5CAA) 401s and the valid `.env` key is ignored.
**Why it happens:** `load_dotenv` without `override=True` lets the shell env win.
**How to avoid:** All entrypoints already use `load_dotenv(…, override=True)` (verified in `test_near_miss_guard.py:32`, `build_unstructured.py:45`). Don't add a new entrypoint that omits `override=True`. Memory: `openai-key-env-gotcha`.
**Warning signs:** 401 `AuthenticationError` despite a valid `.env`.

### Pitfall 3: New C doc collides with an existing N/M near-miss under RRF
**What goes wrong:** C's churn vocabulary ("renewal risk", "at risk") overlaps Meridian's Q2 vocabulary, so a C doc out-ranks (or is out-ranked by) a Meridian distractor in a shared corpus — though the guard scopes per-module, cross-account queries in the eval gate are not scoped.
**Why it happens:** The near-miss guard scopes to one account's modules `[VERIFIED: test_near_miss_guard.py:232]`, but the live agent + eval gate query the whole KG.
**How to avoid:** Use the *contraction/downgrade/migration-away* lexicon for C (D-03), distinct from Meridian's *renewal-pricing-objection*. Verify the existing 5 N/M guard tests still pass after C is added (a regression there = lexical bleed).
**Warning signs:** Q2/Q12 guard flips to RED after C docs are added; eval-gate Q2/Q12 faithfulness drops.

### Pitfall 4: Deepening edits bust the prose cache and re-spend LLM budget / drift
**What goes wrong:** Editing prose templates changes prompt hashes → full cache miss → many LLM calls; non-deterministic prose can drift facts and trip cross-source-agreement/chronology linters.
**Why it happens:** Prompt-hash caching; LLM generation. `[CITED: generate.py:167-179]`
**How to avoid:** Deepen in controlled batches; after each `--clean` regen, run the full linter; watch the completion summary's `stub` count (a `stub` fallback = failed LLM call → deterministic filler that may be too thin to clear faithfulness).
**Warning signs:** `WARNING: N doc(s) used deterministic stub prose`; cross_source_agreement or chronology failures on previously-green accounts.

### Pitfall 5: iCloud " 2"/" 3" duplicate dirs pollute the dataset
**What goes wrong:** `data_gen/output/structured/meridian 2/` etc. are picked up by the linter's `structured.glob("**/*.json")` and by the FM upload, double-counting records / corrupting account derivation.
**Why it happens:** Repo on iCloud-synced `~/Desktop` (memory `icloud-desktop-sync-conflicts`).
**How to avoid:** Delete the " 2"/" 3" duplicate dirs before regen; ideally move the repo off Desktop (out of scope, but flag it).
**Warning signs:** `account` keys like `meridian 2` in the linter's `load_structured` result.

### Pitfall 6: AutoGraph orchestrate concurrency (409)
**What goes wrong:** Two builds/orchestrations at once → 409 `OrchestrationInProgressError`.
**How to avoid:** Serialize. `orchestrate_with_wait` already retries on 409 `[VERIFIED: autograph_client.py:541-587]`; never launch a second `build_unstructured.py` concurrently.

## Code Examples

### Account C spine skeleton (mirror of spine_meridian.py)
```python
# data_gen/spine/spine_helio.py  — Account C (churn / contraction)
from datetime import date
from data_gen.spine.entity_registry import (
    HELIO_ACCOUNT_ID, GLOBAL_SEED, canonical_uuid, make_citable_url, make_file_name,
)
from data_gen.spine.event_spine import (
    AccountSpine, ArangoEdition, ContactEvent, ContractEvent, DocEvent, NpsEvent,
    OpportunityEvent, UsageEvent,
)

# Declining usage (rise → peak → fall) — the structural churn signature (D-03)
def _usage(period, qvol, nodes, edition):
    return UsageEvent(
        event_id=f"he_usage_{period.lower().replace('-', '_')}",
        account_id=HELIO_ACCOUNT_ID,
        entity_id=canonical_uuid("helio", f"usage:{period}"),
        period=period, query_volume_m=round(qvol, 2), cluster_nodes=nodes,
        edition=edition, smartgraphs_enabled=True, graphrag_enabled=False,
    )
# ... peak then decline: 12.0 → 9.0 → 6.0 → 4.5 ; nodes 10 → 8 → 6

HELIO_SPINE = AccountSpine(
    account_id=HELIO_ACCOUNT_ID, account_name="Helio Retail",
    contracts=_contracts, usage=_usage_records, contacts=_contacts,
    opportunities=_opportunities, nps=_nps_records,
    docs=_signal_docs + _near_miss_docs + _noise_docs,
)
```

### New near-miss guard test for Account C (mirror q12)
```python
# data_gen/linter/test_near_miss_guard.py
QUESTION_TEXTS["Q13"] = (
    "Helio Retail usage is declining and they downgraded their plan — is this account "
    "churning, what is driving the contraction, and is there a remediation path?"
)

def test_near_miss_guard_q13(load_manifest, load_unstructured_files):
    _require_api_key()
    helio_modules = ["helio_slack", "helio_email", "helio_docs", "helio_pdf"]
    docs = _load_unstructured_docs(load_unstructured_files, modules=helio_modules)
    _assert_signal_top1(QUESTION_TEXTS["Q13"], docs, load_manifest)
```

### Full Phase-9 ingest sequence (Option A — safe default)
```bash
# 0. clean iCloud junk dirs first
# 1. regenerate everything deterministically (busts cache for deepened prose)
python data_gen/generate.py --clean
# 2. HARD GATE: full linter sweep (assert near-miss guard RAN, not skipped)
AUTOGRAPH_PATH=/Users/plosiewicz/Desktop/autograph pytest data_gen/linter/ -v
# 3. structured load (idempotent UPSERT, account-agnostic)
python scripts/load_structured.py
# 4. unstructured full rebuild (serialized; one build/orchestrate)
python scripts/build_unstructured.py
# 5. SC-5: eval gate stays GREEN
npx tsx scripts/eval-gate.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2 accounts (N/M), 6 locked questions | 3 accounts (+ Helio), 8–9 locked questions | Phase 9 | Widen 6 coupling constants; near-miss + eval add C tests. |
| `import-multiple` ephemeral staging | File-Manager `file_ids` path | Plan 03-04 | `build_unstructured.py` uses `upload_rag_input` → `file_ids`; import-multiple no-ops on this cluster. |
| Manifest-keyed `file_name` stamping | Content-derived `repair_kg_attribution.py` | Plan 03 | AutoGraph scrambles `Document.file_name`; manifest keying is wrong. |

**Deprecated/outdated:** Do not route ingest through `import-multiple` staging (silent no-op on this cluster — `[CITED: autograph_client.py:329-339, build_unstructured.py:8-9]`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended vertical "Helio Retail / e-commerce personalization" satisfies D-02 distinctness. | Pattern 4 | Low — Claude's discretion; planner/user may rename. Vertical name only affects prose lexicon. |
| A2 | `scripts/load_structured.py` is account-agnostic and needs no edits for C. | Pattern 1 step 10 | Medium — planner should read it to confirm; if it has a hardcoded account list, add C. (Linter's generic iteration strongly suggests agnostic.) |
| A3 | A full Option-A rebuild completes within practical demo-prep time on this cluster. | Pattern 2 | Medium — orchestrate over ~120+ docs is minutes-to-tens-of-minutes; not verified for 12 modules. Mitigate with the `--build-id` resume + `--skip-orchestrate` flags. |
| A4 | Adding C docs does not flip the 5 existing N/M near-miss guards to RED. | Pitfall 3 | Medium — depends on C's lexicon staying distinct (D-03). Verify by re-running all guard tests after C is added. |
| A5 | The prose generator's per-doc fact-builders (`_build_facts_for_signal`, etc.) generalize to C's events without per-account special-casing. | Pattern 1 step 4 | Medium — only the slack generator's helpers were inspected; planner should spot-check email/docs/pdf fact-builders for any hardcoded `northwind`/`meridian` branches before generating C. |

## Open Questions

1. **Does the as-shipped `build_unstructured.py` truly need a full rebuild, or can `--modules helio_*` add C in isolation?**
   - What we know: Stage 2 uses `incremental=False` over passed `file_ids`; Stage 4 orchestrates with no `partition_ids` → not isolated. `[VERIFIED: build_unstructured.py:154-203]`
   - What's unclear: UPDATE-PIPELINE.md Open Item 1 (does `partition_ids`-scoped orchestrate leave the rest of `_kg` intact?) is still untested.
   - Recommendation: Use **Option A (full rebuild)** for Phase 9. Defer isolated-add to Phase 12 (CDC), where the lane + isolation test belongs.

2. **Re-ingest/cost budget for the full rebuild over 12 modules.**
   - What we know: poll timeouts are generous (corpus 5400s, strategy 1800s, KG-populate 2400s); orchestrate runs `replicas=2`. `[VERIFIED: build_unstructured.py:176,192,206,200]`
   - What's unclear: wall-clock for 12 modules / ~120–180 docs on the live cluster.
   - Recommendation: Plan a single serialized rebuild; use `--build-id` to resume on interruption; treat the timeouts above as the budget ceiling.

3. **Do email/docs/pdf prose fact-builders contain account-specific branches?** (See A5.) Planner should read `_build_facts_for_signal` equivalents in `email_generator.py`, `docs_generator.py`, `pdf_generator.py` before generating C.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `OPENAI_API_KEY` (`.env`) | near-miss guard + eval gate + prose gen | ✓ (in `.env`) | — | none — guard/eval skip without it (Pitfall 1) |
| `ARANGO_*` (`.env`) | structured load, KG build, eval gate | ✓ | — | none |
| `AUTOGRAPH_URL` (`.env`) / `service_discovery.json` | KG build | ✓ (`.env`) | — | `service_discovery.json` |
| `AUTOGRAPH_PATH` (shell) | near-miss guard RRF import | ✗ in `.env` (shell-only) | local checkout `/Users/plosiewicz/Desktop/autograph` | guard skips (FALSE GREEN risk) |
| AutoGraph service (live) | KG build orchestrate | assumed up | v0.0.8 | none — health check fails build |
| Live ArangoDB cluster | structured load + eval gate | ✓ (shared prod) | 3.12.9 | none |

**Missing dependencies with no fallback:** `AUTOGRAPH_PATH` must be exported in the shell running the linter, or the empirical near-miss guard silently skips (the single biggest false-green risk this phase).

## Validation Architecture

> nyquist_validation: treated as enabled (no explicit `false` found).

### Test Framework
| Property | Value |
|----------|-------|
| Framework (data linter) | pytest (`data_gen/linter/pytest.ini`) |
| Framework (eval gate) | Vitest via `npx tsx scripts/eval-gate.ts` (filters `questions.eval`) |
| Quick run (linter, no API) | `pytest data_gen/linter/ -k "not near_miss"` |
| Full linter (empirical) | `AUTOGRAPH_PATH=… pytest data_gen/linter/ -v` (requires OPENAI_API_KEY + AUTOGRAPH_PATH) |
| Eval gate (SC-5) | `npx tsx scripts/eval-gate.ts` (requires OPENAI_API_KEY + live ArangoDB) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-04 | C structured records present (anchor) | unit (linter) | `pytest data_gen/linter/test_answerability.py -k helio` | ❌ Wave 0 (add C test fns) |
| DATA-04 | C dual-graph signal out-ranks distractors | empirical (RRF) | `AUTOGRAPH_PATH=… pytest data_gen/linter/test_near_miss_guard.py -k q13` | ❌ Wave 0 (add C guard test) |
| DATA-04 | C referential integrity / chronology / cross-source | unit (linter) | `pytest data_gen/linter/test_{referential_integrity,chronology,cross_source_agreement}.py` | ✅ (account-agnostic; auto-covers C) |
| DATA-04 | C modules ∈ MODULE_NAMES / field stamps | unit (linter) | `pytest data_gen/linter/test_field_stamps.py` | ✅ (after widening both `MODULE_NAMES`) |
| DATA-04 | C questions answer end-to-end (struct+unstruct) | integration (eval) | `npx tsx scripts/eval-gate.ts` (C `it()` blocks) | ❌ Wave 0 (add C eval tests) |
| DATA-05 | Existing accounts deepened, no linter regression | unit (linter) | `AUTOGRAPH_PATH=… pytest data_gen/linter/ -v` | ✅ |
| DATA-05 / SC-5 | Existing 6 answers not corrupted | integration (eval) | `npx tsx scripts/eval-gate.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `pytest data_gen/linter/ -k "not near_miss"` (fast, no API).
- **Per wave merge:** full linter incl. near-miss guard (assert it RAN, not skipped).
- **Phase gate:** full linter GREEN + `scripts/eval-gate.ts` GREEN before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `data_gen/spine/spine_helio.py` — Account C spine (DATA-04).
- [ ] `data_gen/spine/entity_registry.py` — `HELIO_ACCOUNT_ID` + 4 `helio_*` in `MODULE_NAMES`.
- [ ] `data_gen/generate.py` — import + append `HELIO_SPINE` to `_SPINES`.
- [ ] `data_gen/linter/conftest.py` — widen duplicated `MODULE_NAMES` + `QUESTION_IDS`.
- [ ] `data_gen/linter/test_answerability.py` — add C question test functions.
- [ ] `data_gen/linter/test_near_miss_guard.py` — add C `QUESTION_TEXTS` + `test_near_miss_guard_q*`.
- [ ] `agent/test/questions.eval.test.ts` — add C `it()` blocks (+ optional `QC_ANCHOR_PROMPT` in `agent/src/index.ts`).
- [ ] `scripts/eval-gate.ts` — add C labels to `LOCKED_QUESTION_LABELS`.
- [ ] Pre-flight: export `AUTOGRAPH_PATH`; delete iCloud " 2"/" 3" dup dirs.

## Security Domain

> Demo on 100% synthetic data; no PII, no auth surface, no untrusted input in this phase. Injection-resistance is Phase 13 (SEC-01/02), not here.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | partial | Linter validates data shape pre-ingest; AQL stamping uses bind vars (`@@col`/`@mapping`) — injection-safe `[VERIFIED: build_unstructured.py:260-266]`. |
| V6 Cryptography | no | No crypto in scope. |
| V2/V3/V4 Auth/Session/Access | no | No new auth surface (JWT to ArangoDB is existing, unchanged). |

**Phase-specific note:** The only "security-adjacent" requirement is **grounding integrity** — new C data must not introduce ungrounded/hallucination surface (D-05). The faithfulness floor (0.6) + enforceGrounding `_id` gate are the controls; both are exercised by the eval gate.

## Sources

### Primary (HIGH confidence — repo source, read this session)
- `data_gen/spine/entity_registry.py`, `event_spine.py`, `spine_northwind.py`, `spine_meridian.py` — spine pattern, deterministic keys, MODULE_NAMES one-way door.
- `data_gen/generate.py` — `_SPINES`, generator iteration, `account_key` derivation, prose stats.
- `data_gen/generators/{crm,usage,contract,slack}_generator.py` (signatures) — single-spine vs full-list confirmation.
- `data_gen/linter/conftest.py`, `test_near_miss_guard.py`, `test_answerability.py`, `test_field_stamps.py` (+ grep of chronology/cross_source/referential) — coupling constants, empirical guard, account-agnostic iteration.
- `agent/test/questions.eval.test.ts`, `scripts/eval-gate.ts` — locked question contract, classifier labels.
- `scripts/build_unstructured.py`, `lib/autograph_client.py` — actual ingest mechanics (file_ids path, incremental=False, no partition scoping, 409 serialization, content-derived attribution).
- `.planning/spikes/001-autograph-kg-claim-sourcing/UPDATE-PIPELINE.md` — EDIT/ADD/DELETE lane design (designed, not yet built into the script).
- `.planning/ROADMAP.md` §Phase 9, `.planning/REQUIREMENTS.md` (DATA-04/05), `.planning/STATE.md`, `09-CONTEXT.md`.

### Secondary (MEDIUM — memory notes)
- Memory: `autograph-updatability`, `autograph-kg-schema`, `autograph-filename-scramble`, `openai-key-env-gotcha`, `icloud-desktop-sync-conflicts`.

## Metadata

**Confidence breakdown:**
- Mechanical change-list (Account C): **HIGH** — every step verified against current source with file:line.
- Ingest path / D-07 answer: **HIGH** — read the actual `build_unstructured.py` + client; finding (full rebuild, not isolated add) is grounded, contradicts the optimistic "isolated module add" reading and is flagged.
- Deepening lane strategy: **HIGH** for the EDIT-vs-ADD mapping; **MEDIUM** for runtime cost (not benchmarked for 12 modules).
- Near-miss distinctness recommendation: **MEDIUM-HIGH** — RRF behavior is empirical; the contraction-vs-contradiction distinction (D-03) is sound but must be verified by running the guard.
- Account-agnosticism of generators/loaders: **HIGH** for the 4 inspected generators; **MEDIUM** for email/docs/pdf fact-builders (A5) and `load_structured.py` (A2).

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable; repo-internal facts. Re-verify if generators or `build_unstructured.py` change.)

## RESEARCH COMPLETE
