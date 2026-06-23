// agent/src/retrievalPath.ts
//
// The retrieval-path fragment type + a merge helper. Each specialist tool returns
// one RetrievalPathFragmentT ({ graph, collection, _ids, query }); the planner
// (Wave 2) collects them across tool calls and flattens/dedupes them into the
// envelope's retrievalPath[] so the UI renders one coherent cross-graph trace.

import type { RetrievalPathFragmentT } from './envelope.js';

export type { RetrievalPathFragmentT } from './envelope.js';

/**
 * Flatten and dedupe a list of retrieval-path fragments for the envelope.
 *
 * Fragments are grouped by (graph, collection, query). Within a group the _ids
 * are unioned and de-duplicated (preserving first-seen order). This keeps the
 * envelope's retrievalPath[] compact — one entry per distinct query against a
 * collection — while never dropping a sourced _id.
 *
 * Robustness (Q9, 09-03): any null/undefined element that slipped into a
 * fragment's _ids (the model occasionally copies a null into its authored
 * retrievalPath; a tool fragment could in principle carry a null _id) is
 * stripped here at the single merge chokepoint, so the canonical
 * RetrievalPathFragment contract (_ids: z.array(z.string())) is satisfied and
 * the downstream EnvelopeSchema.parse in enforceGrounding never throws. The
 * contract is NOT loosened — the data is cleaned to fit it.
 *
 * Pure function (no I/O); safe to call in any runtime.
 */
export function mergeRetrievalPaths(
  fragments: RetrievalPathFragmentT[],
): RetrievalPathFragmentT[] {
  const groups = new Map<string, RetrievalPathFragmentT>();

  const cleanIds = (ids: readonly (string | null | undefined)[]): string[] =>
    ids.filter((id): id is string => id != null);

  for (const frag of fragments) {
    const key = `${frag.graph}::${frag.collection}::${frag.query}`;
    const fragIds = cleanIds(frag._ids as readonly (string | null | undefined)[]);
    const existing = groups.get(key);
    if (existing) {
      const seen = new Set(existing._ids);
      for (const id of fragIds) {
        if (!seen.has(id)) {
          existing._ids.push(id);
          seen.add(id);
        }
      }
    } else {
      // Clone so callers' fragments are not mutated.
      groups.set(key, {
        graph: frag.graph,
        collection: frag.collection,
        query: frag.query,
        _ids: [...new Set(fragIds)],
      });
    }
  }

  return [...groups.values()];
}
