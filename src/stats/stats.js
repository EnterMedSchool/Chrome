/**
 * Stats Page for EMS Medical Glossary
 * Display usage statistics and favorites.
 * 
 * @module stats
 */

import { MESSAGE_TYPES, TAG_COLORS } from '../shared/constants.js';

// State
let termIndex = new Map();
let mostViewed = [];
let favorites = [];

// DOM Elements
let totalViewsEl;
let uniqueTermsEl;
let favoritesCountEl;
let mostViewedList;
let mostViewedEmpty;
let favoritesList;
let favoritesEmpty;
let clearStatsBtn;

/**
 * Initialize the stats page
 */
async function init() {
  // Get DOM references
  totalViewsEl = document.getElementById('totalViews');
  uniqueTermsEl = document.getElementById('uniqueTerms');
  favoritesCountEl = document.getElementById('favoritesCount');
  mostViewedList = document.getElementById('mostViewedList');
  mostViewedEmpty = document.getElementById('mostViewedEmpty');
  favoritesList = document.getElementById('favoritesList');
  favoritesEmpty = document.getElementById('favoritesEmpty');
  clearStatsBtn = document.getElementById('clearStatsBtn');
  
  // Set up event listeners
  setupEventListeners();
  
  // Load data
  await loadTermIndex();
  await loadStats();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  clearStatsBtn?.addEventListener('click', handleClearStats);
}

/**
 * Load term index for name lookups
 */
async function loadTermIndex() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/terms-bundle.json'));
    if (response.ok) {
      const terms = await response.json();
      for (const term of terms) {
        const id = term.id || term.names?.[0]?.toLowerCase().replace(/\s+/g, '-');
        if (id) {
          termIndex.set(id, {
            id,
            name: term.names?.[0] || id,
            primaryTag: term.primary_tag || '',
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to load term index:', error);
  }
}

/**
 * Load all stats
 */
async function loadStats() {
  try {
    // Get stats
    const statsResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_STATS,
    });
    
    // Get most viewed
    const mostViewedResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_MOST_VIEWED,
      payload: { limit: 10 },
    });
    
    // Get favorites
    const favoritesResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_FAVORITES,
    });
    
    // Update summary
    totalViewsEl.textContent = statsResponse?.totalViews || 0;
    uniqueTermsEl.textContent = mostViewedResponse?.uniqueTerms || 0;
    favoritesCountEl.textContent = favoritesResponse?.favorites?.length || 0;
    
    // Store data
    mostViewed = mostViewedResponse?.mostViewed || [];
    favorites = favoritesResponse?.favorites || [];
    
    // Render lists
    renderMostViewed();
    renderFavorites();
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

/**
 * Render most viewed terms list
 */
function renderMostViewed() {
  if (mostViewed.length === 0) {
    mostViewedList.innerHTML = '';
    mostViewedEmpty.style.display = 'flex';
    return;
  }
  
  mostViewedEmpty.style.display = 'none';
  
  mostViewedList.innerHTML = mostViewed.map((item, index) => {
    const termMeta = termIndex.get(item.termId);
    const name = termMeta?.name || item.termId;
    const primaryTag = termMeta?.primaryTag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { icon: '📚' };
    
    return `
      <li class="term-item" data-term-id="${escapeHTML(item.termId)}">
        <span class="term-rank">${index + 1}</span>
        <span class="term-icon">${tagInfo.icon}</span>
        <span class="term-name">${escapeHTML(name)}</span>
        <span class="term-count">${item.count} views</span>
      </li>
    `;
  }).join('');
  
  // Add click handlers
  mostViewedList.querySelectorAll('.term-item').forEach(item => {
    item.addEventListener('click', () => {
      openTermPopup(item.dataset.termId);
    });
  });
}

/**
 * Render favorites list
 */
function renderFavorites() {
  if (favorites.length === 0) {
    favoritesList.innerHTML = '';
    favoritesEmpty.style.display = 'flex';
    return;
  }
  
  favoritesEmpty.style.display = 'none';
  
  favoritesList.innerHTML = favorites.map(termId => {
    const termMeta = termIndex.get(termId);
    const name = termMeta?.name || termId;
    const primaryTag = termMeta?.primaryTag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { icon: '📚' };
    
    return `
      <li class="term-item" data-term-id="${escapeHTML(termId)}">
        <span class="term-icon">${tagInfo.icon}</span>
        <span class="term-name">${escapeHTML(name)}</span>
        <button class="remove-btn" data-term-id="${escapeHTML(termId)}" title="Remove from favorites">×</button>
      </li>
    `;
  }).join('');
  
  // Add click handlers
  favoritesList.querySelectorAll('.term-item').forEach(item => {
    item.addEventListener('click', e => {
      if (!e.target.classList.contains('remove-btn')) {
        openTermPopup(item.dataset.termId);
      }
    });
  });
  
  // Add remove handlers
  favoritesList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const termId = btn.dataset.termId;
      await removeFavorite(termId);
    });
  });
}

/**
 * Remove a term from favorites
 * @param {string} termId
 */
async function removeFavorite(termId) {
  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.TOGGLE_FAVORITE,
      payload: { termId },
    });
    
    // Update local state
    favorites = favorites.filter(id => id !== termId);
    favoritesCountEl.textContent = favorites.length;
    
    // Re-render
    renderFavorites();
  } catch (error) {
    console.error('Failed to remove favorite:', error);
  }
}

/**
 * Open term popup in a new tab or current tab
 * @param {string} termId
 */
async function openTermPopup(termId) {
  // Try to open in current tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TERM_POPUP',
        payload: { termId },
      });
      return;
    }
  } catch (error) {
    console.log('Could not open popup in current tab');
  }
  
  // Fallback: show alert with info
  const termMeta = termIndex.get(termId);
  const name = termMeta?.name || termId;
  alert(`Term: ${name}\n\nOpen a webpage to see the full popup.`);
}

/**
 * Handle clear stats button
 */
async function handleClearStats() {
  const confirmed = confirm('Are you sure you want to clear all statistics?\n\nThis will reset your view counts but keep your favorites.');
  
  if (!confirmed) return;
  
  try {
    // Clear stats via storage
    await chrome.storage.local.set({
      'ems_stats': {
        totalViews: 0,
        termViews: {},
        categoryViews: {},
        lastViewed: null,
      },
    });
    
    // Reset UI
    totalViewsEl.textContent = '0';
    uniqueTermsEl.textContent = '0';
    mostViewed = [];
    renderMostViewed();
    
    alert('Statistics cleared!');
  } catch (error) {
    console.error('Failed to clear stats:', error);
    alert('Failed to clear statistics.');
  }
}

/**
 * Escape HTML
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
