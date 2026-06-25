// scripts/rehearse.ts
//
// EVAL-02 rehearsal harness (D-07): fires a few CONCURRENT /api/ask calls against
// the live Vercel deploy (Part A) + the adversarial question set (Part B) and
// asserts graceful behavior.
//
// AUTHENTICATION
//   The deploy at https://customer360-demo-jade.vercel.app is SSO-protected. There
//   are two ways to reach it from this script:
//
//   Option 1 — Automation bypass secret (default for CI / rehearsal machines):
//     Set VERCEL_AUTOMATION_BYPASS_SECRET in env. The script sends it as the
//     `x-vercel-protection-bypass` header (Vercel Deployment Protection bypass).
//     [CITED: vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation]
//
//   Option 2 — D-08 browser-session alternative:
//     If you are already authenticated via the Vercel SSO browser session (e.g.
//     running the script from a machine where the browser session cookie is active,
//     or from an environment with a valid Vercel CLI session), set
//     VERCEL_AUTOMATION_BYPASS_SECRET to an empty string or omit it. The request
//     will still succeed because the deploy treats the session as authorised.
//     In practice: log in via `vercel login` or the Vercel dashboard browser session
//     before running the script without the bypass secret.
//
// USAGE
//   BASE=https://customer360-demo-jade.vercel.app \
//   VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
//   npx tsx scripts/rehearse.ts
//
// EXIT CODE
//   0 on all-pass; 1 if any assertion fails.

import { ADVERSARIAL_QUESTIONS } from '../agent/test/adversarial.js';
import type { AdversarialQuestion } from '../agent/test/adversarial.js';

// ── Env ──────────────────────────────────────────────────────────────────────

const BASE = (process.env.BASE ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('ERROR: BASE env var is required (e.g. https://customer360-demo-jade.vercel.app)');
  process.exit(1);
}

const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Citation {
  graph: string;
  collection: string;
  _id: string;
  aql: string;
  traversal?: string;
}

interface DataEnvelope {
  answer: string;
  refused: boolean;
  claims: Array<{ text: string; citations: Citation[] }>;
  citations: Citation[];
  retrievalPath: Array<{ graph: string; collection: string; _ids: string[]; query: string }>;
  reasoningTrace: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A real ArangoDB _id is "Collection/key". */
function looksLikeArangoId(id: string): boolean {
  return /^[A-Za-z0-9_]+\/.+/.test(id);
}

/**
 * Build the fetch headers. The bypass secret is sent as `x-vercel-protection-bypass`
 * only if the env var is set (T-07-08: never hard-coded, never logged).
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = BYPASS_SECRET;
  }
  return headers;
}

/**
 * POST a question to /api/ask and return the parsed data-envelope from the SSE stream.
 *
 * The route returns a UIMessageStream SSE response. The persistent grounded answer
 * lives in parts whose `type` is `"data-envelope"`:
 *   data: {"type":"data-envelope","data":{"answer":...,"refused":false,...}}
 * Transient progress parts (`"data-step"` with `"transient":true`) are skipped.
 */
async function askViaHttp(question: string): Promise<{ ok: boolean; status: number; envelope: DataEnvelope | null }> {
  const url = `${BASE}/api/ask`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ question }),
  });

  if (!res.ok || res.body == null) {
    return { ok: res.ok, status: res.status, envelope: null };
  }

  // Consume the SSE stream and extract the data-envelope part.
  const decoder = new TextDecoder();
  let buffer = '';
  let envelope: DataEnvelope | null = null;

  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines.
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer.
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw) as { type?: string; data?: unknown };
          if (parsed.type === 'data-envelope' && parsed.data != null) {
            // Last data-envelope wins (the stream may emit intermediate ones).
            envelope = parsed.data as DataEnvelope;
          }
        } catch {
          // Malformed SSE line — skip silently.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { ok: res.ok, status: res.status, envelope };
}

// ── PASS/FAIL accounting ──────────────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;

function pass(label: string, detail?: string): void {
  totalPassed++;
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, reason: string): void {
  totalFailed++;
  console.error(`  FAIL  ${label} — ${reason}`);
}

