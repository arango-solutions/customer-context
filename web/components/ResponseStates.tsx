// web/components/ResponseStates.tsx
//
// Graceful failure states (UI-03) — inline in the main column, NEVER a blank screen,
// NEVER a fabricated source. Copy is verbatim from the UI-SPEC Copywriting Contract.
//
//   ErrorState   : agent/DB failure → the error copy (+ optional short reason) + a
//                  Retry button that re-submits the same question.
//   TimeoutState : >40s with no final envelope → the timeout copy + Keep waiting /
//                  Retry. The agent is still reasoning; the user chooses.

'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** Re-submit the same question. */
  onRetry: () => void;
  /** Optional short reason interpolated into the copy. */
  reason?: string;
  className?: string;
}

export function ErrorState({ onRetry, reason, className }: ErrorStateProps) {
  return (
    <div
      role="status"
      className={cn('flex max-w-[720px] flex-col gap-4', className)}
    >
      <p className="text-base leading-relaxed text-foreground">
        Something broke on the way to the graphs.
        {reason ? ` ${reason}.` : ''} Try again — the connection stays warm.
      </p>
      <div>
        <Button type="button" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

export interface TimeoutStateProps {
  /** Continue waiting on the in-flight stream. */
  onKeepWaiting: () => void;
  /** Re-submit the same question. */
  onRetry: () => void;
  className?: string;
}

export function TimeoutState({
  onKeepWaiting,
  onRetry,
  className,
}: TimeoutStateProps) {
  return (
    <div
      role="status"
      className={cn('flex max-w-[720px] flex-col gap-4', className)}
    >
      <p className="text-base leading-relaxed text-foreground">
        This one is taking longer than the demo budget. The agent is still
        reasoning — wait, or retry.
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onKeepWaiting}>
          Keep waiting
        </Button>
        <Button type="button" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
