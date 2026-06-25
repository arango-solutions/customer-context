// agent/src/tools/entityLookup.ts
//
// Name → canonical-identity resolver (the planner's FIRST hop).
//
// The other three specialists are keyed by id: bridgeResolve needs a canonical_id,
// structuredQuery/hybridRetrieve need an accountId. A free-form question, however,
// names a company/person in prose ("Meridian Logistics", "the champion"). This tool
// bridges that gap: it searches canonical_entities by display_name and returns the
// canonical_id + account_id the other tools consume. Without it the planner cannot
// move from a human name to an id and stalls on the first step (the gap the Wave-2
// live smoke exposed).
//
// SECURITY (CLAUDE.md cardinal rule): one read-only AQL; `name` is the ONLY bind value
// (auto bind-parameterized by the arangojs `aql` tag → injection-safe); the collection
// name is a string literal; the query is LIMIT-bounded. No write ops.

import { tool } from 'ai';
import { aql } from 'arangojs';
import { z } from 'zod';
import { db } from '../db.js';
import type { RetrievalPathFragmentT } from '../envelope.js';

interface EntityHit {
  _id: string;
  canonical_id: string;
  display_name: string | null;
  account_id: string | null;
  entity_type: string | null;
}

export interface EntityLookupResult {
  data: EntityHit[];
  retrievalPath: RetrievalPathFragmentT;
}

async function lookup(name: string): Promise<EntityLookupResult> {
  // Case-insensitive substring match on display_name. canonical_id is the bridge key;
  // account_id scopes structuredQuery/hybridRetrieve. LIMIT-bounded (T-05 DoS).
  const needle = `%${name.toLowerCase()}%`;
  // db.query carries a bounded transient-connection retry (see db.ts) — a reused
  // serverless keep-alive socket reset is recovered transparently rather than aborting
  // the planner's first hop (debug/arango-serverless-flaky).
  const cursor = await db.query(aql`
    FOR h IN canonical_entities
      FILTER LIKE(LOWER(h.display_name), ${needle})
      LIMIT 10
      RETURN {
        _id: h._id,
        canonical_id: h.canonical_id,
        display_name: h.display_name,
        account_id: h.account_id,
        entity_type: h.entity_type
      }
  `);
  const data = (await cursor.all()) as EntityHit[];

  const retrievalPath: RetrievalPathFragmentT = {
    graph: 'structured',
    collection: 'canonical_entities',
    _ids: data.map((d) => d._id),
    query: 'FOR h IN canonical_entities FILTER LIKE(LOWER(h.display_name), @needle) LIMIT 10',
    edges: [], // entityLookup walks no edges (confirmed: substring scan only, no traversal)
  };

  return { data, retrievalPath };
}

/**
 * Specialist tool: resolve a human name (company or person) to its canonical identity
 * — canonical_id (for bridgeResolve) and account_id (for structuredQuery/hybridRetrieve).
 * Always the planner's first hop when a question names an entity in prose.
 */
export const entityLookup = tool({
  description:
    'Resolve a NAME (a company or person mentioned in the question, e.g. "Meridian Logistics" ' +
    'or "Sarah Chen") to its canonical identity: canonical_id (use with bridgeResolve) and ' +
    'account_id (use to scope structuredQuery and hybridRetrieve). Call this FIRST whenever the ' +
    'question names an entity — the other tools need an id, not a name. Returns the matching ' +
    'canonical_entities rows (organization and/or user) plus a structured retrievalPath fragment.',
  inputSchema: z.object({
    name: z
      .string()
      .describe('the company or person name as written in the question'),
  }),
  execute: async ({ name }) => lookup(name),
});
