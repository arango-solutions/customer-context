# Customer 360 — Demo Strategy & Positioning

> **Purpose of this file:** Capture the positioning, purpose, and development priorities
> for the Customer 360 demo so they can be referenced in any session. This is the *sales/strategy*
> lens that should frame technical decisions — it is not an implementation spec.
> Last updated: 2026-06-25.

---

## 1. What this actually is

This is a **sales demo / art-of-the-possible** — NOT a product, and NOT (yet) a POC.

- **Demo (what this is):** runs on *synthetic* data we control; proves what's *possible*; job is
  to create desire + credibility. Success = the buyer leans forward and wants it on their data.
- **POC (the likely *next* step):** runs on the *customer's* real data/use case; job is to de-risk
  a specific purchase. Success = a procurement decision.
- **Product:** hardened, multi-tenant, secured, shipped to many customers. **Not this.**

We are at the front of the funnel. A great demo's job is to **earn the POC**, which earns the deal.

## 2. What we're actually selling

**The product is ArangoDB — the platform.** The Customer 360 agent is the *vehicle* that makes
ArangoDB's differentiators legible to a buyer. Every decision should answer:
*"Does this make an ArangoDB capability visible, and does it make the buyer want it on their data?"*

ArangoDB differentiators this demo exists to showcase:
- **One database** does the structured graph + unstructured GraphRAG + vector + BM25 — no bolt-on
  vector DB, no second system. (Competitor story: "Neo4j + Pinecone + a search system + glue.")
- **Native graph traversal = explainable, sourceable retrieval** — the thing a black-box RAG cannot show.
- **One query language (AQL)** across both graphs, with the cross-graph join on a shared entity bridge.

The buyer is **Zscaler — a security company.** Therefore **trust is the pitch:** grounded answers,
full source traceability, refuses rather than hallucinates, ignores prompt-injection from documents.
Our grounding rigor is not engineering hygiene — for this audience it *is* the sell. Lead with it.

## 3. The filter for every piece of work

> **"When the buyer sees this, can they name an ArangoDB capability — and does it make them
> want it on their own data?"**

- **Yes** → build it, and make the capability *visible/nameable*.
- **Just makes the app more complete/robust/general** → it's product work. Do the cheapest version
  that survives the demo, or skip it.

Test for cutting anything: **does a buyer in the room ever see it?** If not, it's costing time the
demo won't repay.

## 4. Do MORE of this (sells ArangoDB)

- **Make the engine nameable.** In UI + talk track, say the quiet part: *"vector + BM25 + graph
  traversal, one database, one query language."* A buyer must leave able to repeat "ArangoDB did X."
- **Invest in the retrieval-path viz** over almost anything else — it literally shows the graph doing
  the work a black box can't.
- **Sharpen the competitive contrast** ("you'd need 3 systems + glue for this") — one line/slide.
- **Build the bridge to their data** — "how this maps to your Salesforce/Slack/contracts" — the slide
  that turns the demo into "let's try it on ours."

## 5. Do LESS of this (product work — resist)

- More accounts, more questions, broader domain coverage (3 accounts already carry the narrative).
- Auth, multi-tenancy, scale/perf beyond "feels fast in the room," real source integrations.
- Hardening the generated-AQL fallback, exhaustive error handling, general-purpose anything.
- Robustness for inputs no presenter will type live.

## 6. What to develop next (ranked by sell-value-per-effort)

1. **"Show me the query" — AQL reveal.** *Highest leverage, low effort.* Surface the actual AQL that
   ran for each retrieval step (the `retrievalPath` fragment already carries the query string). The
   most direct "ArangoDB did this, no black box" proof — exactly what a technical buyer leans in for.
2. **"One engine" framing on the graph viz.** Label retrieval modes (vector / BM25 / traversal) so the
   viz says "all in one ArangoDB, one AQL." Carries the competitive contrast.
3. **Presenter control panel (pull forward from Phase 15).** Presets + reset + CDC trigger. Demo
   insurance — makes the presenter smooth and lets us hit the moments reliably, every time.
4. **Demo talk track + "maps to your data" one-pager.** *Highest strategic, non-code.* Sequences the
   aha moments; bridges demo → POC. Converts more deals than another feature.
