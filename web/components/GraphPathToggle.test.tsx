// web/components/GraphPathToggle.test.tsx
//
// RTL tests for GraphPathToggle (D-05).
// Covers: default Path label, aria-pressed/role semantics, onChange on segment click,
// accent-active (active segment has bg-primary class).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { GraphPathToggle } from './GraphPathToggle';

describe('GraphPathToggle', () => {
  it('renders Path and Graph segment labels', () => {
    render(<GraphPathToggle value="path" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /Path/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Graph/i })).toBeInTheDocument();
  });

  it('defaults to Path selected (aria-pressed=true on Path)', () => {
    render(<GraphPathToggle value="path" onChange={vi.fn()} />);
    const pathBtn = screen.getByRole('tab', { name: /Path/i });
    const graphBtn = screen.getByRole('tab', { name: /Graph/i });
    expect(pathBtn).toHaveAttribute('aria-pressed', 'true');
    expect(graphBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('aria-pressed reflects controlled value — Graph selected', () => {
    render(<GraphPathToggle value="graph" onChange={vi.fn()} />);
    const pathBtn = screen.getByRole('tab', { name: /Path/i });
    const graphBtn = screen.getByRole('tab', { name: /Graph/i });
    expect(graphBtn).toHaveAttribute('aria-pressed', 'true');
    expect(pathBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange("graph") when Graph segment is clicked', () => {
    const onChange = vi.fn();
    render(<GraphPathToggle value="path" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Graph/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('graph');
  });

  it('calls onChange("path") when Path segment is clicked', () => {
    const onChange = vi.fn();
    render(<GraphPathToggle value="graph" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Path/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('path');
  });

  it('active segment has bg-primary class (accent green)', () => {
    render(<GraphPathToggle value="path" onChange={vi.fn()} />);
    const pathBtn = screen.getByRole('tab', { name: /Path/i });
    const graphBtn = screen.getByRole('tab', { name: /Graph/i });
    expect(pathBtn.className).toContain('bg-primary');
    expect(graphBtn.className).not.toContain('bg-primary');
  });

  it('has role=tablist on the container', () => {
    render(<GraphPathToggle value="path" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: /Retrieval view/i })).toBeInTheDocument();
  });
});
