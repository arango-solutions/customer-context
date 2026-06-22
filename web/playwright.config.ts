// web/playwright.config.ts
//
// Playwright config for the Phase-6 streaming + click-to-source E2E (06-05, Task 1).
//
// The local E2E runs against a real `next dev` server but with the agent's `/api/ask`
// SSE stream MOCKED via `route.fulfill` (see e2e/ask.spec.ts) — so it proves the
// composed page's IDLE→STREAMING→DONE/REFUSED flow end-to-end WITHOUT a live
// ArangoDB/OpenAI dependency (CI-runnable). The live-agent run is the Task-3 deploy
// smoke (DEPLOY.md), not this suite.
//
// `testDir` is scoped to `e2e/` so Playwright never picks up the vitest `*.test.tsx`
// component specs (which live under test/ and components/).

import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boot a real Next dev server for the page; the agent stream is mocked per-test so
  // no cluster/model is touched. `predev` builds the agent dist first (workspace).
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
