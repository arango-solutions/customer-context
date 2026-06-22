// web/components/ReasoningTimeline.tsx
//
// Vertical stepper of the six D-01 planner phases (SRC-04). Driven by `currentPhase`
// (the live `data-step` value, a StreamPhase from lib/ui-message.ts). Dot states:
//   pending  ○   (phase after the active one)
//   active   ◆   (the current phase)
//   done     ✓   (phases before the active one)
//
// The envelope's `reasoningTrace[]` strings append under the matching phase (by order
// — one trace line per phase in the demo output). Status is conveyed by ICON + TEXT,
// not color alone (a11y). `aria-live="polite"` so screen readers announce streamed
// steps without spamming.
//
// CARDINAL RULE: these are PROGRESS lines, never rendered as grounded claims.

'use client';

import * as React from 'react';
import { Circle, Diamond, Check } from 'lucide-react';
import type { StreamPhase } from '@/lib/ui-message';

import { cn } from '@/lib/utils';

/** The six phases, in order, with their UI labels (UI-SPEC state machine). */
const PHASES: { phase: StreamPhase; label: string }[] = [
  { phase: 'planning', label: 'Planning the approach' },
  { phase: 'querying structured', label: 'Querying the structured graph' },
  { phase: 'searching docs', label: 'Searching the unstructured graph' },
  { phase: 'resolving entities', label: 'Resolving entities across graphs' },
  { phase: 'reconciling', label: 'Reconciling the evidence' },
  { phase: 'answer', label: 'Composing the grounded answer' },
];

const PHASE_ORDER: StreamPhase[] = PHASES.map((p) => p.phase);

type DotState = 'pending' | 'active' | 'done';

function stateFor(
  phaseIndex: number,
  currentIndex: number | null,
): DotState {
  if (currentIndex === null) return 'pending';
  if (phaseIndex < currentIndex) return 'done';
  if (phaseIndex === currentIndex) return 'active';
  return 'pending';
}

function Dot({ state }: { state: DotState }) {
  // Icon + text status (not color alone): done ✓ / active ◆ / pending ○.
  if (state === 'done')
    return <Check className="h-4 w-4 text-primary" aria-hidden />;
  if (state === 'active')
    return <Diamond className="h-4 w-4 fill-primary text-primary" aria-hidden />;
  return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

const STATE_LABEL: Record<DotState, string> = {
  pending: 'pending',
  active: 'in progress',
  done: 'done',
};

export interface ReasoningTimelineProps {
  /** The live active phase (data-step). `null` = not started. */
  currentPhase?: StreamPhase | null;
  /** Envelope reasoningTrace lines, appended under the matching phase by order. */
  reasoningTrace?: string[];
  className?: string;
}

export function ReasoningTimeline({
  currentPhase = null,
  reasoningTrace = [],
  className,
}: ReasoningTimelineProps) {
  const currentIndex =
    currentPhase != null ? PHASE_ORDER.indexOf(currentPhase) : null;
  const resolvedIndex =
    currentIndex != null && currentIndex >= 0 ? currentIndex : null;

  return (
    <ol
      className={cn('flex flex-col gap-3', className)}
      aria-live="polite"
      aria-label="Reasoning timeline"
    >
      {PHASES.map(({ phase, label }, i) => {
        const state = stateFor(i, resolvedIndex);
        // One trace line per phase, by order (demo output shape).
        const trace = reasoningTrace[i];
        return (
          <li key={phase} className="flex flex-col gap-1" data-state={state}>
            <div className="flex items-center gap-2">
              <Dot state={state} />
              <span
                className={cn(
                  'text-sm font-semibold',
                  state === 'pending'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {label}
              </span>
              {/* Text status carried alongside the icon (a11y, screen readers). */}
              <span className="sr-only">{STATE_LABEL[state]}</span>
            </div>
            {trace ? (
              <p className="ml-6 text-sm text-muted-foreground">{trace}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export default ReasoningTimeline;
