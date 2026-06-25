// agent/src/tools/crossGraphJoin.ts
//
// Specialist 5 (GRAPH-03b) — the structured↔unstructured cross-graph JOIN, executed
// as ONE read-only AQL across the `same_as` bridge:
//   canonical hub
//     → INBOUND  same_as            → KG entity   (customer360_Entities)
//     → OUTBOUND MENTIONED_IN        → Chunk       (customer360_Chunks)
//     → OUTBOUND PART_OF             → Document    (customer360_Documents)
// This REPLACES today's TypeScript-stitched / LLM-prose join (hybridRetrieve +
// structured stitched separately in the planner). "One database, one query language" —
// the cross-graph join is the demo hero; the EXPL-01 pipeline spotlights its `same_as`
// stage (which is why the fragment's collection is 'same_as').
//
// HONESTY (SC-2 / D-04): every traversed edge is captured VERBATIM from the AQL RETURN
// ({_id,_from,_to,label}) so enforceEdgeHonesty (shared by both agent loops) can verify
// each edge _id was actually returned. Edge _ids are provenance, NEVER citations —
// the fragment's _ids are the node ids ONLY (hub/kg/chunk/doc), preserving SC-5 isolation.
//
// SECURITY:
//  - ONE read-only AQL. accountId / entityId are the ONLY bind values (auto
//    bind-parameterized by the arangojs `aql` tag → injection-safe); every collection
//    name is a string LITERAL. 1..1 per hop + LIMIT 20 bound the traversal (T-14-04/06).
//  - cluster-mode requires the FULL `WITH` clause or the traversal silently returns 0
//    (Pitfall 2).
//  - `customer360_Relations` carries the type field `type` — the legacy
//    relation-type column is null on every row, live-verified; filter on `type`.
//  - NEW CONTROL (RESEARCH §Security Domain / T-14-05): the returned chunk `content`
//    is routed through `sanitizeUntrustedContent` + <untrusted_document> delimiters at
//    tool-return — the same chokepoint hybridRetrieve uses — because this is a NEW path
//    where document text enters the planner's context.

import { tool } from 'ai';
import { aql } from 'arangojs';
import { db } from '../db.js';
import { z } from 'zod';
import {
  sanitizeUntrustedContent,
  UNTRUSTED_OPEN,
  UNTRUSTED_CLOSE,
} from '../sanitize.js';
import type { RetrievalPathFragmentT, RetrievalPathEdgeT } from '../envelope.js';

/** One traversed edge captured verbatim from the AQL RETURN (SC-2). */
interface JoinEdge {
  _id: string;
  _from: string;
  _to: string;
  label: 'same_as' | 'MENTIONED_IN' | 'PART_OF';
}

/**
 * One join row: the four traversed node _ids (hub→KG→chunk→doc), the sanitized +
 * delimiter-wrapped chunk text, the owning document's account_id + citable_url, and the
 * three traversed edges captured verbatim.
 *
 * `chunk_content` is the planner-read field — already sanitized + wrapped. `edges` drives
 * the kind:'traversed' entries in retrievalPath.edges.
 */
export interface CrossGraphJoinRow {
  hub: string;
  kg: string;
  chunk: string;
  doc: string;
  chunk_content: string;
  account_id?: string;
  citable_url?: string;
  edges: JoinEdge[];
}

export interface CrossGraphJoinResult {
  data: CrossGraphJoinRow[];
  retrievalPath: RetrievalPathFragmentT;
}

/** Raw shape the AQL RETURN produces (pre-sanitization). */
interface RawJoinRow {
  hub: string;
  kg: string;
  chunk: string;
  doc: string;
  chunk_content: string | null;
  account_id?: string;
  citable_url?: string;
  edges: JoinEdge[];
}

/**
 * The tool's input contract — exported so tests assert against the SAME Zod object the
 * tool registers. Required `accountId` (account-cluster anchor, the default for
 * account-scoped questions); optional `entityId` swaps the anchor to a single canonical
 * identity (a named person/contract), mirroring hybridRetrieve's optional accountId
 * (RESEARCH Open Question 1 / Code Examples #3).
 */
export const crossGraphJoinInput = z.object({
  accountId: z
    .string()
    .describe('the account identity cluster to anchor the join on (== hub.account_id)'),
  entityId: z
    .string()
    .optional()
    .describe(
      'optional canonical_id — when set, anchors the join on a single named entity ' +
        '(== hub.canonical_id) instead of the whole account cluster',
    ),
});

/**
 * Core logic, separated so it is unit/integration-testable and reusable by the planner.
 *
 * ONE AQL statement executes the full hub→KG→chunk→doc join. The optional
 * `entityId` swaps only the hub anchor FILTER via the supported `${cond ? aql`…` : aql``}`
 * composition idiom (bind-safe — accountId/entityId are the only bind values).
 */
