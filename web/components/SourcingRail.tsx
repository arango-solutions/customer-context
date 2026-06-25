// web/components/SourcingRail.tsx
//
// The persistent right-hand rail (D-02, UI-SPEC). Composes, top to bottom:
//   1. ReasoningTimeline  (live six-phase stepper + reasoningTrace)  — SRC-04
//   2. CitationCard per envelope citation                            — SRC-01/02
//   3. RetrievalPathByGraph — the textual per-graph retrieval path   — SRC-02
//
// Phase 11 D3 pivot: the cross-graph VISUAL (GraphViz, d3-force) moved OUT of the
// rail and now renders full-width UNDER the answer in the main column (always
// visible, not behind a toggle). The rail keeps the textual Path breakdown.
//
// The rail OWNS the shared SourceDrawer open-state: a CitationCard body click, a
// claim superscript click (via the `openSource` ref the parent forwards to AnswerBody),
// AND a GraphViz node click (the parent wires GraphViz onOpenSource → this handle)
// all open the SAME drawer.
//
// Sticky on scroll per the layout spec.

'use client';

import * as React from 'react';
import type { Envelope, Citation } from 'customer360-agent';
import type { StreamPhase } from '@/lib/ui-message';

import { ReasoningTimeline } from '@/components/ReasoningTimeline';
import { CitationCard } from '@/components/CitationCard';
import { RetrievalPathByGraph } from '@/components/RetrievalPathByGraph';
import { SourceDrawer } from '@/components/SourceDrawer';
import { cn } from '@/lib/utils';

/** Imperative handle: lets a sibling (AnswerBody) open the rail-owned drawer. */
export interface SourcingRailHandle {
  openSource: (citations: Citation[]) => void;
}

export interface SourcingRailProps {
  envelope: Envelope;
  /** Live active phase for the timeline (omit/null when not streaming). */
  currentPhase?: StreamPhase | null;
  className?: string;
}

export const SourcingRail = React.forwardRef<
  SourcingRailHandle,
  SourcingRailProps
>(function SourcingRail({ envelope, currentPhase = null, className }, ref) {
  const [drawerCitations, setDrawerCitations] = React.useState<
    Citation[] | null
  >(null);

  // _id → { fields, text } merged across every retrieval-path fragment. nodeLabels.ts
  // (server, post-grounding) builds this for every node id the path references — chunk
  // CONTENT for unstructured, the actual returned record FIELDS for structured. Citations
  // emitted on the answer carry only _id + aql, so we join the detail in here when the
  // drawer opens (the GraphViz node-click path already enriches; this gives the SAME
  // payoff to citation-card + claim-superscript clicks). Display-only; never touches grounding.
  const nodeDetailsById = React.useMemo(() => {
    const map = new Map<string, { fields?: Citation['fields']; text?: string }>();
    for (const frag of envelope.retrievalPath ?? []) {
      if (!frag.nodeDetails) continue;
      for (const [id, detail] of Object.entries(frag.nodeDetails)) {
        if (!map.has(id)) map.set(id, detail);
      }
    }
    return map;
  }, [envelope.retrievalPath]);

  const openSource = React.useCallback(
    (citations: Citation[]) => {
      // Prefer detail already on the citation (viz node-click path); else join from nodeDetails.
      const enriched = citations.map((c) => {
        if (c.text || (c.fields && c.fields.length > 0)) return c;
        const detail = nodeDetailsById.get(c._id);
        return detail ? { ...c, fields: detail.fields, text: detail.text } : c;
      });
      setDrawerCitations(enriched);
    },
    [nodeDetailsById],
  );

  React.useImperativeHandle(ref, () => ({ openSource }), [openSource]);

  return (
    <aside
      className={cn(
        'sticky top-16 flex w-full flex-col gap-6 bg-secondary p-4',
        className,
      )}
      aria-label="Sourcing and reasoning"
    >
      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Reasoning</h2>
        <ReasoningTimeline
          currentPhase={currentPhase}
          reasoningTrace={envelope.reasoningTrace}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">Sources</h2>
        <div className="flex flex-col gap-3">
          {envelope.citations.map((c, i) => (
            <CitationCard
              key={`${c._id}-${i}`}
              citation={c}
              onOpenSource={(citation) => openSource([citation])}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          Retrieval path
        </h2>
        {/* The textual per-graph path. The cross-graph VISUAL now lives under the
            answer in the main column (Phase 11 D3 pivot) — not behind a toggle. */}
        <RetrievalPathByGraph retrievalPath={envelope.retrievalPath} />
      </section>

      {/* Rail-owned drawer, shared by cards, claim superscripts, AND viz node clicks. */}
      <SourceDrawer
        open={drawerCitations !== null}
        citations={drawerCitations ?? []}
        onClose={() => setDrawerCitations(null)}
      />
    </aside>
  );
});

export default SourcingRail;
