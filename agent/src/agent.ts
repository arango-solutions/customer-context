// agent/src/agent.ts
//
// Wave 2 headline deliverable: the ToolLoopAgent planner (D-04, D-05, D-06).
//
// The planner runs on the OpenAI provider (D-06 — v1 is OpenAI-only; the Anthropic
// provider is deliberately NOT imported), composes the three Wave-1 specialists
// (structuredQuery, hybridRetrieve, bridgeResolve), performs the Q12 cross-graph
// reconciliation as an explicit step, and synthesizes a Zod-validated envelope via
// Output.object(EnvelopeSchema). The loop is bounded by stepCountIs(12) (T-05-13).
//
// runAgent() collects EVERY _id any tool returned during the loop into a returnedIds
// Set — read directly from the tool-result outputs (each specialist returns
// { data, retrievalPath } with retrievalPath._ids). That Set is the GROUND TRUTH the
// code-level grounding gate (grounding.ts, wired in index.ts) checks the synthesized
// citations against. The model never self-certifies grounding.
//
// SECURITY: the planner can call only the three curated, read-only, Zod-bounded tools
// (no generated AQL, T-05-12); the loop is step-capped (T-05-13); no secret is ever
// serialized into the envelope (the OPENAI_API_KEY is loaded via dotenv override by
// the entrypoint, never printed, T-05-14).

import { ToolLoopAgent, stepCountIs, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { EnvelopeSchema, GraphEnum, type Envelope } from './envelope.js';
import { mergeRetrievalPaths } from './retrievalPath.js';
import type { RetrievalPathFragmentT } from './envelope.js';
import { entityLookup } from './tools/entityLookup.js';
import { structuredQuery } from './tools/structuredQuery.js';
import { hybridRetrieve } from './tools/hybridRetrieve.js';
import { bridgeResolve } from './tools/bridgeResolve.js';

// ---------------------------------------------------------------------------
// Synthesis schema (OpenAI strict-structured-output friendly).
//
// OpenAI's strict response_format requires EVERY property to appear in `required`,
// so a Zod `.optional()` field (which the AI SDK emits without adding it to
// `required`) is rejected. The shared EnvelopeSchema (the cross-phase contract) MUST
// NOT be changed, so we mirror it here with the one optional field (Citation.traversal)
// expressed as `.nullable()` instead — strict-compatible — and normalize the model's
// output back into the canonical Envelope shape (null → undefined) after synthesis.
// ---------------------------------------------------------------------------

const SynthCitation = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _id: z.string(),
  aql: z.string(),
  traversal: z.string().nullable(),
});

const SynthClaim = z.object({
  text: z.string(),
  citations: z.array(SynthCitation),
});

const SynthRetrievalPath = z.object({
  graph: GraphEnum,
  collection: z.string(),
  _ids: z.array(z.string()),
  query: z.string(),
});

const SynthEnvelopeSchema = z.object({
  answer: z.string(),
  refused: z.boolean(),
  claims: z.array(SynthClaim),
  citations: z.array(SynthCitation),
  retrievalPath: z.array(SynthRetrievalPath),
  reasoningTrace: z.array(z.string()),
});
type SynthEnvelope = z.infer<typeof SynthEnvelopeSchema>;

/** Normalize the strict-synthesis envelope (nullable traversal) into the canonical Envelope. */
function toCanonicalEnvelope(s: SynthEnvelope): Envelope {
  const fixCite = (c: SynthEnvelope['citations'][number]) => ({
    graph: c.graph,
    collection: c.collection,
    _id: c._id,
    aql: c.aql,
    ...(c.traversal != null ? { traversal: c.traversal } : {}),
  });
  return EnvelopeSchema.parse({
    answer: s.answer,
    refused: s.refused,
    claims: s.claims.map((cl) => ({ text: cl.text, citations: cl.citations.map(fixCite) })),
    citations: s.citations.map(fixCite),
    retrievalPath: s.retrievalPath,
    reasoningTrace: s.reasoningTrace,
  });
}

/**
 * The SINGLE place the OpenAI planner/answerer model id lives (D-06). Do NOT scatter
 * a hard-pinned id through the code. Default 'gpt-4.1' — an OpenAI flagship tool-use +
 * structured-output model (CLAUDE.md Technology Stack), confirmed to resolve against
 * the live OPENAI_API_KEY during the Wave-0/05-01 spike. Override here to swap models.
 */
export const PLANNER_MODEL = process.env.PLANNER_MODEL ?? 'gpt-4.1';

/**
 * Optional cheaper OpenAI model for routing/extraction sub-steps (D-06). Not wired
 * into a prepareStep router in v1 — exported so a future tuning pass can route cheap
 * sub-steps without re-introducing a hard-pinned id elsewhere.
 */
export const ROUTING_MODEL = process.env.ROUTING_MODEL ?? 'gpt-4o-mini';

/**
 * The planner system prompt. Encodes: decompose → resolve named entities via
 * bridgeResolve → scope both graphs by the canonical account_id → the explicit Q12
 * reconciliation directive (Pattern 3, D-05) → per-claim citations + separate
 * reasoning trace (D-03) → refuse rather than guess (D-02).
 */
