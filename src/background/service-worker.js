/**
 * Service Worker for EnterMedSchool Glossary
 * Handles background tasks, message passing, and index management.
 * 
 * @module service-worker
 */

import { loadIndex, getIndex, isIndexReady } from './index-loader.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import * as storage from '../shared/storage.js';
import * as logger from '../shared/logger.js';

// Initialize on install
chrome.runtime.onInstalled.addListener(async details => {
  logger.info('Extension installed:', details.reason);

  if (details.reason === 'install') {
    // First install - open onboarding
    const isComplete = await storage.isOnboardingComplete();
    if (!isComplete) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/onboarding/onboarding.html'),
      });
    }
  }

  // Pre-load the index
  await loadIndex();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  logger.info('Extension started');
  await loadIndex();
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      logger.error('Message handler error:', error);
      sendResponse({ error: error.message });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Handle incoming messages
 * @param {Object} message
 * @param {Object} sender
 * @returns {Promise<*>}
 */
async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case MESSAGE_TYPES.GET_TERM:
      return handleGetTerm(payload);

    case MESSAGE_TYPES.SEARCH_TERMS:
      return handleSearchTerms(payload);

    case MESSAGE_TYPES.GET_SETTINGS:
      return storage.getSettings();

    case MESSAGE_TYPES.SAVE_SETTINGS:
      return storage.saveSettings(payload);

    case MESSAGE_TYPES.TOGGLE_SITE:
      return storage.toggleSite(payload.hostname);

    case MESSAGE_TYPES.GET_STATS:
      return storage.getStats();

    case MESSAGE_TYPES.RECORD_VIEW:
      await storage.recordView(payload.termId, payload.category);
      return { success: true };

    case MESSAGE_TYPES.GET_FAVORITES:
      return { favorites: await storage.getFavorites() };

    case MESSAGE_TYPES.TOGGLE_FAVORITE:
      const isFav = await storage.toggleFavorite(payload.termId);
      return { isFavorite: isFav };

    case MESSAGE_TYPES.IS_FAVORITE:
      return { isFavorite: await storage.isFavorite(payload.termId) };

    case MESSAGE_TYPES.GET_MOST_VIEWED:
      return { 
        mostViewed: await storage.getMostViewedTerms(payload?.limit || 20),
        uniqueTerms: await storage.getUniqueTermsViewed(),
      };

    case 'SAVE_POPUP_SIZE':
      await storage.setPreference('popupWidth', payload?.width);
      await storage.setPreference('popupHeight', payload?.height);
      return { success: true };

    case 'GET_POPUP_SIZE':
      const prefs = await storage.getPreferences();
      return { 
        width: prefs.popupWidth, 
        height: prefs.popupHeight,
      };

    case 'SAVE_DISAMBIGUATION_CHOICE':
      await storage.saveDisambiguationChoice(payload.pattern, payload.termId);
      return { success: true };

    case 'GET_DISAMBIGUATION_CHOICE':
      const choice = await storage.getDisambiguationChoice(payload.pattern);
      return { termId: choice };

    case MESSAGE_TYPES.HIGHLIGHT_PAGE:
      return handleHighlightPage(sender.tab);

    default:
      logger.warn('Unknown message type:', type);
      return { error: 'Unknown message type' };
  }
}

/**
 * Get a term by ID
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
async function handleGetTerm({ termId }) {
  if (!isIndexReady()) {
    await loadIndex();
  }

  const index = getIndex();
  const content = index.getTermContent(termId);

  if (!content) {
    return { error: 'Term not found' };
  }

  return { term: content };
}

/**
 * Search for terms
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
async function handleSearchTerms({ query, limit = 50 }) {
  if (!isIndexReady()) {
    await loadIndex();
  }

  const index = getIndex();
  const results = index.searchTerms(query, limit);

  return { results };
}

/**
 * Handle request to highlight a page
 * @param {Object} tab
 * @returns {Promise<Object>}
 */
async function handleHighlightPage(tab) {
  if (!tab?.id) {
    return { error: 'No tab provided' };
  }

  try {
    // Check if content script is already injected
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => typeof window.__EMS_GLOSSARY_LOADED__ !== 'undefined',
    });

    if (!results?.[0]?.result) {
      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/content-script.js'],
      });

      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['styles/highlight.css'],
      });
    }

    // Send highlight command to content script
    await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT' });

    return { success: true };
  } catch (error) {
    logger.error('Failed to highlight page:', error);
    return { error: error.message };
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async command => {
  logger.debug('Command received:', command);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return;
  }

  switch (command) {
    case 'toggle-extension':
      // Toggle extension for current site
      const hostname = new URL(tab.url).hostname;
      const isEnabled = await storage.toggleSite(hostname);
      
      // Notify content script
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: isEnabled ? 'ENABLE' : 'DISABLE',
        });
      } catch (error) {
        // Content script not loaded
      }
      break;

    case 'open-search':
      // Open search overlay in the active tab
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'OPEN_SEARCH',
          payload: {},
        });
      } catch (error) {
        // Content script not loaded, try to inject it first
        logger.debug('Content script not loaded, attempting injection');
      }
      break;
  }
});

// Handle extension icon click (if no popup)
chrome.action.onClicked.addListener(async tab => {
  // This only fires if default_popup is not set
  // Since we have a popup, this won't fire
  // But keeping it here for future use
});

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for selected text
  chrome.contextMenus.create({
    id: 'ems-search',
    title: 'Search in EMS Glossary',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ems-search' && info.selectionText) {
    // Open search overlay with selected text as query
    const query = info.selectionText.trim();
    
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'OPEN_SEARCH',
        payload: { query },
      });
    } catch (error) {
      logger.error('Failed to open search overlay:', error);
    }
  }
});

logger.info('Service worker initialized');
