/**
 * Vitest setup file
 * Mocks Chrome extension APIs for testing
 */

import { vi } from 'vitest';

// Mock Chrome extension APIs
global.chrome = {
  runtime: {
    getURL: vi.fn(path => `chrome-extension://mock-extension-id/${path}`),
    sendMessage: vi.fn(() => Promise.resolve({})),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve()),
    },
    sync: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
    },
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([{ id: 1, url: 'https://example.com' }])),
    sendMessage: vi.fn(() => Promise.resolve({})),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
  },
  scripting: {
    executeScript: vi.fn(() => Promise.resolve([{ result: true }])),
    insertCSS: vi.fn(() => Promise.resolve()),
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
};

// Mock fetch for loading JSON
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
  })
);

// Mock matchMedia
global.matchMedia = vi.fn(() => ({
  matches: false,
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

// Mock requestIdleCallback
global.requestIdleCallback = vi.fn(cb => {
  const start = Date.now();
  return setTimeout(() => {
    cb({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    });
  }, 0);
});

global.cancelIdleCallback = vi.fn(id => clearTimeout(id));
