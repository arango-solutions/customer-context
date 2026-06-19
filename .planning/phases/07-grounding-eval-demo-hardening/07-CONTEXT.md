# Phase 7: Grounding/Eval + Demo Hardening - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove every answer is grounded against the locked question set (EVAL-01), then harden the *live dev* path so failures are surfaced, not hidden (EVAL-02). This is the eval-before-demo gate against the project's defined failure mode — a confident wrong answer.

**Scope anchor:** light regression eval over the 6 locked questions + adversarial/refusal variants; a green/red "is it working" health signal; pre-warm + rehearsal. NOT a new agent capability, NOT generated-AQL, NOT the v2 subgraph viz (backlog 999.1).

</domain>

<decisions>
## Implementation Decisions

### Grounding eval (EVAL-01)
- **D-01:** EXTEND the existing Phase-5 eval (`agent/test/questions.eval.test.ts`, currently 6 live questions + out-of-scope refusal, 7/7) — do NOT build a separate harness. Add the adversarial/refusal variants to the same suite.
- **D-02:** Two-layer grounding check: (a) the EXISTING deterministic `_id`-grounding gate (`enforceGrounding` — every cited `_id` must be in the tool-returned set) stays the hard floor; (b) ADD an atomic-claim decomposition + an **LLM-judge entailment** pass that checks each atomic claim is *semantically* entailed by its cited record's content (not just that the `_id` exists). This is the literal EVAL-01 requirement and catches "cites a real record that doesn't actually support the claim."
- **D-03:** Judge model = an OpenAI model (project runs on OpenAI, no Anthropic key — see [[model-provider-openai]]). Planner/researcher to pick the exact model (gpt-4o-class default); keep judge prompts + rubric in-repo and deterministic-seeded where possible.

### Demo hardening (EVAL-02) — "know when it works", not a safety net
- **D-04:** DEFER the recorded/scripted backup path. Rationale (user): still in dev; the priority is a signal that *surfaces* failures, not a fallback that *hides* them. Revisit a recorded/fixture backup only when a real demo date is set (see Deferred Ideas).
- **D-05:** Instead, build a **health/canary signal**. Today `web/app/api/health/route.ts` only proves the agent module imports — it does NOT touch the DB. Deepen it (or add a sibling canary) so it exercises real ArangoDB connectivity + one end-to-end question, giving a clear green/red read that the *live* path works. Combined with the eval gate, this is the "is it working" status read.
- **D-06:** Pre-warm via Vercel Cron (periodic ping that warms the serverless function + the keep-alive arangojs client) PLUS a manual warm step before any live run. (Claude's discretion on exact cron cadence.)
- **D-07:** Rehearsal = adversarial questions (out-of-scope / privacy / not-in-data → must refuse, never fabricate) + LIGHT concurrent rehearsal (a few simultaneous `/api/ask` calls) on the real Vercel deploy. Not a load test.

### Access / security
- **D-08:** KEEP SSO protection on all `.vercel.app` URLs (no custom domain, no bypass). The demo is presenter-driven from the authenticated browser session. Zero infra change.
- **D-09:** SKIP the `/api/ask` per-IP rate-limit for v1 — keep the Phase-6 accepted-risk deferral (AR-06-2). The agent loop is already bounded by `stepCountIs(12)` + `maxDuration=60`, and with SSO + presenter-driven access there is no public surface to hammer. (Re-open only if access changes to a public custom domain.)

### Claude's Discretion
- Exact eval file layout / how claim-decomposition is structured (one judge call per claim vs. batched), judge model id + temperature, the cron cadence for pre-warm, and the precise shape of the canary endpoint. Keep the deterministic `_id` gate as the non-negotiable floor regardless.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Eval target + grounding contract
- `agent/test/questions.eval.test.ts` — the Phase-5 6-question live eval to EXTEND (D-01).
- `agent/src/grounding.ts` — `enforceGrounding` deterministic `_id`-grounding gate; the hard floor the LLM-judge sits on top of (D-02).
- `agent/src/agent.ts`, `agent/src/stream.ts` — the planner + the streaming envelope path the eval runs against.
- `agent/src/envelope.ts` — `Envelope` shape (`claims[]`, `citations[]`, `retrievalPath[]`) the claim-decomposition consumes.

### Question set
- `docs/research/locked-questions-and-data-map.md` — the 6 locked questions + Q12 + the source records each must cite (the eval reference set).

### Live path / hardening
- `web/app/api/health/route.ts` — current shallow health route to deepen into a real DB+canary signal (D-05).
- `agent/src/db.ts` — the keep-alive arangojs singleton the pre-warm must warm (D-06).
- `.planning/phases/06-next-js-vercel-ui-sourcing-display/06-SECURITY.md` — AR-06-2 (rate-limit deferral, D-09) + the verified Phase-6 threat posture.

### Project constraint
- `.planning/PROJECT.md` — "a confident wrong answer in front of the audience is the failure mode to avoid"; eval-before-demo is a hard constraint.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase-5 eval harness (`agent/test/questions.eval.test.ts`) — extend, don't replace.
- `enforceGrounding` (`agent/src/grounding.ts`) — already returns a refusal on ungrounded citations; the eval asserts on its output.
- The deployed health route + `vercel logs` runtime-log access (see [[vercel-deploy-setup]]) — the canary/pre-warm builds on the working CLI-deploy path.

### Established Patterns
- Pure-code grounding gate (deterministic, no model) is the project's trust boundary; the LLM-judge is ADDITIVE, never replaces it.
- Tests run live against the shared prod ArangoGraph cluster + OpenAI (see [[arango-connection]], [[openai-key-env-gotcha]] — use `load_dotenv(override=True)` / read the .env key, not a stale shell key).

### Integration Points
- Canary endpoint → `agent` (askQuestion) + `db.ts` (ArangoDB) on the serverless path.
- Pre-warm cron → `/api/health`(deepened) on Vercel.

</code_context>

<specifics>
## Specific Ideas

- User framing (verbatim intent): "This is still in dev. I want to know when things are working" — bias every EVAL-02 choice toward a failure-surfacing signal over a demo-day safety net.

</specifics>

<deferred>
## Deferred Ideas

- **Recorded/scripted backup path** (the original EVAL-02 wording) — deferred until a real demo date is set (D-04). Revisit as a pre-demo checklist item, not dev work.
- **`/api/ask` per-IP rate-limit** (AR-06-2) — deferred again; re-open only if access becomes a public custom domain (D-09).
- **Custom domain / public access** — not for v1; SSO presenter-driven (D-08).
- **Cross-graph subgraph viz** — backlog 999.1, post-v1 (unrelated to Phase 7).

</deferred>

---

*Phase: 07-grounding-eval-demo-hardening*
*Context gathered: 2026-06-19*
</content>
