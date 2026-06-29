# Customer 360 — Graph-Based Demo

A free-form question box over a synthetic **Customer 360**. You ask something in plain
English ("is Meridian at risk of churning?") and a custom agent queries **two separate
ArangoDB graphs**, reasons across both, and returns an answer where **every fact links back
to the exact record, graph, and traversal it came from**. 100% synthetic data across three
customer accounts.

> **What this is:** a sales demo / art-of-the-possible — not a product, not (yet) a POC.
> The thing being sold is **ArangoDB the platform**; the agent is the vehicle that makes the
> platform's differentiators legible to a technical buyer: one engine doing **graph traversal
> + vector + BM25** under **one query language (AQL)**, with retrieval you can actually see
> and source. Built with a security buyer (Zscaler) in mind, so the pitch is **trust** —
> grounded, fully-traceable answers that refuse rather than hallucinate.

---

## The data model — two graphs, on purpose

- **Structured graph (hand-modeled — *not* AutoGraph).** A named graph we designed:
  `Account → Contract / Usage / Opportunity / Contact / NPS` over typed `HAS_*` edges.
  Data is 100% synthetic but deliberately shaped like what you'd pull from
  Salesforce / Snowflake / DocuSign, generated off a coherent multi-year event spine so the
  story holds across sources. Relational data maps cleanly to a designed schema, which is
  what keeps the traversals deterministic and explainable.

- **Unstructured KG (AutoGraph as the *importer*, not the retriever).** Built from synthetic
  Slack threads, Google Docs, emails, and PDFs (contracts, QBR decks). AutoGraph runs at
  **build time only** to construct the graph — `documents → chunks + embeddings → extracted
  entities → Leiden communities` — and writes plain ArangoDB collections. The agent then
  queries those collections with **AQL we wrote and can show**. AutoGraph's retriever is
  deliberately kept off the live path: it doesn't expose the queries it runs, and "show me
  exactly how you got this answer" is the entire point of the demo.

The hardest questions can only be answered by **joining the two** — e.g. every structured
metric on an account is green, but Slack threads and a negative NPS verbatim say it's
actually at risk.

### Entity resolution (how the two graphs join)

No fuzzy matching at query time. A shared, deterministic `entity_id` (UUID v5, derived from
account + type + name) is baked into **every** source during data generation, so the same
company / person / contract carries the same id whether it appears in a structured record or
a Slack message. A central **`canonical_entities`** hub links both graphs via **`same_as`**
edges, built as its own pipeline step. The cross-graph join is a **single AQL query** across
that bridge:

```
canonical_entities → same_as → KG entity → MENTIONED_IN → chunk → PART_OF → document
```

— not stitched together in app code or in the model's prose.

---

## How a question gets answered

1. An **AI SDK 6 `ToolLoopAgent`** (planner, `temperature 0`; provider-agnostic, running on
   OpenAI `gpt-4.1` today) decomposes the question and calls a small set of **curated,
   read-only, bind-parameterized** AQL tools: `entityLookup`, `structuredQuery` (multi-hop
   `HAS_*` traversal), `hybridRetrieve` (vector + BM25 fused with RRF), `bridgeResolve`, and
   `crossGraphJoin`. No generated/free-form AQL on the live path.
2. Every tool returns its data **plus** a retrieval-path fragment: graph, collection, the
   real `_id`s, the actual AQL, and the edges it traversed.
3. A **pure-code grounding gate** checks that every citation in the answer is a real `_id`
   that was actually retrieved. Anything ungrounded becomes a structured refusal — no model
   self-certifies, and fabricated edges are dropped before they reach the UI.
4. The UI streams the answer with per-claim citations, the cross-graph subgraph, and a
   "show me the query" reveal of the actual AQL each step ran.

---

## Repo layout

The codebase is split between an **offline build pipeline** and the **live query path**.

| Path | Stack | Role |
|------|-------|------|
| `data_gen/` | Python | Synthetic data generation: `spine/` (event spine + entity registry — the shared-id source of truth), `generators/` (per-source LLM generators), `linter/` (referential + timeline coherence gate). |
| `scripts/` | Python | Build/load steps: `load_structured.py`, `build_unstructured.py` (AutoGraph build), `build_entity_bridge.py` (the `same_as` bridge), plus verifiers. |
| `lib/` | Python | Clients for the AutoGraph platform (`autograph_client.py`, `acp_client.py`). |
| `agent/` | TypeScript | The reasoning agent. `src/tools/*` — one module per curated tool; `src/{grounding,envelope,retrievalPath,rrf,sanitize,embed,db}.ts` — shared cross-cutting modules. One agent factory feeds both the request/response and streaming paths so they can't drift. |
| `web/` | Next.js 15 | The dashboard + `/api/ask` route. `components/*` map 1:1 to concepts (citation cards, graph viz, retrieval pipeline / AQL reveal, sourcing drawer, trust chip, refusal panel). |

Why carved this way: the build pipeline can regenerate and reload data without touching the
agent, and the agent stays a thin, auditable query layer where every tool has one job and
emits its own provenance.

---

## Running it locally

This repo is an npm workspace (`agent` + `web`); the agent compiles to `dist/` and the
Next.js app imports it (the `web` `predev`/`prebuild` scripts build the agent automatically).

```bash
# 1. Install (root — installs both workspaces)
npm install

# 2. Configure the live ArangoDB connection + model key.
#    See .env.example for the agent CLI, and web/.env.local for the Next app
#    (the canonical server-only env list lives in DEPLOY.md).
cp .env.example .env        # fill in ARANGO_* + OPENAI_API_KEY

# 3. Run the dashboard (builds the agent, then starts Next.js on :3000)
npm run dev --workspace customer360-web

# Ask a question from the CLI without the UI:
npm run ask --workspace customer360-agent -- "is Meridian at risk of churning?"

# Tests
npm run test --workspace customer360-agent     # agent unit/live tests
npm run test --workspace customer360-web        # component tests
```

The agent and UI need a populated `customer360` ArangoDB database (structured graph,
unstructured KG, and the entity bridge). Data generation + load lives in `data_gen/` and
`scripts/`; deploy specifics are in [`DEPLOY.md`](./DEPLOY.md).

---

## Where to read more

- [`DEMO-STRATEGY.md`](./DEMO-STRATEGY.md) — positioning, what the demo is selling, the
  three-account narrative arc.
- [`docs/PROJECT-SUMMARY-INTERNAL.md`](./docs/PROJECT-SUMMARY-INTERNAL.md) — slide-by-slide
  internal review deck (architecture diagrams, design choices, honest current state).
- [`DEPLOY.md`](./DEPLOY.md) — Vercel deploy runbook + the server-only env vars.
- [`UPDATE.md`](./UPDATE.md) — the live-update / CDC story.

---

> **Status:** prototype, rough around the edges. Stack: Next.js 15 · AI SDK 6 (`ToolLoopAgent`) ·
> arangojs 10 · ArangoDB 3.12.9+ · Zod 4. Synthetic data only — no real customer data.
