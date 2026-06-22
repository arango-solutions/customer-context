// web/components/RetrievalPathByGraph.tsx
//
// The full-path view (SRC-02, D-03) that complements per-claim CitationCards. Renders
// `retrievalPath[]` GROUPED under `Structured graph` / `Unstructured graph` headers so
// the dual-graph join is legible at a glance (the core value proposition rendered
// structurally — UI-SPEC Interaction Specs #4).
//
// Each fragment shows: collection + a count of `_ids` + the `query` in a mono,
// expandable block. v1 is a LIST, not React Flow (out of scope → v2 / NEXT-04).

'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { z } from 'zod';
import type { GraphKind } from 'customer360-agent';
import { RetrievalPathFragment } from 'customer360-agent';

import { cn } from '@/lib/utils';

// The barrel re-exports the `RetrievalPathFragment` Zod schema (the contract) but not
// its inferred type; derive it here from the schema so the component can NEVER drift
// from envelope.ts (single source of truth — same discipline as the fixtures).
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

const GROUP_ORDER: GraphKind[] = ['structured', 'unstructured'];
const GROUP_HEADER: Record<GraphKind, string> = {
  structured: 'Structured graph',
  unstructured: 'Unstructured graph',
};

function FragmentRow({ fragment }: { fragment: RetrievalPathFragmentT }) {
  const [open, setOpen] = React.useState(false);
  const count = fragment._ids.length;

  return (
    <div className="flex flex-col gap-1" data-graph={fragment.graph}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {fragment.collection}
        </span>
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'record' : 'records'}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Toggle query for ${fragment.collection}`}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
        Query
      </button>
      {open ? (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-foreground whitespace-pre-wrap break-words">
          {fragment.query}
        </pre>
      ) : null}
    </div>
  );
}

export interface RetrievalPathByGraphProps {
  retrievalPath: RetrievalPathFragmentT[];
  className?: string;
}

export function RetrievalPathByGraph({
  retrievalPath,
  className,
}: RetrievalPathByGraphProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {GROUP_ORDER.map((graph) => {
        const fragments = retrievalPath.filter((f) => f.graph === graph);
        if (fragments.length === 0) return null;
        return (
          <section key={graph} data-graph-group={graph}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {GROUP_HEADER[graph]}
            </h3>
            <div className="flex flex-col gap-3">
              {fragments.map((f, i) => (
                <FragmentRow key={`${f.collection}-${i}`} fragment={f} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default RetrievalPathByGraph;
