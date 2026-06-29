// web/components/GraphViz.test.tsx
//
// RTL tests for GraphViz (VIZ-02 / D-01..D-07) — d3-force SVG renderer.
//
// Coverage:
//  - Legend always-visible with all 3 locked legend strings (D-04)
//  - Honesty at RENDER: structural/hybrid edge paths carry stroke-dasharray;
//    traversed paths do not (SC-1, the load-bearing visual invariant)
//  - Node click → onOpenSource fires with the node's matching citation (D-06)
//  - Edge carries an accessible {label} · {collection} hit-target (D-06)
//  - Reduced-motion → no animation class (Pitfall 4)
//  - Empty/edge-light state → locked empty copy (no-edge case)
//  - No hardcoded hex in inline styles (token-not-hex)
//  - Explicit container height (blank-canvas guard)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { GraphViz } from './GraphViz';
import { EDGES_ENVELOPE, GROUNDED_ENVELOPE } from '../test/fixtures';

function mockReducedMotion(active: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: active && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => mockReducedMotion(false));

// ── Legend ───────────────────────────────────────────────────────────────────

describe('GraphViz – EdgeLegend always-visible', () => {
  it('renders all three locked legend strings', () => {
    render(<GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />);
    expect(screen.getByText(/Traversed \(PART_OF \/ same_as\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Structural \(account-induced\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Hybrid match \(vector \+ BM25\)/i)).toBeInTheDocument();
  });
});

// ── Honesty at render (SC-1) ─────────────────────────────────────────────────

describe('GraphViz – honesty invariant rendered (SC-1)', () => {
  it('structural/hybrid edge paths carry a stroke-dasharray; traversed do not', () => {
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    const edgeGroups = Array.from(container.querySelectorAll('[data-viz-edge]'));
    expect(edgeGroups.length).toBeGreaterThan(0);

    for (const g of edgeGroups) {
      const kind = g.getAttribute('data-kind');
      // The first <path> is the visible stroke (the second is the transparent hit-target).
      const visible = g.querySelector('path');
      const dash = visible?.getAttribute('stroke-dasharray');
      if (kind === 'traversed') {
        expect(dash == null || dash === '').toBe(true); // solid
      } else {
        expect(dash != null && dash !== '').toBe(true); // dashed/dotted — never solid
      }
    }
  });

  it('renders at least one edge of each kind for the dual-graph fixture', () => {
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    const kinds = new Set(
      Array.from(container.querySelectorAll('[data-viz-edge]')).map((g) =>
        g.getAttribute('data-kind'),
      ),
    );
    expect(kinds.has('traversed')).toBe(true);
    expect(kinds.has('structural')).toBe(true);
    expect(kinds.has('hybrid')).toBe(true);
  });
});

// ── Empty/edge-light state ─────────────────────────────────────────────────

describe('GraphViz – empty edge state', () => {
  it('renders the locked empty copy when there are no renderable edges', () => {
    render(<GraphViz retrievalPath={GROUNDED_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />);
    expect(
      screen.getByText(
        /No traversed edges to draw for this answer — see the Path view for the records and queries\./i,
      ),
    ).toBeInTheDocument();
  });
});

// ── Node click → onOpenSource with real citation ───────────────────────────

describe('GraphViz – node click delegates to onOpenSource', () => {
  it('fires onOpenSource with the clicked node’s matching citation', () => {
    const onOpenSource = vi.fn();
    render(
      <GraphViz
        retrievalPath={EDGES_ENVELOPE.retrievalPath}
        citations={EDGES_ENVELOPE.citations}
        onOpenSource={onOpenSource}
      />,
    );
    const nodes = screen.getAllByRole('button', { name: /Open source/i });
    expect(nodes.length).toBeGreaterThan(0);
    fireEvent.click(nodes[0]);
    expect(onOpenSource).toHaveBeenCalled();
    const arg = onOpenSource.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg.length).toBeGreaterThan(0);
    expect(typeof arg[0]._id).toBe('string');
  });
});

// ── Edge accessible hit-target (D-06 {label} · {collection}) ────────────────

describe('GraphViz – edge accessible label', () => {
  it('exposes {label} · {collection} on an edge hit-target', () => {
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    const labelled = Array.from(container.querySelectorAll('path[aria-label]'));
    expect(labelled.length).toBeGreaterThan(0);
    expect(labelled.some((p) => (p.getAttribute('aria-label') ?? '').includes(' · '))).toBe(true);
  });
});

// ── Reduced-motion ────────────────────────────────────────────────────────

describe('GraphViz – prefers-reduced-motion', () => {
  it('does not apply animation class when reduced-motion is set', () => {
    mockReducedMotion(true);
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    expect(container.querySelector('.graph-viz-animate')).not.toBeInTheDocument();
    expect(container.querySelector('[data-reduced-motion="true"]')).toBeInTheDocument();
  });
});

// ── Token-not-hex ─────────────────────────────────────────────────────────

describe('GraphViz – no hardcoded hex', () => {
  it('renders without #5c9e31 / #3a6ea5 / #007339 / #044926 literals', () => {
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#5c9e31/i);
    expect(html).not.toMatch(/#3a6ea5/i);
    expect(html).not.toMatch(/#007339/i);
    expect(html).not.toMatch(/#044926/i);
  });
});

// ── Container height (blank-canvas guard) ────────────────────────────────

describe('GraphViz – explicit container height', () => {
  it('renders a container with an explicit height style', () => {
    const { container } = render(
      <GraphViz retrievalPath={EDGES_ENVELOPE.retrievalPath} onOpenSource={vi.fn()} />,
    );
    const hasExplicitHeight = Array.from(container.querySelectorAll('[style]')).some((el) => {
      const style = (el as HTMLElement).getAttribute('style') ?? '';
      return /height:\s*600/.test(style);
    });
    expect(hasExplicitHeight).toBe(true);
  });
});
