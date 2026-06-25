// web/components/QuestionBox.tsx
//
// The free-form question box (UI-01) — center-stage, top of the main column. A prominent
// multiline textarea that autogrows 1→4 lines with an accent focus ring, plus the
// primary **Ask** button (a verb, never "Submit"/"Send" — Copywriting Contract).
//
// Interaction (UI-SPEC Component Inventory):
//   - Enter submits; Shift+Enter inserts a newline.
//   - While a stream is in flight the Ask button is DISABLED and shows an inline spinner
//     + a **Stop** affordance (the user can abort the 14–25s run).
//   - Placeholder + CTA copy are verbatim from the Copywriting Contract.

'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Copywriting Contract (UI-SPEC). */
export const QUESTION_PLACEHOLDER =
  'Ask anything about an account — renewal risk, true sentiment, expansion readiness…';
export const ASK_CTA = 'Ask';
export const STOP_CTA = 'Stop';

export interface QuestionBoxProps {
  /** Controlled value of the textarea. */
  value: string;
  /** Update the value (typing + chip-fill both flow through here). */
  onChange: (value: string) => void;
  /** Submit the current question. */
  onSubmit: (value: string) => void;
  /** True while a request is in flight — disables Ask, shows the Stop affordance. */
  isStreaming?: boolean;
  /** Abort the in-flight stream (the Stop affordance). */
  onStop?: () => void;
}

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  isStreaming = false,
  onStop,
}: QuestionBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();

  // Autogrow 1→4 lines: reset then grow to scrollHeight, capped at ~4 lines.
  const autogrow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxPx = 4 * 28; // ~4 lines at the 16px/1.5 body rhythm
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts a newline (UI-SPEC).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Your question
      </label>
      <Textarea
        id={fieldId}
        ref={ref}
        value={value}
        rows={1}
        placeholder={QUESTION_PLACEHOLDER}
        aria-label="Your question"
        // Accent focus ring (Color contract: the box focus ring is RESERVED accent).
        className="min-h-[52px] resize-none text-base focus-visible:ring-primary"
        onChange={(e) => {
          onChange(e.target.value);
          autogrow();
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-end gap-2">
        {isStreaming && onStop ? (
          <Button type="button" variant="outline" onClick={onStop}>
            {STOP_CTA}
          </Button>
        ) : null}
        <Button type="submit" disabled={isStreaming || value.trim().length === 0}>
          {isStreaming ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>{ASK_CTA}</span>
            </>
          ) : (
            ASK_CTA
          )}
        </Button>
      </div>
    </form>
  );
}
