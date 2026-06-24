// web/components/GraphViz.tsx
//
// Cross-graph subgraph viz (VIZ-02 / D-01..D-07) — d3-force, React-controlled SVG.
//
// Phase 11 D3 pivot: replaces the React Flow canvas with a d3-force simulation
// rendered as SVG. Nodes drift and settle (force-directed), are draggable, and
// links curve. The canvas pans (drag background), zooms (scroll / buttons), and
// fits-to-content on load. The honesty contract is inherited UNCHANGED from
// buildGraph.ts: each edge's `dash` (solid/dashed/dotted) is computed there and
// rendered as-is — a structural/hybrid edge can NEVER be drawn as a solid line.
//
// CARDINAL RULE: renders ONLY from the terminal grounded envelope's retrievalPath[].
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
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';
import type { Citation } from 'customer360-agent';

import { buildGraph, type VizNode } from './graph-viz/buildGraph';
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

const EMPTY_EDGE_COPY =
  'No traversed edges to draw for this answer — see the Path view for the records and queries.';

const WORLD_W = 760;
const HEIGHT = 600;
const RECORD_R = 30;
const QUESTION_W = 96;
const QUESTION_H = 44;
const MIN_K = 0.25;
const MAX_K = 4;

type Pos = { x: number; y: number };
type View = { x: number; y: number; k: number };
type SimNode = SimulationNodeDatum & VizNode;
type SimLink = SimulationLinkDatum<SimNode>;

export interface GraphVizProps {
  retrievalPath: RetrievalPathFragmentT[];
  citations?: Citation[];
  onOpenSource?: (citations: Citation[]) => void;
  className?: string;
  height?: number;
}

