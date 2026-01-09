/**
 * Chrome storage utilities for EMS Medical Glossary
 * Provides a simple API for reading/writing settings
 * @module storage
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

/**
 * Get a value from Chrome storage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {Promise<*>} The stored value or default
 */
export async function get(key, defaultValue = null) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.error('[EMS] Storage get error:', error);
    return defaultValue;
  }
}

/**
 * Set a value in Chrome storage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {Promise<boolean>} Success status
 */
export async function set(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    console.error('[EMS] Storage set error:', error);
    return false;
  }
}

/**
 * Remove a value from Chrome storage
 * @param {string} key - Storage key
 * @returns {Promise<boolean>} Success status
 */
export async function remove(key) {
  try {
    await chrome.storage.local.remove(key);
    return true;
  } catch (error) {
    console.error('[EMS] Storage remove error:', error);
    return false;
  }
}

/**
 * Get all settings with defaults
 * @returns {Promise<Object>} All settings
 */
export async function getSettings() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.ENABLED,
      STORAGE_KEYS.HIGHLIGHT_STYLE,
      STORAGE_KEYS.HIGHLIGHT_COLOR,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.USER_LEVEL,
      STORAGE_KEYS.DISABLED_SITES,
      STORAGE_KEYS.ENABLED_SITES,
      STORAGE_KEYS.FONT_SIZE,
      STORAGE_KEYS.HOVER_PREVIEW,
      STORAGE_KEYS.HOVER_DELAY,
    ]);

    return {
      enabled: result[STORAGE_KEYS.ENABLED] ?? DEFAULT_SETTINGS.enabled,
      highlightStyle: result[STORAGE_KEYS.HIGHLIGHT_STYLE] ?? DEFAULT_SETTINGS.highlightStyle,
      highlightColor: result[STORAGE_KEYS.HIGHLIGHT_COLOR] ?? DEFAULT_SETTINGS.highlightColor,
      theme: result[STORAGE_KEYS.THEME] ?? DEFAULT_SETTINGS.theme,
      userLevel: result[STORAGE_KEYS.USER_LEVEL] ?? DEFAULT_SETTINGS.userLevel,
      disabledSites: result[STORAGE_KEYS.DISABLED_SITES] ?? DEFAULT_SETTINGS.disabledSites,
      enabledSites: result[STORAGE_KEYS.ENABLED_SITES] ?? DEFAULT_SETTINGS.enabledSites,
      fontSize: result[STORAGE_KEYS.FONT_SIZE] ?? DEFAULT_SETTINGS.fontSize,
      hoverPreview: result[STORAGE_KEYS.HOVER_PREVIEW] ?? DEFAULT_SETTINGS.hoverPreview,
      hoverDelay: result[STORAGE_KEYS.HOVER_DELAY] ?? DEFAULT_SETTINGS.hoverDelay,
    };
  } catch (error) {
    console.error('[EMS] Failed to get settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save all settings
 * @param {Object} settings - Settings object
 * @returns {Promise<boolean>} Success status
 */
export async function saveSettings(settings) {
  try {
    const toSave = {};
    
    if (settings.enabled !== undefined) {
      toSave[STORAGE_KEYS.ENABLED] = settings.enabled;
    }
    if (settings.highlightStyle !== undefined) {
      toSave[STORAGE_KEYS.HIGHLIGHT_STYLE] = settings.highlightStyle;
    }
    if (settings.highlightColor !== undefined) {
      toSave[STORAGE_KEYS.HIGHLIGHT_COLOR] = settings.highlightColor;
    }
    if (settings.theme !== undefined) {
      toSave[STORAGE_KEYS.THEME] = settings.theme;
    }
    if (settings.userLevel !== undefined) {
      toSave[STORAGE_KEYS.USER_LEVEL] = settings.userLevel;
    }
    if (settings.disabledSites !== undefined) {
      toSave[STORAGE_KEYS.DISABLED_SITES] = settings.disabledSites;
    }
    if (settings.enabledSites !== undefined) {
      toSave[STORAGE_KEYS.ENABLED_SITES] = settings.enabledSites;
    }
    if (settings.fontSize !== undefined) {
      toSave[STORAGE_KEYS.FONT_SIZE] = settings.fontSize;
    }
    if (settings.hoverPreview !== undefined) {
      toSave[STORAGE_KEYS.HOVER_PREVIEW] = settings.hoverPreview;
    }
    if (settings.hoverDelay !== undefined) {
      toSave[STORAGE_KEYS.HOVER_DELAY] = settings.hoverDelay;
    }

    await chrome.storage.local.set(toSave);
    return true;
  } catch (error) {
    console.error('[EMS] Failed to save settings:', error);
    return false;
  }
}

/**
 * Check if a site is enabled for highlighting
 * @param {string} hostname - The site hostname
 * @returns {Promise<boolean>} Whether the site is enabled
 */
export async function isSiteEnabled(hostname) {
  const settings = await getSettings();
  
  if (!settings.enabled) {
    return false;
  }

  // Check if explicitly disabled
  if (settings.disabledSites.includes(hostname)) {
    return false;
  }

  // If we have an enabled sites list and it's not empty, check it
  if (settings.enabledSites.length > 0) {
    return settings.enabledSites.includes(hostname);
  }

  // Default: enabled everywhere unless explicitly disabled
  return true;
}

/**
 * Toggle a site's enabled status
 * @param {string} hostname - The site hostname
 * @returns {Promise<boolean>} New enabled status
 */
export async function toggleSite(hostname) {
  const settings = await getSettings();
  const disabledSites = [...settings.disabledSites];
  
  const index = disabledSites.indexOf(hostname);
  if (index > -1) {
    // Remove from disabled (enable)
    disabledSites.splice(index, 1);
  } else {
    // Add to disabled
    disabledSites.push(hostname);
  }

  await set(STORAGE_KEYS.DISABLED_SITES, disabledSites);
  return index > -1; // Returns true if now enabled
}

/**
 * Get favorites list
 * @returns {Promise<string[]>} List of favorited term IDs
 */
export async function getFavorites() {
  return await get(STORAGE_KEYS.FAVORITES, []);
}

/**
 * Toggle a term as favorite
 * @param {string} termId - The term ID
 * @returns {Promise<boolean>} New favorite status
 */
export async function toggleFavorite(termId) {
  const favorites = await getFavorites();
  const index = favorites.indexOf(termId);
  
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(termId);
  }

  await set(STORAGE_KEYS.FAVORITES, favorites);
  return index === -1; // Returns true if now favorited
}

/**
 * Check if onboarding is complete
 * @returns {Promise<boolean>} Whether onboarding is complete
 */
export async function isOnboardingComplete() {
  return await get(STORAGE_KEYS.ONBOARDING_COMPLETE, false);
}

/**
 * Mark onboarding as complete
 * @returns {Promise<boolean>} Success status
 */
export async function completeOnboarding() {
  return await set(STORAGE_KEYS.ONBOARDING_COMPLETE, true);
}

/**
 * Get usage statistics
 * @returns {Promise<Object>} Stats object
 */
export async function getStats() {
  return await get(STORAGE_KEYS.STATS, {
    totalViews: 0,
    termViews: {},
    categoryViews: {},
    lastViewed: null,
  });
}

/**
 * Record a term view
 * @param {string} termId - The term ID
 * @param {string} category - The term's primary category
 */
export async function recordView(termId, category) {
  const stats = await getStats();
  
  stats.totalViews = (stats.totalViews || 0) + 1;
  stats.termViews[termId] = (stats.termViews[termId] || 0) + 1;
  stats.categoryViews[category] = (stats.categoryViews[category] || 0) + 1;
  stats.lastViewed = termId;

  await set(STORAGE_KEYS.STATS, stats);
}

/**
 * Get most viewed terms sorted by view count
 * @param {number} limit - Maximum number of terms to return
 * @returns {Promise<Array<{termId: string, count: number}>>}
 */
export async function getMostViewedTerms(limit = 20) {
  const stats = await getStats();
  const termViews = stats.termViews || {};
  
  return Object.entries(termViews)
    .map(([termId, count]) => ({ termId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get unique terms viewed count
 * @returns {Promise<number>}
 */
export async function getUniqueTermsViewed() {
  const stats = await getStats();
  return Object.keys(stats.termViews || {}).length;
}

/**
 * Check if a term is favorited
 * @param {string} termId - The term ID
 * @returns {Promise<boolean>}
 */
export async function isFavorite(termId) {
  const favorites = await getFavorites();
  return favorites.includes(termId);
}

/**
 * Add a term to favorites
 * @param {string} termId - The term ID
 * @returns {Promise<boolean>} Success status
 */
export async function addFavorite(termId) {
  const favorites = await getFavorites();
  if (!favorites.includes(termId)) {
    favorites.push(termId);
    await set(STORAGE_KEYS.FAVORITES, favorites);
  }
  return true;
}

/**
 * Remove a term from favorites
 * @param {string} termId - The term ID
 * @returns {Promise<boolean>} Success status
 */
export async function removeFavorite(termId) {
  const favorites = await getFavorites();
  const index = favorites.indexOf(termId);
  if (index > -1) {
    favorites.splice(index, 1);
    await set(STORAGE_KEYS.FAVORITES, favorites);
  }
  return true;
}

/**
 * Clear all statistics
 * @returns {Promise<boolean>} Success status
 */
export async function clearStats() {
  return await set(STORAGE_KEYS.STATS, {
    totalViews: 0,
    termViews: {},
    categoryViews: {},
    lastViewed: null,
  });
}

/**
 * Clear all favorites
 * @returns {Promise<boolean>} Success status
 */
export async function clearFavorites() {
  return await set(STORAGE_KEYS.FAVORITES, []);
}

// =============================================================================
// DISAMBIGUATION CHOICES
// =============================================================================

const DISAMBIGUATION_KEY = 'ems_disambiguation_choices';

/**
 * Save user's disambiguation choice for a pattern
 * @param {string} pattern - The ambiguous pattern
 * @param {string} termId - The chosen term ID
 * @returns {Promise<boolean>}
 */
export async function saveDisambiguationChoice(pattern, termId) {
  const choices = await get(DISAMBIGUATION_KEY, {});
  choices[pattern.toLowerCase()] = {
    termId,
    chosenAt: new Date().toISOString(),
  };
  return await set(DISAMBIGUATION_KEY, choices);
}

/**
 * Get user's saved disambiguation choice for a pattern
 * @param {string} pattern - The ambiguous pattern
 * @returns {Promise<string|null>} The chosen term ID or null
 */
export async function getDisambiguationChoice(pattern) {
  const choices = await get(DISAMBIGUATION_KEY, {});
  return choices[pattern.toLowerCase()]?.termId || null;
}

/**
 * Clear all disambiguation choices
 * @returns {Promise<boolean>}
 */
export async function clearDisambiguationChoices() {
  return await set(DISAMBIGUATION_KEY, {});
}

// =============================================================================
// USER PREFERENCES (popup size, etc.)
// =============================================================================

const PREFERENCES_KEY = 'ems_user_preferences';

/**
 * Get all user preferences
 * @returns {Promise<Object>}
 */
export async function getPreferences() {
  return await get(PREFERENCES_KEY, {
    popupWidth: 450,
    popupHeight: 500,
    popupFontSize: 100,
    hoverPreview: false,
    hoverDelay: 300,
  });
}

/**
 * Save a user preference
 * @param {string} key - Preference key
 * @param {*} value - Preference value
 * @returns {Promise<boolean>}
 */
export async function setPreference(key, value) {
  const prefs = await getPreferences();
  prefs[key] = value;
  return await set(PREFERENCES_KEY, prefs);
}

/**
 * Get a specific preference
 * @param {string} key - Preference key
 * @param {*} defaultValue - Default value
 * @returns {Promise<*>}
 */
export async function getPreference(key, defaultValue = null) {
  const prefs = await getPreferences();
  return prefs[key] !== undefined ? prefs[key] : defaultValue;
}

/**
 * Reset all settings to defaults
 * @returns {Promise<boolean>} Success status
 */
export async function resetToDefaults() {
  try {
    await chrome.storage.local.clear();
    return true;
  } catch (error) {
    console.error('[EMS] Failed to reset settings:', error);
    return false;
  }
}
