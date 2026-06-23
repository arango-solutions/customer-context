// web/test/fixtures.ts
//
// Canned Envelope fixtures that back every Wave-2 component test — the components
// render against these without a live agent / DB / model. Both fixtures are typed
// as the agent's `Envelope` and parse against `EnvelopeSchema` (imported from the
// customer360-agent workspace) so a fixture can NEVER drift from the Phase-5
// contract: if envelope.ts changes shape, these stop type-checking / parsing.
//
// GROUNDED_ENVELOPE is the Q12 centerpiece (Meridian Logistics — "green on usage,
// red in sentiment"): a dual-graph answer whose citations span BOTH the structured
// graph (Snowflake usage + NPS score) and the unstructured graph (Slack escalation,
// QBR notes, exec email, NPS verbatim). It satisfies assertReconciliation.
//
// REFUSED_ENVELOPE is the honest-refusal case: refused:true with the structured
// refusal answer text and only the partial citations that WERE grounded.
//
// EDGES_ENVELOPE (Phase 11) — extends GROUNDED_ENVELOPE with an explicit edges[]
// array exercising all three edge kinds (traversed, structural, hybrid) so the
// buildGraph.test.ts unit tests have a concrete fixture to assert against.
//
// account_ids are the real demo Account._key values from agent/test/fixtures.ts.

import type { Envelope } from 'customer360-agent';
import { EnvelopeSchema } from 'customer360-agent';
import {
  MERIDIAN_ACCOUNT_ID,
  NORTHWIND_ACCOUNT_ID,
} from '../../agent/test/fixtures';

export { MERIDIAN_ACCOUNT_ID, NORTHWIND_ACCOUNT_ID };

/**
 * Q12 — Meridian Logistics: structured usage/NPS-score say "green", but the
 * unstructured sentiment (Slack escalations, QBR notes, exec email, NPS verbatim)
 * says "red". The grounded answer NAMES the contradiction. Dual-graph by design.
 */
