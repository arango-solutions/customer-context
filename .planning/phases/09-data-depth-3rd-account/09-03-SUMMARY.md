---
phase: 09-data-depth-3rd-account
plan: 03
subsystem: database
tags: [arangodb, autograph, knowledge-graph, arangosearch, bm25, vector-index, entity-bridge, eval-gate, vitest, ai-sdk]

# Dependency graph
requires:
  - phase: 09-01
    provides: Account C (Helio) spine + entity registry + Q13/Q14/Q15 wired into linter & locked eval gate
  - phase: 09-02
    provides: deepened N/M prose + all-account structured record richness (EDIT-lane content edits)
  - phase: 08-deterministic-eval-harness
    provides: scripts/eval-gate.ts GREEN/RED classifier + questions.eval.test.ts FAITHFULNESS_FLOOR 0.6 (D-06 locked)
provides:
  - Self-cleaning build_unstructured.py (Stage 3.5 Layer-3 truncate + Stage 6.5 view drop+recreate + Stage 6.6 vector-index drop+recreate)
  - One full fresh clean KG rebuild — 139 docs (3 accounts), zero stale-doc contamination, all attributed
  - Canonical entity bridge extended for Account C (Helio): 12-id demo-critical set; 13 hubs / 43 same_as edges; entityLookup("Helio Retail") resolves
  - Agent answerability robustness: prepareStep force-tool-retrieval guard + null-_id strip in retrievalPath (no D-06 contract loosen)
  - Phase 8 eval gate GREEN x2 (89/89) over the live env — all 9 locked questions pass (6 existing + 3 Helio)
