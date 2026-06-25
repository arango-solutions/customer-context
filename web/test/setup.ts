// RTL + jest-dom matchers for the jsdom test project. Auto-cleanup after each test.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// ── Browser API stubs (jsdom gaps) ───────────────────────────────────────────

// React Flow requires ResizeObserver (jsdom ships without it).
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// React Flow requires DOMMatrixReadOnly (jsdom ships without it).
if (typeof window !== 'undefined' && !window.DOMMatrixReadOnly) {
  // Minimal stub — React Flow only calls it for transform calculations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    constructor(_init?: string | number[]) {}
    static fromMatrix() { return new (window as any).DOMMatrixReadOnly(); }
  };
}

// Stub window.matchMedia for components that guard animation behind it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
