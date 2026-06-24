// web/components/AnswerBody.test.tsx
//
// AnswerBody renders envelope.claims[] as a numbered <ol>; each <li> carries
// the claim text + one ClaimSuperscript — clicking superscript [1] opens the
// drawer scoped to claims[0].citations (SRC-03, UI-02, D-12).
//
// D-12 rewrite: this test replaced the old prose assertion (/is not actually happy/i)
// with assertions that the answer renders as a semantic <ol> of claims[].length <li>s,
// each with a "View sources for claim {n}" superscript.
//
// Asserted against GROUNDED_ENVELOPE fixture.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AnswerBody } from './AnswerBody';
import { GROUNDED_ENVELOPE } from '../test/fixtures';

describe('AnswerBody', () => {
  it('renders a semantic <ol> with one <li> per claim', () => {
    const { container } = render(<AnswerBody envelope={GROUNDED_ENVELOPE} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeInTheDocument();
    const liItems = ol?.querySelectorAll('li');
    expect(liItems?.length).toBe(GROUNDED_ENVELOPE.claims.length);
  });

  it('each <li> contains the claim text', () => {
    const { container } = render(<AnswerBody envelope={GROUNDED_ENVELOPE} />);
    const liItems = Array.from(container.querySelectorAll('ol li'));
    GROUNDED_ENVELOPE.claims.forEach((claim, i) => {
      // The claim text should be inside the corresponding <li>
      expect(liItems[i]?.textContent).toContain(claim.text.slice(0, 20));
    });
  });

  it('renders one numbered superscript per claim, in order', () => {
    render(<AnswerBody envelope={GROUNDED_ENVELOPE} />);
    const markers = screen.getAllByRole('button', {
      name: /view sources for claim/i,
    });
    expect(markers).toHaveLength(GROUNDED_ENVELOPE.claims.length);
    expect(markers[0]).toHaveAccessibleName('View sources for claim 1');
  });

  it('clicking [1] opens the drawer scoped to claims[0].citations', () => {
    render(<AnswerBody envelope={GROUNDED_ENVELOPE} />);
    const firstCitation = GROUNDED_ENVELOPE.claims[0].citations[0];

    // Drawer closed initially.
    expect(screen.queryByText(firstCitation._id)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'View sources for claim 1' }),
    );

    // The first claim's first citation _id is now visible in the drawer.
    expect(screen.getByText(firstCitation._id)).toBeInTheDocument();
    expect(screen.getByText(firstCitation.aql)).toBeInTheDocument();
  });

  it('delegates to onOpenSource when a parent owns the drawer', () => {
    const onOpenSource = vi.fn();
    render(
      <AnswerBody envelope={GROUNDED_ENVELOPE} onOpenSource={onOpenSource} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'View sources for claim 2' }),
    );

    expect(onOpenSource).toHaveBeenCalledWith(
      GROUNDED_ENVELOPE.claims[1].citations,
    );
  });

  it('the superscript hit area meets the 44px floor', () => {
    render(<AnswerBody envelope={GROUNDED_ENVELOPE} />);
    const marker = screen.getByRole('button', {
      name: 'View sources for claim 1',
    });
    expect(marker.className).toMatch(/min-h-\[44px\]/);
    expect(marker.className).toMatch(/min-w-\[44px\]/);
  });
});
