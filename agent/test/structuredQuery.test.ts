// agent/test/structuredQuery.test.ts
//
// Wave-1 (05-02) integration tests + Phase-14 (14-01, GRAPH-03a) traversed-edge
// assertions for the structuredQuery specialist.
//
// These exercise each curated facet against the live customer360 structural
// named graph, asserting:
//   - non-empty data with real ArangoDB _ids,
//   - retrievalPath.graph === 'structured' + the correct collection,
//   - the NPS green/red split (both score and verbatim_sentiment present),
//   - the Zod inputSchema rejects an unknown facet before any AQL runs.
//   - (Phase 14-01) real HAS_* traversed-edge honesty: kind:'traversed', real
//     HAS_*/... edge ids, account facet emits no self-traversal.
//     (SUPERSEDES the Phase 10-03 synthesized-structural-edge block.)
//
// loadEnv() runs at module scope (override:true) BEFORE the skip-guard so the
// cluster creds come from .env, not a stale shell value (D-06). hasLiveDb()
// skip-guards the live cases so the unit assertion still runs without a cluster.

import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/db.js';
import { hasLiveDb, MERIDIAN_ACCOUNT_ID, NORTHWIND_ACCOUNT_ID } from './fixtures.js';
import { structuredQuery } from '../src/tools/structuredQuery.js';

loadEnv();

const live = hasLiveDb();

// The AI SDK tool exposes its execute under .execute; call it directly in tests.
// Cast through unknown because the tool() type narrows execute's signature.
const run = (input: { accountId: string; facet: string }) =>
  (structuredQuery as unknown as {
    execute: (i: unknown, opts: unknown) => Promise<{
      data: Array<Record<string, unknown>>;
      retrievalPath: {
        graph: string;
        collection: string;
        _ids: string[];
        query: string;
        edges: Array<{
          _id: string | null;
          _from: string;
          _to: string;
          collection: string;
          kind: string;
          label: string;
        }>;
      };
    }>;
  }).execute(input, {} as unknown);

