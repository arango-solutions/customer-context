// web/app/page.tsx
//
// Phase 6 dashboard — Wave 2, Plan 03 (the streaming SEAM).
//
// This composes the free-form QuestionBox (UI-01) + the fill-the-box ExampleChips
// (Q12 first) and wires them to the `useAsk` hook, which streams `/api/ask` and exposes
// the live `phase` (transient data-step) + the grounded `envelope` (persistent
// data-envelope). This plan owns ONLY the seam: input → stream → phase/envelope state.
//
// PLAN-04 RENDERING SEAM (clearly marked below): Plan 04 builds the answer + sourcing
// surface (AnswerBody, SourcingRail, ReasoningTimeline, CitationCard, SourceDrawer,
// RefusalPanel, etc.) that CONSUMES `phase` + `envelope`. For now this page renders a
// minimal placeholder for those values so the seam is exercised end-to-end without
// reaching into Plan 04's components.

'use client';

import { useAsk } from '@/lib/use-ask';
import { QuestionBox } from '@/components/QuestionBox';
import { ExampleChips } from '@/components/ExampleChips';

export default function Home() {
  const { ask, input, setInput, phase, envelope, isStreaming, stop } = useAsk();

  const isEmpty = !isStreaming && !envelope && !phase;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold leading-tight">
          Ask across both graphs.
        </h1>
        <p className="text-base text-muted-foreground">
          Every answer is traced to the record, graph, and query it came from.
          {isEmpty ? ' Try one of these, or ask your own:' : null}
        </p>
      </header>

      <QuestionBox
        value={input}
        onChange={setInput}
        onSubmit={ask}
        isStreaming={isStreaming}
        onStop={stop}
      />

      {isEmpty ? (
        // ExampleChips FILL the box (never auto-submit) — Q12 first + featured.
        <ExampleChips onPick={setInput} />
      ) : null}

      {/* ───────────────────────── PLAN-04 RENDERING SEAM ─────────────────────────
          Plan 04 replaces this block with the AnswerBody + persistent SourcingRail
          (ReasoningTimeline ← `phase`, AnswerBody/RefusalPanel + CitationCards ←
          `envelope`). Until then, render minimal placeholders so the streaming seam
          is verifiable end-to-end. Do NOT add answer-synthesis here. */}
      {!isEmpty ? (
        <section aria-label="Answer (Plan 04 rendering seam)" className="flex flex-col gap-4">
          {phase ? (
            <p
              className="text-sm font-semibold text-muted-foreground"
              aria-live="polite"
              data-testid="phase-placeholder"
            >
              {phase}…
            </p>
          ) : null}
          {envelope ? (
            <p className="text-base" data-testid="answer-placeholder">
              {envelope.answer}
            </p>
          ) : null}
        </section>
      ) : null}
      {/* ─────────────────────── END PLAN-04 RENDERING SEAM ─────────────────────── */}
    </main>
  );
}
