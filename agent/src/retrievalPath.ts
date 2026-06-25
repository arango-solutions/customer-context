// agent/src/retrievalPath.ts
//
// The retrieval-path fragment type + a merge helper. Each specialist tool returns
// one RetrievalPathFragmentT ({ graph, collection, _ids, query, edges[] }); the
// planner (Wave 2) collects them across tool calls and flattens/dedupes them into
// the envelope's retrievalPath[] so the UI renders one coherent cross-graph trace.

import type { RetrievalPathFragmentT, RetrievalPathEdgeT } from './envelope.js';

export type { RetrievalPathFragmentT, RetrievalPathEdgeT } from './envelope.js';

/**
 * Stable dedup key for edges (Phase 10, VIZ-01).
 *
 * - If the edge has a non-null _id (traversed + deterministic-synthetic edges),
 *   the _id is the natural key.
 * - If _id is null (fallback for any edge without a real id), fall back to a
 *   composite of kind::_from::_to::label so null-_id edges can still be
 *   deduped without crashing and without over-merging structurally distinct edges.
 */
const edgeKey = (e: RetrievalPathEdgeT): string =>
  e._id ?? `${e.kind}::${e._from}::${e._to}::${e.label}`;

/**
 * Flatten and dedupe a list of retrieval-path fragments for the envelope.
 *
 * Fragments are grouped by (graph, collection, query). Within a group:
 * - _ids are unioned and de-duplicated (preserving first-seen order).
 * - edges[] are unioned and de-duplicated by edgeKey (Phase 10 VIZ-01).
 *
 * This keeps the envelope's retrievalPath[] compact — one entry per distinct
 * query against a collection — while never dropping a sourced _id or edge.
 *
 * Robustness (Q9, 09-03): any null/undefined element that slipped into a
 * fragment's _ids (the model occasionally copies a null into its authored
 * retrievalPath; a tool fragment could in principle carry a null _id) is
 * stripped here at the single merge chokepoint, so the canonical
 * RetrievalPathFragment contract (_ids: z.array(z.string())) is satisfied and
 * the downstream EnvelopeSchema.parse in enforceGrounding never throws. The
 * contract is NOT loosened — the data is cleaned to fit it.
 *
 * Isolation guarantee (SC-5): edges[] is carried as provenance data and is
 * NEVER fed into returnedIds. The grounding ground-truth is sourced ONLY from
 * _ids in agent.ts / stream.ts. Do NOT add edge _ids to returnedIds.
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
    const fragEdges = frag.edges ?? [];

    const existing = groups.get(key);
    if (existing) {
      // Union _ids with first-seen dedup.
      const seenIds = new Set(existing._ids);
      for (const id of fragIds) {
        if (!seenIds.has(id)) {
          existing._ids.push(id);
          seenIds.add(id);
        }
      }
      // Union edges with first-seen dedup (Phase 10, VIZ-01).
      const seenEdges = new Set(existing.edges.map(edgeKey));
      for (const e of fragEdges) {
        const k = edgeKey(e);
        if (!seenEdges.has(k)) {
          existing.edges.push(e);
          seenEdges.add(k);
        }
      }
    } else {
      // Clone so callers' fragments are not mutated.
      groups.set(key, {
        graph: frag.graph,
        collection: frag.collection,
        query: frag.query,
        _ids: [...new Set(fragIds)],
        // Clone edge array + dedup within the first-seen fragment's own edges.
        edges: fragEdges.reduce<RetrievalPathEdgeT[]>((acc, e) => {
          const k = edgeKey(e);
          if (!acc.some((x) => edgeKey(x) === k)) acc.push(e);
          return acc;
        }, []),
      });
    }
  }

  return [...groups.values()];
}

/**
 * D-04 no-fabrication guard (Phase 10, VIZ-01).
 *
 * Returns true iff every edge with kind === 'traversed' in the fragment has a
 * non-null _id that is present in the `returnedEdgeIds` set (i.e. was actually
 * returned by the tool's AQL traversal).
 *
 * Structural and hybrid edges are EXPLICITLY EXEMPT — they are synthesized
 * constructs that are never claimed as "traversed." The guard enforces only
 * the traversed/non-traversed boundary that is the honesty contract of this
 * project (D-04 decision in 10-CONTEXT.md).
 *
 * Usage in tests: the D-04 guard test MUST fail (return false) when fed a
 * fabricated traversed edge whose _id is not in the AQL-returned set.
 *
 * @param frag           - A merged or tool-produced retrieval-path fragment.
 * @param returnedEdgeIds - The real edge _ids the tool's AQL RETURN produced.
 *                          Built by the tool from the `edge._id` on each returned row.
 *                          NEVER built from _ids or from any other source.
 */
