// agent/src/stream.ts
//
// D-01a — the ADDITIVE streaming variant of the agent. This is the one genuinely-new
// piece of agent code Phase 6 requires.
//
// askQuestionStream(question) builds the SAME ToolLoopAgent runAgent() builds (same
// model, instructions, tools, stopWhen, Output.object(SynthEnvelopeSchema)), but drives
// it via agent.stream() so the planner's progress can be surfaced live. It emits a
// transient `data-step` part per D-01 phase (the live reasoning rail) and — only AFTER
// running the SAME terminal enforceGrounding() the request/response path uses — emits the
// final grounded Envelope as a persistent `data-envelope` part.
//
// CARDINAL RULE (CLAUDE.md): the streamed step parts are transient PROGRESS, never an
// answer. The persisted answer is the OUTPUT of the terminal grounding gate over the
// tool-returned _id set, so a fabricated/ungrounded citation becomes a structured refusal
// exactly as askQuestion() produces (proven by stream.test.ts's ungrounded→refusal case).
//
// ADDITIVE: index.ts::askQuestion and agent.ts::runAgent are untouched. This module
// reuses the agent.ts seams (SynthEnvelopeSchema / toCanonicalEnvelope / TOOLS /
// PLANNER_SYSTEM_PROMPT / PLANNER_MODEL) rather than forking the contract.
//
// ENV (RESEARCH Pitfall 3 / T-06-04): this module deliberately does NOT load env (no
// dotenv-override call, no ./db env loader). The Next route + CLI own env loading;
// secrets stay in process.env read by the db singleton. No key is ever serialized into
// the stream.

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  NoObjectGeneratedError,
} from 'ai';
import { enforceGrounding } from './grounding.js';
import { attachNodeLabels } from './nodeLabels.js';
import { mergeRetrievalPaths, enforceEdgeHonesty } from './retrievalPath.js';
import {
  toCanonicalEnvelope,
  buildToolLoopAgent,
} from './agent.js';
import type { Envelope, PreGroundingEnvelope, RetrievalPathFragmentT } from './envelope.js';

/**
 * Map a finished step's first tool name to one of the six D-01 phase labels.
 * The six phases surfaced on the live rail: planning (initial + default), resolving
 * entities, querying structured, searching docs, reconciling, and answer (terminal).
 * `reconciling` is mapped to bridgeResolve — the actual Q12 reconciliation is a planner
 * reasoning step, not a distinct tool (RESEARCH A5); the label is cosmetic for the rail.
 */
export function phaseFor(toolName: string | undefined): string {
  switch (toolName) {
    case 'entityLookup':
      return 'resolving entities';
    case 'structuredQuery':
      return 'querying structured';
    case 'hybridRetrieve':
      return 'searching docs';
    case 'bridgeResolve':
      return 'reconciling';
    default:
      return 'planning';
  }
}

/**
 * The minimal shape of a streamed-run result that the assembly logic consumes.
 * Mirrors the relevant surface of the SDK's StreamTextResult (output/steps/fullStream)
 * so the assembly can be unit-tested with a plain fake (no live model/DB). Pitfall 1:
 * fullStream MUST be drained before output/steps resolve.
 */
export interface StreamResultLike {
  fullStream: AsyncIterable<unknown>;
  steps: Promise<
    ReadonlyArray<{
      toolResults: ReadonlyArray<{ output?: unknown }>;
    }>
  >;
  output: Promise<unknown>;
}

/**
 * The minimal agent surface askQuestionStream needs — a `.stream()` that accepts a
 * prompt + onStepFinish and resolves to a StreamResultLike. The real ToolLoopAgent
 * satisfies this; tests inject a mock to avoid a live model/DB.
 */
export interface StreamLikeAgent {
  stream(args: {
    prompt: string;
    onStepFinish?: (event: { toolCalls?: ReadonlyArray<{ toolName?: string }> }) => void | Promise<void>;
  }): Promise<StreamResultLike>;
}

/**
 * The TERMINAL grounding sequence, extracted as a pure async helper so it can be proven
 * equivalent to enforceGrounding() run directly (the load-bearing invariant) WITHOUT a
 * live model/DB. Mirrors runAgent():
 *   1. drain fullStream so the run completes (Pitfall 1),
 *   2. collect the ground-truth tool-returned _id set + retrievalPath fragments,
 *   3. normalize the synthesized output to the canonical Envelope,
 *   4. merge the tool fragments into retrievalPath,
 *   5. run the SAME enforceGrounding(merged, returnedIds) gate.
 */
