// web/components/RetrievalPipeline.test.tsx
//
// RTL tests for RetrievalPipeline (EXPL-01 UI / D-02) — the stepped left→right
// capability-labeled pipeline that REPLACES the d3-force GraphViz hairball under
// the answer. The component is render-only over the PURE, already-tested
// `buildPipeline` transform (14-03); these tests assert the RENDER contract:
//
//  - ordering: vector+bm25 → cross-graph-join → graph-traversal (left→right)
//  - spotlight: the cross-graph-join stage carries data-spotlight="true"
//  - AQL-on-demand: the stage's real `aql` is hidden by default, revealed by the
//    "Show query" affordance (the EXPL-01 reveal — deliberate, not always-on)
//  - stage→drawer: clicking a stage calls onOpenSource with the Citation[] for
//    that stage's citationIds
//  - data-driven honesty: a structured-only envelope renders ONLY the
//    graph-traversal stage (no fabricated join/vector stage)
//  - D-03 collapse: the vector+bm25 stage shows "N documents matched"
//  - empty: an unrecognizable retrieval renders a graceful empty state

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { z } from 'zod';
import { RetrievalPathFragment } from 'customer360-agent';

import { RetrievalPipeline } from './RetrievalPipeline';

type RetrievalPathFragmentT = z.infer<typeof RetrievalPathFragment>;
type EdgeKind = 'traversed' | 'structural' | 'hybrid';

// ── Fixture builders (mirror buildPipeline.test.ts shapes) ───────────────────

function makeEdge(
  kind: EdgeKind,
  _from: string,
  _to: string,
  label: string,
  collection = 'customer360_Relations',
  _id: string | null = null,
) {
  return { _id, _from, _to, collection, kind, label };
}

function makeFragment(
  graph: 'structured' | 'unstructured',
  collection: string,
  _ids: string[],
  edges: ReturnType<typeof makeEdge>[] = [],
  query = 'Q_test',
): RetrievalPathFragmentT {
  return { graph, collection, _ids, query, edges };
}

const unstructuredFragment = (chunkToDoc: Record<string, string>, query = 'AQL_VECTOR_BM25') =>
  makeFragment(
    'unstructured',
    'customer360_Chunks',
    Object.keys(chunkToDoc),
    [
      ...Object.entries(chunkToDoc).map(([c, d], i) =>
        makeEdge('traversed', c, d, 'PART_OF', 'customer360_Relations', `rel/part_${i}`),
      ),
      ...Object.keys(chunkToDoc).map((c) => makeEdge('hybrid', 'question/current', c, 'hybrid', 'hybrid')),
    ],
    query,
  );

const structuredFragment = (query = 'AQL_HAS_USAGE') =>
  makeFragment(
    'structured',
    'UsageFact',
    ['UsageFact/u1', 'UsageFact/u2'],
    [
      makeEdge('traversed', 'Account/a1', 'UsageFact/u1', 'HAS_USAGE', 'customer360_structured', 'HAS_USAGE/e1'),
      makeEdge('traversed', 'Account/a1', 'UsageFact/u2', 'HAS_USAGE', 'customer360_structured', 'HAS_USAGE/e2'),
    ],
    query,
  );

const crossGraphFragment = (query = 'AQL_SAME_AS_JOIN') =>
  makeFragment(
    'unstructured',
    'same_as',
    ['customer360_Documents/d9'],
    [
      makeEdge('traversed', 'canonical_entities/h1', 'customer360_Entities/k1', 'same_as', 'same_as', 'same_as/e1'),
      makeEdge('traversed', 'customer360_Entities/k1', 'customer360_Chunks/c9', 'MENTIONED_IN', 'customer360_Relations', 'rel/men1'),
      makeEdge('traversed', 'customer360_Chunks/c9', 'customer360_Documents/d9', 'PART_OF', 'customer360_Relations', 'rel/part9'),
    ],
    query,
  );

