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
import type { RetrievalPathFragmentT, NodeDetailT } from './envelope.js';

const titleCase = (s: string): string =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// helio_email_he_email_license_confirmation_2022q3_d01f5342a629.txt
//   → "helio email he email license confirmation 2022q3"
const prettifyFile = (f: string): string =>
  f
    .replace(/\.[a-z0-9]+$/i, '') // extension
    .replace(/_[0-9a-f]{8,}$/i, '') // trailing content hash
    .replace(/_/g, ' ')
    .trim();

// ── D-04: clean human titles for doc/chunk nodes ─────────────────────────────
//
// Source data shape (verified against data_gen/output/manifest.json):
//   module    = "<account>_<source>"          e.g. "meridian_slack", "helio_email"
//   file_name = "<module>_<abbr>_<source>_<topic…>_<period>_<hash>.txt"
//     e.g. "meridian_slack_me_slack_escalation_2024q3_a243d414ac6d.txt"
// Compose: "<TitleCasedAccount> · <Topic> <PeriodQ#'YY>" — best-effort, never throws.
// Display-only: runs post-grounding; never affects which _ids/citations are grounded.

// Extract a clean period token from a module/file_name string. Recognizes
// `2024q3`, `2024-q3`, `q3` → "Q3'24" / "Q3". Returns undefined when none found.
const periodToken = (...src: (string | undefined)[]): string | undefined => {
  const hay = src.filter(Boolean).join(' ').toLowerCase();
  // year + quarter (2024q3 / 2024-q3 / 2024_q3)
  const yq = hay.match(/(20\d{2})[-_ ]?q([1-4])/);
  if (yq) return `Q${yq[2]}'${yq[1].slice(2)}`;
  // bare quarter (q3) — only as a standalone token, not inside a word/hash
  const q = hay.match(/(?:^|[_\- ])q([1-4])(?:[_\- ]|$)/);
  if (q) return `Q${q[1]}`;
  return undefined;
};

// Human-readable source-type from the module's second token.
const SOURCE_LABEL: Record<string, string> = {
  email: 'email',
  slack: 'Slack thread',
  docs: 'doc',
  doc: 'doc',
  pdf: 'PDF',
  qbr: 'QBR',
};

// Pull the descriptive "topic" out of a file_name: strip the leading module
// prefix + duplicated abbr/source tokens, the trailing period token, and the
// trailing content hash, then title-case a short remainder. Best-effort.
const topicFrom = (fileName: string | undefined, module: string | undefined): string | undefined => {
  if (!fileName) return undefined;
  let base = fileName
    .replace(/\.[a-z0-9]+$/i, '') // extension
    .replace(/_[0-9a-f]{8,}$/i, '') // trailing content hash
    .replace(/(20\d{2})[-_]?q[1-4]/gi, '') // period token
    .replace(/(?:^|_)q[1-4](?:_|$)/gi, '_');
  if (module) base = base.replace(new RegExp(`^${module}_?`, 'i'), '');
  // drop short 2-3 letter abbreviations and the bare source token
  const words = base
    .split(/[_\s]+/)
    .filter((w) => w && w.length > 3 && !/^[0-9]+$/.test(w))
    .filter((w) => !Object.keys(SOURCE_LABEL).includes(w.toLowerCase()));
  if (!words.length) return undefined;
  return titleCase(words.slice(0, 4).join(' '));
};

// Compose the clean title from module (+ file_name) for a doc/chunk node.
// Returns undefined when there's not enough to build one (caller falls back).
const docTitle = (module: string | undefined, fileName: string | undefined): string | undefined => {
  if (!module && !fileName) return undefined;
  if (!module) {
    // no module → best-effort cleaned filename (never the raw mangled name w/ hash)
    return fileName ? prettifyFile(fileName) || undefined : undefined;
  }
  const [account, source] = module.split('_');
  const acct = titleCase(account);
  const period = periodToken(fileName, module);
  const topic = topicFrom(fileName, module);
  const sourceLabel = source ? SOURCE_LABEL[source.toLowerCase()] : undefined;
  // Prefer a specific topic; fall back to the source type; then bare account.
  const descriptor = topic ?? (sourceLabel ? titleCase(sourceLabel) : undefined);
  const right = [descriptor, period].filter(Boolean).join(' ');
  return right ? `${acct} · ${right}` : acct;
};

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
      // D-04: clean human title from module (+ file_name); no mangled filename/snippet.
      return docTitle(s(d.module), s(d.file_name));
    case 'customer360_Chunks':
      // D-04: title from the chunk's parent module/file_name. If it carries neither,
      // return undefined (caller falls back to the collection) rather than a 38-char
      // content snippet.
      return s(d.module) || s(d.file_name)
        ? docTitle(s(d.module), s(d.file_name))
        : undefined;
    case 'Contract':
      return s(d.product_tier) ?? s(d.contract_name) ?? s(d.edition);
    case 'Opportunity':
      return s(d.name) ?? s(d.stage) ?? s(d.opportunity_name);
    default:
      return undefined;
  }
}

