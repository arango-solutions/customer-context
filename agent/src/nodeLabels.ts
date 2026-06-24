// agent/src/nodeLabels.ts
//
// Display-only node labels for the cross-graph viz (Phase 11 follow-up).
//
// The retrievalPath carries opaque ArangoDB _ids (canonical_entities/633f…); the
// viz needs human-readable names ("Helio Retail", "Meridian Logistics"). Those names
// live in record FIELDS, not the _id key, so we resolve them server-side here and
// attach an _id → label map onto each fragment.
//
// HONESTY / SAFETY:
//  - Runs AFTER enforceGrounding — never affects which _ids/citations are grounded.
//  - Best-effort: any DB error is swallowed; the envelope is returned unchanged.
//  - Pure decoration: no new _ids are introduced, nothing is fabricated — a label is
//    only ever the record's own name field.

import { db, withDbRetry } from './db.js';
import type { Envelope } from './envelope.js';
import type { RetrievalPathFragmentT } from './envelope.js';

const titleCase = (s: string): string =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const snippet = (s: string, n = 38): string => {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
};

// helio_email_he_email_license_confirmation_2022q3_d01f5342a629.txt
//   → "helio email he email license confirmation 2022q3"
const prettifyFile = (f: string): string =>
  f
    .replace(/\.[a-z0-9]+$/i, '') // extension
    .replace(/_[0-9a-f]{8,}$/i, '') // trailing content hash
    .replace(/_/g, ' ')
    .trim();

/** Compose a human-readable label from a record, by collection. Returns undefined
 * when the collection has no sensible name (caller falls back to the collection). */
export function labelFor(collection: string, d: Record<string, unknown>): string | undefined {
  const s = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  switch (collection) {
    case 'canonical_entities':
      return s(d.display_name) ?? s(d.canonical_id);
    case 'customer360_Entities':
      return s(d.entity_name) ? titleCase(d.entity_name as string) : undefined;
    case 'Account':
      return s(d.account_name);
    case 'Contact': {
      const name = s(d.full_name);
      if (!name) return undefined;
      const title = s(d.title);
      return title ? `${name} · ${title}` : name;
    }
    case 'UsageFact':
      return s(d.period) ? `${d.period as string} · query volume` : 'query volume';
    case 'NPS': {
      const period = s(d.survey_period);
      const score = d.nps_score ?? d.score;
      if (period) return score != null ? `${period} NPS · ${score}` : `${period} NPS`;
      return score != null ? `NPS · ${score}` : undefined;
    }
    case 'customer360_Documents':
      return s(d.file_name) ? prettifyFile(d.file_name as string) : undefined;
    case 'customer360_Chunks':
      return s(d.content) ? `“${snippet(d.content as string)}”` : undefined;
    case 'Contract':
      return s(d.product_tier) ?? s(d.contract_name) ?? s(d.edition);
    case 'Opportunity':
      return s(d.name) ?? s(d.stage) ?? s(d.opportunity_name);
    default:
      return undefined;
  }
}

const collOf = (id: string): string => (id.includes('/') ? id.split('/')[0] : id);

/** Resolve display labels for every node id referenced by the retrieval path and
 * attach the _id → label map to each fragment. Best-effort + side-effect-free on error. */
export async function enrichRetrievalPathLabels(
  retrievalPath: RetrievalPathFragmentT[],
): Promise<RetrievalPathFragmentT[]> {
  if (!retrievalPath.length) return retrievalPath;

  // Collect every node id (fragment _ids + edge endpoints), grouped by collection.
  const byCollection = new Map<string, Set<string>>();
  for (const frag of retrievalPath) {
    for (const id of frag._ids ?? []) addId(id);
    for (const e of frag.edges ?? []) {
      if (e._from) addId(e._from);
      if (e._to) addId(e._to);
    }
  }
  function addId(id: string) {
    if (!id || !id.includes('/') || id === 'question/current') return;
    const c = collOf(id);
    (byCollection.get(c) ?? byCollection.set(c, new Set()).get(c)!).add(id);
  }

  const labels: Record<string, string> = {};
  for (const [collection, idSet] of byCollection) {
    const ids = [...idSet];
    try {
      const docs = await withDbRetry(async () => {
        const cursor = await db.query({
          // UNSET strips the large embedding/cluster fields; we only need name fields.
          query: 'FOR d IN @@c FILTER d._id IN @ids RETURN UNSET(d, "embedding", "clusters")',
          bindVars: { '@c': collection, ids },
        });
        return (await cursor.all()) as Record<string, unknown>[];
      }, `nodeLabels.${collection}`);
      for (const d of docs) {
        const id = d._id as string;
        const label = labelFor(collection, d);
        if (id && label) labels[id] = label;
      }
    } catch {
      // best-effort: a missing collection / transient error must NOT break the answer
    }
  }

  if (Object.keys(labels).length === 0) return retrievalPath;
  // Attach the full map to every fragment (tiny; buildGraph merges them).
  return retrievalPath.map((f) => ({ ...f, labels }));
}

/** Envelope post-processor: enrich retrievalPath labels. Returns the envelope unchanged
 * on any failure. Call AFTER enforceGrounding in BOTH the streaming and non-streaming
 * paths so node naming is consistent (the eval gate only exercises the non-streaming one). */
export async function attachNodeLabels(envelope: Envelope): Promise<Envelope> {
  try {
    const retrievalPath = await enrichRetrievalPathLabels(envelope.retrievalPath);
    return { ...envelope, retrievalPath };
  } catch {
    return envelope;
  }
}
