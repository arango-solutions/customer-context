---
status: complete
phase: 06-next-js-vercel-ui-sourcing-display
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md, 06-05-SUMMARY.md]
target: https://customer360-demo-jade.vercel.app (production)
started: 2026-06-19
updated: 2026-06-19
---

## Current Test

[testing complete]

## Tests

### 1. Cold-start smoke — fresh load returns a grounded answer
expected: Open https://customer360-demo-jade.vercel.app fresh, click the Q12 chip, Ask. Serverless boots, ArangoDB connects, OpenAI responds, and a grounded answer renders (no 500/timeout).
result: pass

### 2. Landing screen — free-form box + example chips (UI-01)
expected: The landing screen shows a headline, a multiline free-form question box with an "Ask" button, and 6 example-question chips — with "Usage green vs. sentiment red" (Q12) first and visually featured.
result: pass
note: Initially failed — clicking a chip gave no selected highlight (cosmetic). FIXED (1204072) + permanent-Q12-border follow-up (later commit); RE-VERIFIED on production: chips show a selected highlight on pick, deselect on edit, no permanent border.

### 3. Example chip fills the box (does not auto-submit)
expected: Clicking any example chip FILLS the question box with that full prompt but does NOT auto-submit — you still press Ask to run it.
result: pass

### 4. Streamed reasoning — no dead air (UI-03)
expected: After Ask, within ~1s a reasoning timeline appears and advances through phases (planning → querying both graphs → … → answer). No blank/frozen screen during the ~14–25s wait. A Stop affordance is available while streaming.
result: pass
note: Initially failed — timeline steps checked off out of order (minor; no-dead-air core passed). FIXED (46b134f) via monotonic phase advance; RE-VERIFIED on production: steps now check off top-to-bottom in order.

### 5. Numbered claims + dual-graph citation cards (SRC-01/02, UI-02)
expected: The final answer is prose with numbered claim markers [1], [2]…; a sourcing rail lists citation cards, each with a graph badge (green = structured / slate-blue = unstructured, with a text label — never color-only), a collection, and a record _id.
result: pass

### 6. Click-to-source — drawer shows _id + exact AQL (SRC-03/04)
expected: Clicking a claim's [n] marker (or a citation card) opens a source drawer scoped to that claim's citations, showing graph + collection + the exact _id + the exact AQL query (copy-enabled) + traversal — no extra loading/fetch.
result: pass

### 7. Q12 reconciliation correctness — contradiction explicit, both graphs (AGENT-05)
expected: The Q12 answer explicitly states the contradiction — Meridian's structured usage/NPS-score looks green/healthy, but the unstructured sentiment (Slack escalations, QBR notes, exec emails, NPS verbatim) is negative — and cites BOTH graphs.
result: pass

### 8. Graceful refusal on out-of-scope (honesty)
expected: Asking something the data can't support (e.g., an account not in the demo, or "what is the CEO's home address?") yields an honest refusal panel ("Cannot answer — and here's why") with the reason + any partial sourcing — NOT a confident fabricated answer.
result: pass
note: Verified with "CEO home address" — RefusalPanel rendered with honest reason (privacy-grounds refusal). Graceful refusal confirmed; no fabrication.

### 9. Graceful error/timeout state (UI-03)
expected: If a request errors or runs too long, a clear error/timeout state appears (with Try-again / Keep-waiting) instead of a crash or dead screen. (Skip if you can't readily trigger one.)
result: skipped
reason: Not readily triggerable on demand. (Error state was incidentally observed earlier this session on the pre-env-var deployment — "Something broke on the way to the graphs… Try again" — i.e. the ErrorState component does render on failure.)

## Summary

total: 9
passed: 8
issues: 0
pending: 0
skipped: 1
note: 2 issues found during UAT (chip highlight, timeline order) were fixed and RE-VERIFIED on production — now counted as passed.

## Gaps

- truth: "Clicking an example chip gives clear visual feedback (a selected/active highlight state on the chosen chip)."
  status: fixed
  reason: "User reported: the highlight does not work when you click on one of the questions"
  severity: cosmetic
  test: 2
  root_cause: "ExampleChips had only a static featured ring on Q12; no selected state tracked on click."
  fix: "Pass current input value; highlight the chip whose prompt matches (filled accent + aria-current), auto-deselect on edit. Commit 1204072. + permanent-Q12-border follow-up. + unit test."
  retest: verified (production)

- truth: "The reasoning-timeline phases check off in their logical order during streaming."
  status: fixed
  reason: "User reported: verified but the steps don't check-off in order (no-dead-air core passed)"
  severity: minor
  test: 4
  root_cause: "Parallel specialists' data-step events arrived out of canonical order; use-ask setPhase adopted each, dragging the timeline backward."
  fix: "STREAM_PHASE_ORDER single source of truth + laterPhase() monotonic guard in use-ask onData. Commit 46b134f."
  retest: verified (production)
</content>
