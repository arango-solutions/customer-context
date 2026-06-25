// agent/test/stream.test.ts
//
// PURE unit proof of the streaming variant's TERMINAL grounding invariant (D-01a,
// T-06-02). No live DB, no model call — these run on every commit without any env.
//
// The streaming path (stream.ts::askQuestionStream) mirrors runAgent()'s _id
// collection over the streamed steps, then runs the SAME terminal enforceGrounding()
// over the assembled envelope. This test proves that load-bearing equivalence two
// ways:
//   1. The pure assembly helper (assembleGroundedEnvelope) produces EXACTLY what
//      enforceGrounding produces directly — both for a fully-grounded envelope
//      (passthrough, refused:false) and for an ungrounded one (refusal, partial
//      sourcing). This is the terminal-gate invariant.
//   2. End-to-end through askQuestionStream with a MOCKED agent (injected via the
//      test-only agent seam): the emitted parts include a transient `data-step`
//      with phase `planning` BEFORE the persistent `data-envelope` part, and the
//      `data-envelope` payload equals enforceGrounding run directly.

import { describe, it, expect } from 'vitest';
import {
  assembleGroundedEnvelope,
  phaseFor,
  askQuestionStream,
  type StreamLikeAgent,
} from '../src/stream.js';
import { enforceGrounding } from '../src/grounding.js';
import { toCanonicalEnvelope } from '../src/agent.js';
import { mergeRetrievalPaths } from '../src/retrievalPath.js';
import type { Citation, GraphKind } from '../src/envelope.js';

type SynthCite = {
  graph: GraphKind;
  collection: string;
  _id: string;
  aql: string;
  traversal: string | null;
};

// --- fixtures -------------------------------------------------------------

const structuredCite: SynthCite = {
  graph: 'structured',
  collection: 'UsageFact',
  _id: 'UsageFact/meridian_2025q1',
  aql: 'FOR u IN UsageFact ...',
  traversal: null,
};

const unstructuredCite: SynthCite = {
  graph: 'unstructured',
  collection: 'customer360_Chunks',
  _id: 'customer360_Chunks/meridian_slack_renewal_risk_2025q1',
  aql: 'vector+BM25+RRF over Chunks',
  traversal: null,
};

const hallucinatedCite: SynthCite = {
  graph: 'unstructured',
  collection: 'customer360_Chunks',
  _id: 'customer360_Chunks/does_not_exist_fabricated',
  aql: 'vector+BM25+RRF over Chunks',
  traversal: null,
};

/** A SynthEnvelope (nullable traversal) the way the model emits it before normalization. */
function synthEnvelope(citations: SynthCite[]) {
  return {
    answer: 'Meridian usage is green but sentiment is red.',
    refused: false,
    claims: citations.map((c) => ({ text: `claim for ${c._id}`, citations: [c] })),
    citations,
    retrievalPath: [],
    reasoningTrace: ['resolved Meridian', 'pulled usage', 'pulled sentiment'],
  };
}

/** Build a fake StreamTextResult-like object that the assembly logic / askQuestionStream consume. */
function fakeResult(
  synth: ReturnType<typeof synthEnvelope>,
  toolReturnedIds: string[],
) {
  const steps = [
    {
      toolResults: toolReturnedIds.map((id) => ({
        output: {
          retrievalPath: {
            graph: 'structured' as const,
            collection: 'UsageFact',
            _ids: [id],
            query: 'FOR u IN UsageFact ...',
          },
        },
      })),
    },
  ];
  return {
    // fullStream must be drainable (Pitfall 1) — empty async iterator is fine for the mock.
    fullStream: (async function* () {})(),
    steps: Promise.resolve(steps),
    output: Promise.resolve(synth),
  };
}

// --- (1) phaseFor mapping (the six D-01 labels) ---------------------------

