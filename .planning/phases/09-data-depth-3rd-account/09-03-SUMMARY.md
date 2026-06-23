---
phase: 09-data-depth-3rd-account
plan: 03
subsystem: database
tags: [arangodb, autograph, knowledge-graph, arangosearch, bm25, eval-gate, vitest]

# Dependency graph
requires:
  - phase: 09-01
    provides: Account C (Helio) spine + entity registry + Q13/Q14/Q15 wired into linter & locked eval gate
  - phase: 09-02
    provides: deepened N/M prose + all-account structured record richness (EDIT-lane content edits)
  - phase: 08-deterministic-eval-harness
    provides: scripts/eval-gate.ts GREEN/RED classifier + questions.eval.test.ts FAITHFULNESS_FLOOR 0.6 (D-06 locked)
provides:
  - Self-cleaning build_unstructured.py (guarded delete-first Layer-3 truncate before orchestrate + Stage 6.5 ArangoSearch chunks-view link refresh)
  - One full fresh clean KG rebuild — 139 docs (3 accounts), zero stale-doc contamination, all attributed
  - Hardened verify_kg_loaded.py (asserts ~139 clean docs NOT 244, zero null module/account, 3 accounts attributed)
  - scripts/refresh_chunks_view.py — one-shot capture->drop->settle->re-add applier for the chunks_search_view link on an already-built KG
