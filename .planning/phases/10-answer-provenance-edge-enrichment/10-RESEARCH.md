# Phase 10: Answer-Provenance Edge Enrichment - Research

**Researched:** 2026-06-23
**Domain:** Graph-retrieval provenance modeling (ArangoDB AQL traversal edges + Zod contract + AI SDK 6 tool fragments)
**Confidence:** HIGH (all claims verified against this repo's source; no external/training-dependent assertions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Edge-kind discriminator):** Each edge object carries an explicit `kind` enum: `'traversed' | 'structural' | 'hybrid'`. Maps 1:1 to VIZ-02's three visual styles. `kind` is orthogonal to `graph` (a structural edge is `graph:'structured', kind:'structural'`).
- **D-03 (Edge metadata):** Each edge carries `{_id, _from, _to, collection, kind}` **plus** a human-readable `label` (`'PART_OF'` / `'same_as'` / `'account'`). **No** hybrid retrieval scores (vector/BM25/RRF rank) in v1.
- **D-02 (Structured side = synthesized structural edges):** `structuredQuery` walks **no edges** (account-scoped attribute lookups). Phase 10 **synthesizes** account-anchored edges (account node → each cited structured record), `kind:'structural'`, label `'account'`. Synthesis lives in the testable data layer, explicitly NOT `traversed`. Synthesized edges must be **deterministic** (no `uuid4`/`random`) — derive a stable id from `{account_id, record _id}` OR carry a clearly-synthetic/`null` `_id`.
- **D-04 (No-fabrication guard test):** A Phase-10 unit test that **fails** if any fragment edge with `kind:'traversed'` was not actually returned by the tool's AQL. Locks the traversed/structural boundary at the data layer. (Chosen over relying only on the eval gate.)
- **Settled by ground truth:** `hybridRetrieve` traverses `1..1 OUTBOUND chunkId PART_OF` → emit `kind:'traversed'`, `label:'PART_OF'` (SC-1). `bridgeResolve` traverses `1..1 INBOUND hub._id same_as` → emit `kind:'traversed'`, `label:'same_as'` (SC-2). `structuredQuery` traverses no edges → D-02 structural edges (SC-4). `entityLookup` — confirm during planning (this research confirms: NO edge — see §entityLookup).

### Claude's Discretion
- Exact TypeScript shape of `edges[]` element (likely a `RetrievalPathEdge` Zod object in `envelope.ts`); how `mergeRetrievalPaths` merges/dedups edges within a `(graph, collection, query)` group without dropping a sourced edge.
- Whether the synthesized structural edge id is stable-synthetic or `null`.
- D-05's edge-vs-node form (deferred to research/planning — answered in §D-05 below).

### Deferred Ideas (OUT OF SCOPE)
- Hybrid retrieval scores on edges (vector/BM25/RRF rank as edge metadata) — out of v1 (D-03).
- Anything in Phase 11 (React Flow rendering, confidence score, UI refresh, latency).
- Any change to planner citation quality or eval thresholds. **D-06 eval gate is LOCKED.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-01 | Retrieval path carries traversed EDGES (not just node `_ids`): `hybridRetrieve` (Chunk-`PART_OF`→Document) and `bridgeResolve` (`same_as` hub→leaf) return `{_id,_from,_to,collection}`; `RetrievalPathFragment` gains `edges[]`. Structured cluster is an account-anchored induced subgraph (structural, not a traversal that never ran). | §Standard Stack (Zod shape), §Architecture Patterns (AQL `FOR v,e IN` edge capture, fragment merge), §Honesty Contract (D-04 guard), §Code Examples (exact RETURN-clause diffs) — all verified against this repo. |
| VIZ-02 *(downstream — Phase 11)* | React Flow renders 3 edge styles (traversed/structural/hybrid), capped to cited records, fully data-driven. | This phase's `edges[]` model is built to that need: `kind` (3 styles), `label` (caption with no re-query), `{_from,_to}` for layout. §D-05 chooses the hybrid representation so Phase 11 can render it. |
</phase_requirements>

## Summary

This is a low-risk, mechanical-plus-modeling phase entirely contained within `agent/src`. The work is: (1) extend the AQL RETURN clauses in two tools to also return the traversed edge document; (2) add a `RetrievalPathEdge` Zod object and an `edges[]` field to `RetrievalPathFragment` in `envelope.ts`; (3) populate `edges[]` in three tools (two real-traversal, one synthesized-structural); (4) teach `mergeRetrievalPaths` to union edges per group without dropping any; (5) add a no-fabrication guard test. The whole change is **additive** — edges live on a new field that no current consumer (grounding, eval, answer synthesis) reads.

The two real traversals already exist and return only the endpoint vertex. ArangoDB's `FOR v IN ... TRAVERSAL` syntax binds only the vertex; to capture the edge you add the second loop variable: `FOR doc, edge IN 1..1 OUTBOUND ...` (verified ArangoDB traversal semantics; the `edge` variable is the full edge document with `_id/_from/_to/_key`). The edge's `collection` is the edge collection name (`customer360_Relations` for PART_OF; `same_as` for the bridge), which the tools already hold as constants/literals.

The honesty contract (the load-bearing part) is enforced by D-04's guard test asserting that every `kind:'traversed'` edge in a fragment was actually returned by the tool's AQL — structurally identical to how `grounding.ts` already verifies citation `_ids` against the tool-returned set. Structural edges (D-02) and hybrid edges (D-05) are explicitly never `traversed`.

**Primary recommendation:** Add a `RetrievalPathEdge` Zod object to `envelope.ts` with `{ _id: z.string().nullable(), _from, _to, collection, kind: EdgeKindEnum, label: z.string() }` and `edges: z.array(RetrievalPathEdge).default([])` on `RetrievalPathFragment`. Enrich the two traversal RETURN clauses with `FOR v, e IN ...`. Synthesize structural edges in `structuredQuery` keyed deterministically off `{account_id, record._id}`. For **D-05, recommend option (a)**: a synthetic `question` anchor node with `kind:'hybrid'` edges fanning to retrieved chunks — see §D-05. Merge edges in `mergeRetrievalPaths` by a stable dedup key; never drop a sourced edge. Keep `returnedIds` (the grounding ground-truth set) sourced ONLY from `_ids`, never edges.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capture traversed edge from a real traversal | API / agent tool (AQL RETURN) | Database (AQL executes) | The edge is already walked in ArangoDB; the change is what the AQL RETURNs. No DB schema change. |
| Edge data model (`RetrievalPathEdge`, `kind`, `label`) | API / agent (`envelope.ts` Zod contract) | — | Same shared-contract file the whole agent imports. Single source of truth (the file header forbids forking it). |
| Synthesize structural edges (account → record) | API / agent tool (`structuredQuery.ts` TS, post-query) | — | No edge exists in the DB; synthesis is pure TS over the rows the query returned. Belongs in the testable data layer (D-02). |
| Merge/dedup edges across fragments | API / agent (`retrievalPath.ts` pure fn) | — | Already the single merge chokepoint for `_ids`; extend it for `edges[]`. |
| No-fabrication guard (honesty invariant) | API / agent test (`agent/test/*.test.ts`) | — | Pure assertion over tool output vs. AQL ground truth; no DB or model. |
| Render edges (3 styles) | **Phase 11 (out of scope)** | — | VIZ-02 consumes `edges[]`; this phase only produces it. |

## Standard Stack

### Core (already installed — verified from `agent/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | **4.4.3** | The `RetrievalPathEdge` + `RetrievalPathFragment` schema | Already the contract language for the whole envelope. [VERIFIED: agent/package.json] |
| `arangojs` | **10.3.1** | `aql` template tag + `literal()` for the enriched RETURN clauses | Already used in all three tools; injection-safe bind. [VERIFIED: agent/package.json] |
| `ai` (Vercel AI SDK) | **6.0.208** | `tool()` wrappers; tool `output.retrievalPath` is collected in `agent.ts`/`stream.ts` | No change to tool plumbing needed — edges ride inside the existing `retrievalPath` object. [VERIFIED: agent/package.json] |
| `vitest` | (devDep) | The D-04 guard test + existing tool tests | `npm test` → `vitest run`; eval gate shells vitest. [VERIFIED: agent/package.json scripts] |

**No new packages.** This phase installs nothing — therefore the **Package Legitimacy Audit is N/A** (no external packages added). The React Flow dependency (`@xyflow/react`) belongs to Phase 11, not here.

> NOTE on Zod 4: `zod@4.4.3` is in use. `.default([])` and `z.enum([...])` work identically to v3 for this use. Do NOT introduce `z.nullable()` vs `.nullable()` confusion — the existing code uses the `.nullable()` method form (see `SynthRetrievalPath._ids: z.array(z.string().nullable())` in `agent.ts`). Follow that idiom.

## Architecture Patterns

### System Data Flow (where edges enter and where they must NOT leak)

```
question
   │
   ▼
[planner / ToolLoopAgent.generate]  ── calls tools, each returns { data, retrievalPath:{ graph, collection, _ids, edges[] } }
   │
   ▼
agent.ts / stream.ts  ── for each tool result:
   ├─► returnedIds ← frag._ids        (GROUND TRUTH for grounding — EDGES MUST NOT FEED THIS)
   └─► fragments[] ← frag             (carries edges[] along for the ride)
   │
   ▼
mergeRetrievalPaths(synth.retrievalPath ++ fragments)  ── union _ids AND union edges[] per (graph,collection,query) group
   │
   ▼
enforceGrounding(envelope, returnedIds)  ── reads citations[]._id vs returnedIds; DOES NOT read edges[] → additive, no grounding change
   │
   ▼
EnvelopeSchema.parse(...)  ── edges[] is part of RetrievalPathFragment → must be in the schema (SC-3, tsc clean)
   │
   ▼
envelope.retrievalPath[].edges[]  ── consumed ONLY by Phase 11 VIZ-02
```

**The isolation guarantee (SC-5, key research Q5):** edges are reachable only via `envelope.retrievalPath[].edges`. The three things that determine answer text / grounding / eval verdict read different fields:
- `enforceGrounding` (grounding.ts) reads `envelope.citations[]._id` and `envelope.claims[]` — never `retrievalPath[].edges`. [VERIFIED: grounding.ts lines 52–127]
- `returnedIds` is built ONLY from `frag._ids` in both `agent.ts` (line 332) and `stream.ts` (line 119). **Edges must not be added to `returnedIds`** — if they were, an edge `_id` would become a valid grounding anchor for a citation, changing the grounding verdict. [VERIFIED: agent.ts, stream.ts]
- `faithfulness.ts` / `questions.eval.test.ts` judge on `answer` + `citations` — not `edges`.

As long as the planner's synthesized `answer`/`claims`/`citations` are unaffected (they are — the tools' `data` payload shape does not change for synthesis purposes), edge enrichment cannot change the eval verdict. The one risk to watch: do not alter the tools' `data[]` row shape in a way the planner sees differently (e.g. don't drop `chunk_id`/`content`). Keep edge capture in a *separate* RETURN field or a separate computed array, not by mutating the existing returned row fields.

