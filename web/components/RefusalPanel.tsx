// web/components/RefusalPanel.tsx
//
// The honest-refusal selling point (UI-03, D-03, RESEARCH Pitfall 5). Given a
// `refused: true` envelope, renders its `answer` VERBATIM as a calm structured
// statement under a `Cannot answer — and here's why` header, plus whatever partial
// `citations` WERE grounded, rendered as CitationCards.
//
// CARDINAL RULE (T-06-09): a refused envelope renders honestly with its partial
// citations — NEVER a fabricated full answer, and NEVER as a UI error/alarm. The clay
// accent (#B4451F) appears ONLY on the header rule — no red alarm styling.

'use client';

import * as React from 'react';
import type { Envelope, Citation } from 'customer360-agent';

import { CitationCard } from '@/components/CitationCard';
import { SourceDrawer } from '@/components/SourceDrawer';
import { cn } from '@/lib/utils';

export interface RefusalPanelProps {
  envelope: Envelope;
  className?: string;
}

export function RefusalPanel({ envelope, className }: RefusalPanelProps) {
  const [drawerCitations, setDrawerCitations] = React.useState<
    Citation[] | null
  >(null);

  return (
    <section
      className={cn('flex max-w-[720px] flex-col gap-4', className)}
      aria-label="Cannot answer"
    >
      <header className="border-b-2 border-destructive pb-2">
        <h2 className="text-xl font-semibold text-foreground">
          Cannot answer — and here&rsquo;s why
        </h2>
      </header>

      {/* The structured refusal text, verbatim — a calm statement, not an error. */}
      <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
        {envelope.answer}
      </p>

      {/* Partial citations that WERE grounded (the honest, sourced part). */}
      {envelope.citations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            What we could ground
          </h3>
          {envelope.citations.map((c, i) => (
            <CitationCard
              key={`${c._id}-${i}`}
              citation={c}
              onOpenSource={(citation) => setDrawerCitations([citation])}
            />
          ))}
        </div>
      ) : null}

      <SourceDrawer
        open={drawerCitations !== null}
        citations={drawerCitations ?? []}
        onClose={() => setDrawerCitations(null)}
      />
    </section>
  );
}

export default RefusalPanel;
