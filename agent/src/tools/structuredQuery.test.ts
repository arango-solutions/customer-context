// agent/src/tools/structuredQuery.test.ts
//
// Phase 14-01 (GRAPH-03a) — per-facet traversal-identity + edge-honesty tests.
//
// These prove the GRAPH-03a rewrite ("stop querying the graph DB like SQL"):
// the five non-account facets must retrieve their leaf records via a REAL
//   1..1 OUTBOUND Account/<id> HAS_*
// named-graph traversal over the existing `customer360_structured` edge
// collections, returning the IDENTICAL grounded `_id` set as today's flat
// `FILTER x.account_id == @id` scan (so the eval gate stays green) while now
// emitting each traversed `HAS_*` edge document as a `kind:'traversed'` edge
// that survives `enforceEdgeHonesty` (promoting today's synthetic
// `kind:'structural'` edges to real traversals).
//
// Honesty discipline (RESEARCH Pitfall 3): these are LIVE-DB assertions — they
// only mean something against the configured ArangoDB cluster, so they are
// skip-guarded by hasLiveDb() and never mock the DB. The flat-scan oracle is
// queried independently INSIDE each test (the FILTER form the rewrite replaces)
// so the identity assertion is self-checking, not circular.
//
// loadEnv() runs at module scope (override:true, D-06 stale-shell rule) BEFORE
// the skip-guard so the cluster creds come from .env, not a stale shell value.

import { describe, it, expect } from 'vitest';
import { aql } from 'arangojs';
import { literal } from 'arangojs/aql';
import { loadEnv, db } from '../db.js';
import { runFacet, type StructuredFacetT } from './structuredQuery.js';
import {
  traversedEdgesAreGrounded,
  enforceEdgeHonesty,
} from '../retrievalPath.js';
import type { RetrievalPathFragmentT } from '../envelope.js';

loadEnv();

import { hasLiveDb, MERIDIAN_ACCOUNT_ID } from '../../test/fixtures.js';

const live = hasLiveDb();

// The seeded account used as the identity oracle. Meridian (the Q12 centerpiece)
// has rows in all five non-account facets (RESEARCH live-verified: usage 18==18).
const ACCOUNT = MERIDIAN_ACCOUNT_ID;

// Per-facet: the leaf vertex collection (for the flat-scan oracle), the matching
// HAS_* edge collection (for the traversed-edge assertion), and the same
// SORT/LIMIT the production facet applies (so the oracle's bounded set matches).
interface FacetSpec {
  facet: Exclude<StructuredFacetT, 'account'>;
  collection: string;
  hasEdge: string;
  // The SORT/LIMIT clause appended to the oracle so its bounded set equals the
  // facet's. Mirrors structuredQuery's per-facet query verbatim.
  sortLimit: string;
}

const FACETS: FacetSpec[] = [
  { facet: 'usage', collection: 'UsageFact', hasEdge: 'HAS_USAGE', sortLimit: 'SORT x.period DESC LIMIT 12' },
  { facet: 'contract', collection: 'Contract', hasEdge: 'HAS_CONTRACT', sortLimit: 'SORT x.renewal_date ASC LIMIT 12' },
  { facet: 'nps', collection: 'NPS', hasEdge: 'HAS_NPS', sortLimit: 'SORT x.survey_date DESC LIMIT 30' },
  { facet: 'contact', collection: 'Contact', hasEdge: 'HAS_CONTACT', sortLimit: 'LIMIT 30' },
  { facet: 'opportunity', collection: 'Opportunity', hasEdge: 'HAS_OPPORTUNITY', sortLimit: 'SORT x.close_date DESC LIMIT 12' },
];

/** Independent flat-scan oracle — the exact query the GRAPH-03a rewrite replaces. */
async function flatScanIds(spec: FacetSpec, accountId: string): Promise<string[]> {
  const cursor = await db.query(aql`
    FOR x IN ${literal(spec.collection)}
      FILTER x.account_id == ${accountId}
      ${literal(spec.sortLimit)}
      RETURN x._id
  `);
  return (await cursor.all()) as string[];
}

