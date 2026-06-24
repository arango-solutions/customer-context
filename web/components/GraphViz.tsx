// web/components/GraphViz.tsx
//
// Cross-graph subgraph viz (VIZ-02 / D-01..D-07) — d3-force, React-controlled SVG.
//
// Phase 11 D3 pivot: replaces the React Flow canvas with a d3-force simulation
// rendered as SVG. Nodes drift and settle (force-directed), are draggable, and
// links curve. The honesty contract is inherited UNCHANGED from buildGraph.ts:
// each edge's `dash` (solid/dashed/dotted) is computed there and rendered as-is —
// a structural/hybrid edge can NEVER be drawn as a solid (real-traversal) line.
//
// CARDINAL RULE: renders ONLY from the terminal grounded envelope's retrievalPath[].
// Never re-queries the DB or invents edges.
//
// Token-driven: node fill is var(--graph-structured)/var(--graph-unstructured),
// edge stroke is var(--muted-foreground), question anchor is var(--secondary).
// NO hardcoded hex.
//
//  - Node click / Enter / Space → onOpenSource(citations for that node's _id)
//  - Edge hover → tooltip {label} · {collection}
//  - prefers-reduced-motion → no animated settle (static deterministic layout)

'use client';

import * as React from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import type { Citation } from 'customer360-agent';

import { buildGraph, type VizNode, type VizEdge } from './graph-viz/buildGraph';
import { layout } from './graph-viz/layout';
import { EdgeLegend } from './graph-viz/EdgeLegend';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

// ── Locked empty-state copy from UI-SPEC Copywriting ─────────────────────────
const EMPTY_EDGE_COPY =
  'No traversed edges to draw for this answer — see the Path view for the records and queries.';

const WIDTH = 760;
const HEIGHT = 600;
const RECORD_R = 30;
const QUESTION_W = 96;
const QUESTION_H = 44;

type Pos = { x: number; y: number };
type SimNode = SimulationNodeDatum & VizNode;
type SimLink = SimulationLinkDatum<SimNode>;

export interface GraphVizProps {
  retrievalPath: RetrievalPathFragmentT[];
  /** Envelope citations — used to resolve a node's _id → its source for the drawer. */
  citations?: Citation[];
  onOpenSource?: (citations: Citation[]) => void;
  className?: string;
  /** Canvas height in px (default 600). */
  height?: number;
}

/** Curved quadratic path between two points (organic link look). */
function curvedPath(s: Pos, t: Pos): { d: string; mid: Pos } {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  // Perpendicular offset for a gentle curve (deterministic).
  const curve = 0.14;
  const cx = mx - dy * curve;
  const cy = my + dx * curve;
  return { d: `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`, mid: { x: cx, y: cy } };
}

