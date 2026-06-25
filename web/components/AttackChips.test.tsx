// web/components/AttackChips.test.tsx
//
// Proves the SEC-02 one-click attack-chip contract (D-02): clicking a chip SUBMITS the
// attack via onAttack with the FULL verbatim prompt (unlike ExampleChips, which only
// fills the box), and the preset set covers the major attack classes.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackChips, ATTACK_PROMPTS } from './AttackChips';

describe('AttackChips', () => {
  it('clicking a chip SUBMITS the attack via onAttack with the FULL verbatim prompt', () => {
    const onAttack = vi.fn();
    render(<AttackChips onAttack={onAttack} />);

    const first = ATTACK_PROMPTS[0];
    fireEvent.click(
      screen.getByRole('listitem', { name: new RegExp(first.label, 'i') }),
    );

    expect(onAttack).toHaveBeenCalledTimes(1);
    expect(onAttack).toHaveBeenCalledWith(first.prompt);
    expect(first.prompt.length).toBeGreaterThan(first.label.length);
  });

  it('renders every preset attack as a keyboard-reachable button', () => {
    render(<AttackChips onAttack={() => {}} />);
    const chips = screen.getAllByRole('listitem');
    expect(chips).toHaveLength(ATTACK_PROMPTS.length);
    for (const chip of chips) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip).toHaveAttribute('type', 'button');
    }
  });

  it('covers at least 3 distinct attack classes (injection / fake-admin / pii / out-of-scope)', () => {
    const kinds = new Set(ATTACK_PROMPTS.map((a) => a.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(kinds.has('injection')).toBe(true);
    expect(kinds.has('fake-admin')).toBe(true);
    expect(kinds.has('pii')).toBe(true);
  });
});
