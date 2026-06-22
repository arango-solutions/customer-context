# Phase 9: Data Depth & 3rd Account - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 09-data-depth-3rd-account
**Areas discussed:** 3rd account arc, New question arc, Doc deepening (DATA-05), Distinctness/identity

---

## 3rd Account Arc

| Option | Description | Selected |
|--------|-------------|----------|
| Churn / at-risk (downgrade) | Contraction arc: declining usage, downgrade/non-renewal risk, escalating negative sentiment | ✓ (final) |
| New-logo fast expansion | Recent land, rapid multi-product expansion (2024→2025) | (initially picked, then reconsidered) |
| Stalled POC / never-converted | Long eval, technical wins, never signs | |

**User's choice:** Initially **fast expansion**, then asked to "change the scope, pick something new." Claude recommended **churn / at-risk** (cleaner contrast vs A's expansion, lowest near-miss-guard risk, completes the expand/hold/save portfolio). User: "ok sure run it."
**Notes:** Fast-expansion was set aside because it overlaps thematically with Northwind (A) and risked tripping the empirical near-miss guard. Churn arc must also stay distinct from Meridian's (B) *sentiment-risk-on-green-usage* framing — C is **usage+revenue contraction**.

---

## New Question Arc

| Option | Description | Selected |
|--------|-------------|----------|
| 1 flagship, added to locked gate | One dual-graph Q for C, enforced by the gate | |
| 2–3 questions, added to locked gate | Flagship + follow-up + structured-only anchor, all gated | ✓ |
| 1 flagship, kept separate from gate | Defined + answerable but not in the locked gate | |

**User's choice:** **2–3 questions, added to the locked gate.** Reaffirmed via "I still want to scale up."
**Notes:** Flagship reframed from churn-diagnosis to fit the chosen arc: "Is Account C at risk of churning, and why?" New dual-graph Qs must pass the empirical near-miss guard and hold FAITHFULNESS_FLOOR=0.6.

---

## Doc Deepening (DATA-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted: citation-bearing docs only | Enrich only docs current answers cite | |
| Broad: all 8 source modules | Deepen all 8 account×source modules for both accounts; full regen | ✓ |
| Unstructured-only deepening | Deepen slack/docs/email/pdf only | |

**User's choice:** **Broad — all 8 modules × both existing accounts.** Reaffirmed via "I still want to scale up" (Claude had proposed trimming to targeted; user kept it broad).
**Notes:** Implies full regen + full linter sweep + eval-gate re-verify (SC-5).

---

## Claude's Discretion

- Exact Account C name + specific vertical (distinct from Analytics/Logistics; must clear near-miss guard) — suggested e-commerce/retail recommendation-graph use case.
- Exact wording of the 2–3 new C questions.
- Per-module depth ceiling for deepening (bounded by linter-green + no new hallucination surface).
- Plan decomposition / wave structure (large phase, likely 3 plans).

## Deferred Ideas

- Fast new-logo expansion arc (too close to Northwind).
- Stalled POC / never-converted arc (thinner structured data; possible future 4th account).
- Cross-account comparison flagship question (high wow, harder to keep deterministic across 3 accounts).
