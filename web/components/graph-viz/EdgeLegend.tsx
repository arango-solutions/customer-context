// web/components/graph-viz/EdgeLegend.tsx
//
// Always-visible 3-kind edge legend (D-04, UI-SPEC Copywriting — LOCKED).
//
// Renders a static label table with one row per edge kind. Never hover-gated —
// a Zscaler buyer reads the honesty distinction at a glance.
//
// Legend copy LOCKED verbatim from UI-SPEC Copywriting:
//   Traversed (PART_OF / same_as)  — solid line
//   Structural (account-induced)   — dashed line
//   Hybrid match (vector + BM25)   — dotted line
//
// Analog: RetrievalPathByGraph.tsx GROUP_HEADER/GROUP_ORDER static-label-table.

'use client';

import * as React from 'react';

type EdgeKind = 'traversed' | 'structural' | 'hybrid';

type LegendEntry = {
  kind: EdgeKind;
  label: string;
  svgDasharray?: string;
  strokeLinecap?: 'butt' | 'round' | 'square';
};

// Locked legend entries from UI-SPEC Copywriting — verbatim
const LEGEND_ENTRIES: LegendEntry[] = [
  {
    kind: 'traversed',
    label: 'Traversed (PART_OF / same_as)',
    svgDasharray: undefined, // solid
    strokeLinecap: 'butt',
  },
  {
    kind: 'structural',
    label: 'Structural (account-induced)',
    svgDasharray: '6 4', // dashed
    strokeLinecap: 'butt',
  },
  {
    kind: 'hybrid',
    label: 'Hybrid match (vector + BM25)',
    svgDasharray: '1 5', // dotted
    strokeLinecap: 'round',
  },
];

function StrokeSwatch({
  dasharray,
  linecap,
}: {
  dasharray?: string;
  linecap?: 'butt' | 'round' | 'square';
}) {
  return (
    <svg
      width="32"
      height="12"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <line
        x1="2"
        y1="6"
        x2="30"
        y2="6"
        stroke="var(--muted-foreground)"
        strokeWidth={2}
        strokeDasharray={dasharray}
        strokeLinecap={linecap ?? 'butt'}
      />
    </svg>
  );
}

export function EdgeLegend({ className }: { className?: string }) {
  return (
    <div
      className={
        'flex flex-col gap-1.5 rounded-md border border-border bg-background/80 px-3 py-2 text-xs backdrop-blur-sm' +
        (className ? ` ${className}` : '')
      }
      aria-label="Edge kind legend"
      role="list"
    >
      {LEGEND_ENTRIES.map((entry) => (
        <div
          key={entry.kind}
          className="flex items-center gap-2"
          role="listitem"
        >
          <StrokeSwatch
            dasharray={entry.svgDasharray}
            linecap={entry.strokeLinecap}
          />
          <span className="text-xs font-medium leading-none text-foreground">
            {entry.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default EdgeLegend;
