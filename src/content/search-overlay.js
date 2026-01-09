/**
 * Search Overlay for EMS Medical Glossary
 * Global search dialog that can be triggered via keyboard shortcut or context menu.
 * 
 * @module search-overlay
 */

import { TAG_COLORS, MESSAGE_TYPES } from '../shared/constants.js';
import * as logger from '../shared/logger.js';

/**
 * Safely send a message to the extension runtime
 * @param {Object} message - Message to send
 * @returns {Promise<any>} - Response from the runtime, or null if unavailable
 */
async function sendRuntimeMessage(message) {
  try {
    if (!chrome?.runtime?.sendMessage) {
      logger.warn('Extension runtime unavailable');
      return null;
    }
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message?.includes('Extension context invalidated')) {
      logger.warn('Extension context invalidated - page reload required');
      return null;
    }
    throw error;
  }
}

/**
 * Search Overlay controller
 */
export class SearchOverlay {
  constructor() {
    /** @type {HTMLElement|null} */
    this.overlay = null;
    /** @type {ShadowRoot|null} */
    this.shadow = null;
    /** @type {HTMLInputElement|null} */
    this.input = null;
    /** @type {HTMLElement|null} */
    this.resultsList = null;
    /** @type {HTMLElement|null} */
    this.resultsCount = null;
    /** @type {boolean} */
    this.isVisible = false;
    /** @type {Object[]} */
    this.results = [];
    /** @type {number} */
    this.selectedIndex = -1;
    /** @type {number|null} */
    this.searchTimeout = null;
    /** @type {string} */
    this.themeSetting = 'auto';
    /** @type {Function|null} */
    this.onTermSelect = null;
  }

  /**
   * Initialize the search overlay
   * @param {Function} onTermSelect - Callback when a term is selected
   */
  init(onTermSelect) {
    this.onTermSelect = onTermSelect;
    this.createOverlay();
    this.setupEventListeners();
    logger.debug('Search overlay initialized');
  }

  /**
   * Set the theme preference
   * @param {string} theme - 'light', 'dark', or 'auto'
   */
  setTheme(theme) {
    this.themeSetting = theme || 'auto';
    if (this.overlay) {
      this.overlay.dataset.theme = this.isDarkMode() ? 'dark' : 'light';
    }
  }