describe('phaseFor (D-01 tool → phase label mapping)', () => {
  it('maps each curated tool to its D-01 phase, default planning', () => {
    expect(phaseFor('entityLookup')).toBe('resolving entities');
    expect(phaseFor('structuredQuery')).toBe('querying structured');
    expect(phaseFor('hybridRetrieve')).toBe('searching docs');
    expect(phaseFor('bridgeResolve')).toBe('reconciling');
    expect(phaseFor(undefined)).toBe('planning');
    expect(phaseFor('somethingElse')).toBe('planning');
  });
});

// --- (2) the TERMINAL-GATE invariant (the load-bearing test) --------------

describe('assembleGroundedEnvelope (terminal grounding gate over streamed steps)', () => {
  it('grounded envelope → passes through unchanged (refused:false), equals enforceGrounding directly', async () => {
    const synth = synthEnvelope([structuredCite, unstructuredCite]);
    const result = fakeResult(synth, [structuredCite._id, unstructuredCite._id]);

    const out = await assembleGroundedEnvelope(result);

    // Build the same answer by running enforceGrounding directly on the canonical envelope.
    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);
    const canonical = toCanonicalEnvelope(synth as never);
    const expected = enforceGrounding(
      {
        ...canonical,
        retrievalPath: mergeRetrievalPaths([
          ...canonical.retrievalPath,
          { graph: 'structured', collection: 'UsageFact', _ids: [structuredCite._id], query: 'FOR u IN UsageFact ...', edges: [] },
          { graph: 'structured', collection: 'UsageFact', _ids: [unstructuredCite._id], query: 'FOR u IN UsageFact ...', edges: [] },
        ]),
      },
      returnedIds,
    );

    expect(out.refused).toBe(false);
    expect(out).toEqual(expected);
  });

  it('ungrounded envelope → refusal (refused:true), fabricated citation dropped, equals enforceGrounding directly', async () => {
    const synth = synthEnvelope([structuredCite, hallucinatedCite]);
    // The tools only ever returned the structured _id.
    const result = fakeResult(synth, [structuredCite._id]);

    const out = await assembleGroundedEnvelope(result);

    const returnedIds = new Set([structuredCite._id]);
    const canonical = toCanonicalEnvelope(synth as never);
    const expected = enforceGrounding(
      {
        ...canonical,
        retrievalPath: mergeRetrievalPaths([
          ...canonical.retrievalPath,
          { graph: 'structured', collection: 'UsageFact', _ids: [structuredCite._id], query: 'FOR u IN UsageFact ...', edges: [] },
        ]),
      },
      returnedIds,
    );

    expect(out.refused).toBe(true);
    // The fabricated citation must NOT survive.
    const allIds = [
      ...out.citations.map((c: Citation) => c._id),
      ...out.claims.flatMap((cl) => cl.citations.map((c: Citation) => c._id)),
    ];
    expect(allIds).not.toContain(hallucinatedCite._id);
    expect(allIds).toContain(structuredCite._id);
    // Byte-for-byte equal to running the gate directly — proves it IS the same gate.
    expect(out).toEqual(expected);
  });
});

// --- (2b) CR-01: the streaming path cannot emit a degenerate zero-tool answer ----