export function traversedEdgesAreGrounded(
  frag: RetrievalPathFragmentT,
  returnedEdgeIds: Set<string>,
): boolean {
  const traversed = (frag.edges ?? []).filter((e) => e.kind === 'traversed');
  return traversed.every((e) => e._id != null && returnedEdgeIds.has(e._id));
}

/**
 * D-04 enforcement: build the ground-truth traversed-edge id set from tool fragments,
 * then drop any fabricated/ungrounded traversed edges from the merged retrieval path.
 *
 * This is the shared merge-chokepoint helper invoked by BOTH agent loops (agent.ts
 * and stream.ts) so the enforcement can never drift between the two paths.
 *
 * Design constraints preserved:
 *   SC-5 ISOLATION: `returnedEdgeIds` is a SEPARATE set from `returnedIds`.
 *     Edge _ids are NEVER added to `returnedIds` (the citation grounding set).
 *     This function does not touch `returnedIds` at all.
 *   Exempt kinds: `structural` and `hybrid` edges are synthesized constructs that
 *     never claim to be DB traversals — they pass through unchanged.
 *   Conservative: honest traversed edges (non-null _id present in the ground-truth
 *     set) are never modified or dropped.
 *
 * @param toolFragments  - The raw tool-returned fragments (before merging), used as
 *                         the ground-truth source for which traversed edge _ids are real.
 *                         NEVER pass frag.edges from the merged result — that would be
 *                         tautological (see guard docstring above).
 * @param mergedPath     - The already-merged retrievalPath[] to enforce honesty on.
 *                         Mutated in place (safe: mergeRetrievalPaths always returns
 *                         freshly-cloned objects, never the caller's originals).
 * @returns mergedPath   - The same array, with fabricated traversed edges stripped.
 */
export function enforceEdgeHonesty(
  toolFragments: RetrievalPathFragmentT[],
  mergedPath: RetrievalPathFragmentT[],
): RetrievalPathFragmentT[] {
  // Build the ground-truth traversed-edge id set from what the tools actually
  // returned (traversed edges with non-null _ids are real AQL-returned edges).
  // SC-5: this set is SEPARATE from returnedIds; edge _ids must NEVER be added
  // to the citation grounding set.
  const returnedEdgeIds = new Set<string>();
  for (const frag of toolFragments) {
    for (const e of frag.edges ?? []) {
      if (e.kind === 'traversed' && e._id != null) {
        returnedEdgeIds.add(e._id);
      }
    }
  }

  // Enforce D-04 on every merged fragment: drop any traversed edge whose _id
  // is not in the ground-truth set (fabricated / ungrounded traversal).
  // structural and hybrid edges are exempt — traversedEdgesAreGrounded() already
  // encodes that exemption; we mirror the same filter predicate here.
  for (const frag of mergedPath) {
    if (!traversedEdgesAreGrounded(frag, returnedEdgeIds)) {
      frag.edges = frag.edges.filter(
        (e) => e.kind !== 'traversed' || (e._id != null && returnedEdgeIds.has(e._id)),
      );
    }
  }

  return mergedPath;
}
