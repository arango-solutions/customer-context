import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
