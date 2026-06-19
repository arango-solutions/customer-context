// web/e2e/ask.spec.ts
//
// Phase-6 / 06-05 Task 1 — the streaming + click-to-source E2E.
//
// Proves the COMPOSED page (app/page.tsx) end-to-end against a real `next dev` server,
// with the agent's `/api/ask` SSE stream MOCKED via `route.fulfill` so the suite runs
// with NO live ArangoDB/OpenAI dependency (CI-runnable). The live-agent run is the
// Task-3 deploy smoke (DEPLOY.md), not this test.
//
// HOW THE MOCK WORKS (documented for future E2E reuse — see 06-05-SUMMARY):
//   The real route returns `askQuestionStream`'s `createUIMessageStreamResponse`, an SSE
//   `text/event-stream` of `data: {json}\n\n` frames carrying the two custom parts
//   (`data-step` transient, `data-envelope` persistent) + a trailing `data: [DONE]`, with
//   the `x-vercel-ai-ui-message-stream: v1` header the client requires. Rather than
//   hand-craft (drift-prone) framing, we re-use the SDK's OWN `createUIMessageStream`
//   serializer at test time (`buildSseBody`) seeded with the SAME contract-validated
//   GROUNDED/REFUSED envelope fixtures the unit tests use — so the wire format can never
//   drift from the installed `ai` version, and `route.fulfill` ships that exact body +
//   headers. A few `data-step` parts emit before the `data-envelope` to exercise the
//   live ReasoningTimeline advance.

import { test, expect, type Page } from '@playwright/test';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import type { Envelope } from 'customer360-agent';
import { GROUNDED_ENVELOPE, REFUSED_ENVELOPE } from '../test/fixtures';

/** The six live phase labels emitted before the final envelope (mirrors stream.ts). */
const PHASE_STEPS = [
  'planning',
  'querying structured',
  'searching docs',
  'resolving entities',
  'reconciling',
] as const;

/**
 * Serialize the EXACT SSE body the real route produces, using the SDK's own
 * `createUIMessageStream` so the wire format tracks the installed `ai` version.
 * Emits the transient `data-step` parts, then the persistent `data-envelope`, then a
 * terminal `answer` step (matching agent/src/stream.ts's emission order).
 */
async function buildSse(envelope: Envelope): Promise<{ body: string; headers: Record<string, string> }> {
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

test.describe('Ask — streaming + click-to-source (mocked stream)', () => {
  test('IDLE shows the empty state with example chips; no rail', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Ask across both graphs.' }),
    ).toBeVisible();
    // The featured Q12 chip is present in the empty state.
    await expect(
      page.getByRole('listitem', { name: /Usage green vs\. sentiment red/ }),
    ).toBeVisible();
    // No answer column before a question is asked.
    await expect(page.getByTestId('answer-column')).toHaveCount(0);
  });

  test('submitting advances the timeline, renders numbered claims, and click-to-source shows _id + AQL', async ({
    page,
  }) => {
    await mockAsk(page, GROUNDED_ENVELOPE);
    await page.goto('/');

    // Fill the box via the featured Q12 chip (chips FILL, never auto-submit).
    await page
      .getByRole('listitem', { name: /Usage green vs\. sentiment red/ })
      .click();
    const box = page.getByLabel('Your question');
    await expect(box).not.toHaveValue('');

    // Submit (Enter submits).
    await box.press('Enter');

    // The reasoning timeline advances: a phase label appears (no dead air).
    await expect(
      page.getByText('Composing the grounded answer', { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // The final grounded answer renders with the verbatim envelope prose.
    await expect(
      page.getByText('Meridian Logistics is not actually happy', {
        exact: false,
      }),
    ).toBeVisible({ timeout: 15_000 });

    // Numbered claim markers render — click claim [1] to open the source drawer.
    const claim1 = page.getByRole('button', {
      name: 'View sources for claim 1',
    });
    await expect(claim1).toBeVisible();
    await claim1.click();

    // The drawer shows the citation `_id` and the EXACT AQL (the click-to-source payoff).
    const firstCitation = GROUNDED_ENVELOPE.claims[0].citations[0];
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(firstCitation._id)).toBeVisible();
    await expect(drawer.getByText(firstCitation.aql, { exact: false })).toBeVisible();
  });

  test('a refused envelope renders the honest RefusalPanel (not an error)', async ({
    page,
  }) => {
    await mockAsk(page, REFUSED_ENVELOPE);
    await page.goto('/');

    await page.getByLabel('Your question').fill('Is Northwind ready for an upsell?');
    await page.getByLabel('Your question').press('Enter');

    // The honest-refusal header — a feature, not an error/alarm.
    await expect(
      page.getByRole('heading', { name: /Cannot answer/ }),
    ).toBeVisible({ timeout: 15_000 });
    // The verbatim refusal text is shown.
    await expect(
      page.getByText('I cannot confidently answer this question', {
        exact: false,
      }),
    ).toBeVisible();
  });
});
