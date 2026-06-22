// agent/src/tools/bridgeResolve.ts
//
// Specialist 3 (D-04) — the Phase-4 cross-graph entity bridge. Resolves a
// canonical entity_id to its structured leaf nodes (Account/Contact/Contract)
// AND its KG entities (customer360_Entities) via the `same_as` edge, returning
// { data, retrievalPath }.
//
// CORRECTNESS (Pitfall 4 / T-05-06): resolution keys on the STRUCTURED-SIDE
// same_as edge — start FROM the canonical hub (FILTER hub.canonical_id == @entityId)
// and traverse INBOUND same_as. ALL 9 demo-critical entities have a structured-side
// edge to their hub; the KG `entity_id` stamp covers only ~3 of 9 and is
// reporting-only. We MUST NOT gate on the KG stamp (e.g. `entity_id IN ...`).
//
// CLUSTER (Pitfall 5): the WITH clause declares every collection the traversal
// may visit — mandatory on the clustered prod deployment. Ported verbatim from
// scripts/verify_entity_bridge.py::probe_trace (RESEARCH §Code Examples).
//
// SECURITY: one read-only AQL; entityId is the only bind value (${entityId},
// auto bind-parameterized by the `aql` tag); all collection names are literals.

import { tool } from 'ai';
import { aql } from 'arangojs';
import { z } from 'zod';
import { db } from '../db.js';
import type { RetrievalPathFragmentT } from '../envelope.js';

interface BridgeNode {
  _id: string;
  collection?: string;
  entity_name?: string;
}

interface BridgeHub {
  canonical_id: string;
  display_name: string | null;
  entity_type: string | null;
  account_id: string | null;
  structured_nodes: BridgeNode[];
  kg_nodes: BridgeNode[];
}

interface BridgeResult {
  data: BridgeHub[];
  retrievalPath: RetrievalPathFragmentT;
}

async function resolve(entityId: string): Promise<BridgeResult> {
  // Ported verbatim from verify_entity_bridge.py::probe_trace, re-rooted on the
  // structured-side (canonical hub) so ALL 9 demo-critical ids resolve (Pitfall 4).
  // WITH declares all visited collections for cluster-mode (Pitfall 5).
  const cursor = await db.query(aql`
    WITH canonical_entities, Account, Contract, Contact, customer360_Entities
    FOR hub IN canonical_entities
      FILTER hub.canonical_id == ${entityId}
      LET structured = (
        FOR leaf IN 1..1 INBOUND hub._id same_as
          FILTER NOT IS_SAME_COLLECTION("customer360_Entities", leaf)
          RETURN { collection: SPLIT(leaf._id, "/")[0], _id: leaf._id }
      )
      LET kg = (
        FOR e IN 1..1 INBOUND hub._id same_as
          FILTER IS_SAME_COLLECTION("customer360_Entities", e)
          RETURN { _id: e._id, entity_name: e.entity_name }
      )
      RETURN {
        canonical_id: hub.canonical_id,
        display_name: hub.display_name,
        entity_type: hub.entity_type,
        account_id: hub.account_id,
        structured_nodes: structured,
        kg_nodes: kg
      }
  `);
  const data = (await cursor.all()) as BridgeHub[];

  const retrievalPath: RetrievalPathFragmentT = {
    graph: 'structured',
    collection: 'same_as',
    _ids: data.flatMap((d) =>
      [...d.structured_nodes, ...d.kg_nodes].map((n) => n._id),
    ),
    query: 'canonical_entities ←same_as← {structured leaves, KG entities}',
  };

  return { data, retrievalPath };
}

/**
 * Specialist tool: resolve a canonical entity_id to its structured leaves and KG
 * entities across the same_as bridge. Returns a valid empty result (data: []) for
 * an absent id rather than throwing.
 */
export const bridgeResolve = tool({
  description:
    'Resolve a canonical entity_id (a person/account/contract identity) to its structured ' +
    'leaf records (Account/Contact/Contract) AND its unstructured KG entities across the ' +
    'same_as bridge. Use this to anchor a named entity (e.g. a champion contact) before ' +
    'querying either graph. Returns the resolved hub(s) plus a retrievalPath fragment.',
  inputSchema: z.object({
    entityId: z
      .string()
      .describe('the canonical entity_id (== canonical_entities.canonical_id)'),
  }),
  execute: async ({ entityId }) => resolve(entityId),
});
