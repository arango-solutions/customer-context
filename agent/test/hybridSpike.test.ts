// agent/test/hybridSpike.test.ts
//
// The key Wave-0 spike (RESEARCH Open Q1 — the single highest-value spike of the
// phase). Proves the owned-AQL hybrid retrieval path end to end BEFORE the
// hybridRetrieve tool is planned (05-03):
//
//   1. Apply the build-time DDL: create customer360_chunks_search_view linking
//      customer360_Chunks.content with the text_en analyzer (idempotent). DDL on
//      this cluster requires a JWT (bearer), per the Phase-1 finding.
//   2. Embed a Meridian sentiment query via OpenAI text-embedding-3-small,
//      dimensions=512 (to match the 512-dim chunk vector index).
//   3. Vector: APPROX_NEAR_COSINE over Chunks.embedding -> ranked chunk _ids.
//   4. BM25: SEARCH over the new view (TOKENS(query, "text_en")) -> ranked chunk _ids.
//   5. Fuse the two ranked _id lists in TypeScript by RRF (score = Σ 1/(60+rank))
//      — NOT in AQL (Pitfall 6).
//   6. For the fused top-k, traverse 1..1 OUTBOUND PART_OF over customer360_Relations
//      (IS_SAME_COLLECTION customer360_Documents) scoped by Document.account_id ==
//      MERIDIAN_ACCOUNT_ID -> {chunk_id, content, account_id, citable_url, file_name}.
//
// Asserts the sourced result is non-empty, every row is the Meridian account, and
// at least one chunk content carries a RED sentiment signal (escalation / ops
// burden / partnership health). This confirms A5 (Q12 RED narrative is present and
// account-scoped) and hands 05-03 the proven query shape.
//
// loadEnv() runs first so OPENAI_API_KEY + ARANGO_* come from .env (D-06 gotcha).

import { describe, it, expect, beforeAll } from 'vitest';
import { aql } from 'arangojs';
import { literal } from 'arangojs/aql';
import type { Database } from 'arangojs';
import { loadEnv, getDb } from '../src/db.js';
import { hasLiveDb, hasOpenAi, MERIDIAN_ACCOUNT_ID } from './fixtures.js';

const VIEW_NAME = 'customer360_chunks_search_view';
const CHUNKS = 'customer360_Chunks';
const RELATIONS = 'customer360_Relations';
const DOCUMENTS = 'customer360_Documents';
const EMBED_DIM = 512;
const RRF_K = 60;

// Load .env (override:true) at module scope, BEFORE the skip-guard is evaluated,
// so OPENAI_API_KEY + ARANGO_* come from .env, never a stale shell value (D-06).
loadEnv();

const canRun = hasLiveDb() && hasOpenAi();

/** Embed a query via OpenAI text-embedding-3-small at 512 dims (matches the index). */
async function embedQuery(text: string): Promise<number[]> {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: EMBED_DIM,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI embeddings failed: HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

/**
 * Idempotently create the ArangoSearch view on Chunks.content (text_en).
 * Mirrors the proven config in arango-capability-check.md Step 5. DDL needs a
 * JWT-authed Database (bearer).
 */
async function ensureChunksView(dbBearer: Database): Promise<void> {
  const view = dbBearer.view(VIEW_NAME);
  const exists = await view.exists();
  const properties = {
    links: {
      [CHUNKS]: {
        fields: { content: { analyzers: ['text_en'] } },
        includeAllFields: false,
      },
    },
  };
  if (!exists) {
    // create() with type arangosearch + link properties.
    await dbBearer.createView(VIEW_NAME, { type: 'arangosearch', ...properties });
  } else {
    // Idempotent: ensure the link config is the proven one.
    await view.updateProperties(properties);
  }
  // Allow a short settling period before querying the freshly-linked view.
  await new Promise((r) => setTimeout(r, 2500));
}

/** RRF fuse two ranked _id lists in TypeScript: score = Σ 1/(K + rank). */
function rrfFuse(vectorIds: string[], bm25Ids: string[], k = RRF_K): string[] {
  const score = new Map<string, number>();
  const add = (ids: string[]) => {
    ids.forEach((id, i) => {
      const rank = i + 1; // 1-based rank
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank));
    });
  };
  add(vectorIds);
  add(bm25Ids);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

