import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Live-DB spikes can take a few seconds (embedding call + traversal).
    testTimeout: 60_000,
    include: ['test/**/*.test.ts'],
  },
});
