// agent/test/fixtures.ts
//
// Fixed test anchors shared across the Wave-0 spikes and (later) the Phase 7 eval.
// The two demo account_ids are the canonical Account._key values from
// scripts/demo_critical.py — Northwind (the structured-only / ladder account) and
// Meridian (the Q12 "usage green / sentiment red" centerpiece account).

/** Northwind — Account A (Q7 ladder / ROI, structured-only). */
export const NORTHWIND_ACCOUNT_ID = '0d5b5863-d3da-51e3-b117-ddbfa7ba2d16';

/** Meridian — the Q12 reconciliation account (usage green, sentiment red). */
export const MERIDIAN_ACCOUNT_ID = '9eff6d7b-7311-5525-be75-5b82a855ece7';

/**
 * Skip-guard for live-DB tests: true only when the cluster creds are present in
 * the environment. Live spikes self-skip cleanly when .env is absent (VALIDATION
 * Wave 0) so the unit suite still runs in CI without a cluster.
 */
export function hasLiveDb(): boolean {
  return Boolean(process.env.ARANGO_ENDPOINT && process.env.ARANGO_PASSWORD);
}

/**
 * Skip-guard for tests that call OpenAI (the hybrid spike embeds a query).
 */
export function hasOpenAi(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
