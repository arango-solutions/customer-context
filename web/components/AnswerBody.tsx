// web/components/AnswerBody.tsx
//
// Numbered claim-list rendering (D-12, folds 999.2). Replaces the prose-with-
// trailing-superscripts layout with a semantic <ol>; each <li> is one claim's
// `text` + a `ClaimSuperscript` opening the shared drawer (RESEARCH Pattern 5).
//
// D-12 DESIGN RATIONALE: render `envelope.claims[]` as a numbered list rather
// than raw prose because claim text is NOT a guaranteed verbatim substring of
// `answer`. The old layout (prose + trailing markers) had a fuzzy claim→prose-span
// mapping. Every fact is now unambiguously sourced — the strongest expression of
// "every fact traceable" (UI-SPEC Answer Rendering).
//
// CARDINAL RULE (T-06-09): this renders ONLY the grounded envelope's `claims`.
// envelope.answer and envelope.claims DATA are read-only — rendering change only.
// A refused envelope is handled by RefusalPanel, not here.
// Faithfulness/grounding eval reads this data; they stay green (UI concern only).
//
// KEPT VERBATIM:
//  - ClaimSuperscript (44px hit area + aria-label "View sources for claim {n}")
//  - The onOpenSource-delegate-vs-local-drawer prop contract
//  - 'use client' boundary
//
// REPLACED: the old `<p>{envelope.answer}</p>` + trailing markers block
// with RESEARCH Pattern 5 `<ol>` mapping claims[] to <li>s.

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
      {/*
       * D-12: Numbered claim list — each claim is one <li> with its text + a
       * ClaimSuperscript linking to that claim's citations. This replaces the old
       * `<p>{envelope.answer}</p>` + trailing markers block. The envelope.answer
       * and envelope.claims DATA are untouched (eval reads them; rendering only).
       */}
      <ol className="flex flex-col gap-4 list-decimal pl-6">
        {envelope.claims.map((claim, i) => (
          <li
            key={i}
            className="text-base leading-relaxed text-foreground"
          >
            {claim.text}
            <ClaimSuperscript index={i} onActivate={() => activate(i)} />
          </li>
        ))}
      </ol>

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
