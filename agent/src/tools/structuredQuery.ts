// agent/src/tools/structuredQuery.ts
//
// Specialist 1 (D-04) — curated, read-only AQL over the structured named graph
// `customer360_structured` (Salesforce/Snowflake/DocuSign). One hardcoded query
// per facet; the Zod enum is the ONLY routing. Collection + field names are STRING
// LITERALS inside the `aql` template — accountId is the only bind value (${accountId}),
// auto bind-parameterized by the arangojs `aql` tag (injection-safe, T-05-04).
//
// SECURITY (CLAUDE.md cardinal rule + RESEARCH §Security Domain / §Anti-Patterns):
//   - read-only AQL (FOR ... RETURN; no write ops),
//   - never interpolate a collection / edge / field name from input (HAS_* edge
//     names and field names are STRING LITERALS in the template; accountId is the
//     ONLY bind value, embedded only via the account anchor `Account/${accountId}`),
//   - every non-account query is a single-hop 1..1 OUTBOUND traversal (bounded depth)
//     and LIMIT-bounded (12/30) (T-14-02 DoS); the account facet is a LIMIT 1 lookup,
//   - facet routed by a Zod enum; unknown facets rejected before any AQL runs.
//
// Each branch returns { data, retrievalPath } where retrievalPath is the shared
// RetrievalPathFragment { graph, collection, _ids, query, edges[] } carrying the real
// ArangoDB _ids the query returned (the grounding anchors the planner merges) and,
// for non-account facets, the real traversed HAS_* edges (GRAPH-03a / SC-1).
//
// Field names are live-verified (RESEARCH §Live Data Layer, probed 2026-06-18).
// NPS exposes BOTH the GREEN numeric (score/nps_score) AND the RED free-text
// (verbatim_sentiment) — the green-vs-red split critical for Q12/Q2.
//
// TRAVERSED EDGES (Phase 14-01, GRAPH-03a — "stop querying the graph DB like SQL"):
// Each non-account facet is a REAL named-graph traversal
//   FOR leaf, edge IN 1..1 OUTBOUND Account/<id> HAS_*
// over the existing `customer360_structured` HAS_* edge collections (all directed
// Account → leaf). The traversal returns the IDENTICAL `_id` set as the prior flat
// `FILTER x.account_id == @id` scan (live-verified 2026-06-25: usage 18==18, every
// facet IDENTICAL — Account._key == account_id, so `Account/${accountId}` is a valid
// anchor; each leaf has exactly one HAS_* edge). Because it now actually walks the
// edge, structuredQuery promotes the prior synthesized `kind:'structural'` edges to
// REAL `kind:'traversed'` edges, built verbatim from the AQL-returned edge document:
//   _id:   edge._id   — the REAL ArangoDB edge id (e.g. "HAS_USAGE/<acct>_<leaf>").
//                       NEVER synthesized (no `structural:` marker, no uuid4/Math.random).
//   _from: edge._from — `Account/${accountId}` (captured verbatim, not reconstructed).
//   _to:   edge._to   — the leaf record `_id` (captured verbatim).
//   kind:  'traversed' — survives `enforceEdgeHonesty` because the _id is AQL-returned.
//   collection/label: the HAS_* edge collection name (honest provenance).
// The `account` facet stays a single-vertex lookup (there is no edge to traverse to
// itself); it emits NO traversed edge — no fabricated self-traversal (SC-1 honesty).

import { tool } from 'ai';
import { aql } from 'arangojs';
import { z } from 'zod';
import { db } from '../db.js';
import type { RetrievalPathFragmentT, RetrievalPathEdgeT } from '../envelope.js';

/** The curated facets — the only routing surface. No generated AQL. */
export const StructuredFacet = z.enum([
  'usage',
  'contract',
  'nps',
  'contact',
  'opportunity',
  'account',
]);
export type StructuredFacetT = z.infer<typeof StructuredFacet>;

interface StructuredResult {
  data: Array<Record<string, unknown>>;
  retrievalPath: RetrievalPathFragmentT;
}

