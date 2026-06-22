---
phase: 09
slug: data-depth-3rd-account
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 09-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (data linter)** | pytest (`data_gen/linter/pytest.ini`) |
| **Framework (eval gate)** | Vitest via `npx tsx scripts/eval-gate.ts` (filters `questions.eval`) |
| **Quick run command** | `pytest data_gen/linter/ -k "not near_miss"` (fast, no API) |
| **Full suite command** | `AUTOGRAPH_PATH=… pytest data_gen/linter/ -v` then `npx tsx scripts/eval-gate.ts` |
| **Estimated runtime** | linter (quick) ~seconds; full linter + eval gate minutes (live ArangoDB + OpenAI embeddings) |

**Environment required for empirical tests:** `OPENAI_API_KEY` + `ARANGO_*` (repo-root `.env`); near-miss guard ALSO needs `AUTOGRAPH_PATH` (shell-only — NOT in `.env`, which has only `AUTOGRAPH_URL`). Both `test_near_miss_guard.py` and the eval gate `pytest.skip` / no-op **silently** when env is absent — validation MUST assert the empirical tests RAN, not merely "passed."

---

## Sampling Rate

- **After every task commit:** Run `pytest data_gen/linter/ -k "not near_miss"`
- **After every plan wave:** Run full linter incl. near-miss guard (assert it RAN, not skipped)
- **Before `/gsd-verify-work`:** Full linter GREEN **and** `scripts/eval-gate.ts` GREEN (SC-5)
- **Max feedback latency:** quick linter < ~30s

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| DATA-04 | C structured records present (anchor) | unit (linter) | `pytest data_gen/linter/test_answerability.py -k helio` | ❌ W0 (add C test fns) |
| DATA-04 | C dual-graph signal out-ranks distractors | empirical (RRF) | `AUTOGRAPH_PATH=… pytest data_gen/linter/test_near_miss_guard.py -k q13` | ❌ W0 (add C guard test) |
| DATA-04 | C referential integrity / chronology / cross-source | unit (linter) | `pytest data_gen/linter/test_referential_integrity.py test_chronology.py test_cross_source_agreement.py` | ✅ (account-agnostic) |
| DATA-04 | C modules ∈ MODULE_NAMES / field stamps | unit (linter) | `pytest data_gen/linter/test_field_stamps.py` | ✅ (after widening BOTH `MODULE_NAMES`) |
| DATA-04 | C questions answer end-to-end (struct+unstruct) | integration (eval) | `npx tsx scripts/eval-gate.ts` (C `it()` blocks) | ❌ W0 (add C eval tests) |
| DATA-05 | Existing accounts deepened, no linter regression | unit (linter) | `AUTOGRAPH_PATH=… pytest data_gen/linter/ -v` | ✅ |
| DATA-05 / SC-5 | Existing 6 answers not corrupted | integration (eval) | `npx tsx scripts/eval-gate.ts` | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data_gen/spine/spine_helio.py` — Account C spine (DATA-04)
- [ ] `data_gen/spine/entity_registry.py` — `HELIO_ACCOUNT_ID` + 4 `helio_*` entries in `MODULE_NAMES`
- [ ] `data_gen/generate.py` — import + append `HELIO_SPINE` to `_SPINES`
- [ ] `data_gen/linter/conftest.py` — widen the **duplicated** `MODULE_NAMES` + `QUESTION_IDS` (missing this fails `test_module_names_valid`)
- [ ] `data_gen/linter/test_answerability.py` — add C question test functions
- [ ] `data_gen/linter/test_near_miss_guard.py` — add C `QUESTION_TEXTS` + `test_near_miss_guard_q*`
- [ ] `agent/test/questions.eval.test.ts` — add C `it()` blocks (+ optional `QC_ANCHOR_PROMPT` in `agent/src/index.ts`)
- [ ] `scripts/eval-gate.ts` — add C labels to `LOCKED_QUESTION_LABELS`
- [ ] Pre-flight: export `AUTOGRAPH_PATH`; delete iCloud `" 2"`/`" 3"` dup dirs before regen

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| New C vertical/arc is "demo-credible" prose | DATA-04/05 | Subjective prose quality beyond linter's structural checks | Read a sample of C's slack/email/docs + deepened A/B docs; confirm coherent multi-year narrative |
| Empirical near-miss guard actually executed | DATA-04 | Guard `pytest.skip`s silently without `AUTOGRAPH_PATH`+`OPENAI_API_KEY` | Confirm pytest output shows the C guard tests as PASSED (not skipped) |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Empirical tests assert RAN (not silently skipped)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