### Pattern 1: Capture the traversed edge with the two-variable traversal form
**What:** ArangoDB traversal `FOR v IN <depth> <dir> <start> <edgeColl>` binds only the vertex. Adding a second variable binds the edge: `FOR v, e IN <depth> <dir> <start> <edgeColl>`. `e` is the full edge document (`e._id`, `e._from`, `e._to`, plus `e._key`).
**When to use:** Both enriched tools (SC-1, SC-2).
**Why correct here:** The collection name of the edge is known statically (`customer360_Relations` for PART_OF; `same_as` for the bridge) — set `collection` from the module constant / literal, OR derive from `SPLIT(e._id, "/")[0]` (the same idiom `bridgeResolve` already uses for leaf collections, see line 58). Prefer the static constant for the single-edge-collection tools; it's clearer and avoids a SPLIT.

### Pattern 2: Synthesize structural edges in TS, post-query (D-02)
**What:** After `structuredQuery` returns its rows, build one synthetic edge per row: `_from` = a synthetic account node id, `_to` = the row's `_id`, `kind:'structural'`, `label:'account'`, `collection: 'account'` (or `'(synthesized)'`).
**Account node `_from`:** there IS a real `Account/<account_id>` vertex (structuredQuery's `account` facet returns `a._id` from the `Account` collection). Use `Account/${accountId}` as the structural `_from` so Phase 11 can co-locate the cluster around a real node. This is honest: the account node is real; only the *edge connecting it to the attribute records* is synthesized (those FK relationships are not modeled as edges in the structured graph — they're `account_id` columns).
**Edge `_id`:** recommend a **clearly-synthetic deterministic** id: `structural:${accountId}:${row._id}` (NOT `null`). Rationale: (1) deterministic per D-02; (2) gives the dedup key in `mergeRetrievalPaths` a stable value; (3) the `kind:'structural'` discriminator already signals "not a real edge document," so a non-`/`-shaped id is unambiguous and won't be mistaken for an ArangoDB `_id`. Document that this id is not a DB lookup key.

