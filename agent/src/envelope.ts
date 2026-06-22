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
export const CitationSchema = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _id: z.string(), // the real ArangoDB _id (the grounding anchor)
  aql: z.string(), // the query that produced it
  traversal: z.string().optional(), // e.g. "Chunk -PART_OF-> Document"
});
export type Citation = z.infer<typeof CitationSchema>;

/** One factual atom of the answer, carrying its own citation(s) (D-03). */
export const ClaimSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Per-tool retrieval-path fragment. Each specialist returns one of these
 * alongside its data; the planner merges them into the envelope's
 * retrievalPath[] (see retrievalPath.ts::mergeRetrievalPaths).
 */
export const RetrievalPathFragment = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _ids: z.array(z.string()),
  query: z.string(),
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
