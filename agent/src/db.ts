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
 *
 * Serverless safety (Phase 7 / 07-02): loadEnv()'s ONLY job is the LOCAL stale-shell
 * override. On Vercel there is no repo-root `.env` and `dotenv` is not in the traced
 * serverless bundle (Next does not follow the dynamic `require`), so the whole body
 * must no-op gracefully there — never throw. `process.env` is already authoritative on
 * Vercel (it injects ARANGO_ and OPENAI_API_KEY). Without this guard, askQuestion() — the
 * public entrypoint the Vercel /api/canary route calls — threw synchronously (`ms:1`
 * red) before any DB work. The streaming /api/ask path never calls loadEnv(), which is
 * why only the canary surfaced it.
 */
export function loadEnv(): void {
  try {
    // agent/src/db.ts -> repo root is two levels up from this file's dir.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, '..', '..');
    const envPath = path.join(repoRoot, '.env');
    // dotenv is a dependency; load it via createRequire so this stays sync (callers
    // invoke loadEnv() synchronously at the top of CLI/test entrypoints).
    const dotenv = require('dotenv') as typeof import('dotenv');
    // quiet: keep stdout clean — the CLI's contract is pure-JSON envelope output,
    // so dotenv's "injected env" banner must not pollute the pipe (Phase 5 verify warning).
    dotenv.config({ path: envPath, override: true, quiet: true });
  } catch {
    // No dotenv / no .env (Vercel serverless bundle): process.env is authoritative
    // there, so silently skip the local override. Must NOT throw.
  }
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
      // The singleton is shared across all concurrent /api/ask requests on a warm
      // Vercel Fluid Compute instance. Each question fans out to several sequential
      // tool queries, so the default poolSize of 3 enqueues requests under a few
      // concurrent demo questions. Raise it so the concurrent rehearsal/demo path is
      // not pool-starved (debug/arango-serverless-flaky).
      poolSize: 10,
      // Slim PERMANENT diagnostic (one line, no secret/body): an intermittent backend
      // failure on the serverless path is otherwise swallowed into the AI SDK tool-error
      // and paraphrased by the model as "backend access error". This keeps a breadcrumb
      // in Vercel runtime logs so any recurrence is attributable to its true error class.
      onError: (err: Error) => {
        const e = err as Error & { code?: string; cause?: { code?: string } };
        console.error(
          `[arango] request error: ${e.name}: ${e.message}` +
            (e.code ? ` code=${e.code}` : '') +
            (e.cause?.code ? ` causeCode=${e.cause.code}` : ''),
        );
      },
    });
  }
  return _db;
}

/**
 * Transient connection errors that arangojs does NOT retry on its own. Per the arangojs
 * docs, requests bound to a specific server (e.g. fetching query results) are never
 * retried automatically — so a reset on a reused, server-half-closed keep-alive socket
 * (the Vercel Fluid Compute failure mode) surfaces as an unrecoverable throw. We retry
 * these a bounded number of times: a fresh attempt opens a new socket.
 */
const TRANSIENT_CONN_RE =
  /ECONNRESET|socket hang up|UND_ERR_SOCKET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|other side closed|terminated|network/i;

function isTransientConnError(err: unknown): boolean {
  const e = err as
    | { code?: string; message?: string; cause?: { code?: string; message?: string } }
    | undefined;
  const haystack = `${e?.code ?? ''} ${e?.message ?? ''} ${e?.cause?.code ?? ''} ${e?.cause?.message ?? ''}`;
  return TRANSIENT_CONN_RE.test(haystack);
}

/**
 * Run a read op with a bounded retry on transient connection errors. Reads are
 * idempotent, so re-issuing is safe. Non-transient errors (bad AQL, 404, auth) throw
 * immediately — we only paper over the serverless stale-socket failure mode, never a
 * real query error (debug/arango-serverless-flaky).
 */
export async function withDbRetry<T>(op: () => Promise<T>, label = 'db.query'): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransientConnError(err)) throw err;
      console.error(
        `[arango] transient connection error on ${label}; retry ${attempt}/${maxAttempts - 1}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw lastErr;
}

/**
 * PERF-01 cold-start pre-warm: issue a trivial RETURN 1 AQL so the first real tool
 * query skips TCP setup + basic-auth handshake latency (the Vercel Fluid Compute
 * cold-socket cost withDbRetry already papers over at the retry level).
 *
 * Guarded so that a missing cluster (unit tests, CI without ARANGO_ENDPOINT) is a
 * silent no-op — never throws. The async result is intentionally discarded; this is a
 * fire-and-forget warm-up, not a gating check.
 *
 * GROUNDING-NEUTRAL: touches no answer data, no collection, no graph. Pure latency.
 */
export async function prewarmDb(): Promise<void> {
  try {
    const db = getDbSingleton();
    const arangojs = await import('arangojs');
    await db.query(arangojs.aql`RETURN 1`);
  } catch {
    // Silently swallow — missing cluster (unit tests / CI) or connection error at
    // module init must never crash the module. The first real query will establish
    // the connection through the normal withDbRetry path if pre-warm failed.
  }
}

// Fire pre-warm as a module-load side-effect (fire-and-forget). This starts the TCP
// handshake and auth before the first /api/ask request arrives, so cold-start latency
// is paid upfront rather than on the first user query.
// Guard: if ARANGO_ENDPOINT is absent (unit test environments without the cluster),
// prewarmDb() catches and swallows the error above — no module-load failure.
if (process.env.ARANGO_ENDPOINT) {
  prewarmDb().catch(() => {
    // swallow — identical guard to the prewarmDb catch above; double-guarded so
    // any unhandled rejection from this fire-and-forget never surfaces in logs.
  });
}

/**
 * Backwards/forwards-compatible named export used by the specialists in Waves 1-2.
 * It is a getter-backed proxy so `db.query(...)` works while construction stays lazy.
 * `query` is wrapped with withDbRetry so every specialist's read transparently survives
 * a transient serverless connection reset (debug/arango-serverless-flaky); all other
 * members pass through unchanged.
 */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop) {
    const real = getDbSingleton() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    if (prop === 'query' && typeof value === 'function') {
      return (...args: unknown[]) =>
        withDbRetry(() => (value as (...a: unknown[]) => Promise<unknown>).apply(real, args), 'db.query');
    }
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
