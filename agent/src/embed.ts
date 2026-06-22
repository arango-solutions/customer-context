// agent/src/embed.ts
//
// OpenAI query embedding for hybridRetrieve's vector leg.
//
// Model + dimensions are LOCKED to text-embedding-3-small at dimensions=512 to
// match the live 512-dim customer360_Chunks vector index (RESEARCH Assumption A3,
// verified by the 05-01 spike). A dimension mismatch silently breaks
// APPROX_NEAR_COSINE, so this is a correctness constraint, not a tuning knob.
//
// OPENAI_API_KEY is read from the environment at call time. Callers (tools/tests)
// run loadEnv() (dotenv override:true) at their entrypoint so .env wins over a
// stale shell key (D-06 / RESEARCH Pitfall 3) — embedQuery does NOT call loadEnv()
// itself so it is safe to import in the Next.js runtime (Phase 6) which loads its
// own env.

/** The query embedding dimension — MUST match the live Chunks vector index. */
export const EMBED_DIM = 512;

/** The embedding model — MUST match the model AutoGraph built the index with. */
export const EMBED_MODEL = 'text-embedding-3-small';

/**
 * Embed a query string into a 512-dim vector via the OpenAI embeddings API.
 *
 * Uses text-embedding-3-small with `dimensions: 512` so the returned vector is
 * directly comparable (cosine) to the 512-dim chunk embeddings in the index.
 *
 * @throws if OPENAI_API_KEY is absent or the API call fails.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set (load .env via loadEnv()).');
  }

  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: text,
      dimensions: EMBED_DIM,
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI embeddings failed: HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as { data: { embedding: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('OpenAI embeddings returned no embedding');
  }
  return embedding;
}
