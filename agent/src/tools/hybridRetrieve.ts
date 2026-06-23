// agent/src/tools/hybridRetrieve.ts
//
// Specialist 2 (D-04) — hybridRetrieve: the unstructured / hybrid-retrieval tool.
// Vector (APPROX_NEAR_COSINE) + BM25 (ArangoSearch) over customer360_Chunks,
// fused by RRF in TypeScript (fuseRRF — NOT in AQL, Pitfall 6), then traversed
// 1..1 OUTBOUND PART_OF over customer360_Relations to the owning
// customer360_Documents for sourcing (account_id + citable_url + content). It is
// the counterpart to structuredQuery; the Q12 centerpiece (Wave 2) reconciles its
// RED sentiment chunks against structuredQuery's GREEN usage.
//
// Query shape is ported VERBATIM from the 05-01 hybridSpike (proven live:
// fused=41 / 15 sourced to Meridian / redSignal=true) — do not re-derive it.
//
// Security (threat register T-05-07..10):
//  - All collection/view/analyzer names are STRING LITERALS (via literal()).
//  - queryText, accountId, k, qVec are the ONLY bind values (aql tag → injection-safe).
//  - The conditional account filter uses the supported ${cond ? aql`…` : aql``} idiom.
//  - Both AQL calls are LIMIT-bounded (k*4); k is Zod-bounded 1..20.
//  - Reads only; the BM25 leg queries the Chunks VIEW, never customer360_sources (Pitfall 1).
//  - OPENAI_API_KEY is never serialized into data/retrievalPath.

import { tool } from 'ai';
import { z } from 'zod';
import { aql } from 'arangojs';
import { literal } from 'arangojs/aql';
import { db } from '../db.js';
import { embedQuery } from '../embed.js';
import { fuseRRF } from '../rrf.js';
import type { RetrievalPathFragmentT, RetrievalPathEdgeT } from '../envelope.js';

// Whitelisted collection / view names (module constants — never user input).
const CHUNKS = 'customer360_Chunks';
const VIEW = 'customer360_chunks_search_view';
const RELATIONS = 'customer360_Relations';
const DOCUMENTS = 'customer360_Documents';

/** One sourced chunk row: the chunk + its PART_OF Document anchor.
 *
 * Phase 10 (10-02): `edge` carries the AQL-returned PART_OF edge document
 * verbatim ({ _id, _from, _to }). The planner-read fields (chunk_id/content/
 * account_id/citable_url/file_name) are UNCHANGED — additive only.
 */
export interface HybridChunk {
  chunk_id: string;
  content: string;
  account_id: string;
  citable_url?: string;
  file_name?: string;
  /** The PART_OF edge doc (AQL-returned verbatim). Present only when the
   * sourcing traversal returns ≥1 document. Drives the kind:'traversed' entries
   * in retrievalPath.edges (SC-1, D-04). */
  edge?: { _id: string; _from: string; _to: string };
}

export interface HybridRetrieveResult {
  data: HybridChunk[];
  retrievalPath: RetrievalPathFragmentT;
}

/**
 * The tool's input contract. Exported so tests assert the k bound (1..20) against
 * the SAME Zod object the tool registers — the AI SDK widens tool.inputSchema to a
 * FlexibleSchema that drops Zod's .parse at the type level.
 */
export const hybridRetrieveInput = z.object({
  queryText: z.string(),
  accountId: z.string().optional(),
  k: z.number().int().min(1).max(20).default(8),
});

/**
 * Core logic, separated so it is unit-testable and reusable by the planner.
 * (1) embed the query 512-dim; (2) vector AQL → ranked _ids; (3) BM25 AQL over
 * the view → ranked _ids; (4) RRF-fuse in TS, take top k; (5) PART_OF traversal
 * to the Document for account-scoped sourcing.
 */