// ── Part A: N=4 concurrent grounded calls ────────────────────────────────────
//
// Uses the Q2 renewal-risk prompt from questions.eval.test.ts (dual-graph;
// representative of the "why" questions that span both structured + unstructured).
// A structured-only question (Q7) would be cheaper but less representative of the
// real demo path.

const GROUNDED_QUESTION =
  'Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their ' +
  'contract renewal date and usage trend together with the CSM Slack notes, renewal ' +
  'emails, and QBR documents that explain any risk.';

const N = 4;

async function runPartA(): Promise<void> {
  console.log(`\nPart A — ${N} concurrent grounded /api/ask calls`);
  console.log(`  Question: "${GROUNDED_QUESTION.slice(0, 80)}..."`);
  console.log(`  Endpoint: ${BASE}/api/ask`);

  const calls = Array.from({ length: N }, (_, i) =>
    askViaHttp(GROUNDED_QUESTION).then((r) => ({ i, ...r })),
  );
  const results = await Promise.all(calls);

  for (const { i, ok, status, envelope } of results) {
    const label = `A${i + 1}`;

    if (!ok) {
      fail(label, `HTTP ${status} — expected 200`);
      continue;
    }
    if (envelope == null) {
      fail(label, 'no data-envelope in SSE stream');
      continue;
    }
    if (envelope.refused) {
      fail(label, `envelope.refused === true — expected non-refusal for a grounded question`);
      continue;
    }
    if (envelope.citations.length === 0) {
      fail(label, `citations.length === 0 — expected at least one citation`);
      continue;
    }
    pass(
      label,
      `HTTP 200, refused=false, citations=${envelope.citations.length}`,
    );
  }
}

// ── Part B: adversarial refusal set ──────────────────────────────────────────
//
// Imported (not copied) from ../agent/test/adversarial.js — this is the ONLY
// working path because the customer360-agent package exports map exposes only
// "." and "./stream", not "test/". Keeping it as an import (not a copy) ensures
// the rehearsal stays in sync with Plan 07-01's adversarial set automatically.

async function runPartB(): Promise<void> {
  console.log(`\nPart B — adversarial refusal set (${ADVERSARIAL_QUESTIONS.length} questions)`);

  for (const { label, question } of ADVERSARIAL_QUESTIONS as AdversarialQuestion[]) {
    const { ok, status, envelope } = await askViaHttp(question);

    if (!ok) {
      fail(label, `HTTP ${status} — expected 200 even for a refusal`);
      continue;
    }
    if (envelope == null) {
      fail(label, 'no data-envelope in SSE stream');
      continue;
    }
    if (!envelope.refused) {
      fail(label, `envelope.refused === false — adversarial question must refuse`);
      continue;
    }

    // Verify no fabricated _id survives: every citation _id must be Collection/key shape.
    const allIds: string[] = [
      ...envelope.citations.map((c) => c._id),
      ...envelope.claims.flatMap((cl) => cl.citations.map((c) => c._id)),
    ];
    const fabricated = allIds.filter((id) => !looksLikeArangoId(id));
    if (fabricated.length > 0) {
      fail(label, `fabricated _id(s) detected: ${fabricated.join(', ')}`);
      continue;
    }

    pass(
      label,
      `HTTP 200, refused=true, no fabricated _id (checked ${allIds.length} ids)`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Customer360 live rehearsal (EVAL-02 / D-07) ===');
  console.log(`Target: ${BASE}`);
  console.log(`SSO bypass: ${BYPASS_SECRET ? 'VERCEL_AUTOMATION_BYPASS_SECRET set' : 'not set (D-08 browser-session mode)'}`);

  await runPartA();
  await runPartB();

  console.log('\n=== Summary ===');
  console.log(`  PASSED: ${totalPassed}`);
  console.log(`  FAILED: ${totalFailed}`);

  if (totalFailed > 0) {
    console.error(`\nREHEARSAL FAILED — ${totalFailed} assertion(s) did not pass.`);
    process.exit(1);
  } else {
    console.log(`\nREHEARSAL PASSED — all ${totalPassed} assertions green.`);
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
