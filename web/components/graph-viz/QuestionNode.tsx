// web/components/graph-viz/QuestionNode.tsx
//
// The synthetic "Question" anchor node (D-02).
//
// Represents where hybrid retrieval started — a pill with --secondary fill and
// --foreground text. Hybrid edges fan OUT from this node to retrieved chunks.
//
// Styled to read as a "match" anchor, never a traversal node (D-02 design intent).
// No click handler — it is a synthetic node, not a real record (no source to open).
//
// Analog: GraphBadge.tsx (tiny presentational pill, token-driven).

'use client';

import * as React from 'react';
import { type NodeProps } from '@xyflow/react';

export function QuestionNode({ data }: NodeProps) {
  const label = (data as { label?: string }).label ?? 'Question';

  return (
    <div
      className="flex min-h-[44px] min-w-[80px] items-center justify-center rounded-full px-4 py-2"
      style={{
        backgroundColor: 'var(--secondary)',
        color: 'var(--foreground)',
        border: '2px solid var(--border)',
      }}
      role="presentation"
      aria-label="Question anchor — where hybrid retrieval started"
    >
      <span className="text-sm font-semibold leading-tight">
        {label}
      </span>
    </div>
  );
}

export default QuestionNode;