### Pattern 3: Edge merge in `mergeRetrievalPaths` — never drop a sourced edge
**What:** Within a `(graph, collection, query)` group, union `edges[]` exactly as `_ids[]` are unioned today (preserve first-seen order, dedup).
**Dedup key:** `edge._id` is the natural key for traversed + structural edges (both have a stable non-null id under this design). For robustness against a future `null` `_id`, fall back to a composite `${kind}::${_from}::${_to}::${label}` when `_id == null`. Recommended key fn:
```
const edgeKey = (e) => e._id ?? `${e.kind}::${e._from}::${e._to}::${e.label}`;
```
**Guarantee:** the same first-seen-wins Set pattern already proven for `_ids` (retrievalPath.ts lines 42–58) extends directly — no sourced edge is dropped because every distinct key is kept. Clone edges into the group entry (don't mutate caller fragments), mirroring the existing `_ids` clone discipline.

### Anti-Patterns to Avoid
- **Feeding edge `_id`s into `returnedIds`.** Grounding is over node `_ids` only. An edge `_id` is not a citable record. [Would change SC-5 grounding behavior.]
- **Labeling a structural or hybrid edge `traversed`.** This is the exact failure class the project exists to avoid (confident-wrong). D-04's test exists to make this impossible to ship.
- **Mutating the tools' existing `data[]` row fields to carry edges.** Put edges on the `retrievalPath` fragment, not on the data rows the planner reads — keeps synthesis/grounding isolated (SC-5).
- **Using `uuid4`/`Math.random()` for synthetic edge ids.** Violates D-02 determinism; breaks dedup and test reproducibility.
- **Adding edges to the model-authored `SynthRetrievalPath`** (agent.ts). The model does not author edges; only the tool-side fragments do. Leave `SynthRetrievalPath` alone — `mergeRetrievalPaths` already treats the model's authored paths as non-authoritative and merges the tool fragments (the ground truth) in.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Capturing the edge of a traversal | A second query to fetch the edge by endpoints | `FOR v, e IN ...` second loop variable | Native AQL; the edge is already on the traversal path; one query. |
| Edge dedup across fragments | A new merge module | Extend `mergeRetrievalPaths` (the existing chokepoint) | Single place `_ids` already dedup; consistency + one place to test. |
| Honesty enforcement | Manual code review | The D-04 guard test (mirrors `grounding.ts` returnedIds discipline) | A test makes the invariant un-shippable-if-broken; review does not. |
| Account FK → edge | Inventing edges in the DB / a migration | TS synthesis from the returned rows (D-02) | No schema change; FKs are `account_id` columns, not edges — synthesizing in code keeps the DB honest. |

**Key insight:** Everything in this phase is already-walked data or a pure code transform. The only genuinely new thing is the `kind` discriminator that makes the honesty contract a checkable invariant.

## Runtime State Inventory

> This is NOT a rename/refactor/migration phase — it is additive code enrichment with no datastore, service-config, OS-state, secret, or build-artifact changes. Inventory included for completeness because it touches AQL RETURN clauses.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no ArangoDB schema change; edges are READ from existing `customer360_Relations` / `same_as` collections and SYNTHESIZED in TS for structured. No collection created/altered. | None |
| Live service config | None — no Vercel/Arango config change. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — `OPENAI_API_KEY`/`ARANGO_*` unchanged; edges never serialize secrets (existing tool discipline). | None |
| Build artifacts | None new. `tsc` must stay clean (SC-3) after the Zod/type change — run `npm run typecheck` in `agent/`. | Re-typecheck only |

**Verified:** No runtime state migration is required. The edges read at query time are real edge documents already present in the graphs built by Phase 5/9.

## Common Pitfalls

### Pitfall 1: Traversal returns only the vertex, silently
**What goes wrong:** Keeping `FOR doc IN 1..1 OUTBOUND ...` and trying to reference an `edge` variable → AQL error or, worse, referencing a wrong binding.
**Why it happens:** The single-variable form is the common idiom; the edge variable is opt-in.
**How to avoid:** Use `FOR doc, edge IN 1..1 OUTBOUND ...`. In `bridgeResolve` the two subqueries (`structured`, `kg`) each need the edge variable added: `FOR leaf, e IN 1..1 INBOUND hub._id same_as`.
**Warning sign:** The enriched RETURN omits `_from/_to` or they come back `null`.

### Pitfall 2: Edge direction vs `_from`/`_to` confusion
**What goes wrong:** Assuming `_from` is always the start vertex. For `OUTBOUND` it is; for `INBOUND` the start vertex is `_to` and the leaf is `_from`.
**Why it happens:** `bridgeResolve` traverses `INBOUND hub._id same_as` — the edge's `_from` is the leaf, `_to` is the hub. Capture `e._from`/`e._to` verbatim from the edge document (don't reconstruct them) and they will be correct regardless of direction. Phase 11 lays out from the real `_from`/`_to`.
**How to avoid:** Always emit `e._from` and `e._to` straight from the edge doc; never compute them from the start node.
**Warning sign:** React Flow (Phase 11) draws the bridge edge backwards.

