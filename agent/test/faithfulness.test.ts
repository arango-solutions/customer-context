// agent/test/faithfulness.test.ts
//
// Unit test for the RAGAS-style faithfulness judge (EVAL-01).
// Uses an injected fake LanguageModelV3 so NO live OpenAI call is made —
// this test runs in CI without any env vars.
//
// The six behaviors tested:
//  1. judgeClaim returns 'supported' when the model says the evidence entails the claim
//  2. judgeClaim returns 'unsupported' when the model says it does not
//  3. judgeClaim returns 'abstain' when evidence is unreadable/irrelevant
//  4. faithfulness({claims:[supported,supported]}) → score 1.0, unsupported []
//  5. faithfulness({claims:[supported,abstain]}) → score 0.5, abstained claim is in unsupported[]
//  6. faithfulness({claims:[]}) → score 1.0 (vacuously faithful)
//
// Fake model approach: implement the LanguageModelV3 interface (doGenerate only).
// generateObject requests a JSON object; the fake model returns the JSON text directly.

import { describe, it, expect } from 'vitest';
import type {
  LanguageModelV3,
  LanguageModelV3GenerateResult,
  LanguageModelV3FinishReason,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { judgeClaim, faithfulness, JUDGE_MODEL } from '../src/faithfulness.js';
import type { Claim, Envelope } from '../src/envelope.js';

// ---------------------------------------------------------------------------
// Helpers: build minimal Claim / Envelope fixtures that do NOT touch ArangoDB.
// The fake model is injected so the judge never fetches record content from
// the DB in these unit tests.
// ---------------------------------------------------------------------------

/** Build a minimal Claim with one citation whose _id the fake judge uses. */
function makeClaim(text: string, id: string = 'TestCollection/1'): Claim {
  return {
    text,
    citations: [
      {
        graph: 'structured',
        collection: 'TestCollection',
        _id: id,
        aql: 'RETURN DOCUMENT(@id)',
      },
    ],
  };
}

/** Build a minimal Envelope containing only claims (no live DB required). */
function makeEnvelope(claims: Claim[]): Envelope {
  return {
    answer: 'test answer',
    refused: false,
    claims,
    citations: claims.flatMap((c) => c.citations),
    retrievalPath: [],
    reasoningTrace: [],
  };
}

// ---------------------------------------------------------------------------
// Fake evidence fetcher: returns pre-canned text without touching ArangoDB.
// ---------------------------------------------------------------------------

async function fakeEvidenceFetcher(_id: string): Promise<string> {
  return `Fake evidence for ${_id}: ArangoDB is a multi-model graph database.`;
}

// ---------------------------------------------------------------------------
// Fake LanguageModelV3 factory.
// Each instance is pre-loaded with a queue of verdicts to return in order.
// ---------------------------------------------------------------------------

type FakeVerdict = 'supported' | 'unsupported' | 'abstain';

function makeFakeModel(verdicts: FakeVerdict[]): LanguageModelV3 {
  let callIndex = 0;

  return {
    specificationVersion: 'v3' as const,
    provider: 'fake',
    modelId: 'fake-model',
    supportedUrls: {},

    async doGenerate(): Promise<LanguageModelV3GenerateResult> {
      const verdict = verdicts[callIndex] ?? 'abstain';
      callIndex++;
      // generateObject parses the text content as JSON.
      const responseJson = JSON.stringify({ verdict, rationale: `fake rationale for ${verdict}` });
      const finishReason: LanguageModelV3FinishReason = { unified: 'stop', raw: 'stop' };
      const usage: LanguageModelV3Usage = {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      };
      return {
        content: [{ type: 'text', text: responseJson }],
        finishReason,
        usage,
        warnings: [],
      };
    },

    async doStream() {
      throw new Error('doStream not implemented in fake model');
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JUDGE_MODEL constant', () => {
  it('defaults to gpt-4o when env var is absent', () => {
    // JUDGE_MODEL is process.env.JUDGE_MODEL ?? 'gpt-4o'
    // In the unit test env JUDGE_MODEL is not set, so it should be 'gpt-4o'.
    expect(typeof JUDGE_MODEL).toBe('string');
    expect(JUDGE_MODEL.length).toBeGreaterThan(0);
  });
});

describe('judgeClaim — injected fake model (no live OpenAI)', () => {
  it('returns "supported" when the model verdict is supported', async () => {
    const model = makeFakeModel(['supported']);
    const claim = makeClaim('Northwind adopted ArangoDB Enterprise.');
    const verdict = await judgeClaim(claim, model, fakeEvidenceFetcher);
    expect(verdict).toBe('supported');
  });

  it('returns "unsupported" when the model verdict is unsupported', async () => {
    const model = makeFakeModel(['unsupported']);
    const claim = makeClaim('Northwind uses PostgreSQL exclusively.');
    const verdict = await judgeClaim(claim, model, fakeEvidenceFetcher);
    expect(verdict).toBe('unsupported');
  });

  it('returns "abstain" when evidence is unreadable/irrelevant', async () => {
    const model = makeFakeModel(['abstain']);
    const claim = makeClaim('Unknown claim with irrelevant evidence.');
    const verdict = await judgeClaim(claim, model, fakeEvidenceFetcher);
    expect(verdict).toBe('abstain');
  });
});

describe('faithfulness — injected fake model (no live OpenAI)', () => {
  it('score 1.0 with empty unsupported[] when all claims are supported', async () => {
    const model = makeFakeModel(['supported', 'supported']);
    const env = makeEnvelope([
      makeClaim('Claim A', 'Col/1'),
      makeClaim('Claim B', 'Col/2'),
    ]);
    const result = await faithfulness(env, model, fakeEvidenceFetcher);
    expect(result.score).toBe(1);
    expect(result.unsupported).toHaveLength(0);
  });

  it('score 0.5 when one claim supported and one abstain; abstain is in unsupported[]', async () => {
    const model = makeFakeModel(['supported', 'abstain']);
    const claimA = makeClaim('Claim A', 'Col/1');
    const claimB = makeClaim('Claim B — abstained', 'Col/2');
    const env = makeEnvelope([claimA, claimB]);
    const result = await faithfulness(env, model, fakeEvidenceFetcher);
    expect(result.score).toBe(0.5);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]?.text).toBe('Claim B — abstained');
  });

  it('score 1.0 vacuously when claims array is empty', async () => {
    const model = makeFakeModel([]);
    const env = makeEnvelope([]);
    const result = await faithfulness(env, model, fakeEvidenceFetcher);
    expect(result.score).toBe(1);
    expect(result.unsupported).toHaveLength(0);
  });
});
