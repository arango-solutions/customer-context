// web/components/RetrievalPipeline.tsx
//
// EXPL-01 UI (D-02): the stepped, left→right, capability-labeled RETRIEVAL
// PIPELINE that REPLACES the d3-force GraphViz hairball under the answer.
//
// This is the buyer-facing payoff of GRAPH-03 + EXPL-01 — the "no black box, one
// database, one query language" moment:
//   - each stage is a card labeled by its retrieval MODE (vector+BM25 / cross-graph
//     join / graph traversal) connected left→right by arrows;
//   - each stage reveals its ACTUAL AQL on demand ("Show query" — the EXPL-01
//     reveal; collapsed by default so the query is a deliberate affordance, D-01);
//   - the cross-graph join is SPOTLIGHTED as the hero;
//   - clicking a stage opens the SAME rail-owned enriched SourceDrawer for that
//     stage's citations (records + chunk text + AQL, D-01).
//
// RENDER-ONLY (VIZ-02 LOCKED): all stage-derivation/conditionality lives in the
// PURE, already-tested `buildPipeline` transform (14-03). This component NEVER
// re-derives stage logic — no mode/edge-label conditionals live here; that all
// stays in buildPipeline. It maps buildPipeline's conditional PipelineStage[] to
// cards (read-only). A
// structured-only question renders ONLY the graph-traversal stage because
// buildPipeline emits only that stage — the honesty is data-driven, not a template.
//
// Token-driven (mirrors GraphViz): NO hardcoded hex. Spotlight emphasis uses
// brand CSS vars (--secondary / --accent / --primary). Honors prefers-reduced-motion.

'use client';

import * as React from 'react';
import { z } from 'zod';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import { RetrievalPathFragment } from 'customer360-agent';
import type { Citation } from 'customer360-agent';

import { buildPipeline, type PipelineStage } from './pipeline/buildPipeline';
import { cn } from '@/lib/utils';

type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;

const EMPTY_COPY =
  'No retrieval stages to show for this answer — see the Path view for the records and queries.';

export interface RetrievalPipelineProps {
  retrievalPath: RetrievalPathFragmentT[];
  citations?: Citation[];
  onOpenSource?: (citations: Citation[]) => void;
  className?: string;
}

// Human one-line description per mode (the stage subtitle under the label).
const SUBTITLE_BY_MODE: Record<PipelineStage['mode'], string> = {
  'vector+bm25': 'Hybrid lexical + semantic search over document chunks',
  'cross-graph-join': 'Joins the structured and unstructured graphs on shared entities',
  'graph-traversal': 'Named-graph traversal over the structured records',
};

/**
 * Build the Citation[] for a stage's owned _ids, mirroring the GraphViz lookup:
 * prefer the REAL envelope citation (it already carries aql + enriched detail);
 * otherwise synthesize a minimal citation from the stage so the drawer still
 * opens with the stage's AQL. The rail's `openSource` joins nodeDetails for the
 * synthesized ones, so the drawer shows records + chunk text + AQL (D-01).
 */
function citationsForStage(
  stage: PipelineStage,
  citations: Citation[],
): Citation[] {
  return stage.citationIds.map((id) => {
    const real = citations.find((c) => c._id === id);
    if (real) return real;
    // synthesized fallback — collection from the _id prefix, graph inferred from mode.
    const collection = id.includes('/') ? id.split('/')[0] : stage.collections[0] ?? id;
    const graph: Citation['graph'] =
      stage.mode === 'graph-traversal' ? 'structured' : 'unstructured';
    return { graph, collection, _id: id, aql: stage.aql };
  });
}

function StageCard({
  stage,
  citations,
  onOpenSource,
  isLast,
}: {
  stage: PipelineStage;
  citations: Citation[];
  onOpenSource?: (citations: Citation[]) => void;
  isLast: boolean;
}) {
  const [showQuery, setShowQuery] = React.useState(false);

  const open = () => onOpenSource?.(citationsForStage(stage, citations));

  return (
    <div className="flex items-stretch gap-2">
      <div
        data-testid="pipeline-stage"
        data-mode={stage.mode}
        data-spotlight={stage.spotlight ? 'true' : undefined}
        className={cn(
          'flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-4 transition-shadow',
          stage.spotlight
            ? 'border-accent bg-accent/10 shadow-md ring-2 ring-accent'
            : 'border-border bg-background',
        )}
      >
        {/* Hero badge for the spotlighted cross-graph join. */}
        {stage.spotlight ? (
          <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
            The cross-graph join
          </span>
        ) : null}

        {/* Clickable stage body → opens the shared drawer for this stage's citations. */}
        <div
          data-testid="pipeline-stage-open"
          role="button"
          tabIndex={0}
          aria-label={`Open sources for ${stage.label}`}
          className="flex cursor-pointer flex-col gap-1 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={open}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              open();
            }
          }}
        >
          <span className="text-sm font-semibold text-foreground">{stage.label}</span>
          <span className="text-xs text-muted-foreground">{SUBTITLE_BY_MODE[stage.mode]}</span>

          {/* D-03 collapse: documents matched (vector+bm25 only). */}
          {typeof stage.documentsMatched === 'number' ? (
            <span className="mt-0.5 text-xs font-medium text-foreground">
              {stage.documentsMatched} document{stage.documentsMatched === 1 ? '' : 's'} matched
            </span>
          ) : null}
        </div>

        {/* AQL on demand — collapsed by default (the deliberate EXPL-01 reveal). */}
        <div className="mt-auto">
          <button
            type="button"
            aria-expanded={showQuery}
            onClick={() => setShowQuery((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showQuery ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {showQuery ? 'Hide query' : 'Show query'}
          </button>
          {showQuery ? (
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-xs text-foreground">
              {stage.aql}
            </pre>
          ) : null}
        </div>
      </div>

      {/* Left→right connector arrow between stages. */}
      {!isLast ? (
        <div className="flex shrink-0 items-center" aria-hidden>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}

export function RetrievalPipeline({
  retrievalPath,
  citations = [],
  onOpenSource,
  className,
}: RetrievalPipelineProps) {
  // Render-only: ALL conditionality/derivation lives in the pure transform.
  const stages = React.useMemo(() => buildPipeline(retrievalPath), [retrievalPath]);

  if (stages.length === 0) {
    return (
      <div
        data-testid="pipeline-empty"
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-background p-6',
          className,
        )}
      >
        <p className="text-center text-sm text-muted-foreground">{EMPTY_COPY}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="retrieval-pipeline">
      <div className="flex flex-col gap-3 overflow-x-auto pb-1 lg:flex-row lg:items-stretch">
        {stages.map((stage, i) => (
          <StageCard
            key={stage.id}
            stage={stage}
            citations={citations}
            onOpenSource={onOpenSource}
            isLast={i === stages.length - 1}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Each stage is a real retrieval step the agent ran. Click a stage for the records it
        returned; “Show query” reveals the exact AQL — one database, one query language, no
        black box.
      </p>
    </div>
  );
}

export default RetrievalPipeline;