  /**
   * Check if dark mode is enabled
   * @returns {boolean}
   */
  isDarkMode() {
    if (this.themeSetting === 'dark') return true;
    if (this.themeSetting === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  /**
   * Create the overlay DOM structure
   */
  createOverlay() {
    // Create container with Shadow DOM for style isolation
    this.overlay = document.createElement('div');
    this.overlay.id = 'ems-search-overlay-container';
    // Start hidden - CSS will handle visibility when .visible class is added
    this.overlay.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 2147483646; display: none; visibility: hidden; opacity: 0;';
    
    this.shadow = this.overlay.attachShadow({ mode: 'open' });
    
    // Load styles
    this.loadStyles();
    
    // Create overlay structure
    const theme = this.isDarkMode() ? 'dark' : 'light';
    const wrapper = document.createElement('div');
    wrapper.className = 'ems-search-overlay';
    wrapper.dataset.theme = theme;
    wrapper.innerHTML = `
      <div class="ems-search-dialog" role="dialog" aria-modal="true" aria-labelledby="ems-search-title">
        <header class="ems-search-header">
          <span class="ems-search-icon">🔍</span>
          <div class="ems-search-input-wrapper">
            <input 
              type="text" 
              class="ems-search-input" 
              placeholder="Search medical terms..." 
              aria-label="Search terms"
              autocomplete="off"
              spellcheck="false"
            >
          </div>
          <button class="ems-search-close" aria-label="Close search">×</button>
        </header>
        
        <div class="ems-search-results-container">
          <div class="ems-search-results-count"></div>
          <ul class="ems-search-results-list" role="listbox"></ul>
          <div class="ems-search-empty" style="display: none;">
            <div class="ems-search-empty-icon">🔍</div>
            <div class="ems-search-empty-title">No terms found</div>
            <div class="ems-search-empty-text">Try a different search term</div>
          </div>
          <div class="ems-search-loading" style="display: none;">
            <div class="ems-search-spinner"></div>
          </div>
        </div>
        
        <footer class="ems-search-footer">
          <span class="ems-search-hint">
            <span class="ems-key">↑</span>
            <span class="ems-key">↓</span>
            to navigate
          </span>
          <span class="ems-search-hint">
            <span class="ems-key">Enter</span>
            to select
          </span>
          <span class="ems-search-hint">
            <span class="ems-key">Esc</span>
            to close
          </span>
        </footer>
      </div>
    `;
    
    this.shadow.appendChild(wrapper);
    
    // Store references
    this.input = this.shadow.querySelector('.ems-search-input');
    this.resultsList = this.shadow.querySelector('.ems-search-results-list');
    this.resultsCount = this.shadow.querySelector('.ems-search-results-count');
    
    // Append to document
    document.body.appendChild(this.overlay);
  }

  /**
   * Load styles into shadow DOM
   */
  async loadStyles() {
    // Check if extension runtime is available
    if (!chrome?.runtime?.getURL) {
      logger.warn('Extension runtime unavailable - search overlay styles not loaded');
      return;
    }

    try {
      const cssUrl = chrome.runtime.getURL('styles/search-overlay.css');
      const response = await fetch(cssUrl);
      const css = await response.text();
      
      const style = document.createElement('style');
      style.textContent = css;
      this.shadow.insertBefore(style, this.shadow.firstChild);
    } catch (error) {
      logger.error('Failed to load search overlay styles:', error);
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = this.shadow.querySelector('.ems-search-close');
    closeBtn?.addEventListener('click', () => this.hide());
    
    // Click outside to close
    const overlayWrapper = this.shadow.querySelector('.ems-search-overlay');
    overlayWrapper?.addEventListener('click', e => {
      if (e.target === overlayWrapper) {
        this.hide();
      }
    });
    
    // Input events
    this.input?.addEventListener('input', e => this.handleInput(e));
    this.input?.addEventListener('keydown', e => this.handleKeydown(e));
    
    // Listen for messages to open search
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'OPEN_SEARCH') {
          this.show(message.query || '');
          sendResponse({ success: true });
        }
        return true;
      });
    }
  }

  /**
   * Show the search overlay
   * @param {string} initialQuery - Initial search query
   */
  show(initialQuery = '') {
    if (this.isVisible) {
      this.input?.focus();
      return;
    }
    
    // Update theme
    const wrapper = this.shadow.querySelector('.ems-search-overlay');
    if (wrapper) {
      wrapper.dataset.theme = this.isDarkMode() ? 'dark' : 'light';
    }
    
    // Reset state
    this.results = [];
    this.selectedIndex = -1;
    this.resultsList.innerHTML = '';
    this.resultsCount.textContent = '';
    
    // Set initial query if provided
    if (initialQuery) {
      this.input.value = initialQuery;
      this.performSearch(initialQuery);
    } else {
      // Show initial empty state with hint
      this.showInitialState();
    }
    
    // Show overlay - make container visible first
    this.overlay.style.display = 'block';
    this.overlay.style.visibility = 'visible';
    this.overlay.style.opacity = '1';
    
    const overlayWrapper = this.shadow.querySelector('.ems-search-overlay');
    overlayWrapper?.classList.add('visible');
    this.isVisible = true;
    
    // Focus input
    setTimeout(() => {
      this.input?.focus();
      this.input?.select();
    }, 50);
    
    logger.debug('Search overlay shown');
  }

  /**
   * Hide the search overlay
   */
  hide() {
    if (!this.isVisible) return;
    
    const overlayWrapper = this.shadow.querySelector('.ems-search-overlay');
    overlayWrapper?.classList.remove('visible');
    this.isVisible = false;
    
    // Hide container completely
    this.overlay.style.display = 'none';
    this.overlay.style.visibility = 'hidden';
    this.overlay.style.opacity = '0';
    
    // Clear search
    if (this.input) {
      this.input.value = '';
    }
    
    logger.debug('Search overlay hidden');
  }

  /**
   * Toggle the search overlay
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Handle input changes
   * @param {Event} e
   */
  handleInput(e) {
    const query = e.target.value.trim();
    
    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    
    if (!query) {
      this.showInitialState();
      return;
    }
    
    // Show loading
    this.showLoading(true);
    
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 150);
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} e
   */
  handleKeydown(e) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
        
      case 'Enter':
        e.preventDefault();
        this.selectCurrent();
        break;
    }
  }

  /**
   * Perform search
   * @param {string} query
   */
  async performSearch(query) {
    try {
      const response = await sendRuntimeMessage({
        type: MESSAGE_TYPES.SEARCH_TERMS,
        payload: { query, limit: 50 },
      });
      
      this.results = response?.results || [];
      this.selectedIndex = this.results.length > 0 ? 0 : -1;
      
      this.showLoading(false);
      this.renderResults(query);
    } catch (error) {
      logger.error('Search failed:', error);
      this.showLoading(false);
      this.showError('Search failed. Please try again.');
    }
  }

  /**
   * Render search results
   * @param {string} query
   */
  renderResults(query) {
    const emptyState = this.shadow.querySelector('.ems-search-empty');
    
    if (this.results.length === 0) {
      this.resultsList.innerHTML = '';
      this.resultsCount.textContent = '';
      emptyState.style.display = 'flex';
      return;
    }
    
    emptyState.style.display = 'none';
    this.resultsCount.textContent = `${this.results.length} term${this.results.length !== 1 ? 's' : ''} found`;
    
    this.resultsList.innerHTML = this.results.map((term, index) => {
      const name = term.name || term.names?.[0] || term.id;
      const primaryTag = term.primaryTag || term.primary_tag || '';
      const tagInfo = TAG_COLORS[primaryTag] || { accent: '#6C5CE7', icon: '📚' };
      const displayTag = primaryTag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const definition = term.definition || '';
      const snippet = definition.length > 80 ? definition.substring(0, 80) + '...' : definition;
      
      // Highlight matched text
      const highlightedName = this.highlightMatch(name, query);
      
      return `
        <li class="ems-search-result-item${index === this.selectedIndex ? ' selected' : ''}" 
            role="option" 
            data-term-id="${this.escapeHTML(term.id)}"
            data-index="${index}">
          <span class="ems-search-result-icon">${tagInfo.icon}</span>
          <div class="ems-search-result-content">
            <div class="ems-search-result-name">${highlightedName}</div>
            ${snippet ? `<div class="ems-search-result-snippet">${this.escapeHTML(snippet)}</div>` : ''}
          </div>
          <span class="ems-search-result-tag" style="background: ${tagInfo.accent}">${displayTag}</span>
        </li>
      `;
    }).join('');
    
    // Add click handlers
    this.resultsList.querySelectorAll('.ems-search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const termId = item.dataset.termId;
        if (termId) {
          this.selectTerm(termId);
        }
      });
      
      item.addEventListener('mouseenter', () => {
        const index = parseInt(item.dataset.index, 10);
        this.updateSelection(index);
      });
    });
  }

  /**
   * Highlight matched text in results
   * @param {string} text
   * @param {string} query
   * @returns {string}
   */
  highlightMatch(text, query) {
    if (!query) return this.escapeHTML(text);
    
    const escaped = this.escapeHTML(text);
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(queryLower);
    
    if (index === -1) return escaped;
    
    const before = this.escapeHTML(text.substring(0, index));
    const match = this.escapeHTML(text.substring(index, index + query.length));
    const after = this.escapeHTML(text.substring(index + query.length));
    
    return `${before}<span class="ems-search-match">${match}</span>${after}`;
  }

  /**
   * Show initial state
   */
  showInitialState() {
    const emptyState = this.shadow.querySelector('.ems-search-empty');
    emptyState.innerHTML = `
      <div class="ems-search-empty-icon">📚</div>
      <div class="ems-search-empty-title">Search the Glossary</div>
      <div class="ems-search-empty-text">Start typing to find medical terms, conditions, and definitions</div>
    `;
    emptyState.style.display = 'flex';
    this.resultsList.innerHTML = '';
    this.resultsCount.textContent = '';
  }

  /**
   * Show loading state
   * @param {boolean} show
   */
  showLoading(show) {
    const loading = this.shadow.querySelector('.ems-search-loading');
    const emptyState = this.shadow.querySelector('.ems-search-empty');
    
    if (show) {
      loading.style.display = 'flex';
      emptyState.style.display = 'none';
      this.resultsList.innerHTML = '';
    } else {
      loading.style.display = 'none';
    }
  }

  /**
   * Show error state
   * @param {string} message
   */
  showError(message) {
    const emptyState = this.shadow.querySelector('.ems-search-empty');
    emptyState.innerHTML = `
      <div class="ems-search-empty-icon">⚠️</div>
      <div class="ems-search-empty-title">Oops!</div>
      <div class="ems-search-empty-text">${this.escapeHTML(message)}</div>
    `;
    emptyState.style.display = 'flex';
  }

  /**
   * Select next result
   */
  selectNext() {
    if (this.results.length === 0) return;
    
    const newIndex = this.selectedIndex < this.results.length - 1 
      ? this.selectedIndex + 1 
      : 0;
    this.updateSelection(newIndex);
  }

  /**
   * Select previous result
   */
  selectPrevious() {
    if (this.results.length === 0) return;
    
    const newIndex = this.selectedIndex > 0 
      ? this.selectedIndex - 1 
      : this.results.length - 1;
    this.updateSelection(newIndex);
  }

  /**
   * Update selection
   * @param {number} index
   */
  updateSelection(index) {
    // Remove previous selection
    const prev = this.resultsList.querySelector('.ems-search-result-item.selected');
    prev?.classList.remove('selected');
    
    // Add new selection
    this.selectedIndex = index;
    const items = this.resultsList.querySelectorAll('.ems-search-result-item');
    if (items[index]) {
      items[index].classList.add('selected');
      items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Select current result
   */
  selectCurrent() {
    if (this.selectedIndex >= 0 && this.results[this.selectedIndex]) {
      const term = this.results[this.selectedIndex];
      this.selectTerm(term.id);
    }
  }

  /**
   * Select a term and show its popup
   * @param {string} termId
   */
  selectTerm(termId) {
    // Capture the current query before hiding
    const searchQuery = this.input?.value?.trim() || '';
    
    this.hide();
    
    if (this.onTermSelect) {
      this.onTermSelect(termId, searchQuery);
    }
  }

  /**
   * Escape HTML special characters
   * @param {string} str
   * @returns {string}
   */
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default SearchOverlay;
