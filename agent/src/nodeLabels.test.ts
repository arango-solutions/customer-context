// agent/src/nodeLabels.test.ts
//
// D-04 unit tests for labelFor() — the display-only node-title composer.
//
// Pure, no DB, no model. Asserts:
//  - customer360_Documents → clean human title (account/module + period token),
//    NOT the mangled filename, NOT a content snippet.
//  - customer360_Chunks → clean title from its parent module/type, NOT a quoted
//    38-char content snippet; undefined when it lacks the fields to build one.
//  - A Document with no `module` falls back to a lightly-cleaned filename, never throws.
//  - Regression: the structured-record branches (Account/Contact/UsageFact/NPS/...)
//    are byte-unchanged.

import { describe, it, expect } from 'vitest';
import { labelFor } from './nodeLabels.js';

// A clean title must NOT contain a raw 8+-hex content hash and must NOT be a
// quoted content snippet (the old chunk/document output shapes).
const hasContentHash = (s: string) => /[0-9a-f]{8,}/i.test(s);
const isQuotedSnippet = (s: string) => /^[“"].*[”"…]$/.test(s) || s.includes('…');

describe('D-04: labelFor customer360_Documents — clean human title', () => {
  it('composes account + period from module/file_name (no mangled filename, no snippet)', () => {
    const label = labelFor('customer360_Documents', {
      module: 'meridian_qbr_q3',
      file_name: 'meridian_qbr_q3_abc12345.txt',
    });
    expect(label).toBeDefined();
    const s = label as string;
    // contains the account/module name…
    expect(s.toLowerCase()).toContain('meridian');
    // …and a period token (Q3) somewhere…
    expect(/Q[1-4]/.test(s)).toBe(true);
    // …but never the trailing content hash or a snippet ellipsis.
    expect(hasContentHash(s)).toBe(false);
    expect(isQuotedSnippet(s)).toBe(false);
  });

  it('parses a 2022q3-style period token into a clean Q3 form', () => {
    const label = labelFor('customer360_Documents', {
      module: 'helio_email',
      file_name: 'helio_email_he_email_license_confirmation_2022q3_d01f5342a629.txt',
    });
    expect(label).toBeDefined();
    const s = label as string;
    expect(s.toLowerCase()).toContain('helio');
    expect(/Q3/.test(s)).toBe(true);
    expect(hasContentHash(s)).toBe(false);
  });

  it('falls back to a lightly-cleaned filename when module is absent (never throws)', () => {
    const run = () =>
      labelFor('customer360_Documents', {
        file_name: 'orphan_doc_no_module_aabbccdd1122.txt',
      });
    expect(run).not.toThrow();
    const label = run();
    expect(label).toBeDefined();
    const s = label as string;
    // best-effort clean: extension + trailing hash stripped, underscores → spaces.
    expect(s).not.toMatch(/\.txt$/);
    expect(hasContentHash(s)).toBe(false);
  });

  it('returns undefined for a Document with neither module nor file_name', () => {
    expect(labelFor('customer360_Documents', {})).toBeUndefined();
  });
});

describe('D-04: labelFor customer360_Chunks — title from parent module/type', () => {
  it('builds a clean title from module/file_name (NOT a quoted content snippet)', () => {
    const label = labelFor('customer360_Chunks', {
      module: 'meridian_slack',
      file_name: 'meridian_slack_me_slack_escalation_2024q3_a243d414ac6d.txt',
      content: 'this is a long chunk body that would previously be truncated to 38 chars and quoted',
    });
    expect(label).toBeDefined();
    const s = label as string;
    expect(s.toLowerCase()).toContain('meridian');
    expect(isQuotedSnippet(s)).toBe(false);
    expect(hasContentHash(s)).toBe(false);
    // must NOT be the old content-snippet shape
    expect(s).not.toContain('this is a long chunk body');
  });

  it('returns undefined (caller falls back to collection) when the chunk lacks module/type fields, NOT the truncated content', () => {
    const label = labelFor('customer360_Chunks', {
      content: 'orphan chunk content with no module or filename to derive a title from at all',
    });
    expect(label).toBeUndefined();
  });
});

describe('D-04 regression: structured-record label branches UNCHANGED', () => {
  it('Account label unchanged', () => {
    expect(labelFor('Account', { account_name: 'Meridian Logistics' })).toBe('Meridian Logistics');
  });

  it('Contact label unchanged (name · title)', () => {
    expect(labelFor('Contact', { full_name: 'Dana Cole', title: 'VP Eng' })).toBe('Dana Cole · VP Eng');
    expect(labelFor('Contact', { full_name: 'Dana Cole' })).toBe('Dana Cole');
  });

  it('UsageFact label unchanged', () => {
    expect(labelFor('UsageFact', { period: '2024Q3' })).toBe('2024Q3 · query volume');
    expect(labelFor('UsageFact', {})).toBe('query volume');
  });

  it('NPS label unchanged', () => {
    expect(labelFor('NPS', { survey_period: '2024Q3', nps_score: 42 })).toBe('2024Q3 NPS · 42');
    expect(labelFor('NPS', { survey_period: '2024Q3' })).toBe('2024Q3 NPS');
  });

  it('canonical_entities + customer360_Entities + Contract + Opportunity unchanged', () => {
    expect(labelFor('canonical_entities', { display_name: 'Helio Retail' })).toBe('Helio Retail');
    expect(labelFor('customer360_Entities', { entity_name: 'helio retail' })).toBe('Helio Retail');
    expect(labelFor('Contract', { product_tier: 'Enterprise' })).toBe('Enterprise');
    expect(labelFor('Opportunity', { name: 'Renewal FY25' })).toBe('Renewal FY25');
  });
});
