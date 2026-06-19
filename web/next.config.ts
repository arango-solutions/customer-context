import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Monorepo file-tracing root. web/ is an npm-workspace package; its deps (Next's
// own styled-jsx and the customer360-agent dist) hoist to the repo-root
// node_modules. Without this, a prebuilt deploy's serverless function bundle
// omits those hoisted files (ENOENT styled-jsx on Vercel). Pointing the trace
// root at the repo root makes Next include the hoisted deps in each .func.
const _repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const nextConfig: NextConfig = {
  outputFileTracingRoot: _repoRoot,

  // AGENT IMPORT — dist fallback (RESEARCH Assumption A2 resolved FALSE).
  //
  // We attempted the raw-TS import via `transpilePackages: ['customer360-agent']`,
  // but both Next 15 webpack AND Turbopack fail to resolve the agent's NodeNext
  // `.js`-extension source imports (`./grounding.js` → `./grounding.ts`) when
  // transpiling the sibling package from raw `.ts` (RESEARCH Pitfall 4: "Module
  // not found: ./grounding.js"). So we use the documented fallback: the agent now
  // emits a compiled `dist/` (tsconfig.build.json, `npm run build -w agent`) and
  // its package `exports` point at `dist/index.js` + `dist/index.d.ts`. Next then
  // imports the agent as an ordinary pre-built workspace dependency — NO
  // transpilePackages entry (adding it would force Next back to resolving raw src
  // and re-break the build).
  //
  // transpilePackages is intentionally OMITTED. Keep it omitted unless the agent
  // reverts to shipping raw TS.

  // Mark the agent's Node-only transitive deps as server externals so Next never
  // tries to bundle them for the browser (arangojs uses node:https).
  serverExternalPackages: ['arangojs'],
};

export default nextConfig;
