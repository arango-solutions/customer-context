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

  it('renders all 7 example prompts (6 locked eval prompts + the JOIN demo chip)', () => {
    render(<ExampleChips onPick={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(EXAMPLE_PROMPTS).toHaveLength(7);
    expect(EXAMPLE_PROMPTS[0].id).toBe('Q12');
    // The cross-graph-join demo chip is second (immediately visible, non-featured).
    expect(EXAMPLE_PROMPTS[1].id).toBe('JOIN');
    expect(EXAMPLE_PROMPTS[1].featured).toBeUndefined();
  });

  it('marks the chip whose prompt equals `value` as selected (visual feedback on pick)', () => {
    const q12 = EXAMPLE_PROMPTS[0];
    const selectedChips = () =>
      screen
        .getAllByRole('listitem')
        .filter((c) => c.getAttribute('data-selected') === 'true');

    const { rerender } = render(<ExampleChips onPick={() => {}} />);
    // No value → nothing selected.
    expect(selectedChips()).toHaveLength(0);

    // value matches Q12's full prompt → exactly Q12 is selected (data-selected + aria-current).
    rerender(<ExampleChips onPick={() => {}} value={q12.prompt} />);
    const selected = selectedChips();
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(q12.label);
    expect(selected[0]).toHaveAttribute('aria-current', 'true');

    // Editing the box (value no longer matches any prompt) deselects.
    rerender(<ExampleChips onPick={() => {}} value={q12.prompt + ' (edited)'} />);
    expect(selectedChips()).toHaveLength(0);
  });

  it('the chip is a button (keyboard-reachable), not a one-click run control', () => {
    render(<ExampleChips onPick={() => {}} />);
    for (const chip of screen.getAllByRole('listitem')) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip).toHaveAttribute('type', 'button');
    }
  });
});
