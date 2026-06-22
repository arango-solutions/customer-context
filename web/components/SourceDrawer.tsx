// web/components/SourceDrawer.tsx
//
// The click-to-source payoff (SRC-03). A right-side Radix Sheet (480px desktop /
// full-width mobile, focus-trapped, Esc/overlay close → returns focus) that renders
// the citation ATOM for a clicked claim or card:
//   header : `Source — {graph} · {collection}` (Copywriting Contract) + GraphBadge + _id
//   AQL    : the EXACT `aql` in a copy-enabled JetBrains-Mono block (the deliberate
//            differentiator — buyers can lift the exact query)
//   trav.  : the traversal description
//
// v1 renders the citation ATOM only — NO raw-record fetch (RESEARCH A4 / locked v1
// resolution). A claim with multiple citations lists each as its own section.
//
// Controlled component: parent owns `open` + the `citations` to show, and `onClose`.

'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import type { Citation } from 'customer360-agent';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { GraphBadge } from '@/components/GraphBadge';
import { cn } from '@/lib/utils';

export interface SourceDrawerProps {
  open: boolean;
  /** The citation(s) for the clicked claim/card. Empty = nothing to show. */
  citations: Citation[];
  /** Close handler — wired to Radix onOpenChange(false) (Esc / overlay / button). */
  onClose: () => void;
  /** Optional drawer heading prefix label override (defaults to the contract copy). */
  title?: string;
}

function CopyAqlButton({ aql }: { aql: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(aql);
    } catch {
      // clipboard unavailable (e.g. jsdom / insecure context) — copy is a
      // convenience; the AQL is already visible in the block below.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      aria-label="Copy AQL"
      className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={copy}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function SourceDrawer({
  open,
  citations,
  onClose,
  title,
}: SourceDrawerProps) {
  // The header reflects the first citation (the drawer is scoped to one claim/card);
  // additional citations render as their own sections below.
  const primary = citations[0];

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="right" className="flex flex-col gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {title ??
              (primary
                ? `Source — ${primary.graph} · ${primary.collection}`
                : 'Source')}
          </SheetTitle>
        </SheetHeader>

        {citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources to display.</p>
        ) : (
          citations.map((c, i) => (
            <section
              key={`${c._id}-${i}`}
              className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0"
              data-graph={c.graph}
            >
              <div className="flex items-center gap-2">
                <GraphBadge graph={c.graph} />
                <span className="text-sm font-semibold text-foreground">
                  {c.collection}
                </span>
              </div>

              <code className="font-mono text-sm text-foreground break-all">
                {c._id}
              </code>

              {c.traversal ? (
                <p className="text-sm text-muted-foreground">{c.traversal}</p>
              ) : null}

              {/* Exact AQL — copy-enabled mono block (the differentiator). */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    AQL
                  </span>
                  <CopyAqlButton aql={c.aql} />
                </div>
                <pre
                  className={cn(
                    'overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm text-foreground',
                    'whitespace-pre-wrap break-words',
                  )}
                >
                  {c.aql}
                </pre>
              </div>
            </section>
          ))
        )}
      </SheetContent>
    </Sheet>
  );
}

export default SourceDrawer;