describe('structuredQuery — Zod inputSchema (no live DB needed)', () => {
  it('rejects an unknown facet via the enum before any AQL runs', () => {
    const schema = (structuredQuery as unknown as { inputSchema: { safeParse: (i: unknown) => { success: boolean } } })
      .inputSchema;
    const ok = schema.safeParse({ accountId: NORTHWIND_ACCOUNT_ID, facet: 'usage' });
    const bad = schema.safeParse({ accountId: NORTHWIND_ACCOUNT_ID, facet: 'salaries' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });
});

describe.skipIf(!live)('structuredQuery — live facets (account-scoped, sourced)', () => {
  const facets = ['usage', 'contract', 'nps', 'contact', 'opportunity', 'account'] as const;

  for (const account of [MERIDIAN_ACCOUNT_ID, NORTHWIND_ACCOUNT_ID]) {
    for (const facet of facets) {
      it(`facet '${facet}' returns sourced rows for ${account.slice(0, 8)}`, async () => {
        const { data, retrievalPath } = await run({ accountId: account, facet });
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        // Every row carries a real _id, and the retrievalPath mirrors them.
        for (const row of data) {
          expect(typeof row._id).toBe('string');
          expect((row._id as string).length).toBeGreaterThan(0);
        }
        expect(retrievalPath.graph).toBe('structured');
        expect(retrievalPath.collection.length).toBeGreaterThan(0);
        expect(retrievalPath._ids).toEqual(data.map((d) => d._id));
        expect(retrievalPath._ids.length).toBe(data.length);
        expect(typeof retrievalPath.query).toBe('string');
      });
    }
  }

  it("facet 'nps' exposes BOTH the green numeric (score/nps_score) AND the red free-text (verbatim_sentiment)", async () => {
    const { data } = await run({ accountId: MERIDIAN_ACCOUNT_ID, facet: 'nps' });
    expect(data.length).toBeGreaterThan(0);
    const row = data[0];
    expect('score' in row || 'nps_score' in row).toBe(true);
    expect('verbatim_sentiment' in row).toBe(true);
  });

  it("facet 'account' returns exactly one Account row (LIMIT 1) for Meridian", async () => {
    const { data, retrievalPath } = await run({ accountId: MERIDIAN_ACCOUNT_ID, facet: 'account' });
    expect(data.length).toBe(1);
    expect(retrievalPath.collection).toBe('Account');
    expect('account_name' in data[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 14-01 (GRAPH-03a): Traversed-edge honesty invariants (SC-1).
//
// SUPERSEDES the Phase 10-03 structural-edge block: structuredQuery now performs a
// REAL 1..1 OUTBOUND Account/<id> HAS_* named-graph traversal per non-account facet,
// so the synthesized `kind:'structural'` account edges are promoted to REAL
// `kind:'traversed'` HAS_* edge documents (id/_from/_to captured verbatim from AQL).
// (Detailed per-facet identity vs flat-scan oracle tests live in the co-located
// src/tools/structuredQuery.test.ts; these guard the legacy call site.)
// ---------------------------------------------------------------------------
describe.skipIf(!live)('structuredQuery — traversed HAS_* edges (GRAPH-03a / SC-1)', () => {
  it('emits edges[] with kind:traversed and a real HAS_* label/collection — NEVER kind:structural', async () => {
    const { retrievalPath } = await run({ accountId: MERIDIAN_ACCOUNT_ID, facet: 'usage' });
    // Must have at least one edge (usage returns ≥1 row)
    expect(retrievalPath.edges.length).toBeGreaterThan(0);
    for (const edge of retrievalPath.edges) {
      // SC-1 — the core honesty invariant: this is now a real traversal.
      expect(edge.kind).toBe('traversed');
      expect(edge.kind).not.toBe('structural');
      expect(edge.label).toBe('HAS_USAGE');
      expect(edge.collection).toBe('HAS_USAGE');
    }
  });

  it('_from is Account/${accountId} and _to matches a _id in retrievalPath._ids', async () => {
    const accountId = MERIDIAN_ACCOUNT_ID;
    const { retrievalPath } = await run({ accountId, facet: 'contract' });
    const idsSet = new Set(retrievalPath._ids);
    for (const edge of retrievalPath.edges) {
      expect(edge._from).toBe(`Account/${accountId}`);
      expect(idsSet.has(edge._to)).toBe(true);
    }
  });

  it('edge _id is the REAL AQL-returned HAS_* edge id (e.g. HAS_NPS/...), not synthesized', async () => {
    const accountId = MERIDIAN_ACCOUNT_ID;
    const { retrievalPath } = await run({ accountId, facet: 'nps' });
    expect(retrievalPath.edges.length).toBeGreaterThan(0);
    for (const edge of retrievalPath.edges) {
      expect(typeof edge._id).toBe('string');
      expect((edge._id as string).startsWith('HAS_NPS/')).toBe(true);
      expect((edge._id as string).startsWith('structural:')).toBe(false);
    }
  });

  it('re-running with the same inputs yields identical edge _ids (determinism)', async () => {
    const accountId = NORTHWIND_ACCOUNT_ID;
    const { retrievalPath: path1 } = await run({ accountId, facet: 'opportunity' });
    const { retrievalPath: path2 } = await run({ accountId, facet: 'opportunity' });
    const ids1 = path1.edges.map((e) => e._id).sort();
    const ids2 = path2.edges.map((e) => e._id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('account facet emits NO traversed edge (single-vertex lookup, no self-traversal)', async () => {
    const accountId = MERIDIAN_ACCOUNT_ID;
    const { retrievalPath } = await run({ accountId, facet: 'account' });
    // The account facet is a LIMIT 1 vertex lookup — there is no edge to traverse to
    // itself, so it must emit no traversed edge (and certainly no self-loop).
    expect(retrievalPath.edges.filter((e) => e.kind === 'traversed').length).toBe(0);
    for (const edge of retrievalPath.edges) {
      expect(edge._from).not.toBe(edge._to);
    }
  });

  it('edges count equals data rows count (one HAS_* edge per traversed leaf row)', async () => {
    const accountId = MERIDIAN_ACCOUNT_ID;
    const { data, retrievalPath } = await run({ accountId, facet: 'contact' });
    expect(retrievalPath.edges.length).toBe(data.length);
  });

  it('every non-account facet emits only real HAS_*/... edge ids — no uuid4/random, no "structural:"', async () => {
    const accountId = NORTHWIND_ACCOUNT_ID;
    for (const facet of ['usage', 'contract', 'nps', 'contact', 'opportunity'] as const) {
      const { retrievalPath } = await run({ accountId, facet });
      for (const edge of retrievalPath.edges) {
        expect(typeof edge._id).toBe('string');
        expect((edge._id as string).startsWith('HAS_')).toBe(true);
        expect((edge._id as string).startsWith('structural:')).toBe(false);
      }
    }
  });
});