describe('CR-01: streaming path rejects the degenerate zero-tool plan-preamble answer', () => {
  it('a zero-tool, zero-claim/zero-citation non-refused run → refusal (NOT a confident unsourced answer)', async () => {
    // Simulate the EXACT degenerate run the missing force-retrieve guard let through on
    // the streaming path: the planner emitted its "To answer this I will: 1… 2…" plan as
    // the final answer on step 0 with ZERO tool calls — so no toolResults, returnedIds
    // empty, claims:[], citations:[]. Pre-fix, the streaming path (no prepareStep guard)
    // could reach this; the terminal grounding gate ALSO vacuously passed it (Layer 2).
    const planPreamble = {
      answer: 'To answer this question I will: 1. resolve the account 2. pull usage ...',
      refused: false,
      claims: [],
      citations: [],
      retrievalPath: [],
      reasoningTrace: ['planning'],
    };
    // No tool calls happened: zero steps with toolResults.
    const result = {
      fullStream: (async function* () {})(),
      steps: Promise.resolve([{ toolResults: [] as Array<{ output?: unknown }> }]),
      output: Promise.resolve(planPreamble),
    };

    const out = await assembleGroundedEnvelope(result);

    // The streaming path's terminal gate now converts it to a refusal (Layer 2),
    // and the shared agent factory (Layer 1) prevents the run from ever happening
    // (toolChoice:'required' until ≥1 tool runs) on the live model.
    expect(out.refused).toBe(true);
    expect(out.answer).not.toContain('To answer this question I will');
    expect(out.claims).toHaveLength(0);
    expect(out.citations).toHaveLength(0);

    // Byte-for-byte equal to running enforceGrounding directly — proves the streaming
    // path uses the SAME hardened terminal gate.
    const expected = enforceGrounding(
      { ...toCanonicalEnvelope(planPreamble as never), retrievalPath: mergeRetrievalPaths([]) },
      new Set<string>(),
    );
    expect(out).toEqual(expected);
  });
});

// --- (3) end-to-end part ordering with a MOCKED agent ---------------------

/** Read all emitted UI-message parts out of the streamed Response body. */
async function collectParts(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  const parts: Array<Record<string, unknown>> = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload === '[DONE]' || payload === '') continue;
    try {
      parts.push(JSON.parse(payload));
    } catch {
      // non-JSON SSE control line — ignore
    }
  }
  return parts;
}

describe('askQuestionStream (end-to-end, mocked agent — no live DB/model)', () => {
  it('emits a transient data-step(planning) BEFORE the persistent data-envelope, whose payload is the grounded envelope', async () => {
    const synth = synthEnvelope([structuredCite, unstructuredCite]);
    const result = fakeResult(synth, [structuredCite._id, unstructuredCite._id]);

    // Inject a mock agent whose .stream() fires onStepFinish once then resolves to our fake result.
    const mockAgent: StreamLikeAgent = {
      async stream({ onStepFinish }) {
        await onStepFinish?.({ toolCalls: [{ toolName: 'structuredQuery' }] } as never);
        return result as never;
      },
    };

    const response = askQuestionStream('How is Meridian doing?', { agent: mockAgent });
    const parts = await collectParts(response);

    const stepParts = parts.filter((p) => p.type === 'data-step');
    const envParts = parts.filter((p) => p.type === 'data-envelope');

    expect(envParts).toHaveLength(1);
    // A planning step exists.
    expect(stepParts.some((p) => (p.data as { phase?: string })?.phase === 'planning')).toBe(true);

    // Ordering: the FIRST planning data-step precedes the data-envelope in the wire order.
    const firstPlanningIdx = parts.findIndex(
      (p) => p.type === 'data-step' && (p.data as { phase?: string })?.phase === 'planning',
    );
    const envelopeIdx = parts.findIndex((p) => p.type === 'data-envelope');
    expect(firstPlanningIdx).toBeGreaterThanOrEqual(0);
    expect(envelopeIdx).toBeGreaterThan(firstPlanningIdx);

    // The data-envelope payload equals enforceGrounding run directly.
    const returnedIds = new Set([structuredCite._id, unstructuredCite._id]);
    const canonical = toCanonicalEnvelope(synth as never);
    const expected = enforceGrounding(
      {
        ...canonical,
        retrievalPath: mergeRetrievalPaths([
          ...canonical.retrievalPath,
          { graph: 'structured', collection: 'UsageFact', _ids: [structuredCite._id], query: 'FOR u IN UsageFact ...', edges: [] },
          { graph: 'structured', collection: 'UsageFact', _ids: [unstructuredCite._id], query: 'FOR u IN UsageFact ...', edges: [] },
        ]),
      },
      returnedIds,
    );
    expect(envParts[0].data).toEqual(expected);

    // The step rail includes the mapped phase for the tool call (structuredQuery → querying structured).
    expect(stepParts.some((p) => (p.data as { phase?: string })?.phase === 'querying structured')).toBe(true);
  });
});
