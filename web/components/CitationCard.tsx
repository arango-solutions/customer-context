// web/components/CitationCard.tsx
//
// Renders ONE grounded `Citation` (SRC-01/SRC-02, card form). Secondary surface card:
//   top row : GraphBadge (green=structured / slate-blue=unstructured) + collection
//   middle  : the real ArangoDB `_id` in JetBrains Mono
//   bottom  : a one-line traversal hint (if present) + an "AQL" disclosure that
//             expands the EXACT aql in a mono code block (the deliberate differentiator)
//
// Clicking the card body invokes `onOpenSource(citation)` — the SourceDrawer trigger
// (UI-SPEC Interaction Specs, Card → drawer). The inline AQL disclosure expands in
// place for a quick peek (does NOT open the drawer).
//
// The component renders the citation atom VERBATIM — it never fabricates or derives
// a field (T-06-09 / T-06-10): every value comes straight off the envelope.

'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { Citation } from 'customer360-agent';

import { Card } from '@/components/ui/card';
import { GraphBadge } from '@/components/GraphBadge';
import { cn } from '@/lib/utils';

export interface CitationCardProps {
  citation: Citation;
  /** Open the full source drawer for this citation (Card → drawer). */
  onOpenSource?: (citation: Citation) => void;
  className?: string;
}

export function CitationCard({
  citation,
  onOpenSource,
  className,
}: CitationCardProps) {
  const [aqlOpen, setAqlOpen] = React.useState(false);

  const open = () => onOpenSource?.(citation);

  return (
    <Card
      className={cn('bg-secondary p-4 transition-colors', className)}
      data-graph={citation.graph}
    >
      {/* Card body — clicking opens the drawer. Keyboard-operable. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open source — ${citation.graph} graph, ${citation.collection} ${citation._id}`}
        className="flex cursor-pointer flex-col gap-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        {/* Top row: graph badge + collection */}
        <div className="flex items-center gap-2">
          <GraphBadge graph={citation.graph} />
          <span className="text-sm font-semibold text-foreground">
            {citation.collection}
          </span>
        </div>

        {/* Middle: the real _id in mono */}
        <code className="font-mono text-sm text-foreground break-all">
          {citation._id}
        </code>

        {/* Bottom: traversal hint (optional) */}
        {citation.traversal ? (
          <p className="text-sm text-muted-foreground">{citation.traversal}</p>
        ) : null}
      </div>

      {/* AQL disclosure — expands in place (NOT the drawer). */}
      <div className="mt-2">
        <button
          type="button"
          aria-expanded={aqlOpen}
          aria-label="Toggle AQL"
          className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setAqlOpen((v) => !v)}
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', aqlOpen && 'rotate-180')}
            aria-hidden
          />
          AQL
        </button>
        {aqlOpen ? (
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-foreground whitespace-pre-wrap break-words">
            {citation.aql}
          </pre>
        ) : null}
      </div>
    </Card>
  );
}

export default CitationCard;