const humanType = (t: unknown): string =>
  typeof t === 'string' ? titleCase(t.replace(/_/g, ' ')) : '';

// Chunk/document content is stored with a leading `<!-- module=… -->` metadata
// comment; strip it so the drawer shows the readable body.
const cleanContent = (s: string): string =>
  s.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();

/** Compose the source-drawer detail (key fields + long-form text) for a record. */
export function detailFor(collection: string, d: Record<string, unknown>): NodeDetailT {
  const f = (label: string, value: unknown) =>
    value != null && value !== '' ? { label, value: String(value) } : null;
  const fields = (arr: ({ label: string; value: string } | null)[]) => {
    const kept = arr.filter((x): x is { label: string; value: string } => x != null);
    return kept.length ? kept : undefined;
  };
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

  switch (collection) {
    case 'canonical_entities':
      return { fields: fields([f('Type', humanType(d.entity_type))]) };
    case 'customer360_Entities':
      return {
        fields: fields([f('Type', humanType(d.entity_type))]),
        text: str(d.description),
      };
    case 'customer360_Chunks':
      return { text: str(d.content) ? cleanContent(d.content as string) : undefined };
    case 'customer360_Documents':
      return {
        fields: fields([
          f('File', d.file_name),
          f('Module', d.module),
          f('Source URL', d.citable_url),
        ]),
        text: str(d.content) ? cleanContent(d.content as string) : undefined,
      };
    case 'Account':
      return {
        fields: fields([
          f('Segment', d.segment),
          f('Industry', d.industry),
          f('Product tier', d.current_product_tier),
          f('ACV (USD)', d.current_acv_usd),
          f('Health', d.health_band),
          f('Trajectory', d.account_trajectory),
          f('CSM owner', d.csm_owner),
        ]),
      };
    case 'Contact':
      return {
        fields: fields([
          f('Title', d.title),
          f('Role', d.role),
          f('Engagement', d.engagement_status),
          f('Influence', d.influence),
          f('Primary champion', d.is_primary),
        ]),
      };
    case 'UsageFact':
      return {
        fields: fields([
          f('Period', d.period),
          f('Query volume (M)', d.query_volume_m),
          f('Growth %', d.query_volume_growth_pct),
          f('Trend', d.volume_trend),
          f('Edition', d.edition),
          f('Cluster nodes', d.cluster_nodes),
        ]),
      };
    case 'NPS':
      return {
        fields: fields([
          f('Period', d.survey_period),
          f('NPS score', d.nps_score ?? d.score),
          f('Band', d.score_band),
          f('Sentiment aligned', d.sentiment_aligned),
        ]),
        text: str(d.verbatim_sentiment),
      };
    case 'Contract':
      return { fields: fields([f('Tier', d.product_tier), f('Edition', d.edition)]) };
    default:
      return {};
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
  const nodeDetails: Record<string, NodeDetailT> = {};
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
        if (!id) continue;
        const label = labelFor(collection, d);
        if (label) labels[id] = label;
        const detail = detailFor(collection, d);
        if (detail.fields?.length || detail.text) nodeDetails[id] = detail;
      }
    } catch {
      // best-effort: a missing collection / transient error must NOT break the answer
    }
  }

  if (Object.keys(labels).length === 0 && Object.keys(nodeDetails).length === 0) {
    return retrievalPath;
  }
  // Attach the maps to every fragment (tiny; the viz merges them).
  return retrievalPath.map((f) => ({ ...f, labels, nodeDetails }));
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
