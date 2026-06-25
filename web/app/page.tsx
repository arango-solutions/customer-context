// web/app/page.tsx
//
// Phase 6 dashboard — Wave 3, Plan 05 (the full end-to-end composition).
//
// This composes the complete IDLE → STREAMING → DONE/REFUSED/ERROR/TIMEOUT state
// machine (UI-SPEC) on top of the Plan-03 `useAsk` seam and the Plan-04 rendering
// surface. It owns NO answer synthesis and rebuilds NONE of the Plan-04 components —
// it only selects + arranges them by the hook's live `phase` + grounded `envelope`.
//
// CARDINAL RULE (CLAUDE.md): the persistent answer is ONLY the terminal-gated
// `data-envelope` (rendered by AnswerBody / RefusalPanel). The streamed `data-step`
// phase is transient progress (the live ReasoningTimeline) — never an answer.
//
// No-dead-air guarantee (UI-03 / D-01): the moment the user submits, the
// ReasoningTimeline is visible with `Planning the approach` active — motion, not a
// spinner — and it stays above the fold while the answer column is still empty.
//
// Layout (UI-SPEC Layout & Responsive Structure):
//   - Desktop ≥1024px (lg): two columns — main (max-w-720px prose) + sticky right rail.
//   - Tablet/mobile: single column, rail drops below the answer with the timeline first
//     so streaming stays visible above the fold.

'use client';

import * as React from 'react';

import { useAsk } from '@/lib/use-ask';
import type { StreamPhase } from '@/lib/ui-message';

import { QuestionBox } from '@/components/QuestionBox';
import { ExampleChips } from '@/components/ExampleChips';
import { ReasoningTimeline } from '@/components/ReasoningTimeline';
import { AnswerBody } from '@/components/AnswerBody';
import { RefusalPanel } from '@/components/RefusalPanel';
import { TrustChip } from '@/components/TrustChip';
import { WhatChangedBanner } from '@/components/WhatChangedBanner';
import { GraphViz } from '@/components/GraphViz';
import { SourcingRail, type SourcingRailHandle } from '@/components/SourcingRail';
import { ErrorState, TimeoutState } from '@/components/ResponseStates';
import { Button } from '@/components/ui/button';

/** The six known D-01 phases — the live `data-step` value the timeline understands. */
const KNOWN_PHASES: ReadonlyArray<StreamPhase> = [
  'planning',
  'querying structured',
  'searching docs',
  'resolving entities',
  'reconciling',
  'answer',
];

/** Narrow the hook's `string | undefined` phase to the timeline's `StreamPhase | null`. */
function asStreamPhase(phase: string | undefined): StreamPhase | null {
  return phase && (KNOWN_PHASES as readonly string[]).includes(phase)
    ? (phase as StreamPhase)
    : null;
}

/** The timeout budget (UI-SPEC: >40s with no final envelope → TimeoutState). */
const TIMEOUT_MS = 40_000;

