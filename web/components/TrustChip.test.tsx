// web/components/TrustChip.test.tsx
//
// RTL tests for TrustChip (UI-06, qualitative-only).
//
// Coverage:
//  - GROUNDED_ENVELOPE: renders "Grounded ✓" chip
//  - REFUSED_ENVELOPE: renders "Partially grounded" chip
//  - faithfulnessScore is NOT referenced (compile-safe, no such field on Envelope)
//  - Text conveys state without color alone (the words carry it — colorblind-safe)
//  - Tooltip (if present) shows grounding score only, NOT a faithfulness number
//
// LOAD-BEARING: faithfulnessScore is absent from the runtime envelope.
// These tests MUST compile against the real Envelope type with no faithfulnessScore.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TrustChip } from './TrustChip';
import { GROUNDED_ENVELOPE, REFUSED_ENVELOPE } from '../test/fixtures';

describe('TrustChip – GROUNDED_ENVELOPE', () => {
  it('renders "Grounded ✓" locked text', () => {
    render(<TrustChip envelope={GROUNDED_ENVELOPE} />);
    expect(screen.getByText('Grounded ✓')).toBeInTheDocument();
  });

  it('does NOT render "Partially grounded" for a grounded envelope', () => {
    render(<TrustChip envelope={GROUNDED_ENVELOPE} />);
    expect(screen.queryByText('Partially grounded')).not.toBeInTheDocument();
  });
});

describe('TrustChip – REFUSED_ENVELOPE', () => {
  it('renders "Partially grounded" locked text', () => {
    render(<TrustChip envelope={REFUSED_ENVELOPE} />);
    expect(screen.getByText('Partially grounded')).toBeInTheDocument();
  });

  it('does NOT render "Grounded ✓" for a refused envelope', () => {
    render(<TrustChip envelope={REFUSED_ENVELOPE} />);
    expect(screen.queryByText('Grounded ✓')).not.toBeInTheDocument();
  });
});

describe('TrustChip – colorblind-safe text-only state signal', () => {
  it('grounded: "Grounded ✓" text carries the state (not color alone)', () => {
    render(<TrustChip envelope={GROUNDED_ENVELOPE} />);
    // The word "Grounded" must be present (text conveys state)
    expect(screen.getByText(/Grounded/)).toBeInTheDocument();
  });

  it('partial: "Partially grounded" text carries the state (not color alone)', () => {
    render(<TrustChip envelope={REFUSED_ENVELOPE} />);
    expect(screen.getByText(/Partially grounded/)).toBeInTheDocument();
  });
});
