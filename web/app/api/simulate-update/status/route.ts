// web/app/api/simulate-update/status/route.ts
//
// CDC-02 status poll for the "Simulate update" progress affordance (Plan 02, Task 2).
//
// The UI polls this to drive a bounded-latency progress indicator (D-03 warm path)
// and to know when a re-ask will reflect the new escalation. Mirrors /api/canary's
// GET + Node runtime + Response.json + generic-503-on-throw shape.
//
//   - `runtime = 'nodejs'` — reads the status marker via node:fs (same process as
//     the trigger route that writes it).
//   - Returns `{ status }` where status ∈ {'idle','running','done','error'} at 200.
//   - On any throw → `{ status: 'error' }` at 503; NEVER serialize error/stack/env
//     (threat T-12-06). readLaneStatus() is itself total, so a throw here is unlikely,
//     but the guard keeps the no-leak contract explicit.

import { readLaneStatus } from '@/lib/trigger-add-lane';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    return Response.json({ status: readLaneStatus() }, { status: 200 });
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