/** The AQL-returned HAS_* edge document, captured verbatim from the traversal RETURN. */
interface TraversedEdge {
  _id: string;
  _from: string;
  _to: string;
}

/**
 * Build a RetrievalPathFragment for a curated structured-query result.
 *
 * GRAPH-03a (Phase 14-01): for the five non-account facets, every row carries an
 * `edge` field — the REAL HAS_* edge document the OUTBOUND traversal returned. We
 * build one `kind:'traversed'` RetrievalPathEdge per row directly from that edge
 * document (verbatim _id/_from/_to; never synthesized). These survive
 * `enforceEdgeHonesty` because every _id was AQL-returned.
 *
 * The `account` facet passes `hasEdge === undefined` (no traversal — a single-vertex
 * lookup): no traversed edge is emitted, so the Account vertex never claims a
 * fabricated self-traversal (SC-1 honesty clause).
 */
function buildPath(
  collection: string,
  data: Array<Record<string, unknown>>,
  query: string,
  hasEdge?: string,
): RetrievalPathFragmentT {
  const edges: RetrievalPathEdgeT[] =
    hasEdge == null
      ? [] // account facet: vertex lookup, no edge to traverse to itself
      : data
          .map((d) => d.edge as TraversedEdge | undefined)
          .filter((e): e is TraversedEdge => e != null)
          .map((e) => ({
            // REAL AQL-returned HAS_* edge id (e.g. "HAS_USAGE/<acct>_<leaf>") — never
            // synthesized; no `structural:` marker, no uuid4/Math.random (Pitfall 5).
            _id: e._id,
            _from: e._from, // Account/${accountId} (captured verbatim)
            _to: e._to, // leaf record _id (captured verbatim)
            collection: hasEdge,
            kind: 'traversed' as const,
            label: hasEdge,
          }));

  return {
    graph: 'structured',
    collection,
    // Grounding anchors stay the leaf record _ids — unchanged from the flat scan.
    _ids: data.map((d) => d._id as string),
    query,
    edges,
  };
}

/**
 * One curated, read-only, LIMIT-bounded AQL per facet. accountId is the ONLY
 * bind value; every collection/field name below is a string literal in the
 * template (never interpolated from input).
 */
