// web/lib/trigger-add-lane.ts
//
// CDC-02 kickoff helper for the "Simulate update" trigger (Phase 12 Plan 02).
//
// Fires the FIXED, pre-staged escalation scenario by spawning Plan 01's
// `scripts/add_lane.py` as a detached child process and tracking its lifecycle
// via a tiny status marker file. The trigger route calls kickOffAddLane() and
// returns 202 immediately (it does NOT await the build); the status route reads
// readLaneStatus() to drive the UI's bounded-latency progress affordance.
//
// Security posture (threat T-12-02 / Security V4/V5):
//   - kickOffAddLane takes NO arguments and interpolates NO client input. It
//     always runs the exact same fixed command: `python scripts/add_lane.py`.
//     The scenario (which doc / account / module) is fixed in the pre-staged
//     corpus from Plan 01 — the route is NOT a generic write primitive.
//   - Serialized (threat T-12-04 DoS): if a job is already 'running', the
//     kickoff is a no-op — one build at a time (RESEARCH Pitfall 6; the
//     orchestrate path also self-retries 409). The UI button is additionally
//     disabled while running (Plan 03).
//
// Latency posture (threat T-12-05 / RESEARCH Pitfall 5): the build is
// seconds-to-minutes (~4-6 min, see 12-01-SUMMARY) — far past the route's 60s
// maxDuration — so it MUST run out-of-band. We spawn and return; the status
// marker (not the HTTP response) carries completion.
//
// Demo scope (presenter-driven, RESEARCH Open Question 3): this runs on the
// presenter's local Node process (`next dev`), which is long-lived, so the
// parent stays alive to record the child's exit. A second click after 'done'
// would re-run the full lane (re-upload → duplicate source); the demo flow is
// reset → single click, and the button disables after done (Plan 03), so this
// is acceptable for the demo and intentionally not guarded here.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LaneStatus = 'idle' | 'running' | 'done' | 'error';

// The status marker lives in the OS temp dir — shared across the trigger and
// status routes within the same Node process; absent file == 'idle'.
const STATUS_FILE = path.join(os.tmpdir(), 'customer360-add-lane-status.json');

// The fixed script the trigger runs. NEVER built from client input.
const ADD_LANE_SCRIPT = path.join('scripts', 'add_lane.py');

/** Walk up from the current working directory to locate the repo root (the dir
 * containing scripts/add_lane.py). `next dev` runs with cwd === web/, so the
 * root is normally one level up; the walk makes it robust to other cwds. */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, ADD_LANE_SCRIPT))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume cwd is web/ and the repo root is its parent.
  return path.resolve(process.cwd(), '..');
}

function writeLaneStatus(status: LaneStatus): void {
  writeFileSync(STATUS_FILE, JSON.stringify({ status, ts: Date.now() }));
}

/** Read the current lane status. Any missing/corrupt marker reads as 'idle'.
 * Never throws — the status route depends on this being total. */
export function readLaneStatus(): LaneStatus {
  try {
    if (!existsSync(STATUS_FILE)) return 'idle';
    const parsed = JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as { status?: unknown };
    const s = parsed?.status;
    return s === 'running' || s === 'done' || s === 'error' || s === 'idle' ? s : 'idle';
  } catch {
    return 'idle';
  }
}

/** Fire the fixed escalation scenario out-of-band. No-op while a job is already
 * running (serialize). Returns immediately — does NOT await the build. */
export function kickOffAddLane(): void {
  // Serialize: one build at a time (T-12-04). A concurrent click is ignored.
  if (readLaneStatus() === 'running') return;

  const repoRoot = findRepoRoot();
  const python = process.env.PYTHON_BIN || 'python3';

  // Mark running BEFORE spawn so a racing second call sees 'running' and no-ops.
  writeLaneStatus('running');

  // FIXED command — no interpolated client input (T-12-02). Detached so the
  // build outlives the request; stdio ignored (no secrets to stdout).
  const child = spawn(python, [ADD_LANE_SCRIPT], {
    cwd: repoRoot,
    stdio: 'ignore',
    detached: true,
  });

  child.on('exit', (code) => {
    writeLaneStatus(code === 0 ? 'done' : 'error');
  });
  child.on('error', () => {
    // Spawn failed (e.g. python not found) — surface as a generic error status.
    writeLaneStatus('error');
  });
}
