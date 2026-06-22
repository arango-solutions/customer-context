// scripts/eval-gate.ts
//
// EVAL-04: The single pre-demo gate command for Customer360.
//
// Usage:
//   npx tsx scripts/eval-gate.ts
//
// Requires OPENAI_API_KEY + ARANGO_* in env (or repo-root .env).
// Invokes vitest headlessly, collects per-question results, prints a formatted
// summary table, and implements bounded 1-retry logic to distinguish genuine
// regression from transient stochastic flake.
//
// Exit codes:
//   0  — GATE: GREEN   (all pass on run-1, or all pass on run-2 after a run-1 flake)
//   1  — GATE: RED     (confirmed failure on BOTH run-1 AND run-2)
//
// Threat T-08-01: summary output NEVER emits env var values (OPENAI_API_KEY, ARANGO_*).
// Follow existing rehearse.ts discipline — secrets never logged.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

// ── env loading ───────────────────────────────────────────────────────────────
// Mirror the pattern used in agent/src/db.ts::loadEnv() so OPENAI_API_KEY and
// ARANGO_* come from the repo-root .env (override: true prevents a stale shell
// value from shadowing it — the D-06 env gotcha).
// Derive the scripts directory using process.argv[1] (path of the running script),
// which avoids import.meta.url (not allowed when rootDir includes CJS-scope files).
const SCRIPTS_DIR = path.dirname(process.argv[1]);

dotenv.config({ path: path.resolve(SCRIPTS_DIR, '../.env'), override: true });

// ── paths ─────────────────────────────────────────────────────────────────────
const AGENT_DIR = path.resolve(SCRIPTS_DIR, '../agent');

// ── types ─────────────────────────────────────────────────────────────────────

interface AssertionResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo';
  failureMessages: string[];
}

interface TestFileResult {
  testFilePath: string;
  assertionResults: AssertionResult[];
}

interface VitestJsonOutput {
  testResults: TestFileResult[];
  numPassedTests: number;
  numFailedTests: number;
  numTotalTests: number;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  failureMessage?: string;
}

interface VitestRunResult {
  passed: boolean;
  tests: TestResult[];
  rawOutput: string;
}

// ── vitest runner ─────────────────────────────────────────────────────────────

/**
 * Run vitest against the questions.eval test file, optionally filtered by test name.
 * Uses spawnSync (no extra dep — tsx is already available).
 */