export async function runHybridRetrieve(args: {
  queryText: string;
  accountId?: string;
  k?: number;
}): Promise<HybridRetrieveResult> {
  const { queryText, accountId, k = 8 } = args;
  const topN = k * 4;

  // (1) 512-dim query embedding (matches the live Chunks vector index).
  const qVec = await embedQuery(queryText);

  // (2) Vector: APPROX_NEAR_COSINE over Chunks.embedding → ranked _ids.
  const vecCursor = await db.query(aql`
    FOR c IN ${literal(CHUNKS)}
      LET s = APPROX_NEAR_COSINE(c.embedding, ${qVec})
      SORT s DESC
      LIMIT ${topN}
      RETURN c._id
  `);
  const vectorIds = (await vecCursor.all()) as string[];

  // (3) BM25: SEARCH over the Chunks view (NOT customer360_sources — Pitfall 1).
  const bmCursor = await db.query(aql`
    FOR v IN ${literal(VIEW)}
      SEARCH ANALYZER(v.content IN TOKENS(${queryText}, "text_en"), "text_en")
      SORT BM25(v) DESC
      LIMIT ${topN}
      RETURN v._id
  `);
  const bm25Ids = (await bmCursor.all()) as string[];

  // (4) RRF fuse in TypeScript (Pitfall 6 — not in AQL), take the top k _ids.
  const fused = fuseRRF(vectorIds, bm25Ids);
  const topK = fused.slice(0, k).map((e) => e._id);

  // (5) Sourcing traversal: PART_OF → Document. WITH declares visited collections
  // (Pitfall 5 — clustered traversals need it). Conditional account scope via the
  // supported ${cond ? aql`…` : aql``} composition idiom (bind-safe).
  const accountFilter = accountId
    ? aql`FILTER doc.account_id == ${accountId}`
    : aql``;

  // Phase 10 (10-02): add `, edge` second loop variable to capture the PART_OF
  // edge document verbatim (_id/_from/_to). Pitfall 1: the single-variable form
  // returns only the vertex. Pitfall 2: capture e._from/_to as-is (OUTBOUND
  // direction: _from = chunk, _to = document).
  const srcCursor = await db.query(aql`
    WITH ${literal(DOCUMENTS)}, ${literal(CHUNKS)}
    FOR chunkId IN ${topK}
      FOR doc, edge IN 1..1 OUTBOUND chunkId ${literal(RELATIONS)}
        FILTER IS_SAME_COLLECTION(${DOCUMENTS}, doc)
        ${accountFilter}
        RETURN {
          chunk_id: chunkId,
          content: DOCUMENT(chunkId).content,
          account_id: doc.account_id,
          citable_url: doc.citable_url,
          file_name: doc.file_name,
          edge: { _id: edge._id, _from: edge._from, _to: edge._to }
        }
  `);
  const data = (await srcCursor.all()) as HybridChunk[];

  // SC-1: Build kind:'traversed' PART_OF edges from the AQL-returned edge docs.
  // Capture _from/_to verbatim from the edge document (Pitfall 2 — do not reconstruct).
  const partOfEdges: RetrievalPathEdgeT[] = data
    .filter((d) => d.edge != null)
    .map((d) => ({
      _id: d.edge!._id,
      _from: d.edge!._from,
      _to: d.edge!._to,
      collection: RELATIONS,
      kind: 'traversed' as const,
      label: 'PART_OF',
    }));

  // D-05: Synthesize kind:'hybrid' edges from a fixed question anchor to each chunk.
  // One edge per retrieved chunk; _id is deterministic (no random/uuid). No score
  // fields (D-03). The anchor 'question/current' is the VIZ-02 entry point.
  const QUESTION_ANCHOR = 'question/current';
  const hybridEdges: RetrievalPathEdgeT[] = data.map((d) => ({
    _id: `hybrid:${QUESTION_ANCHOR}:${d.chunk_id}`,
    _from: QUESTION_ANCHOR,
    _to: d.chunk_id,
    collection: 'hybrid',
    kind: 'hybrid' as const,
    label: 'hybrid',
  }));

  const retrievalPath: RetrievalPathFragmentT = {
    graph: 'unstructured',
    collection: CHUNKS,
    _ids: data.map((d) => d.chunk_id),
    query: 'vector+BM25+RRF over Chunks → PART_OF Document',
    // SC-1: traversed PART_OF edges + D-05: hybrid question→chunk edges
    edges: [...partOfEdges, ...hybridEdges],
  };

  return { data, retrievalPath };
}

/**
 * hybridRetrieve as an AI SDK tool — wraps runHybridRetrieve. The Zod inputSchema
 * bounds k to 1..20, so an out-of-range k is rejected before any AQL runs.
 */
export const hybridRetrieve = tool({
  description:
    'Hybrid (vector + BM25 + RRF) retrieval over the unstructured doc KG (customer360_Chunks) for a query, optionally scoped to one account. Returns chunks sourced via PART_OF to their Document (account_id, citable_url), plus an unstructured retrievalPath fragment.',
  inputSchema: hybridRetrieveInput,
  execute: async ({ queryText, accountId, k }) =>
    runHybridRetrieve({ queryText, accountId, k }),
});
