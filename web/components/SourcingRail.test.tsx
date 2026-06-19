// web/components/SourcingRail.test.tsx
//
// SourcingRail composes the timeline + a CitationCard per envelope citation + the
// grouped RetrievalPathByGraph, and shares its drawer with claim superscripts via the
// imperative `openSource` handle. Asserted against GROUNDED_ENVELOPE.

import { describe, it, expect } from 'vitest';
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
});
