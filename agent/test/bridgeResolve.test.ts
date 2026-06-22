// agent/test/bridgeResolve.test.ts
//
// Wave-1 (05-02) integration tests for the bridgeResolve specialist.
//
// The hard gate (D-05 / Pitfall 4): ALL 9 demo-critical ids must resolve to a
// canonical hub with >=1 structured leaf, INCLUDING the ~6 whose KG entity_id
// stamp is absent — proving resolution keys on the structured-side same_as edge,
// NOT the partial KG stamp. An absent id returns data: [] without throwing.
//
// The 9-id set is copied verbatim from scripts/demo_critical.py
// (DEMO_CRITICAL_ENTITIES) — the single source of truth for the locked questions.
//
// loadEnv() runs at module scope (override:true) before the skip-guard (D-06).

import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/db.js';
import { hasLiveDb } from './fixtures.js';
import { bridgeResolve } from '../src/tools/bridgeResolve.js';

loadEnv();

const live = hasLiveDb();

// Verbatim from scripts/demo_critical.py — the 9 entities the 6 locked
// questions traverse. Do NOT add/drop/renumber; mirror the Python source.
const DEMO_CRITICAL: Array<{ id: string; display: string; type: string }> = [
  { id: '633f43bd-5cbd-579e-9105-2ded0f2e7c76', display: 'James Okafor', type: 'Contact' },
  { id: '135970e6-29ec-5bcb-8cd1-887973aa326d', display: 'Taylor Brooks', type: 'Contact' },
  { id: 'ead03ac6-14ab-5dd9-8bf8-794c507ff628', display: 'Patricia Vance', type: 'Contact' },
  { id: '4818c0ff-b555-5395-8950-ae3916c176a3', display: 'Sarah Chen', type: 'Contact' },
  { id: '0b5c0005-9e04-5d41-8cb4-abbe369f0e4f', display: 'Michael Torres', type: 'Contact' },
  { id: '9eff6d7b-7311-5525-be75-5b82a855ece7', display: 'Meridian Logistics', type: 'Account' },
  { id: '0d5b5863-d3da-51e3-b117-ddbfa7ba2d16', display: 'Northwind Analytics', type: 'Account' },
  { id: '47a06e4c-42ce-59ad-865c-cbeef04f1708', display: 'Enterprise 2026', type: 'Contract' },
  { id: '629062eb-1233-51c3-a74c-6821b2020df3', display: 'ArangoGraph 2026', type: 'Contract' },
];

const run = (entityId: string) =>
  (bridgeResolve as unknown as {
    execute: (i: unknown, opts: unknown) => Promise<{
      data: Array<{
        canonical_id: string;
        display_name?: string;
        entity_type?: string;
        account_id?: string;
        structured_nodes: Array<{ _id: string; collection?: string }>;
        kg_nodes: Array<{ _id: string }>;
      }>;
      retrievalPath: { graph: string; collection: string; _ids: string[]; query: string };
    }>;
  }).execute({ entityId }, {} as unknown);

describe.skipIf(!live)('bridgeResolve — all 9 demo-critical ids resolve via the structured-side edge', () => {
  for (const ent of DEMO_CRITICAL) {
    it(`resolves ${ent.display} (${ent.id.slice(0, 8)}) to a hub with >=1 structured_node`, async () => {
      const { data, retrievalPath } = await run(ent.id);
      expect(data.length).toBeGreaterThan(0);
      const hub = data[0];
      expect(hub.canonical_id).toBe(ent.id);
      // The load-bearing assertion (Pitfall 4): structured leaves resolve
      // regardless of whether the KG entity_id stamp is present for this id.
      expect(hub.structured_nodes.length).toBeGreaterThan(0);
      expect(retrievalPath.graph).toBe('structured');
      expect(retrievalPath.collection).toBe('same_as');
      // retrievalPath carries the real resolved node _ids.
      const expectedIds = [...hub.structured_nodes, ...hub.kg_nodes].map((n) => n._id);
      expect(retrievalPath._ids).toEqual(expectedIds);
    });
  }

  it('returns data: [] for an absent/unknown entityId without throwing', async () => {
    const { data, retrievalPath } = await run('00000000-0000-0000-0000-000000000000');
    expect(data).toEqual([]);
    expect(retrievalPath.graph).toBe('structured');
    expect(retrievalPath.collection).toBe('same_as');
    expect(retrievalPath._ids).toEqual([]);
  });
});