describe.skipIf(!live)('structuredQuery GRAPH-03a — per-facet traversal vs flat-scan _id identity', () => {
  for (const spec of FACETS) {
    it(`facet '${spec.facet}' traversal returns the SAME sorted _id set as the flat scan`, async () => {
      const { retrievalPath } = await runFacet(ACCOUNT, spec.facet);
      const traversalIds = [...retrievalPath._ids].sort();
      const oracleIds = [...(await flatScanIds(spec, ACCOUNT))].sort();

      expect(oracleIds.length).toBeGreaterThan(0); // the account is seeded for this facet
      expect(traversalIds).toEqual(oracleIds);
    });
  }
});

describe.skipIf(!live)('structuredQuery GRAPH-03a — traversed-edge honesty', () => {
  for (const spec of FACETS) {
    it(`facet '${spec.facet}' emits real kind:'traversed' ${spec.hasEdge} edges anchored at the account`, async () => {
      const { retrievalPath } = await runFacet(ACCOUNT, spec.facet);
      expect(retrievalPath.edges.length).toBeGreaterThan(0);

      for (const edge of retrievalPath.edges) {
        // The core GRAPH-03a promotion: structural → traversed.
        expect(edge.kind).toBe('traversed');
        // Real ArangoDB edge id: "<HAS_*>/...", never a "structural:" synthetic marker.
        expect(typeof edge._id).toBe('string');
        expect((edge._id as string).startsWith(`${spec.hasEdge}/`)).toBe(true);
        expect((edge._id as string).startsWith('structural:')).toBe(false);
        // Anchored at the account vertex.
        expect(edge._from).toBe(`Account/${ACCOUNT}`);
        // _to is one of the returned leaf records.
        expect(retrievalPath._ids).toContain(edge._to);
        // The HAS_* edge collection is named honestly.
        expect(edge.collection).toBe(spec.hasEdge);
        expect(edge.label).toBe(spec.hasEdge);
      }
    });
  }

  it('captured traversed-edge ids are self-consistent under traversedEdgesAreGrounded', async () => {
    const { retrievalPath } = await runFacet(ACCOUNT, 'usage');
    const returnedEdgeIds = new Set(
      retrievalPath.edges.map((e) => e._id).filter((id): id is string => id != null),
    );
    expect(traversedEdgesAreGrounded(retrievalPath, returnedEdgeIds)).toBe(true);
  });

  it('a fabricated traversed edge (id not AQL-returned) is dropped by enforceEdgeHonesty', async () => {
    const { retrievalPath } = await runFacet(ACCOUNT, 'contract');
    // Ground-truth tool fragment = what the tool actually returned.
    const toolFragments: RetrievalPathFragmentT[] = [
      { ...retrievalPath, edges: [...retrievalPath.edges] },
    ];
    // Merged fragment carries an extra FABRICATED traversed edge whose id was
    // never AQL-returned. enforceEdgeHonesty must strip exactly that edge.
    const fabricatedId = 'HAS_CONTRACT/__fabricated_never_returned__';
    const mergedPath: RetrievalPathFragmentT[] = [
      {
        ...retrievalPath,
        edges: [
          ...retrievalPath.edges,
          {
            _id: fabricatedId,
            _from: `Account/${ACCOUNT}`,
            _to: 'Contract/__fake__',
            collection: 'HAS_CONTRACT',
            kind: 'traversed' as const,
            label: 'HAS_CONTRACT',
          },
        ],
      },
    ];

    const enforced = enforceEdgeHonesty(toolFragments, mergedPath);
    const survivingIds = enforced[0].edges.map((e) => e._id);
    expect(survivingIds).not.toContain(fabricatedId);
    // The real traversed edges survive.
    expect(enforced[0].edges.length).toBe(retrievalPath.edges.length);
  });
});

describe.skipIf(!live)("structuredQuery GRAPH-03a — 'account' facet stays a vertex lookup", () => {
  it('returns the single Account vertex with NO traversed edge (no self-traversal)', async () => {
    const { data, retrievalPath } = await runFacet(ACCOUNT, 'account');
    expect(data.length).toBe(1);
    expect(retrievalPath.collection).toBe('Account');
    // No traversed edge synthesized for the account-on-itself case.
    const traversed = retrievalPath.edges.filter((e) => e.kind === 'traversed');
    expect(traversed.length).toBe(0);
  });
});
