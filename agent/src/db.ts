// agent/src/db.ts
//
// arangojs Database access for the agent (Node runtime — arangojs uses node:https,
// not available on Vercel Edge).
//
// Auth: the live cluster accepts basic auth for READS; DDL (e.g. the Wave-0 view
// create) requires a JWT obtained via POST /_open/auth (Phase 1 finding,
// scripts/stamp_account_id.py). getDb() exposes both paths so callers can fall
// back to the bearer token when basic auth 401s.
//
// Env discipline (D-06 gotcha): a stale shell OPENAI_API_KEY / ARANGO_* has
// shadowed the valid .env value on this machine before. loadEnv() loads the
// repo-root .env with override:true (mirroring the Python load_dotenv(override=True)
// rule) so the agent NEVER inherits a stale shell value. Call loadEnv() from CLI/
// test entrypoints — NOT at module scope here, because Next.js (Phase 6) loads its
// own env and we must not stomp it.

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Database } from 'arangojs';

const require = createRequire(import.meta.url);

/**
 * Load the repo-root .env with override:true so .env wins over any stale shell
 * value (D-06 stale-key gotcha). Idempotent-safe to call from each entrypoint.
 */
export function loadEnv(): void {
  // agent/src/db.ts -> repo root is two levels up from this file's dir.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..');
  const envPath = path.join(repoRoot, '.env');
  // dotenv is a dependency; load it via createRequire so this stays sync (callers
  // invoke loadEnv() synchronously at the top of CLI/test entrypoints).
  const dotenv = require('dotenv') as typeof import('dotenv');
  dotenv.config({ path: envPath, override: true });
}

function arangoUrl(): string {
  const url = process.env.ARANGO_ENDPOINT;
  if (!url) throw new Error('ARANGO_ENDPOINT is not set (load .env via loadEnv()).');
  return url;
}

function arangoDbName(): string {
  return process.env.ARANGO_DATABASE ?? 'customer360';
}

/**
 * The default singleton — basic-auth, read path. Lazily constructed so that
 * importing this module does not require ARANGO_* to be present (unit tests that
 * never touch the DB must import envelope-adjacent code without a live cluster).
 */
let _db: Database | undefined;
export function getDbSingleton(): Database {
  if (!_db) {
    _db = new Database({
      url: arangoUrl(),
      databaseName: arangoDbName(),
      auth: {
        username: process.env.ARANGO_USERNAME!,
        password: process.env.ARANGO_PASSWORD!,
      },
    });
  }
  return _db;
}

/**
 * Backwards/forwards-compatible named export used by the specialists in Waves 1-2.
 * It is a getter-backed proxy so `db.query(...)` works while construction stays lazy.
 */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDbSingleton() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as Function).bind(real) : value;
  },
});

/**
 * Obtain a JWT from the live cluster via POST /_open/auth (the flow DDL requires
 * on this deployment — Phase 1 finding, ported from scripts/stamp_account_id.py).
 */
export async function fetchJwt(): Promise<string> {
  const url = arangoUrl();
  const resp = await fetch(`${url}/_open/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ARANGO_USERNAME,
      password: process.env.ARANGO_PASSWORD,
    }),
  });
  if (!resp.ok) {
    throw new Error(`/_open/auth failed: HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { jwt?: string };
  if (!json.jwt) throw new Error('/_open/auth returned no jwt');
  return json.jwt;
}

/**
 * Factory so tests/tools can construct a Database with the auth mode they need:
 *  - mode 'basic'  → username/password (the read path; verified working in Task 2)
 *  - mode 'bearer' → JWT via /_open/auth + db.useBearerAuth(jwt) (the DDL/fallback path)
 *
 * getDb() defaults to basic auth (the documented working read mode). Pass
 * { mode: 'bearer' } for DDL or if a basic-auth read ever 401s.
 */
export async function getDb(
  opts: { mode?: 'basic' | 'bearer' } = {},
): Promise<Database> {
  const mode = opts.mode ?? 'basic';
  const database = new Database({
    url: arangoUrl(),
    databaseName: arangoDbName(),
  });
  if (mode === 'bearer') {
    const jwt = await fetchJwt();
    database.useBearerAuth(jwt);
  } else {
    database.useBasicAuth(process.env.ARANGO_USERNAME!, process.env.ARANGO_PASSWORD!);
  }
  return database;
}
