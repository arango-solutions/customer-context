// web/components/GraphBadge.tsx
//
// Reused dual-graph atom (UI-SPEC Component Inventory). A filled pill that signals
// which graph a citation came from — the demo-load-bearing distinction:
//   structured   → ArangoDB green   (#5C9E31)
//   unstructured → slate-blue       (#3A6EA5)
//
// Accessibility (UI-SPEC): the distinction is NEVER color-only — the badge ALWAYS
// carries its text label ("Structured" / "Unstructured") so colorblind users are
// not reliant on green-vs-blue.

import * as React from 'react';
import type { GraphKind } from 'customer360-agent';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LABEL: Record<GraphKind, string> = {
  structured: 'Structured',
  unstructured: 'Unstructured',
};

export interface GraphBadgeProps {
  graph: GraphKind;
  className?: string;
}

/**
 * Filled green/slate-blue pill with a mandatory text label. `variant` maps the
 * graph enum onto the shadcn Badge's `structured`/`unstructured` variants (the
 * brand tokens live in globals.css).
 */
export function GraphBadge({ graph, className }: GraphBadgeProps) {
  return (
    <Badge
      variant={graph}
      className={cn(className)}
      data-graph={graph}
      aria-label={`${LABEL[graph]} graph`}
    >
      {LABEL[graph]}
    </Badge>
  );
}

export default GraphBadge;
