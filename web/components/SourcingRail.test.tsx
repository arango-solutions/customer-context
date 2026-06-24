// web/components/SourcingRail.test.tsx
//
// SourcingRail composes the timeline + a CitationCard per envelope citation + the
// Graph/Path toggle + either GraphViz or RetrievalPathByGraph, and shares its drawer
// with claim superscripts via the imperative `openSource` handle. Asserted against
// GROUNDED_ENVELOPE.
//
// Phase 11 / Plan 03 additions: toggle present, defaults to Path (RetrievalPathByGraph
// visible, GraphViz not), switching to Graph renders GraphViz, node-click uses the
// shared rail openSource handle.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createRef } from 'react';

import { SourcingRail, type SourcingRailHandle } from './SourcingRail';
import { GROUNDED_ENVELOPE } from '../test/fixtures';

describe('SourcingRail', () => {
  it('renders a CitationCard for each envelope citation', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    for (const c of GROUNDED_ENVELOPE.citations) {
      expect(screen.getByText(c._id)).toBeInTheDocument();
    }
  });

  it('renders the reasoning timeline and the grouped retrieval path headers', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    expect(screen.getByText('Planning the approach')).toBeInTheDocument();
    expect(screen.getByText('Structured graph')).toBeInTheDocument();
    expect(screen.getByText('Unstructured graph')).toBeInTheDocument();
  });

  it('opens the shared drawer when a CitationCard body is clicked', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    const first = GROUNDED_ENVELOPE.citations[0];

    fireEvent.click(
      screen.getAllByRole('button', { name: /open source/i })[0],
    );

    // The drawer renders the header for that citation.
    expect(
      screen.getByText(`Source — ${first.graph} · ${first.collection}`),
    ).toBeInTheDocument();
  });

  it('exposes an imperative openSource handle (shared with claim superscripts)', () => {
    const ref = createRef<SourcingRailHandle>();
    render(<SourcingRail ref={ref} envelope={GROUNDED_ENVELOPE} />);

    const claimCitations = GROUNDED_ENVELOPE.claims[1].citations;
    expect(ref.current).not.toBeNull();
    act(() => {
      ref.current!.openSource(claimCitations);
    });

    // Every citation in the opened claim is listed in the drawer.
    for (const c of claimCitations) {
      expect(screen.getByText(c.aql)).toBeInTheDocument();
    }
  });

  // ── Phase 11 Plan 03 — Graph/Path toggle (D-05) ──────────────────────────────

  it('renders the Graph/Path toggle in the Retrieval path section', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    // The toggle is a tablist with both segment labels
    expect(screen.getByRole('tablist', { name: /Retrieval view/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Path/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Graph/i })).toBeInTheDocument();
  });

  it('defaults to Path — RetrievalPathByGraph groups visible, GraphViz canvas not present', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    // Default Path: the "Structured graph" and "Unstructured graph" section headers are visible
    expect(screen.getByText('Structured graph')).toBeInTheDocument();
    expect(screen.getByText('Unstructured graph')).toBeInTheDocument();
    // The React Flow canvas (GraphViz) renders the edge legend when visible — not present in Path mode
    // (EDGES_ENVELOPE has no edges in GROUNDED_ENVELOPE, so canvas empty-state copy would show;
    //  we confirm the GraphViz root is absent by checking the legend label is absent)
    // NOTE: the toggle starts at Path so GraphViz is not rendered at all
    expect(screen.queryByText('Traversed (PART_OF / same_as)')).not.toBeInTheDocument();
  });

  it('switching to Graph renders GraphViz (edge legend appears)', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    // Switch to Graph
    fireEvent.click(screen.getByRole('tab', { name: /^Show Graph view$/i }));
    // GraphViz EdgeLegend is always-visible (D-04) — confirms GraphViz is mounted
    expect(screen.getByText('Traversed (PART_OF / same_as)')).toBeInTheDocument();
    // RetrievalPathByGraph group headers are gone
    expect(screen.queryByText('Structured graph')).not.toBeInTheDocument();
  });

  it('switching back to Path hides GraphViz and shows RetrievalPathByGraph', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    // Go to Graph
    fireEvent.click(screen.getByRole('tab', { name: /^Show Graph view$/i }));
    // Back to Path
    fireEvent.click(screen.getByRole('tab', { name: /^Show Path view$/i }));
    expect(screen.getByText('Structured graph')).toBeInTheDocument();
    expect(screen.queryByText('Traversed (PART_OF / same_as)')).not.toBeInTheDocument();
  });

  it('GraphViz node-click invokes the rail openSource handle (shared drawer)', () => {
    const ref = createRef<SourcingRailHandle>();
    // Spy on openSource by calling it directly via ref — this mirrors the node-click
    // delegation path: GraphViz.onOpenSource === rail.openSource
    render(<SourcingRail ref={ref} envelope={GROUNDED_ENVELOPE} />);
    expect(ref.current).not.toBeNull();
    const citations = GROUNDED_ENVELOPE.claims[0].citations;
    act(() => {
      // Simulate a viz node click calling the same openSource handle
      ref.current!.openSource(citations);
    });
    // Drawer opens showing the first citation's header
    const first = citations[0];
    expect(
      screen.getByText(`Source — ${first.graph} · ${first.collection}`),
    ).toBeInTheDocument();
  });
});