### Pitfall 3: Edge `_id`s leaking into grounding
**What goes wrong:** A well-meaning refactor adds `for (const e of frag.edges) returnedIds.add(e._id)`.
**Why it happens:** Symmetry with the `_ids` loop looks natural.
**How to avoid:** Do NOT touch the `returnedIds` collection loops in `agent.ts` (line 332) and `stream.ts` (line 119). Add an explicit code comment that edges are provenance-only and must not be grounding anchors. The D-04 guard test should also assert no edge `_id` appears in `returnedIds` if feasible.
**Warning sign:** groundingScore changes after enrichment; the eval gate shifts (SC-5 regression).

### Pitfall 4: Forgetting the streaming path
**What goes wrong:** Edges populate in `runAgent` (non-streaming) but the streaming path's fragment-collection loop differs and drops them.
**Why it happens:** `agent.ts` and `stream.ts` have near-duplicate fragment-collection loops; the eval gate only exercises the non-streaming path (per project memory `agent-loop-shared-factory`).
**How to avoid:** Because edges ride INSIDE the `retrievalPath` fragment object (not a new sibling field), both loops already push the whole `frag` into `fragments[]` — so edges flow through both paths for free, PROVIDED `mergeRetrievalPaths` carries them. Verify both `agent.ts` line 345 and `stream.ts` line 130 call the same `mergeRetrievalPaths`. They do. **Smoke-test the streaming UI** before the demo regardless (memory note).
**Warning sign:** Non-streaming envelope has edges; streamed envelope doesn't.

### Pitfall 5: Zod 4 default-array vs optional
**What goes wrong:** Making `edges` `.optional()` forces every consumer to null-check; making it required without `.default([])` breaks the existing tools that don't yet set it during incremental task landing.
**How to avoid:** `edges: z.array(RetrievalPathEdge).default([])`. A fragment with no edges (e.g. `entityLookup`) parses to `edges: []` cleanly. This keeps SC-3 (tsc clean) at every task boundary.

## Code Examples

> All examples are diffs against verified current source in this repo.

### SC-1: hybridRetrieve — capture the PART_OF edge
Current (hybridRetrieve.ts lines 110–123) returns only `doc` fields. Enrich:
```typescript
// Source: agent/src/tools/hybridRetrieve.ts (current lines 110–123), verified
const srcCursor = await db.query(aql`
  WITH ${literal(DOCUMENTS)}, ${literal(CHUNKS)}
  FOR chunkId IN ${topK}
    FOR doc, edge IN 1..1 OUTBOUND chunkId ${literal(RELATIONS)}   // <-- add , edge
      FILTER IS_SAME_COLLECTION(${DOCUMENTS}, doc)
      ${accountFilter}
      RETURN {
        chunk_id: chunkId,
        content: DOCUMENT(chunkId).content,
        account_id: doc.account_id,
        citable_url: doc.citable_url,
        file_name: doc.file_name,
        edge: { _id: edge._id, _from: edge._from, _to: edge._to }  // <-- new
      }
