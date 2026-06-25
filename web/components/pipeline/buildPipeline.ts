// web/components/pipeline/buildPipeline.ts
//
// PURE, React-free transform: retrievalPath[] → ordered PipelineStage[].
//
// This is THE load-bearing file for EXPL-01 ("no black box"): the stepped
// left→right pipeline the buyer reads, each stage carrying the ACTUAL AQL that
// ran (the reveal), a human mode label, and the citation _ids it owns.
//
// Design principles (mirrors web/components/graph-viz/buildGraph.ts discipline):
//  - Pure function: no I/O, no React, no fetch/db. Plain data in, plain data out.
//  - Schema-derived types via z.infer from customer360-agent — NEVER duplicate
//    the envelope shapes (no hand-redeclared fragment/edge interfaces here).
//  - HONESTY (14-RESEARCH Pitfall 6): a stage is emitted ONLY when the retrieval
//    that backs it actually ran — derived from fragments PRESENT in retrievalPath,
//    never from a fixed per-question template. structured-only ⇒ no join/vector
//    stage; unstructured-only ⇒ no structured stage; empty/structural-only ⇒ none.
//  - D-03 collapse: matched chunks fold into their parent documents via the
//    PART_OF edges already in the path. This is PRESENTATION grouping only — it
//    never changes which _ids are citationIds (grounding stays on chunk _ids).
//
// Stage derivation (data-driven — 14-RESEARCH Pattern 3 / Code Examples #4):
//  - cross-graph-join  iff a fragment has collection==='same_as' OR any edge
//                      label==='same_as'  → SPOTLIGHT (the demo hero).
//  - vector+bm25       iff a fragment has graph==='unstructured' &&
//                      collection==='customer360_Chunks'.
//  - graph-traversal   iff a fragment has graph==='structured' && some edge is
//                      kind==='traversed' with a HAS_* label (GRAPH-03a).
//
// Order: vector+bm25 → cross-graph-join → graph-traversal (D-02 reading order).

import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';

// ── Type derivation (schema-derived — never duplicate envelope.ts) ──────────
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;
type RetrievalPathEdgeT = RetrievalPathFragmentT['edges'][number];

// ── PipelineStage — the engine-neutral stage shape (14-RESEARCH Pattern 3) ───
export type PipelineMode = 'vector+bm25' | 'cross-graph-join' | 'graph-traversal';

export interface PipelineStage {
  id: string;
  mode: PipelineMode;
  /** Human capability name shown on the stage card. */
  label: string;
  /** The fragment's actual AQL — the EXPL-01 reveal. */
  aql: string;
  /** Collection(s) this stage touched (for the stage subtitle). */
  collections: string[];
  /** The fragment _ids this stage owns — drives stage → SourceDrawer. */
  citationIds: string[];
  /** D-03: distinct parent-document count after the chunk→doc collapse. */
  documentsMatched?: number;
  /** D-03 presentation grouping: parent doc _id → owning chunk _ids (drawer). */
  chunksByDocument?: Record<string, string[]>;
  /** true for the same_as cross-graph join — the spotlighted hero stage. */
  spotlight?: boolean;
}

// Human capability label per mode (matches the plan's required strings).
const LABEL_BY_MODE: Record<PipelineMode, string> = {
  'vector+bm25': 'Vector + BM25 (ArangoSearch)',
  'cross-graph-join': 'Cross-graph join (same_as traversal)',
  'graph-traversal': 'Graph traversal (HAS_* named graph)',
};

// Stable left→right ordering (D-02 reading order).
const ORDER: Record<PipelineMode, number> = {
  'vector+bm25': 0,
  'cross-graph-join': 1,
  'graph-traversal': 2,
};

const hasSameAs = (frag: RetrievalPathFragmentT): boolean =>
  frag.collection === 'same_as' || (frag.edges ?? []).some((e) => e.label === 'same_as');

const isVectorBm25 = (frag: RetrievalPathFragmentT): boolean =>
  frag.graph === 'unstructured' && frag.collection === 'customer360_Chunks';

const isGraphTraversal = (frag: RetrievalPathFragmentT): boolean =>
  frag.graph === 'structured' &&
  (frag.edges ?? []).some((e) => e.kind === 'traversed' && e.label.startsWith('HAS_'));

// Data-driven mode for a single fragment — null ⇒ no standalone stage
// (structural-only account anchors fall here and are correctly omitted).
function modeFor(frag: RetrievalPathFragmentT): PipelineMode | null {
  if (hasSameAs(frag)) return 'cross-graph-join'; // the spotlight hero
  if (isVectorBm25(frag)) return 'vector+bm25';
  if (isGraphTraversal(frag)) return 'graph-traversal';
  return null; // structural-only → no stage
}

// D-03 collapse: group chunk _ids by their parent document via PART_OF edges
// (label==='PART_OF', _from=chunk, _to=doc). Presentation only — the chunk _ids
// remain the citationIds. Returns { documentsMatched, chunksByDocument }.
function collapseChunksToDocuments(
  chunkIds: string[],
  edges: RetrievalPathEdgeT[],
): { documentsMatched: number; chunksByDocument: Record<string, string[]> } {
  const chunkSet = new Set(chunkIds);
  const chunksByDocument: Record<string, string[]> = {};
  for (const e of edges) {
    if (e.label !== 'PART_OF') continue;
    if (!chunkSet.has(e._from)) continue; // only collapse chunks this stage owns
    (chunksByDocument[e._to] ??= []).push(e._from);
  }
  return { documentsMatched: Object.keys(chunksByDocument).length, chunksByDocument };
}

// ── buildPipeline ────────────────────────────────────────────────────────────
//
// Transform: retrievalPath[] → ordered PipelineStage[] (engine-neutral, honest).
//
// Pure function: always returns a new array; never mutates input.
export function buildPipeline(retrievalPath: RetrievalPathFragmentT[]): PipelineStage[] {
  if (retrievalPath.length === 0) return [];

  const stages: PipelineStage[] = [];

  retrievalPath.forEach((frag, idx) => {
    const mode = modeFor(frag);
    if (!mode) return; // honesty: never synthesize a stage for a retrieval that didn't run

    const stage: PipelineStage = {
      id: `${mode}:${idx}`,
      mode,
      label: LABEL_BY_MODE[mode],
      aql: frag.query,
      collections: [frag.collection],
      citationIds: [...frag._ids],
    };

    if (mode === 'cross-graph-join') {
      stage.spotlight = true;
    }

    // D-03: collapse only the vector+bm25 stage's chunk _ids to parent docs.
    if (mode === 'vector+bm25') {
      const { documentsMatched, chunksByDocument } = collapseChunksToDocuments(
        frag._ids,
        frag.edges ?? [],
      );
      stage.documentsMatched = documentsMatched;
      if (Object.keys(chunksByDocument).length) stage.chunksByDocument = chunksByDocument;
    }

    stages.push(stage);
  });

  // Stable left→right ordering (D-02); preserve input order within a mode.
  return stages.sort((a, b) => ORDER[a.mode] - ORDER[b.mode]);
}