affects: [10-answer-provenance-edge-enrichment, 11-graph-viz, 12-cdc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-first Layer-3 rebuild: truncate the 5 AutoGraph-derived collections (allowlist-guarded) before orchestrate so a full rebuild writes fresh into empty collections instead of appending."
    - "Post-orchestrate ArangoSearch view self-heal: drop+re-add ONLY the chunks link (with the captured config) so a delete-first rebuild's fresh chunk _ids re-index, instead of leaving the BM25 view pointing at pre-truncate _ids."

key-files:
  created:
    - scripts/refresh_chunks_view.py
  modified:
    - scripts/build_unstructured.py
    - scripts/verify_kg_loaded.py

key-decisions:
  - "Option C executed: patch build_unstructured.py self-cleaning (delete-first) + run a fresh full rebuild, rather than hand-truncate (which the auto-mode classifier had denied as out-of-scope)."
  - "Layer-3 truncate is hardcoded to the KG_LAYER3_COLLECTIONS allowlist with a customer360_ prefix re-assertion — it can never touch the structured graph."

patterns-established:
  - "Delete-first (UPDATE-PIPELINE.md line 77): purge Layer-3 before re-orchestrating to sidestep the importer's additive-vs-wipe ambiguity."

requirements-completed: []  # DATA-04 / DATA-05 NOT yet complete — eval gate (SC-5) is RED pending a view-index repair (see Blocker)

# Metrics
duration: ~25min (active executor wall-clock; rebuild ~6min, eval gate ~5min)
completed: 2026-06-22
---

# Phase 9 Plan 03: Data Depth & 3rd Account — Materialize + Validate (PARTIAL — authorized vector-index fix DONE; eval gate 9→4; blocked on TWO newly-isolated NON-infra data/code gaps)

**The user-authorized HNSW vector-index drop+recreate was executed faithfully and folded into the build as Stage 6.6 (commit `d1725c4`) — the orphaned segment is cleared, the failing hybrid-spike test now PASSES via the arangojs bearer path, and the eval gate went from 9 confirmed failures to 4. The remaining 4 failures are NOT the materialize/infra error and are NOT covered by the vector-index authorization — they are TWO genuinely distinct, deterministically-reproduced gaps that belong in the spine/data + agent-code lanes, so per `<on_blocker>` ("if the gate stays RED for a GENUINE reason, STOP and return a structured gap — fix belongs in Plan 01/02, never a loosened gate") I stopped rather than self-authorize new pipeline/code edits:**

1. **Q13 / Q14 / Q15 (Helio) — entity-bridge gap.** Helio's structured records are fully loaded (Account `c2de4d08…` with `account_name='Helio Retail'`, Contact=3, Opportunity=5, Contract=3, UsageFact=10, NPS=7), but `canonical_entities` still holds ONLY the 2-account world (Meridian + Northwind orgs). `entityLookup("Helio Retail")` queries `canonical_entities.display_name`, finds nothing, so the agent CORRECTLY refuses (`refused:true`, "I could not find a structured record for Helio Retail in the canonical entities database"). Root cause: `scripts/demo_critical.py` is hardcoded to the old 9-id / 2-account `DEMO_CRITICAL_ENTITIES` map (with `assert len==9`), and `scripts/build_entity_bridge.py` (which UPSERTs the `canonical_entities` hubs from that map) was never extended/re-run for Account C. This is a deterministic DATA-bridge pipeline gap, NOT infra and NOT a faithfulness regression.

2. **Q9 (Meridian) — model emits a `null` element in `retrievalPath[]._ids`.** `askQuestion` throws a Zod validation error before grounding: `retrievalPath[2]._ids[2]: expected string, received null` (the model-authored `SynthRetrievalPath._ids` is `z.array(z.string())`). Deterministically reproduced across runs. This was previously MASKED by the vector materialize throw; clearing the segment surfaced it. It is an envelope-robustness bug in the agent (a null array element must be filtered/rejected gracefully, not crash the request), NOT infra.

**The data is correct (139 clean chunks, all structured facets pass, BM25 view + vector index both materialize cleanly). D-06 is intact — `git diff` on eval-gate.ts, questions.eval.test.ts, hybridSpike.test.ts is clean.**

## Performance

- **Duration:** ~25 min active executor time (KG rebuild ~6 min wall-clock; eval gate ~5 min)
- **Tasks:** Task 2b (build patch + rebuild) DONE; Task 2 verify DONE; Task 3 (eval gate) BLOCKED RED
- **Files modified:** 2 (build_unstructured.py, verify_kg_loaded.py)

## Accomplishments

- **Patched build_unstructured.py to be self-cleaning (committed `5240b0a`).** Added a guarded Stage 3.5 that truncates the 5 AutoGraph Layer-3 derived collections (Documents/Chunks/Entities/Relations/Communities) BEFORE orchestrate. Hardcoded to a `KG_LAYER3_COLLECTIONS` allowlist with a `customer360_` prefix re-assertion — it can never touch the structured graph. `--no-truncate` escape hatch added for diagnostic resumes. (Decision Option C, spike UPDATE-PIPELINE.md line 77.)
- **Ran ONE serialized full fresh rebuild — genuinely clean.** New corpus build `cb_1782167308_a2ffe336`, orchestration `orch_1782167355_e43b03e5`, 6 partition strategies. Stage 3.5 cleared **5766 stale Layer-3 records** (244/244/1210/3975/93 → 0), orchestrate repopulated to **exactly 139 docs / 139 chunks** (was the contaminated 244). Dim check PASS (512). Stage 7 content-derived attribution repair: **0 header-account mismatches, file_name set == manifest keys, 0 dupes**, all 139 docs attributed.
- **Hardened verify_kg_loaded.py and it exits 0 (committed `cd61d89`).** Asserts total docs ≈ manifest size (139, NOT 244), zero null module/account_id, and all 3 accounts present + attributed (northwind=40, meridian=61, helio=38 — exactly matching the manifest). The old `>=1` threshold false-passed on the contaminated set; the new gate fails on stale-doc contamination. Structured graph confirms all 3 accounts (Account=1 each; helio 28 child vertices).

## Task Commits

1. **Task 2b: self-cleaning build patch** — `5240b0a` (fix)
2. **Task 2: fresh clean rebuild + hardened verify** — `cd61d89` (feat)
3. **Task 3 (view link-refresh fix): self-heal ArangoSearch chunks view** — `1d93bc8` (fix) — build_unstructured.py Stage 6.5 (link drop+re-add) + scripts/refresh_chunks_view.py
4. **Task 3 (authorized full view DROP+RECREATE + vector-index diagnosis)** — `5dc0f74` (fix) — Stage 6.5 upgraded to full view drop+recreate (executed live, view 139/139 clean); refresh_chunks_view.py matched; corrected root cause to the HNSW vector index.
5. **Task 3 (eval gate GREEN)** — NOT achieved (still RED — orphaned HNSW *vector-index* segment; vector-index drop+recreate DENIED, awaiting authorization; see Blocker)

## Authorized View-Refresh Fix (executed + folded into the build)

The user explicitly authorized refreshing the `customer360_chunks_search_view` chunks link AND folding it into the build script. Both were done:

- **Capture-first:** read and recorded the live link config before changing anything — `customer360_Chunks` → `{fields:{content:{analyzers:['text_en']}}, includeAllFields:false}` (plus ArangoSearch's default expansions `analyzers:['identity'], storeValues:'none', trackListPositions:false`). This matches `agent/test/hybridSpike.test.ts::ensureChunksView` exactly.
- **Refreshed the link:** dropped the `customer360_Chunks` link (`update_view(..., {links:{customer360_Chunks:None}})`), let it settle, re-added it with the captured config to force a full re-index over the 139 fresh chunks. **BM25 probe materializes live chunks** (3+ rows), the view indexes **exactly 139 docs == 139 live chunks (0 stale on the probed replicas)**, and 15 consecutive content-materializing probes at LIMIT 32 were stable-clean.
- **Durable fold-in (committed `1d93bc8`):** added a guarded **Stage 6.5** to `scripts/build_unstructured.py` (`stage_refresh_chunks_view`) that runs AFTER orchestrate and drops+re-adds ONLY the `customer360_Chunks` link on `customer360_chunks_search_view`, gated by a BM25 live-chunk probe. Hardcoded to that one view's one link — never reconfigures other views or the structured graph; skips cleanly if the view is absent (the spike DDL owns creation). Also shipped `scripts/refresh_chunks_view.py` as a standalone one-shot applier for an already-built KG.
- **Effect on the gate:** the refresh recovered the centerpiece dual-graph questions — **Q12 (CENTERPIECE), Q2, Q7, Q8 now PASS**, and `BM25 over the new chunks view returns chunk _ids` passes. This proves the link refresh is the correct fix and that the data + spine are NOT regressed (no faithfulness/grounding drop — Pitfall-3 lexical bleed is NOT the cause).

D-06 LOCKED: `git diff` on `scripts/eval-gate.ts`, `agent/test/questions.eval.test.ts`, and `agent/test/hybridSpike.test.ts` is **clean** — the gate, FAITHFULNESS_FLOOR, and assertions were NOT modified to pass.

## Files Created/Modified

- `scripts/build_unstructured.py` — added guarded delete-first Stage 3.5 (`KG_LAYER3_COLLECTIONS` allowlist truncate) + `--no-truncate` flag + docstring.
- `scripts/verify_kg_loaded.py` — hardened from a `>=1` pass to a clean-rebuild gate (≈139 docs, zero null attribution, all 3 accounts).

## SC Mapping

| SC | Status | Evidence |
|----|--------|----------|
| SC-1 (3rd account materialized) | DONE | manifest 139 docs incl. helio=38; structured Account/child vertices for Helio loaded (Task 1 + 2a, prior commits da78e51, load_structured). |
| SC-2 (linter green, near-miss RAN) | DONE (Task 1, prior commit da78e51) | full linter 33 passed, near-miss guards PROVEN ran (0 skipped). |
| SC-3 (≥1 C dual-graph answerable e2e) | **BLOCKED** | Q13 fails at the eval gate — unstructured BM25 retrieval throws (see Blocker). |
| SC-4 (existing deepened, no linter regression) | DONE (Task 1) | linter green after deepening. |
| SC-5 (eval gate GREEN after data change) | **BLOCKED RED** | 8 confirmed failures, all tracing to the stale ArangoSearch view index — NOT a data-quality regression. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] build_unstructured.py appended instead of replacing — self-cleaning truncate added**
- **Found during:** Task 2b (the resolved blocker from the prior session)
- **Issue:** The as-shipped script does a full Option-A rebuild but never truncates Layer-3; the importer appends (spike UPDATE-PIPELINE.md line 77), so the blocked attempt produced 244 docs (105 stale + 139 new, module=null), scrambling Stage-7 attribution to only 4 helio docs.
- **Fix:** Added guarded Stage 3.5 delete-first truncate (allowlist + prefix assertion) before orchestrate. Per the user-authorized Option C.
- **Files modified:** scripts/build_unstructured.py
- **Verification:** Build log shows `truncated 244 -> 0` for all 5 collections; rebuild landed exactly 139 clean docs; verify_kg_loaded.py exits 0.
- **Committed in:** `5240b0a`

## Authorized Vector-Index Fix — EXECUTED + folded into the build (Stage 6.6, commit d1725c4)

The user explicitly authorized "Authorize recreate + fold into script". Both were done:

- **Reconfirmed the diagnosis live first:** the failing hybrid-spike test (arangojs bearer path) threw `failed to materialize document _ltDk106--_ (1868737031932215297) for collection s277302422: NotFound [MaterializeNode]` on `PRMR-b55co4fj` — the orphaned HNSW vector-index segment, exactly as the prior session isolated.
- **Capture-then-faithful-recreate:** captured the LIVE `vector_cosine` index params (`dimension=512, metric=cosine, nLists=115, trainingIterations=25, defaultNProbe=64`), dropped it (discarding every backing segment across ALL replicas), recreated with EXACTLY those captured params (new index id `285285073`), and waited for `training_state` to retrain from `unusable` → `ready`.
- **Verified the segment is cleared:** post-recreate, `APPROX_NEAR_COSINE` over the real OpenAI query embedding materialized 32 live chunks 8/8 (python-arango) AND the previously-failing `hybridSpike.test.ts` "fuses vector + BM25 (TS RRF)" test now PASSES via the agent's own arangojs bearer connection.
- **Effect on the gate:** eval gate went from **9 confirmed failures → 4**. Q2, Q12 (CENTERPIECE), Q5, and both hybrid-spike tests recovered. The vector fix is the correct and necessary fix; it was just not the ONLY blocker.
- **Durable fold-in (committed `d1725c4`):** added a guarded **Stage 6.6** (`stage_rebuild_vector_index`) to `scripts/build_unstructured.py`, run AFTER orchestrate alongside the Stage 6.5 view drop+recreate. It captures the live params, drops+recreates the ONE embedding-field vector index, and waits for `training_state=ready`. Scope-guarded to that single index (refuses any non-`["embedding"]` fields); skips cleanly if absent; never touches any other index, the BM25 view, or the structured graph. Every future delete-first clean rebuild now self-heals BOTH the BM25 view (6.5) and the HNSW vector index (6.6).

## Issues Encountered — BLOCKER (eval gate RED at 4 failures; TWO newly-isolated NON-infra gaps)

**The eval gate (`npx tsx scripts/eval-gate.ts`) is RED with 4 confirmed failures (down from 9 after the vector fix). D-06 is intact (git diff clean on eval-gate.ts, questions.eval.test.ts, hybridSpike.test.ts).** Clearing the vector-index orphaned segment recovered the dual-graph + hybrid tests that throw on materialize; the residual 4 are two genuinely different causes, neither infra, neither covered by the vector-index authorization.

### Gap 1 — Q13 / Q14 / Q15 (Helio) refuse: `canonical_entities` was never extended for Account C
- **Reproduced deterministically** (2/2 runs): `askQuestion(QC_ANCHOR_PROMPT)` returns `refused:true, citations:0`, answer = "I could not find a structured record for 'Helio Retail' in the canonical entities database. Without a valid account_id, I am unable to retrieve …".
- **entityLookup** (`agent/src/tools/entityLookup.ts`) resolves a prose name by `FILTER LIKE(LOWER(h.display_name), …)` over `canonical_entities`. Live state: `canonical_entities` has **9 rows total — 2 organizations (Meridian, Northwind), 5 users, 2 contracts — and NO Helio** (org or user). So "Helio Retail" resolves to nothing and the agent correctly refuses.
- **Helio's structured records ARE present** (Account `c2de4d08…` `account_name='Helio Retail'`; Contact=3, Opportunity=5, Contract=3, UsageFact=10, NPS=7). The ONLY missing thing is the canonical bridge hub.
- **Root cause:** `scripts/demo_critical.py` hardcodes the old 9-id / 2-account `DEMO_CRITICAL_ENTITIES` map (with `assert len(DEMO_CRITICAL_IDS) == 9`); `scripts/build_entity_bridge.py` UPSERTs `canonical_entities` from that map and was never extended/re-run for Helio. Plan 01 wired Helio into the spine + linter + locked eval gate but did NOT extend the entity-bridge canonical map.
- **This is a DATA-bridge pipeline gap (Plan 01/02 lane), NOT infra and NOT a faithfulness/lexical-bleed regression.**

### Gap 2 — Q9 (Meridian) throws: model emits a `null` in `retrievalPath[]._ids`
- **Reproduced deterministically** (isolated run + 2 gate runs): `askQuestion` throws a Zod error BEFORE grounding — `retrievalPath[2]._ids[2]: Invalid input: expected string, received null`. The model-authored `SynthRetrievalPath._ids` is `z.array(z.string())` (agent/src/agent.ts), so a single null element in the model's copied retrieval path crashes the whole request.
- This was **previously MASKED** by the vector materialize throw on this same dual-graph question; clearing the segment surfaced it.
- **This is an envelope-robustness bug in the agent** (the model occasionally emits a null `_id` element; the request must filter/reject it gracefully instead of throwing), NOT infra.

### Failing tests (post vector-index fix — 4 confirmed, down from 9)
- **Q13 (helio dual), Q14 (helio dual), Q15 (helio structured-only anchor)** — refuse because `canonical_entities` has no Helio hub (Gap 1). entityLookup("Helio Retail") → empty → correct refusal.
- **Q9 (Meridian dual-graph)** — throws `retrievalPath[2]._ids[2]: expected string, received null` before grounding (Gap 2).
- RECOVERED by the vector fix (now PASS): Q2, Q12 (CENTERPIECE), Q5, "Meridian-scoped sentiment query …", "fuses vector + BM25 (TS RRF) and traverses PART_OF …" (`hybridSpike.test.ts`), and the BM25-view test.

### Why this is a STOP-and-return-gap blocker (per the plan's on_blocker contract)
The user authorized the vector-index drop+recreate (Authorize recreate + fold into script). That was executed fully, verified live, and folded into build Stage 6.6 (`d1725c4`). The 4 residual failures are NOT the materialize/infra error the authorization covered — they are two deterministically-reproduced gaps that `<on_blocker>` directs me to surface rather than self-fix:

- **Gap 1 (Q13/Q14/Q15)** is a GENUINE grounding/data gap: the fix belongs in the spine/data lane (Plan 01/02) — extend `scripts/demo_critical.py` with Helio's entities (org "Helio Retail" + its champion/contract canonical ids, lifting the `assert len==9`) and re-run `python scripts/build_entity_bridge.py` to UPSERT Helio's `canonical_entities` hubs + `same_as` edges. This is precisely the on_blocker case "fix belongs in spine/prose, never a loosened gate."
- **Gap 2 (Q9)** is an agent-code robustness fix beyond this continuation's data/infra mandate: the agent must tolerate a model-emitted null in `retrievalPath[]._ids` (filter nulls before building the envelope, or relax the synth-schema to drop null elements) — without touching the LOCKED grounding contract / FAITHFULNESS_FLOOR (D-06).

Neither is fixable by loosening the gate, and neither is the authorized vector-index op. I stopped rather than self-authorize the bridge re-run / demo_critical edit / agent-code change.

### What unblocks it (no infra auth needed — these are data + code fixes)
1. **Gap 1 (Helio bridge):** add Account C to `scripts/demo_critical.py` (`DEMO_CRITICAL_ENTITIES`: Helio org + its locked champion/contract ids from the Plan-01 spine; update the `assert len`), then `python scripts/build_entity_bridge.py` (idempotent UPSERT) to populate `canonical_entities` + `same_as` for Helio. Verify with `python scripts/verify_entity_bridge.py`.
2. **Gap 2 (Q9 null _id):** harden `runAgent`/envelope assembly in `agent/src/agent.ts` to strip null elements from each `retrievalPath._ids` (and any null citation `_id`) before parse — a robustness guard, NOT a gate loosen; D-06 files stay untouched.
3. Then re-run `npx tsx scripts/eval-gate.ts` twice for stability. The vector-index fix, data, view, and gate thresholds are all already correct.

## Next Phase Readiness

- **KG data is clean and correct** (139 docs, 3 accounts attributed: northwind=40, meridian=61, helio=38; 0 null attribution) — the data side of SC-1/SC-3 is DONE.
- **The authorized vector-index drop+recreate is shipped and self-healing** (Stage 6.6 committed `d1725c4`); the orphaned segment is cleared, the hybrid-spike test PASSES, and the gate improved 9→4.
- **Two NON-infra gaps remain before a GREEN gate:** (1) extend `demo_critical.py` + re-run `build_entity_bridge.py` so Helio resolves in `canonical_entities` (Q13/Q14/Q15); (2) harden the agent to tolerate a model-emitted null `_id` in `retrievalPath` (Q9). Neither is infra; neither is a gate-threshold problem.

## SC Mapping (updated — post vector-index fix)

| SC | Status | Evidence |
|----|--------|----------|
| SC-1 (3rd account materialized) | DONE | manifest 139 docs incl. helio=38; structured Helio vertices loaded (Account c2de4d08 + Contact=3/Opp=5/Contract=3/UsageFact=10/NPS=7); KG attributed all 3 accounts. |
| SC-2 (linter green, near-miss RAN) | DONE | full linter 33 passed, near-miss guards PROVEN ran (0 skipped) — commit da78e51. |
| SC-3 (≥1 C dual-graph answerable e2e) | **BLOCKED** | Q13/Q14/Q15 refuse — Helio is absent from `canonical_entities` so entityLookup cannot resolve "Helio Retail" (Gap 1, data-bridge); needs demo_critical.py + build_entity_bridge.py extension. NOT infra; the vector path is now clean. |
| SC-4 (existing deepened, no linter regression) | DONE | linter green after deepening. |
| SC-5 (eval gate GREEN after data change) | **BLOCKED RED (4 failures, down from 9)** | Vector-index fix recovered Q2/Q12/Q5 + both hybrid tests (the materialize error is GONE). Residual 4 = Q13/Q14/Q15 (Helio bridge gap, Gap 1) + Q9 (model-emitted null `_id` in retrievalPath, Gap 2). Both NON-infra, NON-faithfulness-regression; D-06 git diff clean. |

## Probe / Scaffold Retention

- `scripts/run_linter_gate.py`, `scripts/verify_kg_loaded.py`, `scripts/refresh_chunks_view.py` — RETAINED (re-usable gates / standalone view applier; the view applier is the standalone twin of build Stage 6.5).
- `scratchpad/rebuild_vector_index.py` — REMOVED. Its logic now lives, faithfully (capture-then-recreate with the live params, including the trainingIterations/defaultNProbe the staged copy omitted), in build Stage 6.6 (`stage_rebuild_vector_index`), so the scratchpad staging copy is no longer needed.
- Session isolation probes (`scratchpad/probe_q.ts`, `scratchpad/probe_q9.ts`, arangojs/python vector+BM25 probes) were throwaway and have been deleted; they are not shipped.

## Self-Check: PASSED

- FOUND: scripts/build_unstructured.py (Stage 6.6 added), scripts/verify_kg_loaded.py, scripts/refresh_chunks_view.py, 09-03-SUMMARY.md
- FOUND: commits 5240b0a (build patch), cd61d89 (rebuild + verify), 1d93bc8 (view link-refresh), 5dc0f74 (full view drop+recreate + vector diagnosis), d1725c4 (Stage 6.6 vector-index self-heal)
- D-06 LOCKED verified: git diff clean on scripts/eval-gate.ts, agent/test/questions.eval.test.ts, agent/test/hybridSpike.test.ts.
- VECTOR fix verified live: vector_cosine dropped+recreated with faithful captured params (new id 285285073, retrained to training_state=ready); APPROX_NEAR_COSINE materialized 32 live chunks 8/8; the failing hybridSpike "fuses vector + BM25" test now PASSES; eval gate 9→4 failures.
- Residual diagnosis verified live (NON-infra): `canonical_entities` has 2 orgs (Meridian/Northwind) + NO Helio → Q13/Q14/Q15 correctly refuse; Q9 throws `retrievalPath._ids` null on the model-authored path. Helio structured records ARE loaded (so the only gap is the bridge).
- (Task 3 eval-gate GREEN intentionally NOT claimed — RED at 4; blocked on two NON-infra gaps surfaced per the on_blocker contract. No fabricated green; no loosened gate.)

---
*Phase: 09-data-depth-3rd-account*
*Completed (partial — vector-index fix shipped; blocked at eval gate on two NON-infra gaps): 2026-06-23*
