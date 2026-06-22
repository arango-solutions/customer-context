// web/components/SourceDrawer.test.tsx
//
// SourceDrawer is the click-to-source payoff (SRC-03). Opening with a fixture citation
// shows the citation ATOM: graph badge + collection + _id + the EXACT aql + traversal,
// plus a copy-AQL affordance. Esc / overlay / close invokes onClose. Asserted against
// GROUNDED_ENVELOPE.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SourceDrawer } from './SourceDrawer';
import { GROUNDED_ENVELOPE } from '../test/fixtures';

const STRUCTURED = GROUNDED_ENVELOPE.citations.find((c) => c.graph === 'structured')!;

// A claim that carries multiple citations (the second Meridian claim) — exercises the
// multi-citation list path.
const MULTI = GROUNDED_ENVELOPE.claims[1].citations;

describe('SourceDrawer', () => {
  it('renders the citation atom (graph, collection, _id, exact aql, traversal)', () => {
    render(
      <SourceDrawer open citations={[STRUCTURED]} onClose={() => {}} />,
    );

    // Header copy: `Source — {graph} · {collection}`
    expect(
      screen.getByText(`Source — ${STRUCTURED.graph} · ${STRUCTURED.collection}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Structured')).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED._id)).toBeInTheDocument();
    // The EXACT aql is visible without any further interaction (drawer = full view).
    expect(screen.getByText(STRUCTURED.aql)).toBeInTheDocument();
    expect(screen.getByText(STRUCTURED.traversal!)).toBeInTheDocument();
  });

  it('exposes a copy-AQL affordance', () => {
    render(<SourceDrawer open citations={[STRUCTURED]} onClose={() => {}} />);
    expect(
      screen.getByRole('button', { name: /copy aql/i }),
    ).toBeInTheDocument();
  });

  it('lists every citation for a multi-citation claim', () => {
    render(<SourceDrawer open citations={MULTI} onClose={() => {}} />);
    for (const c of MULTI) {
      expect(screen.getByText(c._id)).toBeInTheDocument();
      expect(screen.getByText(c.aql)).toBeInTheDocument();
    }
  });

  it('invokes onClose when the drawer is dismissed (Esc)', () => {
    const onClose = vi.fn();
    render(<SourceDrawer open citations={[STRUCTURED]} onClose={onClose} />);

    // Radix Dialog closes on Escape → onOpenChange(false) → onClose.
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not render content when closed', () => {
    render(<SourceDrawer open={false} citations={[STRUCTURED]} onClose={() => {}} />);
    expect(screen.queryByText(STRUCTURED._id)).not.toBeInTheDocument();
  });
});