export function GraphViz({
  retrievalPath,
  citations = [],
  onOpenSource,
  className,
  height = HEIGHT,
}: GraphVizProps) {
  const prefersReducedMotion = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  // ── Build the engine-neutral graph (SC-2 data-driven) ─────────────────────
  const graph = React.useMemo(() => buildGraph(retrievalPath), [retrievalPath]);
  const hasEdges = graph.edges.length > 0;

  // ── Deterministic settled layout — first paint, SSR, tests, reduced-motion ─
  const settled = React.useMemo(
    () => layout(graph, { width: WIDTH, height }),
    [graph, height],
  );

  const [positions, setPositions] = React.useState<Record<string, Pos>>(() => {
    const init: Record<string, Pos> = {};
    for (const n of settled.nodes) init[n.id] = { x: n.x, y: n.y };
    return init;
  });

  // Reset positions whenever the graph changes.
  React.useEffect(() => {
    const next: Record<string, Pos> = {};
    for (const n of settled.nodes) next[n.id] = { x: n.x, y: n.y };
    setPositions(next);
  }, [settled]);

  // ── Animated drift-and-settle simulation (skipped under reduced-motion) ────
  const simRef = React.useRef<Simulation<SimNode, SimLink> | null>(null);
  React.useEffect(() => {
    if (prefersReducedMotion || !hasEdges || typeof window === 'undefined') return;

    // Seed from a deterministic spread so the settle is visible.
    const cx = WIDTH / 2;
    const cy = height / 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const simNodes: SimNode[] = graph.nodes.map((n, i) => ({
      ...n,
      x: cx + Math.cos(i * golden) * (40 + 26 * Math.sqrt(i)),
      y: cy + Math.sin(i * golden) * (40 + 26 * Math.sqrt(i)),
    }));
    const simLinks: SimLink[] = graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
    }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(150).strength(0.6),
      )
      .force('charge', forceManyBody<SimNode>().strength(-540))
      .force('center', forceCenter(cx, cy))
      .force('collide', forceCollide<SimNode>(60))
      .on('tick', () => {
        const next: Record<string, Pos> = {};
        for (const n of simNodes) next[n.id] = { x: n.x ?? cx, y: n.y ?? cy };
        setPositions(next);
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [graph, hasEdges, prefersReducedMotion, height]);

  // ── Node → citations resolver (fixes the empty-drawer bug) ─────────────────
  const citationsForNode = React.useCallback(
    (node: VizNode): Citation[] => {
      const matches = citations.filter((c) => c._id === node.id);
      if (matches.length > 0) return matches;
      // Fallback: synthesize a minimal citation so the drawer still shows the _id.
      const graphOrigin = node.graph === 'structured' ? 'structured' : 'unstructured';
      return [
        {
          graph: graphOrigin,
          collection: node.collection,
          _id: node.id,
          aql: '',
        },
      ];
    },
    [citations],
  );

  // ── Drag handling (pointer events; pins during drag, releases after) ───────
  const dragId = React.useRef<string | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const toSvgPoint = React.useCallback((clientX: number, clientY: number): Pos => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / (rect.width || WIDTH);
    const scaleY = height / (rect.height || height);
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }, [height]);

  const onNodePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragId.current = id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const sim = simRef.current;
    const p = toSvgPoint(e.clientX, e.clientY);
    if (sim) {
      const n = sim.nodes().find((nn) => nn.id === id);
      if (n) { n.fx = p.x; n.fy = p.y; }
      sim.alphaTarget(0.3).restart();
    }
    setPositions((prev) => ({ ...prev, [id]: p }));
  };

  const onNodePointerMove = (e: React.PointerEvent) => {
    if (!dragId.current) return;
    const id = dragId.current;
    const p = toSvgPoint(e.clientX, e.clientY);
    const sim = simRef.current;
    if (sim) {
      const n = sim.nodes().find((nn) => nn.id === id);
      if (n) { n.fx = p.x; n.fy = p.y; }
    }
    setPositions((prev) => ({ ...prev, [id]: p }));
  };

  const onNodePointerUp = (e: React.PointerEvent) => {
    const id = dragId.current;
    dragId.current = null;
    const sim = simRef.current;
    if (sim && id) {
      const n = sim.nodes().find((nn) => nn.id === id);
      if (n) { n.fx = null; n.fy = null; }
      sim.alphaTarget(0);
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasEdges) {
    return (
      <div className={cn('flex flex-col gap-3', className)} data-testid="graph-viz">
        <div
          style={{ width: '100%', height, minHeight: 320 }}
          className="flex items-center justify-center rounded-lg border border-border bg-background p-6"
        >
          <p className="text-center text-sm text-muted-foreground">{EMPTY_EDGE_COPY}</p>
        </div>
        <EdgeLegend />
      </div>
    );
  }

  const pos = (id: string): Pos => positions[id] ?? { x: WIDTH / 2, y: height / 2 };

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      data-testid="graph-viz"
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      <TooltipProvider delayDuration={150}>
        <div
          style={{ width: '100%', height, minHeight: 320 }}
          className={cn(
            'rounded-lg border border-border bg-background overflow-hidden',
            !prefersReducedMotion ? 'graph-viz-animate' : '',
          )}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${height}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Cross-graph retrieval subgraph"
            onPointerMove={onNodePointerMove}
            onPointerUp={onNodePointerUp}
            onPointerLeave={onNodePointerUp}
          >
            <defs>
              <marker
                id="viz-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
              </marker>
            </defs>

            {/* ── Edges (honesty: dash comes straight from buildGraph) ── */}
            <g data-testid="viz-edges">
              {graph.edges.map((e) => {
                const s = pos(e.source);
                const t = pos(e.target);
                const { d } = curvedPath(s, t);
                return (
                  <Tooltip key={e.id}>
                    <TooltipTrigger asChild>
                      <g data-viz-edge={e.id} data-kind={e.kind}>
                        {/* Visible stroke — style is the honest discriminator. */}
                        <path
                          d={d}
                          fill="none"
                          stroke="var(--muted-foreground)"
                          strokeWidth={2}
                          strokeDasharray={e.dash}
                          strokeLinecap={e.linecap ?? 'butt'}
                          markerEnd="url(#viz-arrow)"
                        />
                        {/* Invisible fat hit-target for hover/tooltip. */}
                        <path
                          d={d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={14}
                          aria-label={`${e.label} · ${e.collection}`}
                        />
                      </g>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-mono text-sm">
                        {e.label} · {e.collection}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </g>

            {/* ── Nodes ── */}
            <g data-testid="viz-nodes">
              {settled.nodes.map((n) => {
                const p = pos(n.id);
                if (n.type === 'question') {
                  return (
                    <g
                      key={n.id}
                      data-viz-node={n.id}
                      transform={`translate(${p.x}, ${p.y})`}
                      role="img"
                      aria-label="Question — where retrieval started"
                    >
                      <rect
                        x={-QUESTION_W / 2}
                        y={-QUESTION_H / 2}
                        width={QUESTION_W}
                        height={QUESTION_H}
                        rx={QUESTION_H / 2}
                        fill="var(--secondary)"
                        stroke="var(--border)"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-xs font-semibold"
                        fill="var(--secondary-foreground)"
                      >
                        Question
                      </text>
                    </g>
                  );
                }
                const fill =
                  n.graph === 'structured'
                    ? 'var(--graph-structured)'
                    : 'var(--graph-unstructured)';
                const textFill =
                  n.graph === 'structured'
                    ? 'var(--graph-structured-foreground)'
                    : 'var(--graph-unstructured-foreground)';
                const onActivate = () => onOpenSource?.(citationsForNode(n));
                return (
                  <g
                    key={n.id}
                    data-viz-node={n.id}
                    data-graph={n.graph ?? 'unstructured'}
                    transform={`translate(${p.x}, ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open source — ${n.graph ?? 'unstructured'} · ${n.collection} · ${n.id}`}
                    style={{ cursor: 'grab' }}
                    onPointerDown={onNodePointerDown(n.id)}
                    onClick={onActivate}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        onActivate();
                      }
                    }}
                  >
                    <circle r={RECORD_R} fill={fill} stroke="var(--background)" strokeWidth={2} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="text-[11px] font-semibold"
                      fill={textFill}
                      pointerEvents="none"
                    >
                      {n.collection.length > 9 ? `${n.collection.slice(0, 8)}…` : n.collection}
                    </text>
                    {/* Full collection label below the node for legibility. */}
                    <text
                      y={RECORD_R + 14}
                      textAnchor="middle"
                      className="text-xs"
                      fill="var(--foreground)"
                      pointerEvents="none"
                    >
                      {n.collection}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </TooltipProvider>

      {/* EdgeLegend — always-visible (D-04, not hover-gated) */}
      <EdgeLegend />
    </div>
  );
}

export default GraphViz;
