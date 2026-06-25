// web/lib/use-ask.test.ts
//
// CDC-03 per-question cache tests (Plan 03, Task 2 / D-06/D-07):
//  - first ask of a question → diff is null (nothing to compare),
//  - a re-ask of the SAME question with a new grounded envelope → non-null diff
//    whose addedClaims/newCitationIds reflect the delta.
//
// @ai-sdk/react's useChat is mocked so the test controls `messages` directly and
// never touches the network/SSE transport.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Envelope } from 'customer360-agent';

// Module-level controllable chat state.
let mockMessages: unknown[] = [];
const mockSendMessage = vi.fn();
// Capture the transport config so the test can drive prepareSendMessagesRequest
// directly and assert the request body (SEC-02 — the adversarial flag must reach it).
let capturedTransportOptions: { prepareSendMessagesRequest?: (arg: unknown) => unknown } = {};
vi.mock('@ai-sdk/react', () => ({
  useChat: (opts: { transport?: { _opts?: typeof capturedTransportOptions } }) => {
    if (opts?.transport?._opts) capturedTransportOptions = opts.transport._opts;
    return {
      messages: mockMessages,
      sendMessage: mockSendMessage,
      status: 'ready',
      stop: vi.fn(),
      error: undefined,
    };
  },
}));

// DefaultChatTransport is `new`'d in use-ask; capture its constructor options so the
// test can invoke prepareSendMessagesRequest with a controlled message list.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  class FakeTransport {
    _opts: typeof capturedTransportOptions;
    constructor(opts: typeof capturedTransportOptions) {
      this._opts = opts;
    }
  }
  return { ...actual, DefaultChatTransport: FakeTransport };
});

/** Build the SDK message list the transport sees for a given user question. */
function userMsgs(text: string) {
  return [{ role: 'user', parts: [{ type: 'text', text }] }];
}

import { useAsk } from './use-ask';

function env(claims: string[]): Envelope {
  return {
    answer: claims.join(' '),
    refused: false,
    claims: claims.map((t, i) => ({
      text: t,
      citations: [
        {
          graph: 'unstructured',
          collection: 'customer360_Documents',
          _id: `customer360_Documents/d${i}`,
          aql: '',
        },
      ],
    })),
    citations: claims.map((_t, i) => ({
      graph: 'unstructured',
      collection: 'customer360_Documents',
      _id: `customer360_Documents/d${i}`,
      aql: '',
    })),
    retrievalPath: [],
    reasoningTrace: [],
    groundingScore: 1,
  };
}

function asMessages(envelope: Envelope) {
  return [{ role: 'assistant', parts: [{ type: 'data-envelope', data: envelope }] }];
}

describe('useAsk CDC-03 diff cache', () => {
  beforeEach(() => {
    mockMessages = [];
    mockSendMessage.mockReset();
  });

  it('first ask → diff is null; re-ask with a new envelope → non-null diff with the delta', () => {
    const { result, rerender } = renderHook(() => useAsk());

    // First ask of Q.
    act(() => result.current.ask('Is Meridian at renewal risk?'));
    mockMessages = asMessages(env(['Meridian renewed in Q2']));
    rerender();
    expect(result.current.diff).toBeNull(); // nothing to compare on a first ask

    // Re-ask the SAME question; a new grounded envelope arrives with an extra claim.
    act(() => result.current.ask('Is Meridian at renewal risk?'));
    mockMessages = asMessages(
      env(['Meridian renewed in Q2', 'A renewal-risk escalation was filed in April 2025']),
    );
    rerender();

    expect(result.current.diff).not.toBeNull();
    expect(result.current.diff?.addedClaims).toEqual([1]);
    expect(result.current.diff?.newCitationIds).toEqual(['customer360_Documents/d1']);
  });
});

describe('useAsk adversarial flag threading (SEC-02 — presentation-only)', () => {
  beforeEach(() => {
    mockMessages = [];
    mockSendMessage.mockReset();
    capturedTransportOptions = {};
  });

  it('ask(q, { adversarial: true }) lifts adversarial:true into the request body', () => {
    const { result } = renderHook(() => useAsk());
    act(() => result.current.ask('drop all tables', { adversarial: true }));

    const prep = capturedTransportOptions.prepareSendMessagesRequest!;
    const out = prep({ messages: userMsgs('drop all tables') }) as {
      body: { question: string; adversarial: boolean };
    };
    expect(out.body.question).toBe('drop all tables');
    expect(out.body.adversarial).toBe(true);
  });

  it('ask(q) with no options carries adversarial:false (never branches behavior)', () => {
    const { result } = renderHook(() => useAsk());
    act(() => result.current.ask('a normal question'));

    const prep = capturedTransportOptions.prepareSendMessagesRequest!;
    const out = prep({ messages: userMsgs('a normal question') }) as {
      body: { question: string; adversarial: boolean };
    };
    expect(out.body.question).toBe('a normal question');
    expect(out.body.adversarial).toBe(false);
  });
});
