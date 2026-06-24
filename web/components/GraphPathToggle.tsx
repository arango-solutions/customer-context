// web/components/GraphPathToggle.tsx
//
// 2-segment Graph / Path toggle for the Retrieval-path section of SourcingRail (D-05).
//
// UI-SPEC Copywriting: labels are LOCKED as `Graph` / `Path` (case-sensitive).
// UI-SPEC Placement & Toggle D-05:
//   - Default selection: "Path" (lowest-regression default — v1 text-path flow
//     is the eval-tested experience).
//   - Active segment uses accent green (--primary via bg-primary).
//   - role="tab" + aria-pressed semantics (accessible-toggle pattern from
//     PATTERNS.md, analog: RetrievalPathByGraph FragmentRow toggle button).
//   - focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2.
//   - 44px minimum hit target (UI-SPEC Spacing scale exception).
//
// Props: controlled — value + onChange (SourcingRail owns state).

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type GraphPathValue = 'path' | 'graph';

export interface GraphPathToggleProps {
  value: GraphPathValue;
  onChange: (value: GraphPathValue) => void;
  className?: string;
}

const SEGMENTS: { id: GraphPathValue; label: string }[] = [
  { id: 'path', label: 'Path' },
  { id: 'graph', label: 'Graph' },
];

export function GraphPathToggle({
  value,
  onChange,
  className,
}: GraphPathToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Retrieval view"
      className={cn('flex rounded-md border border-border bg-muted p-0.5 gap-0.5', className)}
    >
      {SEGMENTS.map(({ id, label }) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            aria-label={`Show ${label} view`}
            className={cn(
              // Base — 14px/600 Label role (UI-SPEC Typography)
              'min-h-[44px] min-w-[44px] flex-1 rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? // Active: accent green — reserved slot (UI-SPEC Color)
                  'bg-primary text-primary-foreground'
                : // Inactive: muted, no accent
                  'bg-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default GraphPathToggle;