// A full tri-stage envelope (scrambled input order to prove ordering is stable).
const dualEnvelope = () => {
  const u = unstructuredFragment(
    {
      'customer360_Chunks/c1': 'customer360_Documents/d1',
      'customer360_Chunks/c2': 'customer360_Documents/d1',
      'customer360_Chunks/c3': 'customer360_Documents/d2',
    },
    'AQL_VECTOR_BM25',
  );
  const s = structuredFragment('AQL_HAS_USAGE');
  const j = crossGraphFragment('AQL_SAME_AS_JOIN');
  return [s, u, j];
};

// ── Ordering ─────────────────────────────────────────────────────────────────

describe('RetrievalPipeline – stage ordering (D-02 left→right)', () => {
  it('renders three stages in vector+bm25 → cross-graph-join → graph-traversal order', () => {
    render(<RetrievalPipeline retrievalPath={dualEnvelope()} citations={[]} onOpenSource={vi.fn()} />);
    const stages = screen.getAllByTestId('pipeline-stage');
    expect(stages).toHaveLength(3);
    const modes = stages.map((s) => s.getAttribute('data-mode'));
    expect(modes).toEqual(['vector+bm25', 'cross-graph-join', 'graph-traversal']);
  });

  it('shows each capability label', () => {
    render(<RetrievalPipeline retrievalPath={dualEnvelope()} citations={[]} onOpenSource={vi.fn()} />);
    expect(screen.getByText(/Vector \+ BM25/i)).toBeInTheDocument();
    expect(screen.getByText(/Cross-graph join/i)).toBeInTheDocument();
    expect(screen.getByText(/Graph traversal/i)).toBeInTheDocument();
  });
});

// ── Spotlight (the hero) ──────────────────────────────────────────────────────

describe('RetrievalPipeline – cross-graph-join spotlight (hero)', () => {
  it('marks the cross-graph-join stage with data-spotlight="true"', () => {
    render(<RetrievalPipeline retrievalPath={dualEnvelope()} citations={[]} onOpenSource={vi.fn()} />);
    const stages = screen.getAllByTestId('pipeline-stage');
    const join = stages.find((s) => s.getAttribute('data-mode') === 'cross-graph-join');
    expect(join).toBeDefined();
    expect(join?.getAttribute('data-spotlight')).toBe('true');
    // non-hero stages are NOT spotlit
    const trav = stages.find((s) => s.getAttribute('data-mode') === 'graph-traversal');
    expect(trav?.getAttribute('data-spotlight')).not.toBe('true');
  });
});

// ── AQL-on-demand (the EXPL-01 reveal) ────────────────────────────────────────

describe('RetrievalPipeline – AQL reveal on demand', () => {
  it('hides the AQL by default and reveals it via the Show query affordance', () => {
    render(
      <RetrievalPipeline
        retrievalPath={[structuredFragment('AQL_HAS_USAGE_SECRET')]}
        citations={[]}
        onOpenSource={vi.fn()}
      />,
    );
    // hidden by default
    expect(screen.queryByText('AQL_HAS_USAGE_SECRET')).not.toBeInTheDocument();
    // reveal
    const toggle = screen.getByRole('button', { name: /show query/i });
    fireEvent.click(toggle);
    expect(screen.getByText('AQL_HAS_USAGE_SECRET')).toBeInTheDocument();
  });
});

// ── Stage → drawer ─────────────────────────────────────────────────────────────

