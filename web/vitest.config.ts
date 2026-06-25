/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

// jsdom + RTL test project for the Phase-6 web app (RESEARCH Validation
// Architecture / Wave-0 Gaps). The agent's own vitest.config.ts stays node-env;
// this is the second project for `.tsx` component + fixture tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'test/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'lib/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': root,
    },
  },
});