function curvedPath(s: Pos, t: Pos): string {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const curve = 0.14;
  return `M ${s.x} ${s.y} Q ${mx - dy * curve} ${my + dx * curve} ${t.x} ${t.y}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function GraphViz({
  retrievalPath,
  citations = [],
  onOpenSource,
  className,
  height = HEIGHT,
}: GraphVizProps) {
  // WR-05: read matchMedia in an effect (NOT useMemo) so server + first client render
  // agree (both false) — avoids a hydration mismatch for reduced-motion users.
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    setPrefersReducedMotion(
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
    );
  }, []);

  // CR-01: guard async d3 tick callbacks from setState-after-unmount.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const graph = React.useMemo(() => buildGraph(retrievalPath), [retrievalPath]);
  const hasEdges = graph.edges.length > 0;

  const settled = React.useMemo(
    () => layout(graph, { width: WORLD_W, height }),
    [graph, height],
  );

  // World-space node positions (mutated by the live sim + drag).
  const [positions, setPositions] = React.useState<Record<string, Pos>>(() => {
    const init: Record<string, Pos> = {};
    for (const n of settled.nodes) init[n.id] = { x: n.x, y: n.y };
    return init;
  });

  React.useEffect(() => {
    const next: Record<string, Pos> = {};
    for (const n of settled.nodes) next[n.id] = { x: n.x, y: n.y };
    setPositions(next);
  }, [settled]);

  // ── Measured viewport size (1 viewBox unit == 1px → trivial pointer math) ──
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: WORLD_W, h: height });
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0) setSize({ w: r.width, h: r.height || height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  // ── View transform (pan/zoom) ──────────────────────────────────────────────
  const [view, setView] = React.useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = React.useRef(view);
  viewRef.current = view;
  const userMoved = React.useRef(false);

  // Fit-to-content: map the settled node bounds into the viewport.
  const fitToContent = React.useCallback(() => {
    if (settled.nodes.length === 0) return;
    const xs = settled.nodes.map((n) => n.x);
    const ys = settled.nodes.map((n) => n.y);
    const pad = RECORD_R + 28;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const k = clamp(Math.min(size.w / cw, size.h / ch), MIN_K, MAX_K);
    const x = (size.w - (minX + maxX) * k) / 2;
    const y = (size.h - (minY + maxY) * k) / 2;
    setView({ x, y, k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, size.w, size.h]);

  // Auto-fit on new graph / first measure — unless the user has taken control.
  React.useEffect(() => {
    userMoved.current = false;
    fitToContent();
  }, [settled, fitToContent]);

  // ── Animated drift-and-settle (skipped under reduced-motion) ───────────────
  const simRef = React.useRef<Simulation<SimNode, SimLink> | null>(null);
  React.useEffect(() => {
    if (prefersReducedMotion || !hasEdges || typeof window === 'undefined') return;
    const cx = WORLD_W / 2;
    const cy = height / 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const simNodes: SimNode[] = graph.nodes.map((n, i) => ({
      ...n,
      x: cx + Math.cos(i * golden) * (40 + 26 * Math.sqrt(i)),
      y: cy + Math.sin(i * golden) * (40 + 26 * Math.sqrt(i)),
    }));
    const simLinks: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target }));
    // Origin-banded: structured LEFT, canonical_entities hub CENTER, unstructured
    // (+ question anchor) RIGHT — same_as edges fan into the hub from both sides.
    const bandX = (n: SimNode) =>
      n.graph === 'structured' ? WORLD_W * 0.2 : n.graph === 'bridge' ? WORLD_W * 0.5 : WORLD_W * 0.8;
    const sim = forceSimulation<SimNode>(simNodes)
      .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(90).strength(0.6))
      .force('charge', forceManyBody<SimNode>().strength(-340))
      .force('x', forceX<SimNode>(bandX).strength(0.22))
      .force('y', forceY<SimNode>(cy).strength(0.05))
      .force('collide', forceCollide<SimNode>(50))
      .on('tick', () => {
        if (!mountedRef.current) return; // CR-01: no setState after unmount
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

  // ── Per-node detail derived from the envelope (no DB fetch, no fabrication) ──
  const collOf = (id: string) => (id.includes('/') ? id.split('/')[0] : id);
  const ORIGIN_LABEL: Record<string, string> = {
    structured: 'Structured graph (CRM · Snowflake · DocuSign)',
    unstructured: 'Unstructured graph (Slack · docs · email)',
    bridge: 'Shared-entity hub (joins both graphs)',
  };

  // Connections incident to a node, as readable "{label} →/← {collection}" strings.
  const describeConnections = React.useCallback(
    (id: string): string[] =>
      graph.edges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => {
          const out = e.source === id;
          return `${e.label} ${out ? '→' : '←'} ${collOf(out ? e.target : e.source)}`;
        }),
    [graph],
  );

  // The retrieval query of the fragment that surfaced this node (if any).
  const queryForNode = React.useCallback(
    (id: string): string | undefined =>
      retrievalPath.find((f) => (f._ids ?? []).includes(id))?.query,
    [retrievalPath],
  );

  // ── Node → citations for the drawer. Real citation if present; otherwise a
  // synthesized entry enriched with the originating query (aql) + connections
  // (traversal) so EVERY node opens an informative drawer, not an empty one.
  const citationsForNode = React.useCallback(
    (node: VizNode): Citation[] => {
      const matches = citations.filter((c) => c._id === node.id);
      if (matches.length > 0) return matches;
      const conns = describeConnections(node.id);
      const query = queryForNode(node.id);
      return [
        {
          graph: node.graph === 'unstructured' ? 'unstructured' : 'structured',
          collection: node.collection,
          _id: node.id,
          aql: query ?? '— this node is a traversal endpoint; no standalone retrieval query —',
          traversal: conns.length ? `Connections: ${conns.join('; ')}` : undefined,
        },
      ];
    },
    [citations, describeConnections, queryForNode],
  );

  // ── Pointer → world-space conversion (accounts for pan/zoom) ───────────────
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const toWorld = React.useCallback((clientX: number, clientY: number): Pos => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return { x: (px - v.x) / v.k, y: (py - v.y) / v.k };
  }, []);

  // ── Node drag ──────────────────────────────────────────────────────────────
  const dragId = React.useRef<string | null>(null);
  // CR-02: distinguish a drag from a click. A pointerdown→up that moved past the
  // threshold is a DRAG and must NOT trigger the node's onClick (open-drawer).
  const downPt = React.useRef<{ x: number; y: number } | null>(null);
  const movedRef = React.useRef(false);
  const DRAG_THRESHOLD = 4; // px
  const onNodePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragId.current = id;
    downPt.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const sim = simRef.current;
    const p = toWorld(e.clientX, e.clientY);
    if (sim) {
      const n = sim.nodes().find((nn) => nn.id === id);
      if (n) { n.fx = p.x; n.fy = p.y; }
      sim.alphaTarget(0.3).restart();
    }
    setPositions((prev) => ({ ...prev, [id]: p }));
  };

  // ── Background pan ───────────────────────────────────────────────────────────
  const panning = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [isPanning, setIsPanning] = React.useState(false); // WR-03: drives the cursor
  const onBgPointerDown = (e: React.PointerEvent) => {
    panning.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    userMoved.current = true;
    setIsPanning(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    if (dragId.current) {
      const id = dragId.current;
      if (downPt.current) {
        const dx = e.clientX - downPt.current.x;
        const dy = e.clientY - downPt.current.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) movedRef.current = true;
      }
      const p = toWorld(e.clientX, e.clientY);
      const sim = simRef.current;
      if (sim) {
        const n = sim.nodes().find((nn) => nn.id === id);
        if (n) { n.fx = p.x; n.fy = p.y; }
      }
      setPositions((prev) => ({ ...prev, [id]: p }));
      return;
    }
    if (panning.current) {
      const p = panning.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
    }
  };

  const onSvgPointerUp = () => {
    if (dragId.current) {
      const sim = simRef.current;
      const n = sim?.nodes().find((nn) => nn.id === dragId.current);
      if (n) { n.fx = null; n.fy = null; }
      sim?.alphaTarget(0);
      dragId.current = null;
      downPt.current = null;
    }
    if (panning.current) {
      panning.current = null;
      setIsPanning(false);
    }
  };

  // ── Wheel zoom (zoom toward cursor) — native non-passive listener ──────────
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const k = clamp(v.k * factor, MIN_K, MAX_K);
      const ratio = k / v.k;
      userMoved.current = true;
      setView({ x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio, k });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [hasEdges]);

  // Zoom buttons (zoom around viewport center).
  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    const ratio = k / v.k;
    userMoved.current = true;
    setView({ x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio, k });
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

  const pos = (id: string): Pos => positions[id] ?? { x: WORLD_W / 2, y: height / 2 };

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      data-testid="graph-viz"
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      <TooltipProvider delayDuration={150}>
        <div
          ref={wrapRef}
          style={{ width: '100%', height, minHeight: 320 }}
          className={cn(
            'relative rounded-lg border border-border bg-background overflow-hidden',
            !prefersReducedMotion ? 'graph-viz-animate' : '',
          )}
        >
          {/* Zoom controls */}
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoomBy(1.25)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / 1.25)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Fit graph to view"
              onClick={fitToContent}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-xs text-foreground shadow-sm hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ⤢
            </button>
          </div>

          {/* Hint */}
          <span className="pointer-events-none absolute bottom-2 left-3 z-10 text-xs text-muted-foreground">
            Drag to pan · scroll to zoom · drag a node to move it
          </span>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.w} ${size.h}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Cross-graph retrieval subgraph"
            style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
            onPointerDown={onBgPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerUp}
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

            {/* Transparent pan surface (full viewport). */}
            <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />

            {/* Pan/zoom transform group — all world-space content lives here. */}
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {/* ── Edges (honesty: dash comes straight from buildGraph) ── */}
              <g data-testid="viz-edges">
                {graph.edges.map((e) => {
                  const d = curvedPath(pos(e.source), pos(e.target));
                  return (
                    <Tooltip key={e.id}>
                      <TooltipTrigger asChild>
                        <g data-viz-edge={e.id} data-kind={e.kind}>
                          <path
                            d={d}
                            fill="none"
                            stroke="var(--muted-foreground)"
                            strokeWidth={2}
                            strokeDasharray={e.dash}
                            strokeLinecap={e.linecap ?? 'butt'}
                            markerEnd="url(#viz-arrow)"
                          />
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
                      : n.graph === 'bridge'
                        ? 'var(--muted-foreground)'
                        : 'var(--graph-unstructured)';
                  const textFill =
                    n.graph === 'bridge'
                      ? 'var(--background)'
                      : n.graph === 'structured'
                        ? 'var(--graph-structured-foreground)'
                        : 'var(--graph-unstructured-foreground)';
                  // CR-02: a drag ends in a synthetic click — suppress it so dragging
                  // a node never opens the drawer. Only a genuine click (no move) opens it.
                  const onActivate = () => {
                    if (movedRef.current) {
                      movedRef.current = false;
                      return;
                    }
                    onOpenSource?.(citationsForNode(n));
                  };
                  const conns = describeConnections(n.id);
                  return (
                    <Tooltip key={n.id}>
                      <TooltipTrigger asChild>
                        <g
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
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[280px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold">{n.collection}</span>
                          <span className="text-xs opacity-80">
                            {ORIGIN_LABEL[n.graph ?? 'unstructured']}
                          </span>
                          <code className="block break-all font-mono text-xs opacity-90">{n.id}</code>
                          {conns.length > 0 && (
                            <span className="mt-0.5 text-xs">
                              {conns.length} connection{conns.length > 1 ? 's' : ''}:{' '}
                              {conns.slice(0, 4).join(', ')}
                              {conns.length > 4 ? '…' : ''}
                            </span>
                          )}
                          <span className="mt-0.5 text-xs italic opacity-70">
                            Click for the retrieval query &amp; full source
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </g>
            </g>
          </svg>
        </div>
      </TooltipProvider>

      {/* Orientation: tell the buyer what they're looking at. */}
      <p className="text-xs text-muted-foreground">
        Each node is a record the answer drew on; each edge is how the agent connected
        them across the two graphs. Hover a node for its identity, click it for the exact
        retrieval query and source.
      </p>

      {/* Node-origin legend (what the colors mean) + the edge-kind legend. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--graph-structured)' }} aria-hidden />
          Structured record (CRM · Snowflake · DocuSign)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--graph-unstructured)' }} aria-hidden />
          Unstructured record (Slack · docs · email)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--muted-foreground)' }} aria-hidden />
          Shared-entity hub (the cross-graph join)
        </span>
      </div>

      <EdgeLegend />
    </div>
  );
}

export default GraphViz;
