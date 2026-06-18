// agent/test/structuredQuery.test.ts
//
// Wave-1 (05-02) integration tests for the structuredQuery specialist.
//
// These exercise each curated facet against the live customer360 structured
// named graph, asserting:
//   - non-empty data with real ArangoDB _ids,
//   - retrievalPath.graph === 'structured' + the correct collection,
//   - the NPS green/red split (both score and verbatim_sentiment present),
//   - the Zod inputSchema rejects an unknown facet before any AQL runs.
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
      retrievalPath: { graph: string; collection: string; _ids: string[]; query: string };
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
