# Customer 360 Demo — Status Update

**Date:** June 16, 2026
**TL;DR:** Planning and technical de-risking are complete. We proved the riskiest part works *before* committing to the build, so the ~5–6 week timeline to a demo-ready product is now grounded in tested reality rather than hope. Build starts next.

---

## What we're building

A polished web dashboard where someone types a plain-English question about a customer — *"Is this account actually happy?"*, *"What did we promise them, and did we deliver?"* — and gets a correct answer that **shows its work**: every fact links back to the exact record and source it came from (a CRM entry, a contract, an email, a Slack thread).

The hard part, and the whole point, is **trust**. The system answers by combining two very different kinds of data:

- **Structured data** — the clean, tabular stuff: CRM records, usage metrics, contracts.
- **Unstructured data** — the messy human stuff: emails, Slack conversations, meeting notes, PDFs.

The signature moment: an account that looks perfectly healthy on every metric, where the system reads the emails and Slack threads and correctly flags that the customer is actually at risk. No dashboard of numbers can catch that. Ours can — and it cites exactly why.

It runs entirely on **our own Arango products**, including our newer GenAI tooling, so the demo doubles as a proof point for the product line. It uses 100% synthetic (invented) data — no real customer information.

---

## Architecture (in plain terms)

1. **A simple web page** with a question box — no special software, anyone on the team can run the demo.
2. **An AI assistant behind it** that reads the question, pulls the relevant records from both kinds of data, reasons across them, and writes a plain-English answer.
3. **Two connected datasets** stored in ArangoDB — one we model by hand (the structured data), one built automatically by our own GenAI tooling (the unstructured data).
4. **Full traceability** — the assistant can't just assert things; every claim is tied to the source it came from. This is what prevents a confident-but-wrong answer in front of an audience.

We deliberately chose an approach that avoids servers to babysit and keeps the whole thing on infrastructure the team already shares.

---

## Timeline

Estimated **~5–6 weeks** to demo-ready (~4–5 if the build phases go smoothly). This is a single-builder effort with heavy AI assistance.


| Phase                                 | What it delivers                        | Status |
| ------------------------------------- | --------------------------------------- | ------ |
| 1. Research & validate approach       | Confirmed the architecture works        | ✅ Done |
| 2. Build the synthetic dataset        | Realistic, consistent invented data     | ▶ Next |
| 3. Build the two datasets in ArangoDB | The structured + unstructured data      | —      |
| 4. Connect them                       | So the same customer links across both  | —      |
| 5. Build the AI assistant             | The reasoning + sourcing engine         | —      |
| 6. Build the web dashboard            | The question box + answer/sources view  | —      |
| 7. Test & harden for live demo        | Accuracy checks, rehearsal, backup plan | —      |


The longest pole is Phase 5 (the AI assistant) — it's the most novel part. The timeline reflects that.

---