`);
// data[].edge → build RetrievalPathEdge { ...row.edge, collection: RELATIONS,
//   kind: 'traversed', label: 'PART_OF' }
// retrievalPath.edges = data.map(d => ({ _id: d.edge._id, _from: d.edge._from,
//   _to: d.edge._to, collection: RELATIONS, kind: 'traversed', label: 'PART_OF' }))
```
Keep the existing `HybridChunk` data shape unchanged for the planner — add `edge` as a NEW field on the row (planner ignores it; synthesis unaffected).

### SC-2: bridgeResolve — capture the same_as edge (both subqueries)
```typescript
// Source: agent/src/tools/bridgeResolve.ts (current lines 55–64), verified
LET structured = (
  FOR leaf, e IN 1..1 INBOUND hub._id same_as          // <-- add , e
    FILTER NOT IS_SAME_COLLECTION("customer360_Entities", leaf)
    RETURN { collection: SPLIT(leaf._id, "/")[0], _id: leaf._id,
             edge: { _id: e._id, _from: e._from, _to: e._to } }   // <-- new
)
LET kg = (
  FOR e2 IN 1..1 INBOUND hub._id same_as               // rename inner if needed
    FILTER IS_SAME_COLLECTION("customer360_Entities", e2)
    RETURN { _id: e2._id, entity_name: e2.entity_name }
)
```
NOTE: the existing `kg` subquery binds its VERTEX as `e` (line 61: `FOR e IN ...`). When you add the edge variable to `structured`, pick non-colliding names (e.g. vertex `leaf`, edge `edge`; and in `kg` keep vertex but capture its edge too if Phase 11 needs KG-side bridge edges — the success criteria only require the same_as edge, which is the same collection for both legs). Edge `collection` = `'same_as'` (the literal). `kind:'traversed'`, `label:'same_as'`. Capture `e._from/_to` verbatim (Pitfall 2 — INBOUND direction).

### SC-4 / D-02: structuredQuery — synthesize structural edges (TS, no AQL change)
```typescript
// Source: pattern for agent/src/tools/structuredQuery.ts buildPath (lines 45–56)
function buildPath(collection, data, query, accountId): RetrievalPathFragmentT {
  const edges = data.map((d) => ({
    _id: `structural:${accountId}:${d._id as string}`,  // deterministic, clearly-synthetic
    _from: `Account/${accountId}`,                        // real account vertex
    _to: d._id as string,
    collection: 'account',                                // synthetic edge "collection"
    kind: 'structural' as const,                          // NEVER 'traversed'
    label: 'account' as const,
  }));
  return { graph: 'structured', collection, _ids: data.map(d => d._id), query, edges };
}
```
Thread `accountId` into `buildPath` (currently it only takes `collection/data/query`). The `account` facet itself returns the Account row — its structural self-edge (`Account/x → Account/x`) is degenerate; either skip the self-row or accept it (Phase 11 can collapse). Recommend: skip emitting a structural edge whose `_to === _from`.

### envelope.ts — the new RetrievalPathEdge + edges[] field
```typescript
// Source: agent/src/envelope.ts (add near RetrievalPathFragment, lines 43–54)
export const EdgeKindEnum = z.enum(['traversed', 'structural', 'hybrid']);
export type EdgeKind = z.infer<typeof EdgeKindEnum>;

export const RetrievalPathEdge = z.object({
  _id: z.string().nullable(),   // real edge _id, OR clearly-synthetic id, OR null
  _from: z.string(),
  _to: z.string(),
  collection: z.string(),       // edge collection (real) or synthetic marker
  kind: EdgeKindEnum,
  label: z.string(),            // 'PART_OF' | 'same_as' | 'account' | 'hybrid'
});
export type RetrievalPathEdgeT = z.infer<typeof RetrievalPathEdge>;

export const RetrievalPathFragment = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _ids: z.array(z.string()),
  query: z.string(),
  edges: z.array(RetrievalPathEdge).default([]),   // <-- additive, defaults empty
});
```

## D-05 Decision: hybrid-retrieval representation

**Recommendation: Option (a) — a synthetic `question` anchor node with `kind:'hybrid'` edges fanning to the retrieved chunks.**

**The shape:**
- A single synthetic anchor node id, deterministic from the query text or fragment query string: `question/${hashOrSlug}` (or a fixed `'question/current'` since one question is one render). Phase 11 draws it as the entry point.
- One `kind:'hybrid'` edge per retrieved chunk: `_from: 'question/<anchor>'`, `_to: <chunk_id>`, `collection: 'hybrid'`, `label: 'hybrid'`, `_id: 'hybrid:<anchor>:<chunk_id>'` (deterministic, clearly-synthetic).

