// web/components/ResponseStates.test.tsx
//
// Covers the honest RefusalPanel (UI-03, D-03) and the graceful ErrorState/TimeoutState
// (UI-03). RefusalPanel renders REFUSED_ENVELOPE.answer verbatim + its partial citations
// as cards under the "Cannot answer" header, and is NOT an error/alarm. ErrorState +
// TimeoutState render the contract copy + wired actions.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RefusalPanel } from './RefusalPanel';
import { ErrorState, TimeoutState } from './ResponseStates';
import { REFUSED_ENVELOPE } from '../test/fixtures';

describe('RefusalPanel', () => {
  it('renders the refusal answer verbatim under the "Cannot answer" header', () => {
    render(<RefusalPanel envelope={REFUSED_ENVELOPE} />);
    expect(
      screen.getByRole('heading', { name: /cannot answer — and here/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/I cannot confidently answer this question/i),
    ).toBeInTheDocument();
  });

  it('renders the partial citations as CitationCards', () => {
    render(<RefusalPanel envelope={REFUSED_ENVELOPE} />);
    for (const c of REFUSED_ENVELOPE.citations) {
      expect(screen.getByText(c._id)).toBeInTheDocument();
      expect(screen.getByText(c.collection)).toBeInTheDocument();
    }
  });

  it('is NOT treated as an error/alarm (no alert role)', () => {
    render(<RefusalPanel envelope={REFUSED_ENVELOPE} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Framed as a feature: the panel is labelled "Cannot answer", not "error".
    expect(
      screen.getByRole('region', { name: /cannot answer/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing fabricated — only the grounded partial citations exist', () => {
    render(<RefusalPanel envelope={REFUSED_ENVELOPE} />);
    const cards = screen.getAllByRole('button', { name: /open source/i });
    // Exactly one grounded citation in the refusal fixture.
    expect(cards).toHaveLength(REFUSED_ENVELOPE.citations.length);
  });
});

describe('ErrorState', () => {
  it('renders the contract error copy + a Retry button wired to onRetry', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(
      screen.getByText(/something broke on the way to the graphs/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the connection stays warm/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('interpolates an optional short reason', () => {
    render(<ErrorState onRetry={() => {}} reason="ArangoDB timed out" />);
    expect(screen.getByText(/ArangoDB timed out/)).toBeInTheDocument();
  });
});

describe('TimeoutState', () => {
  it('renders the timeout copy + Keep waiting and Retry actions', () => {
    const onKeepWaiting = vi.fn();
    const onRetry = vi.fn();
    render(<TimeoutState onKeepWaiting={onKeepWaiting} onRetry={onRetry} />);

    expect(
      screen.getByText(/taking longer than the demo budget/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep waiting/i }));
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    expect(onKeepWaiting).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
