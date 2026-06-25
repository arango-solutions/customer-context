// web/components/WhatChangedBanner.test.tsx
//
// CDC-03 grounded-banner tests (Plan 03, Task 2 / D-05):
//  - renders ONLY new-citation _ids that are present in after.citations (grounded);
//    a fabricated _id is dropped (no fabricated diff),
//  - an empty diff (no added claims, no new citations) renders nothing,
//  - diff === null (first ask) renders nothing.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { Envelope, Citation } from 'customer360-agent';

import { WhatChangedBanner } from './WhatChangedBanner';
import type { EnvelopeDiff } from '@/lib/diff-envelope';

function cite(_id: string): Citation {
  return { graph: 'unstructured', collection: 'customer360_Documents', _id, aql: '' };
}
function envelopeWith(ids: string[]): Envelope {
  return {
    answer: 'a',
    refused: false,
    claims: ids.map((id) => ({ text: `claim ${id}`, citations: [cite(id)] })),
    citations: ids.map(cite),
    retrievalPath: [],
    reasoningTrace: [],
    groundingScore: 1,
  };
}
function diff(partial: Partial<EnvelopeDiff>): EnvelopeDiff {
  return {
    addedClaims: [],
    removedClaims: [],
    newCitationIds: [],
    groundingBefore: 1,
    groundingAfter: 1,
    ...partial,
  };
}

describe('WhatChangedBanner', () => {
  it('renders only new ids that are present in after.citations (drops a fabricated id)', () => {
    const envelope = envelopeWith(['customer360_Documents/real_1']);
    const d = diff({
      newCitationIds: ['customer360_Documents/real_1', 'customer360_Documents/FAKE_2'],
      addedClaims: [0],
    });
    const { container, queryByText } = render(
      <WhatChangedBanner diff={d} envelope={envelope} />,
    );

    // The real id renders (as a data-citation-id li).
    expect(
      container.querySelector('[data-citation-id="customer360_Documents/real_1"]'),
    ).not.toBeNull();
    // The fabricated id is NOT rendered anywhere (grounded — D-05).
    expect(
      container.querySelector('[data-citation-id="customer360_Documents/FAKE_2"]'),
    ).toBeNull();
    expect(queryByText(/FAKE_2/)).toBeNull();
  });

  it('an empty diff renders nothing', () => {
    const { container } = render(
      <WhatChangedBanner diff={diff({})} envelope={envelopeWith(['customer360_Documents/x'])} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('diff === null (first ask) renders nothing', () => {
    const { container } = render(
      <WhatChangedBanner diff={null} envelope={envelopeWith(['customer360_Documents/x'])} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