affects: [10-answer-provenance-edge-enrichment, 11-graph-viz, 12-cdc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-first Layer-3 rebuild: truncate the 5 AutoGraph-derived collections (allowlist-guarded) before orchestrate so a full rebuild writes fresh into empty collections instead of appending."
    - "Post-orchestrate ArangoSearch view + HNSW vector-index self-heal (Stage 6.5 / 6.6): a delete-first rebuild's fresh chunk _ids re-index cleanly instead of leaving the BM25 view / vector segments pointing at pre-truncate _ids."
    - "Force-retrieve agent guard: prepareStep sets toolChoice:'required' until >=1 tool has run, so an Output.object planner cannot emit its plan-preamble as a zero-grounding final answer."
    - "Filter-don't-loosen: tolerate model-emitted null _ids at the synthesis boundary, strip them at the merge chokepoint — the canonical RetrievalPathFragment contract (_ids: string[]) stays intact."

key-files:
  created:
    - scripts/refresh_chunks_view.py
  modified:
    - scripts/build_unstructured.py
    - scripts/verify_kg_loaded.py
    - scripts/demo_critical.py
    - scripts/build_entity_bridge.py
    - agent/src/agent.ts
    - agent/src/retrievalPath.ts

key-decisions:
  - "Option C executed: patch build_unstructured.py self-cleaning (delete-first) + run a fresh full rebuild, rather than hand-truncate."
  - "Layer-3 truncate / view / vector self-heal are hardcoded to allowlists with a customer360_ prefix re-assertion — they can never touch the structured graph."
  - "Account C canonical entity ids sourced verbatim from the Plan-01 spine (canonical_uuid('helio',...) / HELIO_ACCOUNT_ID) — NOT invented; the demo-critical denominator lifts 9->12."
  - "Q9/Q14 answerability fixed by a prepareStep force-retrieve guard (agent-robustness lane), NOT by loosening the locked gate or faithfulness floor (D-06 intact)."

patterns-established:
  - "Delete-first (UPDATE-PIPELINE.md line 77): purge Layer-3 before re-orchestrating to sidestep the importer's additive-vs-wipe ambiguity."
  - "The canonical entity bridge is part of materialization, not just spine authoring — a new account must extend demo_critical.py + re-run build_entity_bridge.py or it will correctly refuse."

requirements-completed: [DATA-04, DATA-05]

# Metrics
duration: ~3h cumulative across continuations (this final continuation ~40min)
completed: 2026-06-23
---

# Phase 9 Plan 03: Data Depth & 3rd Account — Materialize + Validate (DONE — eval gate GREEN x2, 89/89)

**Closed the phase gate: a single full clean KG rebuild (139 docs, 3 accounts) plus a complete fix chain — Layer-3 truncate -> ArangoSearch view drop+recreate -> HNSW vector-index drop+recreate -> Account-C canonical entity bridge -> model-null-_id strip -> force-tool-retrieval guard — takes the Phase 8 eval gate from 9 confirmed failures to GREEN x2 (89/89), with all 9 locked questions (6 existing N/M + 3 Helio) answering end-to-end, reconciliation true, groundingScore 1.0, faithfulness >= 0.6, and the D-06 contract untouched.**

## Performance

- **Duration:** ~3h cumulative across continuations; this final continuation ~40 min (Gap 1 bridge + Gap 2 null-strip + force-retrieve guard + 2 gate runs).
- **Tasks:** Task 1 (regen + linter) DONE; Task 2 (structured + KG rebuild) DONE; Task 3 (eval gate) DONE — GREEN x2.
- **Files modified (this continuation):** 4 (demo_critical.py, build_entity_bridge.py, agent/src/agent.ts, agent/src/retrievalPath.ts).

## Accomplishments

- **Account C canonical entity bridge (Gap 1).** Helio's structured records were loaded but `canonical_entities` held only the 2-account world, so `entityLookup("Helio Retail")` returned empty and the agent correctly refused Q13/Q14/Q15. Extended `scripts/demo_critical.py` from 9 -> 12 demo-critical ids — Helio Retail org (`c2de4d08-b3cf-5958-aae8-4ef84ebb81c9`), champion Priya Nair (`d4ca7052-80af-5650-803c-00d6aaf9bb6f`), at-risk downgrade contract (`ee5fd2b7-7511-520d-8814-305a858aa22d`) — all sourced verbatim from the Plan-01 spine (`canonical_uuid("helio",...)` / `HELIO_ACCOUNT_ID`). Widened `build_entity_bridge.py`'s alias-dict + entity->account + display-name helpers to include the Helio structured JSON (were northwind/meridian-only). Re-ran the idempotent additive UPSERT: **13 hubs / 43 same_as edges**; `verify_entity_bridge.py --full` GREEN (**12/12 fully linked**, no double-resolution, bijection OK, trace OK). `entityLookup("Helio Retail")` now resolves the canonical hub with `account_id c2de4d08`.
- **Model-emitted null _id (Gap 2).** `askQuestion` was throwing `retrievalPath[..]._ids[..]: expected string, received null` before grounding. Made `SynthRetrievalPath._ids` `z.array(z.string().nullable())` at the synthesis boundary (same strict-mode pattern as `traversal`), stripped nulls in `toCanonicalEnvelope`, and hardened `mergeRetrievalPaths` to drop null/undefined at the single merge chokepoint — so the canonical `RetrievalPathFragment` contract (`_ids: string[]`) stays intact and the downstream `EnvelopeSchema.parse` never throws.
- **Force-tool-retrieval guard (the real Q9/Q14 fix).** Stripping the null crash UNMASKED a deeper degenerate loop: with `Output.object` the planner could emit its "To answer this I will: 1... 2..." plan as the final answer with ZERO tool calls (returnedIds empty) — a non-refused, zero-grounding answer that fails the locked-question contract (Q9 mostly, Q14 consistently, Q8 intermittently). Added a `prepareStep` that forces `toolChoice:'required'` until at least one tool has actually run, then hands control back to the default auto loop. After the guard: Q9/Q14/Q8 all return refused=false, reconciliation=true, groundingScore=1.0, stable across probe runs. The 6 already-passing questions (which call tools on step 0 anyway) are unaffected.
- **Eval gate GREEN x2.** `npx tsx scripts/eval-gate.ts` run A: 89/89 PASS, GATE GREEN, exit 0. Run B: 88/89 on run-1 (a single Q9 faithfulness-judge flake at 0.5), 89/89 on run-2, GATE GREEN, exit 0 (flake-recovered by the gate's own 1-retry — the ~5% stochastic-judge residual, non-blocking).

## Task Commits

This continuation (atomic):

1. **Gap 1 — Account C entity bridge** — `5fff838` (fix) — demo_critical.py (9->12) + build_entity_bridge.py helper widening; re-ran the UPSERT.
2. **Gap 2 — null-_id strip** — `2f9b9c2` (fix) — SynthRetrievalPath._ids nullable + filter in toCanonicalEnvelope.
3. **Force-tool-retrieval guard + merge hardening** — `42061fd` (fix) — prepareStep toolChoice:'required' until >=1 tool runs; mergeRetrievalPaths strips null _ids.

Prior continuations (the infra fix chain):

4. **Self-cleaning build patch** — `5240b0a` (fix) — Stage 3.5 delete-first Layer-3 truncate.
5. **Fresh clean rebuild + hardened verify** — `cd61d89` (feat) — corpus `cb_1782167308_a2ffe336`, 139 clean docs.
6. **View link-refresh self-heal** — `1d93bc8` (fix) — Stage 6.5 chunks-view link drop+re-add + refresh_chunks_view.py.
7. **Authorized full view DROP+RECREATE + vector diagnosis** — `5dc0f74` (fix).
8. **Authorized HNSW vector-index drop+recreate (Stage 6.6)** — `d1725c4` (fix).

## Files Created/Modified

- `scripts/demo_critical.py` — extended the demo-critical set 9 -> 12 (3 Helio ids from the Plan-01 spine); lifted `assert len == 9` to `== 12`; updated docstring.
- `scripts/build_entity_bridge.py` — widened contact/account alias files + `_build_entity_to_account_map` + `_get_display_name_for_entity_id` to include the `helio` structured JSON.
- `agent/src/agent.ts` — `SynthRetrievalPath._ids` nullable; null-strip in `toCanonicalEnvelope`; `prepareStep` force-tool-retrieval guard.
- `agent/src/retrievalPath.ts` — `mergeRetrievalPaths` strips null/undefined `_ids` at the merge chokepoint.
- `scripts/build_unstructured.py` — (prior) Stage 3.5 truncate + Stage 6.5 view recreate + Stage 6.6 vector-index recreate.
- `scripts/verify_kg_loaded.py` — (prior) hardened clean-rebuild gate (~139 docs, zero null attribution, 3 accounts).
- `scripts/refresh_chunks_view.py` — (prior) standalone one-shot chunks-view link applier.

## Decisions Made

- Helio canonical ids taken verbatim from the spine, never invented — the deterministic `entity_id` namespace is the single source of truth (CLAUDE.md / D-01).
- Q9/Q14 fixed in the agent-robustness lane (force-retrieve guard), NOT by touching the locked gate, the faithfulness floor, or any assertion. The contract is satisfied by cleaning data (null strip) and fixing behavior (force retrieve), never by loosening the schema's `string` type.
- Contract display name "Helio Enterprise Downgrade 2024" chosen for the at-risk contract (the loaded record has no `contract_name`); it is descriptive and used only as the canonical hub `display_name`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Force-tool-retrieval guard for degenerate planner loop (Q9/Q14/Q8)**
- **Found during:** Task 3 (eval gate), after Gap 2's null strip removed the masking crash.
- **Issue:** With `Output.object`, the `ToolLoopAgent` planner could emit its plan-preamble as the final answer on step 0 with ZERO tool calls (returnedIds empty) — a non-refused, zero-citation, zero-grounding answer that fails the locked-question contract. Deterministic on Q14, frequent on Q9, intermittent on Q8.
- **Fix:** Added a `prepareStep` that forces `toolChoice:'required'` until >=1 tool has run, then hands back to the default auto loop.
- **Files modified:** agent/src/agent.ts
- **Verification:** Q9/Q14/Q8 all refused=false, reconciliation=true, groundingScore=1.0, stable across runs; eval gate GREEN x2.
- **Committed in:** `42061fd`

**2. [Rule 1 - Bug] mergeRetrievalPaths null-_id hardening**
- **Found during:** Task 3, while closing Gap 2.
- **Issue:** A null could survive into the merged `retrievalPath` (model- or tool-side) and crash `EnvelopeSchema.parse`.
- **Fix:** Strip null/undefined `_ids` at the single merge chokepoint.
- **Files modified:** agent/src/retrievalPath.ts
- **Verification:** No throw across 5 consecutive Q9 probe runs; gate GREEN x2.
- **Committed in:** `42061fd`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs surfaced by Gap 2). Plus the planned-but-not-yet-built Plan-01 entity-bridge miss closed at materialization (see Learning).
**Impact on plan:** All fixes necessary for the eval gate to answer the locked questions correctly. No scope creep — every change is in the data/spine or agent-robustness lane the plan's on_blocker contract designates; the D-06 gate is untouched.

## Plan-01 Entity-Bridge Miss — Learning

Plan 01 wired Account C into the spine, the linter, and the locked eval gate, but did NOT build the canonical entity bridge for it — `scripts/demo_critical.py` was hardcoded to the old 9-id / 2-account set and `scripts/build_entity_bridge.py` was never extended/re-run for Helio. The canonical bridge is part of *materialization*, not just spine authoring: without a `canonical_entities` hub, `entityLookup` cannot move from a prose name to an id, so the agent correctly refuses. Closing it here (idempotent additive UPSERT) was the right place, but the learning for future account additions is: **adding an account is not done until demo_critical.py is extended and build_entity_bridge.py is re-run and verified.**

## Issues Encountered

- The objective's diagnosis (Q9 = null _id only; Q14 = bridge only) was incomplete: the null strip and the bridge were necessary but not sufficient. The null crash had been *masking* a degenerate planner loop that affected Q9/Q14 and intermittently Q8. The force-retrieve guard was the missing piece; once added, the gate went fully GREEN. Resolved entirely within the agent-robustness lane — no gate loosening, no infra.
- A standalone `hybridRetrieve` probe hit `OpenAI embeddings failed: HTTP 401` (the known stale-shell `OPENAI_API_KEY` …5CAA gotcha) — a probe-only artifact; the real agent runs `loadEnv()` (dotenv override) first, so the live gate is unaffected.

## User Setup Required

None - no new external service configuration. Existing OPENAI_API_KEY / ARANGO_* from repo-root .env; AUTOGRAPH_PATH exported in-shell for the linter/embedding path.

## SC Mapping (final — eval gate GREEN x2)

| SC | Status | Evidence |
|----|--------|----------|
| SC-1 (3rd account materialized from spine + shared entity_id namespace) | DONE | manifest 139 docs incl. helio=38; Helio structured Account/Contact/Opp/Contract/UsageFact/NPS loaded; canonical hubs for Helio org/champion/contract sourced from the spine. |
| SC-2 (linter green, near-miss guard RAN) | DONE | full linter green, near-miss guards PROVEN ran (0 skipped) — commit da78e51 (run_linter_gate.py exit 0). |
| SC-3 (>=1 C dual-graph answerable e2e) | DONE | Q13 (helio dual) PASS — reconciliation true, groundingScore 1.0, faithfulness >= 0.6; Q14 also PASS after the force-retrieve guard. |
| SC-4 (existing deepened, no linter regression) | DONE | linter green after deepening. |
| SC-5 (eval gate GREEN after data change) | DONE | `npx tsx scripts/eval-gate.ts` GREEN x2 (run A 89/89; run B 88/89 run-1 -> 89/89 run-2 flake-recovered). All 6 existing locked questions (Q7/Q2/Q12/Q9/Q5/Q8) NOT corrupted; all 3 Helio questions (Q13/Q14/Q15) answer e2e. D-06 git diff clean. |

## Probe / Scaffold Retention

- `scripts/run_linter_gate.py`, `scripts/verify_kg_loaded.py`, `scripts/refresh_chunks_view.py`, `scripts/verify_entity_bridge.py` — RETAINED (re-usable gates / standalone appliers; verify_entity_bridge is the durable D-04/D-05 bridge gate).
- Session probes under `scratchpad/` (probe_q9/q14/q8, schema test, hybridRetrieve probe) — throwaway, deleted; not shipped.

## Next Phase Readiness

- Phase 9 is COMPLETE: 3 accounts materialized + deepened, KG clean (139 docs), canonical bridge covers all 3, eval gate GREEN x2 over the live env. DATA-04 + DATA-05 satisfied.
- The build is self-healing end-to-end (Stage 3.5 truncate + 6.5 view + 6.6 vector); a future clean rebuild re-greens automatically.
- WATCH (non-blocking): Q9 faithfulness LLM-judge occasionally scores 0.5 on a single run (flake-recovered by the gate's 1-retry) — the existing ~5% stochastic-judge residual, already tracked as a v2 blocker.

## Self-Check: PASSED

- FOUND: scripts/demo_critical.py (9->12), scripts/build_entity_bridge.py (helio helpers), agent/src/agent.ts (prepareStep guard + null strip), agent/src/retrievalPath.ts (null-strip merge), 09-03-SUMMARY.md.
- FOUND commits: 5fff838 (bridge), 2f9b9c2 (null strip), 42061fd (force-retrieve + merge), plus prior 5240b0a/cd61d89/1d93bc8/5dc0f74/d1725c4.
- D-06 LOCKED verified: git diff clean on scripts/eval-gate.ts, agent/test/questions.eval.test.ts, agent/test/hybridSpike.test.ts.
- Bridge verified live: verify_entity_bridge --full GREEN (12/12 fully linked, 13 hubs/43 edges); entityLookup("Helio Retail") resolves account_id c2de4d08.
- Eval gate GREEN x2 verified live: run A 89/89 exit 0; run B 88/89->89/89 (flake recovered) exit 0; all 9 locked questions PASS.

## Post-Review Fix — CR-01 (2026-06-23, commit f58e9cc)

Code review (`09-REVIEW.md`) flagged one CRITICAL: the 09-03 force-retrieve guard
(`prepareStep` `toolChoice:'required'` until ≥1 tool runs) was added ONLY to
`runAgent()`/`askQuestion()` (agent.ts), NOT to the streaming variant
`buildAgent()`/`askQuestionStream()` (stream.ts) — which is the path the live demo UI
hits (`web/app/api/ask/route.ts` → `askQuestionStream`). The eval gate exercises the
guarded `askQuestion` path only, so it stayed GREEN while the unguarded streaming path
could still emit the degenerate zero-tool plan-preamble answer (zero claims/citations,
`refused:false`) — the confident-but-unsourced shape this system exists to prevent.

**Fix (commit `f58e9cc`):**
- **Layer 1** — extracted `buildToolLoopAgent()` in `agent.ts` as the SINGLE source of
  truth for the planner ToolLoopAgent config (incl. the force-retrieve guard). Both
  `runAgent()` and `stream.ts::buildAgent()` now construct through it, so the streaming
  path carries the identical guard and the two paths cannot drift again.
- **Layer 2** — hardened `enforceGrounding()` so a NON-refused envelope that grounds
  nothing (zero grounded claims AND zero grounded citations) becomes a refusal BEFORE
  the fully-grounded passthrough. This closes the vacuous-pass (empty citations →
  groundingScore 1.0, empty claims → empty unsupportedClaims) at the shared terminal
  gate for all paths present and future. Legit grounded answers and existing explicit
  refusals (`refused:true`, e.g. the NoObjectGenerated decline) are unchanged.
- Tests: `grounding.test.ts` (c2) non-refused zero-grounding → refused; (c3) explicit
  refusal preserved unchanged. `stream.test.ts`: streaming terminal gate refuses a
  zero-tool plan-preamble run byte-for-byte equal to `enforceGrounding` direct.
- WR-04 intentionally skipped (existing convention keeps empty-`_ids` retrievalPath
  entries; changing it risks the byte-for-byte stream-test expectations for no benefit).

**Verification:** agent typecheck + build clean; `eval-gate.ts` GREEN + STABLE on two
consecutive runs (run A 92/92; run B 90/92 run-1 → 92/92 run-2, flake-recovered), all 9
locked questions PASS incl. Q14. D-06 locked files (`eval-gate.ts`,
`questions.eval.test.ts`, `hybridSpike.test.ts`, `FAITHFULNESS_FLOOR`) git-diff-clean.
`09-REVIEW.md` CR-01 marked RESOLVED.

---
*Phase: 09-data-depth-3rd-account*
*Completed: 2026-06-23*