export default function Home() {
  const { ask, input, setInput, phase, envelope, diff, isStreaming, stop, error } =
    useAsk();

  // The last submitted question — Retry / Keep-waiting re-submit this exact text.
  const [lastQuestion, setLastQuestion] = React.useState('');
  // Latched timeout: flips true if >40s elapse with no final envelope; the user then
  // chooses Keep waiting (clears it, keeps the stream) or Retry (re-submits).
  const [timedOut, setTimedOut] = React.useState(false);

  // CDC-02 (D-08): the single "Simulate update" trigger. POST fires the fixed
  // pre-staged escalation scenario (Plan 02 route) and returns 202 immediately; we
  // then poll the status endpoint until 'done' (the ADD lane is ~4-6 min — Plan 01).
  // The button is disabled while running/done (re-clicking would re-run the full lane);
  // after 'done' the presenter re-asks the same question and the diff renders (D-06).
  const [updateStatus, setUpdateStatus] = React.useState<
    'idle' | 'running' | 'done' | 'error'
  >('idle');

  const simulateUpdate = React.useCallback(async () => {
    if (updateStatus === 'running') return; // serialize (Pitfall 6)
    setUpdateStatus('running');
    try {
      const res = await fetch('/api/simulate-update', { method: 'POST' });
      if (res.status !== 202) {
        setUpdateStatus('error');
        return;
      }
      // Poll status until the async ADD lane lands (the doc-count increase is the
      // completion signal — the POST response is NOT). Bounded by Plan 01's latency.
      const poll = async () => {
        try {
          const s = await fetch('/api/simulate-update/status');
          const { status } = (await s.json()) as { status?: string };
          if (status === 'done') return setUpdateStatus('done');
          if (status === 'error') return setUpdateStatus('error');
          setTimeout(poll, 3000);
        } catch {
          setUpdateStatus('error');
        }
      };
      setTimeout(poll, 3000);
    } catch {
      setUpdateStatus('error');
    }
  }, [updateStatus]);

  const updateLabel: Record<typeof updateStatus, string> = {
    idle: 'Simulate update',
    running: 'Applying update… (~5 min)',
    done: 'Update applied — re-ask to see what changed',
    error: 'Update failed — retry',
  };

  const submit = React.useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      setLastQuestion(trimmed);
      setTimedOut(false);
      ask(trimmed);
    },
    [ask],
  );

  // Arm the 40s timeout while streaming with no envelope yet; disarm on envelope /
  // error / stream end. Keep-waiting resets `timedOut` and re-arms via this effect.
  React.useEffect(() => {
    if (!isStreaming || envelope || error || timedOut) return;
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isStreaming, envelope, error, timedOut]);

  const retry = React.useCallback(() => {
    if (lastQuestion) submit(lastQuestion);
  }, [lastQuestion, submit]);

  const keepWaiting = React.useCallback(() => setTimedOut(false), []);

  // ── State selection (single source of truth for what the main column shows) ──
  // IDLE: nothing asked yet. STREAMING: in flight, no final envelope. ERROR: stream
  // failed. TIMEOUT: >40s, no envelope, user hasn't chosen yet. DONE/REFUSED: envelope.
  const isIdle = !isStreaming && !envelope && !phase && !error;
  const showError = !!error && !envelope;
  const showTimeout = timedOut && !envelope && !showError;
  const showStreamingOnly = isStreaming && !envelope && !showError && !showTimeout;

  const railRef = React.useRef<SourcingRailHandle>(null);
  const currentPhase = asStreamPhase(phase);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[28px] font-semibold leading-tight">
            Ask across both graphs.
          </h1>
          {/* CDC-02 / D-08: the single "Simulate update" trigger. Disabled while the
              ADD lane is running or after it has applied (re-running would duplicate);
              the presenter re-asks to reveal the diff (D-06). */}
          <Button
            type="button"
            variant={updateStatus === 'error' ? 'destructive' : 'outline'}
            onClick={simulateUpdate}
            disabled={updateStatus === 'running' || updateStatus === 'done'}
            aria-busy={updateStatus === 'running'}
            className="shrink-0"
          >
            {updateLabel[updateStatus]}
          </Button>
        </div>
        <p className="text-base text-muted-foreground">
          Every answer is traced to the record, graph, and query it came from.
          {isIdle ? ' Try one of these, or ask your own:' : null}
        </p>
      </header>

      <QuestionBox
        value={input}
        onChange={setInput}
        onSubmit={submit}
        isStreaming={isStreaming}
        onStop={stop}
      />

      {/* IDLE — the only screen with no rail (EmptyState): chips FILL the box.
          `value` lets the picked chip render selected (and deselect on edit). */}
      {isIdle ? <ExampleChips onPick={setInput} value={input} /> : null}

      {/* Once a question is asked, the two-column desktop layout (main + sticky rail).
          The rail stacks below the main column on tablet/mobile; during the empty-answer
          stream the live timeline renders in the MAIN column so it stays above the fold. */}
      {!isIdle ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── Main column: the answer surface (or the live timeline / failure) ── */}
          <section
            aria-label="Answer"
            className="flex min-w-0 flex-col gap-4"
            data-testid="answer-column"
          >
            {showError ? (
              <ErrorState onRetry={retry} reason={error?.message} />
            ) : showTimeout ? (
              <TimeoutState onKeepWaiting={keepWaiting} onRetry={retry} />
            ) : envelope ? (
              <>
                {/* UI-06 / D-11: per-answer TrustChip adjacent to the answer headline.
                    Reads the TERMINAL grounded envelope only — never mid-stream state.
                    Shows "Grounded ✓" for grounded answers and "Partially grounded"
                    for refused/partial envelopes (CARDINAL RULE: terminal envelope only). */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {lastQuestion}
                  </span>
                  <TrustChip envelope={envelope} />
                </div>
                {envelope.refused ? (
                  <RefusalPanel envelope={envelope} />
                ) : (
                  <>
                    {/* CDC-03 (D-04): one grounded "what-changed" banner ABOVE the
                        single answer (not side-by-side). Renders nothing on a first
                        ask (diff === null) or when there is no grounded change. */}
                    <WhatChangedBanner diff={diff} envelope={envelope} />
                    <AnswerBody
                      envelope={envelope}
                      changedClaimIndices={diff?.addedClaims}
                      onOpenSource={(citations) =>
                        railRef.current?.openSource(citations)
                      }
                    />
                    {/* Phase 11 D3 pivot: the cross-graph VISUAL renders full-width
                        directly under the answer (always visible, not behind a rail
                        toggle). Node click → the SAME rail-owned SourceDrawer. */}
                    <section aria-label="Cross-graph visualization" className="mt-2">
                      <h2 className="mb-2 text-lg font-semibold text-foreground">
                        Cross-graph traversal
                      </h2>
                      <GraphViz
                        retrievalPath={envelope.retrievalPath}
                        citations={envelope.citations}
                        onOpenSource={(citations) =>
                          railRef.current?.openSource(citations)
                        }
                      />
                    </section>
                  </>
                )}
              </>
            ) : (
              // STREAMING with no envelope yet: the live timeline IS the main column —
              // visible immediately on submit (no dead air), above the fold.
              <div data-testid="streaming-timeline" aria-live="polite">
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  Reasoning
                </h2>
                <ReasoningTimeline currentPhase={currentPhase} />
              </div>
            )}
          </section>

          {/* ── Right rail: the persistent SourcingRail once an envelope exists ──
              Before the envelope (pure streaming) the rail has nothing to source yet —
              the live timeline above carries the no-dead-air signal. On desktop the rail
              is sticky; on smaller breakpoints it stacks below the main column. */}
          {envelope ? (
            <SourcingRail
              ref={railRef}
              envelope={envelope}
              currentPhase={showStreamingOnly ? currentPhase : null}
              className="rounded-lg"
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