**Why (a) over (b) tagging chunk nodes:**
1. **VIZ-02 needs 3 distinct EDGE styles** (REQUIREMENTS §VIZ-02: "Distinct visual styles for traversed vs structural vs hybrid-retrieval **edges**"). The requirement is phrased in terms of edges. Option (b) (tagging nodes) produces no hybrid *edge* — Phase 11 would have nothing to style as a hybrid edge, only a node attribute, which doesn't satisfy the 3-edge-style brief and forces Phase 11 to invent geometry.
2. **It reads honestly end-to-end** (CONTEXT §specifics): `(hybrid) question → chunks → (PART_OF, traversed) documents → (same_as, traversed) structured leaves`. The hybrid fan-out is the visual entry into the unstructured cluster.
3. **The `kind:'hybrid'` discriminator already makes it honest** — it is explicitly NOT `traversed`. The synthetic anchor + synthetic edge ids signal "not a graph document," exactly like the structural edges. The D-04 guard test treats `hybrid` the same as `structural`: never asserted to be a real AQL-returned edge.
4. **Grounded to the chunks actually retrieved** — the `_to` of every hybrid edge is a real `chunk_id` from `topK` (the same ids in `retrievalPath._ids`). No fabricated targets.
5. Symmetry with the structural-edge synthesis pattern (same anchor-node + deterministic-id approach) → one mental model, one test pattern, less code.

**Where it lives:** in `hybridRetrieve.ts`, built alongside the PART_OF traversed edges. So `hybridRetrieve`'s fragment carries BOTH kinds: `kind:'hybrid'` (question→chunk) AND `kind:'traversed'` (chunk PART_OF document). That's correct and honest — the tool does two distinct things (a hybrid match, then a real traversal) and the edges record both truthfully.

**Constraint respected:** D-03 forbids vector/BM25/RRF scores in v1 — the hybrid edge carries NO score, just `{_from, _to, kind:'hybrid', label:'hybrid'}`. Scores are the explicitly-deferred polish pass.

## Honesty Contract & D-04 Guard Test

**The invariant:** every fragment edge with `kind:'traversed'` MUST correspond to an edge actually returned by the tool's AQL traversal. `structural` and `hybrid` edges are synthesized and are exempt (they are never claimed as traversals).

**Test design (recommended location: `agent/test/retrievalPath.test.ts` for pure-logic assertions + an integration assertion in `hybridRetrieve.test.ts` / `bridgeResolve.test.ts`):**

1. **Pure no-fabrication unit test (no DB):** Construct a fragment whose `traversed` edges are derived from a known "ground-truth" set of edges (the AQL-returned set), then assert a guard function `assertNoFabricatedTraversedEdges(fragment, groundTruthEdgeIds)` returns true; and that injecting a `traversed` edge whose `_id` is NOT in the ground-truth set makes it FAIL. This locks the invariant cheaply and deterministically.
   ```typescript
   // shape of the guard the test exercises
   function traversedEdgesAreGrounded(
     frag: RetrievalPathFragmentT,
     returnedEdgeIds: Set<string>,   // the _ids the AQL traversal actually returned
   ): boolean {
     return frag.edges
       .filter(e => e.kind === 'traversed')
       .every(e => e._id != null && returnedEdgeIds.has(e._id));
   }
   ```
2. **Integration assertion (live-DB guarded, mirrors existing `hybridRetrieve.test.ts` `canRun` guard):** run `runHybridRetrieve` / `bridgeResolve` against the live cluster; collect the edge `_id`s the AQL returned (the `edge._id` on each data row — the ground truth); assert every `kind:'traversed'` edge in `retrievalPath.edges` has an `_id` in that set. Because the same code builds both, this is effectively a consistency check, but it is the honest end-to-end proof.
3. **`returnedIds` non-leak assertion:** assert that no edge `_id` (traversed/structural/hybrid) is present in the grounding `returnedIds` set — i.e. edges never become grounding anchors (Pitfall 3, SC-5).

**Where ground truth comes from:** the AQL RETURN now includes `edge: { _id, _from, _to }` on each data row (see SC-1/SC-2 examples). The "really-returned edge set" is `new Set(data.map(d => d.edge._id))`. The fragment's `traversed` edges are built from exactly that, so the test verifies the builder never adds an edge outside it.

This is chosen over extending the eval-gate grounding check (D-04 decision) — it is cheaper, deterministic, runs without OpenAI, and locks the boundary at the data layer where the violation would occur.

## State of the Art

| Old Approach | Current Approach | Source |
|--------------|------------------|--------|
| `RetrievalPathFragment` = `{graph, collection, _ids, query}` (nodes only) | + `edges[]` of `RetrievalPathEdge` | This phase (VIZ-01) |
| Traversal RETURNs vertex only | `FOR v, e IN ...` captures the edge | AQL standard traversal syntax |
| FK relationships implicit in `account_id` columns | Synthesized `structural` edges for viz | D-02 |

