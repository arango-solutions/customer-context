// web/components/ExampleChips.tsx
//
// The guided example chips (UI-01). Pill chips whose `onClick` FILLS the QuestionBox
// (via `setInput`) — they do NOT auto-submit. Free-form natural language is the premise
// (PROJECT.md / D-discretion): the chip is a starter the user can edit before asking.
//
// Six chips are the VERBATIM locked eval prompts (agent/test/questions.eval.test.ts);
// one additional 'JOIN' chip is a demo-only starter (not an eval prompt) phrased to make
// the planner invoke crossGraphJoin so the EXPL-01 pipeline spotlights the cross-graph
// join as the hero (Phase 14). The Q12 chip is FIRST and visually FEATURED (an accent
// focus ring) — the showcase: structured usage looks green, unstructured sentiment is red.
//
// Each chip shows a short label; clicking inserts the full prompt text into the box.

'use client';

/** A locked example: short label shown on the chip, full verbatim prompt inserted. */
export interface ExamplePrompt {
  /** Stable id (the eval question number). */
  id: string;
  /** Short chip label. */
  label: string;
  /** The full verbatim prompt inserted into the box. */
  prompt: string;
  /** Featured (Q12 showcase) — rendered first with an accent ring. */
  featured?: boolean;
}

/**
 * Seven example prompts: Q12 (first, featured) + the JOIN demo chip (second) + the five
 * other locked eval prompts. The six Q* entries are VERBATIM from
 * agent/test/questions.eval.test.ts; JOIN is a demo-only starter (Phase 14, EXPL-01).
 */
export const EXAMPLE_PROMPTS: ReadonlyArray<ExamplePrompt> = [
  {
    id: 'Q12',
    label: 'Usage green vs. sentiment red',
    featured: true,
    prompt:
      'Meridian Logistics looks green on every usage metric and their NPS score is fine — ' +
      'but are they ACTUALLY happy? Compare the structured usage/NPS-score signal against ' +
      'the sentiment in their Slack escalations, QBR notes, exec emails, and NPS verbatim ' +
      'comments, and tell me explicitly if there is a contradiction.',
  },
  {
    // Demo-only chip (NOT a locked eval prompt): phrased to make the planner invoke
    // crossGraphJoin so the EXPL-01 pipeline spotlights the structured↔unstructured
    // same_as join as the hero. Validated live: fires crossGraphJoin (same_as fragment,
    // ~40 traversed edges), grounded (groundingScore 1), ~29s. Non-featured (Q12 holds
    // the accent ring) but placed second so it is immediately visible.
    id: 'JOIN',
    label: 'Show the cross-graph join',
    prompt:
      'Show me the cross-graph join for Meridian Logistics: trace from their account to ' +
      'the documents that mention them as one connected graph traversal across both graphs.',
  },
  {
    id: 'Q2',
    label: 'Renewal risk — and why',
    prompt:
      'Is Meridian Logistics at risk at their upcoming renewal, and WHY? Use their ' +
      'contract renewal date and usage trend together with the CSM Slack notes, renewal ' +
      'emails, and QBR documents that explain any risk.',
  },
  {
    id: 'Q9',
    label: 'Is our champion still engaged?',
    prompt:
      'Is our champion at Meridian Logistics still engaged? Use the CRM contact record and ' +
      'renewal context together with their recent emails, Slack notes, and meeting-notes ' +
      'attendance to judge whether they have gone quiet.',
  },
  {
    id: 'Q5',
    label: 'Ready for an upsell?',
    prompt:
      'Is Northwind Analytics ready for an ArangoGraph or GenAI upsell? Use their edition, ' +
      'product whitespace, and usage thresholds from the structured graph together with ' +
      'any documented trigger (scale pain, ops burden, or RAG intent) in their Slack notes, ' +
      'success plan, and exec emails.',
  },
  {
    id: 'Q8',
    label: 'What did we promise — did we deliver?',
    prompt:
      'What did we promise Meridian Logistics, and did we deliver? Reconcile the contract ' +
      'SLA and product scope and the usage telemetry that shows delivery against any ' +
      'promise made in emails, Slack, or meeting notes — including a commitment that was ' +
      'never logged in the CRM.',
  },
  {
    id: 'Q7',
    label: 'Product-ladder adoption (structured only)',
    prompt:
      'For Northwind Analytics, show how they have adopted ArangoDB across the product ' +
      'ladder (Community to Enterprise to ArangoGraph) and the ROI we have delivered. ' +
      'Answer purely from the structured graph — their usage telemetry, contracts, and ' +
      'expansion opportunities; do not use any unstructured documents for this one.',
  },
];

export interface ExampleChipsProps {
  /** FILL the box with the chip's full prompt (never auto-submit). */
  onPick: (prompt: string) => void;
  /**
   * The current question-box value. A chip whose full prompt equals this value is
   * rendered SELECTED (filled accent) — so clicking a chip gives clear visual
   * feedback, and editing the box (value no longer matches) auto-deselects it.
   */
  value?: string;
  /** Optional className for layout. */
  className?: string;
}

export function ExampleChips({ onPick, value, className }: ExampleChipsProps) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className ?? ''}`}
      role="list"
      aria-label="Example questions"
    >
      {EXAMPLE_PROMPTS.map((ex) => {
        const selected = value !== undefined && value === ex.prompt;
        return (
          <button
            key={ex.id}
            type="button"
            role="listitem"
            // Chips FILL the box — they do NOT submit. Free-form NL is the premise.
            onClick={() => onPick(ex.prompt)}
            aria-label={`Fill the question box with: ${ex.label}`}
            aria-current={selected ? 'true' : undefined}
            title={ex.prompt}
            className={[
              'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? // SELECTED: filled accent so the chosen chip is unmistakable.
                  // Green (the accent) now means ONLY "selected" — no permanent
                  // featured ring competing with it (UAT 06 follow-up).
                  'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            ].join(' ')}
            data-featured={ex.featured ? 'true' : undefined}
            data-selected={selected ? 'true' : undefined}
          >
            {ex.label}
          </button>
        );
      })}
    </div>
  );
}