const groundedEnvelope: Envelope = {
  answer:
    'No — Meridian Logistics is not actually happy, despite looking green on every ' +
    'usage metric. There is a clear contradiction between the structured signal and ' +
    'the ground-truth sentiment. Their query volume is up 38% quarter-over-quarter and ' +
    'their latest NPS score is a healthy 8/10 [1], but their own people are escalating: ' +
    'a Slack thread flags repeated production incidents and a stalled support case [2], ' +
    'the Q2 QBR notes record an explicit "considering alternatives" comment from the ' +
    'economic buyer [3], and the champion\'s exec email warns that renewal is "not a ' +
    'given this year" [4]. The usage is real, but it is being driven by a migration ' +
    'they cannot easily reverse — not by satisfaction.',
  refused: false,
  claims: [
    {
      text:
        'Meridian\'s structured signals look healthy: query volume up 38% QoQ and a ' +
        'current NPS score of 8/10.',
      citations: [
        {
          graph: 'structured',
          collection: 'UsageMetric',
          _id: `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
          aql:
            'FOR u IN UsageMetric FILTER u.account_id == @acct AND u.metric == ' +
            '"query_volume" SORT u.period DESC LIMIT 2 RETURN u',
          traversal: 'Account -HAS_USAGE-> UsageMetric',
        },
        {
          graph: 'structured',
          collection: 'NpsScore',
          _id: `NpsScore/${MERIDIAN_ACCOUNT_ID}-2026Q2`,
          aql:
            'FOR n IN NpsScore FILTER n.account_id == @acct SORT n.surveyed_at DESC ' +
            'LIMIT 1 RETURN n',
          traversal: 'Account -HAS_NPS-> NpsScore',
        },
      ],
    },
    {
      text:
        'But the unstructured ground truth contradicts that: an internal Slack ' +
        'escalation, the Q2 QBR notes, and the champion\'s exec email all signal real ' +
        'renewal risk and dissatisfaction.',
      citations: [
        {
          graph: 'unstructured',
          collection: 'Chunk',
          _id: 'Chunk/slack-meridian-incident-2026-05-19-0007',
          aql:
            'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
            '"text_en") FILTER c.account_id == @acct SORT BM25(c) DESC LIMIT 5 RETURN c',
          traversal: 'Chunk -PART_OF-> Document (Slack #meridian-escalations)',
        },
        {
          graph: 'unstructured',
          collection: 'Chunk',
          _id: 'Chunk/qbr-meridian-2026Q2-notes-0003',
          aql:
            'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
            '"text_en") FILTER c.doc_type == "qbr" AND c.account_id == @acct LIMIT 5 RETURN c',
          traversal: 'Chunk -PART_OF-> Document (QBR notes Q2)',
        },
        {
          graph: 'unstructured',
          collection: 'Chunk',
          _id: 'Chunk/email-meridian-champion-2026-06-02-0001',
          aql:
            'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
            '"text_en") FILTER c.doc_type == "email" AND c.account_id == @acct LIMIT 5 RETURN c',
          // no traversal on this one — exercises the optional-traversal path
        },
      ],
    },
  ],
  // Flattened union of all claim citations (EnvelopeSchema.citations).
  citations: [
    {
      graph: 'structured',
      collection: 'UsageMetric',
      _id: `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
      aql:
        'FOR u IN UsageMetric FILTER u.account_id == @acct AND u.metric == ' +
        '"query_volume" SORT u.period DESC LIMIT 2 RETURN u',
      traversal: 'Account -HAS_USAGE-> UsageMetric',
    },
    {
      graph: 'structured',
      collection: 'NpsScore',
      _id: `NpsScore/${MERIDIAN_ACCOUNT_ID}-2026Q2`,
      aql:
        'FOR n IN NpsScore FILTER n.account_id == @acct SORT n.surveyed_at DESC ' +
        'LIMIT 1 RETURN n',
      traversal: 'Account -HAS_NPS-> NpsScore',
    },
    {
      graph: 'unstructured',
      collection: 'Chunk',
      _id: 'Chunk/slack-meridian-incident-2026-05-19-0007',
      aql:
        'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
        '"text_en") FILTER c.account_id == @acct SORT BM25(c) DESC LIMIT 5 RETURN c',
      traversal: 'Chunk -PART_OF-> Document (Slack #meridian-escalations)',
    },
    {
      graph: 'unstructured',
      collection: 'Chunk',
      _id: 'Chunk/qbr-meridian-2026Q2-notes-0003',
      aql:
        'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
        '"text_en") FILTER c.doc_type == "qbr" AND c.account_id == @acct LIMIT 5 RETURN c',
      traversal: 'Chunk -PART_OF-> Document (QBR notes Q2)',
    },
    {
      graph: 'unstructured',
      collection: 'Chunk',
      _id: 'Chunk/email-meridian-champion-2026-06-02-0001',
      aql:
        'FOR c IN Chunk SEARCH ANALYZER(c.text IN TOKENS(@q, "text_en"), ' +
        '"text_en") FILTER c.doc_type == "email" AND c.account_id == @acct LIMIT 5 RETURN c',
    },
  ],
  // One structured + one unstructured retrieval-path fragment (grouped-by-graph rail).
  retrievalPath: [
    {
      graph: 'structured',
      collection: 'UsageMetric',
      _ids: [
        `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
        `NpsScore/${MERIDIAN_ACCOUNT_ID}-2026Q2`,
      ],
      query:
        'structuredQuery(account_id=' +
        MERIDIAN_ACCOUNT_ID +
        ', metrics=[query_volume, nps_score])',
    },
    {
      graph: 'unstructured',
      collection: 'Chunk',
      _ids: [
        'Chunk/slack-meridian-incident-2026-05-19-0007',
        'Chunk/qbr-meridian-2026Q2-notes-0003',
        'Chunk/email-meridian-champion-2026-06-02-0001',
      ],
      query:
        'hybridRetrieve(account_id=' +
        MERIDIAN_ACCOUNT_ID +
        ', q="renewal risk sentiment escalation", k=8, fusion=rrf)',
    },
  ],
  reasoningTrace: [
    'Planning: Q12 requires reconciling the structured usage/NPS signal against ' +
      'unstructured sentiment for Meridian Logistics.',
    'Querying structured graph: pulled query_volume (up 38% QoQ) and the latest NPS ' +
      'score (8/10) for the account.',
    'Searching unstructured graph: hybrid (BM25 + vector, RRF) over Slack, QBR notes, ' +
      'and exec email surfaced incident escalation and "considering alternatives" language.',
    'Resolving entities: the same account_id namespace links the structured Account to ' +
      'the unstructured Document/Chunk mentions — no fuzzy matching needed.',
    'Reconciling: the structured signal (green) and the sentiment (red) contradict; the ' +
      'usage is migration-driven, not satisfaction-driven.',
    'Composing the grounded answer: every claim is backed by a tool-returned _id.',
  ],
  // Phase 8: enforceGrounding always injects groundingScore before returning.
  // Refusal envelopes set groundingScore: 1.0 (per agent.ts).
  groundingScore: 1,
};

/** The Q12 grounded, dual-graph envelope — contract-validated at module load. */
export const GROUNDED_ENVELOPE: Envelope = EnvelopeSchema.parse(groundedEnvelope);

/**
 * Honest refusal: the agent could not fully ground the answer, so it returns the
 * structured refusal text with only the partial citations that WERE sourced. This
 * is a first-class answer (a selling point), NOT an error.
 */
const refusedEnvelope: Envelope = {
  answer:
    'I cannot confidently answer this question: the records needed to support one or ' +
    'more of the claims were not found in the retrieved data. Only the partially-sourced ' +
    'facts below are grounded in real records; the rest is withheld to avoid a ' +
    'confident-but-unsupported answer.',
  refused: true,
  claims: [
    {
      text:
        'Northwind Analytics has an active ArangoDB Enterprise contract on the standard ' +
        'product tier (the one fact that was grounded).',
      citations: [
        {
          graph: 'structured',
          collection: 'Contract',
          _id: `Contract/${NORTHWIND_ACCOUNT_ID}-2025-enterprise`,
          aql:
            'FOR ct IN Contract FILTER ct.account_id == @acct AND ct.status == ' +
            '"active" RETURN ct',
          traversal: 'Account -HAS_CONTRACT-> Contract',
        },
      ],
    },
  ],
  citations: [
    {
      graph: 'structured',
      collection: 'Contract',
      _id: `Contract/${NORTHWIND_ACCOUNT_ID}-2025-enterprise`,
      aql:
        'FOR ct IN Contract FILTER ct.account_id == @acct AND ct.status == ' +
        '"active" RETURN ct',
      traversal: 'Account -HAS_CONTRACT-> Contract',
    },
  ],
  retrievalPath: [
    {
      graph: 'structured',
      collection: 'Contract',
      _ids: [`Contract/${NORTHWIND_ACCOUNT_ID}-2025-enterprise`],
      query: 'structuredQuery(account_id=' + NORTHWIND_ACCOUNT_ID + ', entity=contract)',
    },
  ],
  reasoningTrace: [
    'Planning: question asked for an upsell-readiness verdict requiring a usage trend ' +
      'the retrieved set did not contain.',
    'Querying structured graph: found the active contract but not the supporting usage ' +
      'trend the verdict would need.',
    'Grounding gate: the unsupported claim was pruned; only the grounded contract fact ' +
      'is returned. Refusing rather than fabricating.',
  ],
  // Phase 8: refusal envelopes set groundingScore: 1.0 (per agent.ts honesty contract).
  groundingScore: 1,
};

/** The honest-refusal envelope — contract-validated at module load. */
export const REFUSED_ENVELOPE: Envelope = EnvelopeSchema.parse(refusedEnvelope);

/**
 * EDGES_ENVELOPE (Phase 11, Plan 01) — a grounded dual-graph envelope with an
 * explicit edges[] array exercising ALL three edge kinds so buildGraph.test.ts
 * can assert the honesty invariant (structural/hybrid never solid) and edge-id
 * dedup without a live DB or canvas.
 *
 * Edges included:
 *  - traversed PART_OF  : Chunk → Document (real _id)
 *  - traversed same_as  : the cross-graph bridge (real _id)
 *  - structural account : synthesized account anchor (_id: null)
 *  - hybrid             : question/current → chunk (_from: 'question/current', _id: null)
 */
const edgesEnvelope: Envelope = {
  answer:
    'Meridian Logistics query volume increased 38% QoQ — usage is green while ' +
    'internal escalations signal renewal risk.',
  refused: false,
  claims: [
    {
      text: 'Query volume up 38% QoQ.',
      citations: [
        {
          graph: 'structured',
          collection: 'UsageMetric',
          _id: `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
          aql: 'FOR u IN UsageMetric FILTER u.account_id == @acct RETURN u',
          traversal: 'Account -HAS_USAGE-> UsageMetric',
        },
      ],
    },
  ],
  citations: [
    {
      graph: 'structured',
      collection: 'UsageMetric',
      _id: `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
      aql: 'FOR u IN UsageMetric FILTER u.account_id == @acct RETURN u',
      traversal: 'Account -HAS_USAGE-> UsageMetric',
    },
  ],
  retrievalPath: [
    {
      graph: 'structured',
      collection: 'UsageMetric',
      _ids: [`UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`],
      query: 'structuredQuery(account_id=' + MERIDIAN_ACCOUNT_ID + ', metrics=[query_volume])',
      edges: [
        // traversed PART_OF — real edge with a non-null _id (real DB traversal)
        {
          _id: 'customer360_Relations/rel_part_of_001',
          _from: 'Chunk/slack-meridian-incident-2026-05-19-0007',
          _to: 'Document/doc-slack-meridian-escalations',
          collection: 'customer360_Relations',
          kind: 'traversed',
          label: 'PART_OF',
        },
        // traversed same_as — cross-graph bridge edge (real _id)
        {
          _id: 'customer360_Bridge/bridge_meridian_001',
          _from: `Account/${MERIDIAN_ACCOUNT_ID}`,
          _to: `Document/doc-meridian-account`,
          collection: 'customer360_Bridge',
          kind: 'traversed',
          label: 'same_as',
        },
        // structural account edge — synthesized account anchor, _id is null
        // (never a real DB traversal — honesty invariant: must be drawn dashed, not solid)
        {
          _id: null,
          _from: `Account/${MERIDIAN_ACCOUNT_ID}`,
          _to: `UsageMetric/${MERIDIAN_ACCOUNT_ID}-2026Q2-queryvol`,
          collection: 'account',
          kind: 'structural',
          label: 'account',
        },
        // hybrid — question anchor → retrieved chunk, synthesized match edge, _id null
        // (represents vector+BM25 retrieval — must be drawn dotted, not solid)
        {
          _id: null,
          _from: 'question/current',
          _to: 'Chunk/slack-meridian-incident-2026-05-19-0007',
          collection: 'hybrid',
          kind: 'hybrid',
          label: 'hybrid',
        },
      ],
    },
    {
      graph: 'unstructured',
      collection: 'Chunk',
      _ids: ['Chunk/slack-meridian-incident-2026-05-19-0007'],
      query:
        'hybridRetrieve(account_id=' +
        MERIDIAN_ACCOUNT_ID +
        ', q="renewal risk escalation", k=5, fusion=rrf)',
      edges: [],
    },
  ],
  reasoningTrace: [
    'Planning: edges-envelope fixture for buildGraph unit tests.',
    'All three edge kinds (traversed, structural, hybrid) represented.',
  ],
  groundingScore: 1,
};

/** Edges-bearing envelope for buildGraph unit tests (Phase 11, Plan 01). */
export const EDGES_ENVELOPE: Envelope = EnvelopeSchema.parse(edgesEnvelope);