**Nothing deprecated.** This is purely additive to a shipped v1 contract.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `FOR v, e IN <depth> <dir> <start> <edgeColl>` binds `e` to the full edge document with `_id/_from/_to` in ArangoDB 3.12.x | Pattern 1 / Code Examples | LOW — this is core, stable AQL traversal syntax unchanged for many major versions; bridgeResolve already SPLITs `_id`s and the cluster runs 3.12.x. Verify in arangosh during Wave 0 with a one-line traversal if any doubt. |
| A2 | A real `Account/<account_id>` vertex exists to anchor structural edges (`_from`) | Pattern 2 | LOW — `structuredQuery` `account` facet returns `a._id` from the `Account` collection keyed by account_id; the bridge/entityLookup also reference Account. If `_key !== account_id`, derive `_from` from the returned `a._id` of the `account` facet instead. Confirm `Account._key == account_id` in Wave 0 (CLAUDE.md memory says `Account._key == account_id`). |
| A3 | Phase 11 prefers a hybrid EDGE (option a) over a node tag (option b) | §D-05 | LOW — REQUIREMENTS §VIZ-02 explicitly says "edge" styles; if Phase 11 planning later prefers node tagging, the `kind:'hybrid'` field still supports it, but the recommendation here is edge-form. |

**Note:** A1/A2 are tagged ASSUMED only out of discipline (not verified in arangosh this session). Both are low-risk and trivially confirmed in a Wave-0 spike if the planner wants certainty. All code-shape claims (envelope.ts, retrievalPath.ts, grounding.ts, the three tools, agent.ts, stream.ts) are VERIFIED by direct read of current source.

## Open Questions

1. **KG-side `same_as` edge in bridgeResolve `kg` subquery**
   - What we know: SC-2 requires the structured-leaf `same_as` edge. The `kg` subquery also traverses `same_as` (hub→KG entity).
   - What's unclear: whether Phase 11 wants the KG-side bridge edges too (only ~3 of 9 entities have a KG `entity_id` stamp).
   - Recommendation: capture the KG-side edge as well (`kind:'traversed'`, `label:'same_as'`) — it's the same collection, free to capture, and Phase 11 can choose to render or hide it. No honesty risk (it's a real edge).

2. **Account-facet self-edge**
   - Recommendation (decided above): skip emitting a structural edge where `_to === _from` (the Account row pointing at itself). Trivial filter.

## Validation Architecture

> `workflow.nyquist_validation` not set to false (checked) → section included. This phase has an explicit guard-test requirement (D-04).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) [VERIFIED: agent/package.json `"test": "vitest run"`] |
| Config file | `agent/vitest.config.*` (existing — tests in `agent/test/`) |
| Quick run command | `cd agent && npx vitest run retrievalPath envelope` (pure tests, no DB/OpenAI) |
| Full suite command | `cd agent && npm test` |
| Eval gate (LOCKED) | `npx tsx scripts/eval-gate.ts` (from repo root; requires `OPENAI_API_KEY` + `ARANGO_*`) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|-------------|
| VIZ-01 (SC-3) | `RetrievalPathEdge` + `edges[]` parse; tsc clean | unit | `cd agent && npm run typecheck` + `npx vitest run envelope` | ✅ envelope.test.ts (extend) |
| VIZ-01 (merge) | `mergeRetrievalPaths` unions edges, drops none, dedups | unit (pure) | `cd agent && npx vitest run retrievalPath` | ❌ Wave 0 — add `agent/test/retrievalPath.test.ts` |
| VIZ-01 (D-04) | no `traversed` edge absent from AQL ground truth | unit (pure) + integration | `cd agent && npx vitest run retrievalPath` (+ live-guarded in tool tests) | ❌ Wave 0 (pure) / ✅ tool tests (extend) |
| VIZ-01 (SC-1) | hybridRetrieve emits PART_OF traversed + hybrid edges | integration (live-guarded) | `cd agent && npx vitest run hybridRetrieve` | ✅ hybridRetrieve.test.ts (extend) |
| VIZ-01 (SC-2) | bridgeResolve emits same_as traversed edges | integration (live-guarded) | `cd agent && npx vitest run bridgeResolve` | ✅ bridgeResolve.test.ts (extend) |
| VIZ-01 (SC-5) | edges never enter `returnedIds`; eval gate stays GREEN | unit (non-leak) + gate | guard test + `npx tsx scripts/eval-gate.ts` | gate ✅ (must stay GREEN, never edit) |

### Sampling Rate
- **Per task commit:** `cd agent && npm run typecheck && npx vitest run retrievalPath envelope` (pure, fast, no creds).
- **Per wave merge:** `cd agent && npm test` (full unit + live-guarded integration where creds present).
- **Phase gate:** `npx tsx scripts/eval-gate.ts` GREEN (SC-5) before `/gsd-verify-work`. **Never edit the gate or thresholds to pass (D-06 LOCKED).**

### Wave 0 Gaps
- [ ] `agent/test/retrievalPath.test.ts` — pure tests for edge merge/dedup + the D-04 no-fabrication guard + the `returnedIds` non-leak assertion (covers VIZ-01 merge + D-04 + SC-5 isolation).
- [ ] Extend `agent/test/envelope.test.ts` — `RetrievalPathEdge` parse + `edges` defaults to `[]`.
- [ ] Extend `agent/test/hybridRetrieve.test.ts` / `bridgeResolve.test.ts` — assert `kind:'traversed'` edges match the AQL-returned `edge._id` set (live-guarded, reuse existing `canRun` guard).
- Framework install: none — Vitest already present.

## Security Domain

