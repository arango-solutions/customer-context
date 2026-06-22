// web/test/route.test.ts
//
// Unit-proves the Node-runtime /api/ask Route Handler (Plan 03, Task 1) WITHOUT a
// live agent / model / DB. The agent's streaming entry (`customer360-agent/stream`)
// is mocked so the handler under test is exercised in isolation:
//   - a valid body → 200 + the streamed Response the agent returned (passed through),
//   - missing / empty / non-string `question` → 400,
//   - an oversized `question` (beyond the 2000-char cap) → 400,
//   - an unexpected throw while constructing the stream → generic 500 with NO stack
//     text in the body (Security Domain V5 / threat T-06-07: no stack/secret leakage).
//
// CARDINAL RULE (CLAUDE.md): the route adds NO answer-synthesis surface — it returns
// askQuestionStream's Response directly. These tests assert exactly that pass-through.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agent's streaming entry. The handler imports `askQuestionStream` from
// 'customer360-agent/stream'; the mock returns a sentinel Response so the test never
// touches a live model/DB and can assert the route passes the Response through verbatim.
const askQuestionStream = vi.fn();
vi.mock('customer360-agent/stream', () => ({
  askQuestionStream: (q: string) => askQuestionStream(q),
}));

// Import AFTER vi.mock so the route picks up the mocked module.
import { POST } from '../app/api/ask/route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/ask POST', () => {
  beforeEach(() => {
    askQuestionStream.mockReset();
  });

  it('valid body → 200 and returns the agent-streamed Response (pass-through)', async () => {
    const sentinel = new Response('STREAMED-BODY', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    askQuestionStream.mockReturnValue(sentinel);

    const res = await POST(makeReq({ question: 'Is Meridian actually happy?' }));

    expect(res.status).toBe(200);
    // The route trims and forwards the question to the agent verbatim.
    expect(askQuestionStream).toHaveBeenCalledTimes(1);
    expect(askQuestionStream).toHaveBeenCalledWith('Is Meridian actually happy?');
    // The exact Response object is passed through (no re-wrapping / re-synthesis).
    expect(res).toBe(sentinel);
  });

  it('missing question → 400 and never invokes the agent', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(askQuestionStream).not.toHaveBeenCalled();
  });

  it('empty / whitespace-only question → 400', async () => {
    const res = await POST(makeReq({ question: '   ' }));
    expect(res.status).toBe(400);
    expect(askQuestionStream).not.toHaveBeenCalled();
  });

  it('non-string question → 400', async () => {
    const res = await POST(makeReq({ question: 42 }));
    expect(res.status).toBe(400);
    expect(askQuestionStream).not.toHaveBeenCalled();
  });

  it('oversized question (beyond the 2000-char cap) → 400', async () => {
    const res = await POST(makeReq({ question: 'x'.repeat(2001) }));
    expect(res.status).toBe(400);
    expect(askQuestionStream).not.toHaveBeenCalled();
  });

  it('a thrown error while constructing the stream → generic 500 with NO stack text', async () => {
    askQuestionStream.mockImplementation(() => {
      throw new Error('SECRET_STACK at db.ts:42 ARANGO_PASSWORD=hunter2');
    });

    const res = await POST(makeReq({ question: 'trigger a throw' }));
    expect(res.status).toBe(500);

    const body = await res.text();
    // The generic 500 must NOT echo the error message / stack / secret.
    expect(body).not.toContain('SECRET_STACK');
    expect(body).not.toContain('ARANGO_PASSWORD');
    expect(body).not.toContain('db.ts');
    expect(body).not.toMatch(/Error:/);
  });

  it('malformed JSON body → 400 (does not 500 / leak)', async () => {
    const req = new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(askQuestionStream).not.toHaveBeenCalled();
  });
});
