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
//   - never interpolate a collection or field name from input,
//   - every query FILTERs on account_id and is LIMIT-bounded (T-05-05 DoS),
//   - facet routed by a Zod enum; unknown facets rejected before any AQL runs.
//
// Each branch returns { data, retrievalPath } where retrievalPath is the shared
// RetrievalPathFragment { graph, collection, _ids, query } carrying the real
// ArangoDB _ids the query returned (the grounding anchors the planner merges).
//
// Field names are live-verified (RESEARCH §Live Data Layer, probed 2026-06-18).
// NPS exposes BOTH the GREEN numeric (score/nps_score) AND the RED free-text
// (verbatim_sentiment) — the green-vs-red split critical for Q12/Q2.

import { tool } from 'ai';
import { aql } from 'arangojs';
import { z } from 'zod';
import { db } from '../db.js';
import type { RetrievalPathFragmentT } from '../envelope.js';

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

function buildPath(
  collection: string,
  data: Array<Record<string, unknown>>,
  query: string,
): RetrievalPathFragmentT {
  return {
    graph: 'structured',
    collection,
    _ids: data.map((d) => d._id as string),
    query,
  };
}

/**
 * One curated, read-only, LIMIT-bounded AQL per facet. accountId is the ONLY
 * bind value; every collection/field name below is a string literal in the
 * template (never interpolated from input).
 */
async function runFacet(
  accountId: string,
  facet: StructuredFacetT,
): Promise<StructuredResult> {
  switch (facet) {
    case 'usage': {
      const cursor = await db.query(aql`
        FOR u IN UsageFact
          FILTER u.account_id == ${accountId}
          SORT u.period DESC
          LIMIT 12
          RETURN {
            _id: u._id, period: u.period, edition: u.edition,
            query_volume_m: u.query_volume_m, cluster_nodes: u.cluster_nodes,
            graphrag_enabled: u.graphrag_enabled,
            smartgraphs_enabled: u.smartgraphs_enabled
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'UsageFact',
          data,
          'FOR u IN UsageFact FILTER u.account_id == @accountId SORT u.period DESC LIMIT 12',
        ),
      };
    }

    case 'contract': {
      const cursor = await db.query(aql`
        FOR c IN Contract
          FILTER c.account_id == ${accountId}
          SORT c.renewal_date ASC
          LIMIT 12
          RETURN {
            _id: c._id, value_usd: c.value_usd, renewal_date: c.renewal_date,
            days_to_renewal: c.days_to_renewal, auto_renew: c.auto_renew,
            status: c.status, product_scope: c.product_scope,
            signed_date: c.signed_date, end_date: c.end_date
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Contract',
          data,
          'FOR c IN Contract FILTER c.account_id == @accountId SORT c.renewal_date ASC LIMIT 12',
        ),
      };
    }

    case 'nps': {
      // Both the GREEN numeric (score/nps_score) AND the RED free-text
      // (verbatim_sentiment) — the green-vs-red split (Q12/Q2).
      const cursor = await db.query(aql`
        FOR n IN NPS
          FILTER n.account_id == ${accountId}
          SORT n.survey_date DESC
          LIMIT 30
          RETURN {
            _id: n._id, score: n.score, nps_score: n.nps_score,
            verbatim_sentiment: n.verbatim_sentiment,
            survey_date: n.survey_date, survey_period: n.survey_period
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'NPS',
          data,
          'FOR n IN NPS FILTER n.account_id == @accountId SORT n.survey_date DESC LIMIT 30',
        ),
      };
    }

    case 'contact': {
      const cursor = await db.query(aql`
        FOR p IN Contact
          FILTER p.account_id == ${accountId}
          LIMIT 30
          RETURN {
            _id: p._id, full_name: p.full_name, role: p.role,
            title: p.title, email: p.email, active_from: p.active_from
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Contact',
          data,
          'FOR p IN Contact FILTER p.account_id == @accountId LIMIT 30',
        ),
      };
    }

    case 'opportunity': {
      const cursor = await db.query(aql`
        FOR o IN Opportunity
          FILTER o.account_id == ${accountId}
          SORT o.close_date DESC
          LIMIT 12
          RETURN {
            _id: o._id, amount_usd: o.amount_usd, stage: o.stage,
            opportunity_type: o.opportunity_type, product_scope: o.product_scope,
            close_date: o.close_date, renewal_date: o.renewal_date
          }
      `);
      const data = await cursor.all();
      return {
        data,
        retrievalPath: buildPath(
          'Opportunity',
          data,
          'FOR o IN Opportunity FILTER o.account_id == @accountId SORT o.close_date DESC LIMIT 12',
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
