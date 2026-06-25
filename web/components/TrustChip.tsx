// web/components/TrustChip.tsx
//
// Per-answer qualitative trust chip (UI-06 / D-10 / D-11).
//
// LOAD-BEARING FINDING (11-PATTERNS.md, RESEARCH Open Question #1 RESOLVED):
// faithfulnessScore is NOT on the runtime envelope. EnvelopeSchema (envelope.ts)
// defines groundingScore (required) ONLY — faithfulness lives only in the eval
// path (agent/test), never injected into the returned envelope.
//
// Therefore this chip:
//  - Drives its state from envelope.groundingScore + envelope.refused ONLY.
//  - Shows "Grounded ✓" (grounded) or "Partially grounded" (refused/partial).
//  - Does NOT print a faithfulness number — there is no runtime source for it.
//
// DEFERRED: The numeric faithfulness reveal (D-10 intent — "faithfulness score
// revealed on hover for technical buyers") is DEFERRED because threading the
// eval metric into the runtime envelope is a DATA change, out of this
// presentation-only phase. The tooltip currently shows only grounding {score}.
// When faithfulnessScore is added to EnvelopeSchema and returned from the
// agent, update this component to include it in the TooltipContent.
//
// Analog: GraphBadge.tsx (Badge-wrapper convention, qualitative-label-not-color-only).
// Tooltip: uses the Radix tooltip atom from ui/tooltip.tsx (first consumer).

'use client';

import * as React from 'react';
import type { Envelope } from 'customer360-agent';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface TrustChipProps {
  envelope: Envelope;
  className?: string;
}

export function TrustChip({ envelope, className }: TrustChipProps) {
  // Grounded = not refused AND groundingScore >= 1 (vanity %, ~always 1.0 for clean answers).
  // We lead with a qualitative label (D-10) because groundingScore is almost always 1.0
  // and a plain "100%" would be a vanity number, not a meaningful signal to buyers.
  const grounded = !envelope.refused && envelope.groundingScore >= 1;
  const label = grounded ? 'Grounded ✓' : 'Partially grounded';

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className={
              (grounded
                ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/80') +
              (className ? ` ${className}` : '')
            }
          >
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {/*
           * DEFERRED: numeric faithfulness score will appear here once
           * faithfulnessScore is threaded into the runtime envelope (data change,
           * out of this presentation-only phase). For now, show only groundingScore.
           * See: D-10 intent + RESEARCH Open Question #1 resolution.
           */}
          grounding {envelope.groundingScore.toFixed(2)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TrustChip;
