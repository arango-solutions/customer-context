// web/lib/use-ask.ts
//
// The client wiring for the streaming seam (UI-03 / SRC-04). Wraps `@ai-sdk/react`
// `useChat` pointed at the Node-runtime `/api/ask` route and turns the SSE stream into
// two pieces of state the dashboard renders:
//
//   - `phase`    — driven by the TRANSIENT `data-step` parts via `onData`: the live
//                  reasoning-rail signal that kills dead air the instant the user asks
//                  (the 14–25s window — UI-03). One of the six D-01 phase labels.
//   - `envelope` — the PERSISTENT `data-envelope` part extracted from the latest
//                  message's `parts`: the code-grounded answer (Plan 04 renders it).
//
// CARDINAL RULE (CLAUDE.md): the persistent answer is ONLY the terminal-gated
// `data-envelope`. The transient `data-step` parts are progress, never an answer — so
// this hook deliberately keeps them in throwaway `phase` state and never treats a step
// as a claim.
//
// The route expects a `{ question }` body (not the SDK's default `{ messages }`), so the
// transport's `prepareSendMessagesRequest` lifts the latest user message text into
// `{ question }`. `ask(question)` is a thin `sendMessage({ text })` wrapper so the page
// never reaches for the raw SDK surface.

'use client';

import { useCallback, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage, type UIDataTypes } from 'ai';
import type { Envelope } from 'customer360-agent';
import type { C360UIDataParts } from './ui-message';

/**
 * The app's custom data parts, widened to satisfy the SDK's `UIDataTypes`
 * (`Record<string, unknown>`) constraint. `C360UIDataParts` (the shared Wave-1
 * contract) is a fixed-key interface, so it lacks the index signature the generic
 * requires; intersecting with `UIDataTypes` adds it without forking the contract.
 */
export type C360DataParts = C360UIDataParts & UIDataTypes;

/** The typed UI message for this app: the two custom data parts the stream carries. */
export type C360UIMessage = UIMessage<unknown, C360DataParts>;

/** The surface the dashboard (and Plan 04) consumes. */
export interface UseAskResult {
  /** Submit a free-form question (thin wrapper over sendMessage({ text })). */
  ask: (question: string) => void;
  /** The current question-box value. */
  input: string;
  /** Set the question-box value — example chips call this to FILL the box. */
  setInput: (value: string) => void;
  /** The live reasoning phase from the transient data-step parts (undefined until first step). */
  phase: string | undefined;
  /** The terminal-gated grounded answer from the persistent data-envelope part. */
  envelope: Envelope | undefined;
  /** The SDK chat status ('submitted' | 'streaming' | 'ready' | 'error'). */
  status: ReturnType<typeof useChat<C360UIMessage>>['status'];
  /** True while a request is in flight (Ask disabled / Stop affordance). */
  isStreaming: boolean;
  /** Abort the in-flight stream (the Stop affordance). */
  stop: () => void;
  /** The last stream error, if any (drives the ErrorState). */
  error: Error | undefined;
}

/** Extract the persistent data-envelope payload from the latest message's parts. */
export function selectEnvelope(
  messages: ReadonlyArray<C360UIMessage>,
): Envelope | undefined {
  const last = messages.at(-1);
  if (!last) return undefined;
  const part = last.parts.find((p) => p.type === 'data-envelope');
  // The data-envelope payload is the agent's Envelope (ui-message.ts maps it).
  return part && 'data' in part ? (part.data as Envelope) : undefined;
}

export function useAsk(): UseAskResult {
  const [input, setInput] = useState('');
  // The live phase from the transient data-step parts (never persisted as an answer).
  const [phase, setPhase] = useState<string | undefined>(undefined);

  const { messages, sendMessage, status, stop, error } = useChat<C360UIMessage>({
    transport: new DefaultChatTransport({
      api: '/api/ask',
      // The route validates a `{ question }` body — lift the latest user text into it.
      prepareSendMessagesRequest: ({ messages: msgs }) => {
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        const question =
          lastUser?.parts
            .filter((p) => p.type === 'text')
            .map((p) => ('text' in p ? p.text : ''))
            .join('') ?? '';
        return { body: { question } };
      },
    }),
    onData: (part) => {
      // Transient progress only — advance the live rail, never treat as a claim.
      if (part.type === 'data-step') {
        const data = part.data as { phase?: string };
        if (data?.phase) setPhase(data.phase);
      }
    },
  });

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      setPhase('planning'); // optimistic: rail shows life before the first server step
      void sendMessage({ text: trimmed });
    },
    [sendMessage],
  );

  const isStreaming = status === 'submitted' || status === 'streaming';

  return {
    ask,
    input,
    setInput,
    phase,
    envelope: selectEnvelope(messages),
    status,
    isStreaming,
    stop,
    error,
  };
}