describe.skipIf(!canRun)('hybrid RRF sourced-retrieval spike (Open Q1)', () => {
  let db: Database;

  beforeAll(async () => {
    // DDL (view create) needs bearer; reads/queries also fine over bearer.
    db = await getDb({ mode: 'bearer' });
    await ensureChunksView(db);
  });

  it('BM25 over the new chunks view returns chunk _ids (view + analyzer live)', async () => {
    const cursor = await db.query(aql`
      FOR v IN ${literal(VIEW_NAME)}
        SEARCH ANALYZER(v.content IN TOKENS("escalation", "text_en"), "text_en")
        SORT BM25(v) DESC
        LIMIT 5
        RETURN v._id
    `);
    const ids = (await cursor.all()) as string[];
    // ≥0 rows without a "view not found" / "no such analyzer" error is the bar.
    expect(Array.isArray(ids)).toBe(true);
  });

  it('fuses vector + BM25 (TS RRF) and traverses PART_OF to sourced Meridian RED chunks', async () => {
    const queryText = 'partnership health escalation ops burden sentiment';
    const qVec = await embedQuery(queryText);
    const topN = 32;

    // (1) Vector: APPROX_NEAR_COSINE over Chunks.embedding -> ranked _ids.
    const vecCursor = await db.query(aql`
      FOR c IN ${literal(CHUNKS)}
        LET s = APPROX_NEAR_COSINE(c.embedding, ${qVec})
        SORT s DESC
        LIMIT ${topN}
        RETURN c._id
    `);
    const vectorIds = (await vecCursor.all()) as string[];

    // (2) BM25: SEARCH over the new view -> ranked _ids.
    const bmCursor = await db.query(aql`
      FOR v IN ${literal(VIEW_NAME)}
        SEARCH ANALYZER(v.content IN TOKENS(${queryText}, "text_en"), "text_en")
        SORT BM25(v) DESC
        LIMIT ${topN}
        RETURN v._id
    `);
    const bm25Ids = (await bmCursor.all()) as string[];

    expect(vectorIds.length).toBeGreaterThan(0);
    // BM25 may legitimately return fewer rows; both lists feed RRF.

    // (3) RRF fuse in TypeScript (Pitfall 6 — not in AQL).
    const fused = rrfFuse(vectorIds, bm25Ids);
    const topK = fused.slice(0, 16);
    expect(topK.length).toBeGreaterThan(0);

    // (4) Traverse PART_OF for sourcing, scoped to Meridian's account_id.
    // WITH declares visited collections (Pitfall 5 — clustered traversals need it).
    const srcCursor = await db.query(aql`
      WITH ${literal(DOCUMENTS)}, ${literal(CHUNKS)}
      FOR chunkId IN ${topK}
        FOR doc IN 1..1 OUTBOUND chunkId ${literal(RELATIONS)}
          FILTER IS_SAME_COLLECTION(${DOCUMENTS}, doc)
          FILTER doc.account_id == ${MERIDIAN_ACCOUNT_ID}
          RETURN {
            chunk_id: chunkId,
            content: DOCUMENT(chunkId).content,
            account_id: doc.account_id,
            citable_url: doc.citable_url,
            file_name: doc.file_name
          }
    `);
    const sourced = (await srcCursor.all()) as {
      chunk_id: string;
      content: string;
      account_id: string;
      citable_url?: string;
      file_name?: string;
    }[];

    // Non-empty + every row is the Meridian account.
    expect(sourced.length).toBeGreaterThan(0);
    for (const row of sourced) {
      expect(row.account_id).toBe(MERIDIAN_ACCOUNT_ID);
    }

    // At least one chunk carries a RED sentiment signal (A5).
    const redSignal = /escalat|ops burden|operational burden|partnership health|churn|frustrat|at risk|unhappy|complain/i;
    const anyRed = sourced.some((r) => redSignal.test(r.content ?? ''));
    expect(anyRed).toBe(true);

    // Documented for 05-03: the proven shape + a sample sourced url (no secrets).
    // eslint-disable-next-line no-console
    console.log(
      `[hybridSpike] fused=${fused.length} sourced(Meridian)=${sourced.length} redSignal=${anyRed} sample=${sourced[0]?.file_name ?? 'n/a'}`,
    );
  });
});