5. **Phase 13 "try-to-break-it."** ~~Keep~~ **CUT for demo (2026-06-25).** A preview smoke showed an
   off-script attack getting *answered* — the live path enforces `_id`-grounding only; semantic
   faithfulness is eval-only, not on the live path. A half-working "try to break it" in front of a
   security buyer is worse than none, and it invited the off-script inputs we explicitly don't harden
   for. Hidden behind `ADVERSARIAL_MODE_ENABLED=false`. **SEC-01 injection hardening stays always-on**
   (free, protects normal mode). Lead the security story with grounding + traceability instead.

## 7. Roadmap adjustments — LOCKED 2026-06-25

A capability scout during this discussion found the demo was *under-using* ArangoDB itself: the
structured graph has 7 vertex + 7 edge collections but was queried with flat `FILTER account_id ==`
scans (zero traversal); the cross-graph "join" lived in the planner's prose, not in AQL; and
AutoGraph's Leiden community layer was built but never queried. So the tail pivots not just to
*surfacing* capabilities (talk track) but to *actually exercising* them — the strongest possible
"make ArangoDB undeniable." The remaining v2 phases (14–18) were restructured to:

- **Phase 14 — Graph-Depth + Explainability.** Make `structuredQuery` a real multi-hop named-graph
  traversal over the existing `HAS_*` edges; execute the structured↔unstructured join as a *single*
  AQL query across the `same_as` bridge; then reveal the AQL per step with vector/BM25/traversal
  labels and the cross-graph join as the hero. Depth + reveal are the same phase — revealing a flat
  scan would be a confident-wrong pitch. *(AQL reveal scope: A+B+C — raw reveal + one-engine labels
  + hero the join.)*
- **Phase 15 — GraphRAG via AutoGraph Communities.** Query the built-but-unused Leiden community
  layer + summaries for hierarchical global↔local retrieval. Exercises the GenAI platform we pay for.
- **Phase 16 — Time-Travel (Temporal Graph).** *Promoted, scoped tight* (not trimmed). Research
  verified ArangoDB time-travel is a documented *modeling pattern* (effective-dated edges + `@asOf`
  AQL traversal), NOT a native feature — so frame it honestly: "validity modeled on the graph,
  any point in time in the same AQL traversal, one engine." Scoped to Northwind. Heaviest item
  (synthetic-data coherence).
- **Phase 17 — Agent Memory on ArangoDB.** "Agentic brain on Arango" — persist answers/entities/
  past-questions as a graph; multi-turn follow-ups powered by graph-resident memory. **Un-demotes
  AGENT-08**, reframed from app-polish to a platform capability.
- **Phase 18 — Presenter Control Panel + CDC Reframe.** Control panel placed *last* (reversing the
  earlier "pull forward") so presets wire every capability moment in one clean build. CDC is
  **reframe-only**: name ArangoDB's one-engine propagation in the banner/talk track (no real WAL
  streaming — the managed ArangoGraph cluster wouldn't expose it, and the built pipeline already
  does the honest version).
- **Demo Assets track (parallel, non-code).** Talk track, maps-to-your-data one-pager, competitive
  one-liner, capability-naming notes (GenAI platform, platform-security slide for Zscaler,
  ArangoGraph cloud, multi-model). First-class deliverables.

**Decisions captured via `/gsd-discuss-phase` discussion 2026-06-25.** Net shift unchanged in spirit:
from *"finish the app's features"* → *"make ArangoDB undeniable and make the presenter smooth on
stage"* — now with the realization that the deepest version of "undeniable" is the database visibly
doing graph/AI work it wasn't doing before. Sequenced by sell-value-per-effort; demo strengthens
monotonically, so it's demoable at any checkpoint (notably strong after Phase 14).

## 8. One-line purpose to hold throughout

> **Make an ArangoDB buyer at a security company believe that grounded, traceable, multi-graph
> answers over their own messy data are achievable — and want to find out on their data next.**

---

### Demo narrative (the three accounts, as a sales arc)

- **Northwind Analytics** — healthy *expansion*; the upsell-ready account (Q7 structured anchor, Q5 GenAI intent).
- **Meridian Logistics** — *hidden risk*; green usage/NPS metrics masking negative sentiment in Slack/email/QBR
  (Q12 centerpiece reconciliation, Q2 renewal risk, Q9 champion gone quiet, Q8 unlogged promise). **The moment that sells.**
- **Helio Retail** — honest *churn*; usage AND sentiment decline in lockstep (Q13 churn, Q14 save-plan, Q15 structured anchor).

One to upsell, one secretly at-risk, one churning — proves the agent finds the real story whether it's in
the structured data, the unstructured data, or the contradiction between them.
