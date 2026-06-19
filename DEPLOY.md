# Deploy Runbook — Customer 360 (Next.js on the shared team Vercel account)

This is the **user-checkpoint runbook** for Phase 6 Plan 05 Task 3 (D-04). The build +
local Playwright E2E already proceeded autonomously; this live deploy needs the **shared
team Vercel credentials** and a **human-eyes smoke**, so it is a gated manual step.

The whole point of deploying in Phase 6 (not Phase 7) is to **de-risk the real demo
environment now** — the module-singleton keep-alive `arangojs` client and real cold-start
latency can only be validated on an actual Vercel deploy. Discovering connection issues
here is the goal.

---

## What is already done (by the executor)

- `web/app/page.tsx` composes the full IDLE → STREAMING → DONE/REFUSED/ERROR/TIMEOUT flow.
- `web/e2e/ask.spec.ts` (Playwright, mocked `/api/ask` stream) proves the streaming +
  click-to-source flow end-to-end without a cluster. `next build` + `tsc --noEmit` pass.
- `web/app/api/ask/route.ts` declares `export const runtime = 'nodejs'` and
  `export const maxDuration = 60`.
- `web/vercel.json` pins the `/api/ask` function to the Node runtime + `maxDuration: 60`.
- `web/.env.local.example` documents the five **server-only** env vars (no `NEXT_PUBLIC_`).
- `.gitignore` excludes `.env` / `.env.local` — no secret is committed.

---

## The five required environment variables (server-only)

| Variable | Source | Notes |
|----------|--------|-------|
| `ARANGO_ENDPOINT` | local `.env` (MEMORY: arango-connection) | shared prod ArangoGraph cluster URL |
| `ARANGO_USERNAME` | local `.env` | |
| `ARANGO_PASSWORD` | local `.env` | **secret** — never `NEXT_PUBLIC_`, never committed |
| `ARANGO_DATABASE` | local `.env` | the dedicated `customer360` DB |
| `OPENAI_API_KEY` | local `.env` (D-06) | **secret** — embeddings + planner/answerer model |

> These are read by `agent/src/db.ts` (the keep-alive arangojs singleton) and the agent's
> OpenAI calls from `process.env`, **server-side only**. NONE may carry a `NEXT_PUBLIC_`
> prefix — that would bundle the secret into the browser (T-06-11 / T-06-12).

---

## Deploy steps (run these in the Vercel Dashboard / CLI)

### 1. Set the project Root Directory to `web/`

Vercel Dashboard → Project → **Settings → General → Root Directory** = `web/`.

This repo is an npm workspace; the Next.js app lives in `web/`, and its `prebuild` script
(`npm run build -w customer360-agent`) compiles the agent `dist/` the route imports.

### 2. Add the five env vars to **Production + Preview**

Vercel Dashboard → Project → **Settings → Environment Variables**. Add each variable from
the table above with its value from the local `.env`. Select **both Production and
Preview** for each. Do **NOT** prefix any with `NEXT_PUBLIC_`.

### 3. Confirm the function `maxDuration` cap is ≥ 60s (A1)

Vercel Dashboard → Project → **Settings → Functions**. The Fluid Compute default cap is
300s, which is fine. **If a legacy project caps functions at 10s, the 14–25s answers will
504** — raise the cap (or enable Fluid Compute) so the route's `maxDuration = 60` is
honored. `web/vercel.json` already requests `maxDuration: 60`.

### 4. Deploy

Either:
- **Git push** to the connected branch (auto-deploy), or
- `vercel --prod` from the `web/` directory (Vercel CLI; if prompted, `vercel login` first).

### 5. Live smoke on the deployed Production URL (ask Q12)

Open the deployed Production URL and run the showcase example chip **Q12**
("Usage green vs. sentiment red"), then click **Ask**. Confirm:

- the **reasoning timeline advances within ~1s** and streams the six phases — no dead air
  over the 14–25s wait;
- the **final answer renders with numbered claims** and dual-graph citation cards;
- **clicking a claim opens the source drawer** showing the citation `_id` + the **exact
  AQL** (click-to-source works on serverless);
- the answer is **grounded** (every fact traceable) — i.e. **serverless↔ArangoDB is
  confirmed end-to-end**.

### 6. If the function times out / 504s

Re-check **step 3** (the project `maxDuration` cap is ≥ 60s) and that **all five env vars
are set in Production**. Then re-deploy and re-run the Q12 smoke.

---

## Resume signal

Reply with the **deployed Production URL** and **"Q12 verified"** — or describe the
failure (504 / missing env / connection error) and what was tried. This runbook feeds
Phase 7 hardening (pre-warm, rate-limit, cold-start mitigations).
