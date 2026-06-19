// agent/test/rrf.test.ts
//
// PURE unit tests for the RRF fusion (no live DB, runs on every commit without env)
// plus one live-key-guarded assertion that embedQuery returns a 512-dim vector.
//
// RRF (Reciprocal Rank Fusion): for each input list, an _id at 1-based rank r
// contributes 1/(k + r) to its score; scores accumulate across both lists; the
// result is sorted by descending score (Pitfall 6 — fused in TS, NOT in AQL).

import { describe, it, expect } from 'vitest';
import { fuseRRF } from '../src/rrf.js';
import { embedQuery } from '../src/embed.js';
import { loadEnv } from '../src/db.js';
import { hasOpenAi } from './fixtures.js';

// Load .env (override:true) at module scope, BEFORE the skip-guard is evaluated,
// so OPENAI_API_KEY comes from .env, never a stale shell value (D-06 / Pitfall 3).
loadEnv();

describe('fuseRRF — pure RRF fusion of two ranked _id lists', () => {
  it('returns [] for two empty inputs', () => {
    expect(fuseRRF([], [])).toEqual([]);
  });

  it('returns [] for empty inputs even with a custom k', () => {
    expect(fuseRRF([], [], 30)).toEqual([]);
  });

  it('ranks an _id appearing in BOTH lists above one in only ONE list', () => {
    // "both" is rank 2 in each list; "onlyA"/"onlyB" appear once each.
    const fused = fuseRRF(['onlyA', 'both'], ['onlyB', 'both']);
    expect(fused[0]._id).toBe('both');
    // both = 1/(60+2) + 1/(60+2) ; each single = 1/(60+1)
    const both = fused.find((e) => e._id === 'both')!;
    const onlyA = fused.find((e) => e._id === 'onlyA')!;
    expect(both.score).toBeGreaterThan(onlyA.score);
  });

  it('ranks an _id at rank 1 in BOTH lists above an _id at rank 1 in only one', () => {
    // "x" is rank 1 in both lists; "y" is rank 1 in list A only.
    const fused = fuseRRF(['x', 'y'], ['x']);
    expect(fused[0]._id).toBe('x');
    const x = fused.find((e) => e._id === 'x')!;
    const y = fused.find((e) => e._id === 'y')!;
    // x = 1/(60+1) + 1/(60+1) ; y = 1/(60+2)
    expect(x.score).toBeGreaterThan(y.score);
  });

  it('uses the reciprocal-rank formula 1/(k+rank) with rank starting at 1', () => {
    const fused = fuseRRF(['a'], []);
    // single _id at rank 1 in one list → 1/(60+1)
    expect(fused).toHaveLength(1);
    expect(fused[0]._id).toBe('a');
    expect(fused[0].score).toBeCloseTo(1 / 61, 12);
  });

  it('respects a custom k in the score', () => {
    const fused = fuseRRF(['a'], [], 10);
    expect(fused[0].score).toBeCloseTo(1 / 11, 12);
  });

  it('returns entries sorted by descending RRF score', () => {
    const fused = fuseRRF(['a', 'b', 'c'], ['c', 'b', 'a']);
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].score).toBeGreaterThanOrEqual(fused[i].score);
    }
  });

  it('dedupes a single _id across both lists into one entry', () => {
    const fused = fuseRRF(['z'], ['z']);
    expect(fused).toHaveLength(1);
    expect(fused[0]._id).toBe('z');
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 61, 12);
  });
});

describe.skipIf(!hasOpenAi())('embedQuery — live OpenAI 512-dim query embedding', () => {
  it('returns a 512-length number[] (text-embedding-3-small, dimensions=512)', async () => {
    const vec = await embedQuery('partnership health escalation sentiment');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec).toHaveLength(512);
    expect(typeof vec[0]).toBe('number');
  });
});
