// web/components/SourcingRail.tsx
//
// The persistent right-hand rail (D-02, UI-SPEC). Composes, top to bottom:
//   1. ReasoningTimeline  (live six-phase stepper + reasoningTrace)  — SRC-04
//   2. CitationCard per envelope citation                            — SRC-01/02
//   3. RetrievalPathByGraph (grouped structured/unstructured)        — SRC-02
//
// The rail OWNS the shared SourceDrawer open-state: a CitationCard body click and a
// claim superscript click (via the `openSource` ref the parent forwards to AnswerBody)
// open the SAME drawer. The parent wires AnswerBody's `onOpenSource` to this rail's
// imperative `openSource` handle.
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

  const openSource = React.useCallback((citations: Citation[]) => {
    setDrawerCitations(citations);
  }, []);

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
        <RetrievalPathByGraph retrievalPath={envelope.retrievalPath} />
      </section>

      {/* Rail-owned drawer, shared by cards and claim superscripts. */}
      <SourceDrawer
        open={drawerCitations !== null}
        citations={drawerCitations ?? []}
        onClose={() => setDrawerCitations(null)}
      />
    </aside>
  );
});

export default SourcingRail;
