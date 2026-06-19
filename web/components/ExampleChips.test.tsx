// web/components/ExampleChips.test.tsx
//
// Proves the free-form-NL premise (UI-01 / PROJECT.md): chips FILL the box, they do NOT
// auto-submit, and the Q12 showcase chip is FIRST.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExampleChips, EXAMPLE_PROMPTS } from './ExampleChips';

describe('ExampleChips', () => {
  it('clicking a chip FILLS the box via onPick with the FULL prompt (does not auto-submit)', () => {
    const onPick = vi.fn();
    render(<ExampleChips onPick={onPick} />);

    // Click the featured Q12 chip.
    const q12 = EXAMPLE_PROMPTS[0];
    fireEvent.click(
      screen.getByRole('listitem', { name: new RegExp(q12.label, 'i') }),
    );

    // onPick receives the FULL verbatim prompt (not the short label, not a submit).
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(q12.prompt);
    expect(q12.prompt.length).toBeGreaterThan(q12.label.length);
  });

  it('renders the Q12 chip FIRST and visually featured', () => {
    render(<ExampleChips onPick={() => {}} />);
    const chips = screen.getAllByRole('listitem');
    // Q12 is the first chip rendered.
    expect(chips[0]).toHaveTextContent('Usage green vs. sentiment red');
    expect(chips[0]).toHaveAttribute('data-featured', 'true');
    // It is the ONLY featured chip.
    const featured = chips.filter((c) => c.getAttribute('data-featured') === 'true');
    expect(featured).toHaveLength(1);
  });

  it('renders all 6 locked example prompts', () => {
    render(<ExampleChips onPick={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(EXAMPLE_PROMPTS).toHaveLength(6);
    expect(EXAMPLE_PROMPTS[0].id).toBe('Q12');
  });

  it('the chip is a button (keyboard-reachable), not a one-click run control', () => {
    render(<ExampleChips onPick={() => {}} />);
    for (const chip of screen.getAllByRole('listitem')) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip).toHaveAttribute('type', 'button');
    }
  });
});
