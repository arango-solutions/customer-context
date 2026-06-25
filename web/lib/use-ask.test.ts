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
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    status: 'ready',
    stop: vi.fn(),
    error: undefined,
  }),
}));

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
