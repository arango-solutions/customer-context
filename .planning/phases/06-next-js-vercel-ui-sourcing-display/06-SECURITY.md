---
phase: 6
slug: next-js-vercel-ui-sourcing-display
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-19
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all 5 PLANs carry `<threat_model>`); verified in
> VERIFY-MITIGATIONS mode by gsd-security-auditor against the implemented code.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser client → `/api/ask` | The only public HTTP surface; untrusted free-form question text crosses here | free-form NL question (Zod-validated, capped 2000 chars) |
| planner model output → grounding gate | The model PROPOSES citation `_id`s; terminal `enforceGrounding` rejects any `_id` not actually returned by a curated tool | proposed citations vs. tool-returned `_id` set |
| server env → process | `ARANGO_*` / `OPENAI_API_KEY` read server-side only (Node runtime), never bundled to client, never echoed, never committed | secrets (Vercel project env vars) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Information Disclosure | web/ env handling | mitigate | No `loadEnv()` at module scope in web/ (only in comments `web/lib/agent.ts:9`, `web/app/api/health/route.ts:7`); no `ARANGO_*`/`OPENAI_API_KEY` in client; no `NEXT_PUBLIC_` secret | closed |
| T-06-02 | Spoofing (fabricated sourcing) | askQuestionStream envelope | mitigate | Persisted `data-envelope` = output of terminal `enforceGrounding(merged, returnedIds)` (`agent/src/stream.ts:140,213`); ungrounded → structured refusal (`agent/src/grounding.ts:42-86`) | closed |
| T-06-03 | Elevation (arbitrary AQL) | ToolLoopAgent tool set | accept | Same curated `TOOLS` (4 read-only Zod-bounded specialists `agent.ts:177-181`) + `stepCountIs(12)`; no generated AQL | closed |
| T-06-04 | Information Disclosure | stream env/secrets | mitigate | `stream.ts` never imports/calls `loadEnv`; secrets stay in `process.env` via db singleton (`db.ts:58-70`) | closed |
| T-06-05 | Tampering/DoS (body) | `/api/ask` body | mitigate | `z.string().trim().min(1).max(2000)` (`route.ts:31-33`); 400 before agent (`route.ts:44`) | closed |
| T-06-06 | Elevation (injection→AQL) | agent invocation from route | accept | Route returns `askQuestionStream` directly (`route.ts:50`); no tool surface added | closed |
| T-06-07 | Information Disclosure (stack/secret leak) | route error handling + runtime | mitigate | `runtime='nodejs'` (`route.ts:27`); try/catch → generic 500 (`route.ts:51-52`); no env read/echo | closed |
| T-06-08 | Denial of Service (looping question) | agent loop via route | accept (v1) | `stepCountIs(12)` + `maxDuration=60`; per-IP rate-limit deferred to Phase 7 | closed |
| T-06-09 | Spoofing (UI shows ungrounded as final) | AnswerBody / RefusalPanel | mitigate | Steps in throwaway `phase` (`use-ask.ts:109-116`); answer only from persistent envelope (`selectEnvelope:80-88`); `AnswerBody:79,85` / `RefusalPanel:43-61` render verbatim | closed |
| T-06-10 | Information Disclosure (secret in envelope) | rendering components | accept | Envelope has no secret fields; components access only envelope fields, no env | closed |
| T-06-11 | Information Disclosure (secret in git) | `.env.local` / `.env` | mitigate | `.env.local.example` empty values; `git check-ignore` confirms `.env`/`.env.local`/`web/.env`/`web/.env.local` ignored | closed |
| T-06-12 | Information Disclosure (client bundle) | env-var naming / Next bundling | mitigate | All five vars server-only, no `NEXT_PUBLIC_`; `web/.next/static` contains no secret env names | closed |
| T-06-13 | Denial of Service (504) | Vercel function maxDuration | mitigate | `vercel.json:4-7` maxDuration 60 + `route.ts:28` `maxDuration=60` | closed |
| T-06-14 | Tampering/Elevation (live AQL) | deployed `/api/ask` agent | accept | Inherits curated-tools + grounding gate; no new tool surface; rate-limit deferred to Phase 7 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-1 | T-06-03, T-06-06, T-06-14 | Prompt-injection → arbitrary AQL is bounded structurally: the planner can call only 4 curated, read-only, Zod-bounded specialists (no generated AQL; AGENT-04 deferred to v2), and the terminal grounding gate blocks fabricated citations. No new tool surface added by the route or deploy. | user (D-06 scope) | 2026-06-19 |
| AR-06-2 | T-06-08, T-06-14 | No per-IP rate-limit on `/api/ask` in v1. Bounded by `stepCountIs(12)` + `maxDuration=60`. Per-IP rate-limit is the single deferral carried to **Phase 7 (demo hardening)**. | user (lean v1 scope) | 2026-06-19 |
| AR-06-3 | T-06-10 | The answer Envelope contains only `{graph, collection, _id, aql, traversal, query, answer, reasoningTrace}` — no secret fields; rendering components have no env access. | gsd-security-auditor | 2026-06-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-19 | 14 | 14 | 0 | gsd-security-auditor (verify-mitigations mode) |

**Auditor notes (non-blocking):**
- `web/.gitignore` lists `.env*.local` but not bare `.env`; `web/.env` is covered by the **repo-root** `.gitignore` (`.env`, `.env.*`) — confirmed via `git check-ignore -v`. If `web/` is ever extracted to its own repo, add a local `.env` rule.
- `web/.next/` server artifacts read `process.env` secrets but `.next/` is gitignored/untracked; `web/.next/static` (client bundle) contains no secret env names.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-19
</content>
