---
phase: 10
slug: answer-provenance-edge-enrichment
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-23
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — `agent/test/`) |
| **Config file** | `agent/vitest.config.ts` (existing) |
| **Quick run command** | `cd agent && npx vitest run test/retrievalPath.test.ts test/envelope.test.ts` |
| **Full suite command** | `cd agent && npx vitest run` |
| **Phase gate (LOCKED)** | `npx tsx scripts/eval-gate.ts` — must stay GREEN (D-06; never edit to pass) |
| **Estimated runtime** | ~10s unit / eval-gate longer |

---

## Sampling Rate

- **After every task commit:** Run quick run command (touched test files)
- **After every plan wave:** Run full unit suite (`cd agent && npx vitest run`)
- **Before `/gsd-verify-work`:** Full unit suite green AND `npx tsx scripts/eval-gate.ts` GREEN
- **Max feedback latency:** ~10 seconds (unit)

---

## Per-Task Verification Map

*Populated by the planner — every task touching edge enrichment maps to a unit assertion (edge merge, D-04 no-fabrication guard, `returnedIds` non-leak) plus the locked eval gate as the additivity proof (SC-5).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-T1 | 10-01 | 1 | VIZ-01 | — | `RetrievalPathEdge` Zod + `edges[]` on fragment; tsc clean | unit | `cd agent && npx vitest run test/envelope.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 10-01-T2 | 10-01 | 1 | VIZ-01 | fabrication / grounding-leak | edge merge drops no sourced edge; D-04 guard; `returnedIds` non-leak | unit | `cd agent && npx vitest run test/retrievalPath.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-T1 | 10-02 | 2 | VIZ-01 | fabrication | PART_OF + hybrid edges grounded to AQL-returned edges/chunk_ids | unit | `cd agent && npx vitest run` | ✅ | ⬜ pending |
| 10-02-T2 | 10-02 | 2 | VIZ-01 | fabrication | same_as edge grounded; INBOUND `_from` = leaf verbatim | unit | `cd agent && npx vitest run` | ✅ | ⬜ pending |
| 10-03-T1 | 10-03 | 2 | VIZ-01 | fabrication | structural edges deterministic, never `kind:'traversed'` | unit | `cd agent && npx vitest run` | ✅ | ⬜ pending |
| 10-03-T2 | 10-03 | 2 | VIZ-01 | grounding-leak | edge `_id`s never enter `returnedIds`; eval gate GREEN | gate | `npx tsx scripts/eval-gate.ts` | ✅ | ⬜ pending |
| 10-03-T3 | 10-03 | 2 | VIZ-01 | — | streaming path carries `edges[]` (manual smoke-test) | manual | streaming UI live question | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `agent/test/retrievalPath.test.ts` — edge merge (no sourced edge dropped), D-04 no-fabrication guard (`kind:'traversed'` ⊆ edges actually returned by AQL), `returnedIds` non-leak
- [ ] Extend `agent/test/envelope.test.ts` — `RetrievalPathEdge` Zod shape + `edges[]` on `RetrievalPathFragment`

*No new framework — vitest already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Streaming path carries `edges[]` end-to-end | VIZ-01 | Eval gate exercises non-streaming path only (per memory: agent-loop changes must be smoke-tested in streaming UI) | After enrichment, run a live question via the streaming UI and confirm `retrievalPath[].edges[]` is present and honestly labeled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
