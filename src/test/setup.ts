import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Viewport utilities for responsive testing
export const VIEWPORT = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  wide: { width: 1920, height: 1080 },
};

// Set viewport size for testing
export function setViewport(size: keyof typeof VIEWPORT | { width: number; height: number }) {
  const dimensions = typeof size === 'string' ? VIEWPORT[size] : size;
  Object.defineProperty(window, 'innerWidth', { writable: true, value: dimensions.width });
  Object.defineProperty(window, 'innerHeight', { writable: true, value: dimensions.height });
  window.dispatchEvent(new Event('resize'));
}

// Mock window.matchMedia with configurable breakpoints
let currentWidth = 1280; // Default to desktop

export function setMatchMediaWidth(width: number) {
  currentWidth = width;
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => {
    // Parse common media queries
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);

    let matches = false;
    if (minWidthMatch) {
      matches = currentWidth >= parseInt(minWidthMatch[1]);
    } else if (maxWidthMatch) {
      matches = currentWidth <= parseInt(maxWidthMatch[1]);
    }

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IntersectionObserverCallback) {
    // Store callback if needed for testing
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    // Store callback if needed for testing
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});

// Mock crypto.randomUUID
Object.defineProperty(crypto, 'randomUUID', {
  value: vi.fn().mockReturnValue('test-uuid-1234'),
  writable: true,
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock IndexedDB for Dexie
const indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', {
  value: indexedDB,
  writable: true,
});

// Suppress console errors in tests (optional, remove if you want to see them)
// vi.spyOn(console, 'error').mockImplementation(() => {});
