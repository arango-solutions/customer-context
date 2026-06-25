// web/components/ReasoningTimeline.test.tsx
//
// ReasoningTimeline renders the six phase labels in order; with currentPhase='searching
// docs', phases 1-2 are done, 3 active, 4-6 pending; reasoningTrace lines appear; the
// list has aria-live (SRC-04). Asserted against GROUNDED_ENVELOPE.reasoningTrace.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ReasoningTimeline } from './ReasoningTimeline';
import { GROUNDED_ENVELOPE } from '../test/fixtures';

const LABELS = [
  'Planning the approach',
  'Querying the structured graph',
  'Searching the unstructured graph',
  'Resolving entities across graphs',
  'Reconciling the evidence',
  'Composing the grounded answer',
];

describe('ReasoningTimeline', () => {
  it('renders all six phase labels in order', () => {
    render(<ReasoningTimeline />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
    LABELS.forEach((label, i) => {
      expect(within(items[i]).getByText(label)).toBeInTheDocument();
    });
  });

  it("reflects currentPhase='searching docs' as done/active/pending", () => {
    render(<ReasoningTimeline currentPhase="searching docs" />);
    const items = screen.getAllByRole('listitem');
    // 0,1 done; 2 active; 3,4,5 pending.
    expect(items[0]).toHaveAttribute('data-state', 'done');
    expect(items[1]).toHaveAttribute('data-state', 'done');
    expect(items[2]).toHaveAttribute('data-state', 'active');
    expect(items[3]).toHaveAttribute('data-state', 'pending');
    expect(items[4]).toHaveAttribute('data-state', 'pending');
    expect(items[5]).toHaveAttribute('data-state', 'pending');
  });

  it('appends reasoningTrace lines under the matching phases', () => {
    render(
      <ReasoningTimeline reasoningTrace={GROUNDED_ENVELOPE.reasoningTrace} />,
    );
    // A distinctive fragment from each of the first and last trace lines.
    expect(
      screen.getByText(/Q12 requires reconciling/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/every claim is backed by a tool-returned _id/i),
    ).toBeInTheDocument();
  });

  it('exposes aria-live for screen-reader announcement of streamed steps', () => {
    render(<ReasoningTimeline />);
    const list = screen.getByRole('list', { name: /reasoning timeline/i });
    expect(list).toHaveAttribute('aria-live', 'polite');
  });
});
