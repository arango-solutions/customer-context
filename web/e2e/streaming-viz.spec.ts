// web/e2e/streaming-viz.spec.ts
//
// Phase-11 / Plan-03 Task-3 — Streaming smoke-test + viz render (SC-6 / RESEARCH Pitfall 3).
//
// PURPOSE:
//   The eval gate (`scripts/eval-gate.ts`) exercises ONLY the non-streaming path
//   (`askQuestion`). The streaming UI path (`askQuestionStream` → `useAsk` →
//   page.tsx render) is a BLIND SPOT for the gate (RESEARCH Pitfall 3). This spec
//   is the automated guard for that blind spot: it proves the composed page renders
//   the streamed terminal answer, the numbered claim list, the TrustChip, and —
//   after switching the rail toggle — the React Flow GraphViz canvas with the
//   same_as bridge edge (the cross-graph centrepiece of the Q12 demo).
//
// HOW THE MOCK WORKS (inherits the pattern from ask.spec.ts):
//   - Route intercept on `/api/ask` fulfills with a canned SSE body using the same
//     `createUIMessageStreamResponse` framing the real route produces, so wire-format
//     can never drift from the installed `ai` version.
//   - EDGES_ENVELOPE (Plan 01 fixture) is used instead of GROUNDED_ENVELOPE because
//     it carries an explicit edges[] array with all three edge kinds (traversed,
//     structural, hybrid) — including a traversed same_as cross-graph bridge edge —
//     which is what the viz needs to render the cross-graph canvas.
//   - The mock emits several `data-step` transient parts before the `data-envelope`
//     to exercise the live ReasoningTimeline advance.
//
// WHAT THIS SPEC CANNOT VERIFY (human checkpoint required — Plan 03 Task 3):
//   1. Streaming plays end-to-end against a LIVE agent (live ArangoDB + OpenAI) —
//      the mock isolates the UI layer from those dependencies.
//   2. Visual brand-green parity (structured badge == structured viz node == #007339) —
//      screenshot diff is out of scope for this CI-runnable spec.
//   3. Exact React Flow layout/animation feel — visual assertion.
//
// These are gated by the human-verify checkpoint (Task 3, how-to-verify checklist).

import { test, expect, type Page } from '@playwright/test';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { Envelope } from 'customer360-agent';
import { EDGES_ENVELOPE, GROUNDED_ENVELOPE, REFUSED_ENVELOPE } from '../test/fixtures';

/** Phase labels emitted before the final envelope (mirrors stream.ts). */
const PHASE_STEPS = [
  'planning',
  'querying structured',
  'searching docs',
  'resolving entities',
  'reconciling',
] as const;

/**
 * Serialize a canned SSE body using the SDK's own serializer so wire-format
 * tracks the installed `ai` version (same pattern as ask.spec.ts).
 */
async function buildSse(
  envelope: Envelope,
): Promise<{ body: string; headers: Record<string, string> }> {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      for (const phase of PHASE_STEPS) {
        writer.write({ type: 'data-step', data: { phase }, transient: true });
      }
      writer.write({ type: 'data-envelope', data: envelope });
      writer.write({ type: 'data-step', data: { phase: 'answer' }, transient: true });
    },
  });
  const res = createUIMessageStreamResponse({ stream });
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { body, headers };
}

/** Intercept `/api/ask` and fulfill it with a canned SSE body (no live agent). */
async function mockAsk(page: Page, envelope: Envelope): Promise<void> {
  const { body, headers } = await buildSse(envelope);
  await page.route('**/api/ask', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'text/event-stream' },
      body,
    });
  });
}

