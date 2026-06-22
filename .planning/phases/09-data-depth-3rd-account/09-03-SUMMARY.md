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
  - Self-cleaning build_unstructured.py (guarded delete-first Layer-3 truncate before orchestrate)
  - One full fresh clean KG rebuild — 139 docs (3 accounts), zero stale-doc contamination, all attributed
  - Hardened verify_kg_loaded.py (asserts ~139 clean docs NOT 244, zero null module/account, 3 accounts attributed)
affects: [10-answer-provenance-edge-enrichment, 11-graph-viz, 12-cdc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-first Layer-3 rebuild: truncate the 5 AutoGraph-derived collections (allowlist-guarded) before orchestrate so a full rebuild writes fresh into empty collections instead of appending."

key-files:
  created: []
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

# Phase 9 Plan 03: Data Depth & 3rd Account — Materialize + Validate (PARTIAL — blocked at eval gate)

**Self-cleaning delete-first KG rebuild ships a genuinely clean 139-doc 3-account graph, but the eval gate is RED: the ArangoSearch BM25 view's inverted index holds stale references to the pre-truncate chunks, breaking unstructured retrieval; the view-link rebuild needed to fix it is outside the authorized scope.**

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
3. **Task 3: eval gate** — NOT committed (RED — see Blocker)

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

## Issues Encountered — BLOCKER (eval gate RED)

**The eval gate (`npx tsx scripts/eval-gate.ts`) is RED: 8 confirmed failures. The gate and FAITHFULNESS_FLOOR were NOT modified — D-06 is intact (git diff on scripts/eval-gate.ts and agent/test/questions.eval.test.ts is clean).**

### Failing tests
- Q12 (centerpiece dual-graph), Q9 (dual), Q5 (dual) — existing locked questions
- Q13 (helio dual), Q14 (helio dual) — new C questions
- Q15 (helio structured-only anchor) — runs the full agent loop, which touches the broken hybrid tool during planning
- "Meridian-scoped sentiment query returns ≥1 correctly-sourced …" (unstructured retrieval)
- "fuses vector + BM25 (TS RRF) and traverses PART_OF to sourced Meridian RED chunks" (`hybridSpike.test.ts`)

### Root cause (diagnosed, NOT a data regression)
The two non-question tests pinpoint it. `hybridSpike.test.ts` fails with:

```
ArangoError: AQL: ... failed to materialize document _ltDk106--_ for collection s277302422:
NotFound: [MaterializeNode] ... (while executing)
```

`s277302422` is the internal collection backing the ArangoSearch view `customer360_chunks_search_view` (links `customer360_Chunks.content`, analyzer `text_en`). The authorized **Layer-3 truncate cleared `customer360_Chunks` and orchestrate re-inserted 139 fresh chunks with new `_id`s — but the ArangoSearch view's inverted index still holds dangling references to the pre-truncate chunks.** BM25 search ranks stale `_id`s that no longer materialize → every code path that touches unstructured retrieval (all dual-graph questions across all 3 accounts) throws.

This is NOT the Pitfall-3 lexical-bleed regression the plan warned about — those would surface as faithfulness/grounding-score drops, not AQL `NotFound` errors. The structured-only retrieval (Q7-style facets) all PASS; only the unstructured/hybrid view path is broken.

### The fix (requires authorization I don't have)
Rebuild the view's link so its inverted index re-indexes against the current 139 chunks:
```python
db.update_view('customer360_chunks_search_view', {'links': {'customer360_Chunks': None}})      # drop link
# settle
db.update_view('customer360_chunks_search_view', {'links': {'customer360_Chunks':
    {'fields': {'content': {'analyzers': ['text_en']}}, 'includeAllFields': False}}})           # re-add → full re-index
```
The auto-mode classifier **DENIED** this view reconfiguration on the shared prod cluster: the user authorized the Layer-3 truncate/rebuild, not view reconfiguration. So this requires explicit human authorization.

**Durable follow-up:** once authorized, fold the view-link rebuild into `build_unstructured.py` as a post-orchestrate Stage (Stage 6.5), so every delete-first rebuild also refreshes the ArangoSearch view — otherwise every future clean rebuild will reproduce this stale-index break.

## Next Phase Readiness

- KG data is clean and correct (139 docs, 3 accounts attributed) — the data side of SC-1/SC-3 is done.
- The eval gate cannot pass until the ArangoSearch view index is rebuilt (one-time authorized DDL on `customer360_chunks_search_view`, then re-run `npx tsx scripts/eval-gate.ts`). This is the only thing standing between the current state and a GREEN gate; the failure is infrastructural (stale view index), not a data or gate-threshold problem.

## Self-Check: PASSED

- FOUND: scripts/build_unstructured.py, scripts/verify_kg_loaded.py, 09-03-SUMMARY.md
- FOUND: commits 5240b0a (build patch), cd61d89 (rebuild + verify)
- (Task 3 eval-gate intentionally uncommitted — RED, blocked; documented above.)

---
*Phase: 09-data-depth-3rd-account*
*Completed (partial — blocked at eval gate): 2026-06-22*
