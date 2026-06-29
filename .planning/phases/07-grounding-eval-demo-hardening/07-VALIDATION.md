---
phase: 7
slug: grounding-eval-demo-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Note: in this phase the **eval suite IS partly the deliverable** (EVAL-01) — so "validation"
> here means both (a) how we sample feedback while building, and (b) how we prove the
> grounding eval + canary/cron themselves work.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 (existing, `agent/`) |
| **Config file** | `agent/vitest.config.ts` (existing); web uses `web/` vitest project |
| **Quick run command** | `npm test -w customer360-agent` (unit) |
| **Full suite command** | `npm test -w customer360-agent && npm test -w customer360-web` |
| **Live eval command** | `npm test -w customer360-agent -- questions.eval` (hits OpenAI + ArangoDB live) |
| **Estimated runtime** | unit ~2s; live eval ~30–90s (6 questions × agent round-trip + judge) |

---

## Sampling Rate

- **After every task commit:** Run the quick unit command (`npm test -w customer360-agent`).
- **After every plan wave:** Run the full suite.
- **Before `/gsd-verify-work`:** Full suite green AND the live `questions.eval` green (faithfulness === 1.0 over the 6 locked questions + refusal variants).
- **Max feedback latency:** ~90 seconds (live eval is the slow path; unit feedback is ~2s).

---

## Per-Task Verification Map

> Filled concretely by the planner. Skeleton below maps the known deliverables.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-0X-01 | faithfulness judge | 1 | EVAL-01 | T-07-0X / — | Judge is advisory; deterministic `_id` gate stays authoritative; judge never on runtime path | unit + live | `npm test -w customer360-agent -- faithfulness` | ❌ W0 | ⬜ pending |
| 07-0X-02 | extended eval | 1 | EVAL-01 | — | Refusal variants must refuse, never fabricate | live | `npm test -w customer360-agent -- questions.eval` | ✅ (extend) | ⬜ pending |
| 07-0X-03 | /api/canary | 2 | EVAL-02 | T-07-0X (env/secret disclosure) | CRON_SECRET-gated; no secret in body; generic 500 | integration | canary curl + `vercel logs` | ❌ W0 | ⬜ pending |
| 07-0X-04 | vercel cron pre-warm | 2 | EVAL-02 | — | Cron bypasses SSO; warms fn + arangojs singleton | manual + log | `vercel.json`/`vercel.ts` cron + log check | ❌ W0 | ⬜ pending |
| 07-0X-05 | rehearsal script | 3 | EVAL-02 | — | N concurrent /api/ask degrade gracefully; adversarial → refuse | script | `scripts/rehearse.ts` output | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Create `CRON_SECRET` env var (Vercel project + local `.env`) — the one missing env the canary/cron need (research A-finding).
- [ ] `agent/test/faithfulness.test.ts` (or co-located) — stubs for the LLM-judge entailment unit checks.
- [ ] Extend `agent/test/questions.eval.test.ts` — add adversarial/refusal variants to the existing 6-question suite.
- [ ] No new framework install — vitest already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cron actually fires on schedule on Vercel | EVAL-02 | Vercel-side scheduler; can't unit-test the platform | After deploy, check `vercel logs --project customer360-demo --no-branch` for periodic canary hits |
| Pre-warm reduces cold-start latency before a live run | EVAL-02 | Timing observation on the real deploy | Manual warm + observe first /api/ask latency |

*Live-eval and canary behavior ARE automated; only the Vercel scheduler firing + cold-start timing are manual.*

---

## Validation Sign-Off

- [ ] All tasks have an automated verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (CRON_SECRET, faithfulness stubs)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
</content>
