// web/components/graph-viz/RecordNode.tsx
//
// A cited record node for the GraphViz canvas (D-01, D-06).
//
// Color: --graph-structured (green) or --graph-unstructured (slate-blue) via CSS var,
// keyed off node.data.graph. NEVER hardcoded hex (token-driven, Pitfall 5).
//
// Renders:
//  - Collection name title (14px/600 Label role)
//  - Truncated _id sublabel in JetBrains Mono (SourceDrawer pattern)
//
// Interaction:
//  - Focusable with 44px hit area (UI-SPEC accessibility floor)
//  - Click/Enter → onOpenSource (shared SourceDrawer delegate)
//  - aria-label="Open source — {graph} · {collection} · {_id}" (locked copy)
//
// HONESTY: this component does NOT touch edge data — it only renders node.data.

'use client';

import * as React from 'react';
import { type NodeProps } from '@xyflow/react';
import type { Citation } from 'customer360-agent';

import { cn } from '@/lib/utils';

export type RecordNodeData = {
  label: string;
  graph?: 'structured' | 'unstructured';
  collection: string;
  _id?: string;
  citations?: Citation[];
  onOpenSource?: (citations: Citation[]) => void;
};

// CSS var tokens for graph origin — never hardcoded hex (RESEARCH Anti-Pattern #1)
const GRAPH_FILL: Record<'structured' | 'unstructured', string> = {
  structured: 'var(--graph-structured)',
  unstructured: 'var(--graph-unstructured)',
};

const GRAPH_TEXT: Record<'structured' | 'unstructured', string> = {
  structured: 'var(--graph-structured-foreground)',
  unstructured: 'var(--graph-unstructured-foreground)',
};

export function RecordNode({ data }: NodeProps) {
  const nodeData = data as RecordNodeData;
  const graph = nodeData.graph ?? 'unstructured';
  const collection = nodeData.collection ?? nodeData.label ?? '';
  const _id = nodeData._id ?? nodeData.label ?? '';
  const citations = nodeData.citations ?? [];
  const onOpenSource = nodeData.onOpenSource;

  const handleActivate = React.useCallback(() => {
    if (onOpenSource) {
      onOpenSource(citations);
    }
  }, [onOpenSource, citations]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate],
  );

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[44px] min-w-[44px] flex-col items-start justify-center',
        'rounded-md border border-transparent px-3 py-1.5',
        'cursor-pointer transition-opacity hover:opacity-80',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      style={{
        backgroundColor: GRAPH_FILL[graph as 'structured' | 'unstructured'],
        color: GRAPH_TEXT[graph as 'structured' | 'unstructured'],
        maxWidth: 200,
      }}
      aria-label={`Open source — ${graph} · ${collection} · ${_id}`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      {/* Collection name — 14px/600 Label role */}
      <span className="text-sm font-semibold leading-tight truncate max-w-[176px]">
        {collection}
      </span>
      {/* Truncated _id — JetBrains Mono, Code role */}
      <code className="mt-0.5 font-mono text-xs opacity-80 truncate max-w-[176px]">
        {_id.length > 30 ? `…${_id.slice(-27)}` : _id}
      </code>
    </button>
  );
}

export default RecordNode;
