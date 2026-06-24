// web/components/SourcingRail.tsx
//
// The persistent right-hand rail (D-02, UI-SPEC). Composes, top to bottom:
//   1. ReasoningTimeline  (live six-phase stepper + reasoningTrace)  — SRC-04
//   2. CitationCard per envelope citation                            — SRC-01/02
//   3. Graph/Path toggle + either GraphViz or RetrievalPathByGraph   — SRC-02 / D-05
//
// D-05: the Retrieval-path section hosts a GraphPathToggle; default = Path.
// The GraphViz `onOpenSource` is the SAME rail-owned `openSource` callback that
// CitationCard + claim superscripts use — shared-drawer-via-onOpenSource-lift pattern
// (PATTERNS.md). No new drawer is created; GraphViz delegates to this rail.
//
// The rail OWNS the shared SourceDrawer open-state: a CitationCard body click, a
// claim superscript click (via the `openSource` ref the parent forwards to AnswerBody),
// AND a GraphViz node click all open the SAME drawer. The parent wires AnswerBody's
// `onOpenSource` to this rail's imperative `openSource` handle.
//
// Sticky on scroll per the layout spec.

'use client';

import * as React from 'react';
import type { Envelope, Citation } from 'customer360-agent';
import type { StreamPhase } from '@/lib/ui-message';

import { ReasoningTimeline } from '@/components/ReasoningTimeline';
import { CitationCard } from '@/components/CitationCard';
import { RetrievalPathByGraph } from '@/components/RetrievalPathByGraph';
import { GraphViz } from '@/components/GraphViz';
import { GraphPathToggle, type GraphPathValue } from '@/components/GraphPathToggle';
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

  // D-05: toggle state for the Retrieval-path section. Default = Path (lowest-
  // regression default — v1 text-path flow is the eval-tested experience).
  const [retrievalView, setRetrievalView] = React.useState<GraphPathValue>('path');

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
        {/* D-05: Graph/Path toggle — default Path; active segment accent green */}
        <GraphPathToggle
          value={retrievalView}
          onChange={setRetrievalView}
          className="mb-3"
        />
        {retrievalView === 'path' ? (
          /* Path half — UNCHANGED; becomes the "Path" half of the toggle (D-05) */
          <RetrievalPathByGraph retrievalPath={envelope.retrievalPath} />
        ) : (
          /* Graph half — React Flow canvas; node-click delegates to rail openSource
             (shared-drawer-via-onOpenSource-lift; PATTERNS.md; D-06) */
          <GraphViz
            retrievalPath={envelope.retrievalPath}
            onOpenSource={openSource}
          />
        )}
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