function runVitest(testNameFilter?: string): VitestRunResult {
  const args = ['vitest', 'run', '--reporter=json'];
  if (testNameFilter) {
    args.push('-t', testNameFilter);
  }
  args.push('--', 'questions.eval');

  const result = spawnSync('npx', args, {
    cwd: AGENT_DIR,
    env: process.env,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const rawOutput = result.stdout ?? '';
  const rawErr = result.stderr ?? '';

  // vitest --reporter=json writes to stdout; parse it
  let parsed: VitestJsonOutput | null = null;
  try {
    parsed = JSON.parse(rawOutput) as VitestJsonOutput;
  } catch {
    // JSON parse failed — try to find JSON substring in stdout
    const jsonStart = rawOutput.indexOf('{');
    if (jsonStart !== -1) {
      try {
        parsed = JSON.parse(rawOutput.slice(jsonStart)) as VitestJsonOutput;
      } catch {
        // still failed
      }
    }
  }

  if (!parsed) {
    // If subprocess exited non-zero and JSON not parseable, emit helpful error
    if ((result.status ?? 1) !== 0 && !rawOutput.trim() && !rawErr.trim()) {
      console.error(
        'ERROR: vitest subprocess failed to start — check env vars (OPENAI_API_KEY, ARANGO_ENDPOINT)',
      );
    } else if (!rawOutput.trim()) {
      console.error('ERROR: vitest produced no output. stderr:', rawErr.slice(0, 500));
    }
    return { passed: result.status === 0, tests: [], rawOutput: rawErr };
  }

  const tests: TestResult[] = [];
  for (const fileResult of parsed.testResults ?? []) {
    for (const assertion of fileResult.assertionResults ?? []) {
      tests.push({
        name: assertion.title,
        status: assertion.status === 'passed' ? 'passed'
          : assertion.status === 'skipped' ? 'skipped'
          : 'failed',
        failureMessage: assertion.failureMessages?.[0],
      });
    }
  }

  return {
    passed: result.status === 0,
    tests,
    rawOutput,
  };
}

// ── score extraction ──────────────────────────────────────────────────────────

/**
 * Extract faithfulness score from a vitest failure message.
 * The messages use the pattern: expect(score, 'Q2 unsupported claims: ...')
 * In the JSON output the failureMessage contains "AssertionError: ..." and the
 * message string is embedded in the error text.
 */
function extractFaithfulnessScore(failureMessage?: string): string {
  if (!failureMessage) return '—';
  // Pattern: "faithfulness: 0.5" or score number after "score" or "0." followed by digits
  const scoreMatch = failureMessage.match(/\b(0\.\d+|1\.0+|1)\b/);
  return scoreMatch ? scoreMatch[1] : '—';
}

// ── summary table ─────────────────────────────────────────────────────────────

const LOCKED_QUESTION_LABELS = ['Q7', 'Q2', 'Q12', 'Q9', 'Q5', 'Q8'];

function classifyTest(name: string): 'locked' | 'refusal' | 'adversarial' | 'other' {
  const upper = name.toUpperCase();
  if (LOCKED_QUESTION_LABELS.some((q) => upper.includes(q))) return 'locked';
  if (
    upper.includes('REFUSAL') ||
    upper.includes('OUT-OF-SCOPE') ||
    upper.includes('HOME ADDRESS')
  )
    return 'refusal';
  if (
    upper.includes('ADVERSARIAL') ||
    upper.includes('PII') ||
    upper.includes('SSN') ||
    upper.includes('NON-EXISTENT') ||
    upper.includes('HOME ADDRESS')
  )
    return 'adversarial';
  return 'other';
}

function statusSymbol(status: 'passed' | 'failed' | 'skipped', flakeRecovered = false): string {
  if (flakeRecovered) return 'FLAKE-RECOVERED';
  if (status === 'passed') return 'PASS';
  if (status === 'skipped') return 'SKIP';
  return 'FAIL';
}

/**
 * Print a formatted summary table showing per-question status and faithfulness scores.
 * run2Tests is null if no retry was needed.
 * flakeRecoveredNames lists test names that failed on run-1 but passed on run-2.
 */
function printSummaryTable(
  run1Tests: TestResult[],
  run2Tests: TestResult[] | null,
  flakeRecoveredNames: string[],
): void {
  if (run1Tests.length === 0) {
    console.log('  (no test results — check vitest output above)');
    return;
  }

  const sections: Array<{ label: string; tests: TestResult[] }> = [
    { label: 'LOCKED QUESTIONS', tests: run1Tests.filter((t) => classifyTest(t.name) === 'locked') },
    { label: 'REFUSAL', tests: run1Tests.filter((t) => classifyTest(t.name) === 'refusal') },
    { label: 'ADVERSARIAL', tests: run1Tests.filter((t) => classifyTest(t.name) === 'adversarial') },
    { label: 'OTHER', tests: run1Tests.filter((t) => classifyTest(t.name) === 'other') },
  ];

  for (const section of sections) {
    if (section.tests.length === 0) continue;
    console.log(`\n${section.label} (${section.tests.length})`);

    for (const test of section.tests) {
      const isFlakeRecovered = flakeRecoveredNames.includes(test.name);
      const run2Test = run2Tests?.find((t) => t.name === test.name);

      let sym: string;
      if (test.status === 'passed') {
        sym = statusSymbol('passed');
      } else if (isFlakeRecovered && run2Test?.status === 'passed') {
        sym = statusSymbol('failed', true);
      } else {
        sym = statusSymbol('failed');
      }

      // Extract score: if run-1 failed, show both run-1 and run-2 scores if available
      const score1 = test.status === 'failed' ? extractFaithfulnessScore(test.failureMessage) : '—';
      const score2 = isFlakeRecovered && run2Test
        ? extractFaithfulnessScore(run2Test.failureMessage)
        : null;

      const scoreStr = score2 !== null ? `score=${score1}→${score2}` : (score1 !== '—' ? `score=${score1}` : '');
      const nameShort = test.name.slice(0, 60);

      console.log(
        `  ${sym.padEnd(16)}  ${nameShort}${scoreStr ? `  [${scoreStr}]` : ''}`,
      );
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('=== Customer360 Eval Gate (Phase 8) ===');
  console.log(`Date: ${now}`);
  console.log(`Agent dir: ${AGENT_DIR}`);
  console.log('');

  // ─ Run 1 ────────────────────────────────────────────────────────────────────
  console.log('Run 1/1 (full suite) ...');
  const run1 = runVitest();

  const run1Failures = run1.tests.filter((t) => t.status === 'failed');

  if (run1Failures.length === 0) {
    // All passed on run-1
    const total = run1.tests.filter((t) => t.status !== 'skipped').length;
    printSummaryTable(run1.tests, null, []);
    console.log('');
    console.log(`SUMMARY:  ${total}/${total} PASS  |  GATE: GREEN  |  exit 0`);
    process.exit(0);
  }

  // ─ Run 2 (retry failing tests only) ─────────────────────────────────────────
  console.log(`\nRun-1: ${run1Failures.length} failure(s). Retrying failing tests (run 2/2) ...`);

  // Build the -t filter: escape all regex special characters in test names so that
  // names containing '/', '[', '?', etc. don't produce an invalid regex in vitest.
  // For multiple failures, join escaped names with '|' for an OR pattern.
  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const filterPattern = run1Failures.map((t) => escapeRegex(t.name)).join('|');
  const run2 = runVitest(filterPattern);

  const run2Failures = run2.tests.filter((t) => t.status === 'failed');

  // If run-2 produced no test results (vitest startup failure), treat all run-1 failures
  // as confirmed regressions — do NOT declare them flake-recovered on an empty run.
  const run2ProducedResults = run2.tests.length > 0;
  const flakeRecoveredNames = run2ProducedResults
    ? run1Failures
        .filter((f) => run2.tests.find((t) => t.name === f.name && t.status === 'passed'))
        .map((f) => f.name)
    : [];

  const totalRun1 = run1.tests.filter((t) => t.status !== 'skipped').length;
  const passedRun1 = run1.tests.filter((t) => t.status === 'passed').length;

  printSummaryTable(run1.tests, run2.tests, flakeRecoveredNames);
  console.log('');

  if (run2Failures.length === 0 && run2ProducedResults) {
    // All failures recovered on retry — transient flake
    console.log(
      `SUMMARY:  ${passedRun1}/${totalRun1} PASS on run-1; ${totalRun1}/${totalRun1} on run-2  |  GATE: GREEN (flake recovered — investigate)  |  exit 0`,
    );
    process.exit(0);
  }

  // Confirmed regression — failed on both runs
  console.log(
    `SUMMARY:  ${passedRun1}/${totalRun1} PASS (both runs)  |  GATE: RED — ${run2Failures.length} confirmed failure(s)  |  exit 1`,
  );
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Unhandled error in eval-gate:', err);
  process.exit(1);
});
