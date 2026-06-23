// web/components/graph-viz/layout.test.ts
//
// Pure unit tests for layout() — the dagre LR layout pass over {nodes, edges}.
// No canvas, no React, no DB.
//
// Covers:
//  - Empty graph returns without throwing
//  - Single node gets a numeric position
//  - Two-node + one-edge graph: both nodes get numeric non-overlapping positions
//  - Two-cluster + bridge fixture: no two nodes share identical coordinates (non-overlap)
//  - Deterministic: repeated calls on the same input produce the same positions

import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { layout } from './layout.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    data: {},
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('layout(): basic correctness', () => {
  it('empty graph returns without throwing', () => {
    expect(() => layout({ nodes: [], edges: [] })).not.toThrow();
    const { nodes, edges } = layout({ nodes: [], edges: [] });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('single node gets a numeric position', () => {
    const input = { nodes: [makeNode('A/1')], edges: [] };
    const { nodes } = layout(input);
    expect(nodes).toHaveLength(1);
    expect(typeof nodes[0].position.x).toBe('number');
    expect(typeof nodes[0].position.y).toBe('number');
  });

  it('two-node + one-edge graph: both nodes receive numeric positions', () => {
    const input = {
      nodes: [makeNode('A/1'), makeNode('B/2')],
      edges: [makeEdge('e1', 'A/1', 'B/2')],
    };
    const { nodes } = layout(input);
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(typeof n.position.x).toBe('number');
      expect(typeof n.position.y).toBe('number');
    }
  });

  it('two-cluster + bridge: no two nodes share exactly identical {x,y} (non-overlap)', () => {
    // Structured cluster (left): A, B; Unstructured cluster (right): C, D; bridge: A→C
    const input = {
      nodes: [makeNode('Account/a1'), makeNode('UsageMetric/u1'), makeNode('Chunk/c1'), makeNode('Document/d1')],
      edges: [
        makeEdge('e1', 'Account/a1', 'UsageMetric/u1'),
        makeEdge('e2', 'Chunk/c1', 'Document/d1'),
        makeEdge('bridge', 'UsageMetric/u1', 'Chunk/c1'),  // cross-graph bridge
      ],
    };
    const { nodes } = layout(input);
    expect(nodes).toHaveLength(4);
    // No two nodes at the exact same coordinates
    const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(nodes.length);
  });

  it('returns the same node count and edge count as input', () => {
    const input = {
      nodes: [makeNode('A/1'), makeNode('B/2'), makeNode('C/3')],
      edges: [makeEdge('e1', 'A/1', 'B/2'), makeEdge('e2', 'B/2', 'C/3')],
    };
    const { nodes, edges } = layout(input);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });
});

describe('layout(): determinism', () => {
  it('repeated calls on the same input produce identical positions (deterministic)', () => {
    const input = {
      nodes: [
        makeNode('Account/a1'),
        makeNode('UsageMetric/u1'),
        makeNode('Chunk/c1'),
        makeNode('Document/d1'),
        makeNode('question/current'),
      ],
      edges: [
        makeEdge('e1', 'Account/a1', 'UsageMetric/u1'),
        makeEdge('e2', 'Chunk/c1', 'Document/d1'),
        makeEdge('bridge', 'UsageMetric/u1', 'Chunk/c1'),
        makeEdge('hybrid', 'question/current', 'Chunk/c1'),
      ],
    };
    const run1 = layout(input);
    const run2 = layout(input);
    expect(run1.nodes.length).toBe(run2.nodes.length);
    for (let i = 0; i < run1.nodes.length; i++) {
      expect(run1.nodes[i].position.x).toBe(run2.nodes[i].position.x);
      expect(run1.nodes[i].position.y).toBe(run2.nodes[i].position.y);
    }
  });
});

describe('layout(): pure module (no React imports)', () => {
  it('layout() is importable and callable without a DOM/canvas environment', async () => {
    // This test itself proves the module runs in Node/vitest jsdom without a canvas.
    // If layout.ts imported any React Flow hook, vitest would throw at import time.
    const { layout: layoutFn } = await import('./layout.js');
    const result = layoutFn({ nodes: [makeNode('X/1')], edges: [] });
    expect(result.nodes).toHaveLength(1);
  });
});