> `security_enforcement` absent in config → enabled. Phase touches AQL and the shared contract.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod (`RetrievalPathEdge`, existing tool inputSchemas) — unchanged inputs; no new user input surface. |
| V6 Cryptography | no | No crypto. Synthetic edge ids are deterministic concatenations, not security tokens. |
| Injection (AQL) | yes | The enriched RETURN adds only the `edge` variable and static literals; **no new bind values, no interpolated names**. `RELATIONS`/`same_as`/`DOCUMENTS` remain `literal()`/string-constant. Injection surface is UNCHANGED. |
| Secrets exposure | yes | Edges must never serialize `OPENAI_API_KEY`/`ARANGO_*` (existing tool discipline; edges carry only `_id/_from/_to/collection/kind/label`). |

### Known Threat Patterns for {ArangoDB AQL + AI SDK agent}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| AQL injection via collection/edge name | Tampering | All collection/edge names are `literal()` or module constants — never from input (verified in all 3 tools). The new `edge` variable adds no input surface. |
| DoS via unbounded traversal | DoS | Existing `LIMIT`/`k*4` bounds unchanged; the `, edge` variable does not change result cardinality. |
| Provenance spoofing (fabricated traversal) | Repudiation/Tampering | D-04 guard test — a `traversed` edge not in the AQL-returned set fails the build. This is the core security control of the phase. |

## Sources

### Primary (HIGH confidence — direct source read this session)
- `agent/src/envelope.ts` — `RetrievalPathFragment` `{graph, collection, _ids, query}`, `GraphEnum`, `CitationSchema`, `EnvelopeSchema` (groundingScore required). Where `RetrievalPathEdge` + `edges[]` go.
- `agent/src/retrievalPath.ts` — `mergeRetrievalPaths` group key `graph::collection::query`, first-seen dedup, null-strip chokepoint. Edge merge extends this.
- `agent/src/tools/hybridRetrieve.ts` — verbatim `1..1 OUTBOUND chunkId PART_OF (customer360_Relations)` RETURN (lines 110–123); fragment built lines 126–131.
- `agent/src/tools/bridgeResolve.ts` — `1..1 INBOUND hub._id same_as` two subqueries (lines 55–64); fragment lines 76–83; `SPLIT(_id,"/")[0]` idiom line 58.
- `agent/src/tools/structuredQuery.ts` — `buildPath` (45–56); account-scoped `FILTER account_id == @accountId` lookups, NO traversal (confirms D-02/SC-4).
- `agent/src/tools/entityLookup.ts` — **CONFIRMED: walks NO edge.** It is `FOR h IN canonical_entities FILTER LIKE(LOWER(h.display_name), @needle)` (lines 43–54) — a substring scan, not a traversal. Emits no `traversed` edge. (Resolves the CONTEXT "confirm during planning" item definitively.)
- `agent/src/grounding.ts` — `enforceGrounding` reads `citations[]._id` vs `returnedIds`; never reads `edges` (confirms additivity, SC-5).
- `agent/src/agent.ts` — `returnedIds` from `frag._ids` (line 332); fragments collected (322–335); `mergeRetrievalPaths([...synth, ...fragments])` (345); `SynthRetrievalPath` is model-authored, non-authoritative.
- `agent/src/stream.ts` — identical fragment-collection loop (109–122) + same `mergeRetrievalPaths` (130) + same `enforceGrounding` (134). Confirms edges flow through streaming for free.
- `agent/package.json` — `zod@4.4.3`, `arangojs@10.3.1`, `ai@6.0.208`, `vitest`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
- `scripts/eval-gate.ts` — the LOCKED pre-demo gate; `npx tsx scripts/eval-gate.ts`; exit 0=GREEN.
- `.planning/REQUIREMENTS.md` §VIZ-01/VIZ-02 — requirement text (edges, 3 edge styles).
- `.planning/ROADMAP.md` Phase 10 SC-1..SC-5 + Phase 999.1 verified technical spine.
- `.planning/phases/10-.../10-CONTEXT.md` — D-01..D-05 decisions.

### Secondary (MEDIUM)
- Project memory `agent-loop-shared-factory` — eval gate tests only the non-streaming path; smoke-test streaming before demos.
- Project memory `account-addition-checklist`, `arango-connection` — `Account._key == account_id` (informs A2).

### Tertiary (LOW — flagged ASSUMED)
- ArangoDB `FOR v, e IN` two-variable traversal semantics (A1) — standard AQL; verify in arangosh Wave 0 if desired.

## Metadata

**Confidence breakdown:**
- Edge data model / Zod shape: HIGH — direct source read; Zod 4.4.3 confirmed.
- Architecture (merge, isolation, streaming): HIGH — both code paths read; grounding isolation verified.
- AQL edge capture: HIGH-MEDIUM — code shape verified; `FOR v,e` semantics ASSUMED (A1, low risk, standard AQL).
- Honesty contract / D-04: HIGH — mirrors verified `grounding.ts` returnedIds discipline.
- D-05 recommendation: HIGH — driven by verified REQUIREMENTS §VIZ-02 wording (edge styles).

**Research date:** 2026-06-23
**Valid until:** stable — this is an internal contract over a shipped v1; no fast-moving external dependency. Re-verify only if `envelope.ts`/`retrievalPath.ts`/the three tools change before planning.
