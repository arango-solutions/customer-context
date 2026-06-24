// agent/src/envelope.ts
//
// THE shared contract (D-03a). This Zod schema is imported UNCHANGED by the
// Phase 5 specialists/planner, by Phase 6 (Next.js route + citation UI), and by
// Phase 7 (eval harness). Define it once here; never fork it.
//
// Sourcing is per-claim atoms (D-03): the synthesized answer is decomposed into
// discrete factual claims, and each claim carries its own citation(s). Every
// citation object carries the full retrieval path { graph, collection, _id, aql,
// traversal } so the UI can click-through a claim to the exact source record and
// the eval can verify grounding against real ArangoDB _ids.
//
// On a question it cannot confidently answer, the agent returns this SAME
// envelope with `refused: true`, an explicit structured refusal in `answer`, and
// whatever partial citations WERE found (D-02). Grounding drives the refusal.

import { z } from 'zod';

/** Which graph a record came from. The only two trust domains in this demo. */
export const GraphEnum = z.enum(['structured', 'unstructured']);
export type GraphKind = z.infer<typeof GraphEnum>;

/**
 * A single grounding anchor: the real ArangoDB _id that supports a claim, plus
 * the exact AQL that produced it and (optionally) the traversal description.
 */
/** Display-only key/value fact shown in the source drawer (e.g. "Tier: Enterprise"). */
export const NodeDetailField = z.object({ label: z.string(), value: z.string() });
export type NodeDetailFieldT = z.infer<typeof NodeDetailField>;

/** Display-only per-node detail: a few key fields + a long-form text body (chunk
 * content, document body, entity description, NPS verbatim). Additive — populated
 * post-grounding by nodeLabels.ts; no grounding/eval/synthesis consumer reads it. */
export const NodeDetail = z.object({
  fields: z.array(NodeDetailField).optional(),
  text: z.string().optional(),
});
export type NodeDetailT = z.infer<typeof NodeDetail>;

export const CitationSchema = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _id: z.string(), // the real ArangoDB _id (the grounding anchor)
  aql: z.string(), // the query that produced it
  traversal: z.string().optional(), // e.g. "Chunk -PART_OF-> Document"
  // Display-only enrichment (optional, additive). Real grounded citations don't set
  // these; the viz attaches them when opening the drawer for a clicked node so a
  // buyer can read the actual record content/fields. Not read by the grounding gate.
  fields: z.array(NodeDetailField).optional(),
  text: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

/** One factual atom of the answer, carrying its own citation(s) (D-03). */
export const ClaimSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Edge kind discriminator (D-01 / VIZ-01).
 *
 * - 'traversed'  — an edge actually walked by AQL (PART_OF, same_as).
 *                  Subject to the D-04 no-fabrication guard: every traversed
 *                  edge _id must appear in the AQL-returned edge set.
 * - 'structural' — a synthesized account-anchor edge (Account → record).
 *                  No real AQL traversal ran; the FK is an account_id column.
 *                  Never 'traversed'. (D-02)
 * - 'hybrid'     — a synthesized question-anchor edge (question → chunk)
 *                  representing the vector+BM25+RRF retrieval match.
 *                  Never 'traversed'. (D-05)
 */
export const EdgeKindEnum = z.enum(['traversed', 'structural', 'hybrid']);
export type EdgeKind = z.infer<typeof EdgeKindEnum>;

/**
 * One edge in the retrieval graph (VIZ-01 / D-03).
 *
 * For real traversed edges, _id is the ArangoDB edge _id (e.g.
 * 'customer360_Relations/rel_001'). For synthesized structural/hybrid edges,
 * _id is a clearly-synthetic deterministic string (e.g.
 * 'structural:${accountId}:${record._id}') or null.
 *
 * NOTE: label is one of 'PART_OF' | 'same_as' | 'account' | 'hybrid' in v1
 * but is kept z.string() for forward-compatibility (D-03 defers score metadata).
 */
export const RetrievalPathEdge = z.object({
  _id: z.string().nullable(), // real edge _id, clearly-synthetic id, or null
  _from: z.string(),
  _to: z.string(),
  collection: z.string(), // edge collection (real) or synthetic marker
  kind: EdgeKindEnum,
  label: z.string(), // 'PART_OF' | 'same_as' | 'account' | 'hybrid' (v1)
});
export type RetrievalPathEdgeT = z.infer<typeof RetrievalPathEdge>;

/**
 * Per-tool retrieval-path fragment. Each specialist returns one of these
 * alongside its data; the planner merges them into the envelope's
 * retrievalPath[] (see retrievalPath.ts::mergeRetrievalPaths).
 *
 * edges[] carries the graph edges traversed or synthesized by this tool
 * (VIZ-01). Defaults to [] so existing tools (entityLookup, etc.) that emit
 * no edges parse cleanly without any schema change. The field is additive —
 * no current consumer (grounding, eval, answer synthesis) reads edges[].
 */
export const RetrievalPathFragment = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _ids: z.array(z.string()),
  query: z.string(),
  edges: z.array(RetrievalPathEdge).default([]),
  // labels: _id → human-readable display name (e.g. canonical_entities/… → "Helio
  // Retail", Account/… → "Meridian Logistics"). Display-only; populated post-grounding
  // by nodeLabels.ts so the viz can name nodes instead of showing opaque _ids. Optional
  // + additive — tools never set it; no grounding/eval/synthesis consumer reads it.
  labels: z.record(z.string(), z.string()).optional(),
  // nodeDetails: _id → { fields, text } shown in the source drawer when a viz node is
  // clicked (chunk content, entity description, account/usage/NPS facts). Same lifecycle
  // + safety as labels: display-only, optional, populated post-grounding.
  nodeDetails: z.record(z.string(), NodeDetail).optional(),
});
export type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

/** The full answer envelope — the structured-output object the planner emits. */
export const EnvelopeSchema = z.object({
  answer: z.string(), // prose OR structured refusal text (D-02)
  refused: z.boolean().default(false),
  claims: z.array(ClaimSchema),
  citations: z.array(CitationSchema), // flattened union of claim citations
  retrievalPath: z.array(RetrievalPathFragment),
  reasoningTrace: z.array(z.string()), // planner steps, exposed separately (D-03)
  groundingScore: z.number().min(0).max(1),
  // NOTE: required, not .optional() — enforceGrounding always injects this before returning.
  // SynthEnvelopeSchema in agent.ts does NOT include this field (computed post-synthesis;
  // the planner cannot know returnedIds). Phase 11 UI-06 reads this field.
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * The shape of an envelope BEFORE enforceGrounding injects groundingScore.
 * This is the return type of toCanonicalEnvelope (agent.ts) and the parameter
 * type of enforceGrounding — keeps tsc green at every task boundary since
 * groundingScore is required in EnvelopeSchema but absent until enforceGrounding runs.
 */
export type PreGroundingEnvelope = Omit<Envelope, 'groundingScore'>;