describe('RetrievalPipeline – stage click opens the shared drawer', () => {
  it('calls onOpenSource with the Citation[] for the stage citationIds', () => {
    const onOpenSource = vi.fn();
    const s = structuredFragment('AQL_HAS_USAGE');
    render(<RetrievalPipeline retrievalPath={[s]} citations={[]} onOpenSource={onOpenSource} />);
    const stage = screen.getByTestId('pipeline-stage');
    // activate the stage body (not the Show query toggle)
    fireEvent.click(within(stage).getByTestId('pipeline-stage-open'));
    expect(onOpenSource).toHaveBeenCalledTimes(1);
    const passed = onOpenSource.mock.calls[0][0] as Array<{ _id: string }>;
    expect(passed.map((c) => c._id).sort()).toEqual([...s._ids].sort());
  });

  it('Enter on a stage also opens the drawer', () => {
    const onOpenSource = vi.fn();
    const s = structuredFragment('AQL_HAS_USAGE');
    render(<RetrievalPipeline retrievalPath={[s]} citations={[]} onOpenSource={onOpenSource} />);
    const open = within(screen.getByTestId('pipeline-stage')).getByTestId('pipeline-stage-open');
    fireEvent.keyDown(open, { key: 'Enter' });
    expect(onOpenSource).toHaveBeenCalledTimes(1);
  });

  it('prefers a real envelope Citation (carrying aql/text) over a synthesized one', () => {
    const onOpenSource = vi.fn();
    const s = structuredFragment('AQL_HAS_USAGE');
    const realCitation = {
      graph: 'structured' as const,
      collection: 'UsageFact',
      _id: 'UsageFact/u1',
      aql: 'REAL_AQL',
      text: 'real record body',
    };
    render(
      <RetrievalPipeline retrievalPath={[s]} citations={[realCitation]} onOpenSource={onOpenSource} />,
    );
    fireEvent.click(within(screen.getByTestId('pipeline-stage')).getByTestId('pipeline-stage-open'));
    const passed = onOpenSource.mock.calls[0][0] as Array<{ _id: string; text?: string }>;
    const u1 = passed.find((c) => c._id === 'UsageFact/u1');
    expect(u1?.text).toBe('real record body');
  });
});

// ── Data-driven honesty (no fabricated stages) ───────────────────────────────

describe('RetrievalPipeline – data-driven conditionality (honesty)', () => {
  it('a structured-only envelope renders ONLY the graph-traversal stage', () => {
    render(
      <RetrievalPipeline retrievalPath={[structuredFragment()]} citations={[]} onOpenSource={vi.fn()} />,
    );
    const stages = screen.getAllByTestId('pipeline-stage');
    expect(stages).toHaveLength(1);
    expect(stages[0].getAttribute('data-mode')).toBe('graph-traversal');
    // no join / vector stage fabricated
    expect(screen.queryByText(/Cross-graph join/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vector \+ BM25/i)).not.toBeInTheDocument();
  });
});

// ── D-03 collapse ──────────────────────────────────────────────────────────────

describe('RetrievalPipeline – D-03 documents-matched', () => {
  it('shows "N documents matched" using documentsMatched on the vector+bm25 stage', () => {
    const u = unstructuredFragment({
      'customer360_Chunks/c1': 'customer360_Documents/d1',
      'customer360_Chunks/c2': 'customer360_Documents/d1',
      'customer360_Chunks/c3': 'customer360_Documents/d2',
    });
    render(<RetrievalPipeline retrievalPath={[u]} citations={[]} onOpenSource={vi.fn()} />);
    // 3 chunks → 2 distinct documents
    expect(screen.getByText(/2 documents matched/i)).toBeInTheDocument();
  });
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe('RetrievalPipeline – graceful empty state', () => {
  it('renders an empty state (no fabricated stages) when no recognizable retrieval', () => {
    // an account-anchor (structural-only) fragment yields zero stages
    const anchor = makeFragment('structured', 'Account', ['Account/a1'], [], 'FOR a IN Account');
    render(<RetrievalPipeline retrievalPath={[anchor]} citations={[]} onOpenSource={vi.fn()} />);
    expect(screen.queryByTestId('pipeline-stage')).not.toBeInTheDocument();
    expect(screen.getByTestId('pipeline-empty')).toBeInTheDocument();
  });
});