export async function runFacet(
  accountId: string,
  facet: StructuredFacetT,
): Promise<StructuredResult> {
  switch (facet) {
    case 'usage': {
      const cursor = await db.query(aql`
        WITH Account, UsageFact
        FOR u, edge IN 1..1 OUTBOUND ${`Account/${accountId}`} HAS_USAGE
          SORT u.period DESC
          LIMIT 12
          RETURN {
            _id: u._id, period: u.period, edition: u.edition,
            query_volume_m: u.query_volume_m, cluster_nodes: u.cluster_nodes,
            graphrag_enabled: u.graphrag_enabled,
            smartgraphs_enabled: u.smartgraphs_enabled,
            edge: { _id: edge._id, _from: edge._from, _to: edge._to }
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'UsageFact',
          data,
          'FOR u IN 1..1 OUTBOUND Account/@accountId HAS_USAGE SORT u.period DESC LIMIT 12',
          'HAS_USAGE',
        ),
      };
    }

    case 'contract': {
      const cursor = await db.query(aql`
        WITH Account, Contract
        FOR c, edge IN 1..1 OUTBOUND ${`Account/${accountId}`} HAS_CONTRACT
          SORT c.renewal_date ASC
          LIMIT 12
          RETURN {
            _id: c._id, value_usd: c.value_usd, renewal_date: c.renewal_date,
            days_to_renewal: c.days_to_renewal, auto_renew: c.auto_renew,
            status: c.status, product_scope: c.product_scope,
            signed_date: c.signed_date, end_date: c.end_date,
            edge: { _id: edge._id, _from: edge._from, _to: edge._to }
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Contract',
          data,
          'FOR c IN 1..1 OUTBOUND Account/@accountId HAS_CONTRACT SORT c.renewal_date ASC LIMIT 12',
          'HAS_CONTRACT',
        ),
      };
    }

    case 'nps': {
      // Both the GREEN numeric (score/nps_score) AND the RED free-text
      // (verbatim_sentiment) — the green-vs-red split (Q12/Q2).
      const cursor = await db.query(aql`
        WITH Account, NPS
        FOR n, edge IN 1..1 OUTBOUND ${`Account/${accountId}`} HAS_NPS
          SORT n.survey_date DESC
          LIMIT 30
          RETURN {
            _id: n._id, score: n.score, nps_score: n.nps_score,
            verbatim_sentiment: n.verbatim_sentiment,
            survey_date: n.survey_date, survey_period: n.survey_period,
            edge: { _id: edge._id, _from: edge._from, _to: edge._to }
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'NPS',
          data,
          'FOR n IN 1..1 OUTBOUND Account/@accountId HAS_NPS SORT n.survey_date DESC LIMIT 30',
          'HAS_NPS',
        ),
      };
    }

    case 'contact': {
      const cursor = await db.query(aql`
        WITH Account, Contact
        FOR p, edge IN 1..1 OUTBOUND ${`Account/${accountId}`} HAS_CONTACT
          LIMIT 30
          RETURN {
            _id: p._id, full_name: p.full_name, role: p.role,
            title: p.title, email: p.email, active_from: p.active_from,
            edge: { _id: edge._id, _from: edge._from, _to: edge._to }
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Contact',
          data,
          'FOR p IN 1..1 OUTBOUND Account/@accountId HAS_CONTACT LIMIT 30',
          'HAS_CONTACT',
        ),
      };
    }

    case 'opportunity': {
      const cursor = await db.query(aql`
        WITH Account, Opportunity
        FOR o, edge IN 1..1 OUTBOUND ${`Account/${accountId}`} HAS_OPPORTUNITY
          SORT o.close_date DESC
          LIMIT 12
          RETURN {
            _id: o._id, amount_usd: o.amount_usd, stage: o.stage,
            opportunity_type: o.opportunity_type, product_scope: o.product_scope,
            close_date: o.close_date, renewal_date: o.renewal_date,
            edge: { _id: edge._id, _from: edge._from, _to: edge._to }
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Opportunity',
          data,
          'FOR o IN 1..1 OUTBOUND Account/@accountId HAS_OPPORTUNITY SORT o.close_date DESC LIMIT 12',
          'HAS_OPPORTUNITY',
        ),
      };
    }

    case 'account': {
      const cursor = await db.query(aql`
        FOR a IN Account
          FILTER a.account_id == ${accountId}
          LIMIT 1
          RETURN {
            _id: a._id, account_name: a.account_name, segment: a.segment,
            health_score: a.health_score, products_contracted: a.products_contracted,
            deployment_date: a.deployment_date, last_activity_date: a.last_activity_date
          }
      `);
      const data = await cursor.all();
      return {
        data,
        // account facet: single-vertex lookup — pass no HAS_* edge so buildPath
        // emits NO traversed edge (no fabricated Account→Account self-traversal).
        retrievalPath: buildPath(
          'Account',
          data,
          'FOR a IN Account FILTER a.account_id == @accountId LIMIT 1',
        ),
      };
    }
  }
}

/**
 * Specialist tool: curated structured-graph retrieval, one read-only AQL per
 * facet, scoped by account_id, returning { data, retrievalPath }.
 */
export const structuredQuery = tool({
  description:
    'Query the structured graph (Salesforce/Snowflake/DocuSign) for one account by facet: ' +
    'usage (UsageFact), contract (Contract), nps (NPS — both score and verbatim_sentiment), ' +
    'contact (Contact), opportunity (Opportunity), account (Account). ' +
    'Returns the rows plus a retrievalPath fragment with the real ArangoDB _ids.',
  inputSchema: z.object({
    accountId: z
      .string()
      .describe('canonical account entity_id (== Account._key == account_id)'),
    facet: StructuredFacet.describe('which structured facet to retrieve'),
  }),
  execute: async ({ accountId, facet }) => runFacet(accountId, facet),
});
