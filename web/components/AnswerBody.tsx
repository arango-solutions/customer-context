// web/components/AnswerBody.tsx
//
// Center-stage clean prose with numbered superscript citation markers (UI-02, D-03).
// The synthesized `answer` is rendered as prose, then one `ClaimSuperscript` `[n]`
// marker per `claims[]` entry (in order) is appended — each opens the SourceDrawer
// scoped to `claims[n].citations`.
//
// CARDINAL RULE (T-06-09): this renders ONLY the grounded envelope's `answer` +
// `claims`. The reasoning timeline (progress text) is NEVER rendered here as a claim.
// A refused envelope is handled by RefusalPanel, not here.
//
// Drawer open-state can be OWNED here (standalone use) OR LIFTED to a parent
// (SourcingRail) so a card click and a claim superscript open the SAME drawer. When
// `onOpenSource` is provided, this component delegates; otherwise it owns a local
// drawer.

'use client';

import * as React from 'react';
import type { Envelope, Citation } from 'customer360-agent';

import { SourceDrawer } from '@/components/SourceDrawer';
import { cn } from '@/lib/utils';

/** Small accent `[n]` with a 44px padded hit area (UI-SPEC ClaimSuperscript). */
export interface ClaimSuperscriptProps {
  index: number; // zero-based claim index
  onActivate: () => void;
}

export function ClaimSuperscript({ index, onActivate }: ClaimSuperscriptProps) {
  const n = index + 1;
  return (
    <sup>
      <button
        type="button"
        aria-label={`View sources for claim ${n}`}
        className={cn(
          'mx-0.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center',
          'align-super text-sm font-semibold text-primary',
          'rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
        onClick={onActivate}
      >
        [{n}]
      </button>
    </sup>
  );
}

export interface AnswerBodyProps {
  envelope: Envelope;
  /**
   * If provided, the superscript click delegates to the parent (the SourcingRail owns
   * the shared drawer). If omitted, AnswerBody owns a local SourceDrawer.
   */
  onOpenSource?: (citations: Citation[]) => void;
  className?: string;
}

export function AnswerBody({ envelope, onOpenSource, className }: AnswerBodyProps) {
  const [localCitations, setLocalCitations] = React.useState<Citation[] | null>(
    null,
  );

  const activate = (claimIndex: number) => {
    const citations = envelope.claims[claimIndex]?.citations ?? [];
    if (onOpenSource) {
      onOpenSource(citations);
    } else {
      setLocalCitations(citations);
    }
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="max-w-[720px] text-base leading-relaxed text-foreground">
        {/* The grounded prose, verbatim. */}
        <p className="whitespace-pre-wrap">{envelope.answer}</p>

        {/* Numbered claim markers — one per claim, in order. Provenance is one click
            away; the prose itself stays uncluttered (D-03). */}
        <p className="mt-2 flex flex-wrap items-center gap-0 text-sm text-muted-foreground">
          <span className="mr-1">Claims:</span>
          {envelope.claims.map((_, i) => (
            <ClaimSuperscript key={i} index={i} onActivate={() => activate(i)} />
          ))}
        </p>
      </div>

      {/* Locally-owned drawer (only when no parent owns it). */}
      {onOpenSource ? null : (
        <SourceDrawer
          open={localCitations !== null}
          citations={localCitations ?? []}
          onClose={() => setLocalCitations(null)}
        />
      )}
    </div>
  );
}

export default AnswerBody;
