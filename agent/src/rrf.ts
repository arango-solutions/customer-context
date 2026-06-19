// agent/src/rrf.ts
//
// Reciprocal Rank Fusion (RRF) of two ranked _id lists — fused in pure TypeScript,
// NOT in AQL (RESEARCH Pitfall 6: AQL has no built-in enumerate; fusing two
// separate AQL result lists in TS is simpler and keeps each call's retrievalPath
// traceable). Used by hybridRetrieve to merge the vector (APPROX_NEAR_COSINE) and
// BM25 ranked chunk _id lists into one ordering.
//
// Pure function — no DB, no I/O — so it is unit-testable without env (the
// per-commit fast-feedback path).

/**
 * Fuse two ranked _id lists by Reciprocal Rank Fusion.
 *
 * For each list, an _id at 1-based rank `r` contributes `1 / (k + r)` to its
 * score. Scores accumulate across both lists, so an _id present in both lists
 * (and/or ranked highly) outscores one present in only one list. The result is
 * sorted by descending RRF score.
 *
 * @param listA ranked _ids (best first) from the first retriever
 * @param listB ranked _ids (best first) from the second retriever
 * @param k     RRF damping constant (default 60, the standard value)
 * @returns     fused {_id, score} entries sorted by descending score; [] if both inputs are empty
 */
export function fuseRRF(
  listA: string[],
  listB: string[],
  k = 60,
): { _id: string; score: number }[] {
  const scores = new Map<string, number>();

  const accumulate = (ids: string[]): void => {
    ids.forEach((id, i) => {
      const rank = i + 1; // 1-based rank
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  };

  accumulate(listA);
  accumulate(listB);

  return [...scores.entries()]
    .map(([_id, score]) => ({ _id, score }))
    .sort((a, b) => b.score - a.score);
}
