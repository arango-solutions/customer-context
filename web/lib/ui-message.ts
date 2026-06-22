// Shared custom UI-message data-part types for the Phase-6 SSE stream.
//
// Single source of truth for the stream's custom parts so Plan 02 (agent/src/stream.ts),
// Plan 03 (app/api/ask/route.ts), and the Wave-2 client components agree on the shape.
//
// The stream carries exactly two custom parts (RESEARCH Architecture Diagram / Pattern 5):
//   - data-step      (transient): one per planner phase — drives the live ReasoningTimeline.
//   - data-envelope  (persistent): the final code-grounded Envelope — drives AnswerBody,
//                     CitationCards, and the grouped RetrievalPathByGraph.
//
// The data-envelope payload is typed as the agent's `Envelope` (imported from the
// customer360-agent workspace) so the UI never re-derives the contract.

import type { Envelope } from 'customer360-agent';

/** The six D-01 planner phases the ReasoningTimeline renders, in order. */
export type StreamPhase =
  | 'planning'
  | 'querying structured'
  | 'searching docs'
  | 'resolving entities'
  | 'reconciling'
  | 'answer';

/**
 * The canonical phase order — the SINGLE source of truth for sequencing.
 * The planner dispatches specialists in parallel, so their `data-step` events can
 * arrive out of order; consumers compare against this array to advance the live
 * phase MONOTONICALLY (a step never un-checks once passed).
 */
export const STREAM_PHASE_ORDER: readonly StreamPhase[] = [
  'planning',
  'querying structured',
  'searching docs',
  'resolving entities',
  'reconciling',
  'answer',
];

/** Transient progress part: the currently-active planner phase. */
export interface DataStepPart {
  phase: StreamPhase | string;
}

/** Persistent final part: the code-grounded answer envelope. */
export type DataEnvelopePart = Envelope;

/**
 * The custom data-part map for `useChat`/`createUIMessageStream`. Keys are the
 * `data-*` part type names; values are their payload shapes.
 */
export interface C360UIDataParts {
  step: DataStepPart;
  envelope: DataEnvelopePart;
}
