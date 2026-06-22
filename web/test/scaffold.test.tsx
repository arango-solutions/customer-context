// web/test/scaffold.test.tsx
//
// Wave-0 scaffold smoke: proves the jsdom/RTL test project runs, the agent contract
// is importable across the workspace, and the Envelope fixtures are contract-valid
// and dual-graph (so every Wave-2 component test can rely on them).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnvelopeSchema, assertReconciliation } from 'customer360-agent';
import {
  GROUNDED_ENVELOPE,
  REFUSED_ENVELOPE,
  MERIDIAN_ACCOUNT_ID,
} from './fixtures';

describe('Wave-0 scaffold', () => {
  it('renders a React component in jsdom (RTL + plugin-react work)', () => {
    render(<p>both graphs</p>);
    expect(screen.getByText('both graphs')).toBeInTheDocument();
  });

  it('GROUNDED_ENVELOPE parses against the agent EnvelopeSchema', () => {
    expect(() => EnvelopeSchema.parse(GROUNDED_ENVELOPE)).not.toThrow();
  });

  it('GROUNDED_ENVELOPE has >=2 claims, each with >=1 citation', () => {
    expect(GROUNDED_ENVELOPE.claims.length).toBeGreaterThanOrEqual(2);
    for (const claim of GROUNDED_ENVELOPE.claims) {
      expect(claim.citations.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('GROUNDED_ENVELOPE cites both graphs (satisfies assertReconciliation)', () => {
    expect(assertReconciliation(GROUNDED_ENVELOPE)).toBe(true);
    expect(
      GROUNDED_ENVELOPE.citations.some((c) => c.graph === 'structured'),
    ).toBe(true);
    expect(
      GROUNDED_ENVELOPE.citations.some((c) => c.graph === 'unstructured'),
    ).toBe(true);
  });

  it('GROUNDED_ENVELOPE has one structured + one unstructured retrievalPath fragment', () => {
    const graphs = GROUNDED_ENVELOPE.retrievalPath.map((f) => f.graph);
    expect(graphs).toContain('structured');
    expect(graphs).toContain('unstructured');
    expect(GROUNDED_ENVELOPE.reasoningTrace.length).toBeGreaterThan(0);
  });

  it('GROUNDED_ENVELOPE reads like genuine demo output (real Meridian account_id)', () => {
    const idsTouchMeridian = GROUNDED_ENVELOPE.citations.some((c) =>
      c._id.includes(MERIDIAN_ACCOUNT_ID),
    );
    expect(idsTouchMeridian).toBe(true);
  });

  it('REFUSED_ENVELOPE is a contract-valid honest refusal', () => {
    expect(() => EnvelopeSchema.parse(REFUSED_ENVELOPE)).not.toThrow();
    expect(REFUSED_ENVELOPE.refused).toBe(true);
    expect(REFUSED_ENVELOPE.answer.length).toBeGreaterThan(0);
    // Partial sourcing: the refusal keeps only the grounded citation(s).
    expect(REFUSED_ENVELOPE.citations.length).toBeGreaterThan(0);
  });
});
