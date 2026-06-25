// web/components/WhatChangedBanner.tsx
//
// CDC-03 grounded "what-changed" banner (Plan 03, Task 2 / D-04 / D-05).
//
// ONE compact banner ABOVE the single answer (D-04 — not a side-by-side before/after).
// It names the ACTUAL new record(s) by resolving the diff's `newCitationIds` against
// `after.citations` and rendering ONLY ids that are real members of that set — no
// fabricated diff (D-05). It is driven entirely by the client-side EnvelopeDiff;
// no model call, no grounding-gate involvement (D-07).
//
// Styling mirrors TrustChip.tsx: 'use client', envelope/diff-driven, brand tokens
// only (bg-primary/text-*-foreground — never hex), `cn` from @/lib/utils.

'use client';

import * as React from 'react';
import type { Envelope } from 'customer360-agent';

import type { EnvelopeDiff } from '@/lib/diff-envelope';
import { cn } from '@/lib/utils';

export interface WhatChangedBannerProps {
  /** The grounded diff from useAsk (null on a first ask → renders nothing). */
  diff: EnvelopeDiff | null;
  /** The current (after) envelope — the source of truth the new ids resolve against. */
  envelope: Envelope;
  className?: string;
}

/** Friendly collection label: 'customer360_Documents' → 'Document'. */
function friendlyCollection(collection: string): string {
  const base = collection.replace(/^customer360_/, '').replace(/s$/, '');
  return base || collection;
}

export function WhatChangedBanner({ diff, envelope, className }: WhatChangedBannerProps) {
  if (!diff) return null;

  // GROUNDED (D-05): resolve each new id against after.citations and keep ONLY
  // ids that are real members — a fabricated id resolves to nothing and is dropped.
  const byId = new Map(envelope.citations.map((c) => [c._id, c]));
  const newRecords = diff.newCitationIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => c != null);

  const addedCount = diff.addedClaims.length;

  // No grounded change to show → render nothing (no-change state).
  if (newRecords.length === 0 && addedCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm',
        className,
      )}
    >
      <div className="font-semibold text-foreground">What changed since you last asked</div>

      {newRecords.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {newRecords.map((c) => (
            <li key={c._id} data-citation-id={c._id} className="text-foreground">
              <span className="font-medium">New source:</span>{' '}
              {c.text ?? friendlyCollection(c.collection)}{' '}
              <span className="text-muted-foreground">
                ({friendlyCollection(c.collection)} · {c._id})
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {addedCount > 0 ? (
        <div className="mt-2 text-muted-foreground">
          {addedCount} new claim{addedCount === 1 ? '' : 's'} added — highlighted below.
        </div>
      ) : null}
    </div>
  );
}

export default WhatChangedBanner;
