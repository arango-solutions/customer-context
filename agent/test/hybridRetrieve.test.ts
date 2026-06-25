// agent/test/hybridRetrieve.test.ts
//
// Integration test for the hybridRetrieve specialist (Specialist 2 — the
// unstructured half of the dual-graph architecture). Ports the assertions proven
// by the 05-01 hybridSpike: a Meridian sentiment query, scoped to
// MERIDIAN_ACCOUNT_ID, returns ≥1 chunk that is PART_OF-sourced to the Meridian
// Document and carries a RED narrative signal. Live-DB + OpenAI guarded so the
// unit suite still runs without a cluster.
//
// Also a pure (env-free) assertion that the Zod inputSchema bounds k to 1..20.
//
// Phase 10 (10-02) additions:
//  - (live-guarded) edges[] contains ≥1 kind:'traversed' PART_OF edge (SC-1)
//  - (live-guarded) all traversed edge _ids are in the AQL-returned edge._id set (D-04)
//  - (live-guarded) edges[] contains kind:'hybrid' edges, one per chunk, no score field

import { describe, it, expect } from 'vitest';
import {
  hybridRetrieve,
  hybridRetrieveInput,
  runHybridRetrieve,
} from '../src/tools/hybridRetrieve.js';
import { loadEnv } from '../src/db.js';
import { hasLiveDb, hasOpenAi, MERIDIAN_ACCOUNT_ID } from './fixtures.js';
import { traversedEdgesAreGrounded } from '../src/retrievalPath.js';

// Load .env (override:true) at module scope, BEFORE the skip-guard is evaluated,
// so ARANGO_* + OPENAI_API_KEY come from .env, never a stale shell value (D-06).
loadEnv();

const canRun = hasLiveDb() && hasOpenAi();

/** RED narrative signal the Q12 Meridian doc-KG carries (escalation/ops/partnership). */
const RED_SIGNAL =
  /escalat|ops burden|operational burden|partnership health|churn|frustrat|at risk|unhappy|complain|renewal risk/i;

// Exercise the tool's logic through its Zod inputSchema (validation) + the
// exported pure runHybridRetrieve (the same code path the tool's execute calls,
// with a precise return type for the assertions below).
async function runTool(args: {
  queryText: string;
  accountId?: string;
  k?: number;
}) {
  const parsed = hybridRetrieveInput.parse(args);
  return runHybridRetrieve(parsed);
}

describe('hybridRetrieve — Zod inputSchema bounds (pure, no env)', () => {
  it('rejects k = 0', () => {
    expect(() =>
      hybridRetrieveInput.parse({ queryText: 'x', k: 0 }),
    ).toThrow();
  });

  it('rejects k = 21', () => {
    expect(() =>
      hybridRetrieveInput.parse({ queryText: 'x', k: 21 }),
    ).toThrow();
  });

  it('accepts a valid in-range k and defaults k to 8', () => {
    const parsed = hybridRetrieveInput.parse({ queryText: 'x' });
    expect(parsed.k).toBe(8);
  });
});

describe.skipIf(!canRun)('hybridRetrieve — live vector+BM25+RRF over Chunks', () => {
  it('Meridian-scoped sentiment query returns ≥1 correctly-sourced RED chunk', async () => {
    const queryText =
      'partnership health escalation ops burden sentiment renewal risk';
    const out = await runTool({
      queryText,
      accountId: MERIDIAN_ACCOUNT_ID,
      k: 8,
    });

    expect(out.data.length).toBeGreaterThan(0);

    // Every sourced row is the Meridian account (PART_OF traversal scoped).
    for (const row of out.data) {
      expect(row.account_id).toBe(MERIDIAN_ACCOUNT_ID);
      expect(typeof row.chunk_id).toBe('string');
      expect(typeof row.content).toBe('string');
    }

    // At least one chunk carries a RED narrative signal (A5 / Q12 centerpiece).
    const anyRed = out.data.some((r) => RED_SIGNAL.test(r.content ?? ''));
    expect(anyRed).toBe(true);

    // retrievalPath fragment is the unstructured Chunks trace.
    expect(out.retrievalPath.graph).toBe('unstructured');
    expect(out.retrievalPath.collection).toBe('customer360_Chunks');
    expect(out.retrievalPath._ids.length).toBe(out.data.length);

    // Document the proven RED signals for 05-04's Q12 reconciliation assertions.
    // eslint-disable-next-line no-console
    console.log(
      `[hybridRetrieve] sourced(Meridian)=${out.data.length} ` +
        `redSignal=${anyRed} sample_file=${out.data[0]?.file_name ?? 'n/a'} ` +
        `sample_url=${out.data[0]?.citable_url ?? 'n/a'}`,
    );
  });

  it('unscoped query returns PART_OF-sourced rows (each tied to a Document)', async () => {
    const out = await runTool({
      queryText: 'usage adoption renewal sentiment',
      k: 6,
    });
    expect(out.data.length).toBeGreaterThan(0);
    for (const row of out.data) {
      // Sourced via PART_OF traversal — every row resolves to a Document.account_id.
      expect(typeof row.account_id).toBe('string');
      expect(row.account_id.length).toBeGreaterThan(0);
    }
    expect(out.retrievalPath.graph).toBe('unstructured');
  });
});

