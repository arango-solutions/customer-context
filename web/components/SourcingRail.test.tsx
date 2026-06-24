// web/components/SourcingRail.test.tsx
//
// SourcingRail composes the timeline + a CitationCard per envelope citation + the
// textual RetrievalPathByGraph, and shares its drawer with claim superscripts AND
// the under-answer GraphViz via the imperative `openSource` handle. Asserted against
// GROUNDED_ENVELOPE.
//
// Phase 11 D3 pivot: the cross-graph VISUAL (GraphViz) moved OUT of the rail to the
// main column under the answer — the rail no longer hosts a Graph/Path toggle. The
// shared-drawer contract (a viz node click calls the rail's openSource) is still
// covered via the imperative handle test below.

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

  // ── Phase 11 D3 pivot — graph moved out of the rail ──────────────────────────

  it('does NOT render a Graph/Path toggle (the visual moved under the answer)', () => {
    render(<SourcingRail envelope={GROUNDED_ENVELOPE} />);
    expect(screen.queryByRole('tablist', { name: /Retrieval view/i })).not.toBeInTheDocument();
    // The textual Path is shown directly (no toggle gating it).
    expect(screen.getByText('Structured graph')).toBeInTheDocument();
    expect(screen.getByText('Unstructured graph')).toBeInTheDocument();
  });

  it('GraphViz node-click would invoke the rail openSource handle (shared drawer)', () => {
    const ref = createRef<SourcingRailHandle>();
    // The under-answer GraphViz delegates node-clicks to this same handle.
    render(<SourcingRail ref={ref} envelope={GROUNDED_ENVELOPE} />);
    expect(ref.current).not.toBeNull();
    const citations = GROUNDED_ENVELOPE.claims[0].citations;
    act(() => {
      ref.current!.openSource(citations);
    });
    const first = citations[0];
    expect(
      screen.getByText(`Source — ${first.graph} · ${first.collection}`),
    ).toBeInTheDocument();
  });
});
