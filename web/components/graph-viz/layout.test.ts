// web/components/graph-viz/layout.test.ts
//
// Pure unit tests for layout() — the d3-force pass over an engine-neutral VizGraph.
// No React, no DOM. Deterministic (d3-force uses no RNG and a fixed iteration count).

import { describe, it, expect } from 'vitest';
import { buildGraph } from './buildGraph.js';
import { layout } from './layout.js';

function frag(graph: 'structured' | 'unstructured', collection: string, ids: string[], edges: {
  _id: string | null; _from: string; _to: string; collection: string;
  kind: 'traversed' | 'structural' | 'hybrid'; label: string;
}[]) {
  return { graph, collection, _ids: ids, query: 'Q', edges };
}

describe('layout: d3-force positioning', () => {
  it('empty graph returns empty nodes without throwing', () => {
    expect(() => layout({ nodes: [], edges: [] })).not.toThrow();
    const out = layout({ nodes: [], edges: [] });
    expect(out.nodes).toEqual([]);
  });

  it('assigns finite numeric x/y to every node', () => {
    const g = buildGraph([
      frag('unstructured', 'Chunk', ['Chunk/c1'], [
        { _id: 'rel/e1', _from: 'Chunk/c1', _to: 'Document/d1', collection: 'rel', kind: 'traversed', label: 'PART_OF' },
        { _id: null, _from: 'question/current', _to: 'Chunk/c1', collection: 'sim', kind: 'hybrid', label: 'hybrid' },
      ]),
    ]);
    const { nodes } = layout(g);
    expect(nodes.length).toBe(g.nodes.length);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('no two nodes share identical coordinates (non-overlap) for a two-cluster + bridge graph', () => {
    const g = buildGraph([
      frag('structured', 'UsageMetric', ['UsageMetric/u1'], [
        { _id: null, _from: 'Account/a1', _to: 'UsageMetric/u1', collection: 'acc', kind: 'structural', label: 'account' },
      ]),
      frag('unstructured', 'Chunk', ['Chunk/c1'], [
        { _id: 'rel/e1', _from: 'Chunk/c1', _to: 'Document/d1', collection: 'rel', kind: 'traversed', label: 'PART_OF' },
        { _id: 's1', _from: 'UsageMetric/u1', _to: 'Chunk/c1', collection: 'bridge', kind: 'traversed', label: 'same_as' },
      ]),
    ]);
    const { nodes } = layout(g);
    const coords = nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`);
    expect(new Set(coords).size).toBe(coords.length);
  });

  it('is deterministic across repeated calls on the same input', () => {
    const g = buildGraph([
      frag('unstructured', 'Chunk', ['Chunk/c1', 'Chunk/c2'], [
        { _id: 'rel/e1', _from: 'Chunk/c1', _to: 'Document/d1', collection: 'rel', kind: 'traversed', label: 'PART_OF' },
        { _id: 'rel/e2', _from: 'Chunk/c2', _to: 'Document/d1', collection: 'rel', kind: 'traversed', label: 'PART_OF' },
      ]),
    ]);
    const a = layout(g);
    const b = layout(g);
    expect(a.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])).toEqual(
      b.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]),
    );
  });

  it('passes edges through unchanged', () => {
    const g = buildGraph([
      frag('unstructured', 'Chunk', ['Chunk/c1'], [
        { _id: 'rel/e1', _from: 'Chunk/c1', _to: 'Document/d1', collection: 'rel', kind: 'traversed', label: 'PART_OF' },
      ]),
    ]);
    const { edges } = layout(g);
    expect(edges).toEqual(g.edges);
  });
});
