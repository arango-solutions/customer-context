// web/test/simulate-update.test.ts
//
// Unit-proves the Node-runtime /api/simulate-update POST trigger (Plan 02, Task 1)
// WITHOUT spawning a real build. The kickoff helper (@/lib/trigger-add-lane) is
// mocked so the handler is exercised in isolation:
//   - empty body → 202 + kickoff fired exactly once (fire-and-return-202),
//   - unknown/extra field in the body → 400 + kickoff NOT fired (T-12-02: no
//     client-supplied scenario),
//   - malformed JSON body → 400 (no 500 / no leak),
//   - kickoff throws → generic 500 with NO stack/secret text in the body (T-12-06).
//
// The route fires a FIXED scenario: kickOffAddLane() is called with NO arguments,
// so no client input can reach the spawned command.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the kickoff helper so the test never spawns add_lane.py.
const kickOffAddLane = vi.fn();
vi.mock('@/lib/trigger-add-lane', () => ({
  kickOffAddLane: () => kickOffAddLane(),
}));

// Import AFTER vi.mock so the route picks up the mocked module.
import { POST } from '../app/api/simulate-update/route';

function makeReq(body?: unknown, rawOverride?: string): Request {
  return new Request('http://localhost/api/simulate-update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawOverride ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

describe('/api/simulate-update POST', () => {
  beforeEach(() => {
    kickOffAddLane.mockReset();
  });

  it('empty body → 202 and fires the kickoff exactly once (no args)', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(202);
    expect(kickOffAddLane).toHaveBeenCalledTimes(1);
    // Fixed scenario: the route passes NO client input to the kickoff.
    expect(kickOffAddLane).toHaveBeenCalledWith();
  });

  it('absent body → 202 (an empty POST is valid)', async () => {
    const res = await POST(makeReq(undefined));
    expect(res.status).toBe(202);
    expect(kickOffAddLane).toHaveBeenCalledTimes(1);
  });

  it('unknown/extra field → 400 and never fires the kickoff (T-12-02)', async () => {
    const res = await POST(makeReq({ module: 'evil', account: 'x' }));
    expect(res.status).toBe(400);
    expect(kickOffAddLane).not.toHaveBeenCalled();
  });

  it('malformed JSON body → 400 (does not 500 / leak)', async () => {
    const res = await POST(makeReq(undefined, '{ not json'));
    expect(res.status).toBe(400);
    expect(kickOffAddLane).not.toHaveBeenCalled();
  });

  it('kickoff throws → generic 500 with NO stack/secret text', async () => {
    kickOffAddLane.mockImplementation(() => {
      throw new Error('SECRET_STACK at trigger-add-lane.ts:42 ARANGO_PASSWORD=hunter2');
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(500);

    const text = await res.text();
    expect(text).not.toContain('SECRET_STACK');
    expect(text).not.toContain('ARANGO_PASSWORD');
    expect(text).not.toContain('trigger-add-lane.ts');
    expect(text).not.toMatch(/Error:/);
  });
});
