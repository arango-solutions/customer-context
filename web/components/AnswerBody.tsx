// web/components/AnswerBody.tsx
//
// Cohesive answer + sourced "Supporting facts" (2026-06-25). The PRIMARY read is the
// cohesive narrative `envelope.answer`; BELOW it, the decomposed `envelope.claims[]`
// render as a de-emphasized "Supporting facts" <ol>, each <li> = one claim's `text` +
// a `ClaimSuperscript` opening the shared drawer (RESEARCH Pattern 5).
//
// DESIGN RATIONALE: D-12 originally rendered claims[] AS the answer (a numbered list)
// to guarantee per-fact sourcing, since claim text is NOT a verbatim substring of
// `answer`. That read as fragmented. This version restores the cohesive answer as the
// lead while KEEPING every claim click-to-source below it — coherent to read, still
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
  /**
   * CDC-03 (additive, render-only): zero-based indices of claims that are NEW/changed
   * vs. the prior answer (from the client-side diff). Matching <li>s get a brand-token
   * highlight. Does NOT touch envelope.claims/answer DATA (CARDINAL RULE — eval reads them).
   */
  changedClaimIndices?: number[];
  className?: string;
}

export function AnswerBody({
  envelope,
  onOpenSource,
  changedClaimIndices,
  className,
}: AnswerBodyProps) {
  const changed = new Set(changedClaimIndices ?? []);
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
    <div className={cn('flex flex-col gap-5', className)}>
      {/*
       * PRIMARY — the cohesive narrative answer (envelope.answer). Leads the read so
       * the response is a coherent answer, not a list of fragments (2026-06-25 — reverses
       * D-12's claim-list-as-answer). DATA untouched: eval still reads answer + claims.
       */}
      <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
        {envelope.answer}
      </p>

      {/*
       * SECONDARY — per-fact sourcing. Every claim stays click-to-source (traceability,
       * the core value), but now SUPPORTS the cohesive answer above instead of replacing
       * it. Rendered as a de-emphasized "Supporting facts" <ol> (the existing claim list +
       * ClaimSuperscript behavior is preserved verbatim).
       */}
      {envelope.claims.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Supporting facts
          </span>
          <ol className="flex flex-col gap-2 list-decimal pl-6">
            {envelope.claims.map((claim, i) => (
              <li
                key={i}
                data-changed={changed.has(i) ? 'true' : undefined}
                className={cn(
                  'text-sm leading-relaxed text-muted-foreground',
                  // CDC-03: brand-token highlight on new/changed claims (render-only).
                  changed.has(i) && 'rounded bg-primary/10 px-2 py-1 -mx-2',
                )}
              >
                {claim.text}
                <ClaimSuperscript index={i} onActivate={() => activate(i)} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

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