// Phase 10 (10-02): edge provenance assertions (live-guarded, SC-1 + D-04 + D-05)
describe.skipIf(!canRun)('hybridRetrieve — edge provenance (SC-1, D-04, D-05)', () => {
  it(
    'edges[] contains ≥1 kind:traversed PART_OF edge with _from/_to from the AQL edge doc',
    async () => {
      const out = await runTool({
        queryText: 'partnership health escalation ops burden sentiment renewal risk',
        accountId: MERIDIAN_ACCOUNT_ID,
        k: 6,
      });

      const traversed = out.retrievalPath.edges.filter((e) => e.kind === 'traversed');
      expect(traversed.length).toBeGreaterThan(0);

      // Every traversed edge must have label:'PART_OF' and collection === RELATIONS constant
      for (const e of traversed) {
        expect(e.label).toBe('PART_OF');
        expect(e.collection).toBe('customer360_Relations');
        expect(typeof e._from).toBe('string');
        expect(typeof e._to).toBe('string');
        expect(e._id).not.toBeNull();
      }
    },
    30_000,
  );

  it(
    'D-04: every traversed edge _id is in the AQL-returned edge._id set (no fabrication)',
    async () => {
      const out = await runTool({
        queryText: 'partnership health escalation ops burden sentiment renewal risk',
        accountId: MERIDIAN_ACCOUNT_ID,
        k: 6,
      });

      // Ground truth: the edge _id values the AQL RETURN included on each data row.
      // This is the only honest source for the traversed-edge set (D-04).
      const returnedEdgeIds = new Set(
        (out.data as Array<{ edge?: { _id: string } }>)
          .map((d) => d.edge?._id)
          .filter((id): id is string => id != null),
      );

      // traversedEdgesAreGrounded must return true: every traversed edge is in the set.
      expect(traversedEdgesAreGrounded(out.retrievalPath, returnedEdgeIds)).toBe(true);
    },
    30_000,
  );

  it(
    'D-05: edges[] contains kind:hybrid edges (one per chunk), no score field, _to is a real chunk_id',
    async () => {
      const out = await runTool({
        queryText: 'usage adoption renewal',
        k: 4,
      });

      const hybrid = out.retrievalPath.edges.filter((e) => e.kind === 'hybrid');
      expect(hybrid.length).toBeGreaterThan(0);

      // There should be one hybrid edge per chunk in the data
      expect(hybrid.length).toBe(out.data.length);

      for (const e of hybrid) {
        expect(e.label).toBe('hybrid');
        // _from is the fixed question anchor
        expect(e._from).toBe('question/current');
        // _to must be a chunk_id present in retrievalPath._ids
        expect(out.retrievalPath._ids).toContain(e._to);
        // D-03: NO score fields on hybrid edges
        expect((e as Record<string, unknown>).score).toBeUndefined();
        expect((e as Record<string, unknown>).vectorScore).toBeUndefined();
        expect((e as Record<string, unknown>).bm25Score).toBeUndefined();
        expect((e as Record<string, unknown>).rrfScore).toBeUndefined();
      }
    },
    30_000,
  );
});