export async function assembleGroundedEnvelope(
  result: StreamResultLike,
): Promise<Envelope> {
  // Pitfall 1: the StreamTextResult promises (output/steps) only resolve once the
  // stream is consumed. Drain fullStream before awaiting them.
  for await (const _ of result.fullStream) {
    /* progress already surfaced via onStepFinish */
  }

  const returnedIds = new Set<string>();
  const fragments: RetrievalPathFragmentT[] = [];

  const steps = await result.steps;
  for (const step of steps) {
    for (const tr of step.toolResults) {
      const frag = (tr.output as { retrievalPath?: RetrievalPathFragmentT } | undefined)
        ?.retrievalPath;
      if (frag && Array.isArray(frag._ids)) {
        fragments.push(frag);
        // SC-5 ISOLATION: returnedIds is built ONLY from frag._ids — NEVER from frag.edges.
        // edges[] carry Phase-11 VIZ-02 provenance data; an edge _id is NOT a citable
        // grounding anchor. Adding an edge _id here would change grounding verdicts and
        // break the eval gate (Pitfall 3 / SC-5 — 10-RESEARCH.md §The isolation guarantee).
        for (const id of frag._ids) returnedIds.add(id);
      }
    }
  }

  const synthesized = toCanonicalEnvelope(
    (await result.output) as Parameters<typeof toCanonicalEnvelope>[0],
  );
  // merged is PreGroundingEnvelope (no groundingScore yet) — enforceGrounding injects it.
  // D-04: after merging, enforce edge honesty — drop any fabricated traversed edge whose
  // _id was not actually returned by the tools' AQL (shared helper, mirrors agent.ts).
  // SC-5 stays intact: enforceEdgeHonesty builds its own separate edge-id set; it never
  // adds anything to returnedIds.
  const merged: PreGroundingEnvelope = {
    ...synthesized,
    retrievalPath: enforceEdgeHonesty(
      fragments,
      mergeRetrievalPaths([...synthesized.retrievalPath, ...fragments]),
    ),
  };

  // TERMINAL grounding gate — the SAME function index.ts::askQuestion uses (D-01a).
  // attachNodeLabels mirrors index.ts: display-only node naming, applied post-grounding.
  return attachNodeLabels(enforceGrounding(merged, returnedIds));
}

/** The structured refusal emitted when the model declines to produce an answer object
 * (NoObjectGeneratedError) — no fabricated sourcing. Mirrors runAgent()'s refusal.
 * groundingScore: 1.0 — zero-citation refusal = vacuously grounded (no fabricated citations);
 * required since EnvelopeSchema now mandates groundingScore. */
const REFUSAL_ENVELOPE: Envelope = {
  answer:
    'I cannot answer this question: it is out of scope for the customer-account ' +
    'data this system can source, so there are no records to ground an answer in.',
  refused: true,
  claims: [],
  citations: [],
  retrievalPath: [],
  reasoningTrace: [
    'The model declined to produce a grounded answer object for this request; ' +
      'no supporting records were retrieved, so the answer is refused (no fabricated sourcing).',
  ],
  groundingScore: 1.0,
};

/**
 * Build the SAME ToolLoopAgent runAgent() builds — via the SINGLE shared factory
 * (agent.ts::buildToolLoopAgent, CR-01) so the streaming path can never drift from the
 * request/response path. Critically, this is what carries the FORCE-RETRIEVE GUARD
 * (prepareStep toolChoice:'required' until ≥1 tool runs) onto the live-demo streaming
 * path: a zero-tool plan-preamble can no longer be emitted as a non-refused answer here.
 */
function buildAgent(): StreamLikeAgent {
  return buildToolLoopAgent() as unknown as StreamLikeAgent;
}

/**
 * Stream one question's answer as an SSE Response. Emits transient `data-step` parts
 * (the live D-01 reasoning rail) and, after the terminal grounding gate, a persistent
 * `data-envelope` part holding the grounded Envelope.
 *
 * @param question the user's free-form question
 * @param opts.agent test-only seam to inject a mocked agent (no live model/DB)
 */
export function askQuestionStream(
  question: string,
  opts?: { agent?: StreamLikeAgent },
): Response {
  const agent = opts?.agent ?? buildAgent();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Initial transient progress part — the rail shows life before the first tool call.
      writer.write({ type: 'data-step', data: { phase: 'planning' }, transient: true });

      try {
        const result = await agent.stream({
          prompt: question,
          onStepFinish: ({ toolCalls }) => {
            const phase = phaseFor(toolCalls?.[0]?.toolName);
            writer.write({ type: 'data-step', data: { phase }, transient: true });
          },
        });

        // Drain + collect + merge + TERMINAL grounding gate (the SAME gate askQuestion uses).
        // NOTE: NoObjectGeneratedError can be thrown HERE — when result.output is awaited
        // inside assembleGroundedEnvelope — not at agent.stream() setup. The model's
        // plain-text refusal (e.g. a moderation decline on a PII/out-of-scope question)
        // only surfaces on output resolution, so the catch below MUST cover this call too.
        // It previously wrapped agent.stream() alone, letting the streamed refusal escape
        // as a generic SSE error part — the deploy's adversarial-PII failure, fixed in 07-03.
        const envelope = await assembleGroundedEnvelope(result);

        // Persistent final part — the grounded answer center-stage.
        writer.write({ type: 'data-envelope', data: envelope });
        // Terminal transient rail tick.
        writer.write({ type: 'data-step', data: { phase: 'answer' }, transient: true });
      } catch (err) {
        // The model can short-circuit with a plain-text refusal (e.g. a moderation decline
        // on an out-of-scope/PII question); Output.object then throws NoObjectGeneratedError
        // — whether at stream setup OR, for streamed runs, when result.output is awaited.
        // Surface the SAME structured refusal runAgent() does (no fabricated sourcing)
        // rather than letting the throw escape as a generic error part.
        if (NoObjectGeneratedError.isInstance(err)) {
          writer.write({ type: 'data-envelope', data: REFUSAL_ENVELOPE });
          return;
        }
        throw err;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
