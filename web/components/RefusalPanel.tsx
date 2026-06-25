// web/components/RefusalPanel.tsx
//
// The honest-refusal selling point (UI-03, D-03, RESEARCH Pitfall 5). Given a
// `refused: true` envelope, renders its `answer` VERBATIM as a calm structured
// statement under a `Cannot answer — and here's why` header, plus whatever partial
// `citations` WERE grounded, rendered as CitationCards.
//
// CARDINAL RULE (T-06-09): a refused envelope renders honestly with its partial
// citations — NEVER a fabricated full answer, and NEVER as a UI error/alarm. The clay
// accent (#B4451F) appears ONLY on the header rule — no red alarm styling.

'use client';

import * as React from 'react';
import type { Envelope, Citation } from 'customer360-agent';

import { CitationCard } from '@/components/CitationCard';
import { SourceDrawer } from '@/components/SourceDrawer';
import { cn } from '@/lib/utils';

export interface RefusalPanelProps {
  envelope: Envelope;
  className?: string;
  /**
   * SEC-02 / D-04: when true (adversarial "try-to-break-it" mode), surface a derived
   * attack-type label so the audience SEES the system noticed the attack and refused on
   * purpose. STRICTLY gated — in normal mode (false/undefined) the panel renders exactly
   * as today, with NO label (RESEARCH Pitfall 5 / threat T-13-15: no false positives).
   */
  adversarial?: boolean;
  /** The asked question — the label is derived from it CLIENT-SIDE (never from the envelope). */
  question?: string;
}

/**
 * D-04: derive a human-readable attack-type label from the question text, CLIENT-SIDE
 * only (the locked envelope/SynthEnvelopeSchema is never extended — threat T-13-16).
 * Order matters: the more specific / higher-signal patterns are checked first. This is
 * pure presentation — it NEVER feeds the grounding gate.
 */
export function deriveAttackLabel(question: string): string {
  const q = (question ?? '').toLowerCase();

  // Fake admin / system / role override (check before generic instruction-override so a
  // "SYSTEM: ... admin mode" prompt gets the more specific label).
  if (/\b(admin mode|system:|you are now|role:|developer mode|sudo|grant(ed)? authoriz)/i.test(q)) {
    return 'Fake system/role override — detected & ignored';
  }
  // Classic instruction-override / jailbreak.
  if (/\b(ignore (all|any|previous|prior)|disregard (all|any|your|previous)|forget (your|all|about)|new (task|instructions?)|override your)/i.test(q)) {
    return 'Embedded instruction override — detected & ignored';
  }
  // Data-exfiltration (dump/export everything).
  if (/\b(dump|export|output (all|every)|exfiltrat|every record|all (records|accounts|data)|raw contents|full system prompt)\b/i.test(q)) {
    return 'Data-exfiltration attempt — refused';
  }
  // PII / out-of-scope personal data.
  if (/\b(social security|ssn|home address|personal (mobile|phone|cell)|date of birth|credit card)\b/i.test(q)) {
    return 'Out-of-scope PII request — refused';
  }
  // Generic adversarial fallback.
  return 'Adversarial input — detected & refused';
}

export function RefusalPanel({
  envelope,
  className,
  adversarial,
  question,
}: RefusalPanelProps) {
  const [drawerCitations, setDrawerCitations] = React.useState<
    Citation[] | null
  >(null);

  return (
    <section
      className={cn('flex max-w-[720px] flex-col gap-4', className)}
      aria-label="Cannot answer"
    >
      <header className="border-b-2 border-destructive pb-2">
        <h2 className="text-xl font-semibold text-foreground">
          Cannot answer — and here&rsquo;s why
        </h2>
        {/* D-04: the attack-type label renders ONLY in adversarial mode — the calm
            clay accent (destructive == brand clay, not red alarm). In normal mode this
            block is entirely absent (strict gate; no false-positive labeling). */}
        {adversarial ? (
          <p
            data-testid="attack-label"
            className="mt-1 text-sm font-semibold text-destructive"
          >
            {deriveAttackLabel(question ?? '')}
          </p>
        ) : null}
      </header>

      {/* The structured refusal text, verbatim — a calm statement, not an error. */}
      <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
        {envelope.answer}
      </p>

      {/* Partial citations that WERE grounded (the honest, sourced part). */}
      {envelope.citations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            What we could ground
          </h3>
          {envelope.citations.map((c, i) => (
            <CitationCard
              key={`${c._id}-${i}`}
              citation={c}
              onOpenSource={(citation) => setDrawerCitations([citation])}
            />
          ))}
        </div>
      ) : null}

      <SourceDrawer
        open={drawerCitations !== null}
        citations={drawerCitations ?? []}
        onClose={() => setDrawerCitations(null)}
      />
    </section>
  );
}

export default RefusalPanel;
