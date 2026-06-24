// scripts/latency-baseline.ts
//
// PERF-01 latency baseline: measures wall-clock time for askQuestion(Q7_ANCHOR_PROMPT)
// over N runs and records the result to scripts/output/latency-baseline.json.
//
// Q7 is the structured-only anchor (no hybrid embedding call) — the most deterministic
// latency probe for the agent loop. This measurement is taken BEFORE any PERF-01 changes
// so "noticeably improved" (SC-5) is provable against a real number, not a vibe.
//
// Usage:
//   npx tsx scripts/latency-baseline.ts               # N=3 runs (default)
//   BASELINE_RUNS=5 npx tsx scripts/latency-baseline.ts
//
// Env: OPENAI_API_KEY + ARANGO_* must be in .env or shell (uses loadEnv override).
// Output: scripts/output/latency-baseline.json (created/overwritten each run).

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Env loading: must happen before agent import reads process.env ────────────
// Mirror db.ts loadEnv() pattern: override:true so .env wins over stale shell value
// (D-06 gotcha). Done at module scope so subsequent static imports see the values.
import dotenv from 'dotenv';
const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env'), override: true, quiet: true });

// ── Agent import — after env is loaded ───────────────────────────────────────
import { askQuestion, Q7_ANCHOR_PROMPT } from '../agent/src/index.js';

// ── Config ────────────────────────────────────────────────────────────────────

const N_RUNS = parseInt(process.env.BASELINE_RUNS ?? '3', 10);
// Set LATENCY_LABEL=AFTER_PREWARM when re-running after PERF-01 changes.
const LABEL = (process.env.LATENCY_LABEL ?? 'BEFORE_PREWARM') as 'BEFORE_PREWARM' | 'AFTER_PREWARM';
const OUTPUT_DIR = path.join(__dirname, 'output');
// Write to latency-before.json or latency-after.json based on label; also write the
// generic latency-baseline.json as the canonical "latest" for backwards compatibility.
const LABEL_FILE = path.join(
  OUTPUT_DIR,
  LABEL === 'AFTER_PREWARM' ? 'latency-after.json' : 'latency-before.json',
);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'latency-baseline.json');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunResult {
  run: number;
  total_ms: number;
  refused: boolean;
  citation_count: number;
}

interface BaselineRecord {
  captured_at: string;
  phase: string;
  question: 'Q7_ANCHOR_PROMPT';
  n_runs: number;
  runs: RunResult[];
  min_ms: number;
  median_ms: number;
  max_ms: number;
  label: 'BEFORE_PREWARM' | 'AFTER_PREWARM';
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Customer360 PERF-01 latency baseline ===');
  console.log(`Question: Q7_ANCHOR_PROMPT (structured-only anchor)`);
  console.log(`Runs:     ${N_RUNS}`);
  console.log(`Label:    ${LABEL}\n`);

  const runs: RunResult[] = [];

  for (let i = 1; i <= N_RUNS; i++) {
    console.log(`Run ${i}/${N_RUNS} starting...`);
    const t0 = Date.now();
    const envelope = await askQuestion(Q7_ANCHOR_PROMPT);
    const total_ms = Date.now() - t0;

    const result: RunResult = {
      run: i,
      total_ms,
      refused: envelope.refused,
      citation_count: envelope.citations.length,
    };
    runs.push(result);

    console.log(
      `  Run ${i}: total_ms=${total_ms}  refused=${envelope.refused}  citations=${envelope.citations.length}`,
    );
  }

  const totals = runs.map((r) => r.total_ms);
  const min_ms = Math.min(...totals);
  const med_ms = median(totals);
  const max_ms = Math.max(...totals);

  console.log('\n─── BASELINE SUMMARY ───────────────────────────────────────');
  console.log(`BASELINE total_ms median=${med_ms}`);
  console.log(`BASELINE total_ms min=${min_ms}  max=${max_ms}`);
  console.log(`Label:   ${LABEL}`);
  console.log('────────────────────────────────────────────────────────────\n');

  // Persist the record for before/after comparison and SUMMARY inclusion.
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const record: BaselineRecord = {
    captured_at: new Date().toISOString(),
    phase: '11-04',
    question: 'Q7_ANCHOR_PROMPT',
    n_runs: N_RUNS,
    runs,
    min_ms,
    median_ms: med_ms,
    max_ms,
    label: LABEL,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(record, null, 2));
  writeFileSync(LABEL_FILE, JSON.stringify(record, null, 2));
  console.log(`Baseline persisted → ${OUTPUT_FILE}`);
  console.log(`Labeled copy       → ${LABEL_FILE}`);
}

main().catch((err: unknown) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
