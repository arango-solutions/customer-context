// agent/test/crossGraphJoin.test.ts
//
// Wave-1 (14-02) integration tests for the crossGraphJoin specialist (GRAPH-03b).
//
// The hero: ONE read-only AQL walks the structured↔unstructured join across the
// `same_as` bridge — canonical hub → INBOUND same_as → KG entity → OUTBOUND
// MENTIONED_IN → Chunk → OUTBOUND PART_OF → Document — returning every traversed
// edge verbatim for the edges[] honesty contract, with chunk text sanitized at
// tool-return (the new path where document text enters the planner context).
//
// HONESTY BAR (live, no mocking — honesty assertions only mean something live):
//  - join returns ≥1 row for the seeded Meridian account, each row carrying hub/kg/
//    chunk/doc _ids and an edges[] of the three traversed edges (same_as,
//    MENTIONED_IN, PART_OF).
//  - every traversed edge _id is real (DOCUMENT(edge._id) != null follow-up probe) —
//    the no-fabrication bar.
//  - chunk text is wrapped in <untrusted_document> delimiters (sanitization applied).
//  - an absent/unknown accountId returns a valid empty result (data: []) — does NOT throw.
//  - SC-5 isolation: fragment._ids contains ONLY node ids (hub/kg/chunk/doc), NOT edge ids.
//
// loadEnv() runs at module scope (override:true) before the skip-guard (D-06).

import { describe, it, expect } from 'vitest';
import { loadEnv, db } from '../src/db.js';
import { hasLiveDb, MERIDIAN_ACCOUNT_ID } from './fixtures.js';
import { runCrossGraphJoin } from '../src/tools/crossGraphJoin.js';
import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from '../src/sanitize.js';
import { aql } from 'arangojs';

loadEnv();

const live = hasLiveDb();

describe.skipIf(!live)('crossGraphJoin — single-AQL structured↔unstructured join (GRAPH-03b)', () => {
  it(
    'returns ≥1 row for the seeded Meridian account; each row has hub/kg/chunk/doc _ids + 3 traversed edges',
    async () => {
      const { data, retrievalPath } = await runCrossGraphJoin({ accountId: MERIDIAN_ACCOUNT_ID });
      expect(data.length).toBeGreaterThan(0);

      for (const row of data) {
        expect(typeof row.hub).toBe('string');
        expect(typeof row.kg).toBe('string');
        expect(typeof row.chunk).toBe('string');
        expect(typeof row.doc).toBe('string');
        // The three traversed edges, labeled by their hop.
        const labels = row.edges.map((e) => e.label).sort();
        expect(labels).toEqual(['MENTIONED_IN', 'PART_OF', 'same_as']);
      }

      expect(retrievalPath.graph).toBe('unstructured');
      // collection 'same_as' lets the EXPL-01 pipeline detect the cross-graph join stage.
      expect(retrievalPath.collection).toBe('same_as');
    },
    60_000,
  );

  it(
    'edges[] are all kind:traversed and every edge _id exists in its edge collection (no fabrication)',
    async () => {
      const { retrievalPath } = await runCrossGraphJoin({ accountId: MERIDIAN_ACCOUNT_ID });
      const edges = retrievalPath.edges;
      expect(edges.length).toBeGreaterThan(0);

      for (const e of edges) {
        expect(e.kind).toBe('traversed');
        expect(e._id).not.toBeNull();
      }

      // Honesty follow-up probe: every traversed edge _id must resolve to a real doc.
      const ids = edges.map((e) => e._id).filter((id): id is string => id != null);
      const cursor = await db.query(aql`
        FOR id IN ${ids}
          RETURN { id: id, exists: DOCUMENT(id) != null }
      `);
      const probes = (await cursor.all()) as Array<{ id: string; exists: boolean }>;
      expect(probes.length).toBe(ids.length);
      for (const p of probes) {
        expect(p.exists).toBe(true);
      }
    },
    60_000,
  );

  it(
    'returned chunk text is wrapped in <untrusted_document> delimiters (sanitization applied)',
    async () => {
      const { data } = await runCrossGraphJoin({ accountId: MERIDIAN_ACCOUNT_ID });
      expect(data.length).toBeGreaterThan(0);
      for (const row of data) {
        expect(row.chunk_content.startsWith(UNTRUSTED_OPEN)).toBe(true);
        expect(row.chunk_content.trimEnd().endsWith(UNTRUSTED_CLOSE)).toBe(true);
      }
    },
    60_000,
  );

  it(
    'SC-5 isolation: fragment._ids contains only node ids (hub/kg/chunk/doc), NOT edge ids',
    async () => {
      const { data, retrievalPath } = await runCrossGraphJoin({ accountId: MERIDIAN_ACCOUNT_ID });
      expect(data.length).toBeGreaterThan(0);

      const nodeIds = new Set<string>();
      for (const row of data) {
        nodeIds.add(row.hub);
        nodeIds.add(row.kg);
        nodeIds.add(row.chunk);
        nodeIds.add(row.doc);
      }
      const edgeIds = new Set(
        retrievalPath.edges.map((e) => e._id).filter((id): id is string => id != null),
      );

      // Every fragment _id is a node id.
      for (const id of retrievalPath._ids) {
        expect(nodeIds.has(id)).toBe(true);
        // and is NOT an edge id.
        expect(edgeIds.has(id)).toBe(false);
      }
    },
    60_000,
  );

  it(
    'an absent/unknown accountId returns a valid empty result (data: []) without throwing',
    async () => {
      const { data, retrievalPath } = await runCrossGraphJoin({
        accountId: '00000000-0000-0000-0000-000000000000',
      });
      expect(data).toEqual([]);
      expect(retrievalPath.graph).toBe('unstructured');
      expect(retrievalPath.collection).toBe('same_as');
      expect(retrievalPath._ids).toEqual([]);
      expect(retrievalPath.edges).toEqual([]);
    },
    60_000,
  );
});
