// web/components/GraphViz.tsx
//
// React Flow canvas rendering the cross-graph subgraph (VIZ-02 / D-01..D-07).
//
// CARDINAL RULE: renders ONLY from the terminal grounded envelope's retrievalPath[].
// Never re-queries the DB or invents edges. The honesty contract flows from
// buildGraph.ts (Plan 01) through layout.ts through this canvas.
//
// Behavior:
//  - useMemo: layout(buildGraph(retrievalPath)) — reactive on retrievalPath only
//  - nodeTypes: { record: RecordNode, super: SuperNode, question: QuestionNode }
//  - edgeTypes: { kind: KindEdge }
//  - EdgeLegend always-visible in the canvas panel
//  - Node click → onOpenSource (shared SourceDrawer handle, same as AnswerBody)
//  - Edge hover → tooltip in KindEdge (label · collection)
//  - Empty/no-edge state: locked copy from UI-SPEC Copywriting
//  - D-07 reveal: fade-in gate behind prefers-reduced-motion: no-preference (Pitfall 4)
//
// REQUIRED by RESEARCH Pattern 1:
//  1. 'use client' — React Flow uses DOM measurement + ResizeObserver
//  2. import '@xyflow/react/dist/style.css' — mandatory base styles
//  3. ReactFlowProvider — needed if sub-components call useReactFlow
//  4. Explicit container height (420px default / 320px min) — blank-canvas guard Pitfall 1
//
// No hardcoded graph hex — colors flow through CSS vars (--graph-structured /
// --graph-unstructured / --muted-foreground). Tokens live in globals.css.

'use client';

import '@xyflow/react/dist/style.css';

import * as React from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
} from '@xyflow/react';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import type { Citation } from 'customer360-agent';

import { buildGraph } from './graph-viz/buildGraph';
import { layout } from './graph-viz/layout';
import { KindEdge } from './graph-viz/KindEdge';
import { RecordNode } from './graph-viz/RecordNode';
import { SuperNode } from './graph-viz/SuperNode';
import { QuestionNode } from './graph-viz/QuestionNode';
import { EdgeLegend } from './graph-viz/EdgeLegend';
import { cn } from '@/lib/utils';

// ── Type derivation — schema-derived (PATTERNS shared pattern) ───────────────
type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

// ── Node/edge type registrations — defined OUTSIDE component to avoid re-render
// (RESEARCH Pattern 1 best practice: stable references)
const nodeTypes = {
  record: RecordNode,
  super: SuperNode,
  question: QuestionNode,
} as const;

const edgeTypes = {
  kind: KindEdge,
} as const;

// ── Locked empty-state copy from UI-SPEC Copywriting ─────────────────────────
const EMPTY_EDGE_COPY =
  'No traversed edges to draw for this answer — see the Path view for the records and queries.';

export interface GraphVizProps {
  retrievalPath: RetrievalPathFragmentT[];
  onOpenSource?: (citations: Citation[]) => void;
  className?: string;
}

// ── Inner component (has access to ReactFlowProvider context) ─────────────────
function GraphVizInner({
  retrievalPath,
  onOpenSource,
  className,
}: GraphVizProps) {
  // D-07 reveal animation: check prefers-reduced-motion at mount (Pitfall 4)
  const prefersReducedMotion = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  // ── Build + layout graph from retrievalPath (SC-2 data-driven) ───────────
  const { nodes: baseNodes, edges } = React.useMemo(
    () => layout(buildGraph(retrievalPath)),
    [retrievalPath],
  );

  // ── Wire onOpenSource into RecordNode/SuperNode data ──────────────────────
  // React Flow passes node.data to nodeType components; inject the callback here.
  const nodes = React.useMemo(
    () =>
      baseNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          // RecordNode uses onOpenSource; citations derived from node _id
          onOpenSource: onOpenSource
            ? (citations: Citation[]) => onOpenSource(citations)
            : undefined,
        },
      })),
    [baseNodes, onOpenSource],
  );

  // ── Empty edge state ──────────────────────────────────────────────────────
  const hasEdges = edges.length > 0;

  // ── useReactFlow for programmatic fitView after mount ────────────────────
  // (Available because we're inside ReactFlowProvider)
  const { fitView } = useReactFlow();

  React.useEffect(() => {
    if (hasEdges) {
      // Small timeout lets React Flow finish rendering before fitting
      const timer = setTimeout(() => { fitView({ duration: prefersReducedMotion ? 0 : 200 }); }, 10);
      return () => clearTimeout(timer);
    }
  }, [hasEdges, fitView, prefersReducedMotion]);

  return (
    <div
      className={cn('relative flex flex-col gap-2', className)}
    >
      {/* Canvas container — EXPLICIT height (Pitfall 1, UI-SPEC: 420px default / 320px min) */}
      <div
        style={{ width: '100%', height: 420, minHeight: 320 }}
        className={cn(
          'rounded-md border border-border overflow-hidden bg-background',
          // D-07 reveal animation: only under no-preference (Pitfall 4)
          !prefersReducedMotion && hasEdges ? 'graph-viz-animate' : '',
        )}
      >
        {hasEdges ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            fitView={false}
            proOptions={{ hideAttribution: false }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          /* Empty/edge-light state — locked copy from UI-SPEC Copywriting */
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-center text-sm text-muted-foreground">
              {EMPTY_EDGE_COPY}
            </p>
          </div>
        )}
      </div>

      {/* EdgeLegend — always-visible (D-04, not hover-gated) */}
      <EdgeLegend />
    </div>
  );
}

// ── Exported wrapper — provides ReactFlowProvider context ─────────────────────
export function GraphViz(props: GraphVizProps) {
  return (
    <ReactFlowProvider>
      <GraphVizInner {...props} />
    </ReactFlowProvider>
  );
}

export default GraphViz;
