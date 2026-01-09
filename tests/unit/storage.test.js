/**
 * Unit tests for Chrome storage utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as storage from '../../src/shared/storage.js';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../src/shared/constants.js';

describe('Storage', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  describe('get', () => {
    it('should return stored value', async () => {
      chrome.storage.local.get.mockResolvedValue({ testKey: 'testValue' });

      const result = await storage.get('testKey');
      expect(result).toBe('testValue');
    });

    it('should return default value when key not found', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await storage.get('nonExistent', 'default');
      expect(result).toBe('default');
    });

    it('should return null when no default provided', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await storage.get('nonExistent');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should store value', async () => {
      await storage.set('testKey', 'testValue');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        testKey: 'testValue',
      });
    });

    it('should return true on success', async () => {
      const result = await storage.set('key', 'value');
      expect(result).toBe(true);
    });
  });

  describe('getSettings', () => {
    it('should return all settings with defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: true,
        [STORAGE_KEYS.HIGHLIGHT_STYLE]: 'background',
      });

      const settings = await storage.getSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.highlightStyle).toBe('background');
      expect(settings.highlightColor).toBe(DEFAULT_SETTINGS.highlightColor);
    });

    it('should use defaults when values not set', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const settings = await storage.getSettings();

      expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
      expect(settings.highlightStyle).toBe(DEFAULT_SETTINGS.highlightStyle);
      expect(settings.highlightColor).toBe(DEFAULT_SETTINGS.highlightColor);
    });
  });

  describe('saveSettings', () => {
    it('should save only provided settings', async () => {
      await storage.saveSettings({
        enabled: false,
        highlightColor: '#ff0000',
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.ENABLED]: false,
        [STORAGE_KEYS.HIGHLIGHT_COLOR]: '#ff0000',
      });
    });
  });

  describe('isSiteEnabled', () => {
    it('should return true when site not disabled', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: true,
        [STORAGE_KEYS.DISABLED_SITES]: [],
        [STORAGE_KEYS.ENABLED_SITES]: [],
      });

      const result = await storage.isSiteEnabled('example.com');
      expect(result).toBe(true);
    });

    it('should return false when site is disabled', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: true,
        [STORAGE_KEYS.DISABLED_SITES]: ['example.com'],
        [STORAGE_KEYS.ENABLED_SITES]: [],
      });

      const result = await storage.isSiteEnabled('example.com');
      expect(result).toBe(false);
    });

    it('should return false when extension is disabled', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: false,
        [STORAGE_KEYS.DISABLED_SITES]: [],
        [STORAGE_KEYS.ENABLED_SITES]: [],
      });

      const result = await storage.isSiteEnabled('example.com');
      expect(result).toBe(false);
    });
  });

  describe('toggleSite', () => {
    it('should add site to disabled list', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: true,
        [STORAGE_KEYS.DISABLED_SITES]: [],
        [STORAGE_KEYS.ENABLED_SITES]: [],
      });

      const isNowEnabled = await storage.toggleSite('example.com');

      expect(isNowEnabled).toBe(false);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.DISABLED_SITES]: ['example.com'],
      });
    });

    it('should remove site from disabled list', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.ENABLED]: true,
        [STORAGE_KEYS.DISABLED_SITES]: ['example.com'],
        [STORAGE_KEYS.ENABLED_SITES]: [],
      });

      const isNowEnabled = await storage.toggleSite('example.com');

      expect(isNowEnabled).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.DISABLED_SITES]: [],
      });
    });
  });

  describe('favorites', () => {
    it('should get empty favorites list', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const favorites = await storage.getFavorites();
      expect(favorites).toEqual([]);
    });

    it('should toggle favorite on', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.FAVORITES]: [],
      });

      const isNowFavorited = await storage.toggleFavorite('term-001');
      expect(isNowFavorited).toBe(true);
    });

    it('should toggle favorite off', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.FAVORITES]: ['term-001'],
      });

      const isNowFavorited = await storage.toggleFavorite('term-001');
      expect(isNowFavorited).toBe(false);
    });
  });

  describe('stats', () => {
    it('should get empty stats', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const stats = await storage.getStats();
      expect(stats.totalViews).toBe(0);
    });

    it('should record view', async () => {
      chrome.storage.local.get.mockResolvedValue({
        [STORAGE_KEYS.STATS]: { totalViews: 5, termViews: {}, categoryViews: {} },
      });

      await storage.recordView('term-001', 'cardio');

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall[STORAGE_KEYS.STATS].totalViews).toBe(6);
    });
  });
});
