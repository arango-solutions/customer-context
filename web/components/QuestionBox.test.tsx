// web/components/QuestionBox.test.tsx
//
// Proves the free-form box behaviors (UI-01 / UI-SPEC):
//   - the CTA is "Ask" and the placeholder matches the Copywriting Contract,
//   - Enter (without Shift) submits; Shift+Enter does NOT submit (newline),
//   - the Ask button is DISABLED while a stream is in flight, and a Stop affordance shows.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  QuestionBox,
  QUESTION_PLACEHOLDER,
  ASK_CTA,
  STOP_CTA,
} from './QuestionBox';

describe('QuestionBox', () => {
  it('renders the Ask CTA (verb) and the contract placeholder', () => {
    render(
      <QuestionBox value="" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(screen.getByRole('button', { name: ASK_CTA })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(QUESTION_PLACEHOLDER)).toBeInTheDocument();
    // It is "Ask", never "Submit"/"Send".
    expect(screen.queryByRole('button', { name: /submit|send/i })).toBeNull();
  });

  it('Enter (no Shift) submits with the trimmed value', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionBox value="  hello graphs  " onChange={() => {}} onSubmit={onSubmit} />,
    );
    const box = screen.getByLabelText('Your question');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('hello graphs');
  });

  it('Shift+Enter does NOT submit (inserts a newline instead)', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionBox value="line one" onChange={() => {}} onSubmit={onSubmit} />,
    );
    const box = screen.getByLabelText('Your question');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the Ask button is DISABLED while streaming and a Stop affordance shows', () => {
    const onStop = vi.fn();
    render(
      <QuestionBox
        value="anything"
        onChange={() => {}}
        onSubmit={() => {}}
        isStreaming
        onStop={onStop}
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(ASK_CTA) })).toBeDisabled();
    const stop = screen.getByRole('button', { name: STOP_CTA });
    expect(stop).toBeInTheDocument();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('Enter does NOT submit while streaming (no double-fire)', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionBox
        value="anything"
        onChange={() => {}}
        onSubmit={onSubmit}
        isStreaming
        onStop={() => {}}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Your question'), {
      key: 'Enter',
      shiftKey: false,
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the Ask button is disabled when the value is empty/whitespace', () => {
    render(<QuestionBox value="   " onChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: ASK_CTA })).toBeDisabled();
  });
});
