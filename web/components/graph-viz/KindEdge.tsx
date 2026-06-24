// web/components/graph-viz/KindEdge.tsx
//
// Custom React Flow edge for the 3-kind stroke visual language (D-04, SC-1).
//
// Consumes buildGraph's kind→style mapping verbatim — does NOT re-derive kind.
// A structural/hybrid edge can NEVER be re-promoted to solid here because the
// style is set by buildGraph and consumed as-is (honesty invariant T-11-01).
//
// Stroke style: neutral var(--muted-foreground) + strokeDasharray from buildGraph.
// Color is NOT the primary edge discriminator (colorblind-safe; style carries meaning).
//
// Edge hover → Radix tooltip showing {label} · {collection} in mono (D-06 copy).

'use client';

import * as React from 'react';
import {
  getBezierPath,
  BaseEdge,
  type EdgeProps,
} from '@xyflow/react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type KindEdgeData = {
  kind: 'traversed' | 'structural' | 'hybrid';
  label: string;
  collection: string;
};

export function KindEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as KindEdgeData | undefined;
  const label = edgeData?.label ?? '';
  const collection = edgeData?.collection ?? '';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} id={id} />
      {/* Edge hover tooltip: show {label} · {collection} in mono (D-06) */}
      {label && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Invisible hit-target centered on the edge path */}
              <g transform={`translate(${labelX}, ${labelY})`}>
                <circle
                  r={8}
                  fill="transparent"
                  stroke="transparent"
                  aria-label={`${label} · ${collection}`}
                  role="img"
                />
              </g>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-mono text-sm">
                {label} · {collection}
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
}

export default KindEdge;
