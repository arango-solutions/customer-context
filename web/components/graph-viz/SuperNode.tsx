// web/components/graph-viz/SuperNode.tsx
//
// Collection super-node for the GraphViz canvas (D-03).
//
// Groups same-collection cited records into one labelled "{Collection} ×{n}" node.
// On click, expands to reveal individual record nodes (React Flow hidden flag toggle).
// Collapsed by default.
//
// Analog: RetrievalPathByGraph.tsx FragmentRow (local expand state + a11y toggle).
//
// Note: expand/collapse via React Flow's node.hidden flag requires a useReactFlow()
// hook callback wired from the parent (GraphViz). This component renders the visual
// and fires the expand callback via node.data.onExpand.

'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/utils';

export type SuperNodeData = {
  label: string;
  graph?: 'structured' | 'unstructured';
  collection: string;
  count: number;
  expanded?: boolean;
  onExpand?: (collection: string) => void;
};

// CSS var tokens — never hardcoded hex
const GRAPH_FILL: Record<'structured' | 'unstructured', string> = {
  structured: 'var(--graph-structured)',
  unstructured: 'var(--graph-unstructured)',
};

const GRAPH_TEXT: Record<'structured' | 'unstructured', string> = {
  structured: 'var(--graph-structured-foreground)',
  unstructured: 'var(--graph-unstructured-foreground)',
};

export function SuperNode({ data }: NodeProps) {
  const nodeData = data as SuperNodeData;
  const graph = nodeData.graph ?? 'unstructured';
  const collection = nodeData.collection ?? nodeData.label ?? '';
  const count = nodeData.count ?? 0;
  const expanded = nodeData.expanded ?? false;
  const onExpand = nodeData.onExpand;

  const handleExpand = React.useCallback(() => {
    if (onExpand) {
      onExpand(collection);
    }
  }, [onExpand, collection]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleExpand();
      }
    },
    [handleExpand],
  );

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[44px] min-w-[44px] flex-col items-start justify-center',
        'rounded-md border-2 border-transparent px-3 py-1.5',
        'cursor-pointer transition-opacity hover:opacity-80',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      style={{
        backgroundColor: GRAPH_FILL[graph as 'structured' | 'unstructured'],
        color: GRAPH_TEXT[graph as 'structured' | 'unstructured'],
        opacity: 0.85,
        maxWidth: 200,
      }}
      aria-expanded={expanded}
      aria-label={`${collection} ×${count} — Click to expand`}
      onClick={handleExpand}
      onKeyDown={handleKeyDown}
    >
      {/* Super-node label: "{Collection} ×{n}" — UI-SPEC locked copy */}
      <span className="text-sm font-semibold leading-tight truncate max-w-[176px]">
        {collection} ×{count}
      </span>
      {/* Expand affordance */}
      <div className="mt-0.5 flex items-center gap-0.5 text-xs opacity-80">
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
        <span>Click to expand</span>
      </div>
    </button>
  );
}

export default SuperNode;
