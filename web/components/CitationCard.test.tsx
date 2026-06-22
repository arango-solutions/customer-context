// web/components/CitationCard.test.tsx
//
// CitationCard renders ONE grounded Citation from the GROUNDED_ENVELOPE fixture:
// graph badge label + collection + _id + the exact AQL on disclosure; clicking the
// card body calls onOpenSource (SRC-01/02). All assertions are against the fixture —
// no live agent.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CitationCard } from './CitationCard';
import { GROUNDED_ENVELOPE } from '../test/fixtures';

// The first structured citation (UsageMetric) and the first unstructured one (Chunk).
const STRUCTURED = GROUNDED_ENVELOPE.citations.find((c) => c.graph === 'structured')!;
const UNSTRUCTURED = GROUNDED_ENVELOPE.citations.find((c) => c.graph === 'unstructured')!;

describe('CitationCard', () => {
  it('renders the structured graph badge label, collection, and _id', () => {
    render(<CitationCard citation={STRUCTURED} />);

    expect(screen.getByText('Structured')).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED.collection)).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED._id)).toBeInTheDocument();
  });

  it('hides the AQL until the disclosure is toggled, then shows the exact aql', () => {
    render(<CitationCard citation={STRUCTURED} />);

    // Not in the DOM before disclosure.
    expect(screen.queryByText(STRUCTURED.aql)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /toggle aql/i }));

    expect(screen.getByText(STRUCTURED.aql)).toBeInTheDocument();
  });

  it('clicking the card body invokes onOpenSource with the citation', () => {
    const onOpenSource = vi.fn();
    render(<CitationCard citation={STRUCTURED} onOpenSource={onOpenSource} />);

    fireEvent.click(
      screen.getByRole('button', { name: /open source/i }),
    );

    expect(onOpenSource).toHaveBeenCalledTimes(1);
    expect(onOpenSource).toHaveBeenCalledWith(STRUCTURED);
  });

  it('renders the unstructured badge as slate-blue (variant) with its label', () => {
    render(<CitationCard citation={UNSTRUCTURED} />);

    const badge = screen.getByText('Unstructured');
    expect(badge).toBeInTheDocument();
    // The dual-graph distinction is carried by both the variant token AND the label.
    expect(badge.closest('[data-graph="unstructured"]')).not.toBeNull();
  });
});
