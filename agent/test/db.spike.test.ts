// agent/test/db.spike.test.ts
//
// Wave-0 arangojs read spike (RESEARCH Open Q3). Determines and documents the
// working auth mode against the live customer360 cluster:
//   - basic auth (username/password) — expected to work for READS
//   - JWT via POST /_open/auth + useBearerAuth — the documented fallback if basic 401s
//
// loadEnv() runs first so creds come from .env (override:true), never a stale shell
// value (D-06 gotcha). hasLiveDb() skip-guards the whole suite so it self-skips
// cleanly when .env is absent.

import { describe, it, expect } from 'vitest';
import { aql } from 'arangojs';
import { loadEnv, getDb } from '../src/db.js';
import { hasLiveDb } from './fixtures.js';

// Load .env (override:true) at module scope, BEFORE the skip-guard is evaluated,
// so hasLiveDb() sees the cluster creds from .env (not a stale shell value, D-06).
loadEnv();

const live = hasLiveDb();

describe.skipIf(!live)('arangojs read spike (auth mode)', () => {
  it('reads RETURN 1 from the live cluster, documenting the working auth mode', async () => {
    let workingMode: 'basic' | 'bearer' | null = null;
    let value: number | undefined;

    // Try basic auth first (the read path).
    try {
      const dbBasic = await getDb({ mode: 'basic' });
      const cursor = await dbBasic.query(aql`RETURN 1`);
      const rows = (await cursor.all()) as number[];
      if (rows[0] === 1) {
        workingMode = 'basic';
        value = rows[0];
      }
    } catch (err) {
      // Basic-auth read failed (e.g. 401) — fall through to the bearer fallback.
      // Intentionally do NOT log the error object (it may carry auth headers).
      void err;
    }

    // If basic auth did not yield [1], exercise the JWT/bearer fallback.
    if (workingMode === null) {
      const dbBearer = await getDb({ mode: 'bearer' });
      const cursor = await dbBearer.query(aql`RETURN 1`);
      const rows = (await cursor.all()) as number[];
      expect(rows[0]).toBe(1);
      workingMode = 'bearer';
      value = rows[0];
    }

    // DOCUMENTED RESULT (read by Wave 1): which auth mode the specialists use.
    // eslint-disable-next-line no-console
    console.log(`[db.spike] working arangojs read auth mode = ${workingMode}`);
    expect(value).toBe(1);
    expect(workingMode).not.toBeNull();
  });
});