export async function runCrossGraphJoin(args: {
  accountId: string;
  entityId?: string;
}): Promise<CrossGraphJoinResult> {
  const { accountId, entityId } = args;

  // Anchor: account-cluster (default) OR a single canonical identity (entityId).
  // Only accountId/entityId are bind values; collection/field names are literals.
  const hubAnchor = entityId
    ? aql`FILTER hub.canonical_id == ${entityId}`
    : aql`FILTER hub.account_id == ${accountId}`;

  // Single-AQL cross-graph join (RESEARCH §Code Examples #2). Full WITH (cluster mode,
  // Pitfall 2); filter on the live `type` field; 1..1 per hop; LIMIT 20 (T-14-06).
  // Every traversed edge captured verbatim for the edges[] honesty contract (SC-2).
  // chunk_content is fetched here as raw text; it is sanitized + wrapped in TS below
  // (NEVER in AQL — keeps the query bind-safe and the transform unit-testable).
  const cursor = await db.query(aql`
    WITH Account, Contact, Contract, canonical_entities, customer360_Entities,
         customer360_Chunks, customer360_Documents
    FOR hub IN canonical_entities
      ${hubAnchor}
      FOR kg, eSame IN 1..1 INBOUND hub._id same_as
        FILTER IS_SAME_COLLECTION("customer360_Entities", kg)
        FOR ch, eMen IN 1..1 OUTBOUND kg._id customer360_Relations
          FILTER IS_SAME_COLLECTION("customer360_Chunks", ch)
            AND eMen.type == "MENTIONED_IN"
          FOR doc, ePart IN 1..1 OUTBOUND ch._id customer360_Relations
            FILTER IS_SAME_COLLECTION("customer360_Documents", doc)
              AND ePart.type == "PART_OF"
            LIMIT 20
            RETURN {
              hub: hub._id,
              kg: kg._id,
              chunk: ch._id,
              doc: doc._id,
              chunk_content: ch.content,
              account_id: doc.account_id,
              citable_url: doc.citable_url,
              edges: [
                { _id: eSame._id, _from: eSame._from, _to: eSame._to, label: "same_as" },
                { _id: eMen._id,  _from: eMen._from,  _to: eMen._to,  label: "MENTIONED_IN" },
                { _id: ePart._id, _from: ePart._from, _to: ePart._to, label: "PART_OF" }
              ]
            }
  `);
  const rawData = (await cursor.all()) as RawJoinRow[];

  // NEW CONTROL (T-14-05): sanitize + wrap chunk content at tool-return — the same
  // chokepoint hybridRetrieve uses. Done IN TYPESCRIPT (never in AQL, never persisted to
  // the DB). The node/edge _ids are untouched, so the grounding contract + SC-5 isolation
  // are unaffected.
  const data: CrossGraphJoinRow[] = rawData.map((r) => ({
    hub: r.hub,
    kg: r.kg,
    chunk: r.chunk,
    doc: r.doc,
    chunk_content: `${UNTRUSTED_OPEN}\n${sanitizeUntrustedContent(r.chunk_content ?? '')}\n${UNTRUSTED_CLOSE}`,
    account_id: r.account_id,
    citable_url: r.citable_url,
    edges: r.edges,
  }));

  // SC-2: build kind:'traversed' edges from the verbatim AQL-returned edge docs. Capture
  // _from/_to as-is (do not reconstruct). enforceEdgeHonesty keeps them because each _id
  // is a real AQL-returned edge id. mergeRetrievalPaths dedups downstream — duplicates ok.
  const edges: RetrievalPathEdgeT[] = data.flatMap((r) =>
    r.edges.map((e) => ({
      _id: e._id,
      _from: e._from,
      _to: e._to,
      collection: e.label === 'same_as' ? 'same_as' : 'customer360_Relations',
      kind: 'traversed' as const,
      label: e.label,
    })),
  );

  // SC-5 ISOLATION: _ids is the union of NODE ids ONLY (hub/kg/chunk/doc) — NEVER edge
  // ids. Edge provenance lives in edges[]; an edge _id is not a citable grounding anchor.
  const _ids = data.flatMap((r) => [r.hub, r.kg, r.chunk, r.doc]);

  const retrievalPath: RetrievalPathFragmentT = {
    // The join's documentary payload is the unstructured side (chunks/docs); collection
    // 'same_as' lets the EXPL-01 pipeline detect + spotlight the cross-graph join stage.
    graph: 'unstructured',
    collection: 'same_as',
    _ids,
    query:
      'canonical hub →INBOUND same_as→ KG entity →OUTBOUND MENTIONED_IN→ Chunk ' +
      '→OUTBOUND PART_OF→ Document (single AQL)',
    edges,
  };

  return { data, retrievalPath };
}

/**
 * crossGraphJoin as an AI SDK tool — wraps runCrossGraphJoin. The Zod inputSchema bounds
 * the anchor to accountId (required) + entityId (optional). Returns an empty result for an
 * unknown anchor rather than throwing (mirrors bridgeResolve's tolerance).
 */
export const crossGraphJoin = tool({
  description:
    'Execute the structured↔unstructured join as a SINGLE graph traversal across the ' +
    'same_as bridge: from an account (or a single named entity) walk to its KG entities, ' +
    'then to the document chunks that MENTION them, then to the owning Documents — ' +
    'returning that documentary evidence WITH every traversed edge as ONE provable ' +
    'traversal. Use it for cross-graph "show the join" questions where you need an ' +
    "account's documentary evidence as one traversal (it complements, not replaces, " +
    'hybridRetrieve). Returns rows (hub/kg/chunk/doc + sanitized chunk text) plus an ' +
    'unstructured retrievalPath fragment carrying the traversed same_as/MENTIONED_IN/PART_OF edges.',
  inputSchema: crossGraphJoinInput,
  execute: async ({ accountId, entityId }) => runCrossGraphJoin({ accountId, entityId }),
});