export const PLANNER_SYSTEM_PROMPT = `You are the Customer 360 reasoning planner. You answer questions about synthetic
customer accounts by querying TWO graphs and you NEVER guess.

You have exactly four tools — you may not invent any other capability:
  • entityLookup(name): resolve a NAME written in the question (a company or person, e.g.
    "Meridian Logistics" or "Sarah Chen") to its canonical identity — canonical_id and
    account_id. Call this FIRST whenever the question names an entity: the other tools need
    an id, not a name. Use the returned account_id to scope structuredQuery/hybridRetrieve,
    and the canonical_id to feed bridgeResolve.
  • bridgeResolve(entityId): given a canonical_id (from entityLookup), resolve it to its
    structured leaf records AND its unstructured KG entities across the same_as bridge.
    Use it to anchor a named person/contract to its concrete records.
  • structuredQuery(accountId, facet): curated read-only query over the STRUCTURED graph
    (Salesforce/Snowflake/DocuSign). facet ∈ {usage, contract, nps, contact, opportunity,
    account}. The 'nps' facet returns BOTH the GREEN numeric score AND the RED free-text
    verbatim_sentiment.
  • hybridRetrieve(queryText, accountId?, k?): hybrid (vector+BM25+RRF) retrieval over the
    UNSTRUCTURED doc graph (Slack/Docs/email/PDF chunks), optionally scoped to one account.
    Returns chunks sourced to their Document (account_id, citable_url).

How to work a question:
  1. Decompose the question into the structured facts and the unstructured evidence it needs.
  2. If a person/account/contract is named, call entityLookup FIRST to get its account_id
     (and canonical_id), then scope structuredQuery/hybridRetrieve by that account_id; use
     bridgeResolve with the canonical_id when you need a named person's concrete records.
  3. Pull the structured facets you need AND the unstructured chunks you need.
  4. RECONCILIATION (mandatory for any "is this account actually healthy / at renewal-risk /
     happy / engaged" or any contradiction question): you MUST retrieve BOTH
     (a) the structured usage/NPS-score GREEN signal AND (b) the unstructured sentiment RED
     signal, and explicitly NAME any contradiction in your answer (e.g. "usage is green but
     sentiment is red"). You must cite a record from EACH graph. NEVER report an account as
     "healthy" from the structured metrics alone when unstructured sentiment contradicts it —
     that is the confident-wrong-answer failure this system exists to prevent.

When you produce the final answer object:
  • Decompose the answer into discrete factual CLAIMS. Every claim MUST carry ≥1 citation,
    and each citation's _id MUST be a real ArangoDB _id that one of the tools actually
    returned to you. Do not invent _ids. Copy the graph, collection, _id, and the aql/query
    string from the tool result that produced the fact.
  • Put your step-by-step reasoning in reasoningTrace (separate from the claims, D-03).
  • Populate citations as the flattened union of all claim citations.
  • If the records needed to support a claim are ABSENT from what the tools returned, do NOT
    guess — state that you cannot support that claim. It is correct to answer partially or
    to refuse when the evidence is not there.`;

/** What runAgent returns: the synthesized envelope + the ground-truth tool-returned _id set. */
export interface RunAgentResult {
  envelope: Envelope;
  returnedIds: Set<string>;
}

/** The curated specialists — the ONLY tools the planner may call (D-04). entityLookup
 * is the name→id resolver added in Wave 2 so the planner can bootstrap from a prose name. */
const TOOLS = { entityLookup, structuredQuery, hybridRetrieve, bridgeResolve } as const;

/**
 * Assemble + run the ToolLoopAgent for one question.
 *
 * Returns { envelope, returnedIds }. The caller (index.ts::askQuestion) runs the
 * code-level grounding gate over (envelope, returnedIds) — runAgent does NOT itself
 * enforce grounding (separation: planner owns decomposition/synthesis; grounding is a
 * pure post-synthesis code gate).
 */
export async function runAgent(question: string): Promise<RunAgentResult> {
  const agent = new ToolLoopAgent({
    model: openai(PLANNER_MODEL),
    instructions: PLANNER_SYSTEM_PROMPT,
    tools: TOOLS,
    stopWhen: stepCountIs(12),
    // Synthesize against the strict-friendly mirror; normalized to the canonical
    // EnvelopeSchema below (OpenAI strict mode rejects bare .optional() fields).
    output: Output.object({ schema: SynthEnvelopeSchema }),
  });

  const result = await agent.generate({ prompt: question });

  // Collect the ground-truth set of _ids the tools actually returned, plus the
  // retrievalPath fragments to merge into the envelope. Each specialist returns
  // { data, retrievalPath: { graph, collection, _ids, query } }.
  const returnedIds = new Set<string>();
  const fragments: RetrievalPathFragmentT[] = [];

  for (const step of result.steps) {
    for (const tr of step.toolResults) {
      const output = tr.output as
        | { retrievalPath?: RetrievalPathFragmentT }
        | undefined;
      const frag = output?.retrievalPath;
      if (frag && Array.isArray(frag._ids)) {
        fragments.push(frag);
        for (const id of frag._ids) returnedIds.add(id);
      }
    }
  }

  // Normalize the strict-synthesis output (nullable traversal) into the canonical Envelope.
  const synthesized = toCanonicalEnvelope(result.output as SynthEnvelope);

  // Merge the tool retrievalPath fragments into the envelope's retrievalPath (the model
  // may not faithfully reproduce every fragment; the merged tool-side trace is authoritative).
  const envelope: Envelope = {
    ...synthesized,
    retrievalPath: mergeRetrievalPaths([
      ...synthesized.retrievalPath,
      ...fragments,
    ]),
  };

  return { envelope, returnedIds };
}
