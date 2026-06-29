# Phase 7: Grounding/Eval + Demo Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 07-grounding-eval-demo-hardening
**Areas discussed:** Eval method, Backup path, External access, Rate-limit

---

## Eval harness + claim-entailment method (EVAL-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Phase-5 eval + add LLM-judge entailment | Keep the 6-question eval (+ adversarial/refusal), add atomic-claim decomposition + LLM-judge semantic entailment on top of the deterministic `_id`-grounding gate | ✓ |
| Deterministic `_id`-grounding only | Rely solely on the existing grounding gate + regression assertions | |
| New standalone eval harness | Build a fresh eval separate from Phase-5 tests | |

**User's choice:** Extend Phase-5 eval + add LLM-judge entailment.
**Notes:** Matches EVAL-01 literally ("entailed by the retrieved records"). Deterministic `_id` gate stays the hard floor; LLM-judge is additive.

---

## Backup path → reframed as health/canary signal (EVAL-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Both — fixture replay + recorded screencast | Offline UI mode + recorded headline moments | |
| Scripted offline/fixture replay only | Cluster-free replay mode | |
| Recorded screencast only | Polished recording as the floor | |
| Defer backup; build a health/canary signal instead | No backup now; deepen /api/health to hit DB + run one end-to-end canary; eval gate = green/red signal | ✓ |

**User's choice:** (after discussion) Defer backup; build a health/canary signal instead.
**Notes:** User pushed back — "I'm not sure if we should even have a backup. This is still in dev. I want to know when things are working." Reframed: in dev, surface failures (signal) rather than hide them (fallback). Recorded/fixture backup deferred to a pre-demo checklist when a demo date is set.

---

## External access

| Option | Description | Selected |
|--------|-------------|----------|
| Keep SSO, present from your logged-in session | Zero infra change; presenter-driven screen-share | ✓ |
| Attach a custom domain | Vercel exempts custom domains from SSO | |
| Protection-bypass share link | Time-boxed bypass secret | |

**User's choice:** Keep SSO, present from logged-in session.
**Notes:** Internal/presenter-driven demo; no public surface.

---

## Rate-limit on /api/ask

| Option | Description | Selected |
|--------|-------------|----------|
| Skip for v1 — keep the accepted-risk deferral | Bounded by stepCountIs(12) + maxDuration=60; no public surface under SSO | ✓ |
| Add a simple per-IP rate-limit now | In-memory/Upstash per-IP limit | |

**User's choice:** Skip for v1.
**Notes:** Consistent with the SSO/presenter-driven access choice. Re-open only if access becomes a public custom domain.

---

## Claude's Discretion

- Eval file layout / claim-decomposition structure (per-claim vs. batched judge calls), judge model id + temperature, pre-warm cron cadence, exact canary endpoint shape. Deterministic `_id` gate stays the non-negotiable floor.

## Deferred Ideas

- Recorded/scripted backup path — until a real demo date is set.
- `/api/ask` per-IP rate-limit (AR-06-2) — until/unless access becomes public.
- Custom domain / public access — not for v1.
- Cross-graph subgraph viz — backlog 999.1, post-v1.
</content>
