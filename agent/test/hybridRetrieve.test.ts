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

import { describe, it, expect } from 'vitest';
import {
  hybridRetrieve,
  hybridRetrieveInput,
  runHybridRetrieve,
} from '../src/tools/hybridRetrieve.js';
import { loadEnv } from '../src/db.js';
import { hasLiveDb, hasOpenAi, MERIDIAN_ACCOUNT_ID } from './fixtures.js';

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
