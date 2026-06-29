---
quick_id: 260619-f7c
slug: vercel-monorepo-build-fix
description: Fix Vercel monorepo build failure (npm workspace -w flag unresolvable from web/ root dir)
date: 2026-06-19
status: complete
---

# Quick Task 260619-f7c: Summary

## What changed

`web/package.json` — `predev` and `prebuild` scripts:

- **Before:** `npm run build -w customer360-agent`
- **After:**  `npm --prefix ../agent run build`

## Why

Vercel's project Root Directory is `web/`. The `-w customer360-agent` flag only
resolves from the repo root (where `workspaces` is declared), so running it from
`web/` produced `npm error No workspaces found: --workspace=customer360-agent` and
failed every deploy. The path-prefix form builds the agent by directory, needs no
workspace lookup, and works identically from `web/` locally and on Vercel.

## Verification

`cd web && npm --prefix ../agent run build` → ran `tsc -p tsconfig.build.json`,
emitted `agent/dist/index.js`. ✅

## Notes / follow-ups (not part of this task)

This fix makes the build command succeed once code is present. Two separate
deploy blockers remain, tracked outside this quick task:

1. The connected git branch on `customer-context` has none of the project code
   (local is 80 commits ahead, never pushed) — being addressed via the
   "clean branch → customer-context" plan (strip `.planning/`, push).
2. Confirm Vercel project Root Directory = `web` in the dashboard.
</content>