test.describe('Streaming viz smoke (Phase 11 — mocked stream)', () => {
  // ── Test 1: Streamed answer renders as a numbered claim list + TrustChip ──

  test('Q12 streamed terminal answer renders numbered claims + TrustChip Grounded ✓', async ({
    page,
  }) => {
    // Use GROUNDED_ENVELOPE for the narrative content (Q12 claim text)
    await mockAsk(page, GROUNDED_ENVELOPE);
    await page.goto('/');

    // Pick the Q12 chip (fills the box without submitting)
    await page
      .getByRole('listitem', { name: /Usage green vs\. sentiment red/ })
      .click();

    // Submit
    await page.getByLabel('Your question').press('Enter');

    // Reasoning timeline advances during streaming (no dead air — no-dead-air guarantee)
    await expect(
      page.getByText('Composing the grounded answer', { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Terminal answer renders: the claim text from GROUNDED_ENVELOPE.claims[0]
    await expect(
      page.getByText("Meridian's structured signals look healthy", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The answer is rendered as a numbered claim list (AnswerBody D-12 rewrite)
    // — numbered list items exist (each claim has a "View sources for claim N" button)
    const claim1 = page.getByRole('button', { name: 'View sources for claim 1' });
    await expect(claim1).toBeVisible();

    // TrustChip adjacent to the answer headline reads "Grounded ✓"
    await expect(page.getByText('Grounded ✓')).toBeVisible();
  });

  // ── Test 2: Under-answer d3-force graph renders with all 3 edge kinds ──
  //
  // Phase 11 D3 pivot: the cross-graph VISUAL renders full-width directly under the
  // answer (always visible, no toggle). The rail keeps the textual Path — both coexist.

  test('under-answer GraphViz renders with EdgeLegend + all 3 edge kinds (same_as traversed)', async ({
    page,
  }) => {
    // Use EDGES_ENVELOPE — it has all 3 edge kinds including a traversed same_as bridge
    await mockAsk(page, EDGES_ENVELOPE);
    await page.goto('/');

    // Submit any question to trigger the stream
    await page.getByLabel('Your question').fill(
      'Reconcile usage vs sentiment for Meridian (Q12)',
    );
    await page.getByLabel('Your question').press('Enter');

    // Wait for the terminal answer to land
    await expect(
      page.getByText('Query volume up 38%', { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The cross-graph visual is mounted under the answer (no toggle).
    await expect(
      page.getByRole('heading', { name: /Cross-graph traversal/i }),
    ).toBeVisible({ timeout: 5_000 });

    // The always-visible 3-kind legend confirms GraphViz rendered (D-04).
    await expect(page.getByText('Traversed (PART_OF / same_as)')).toBeVisible();
    await expect(page.getByText('Structural (account-induced)')).toBeVisible();
    await expect(page.getByText('Hybrid match (vector + BM25)')).toBeVisible();

    // The d3 SVG drew edges of all three kinds (data-driven from the envelope).
    await expect(page.locator('[data-viz-edge][data-kind="traversed"]').first()).toBeAttached();
    await expect(page.locator('[data-viz-edge][data-kind="structural"]').first()).toBeAttached();
    await expect(page.locator('[data-viz-edge][data-kind="hybrid"]').first()).toBeAttached();

    // The rail's textual Path coexists (no longer toggle-gated).
    await expect(page.getByText('Structured graph')).toBeVisible();
  });

  // ── Test 3: Refused envelope → RefusalPanel + TrustChip "Partially grounded" ──

  test('refused envelope shows RefusalPanel + TrustChip Partially grounded', async ({
    page,
  }) => {
    await mockAsk(page, REFUSED_ENVELOPE);
    await page.goto('/');

    await page.getByLabel('Your question').fill('Is Northwind ready for an upsell?');
    await page.getByLabel('Your question').press('Enter');

    // RefusalPanel renders (honest refusal — a feature, not an error)
    await expect(
      page.getByRole('heading', { name: /Cannot answer/ }),
    ).toBeVisible({ timeout: 15_000 });

    // TrustChip reads "Partially grounded" for refused envelopes (D-10)
    await expect(page.getByText('Partially grounded')).toBeVisible();
  });
});
