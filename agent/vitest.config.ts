import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Live-DB spikes can take a few seconds (embedding call + traversal).
    testTimeout: 60_000,
    // Co-located unit/integration tests (src/**) + the legacy test/ suite.
    // GRAPH-03 (14-01) introduces src/tools/structuredQuery.test.ts.
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
