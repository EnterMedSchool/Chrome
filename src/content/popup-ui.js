/**
 * Popup UI for EnterMedSchool Glossary
 * Renders term details in an isolated Shadow DOM to prevent style conflicts.
 * 
 * @module popup-ui
 */

import { SECTIONS, COLLAPSED_SECTIONS, TAG_COLORS, MESSAGE_TYPES } from '../shared/constants.js';
import * as logger from '../shared/logger.js';

// DOMPurify will be loaded dynamically for XSS protection
let DOMPurify = null;

/**
 * Popup UI controller
 */
export class PopupUI {
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {ShadowRoot|null} */
    this.shadow = null;
    /** @type {string|null} */
    this.currentTermId = null;
    /** @type {string[]} */
    this.history = [];
    /** @type {boolean} */
    this.isVisible = false;
    /** @type {boolean} */
    this.isPreviewVisible = false;
    /** @type {string} */
    this.themeSetting = 'auto'; // 'light', 'dark', or 'auto'
    /** @type {number} */
    this.fontSize = 100;
    /** @type {{width: number, height: number}} */
    this.savedSize = { width: 450, height: 500 }; // Default size
    /** @type {ResizeObserver|null} */
    this.resizeObserver = null;
    /** @type {boolean} */
    this.sizeLoaded = false;
    /** @type {boolean} */
    this.betaFeaturesEnabled = false;
    /** @type {Map<string, string[]>|null} */
    this.termPatterns = null;
    /** @type {string|null} */
    this.currentTermIdForHighlight = null;
  }

  /**
   * Set the term patterns for inline term highlighting
   * @param {Map<string, string[]>} patterns - Map of pattern -> termIds
   */
  setTermPatterns(patterns) {
    this.termPatterns = patterns;
  }

  /**
   * Safely send a message to the extension runtime
   * Handles cases where the extension context has been invalidated
   * @param {Object} message - Message to send
   * @returns {Promise<any>} - Response from the runtime, or null if unavailable
   */
  async sendRuntimeMessage(message) {
    try {
      if (!chrome?.runtime?.sendMessage) {
        logger.warn('Extension runtime unavailable');
        return null;
      }
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Handle extension context invalidated error
      if (error.message?.includes('Extension context invalidated')) {
        logger.warn('Extension context invalidated - page reload required');
        return null;
      }
      throw error;
    }
  }

  /**
   * Set the font size percentage
   * @param {number} size - Font size percentage (70-150)
   */
  setFontSize(size) {
    this.fontSize = size || 100;
    // Apply to existing popup if visible
    if (this.shadow) {
      const popup = this.shadow.querySelector('.ems-popup, .ems-preview');
      if (popup) {
        popup.style.fontSize = `${this.fontSize}%`;
      }
    }
  }

  /**
   * Set whether beta features are enabled
   * @param {boolean} enabled
   */
  setBetaFeatures(enabled) {
    this.betaFeaturesEnabled = enabled;
  }

  /**
   * Set the saved popup size
   * @param {number} width
   * @param {number} height
   */
  setSavedSize(width, height) {
    if (width && height) {
      this.savedSize = { width, height };
    }
  }

  /**
   * Save current popup size
   */
  async saveCurrentSize() {
    const popup = this.shadow?.querySelector('.ems-popup');
    if (!popup) return;

    // Don't save if popup is not visible - prevents saving tiny dimensions when hiding
    if (!this.isVisible) {
      return;
    }

    const rect = popup.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Don't save unreasonably small sizes
    if (width < 300 || height < 150) {
      return;
    }

    this.savedSize = { width, height };

    // Save to storage
    try {
      await this.sendRuntimeMessage({
        type: 'SAVE_POPUP_SIZE',
        payload: { width, height },
      });
    } catch (error) {
      logger.error('Failed to save popup size:', error);
    }
  }

  /**
   * Set the theme preference
   * @param {string} theme - 'light', 'dark', or 'auto'
   */
  setTheme(theme) {
    this.themeSetting = theme || 'auto';
  }

  /**
   * Initialize the popup
   */
  async init() {
    this.createContainer();
    this.loadStyles();
    this.setupEventListeners();
    await this.loadSavedSize();
  }

  /**
   * Load saved popup size from storage
   */
  async loadSavedSize() {
    try {
      const response = await this.sendRuntimeMessage({
        type: 'GET_POPUP_SIZE',
      });
      if (response?.width && response?.height) {
        this.savedSize = {
          width: response.width,
          height: response.height,
        };
        logger.info('Loaded saved popup size:', this.savedSize);
      }
    } catch (error) {
      logger.error('Failed to load saved popup size:', error);
    }
    this.sizeLoaded = true;
  }

  /**
   * Create the popup container with Shadow DOM
   */
  createContainer() {
    // Create container - triple-ensure it's hidden by default
    this.container = document.createElement('div');
    this.container.id = 'ems-popup-container';
    this.container.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
    `;

    // Create shadow root for style isolation
    this.shadow = this.container.attachShadow({ mode: 'open' });

    // Append to body
    document.body.appendChild(this.container);
  }

  /**
   * Load styles into shadow DOM
   */
  async loadStyles() {
    // Check if extension runtime is available
    if (!chrome?.runtime?.getURL) {
      logger.warn('Extension runtime unavailable - using fallback styles');
      this.loadFallbackStyles();
      return;
    }

    try {
      // Try to load fonts first (optional, won't break if missing)
      try {
        const fontsUrl = chrome.runtime.getURL('assets/fonts/fonts.css');
        const fontsResponse = await fetch(fontsUrl);
        if (fontsResponse.ok) {
          const fontsCss = await fontsResponse.text();
          
          // Fix font URLs to be absolute paths for the extension
          const fontsBaseUrl = chrome.runtime.getURL('assets/fonts/');
          const fixedFontsCss = fontsCss.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, url) => {
            if (url.startsWith('http') || url.startsWith('chrome-extension://') || url.startsWith('data:')) {
              return match;
            }
            return `url('${fontsBaseUrl}${url}')`;
          });
          
          const fontsStyle = document.createElement('style');
          fontsStyle.textContent = fixedFontsCss;
          this.shadow.appendChild(fontsStyle);
        }
      } catch (fontError) {
        // Fonts are optional, continue without them
        logger.warn('Could not load custom fonts:', fontError);
      }
      
      // Load main popup styles
      const cssUrl = chrome.runtime.getURL('styles/popup-content.css');
      const response = await fetch(cssUrl);
      if (!response.ok) {
        throw new Error(`Failed to load CSS: ${response.status}`);
      }
      const css = await response.text();

      const style = document.createElement('style');
      style.textContent = css;
      this.shadow.appendChild(style);
    } catch (error) {
      // Handle extension context invalidated gracefully
      if (error.message?.includes('Extension context invalidated')) {
        logger.warn('Extension context invalidated while loading styles');
      } else {
        logger.error('Failed to load popup styles:', error);
      }
      // Use fallback inline styles
      this.loadFallbackStyles();
    }
  }

  /**
   * Load fallback styles if external CSS fails
   */
  loadFallbackStyles() {
    const style = document.createElement('style');
    style.textContent = this.getFallbackCSS();
    this.shadow.appendChild(style);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Close on click outside
    document.addEventListener('click', e => {
      if (this.isVisible && !this.container.contains(e.target) && !e.target.closest('.ems-term')) {
        this.hide();
      }
    });

    // Close on escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Show popup for term(s) - called from external page clicks.
   * Resets navigation history since this is a fresh context.
   * @param {string[]} termIds
   * @param {number} x
   * @param {number} y
   */
  async show(termIds, x, y) {
    if (!termIds || termIds.length === 0) {
      return;
    }

    // Reset history for new external context (breadcrumbs only track internal navigation)
    this.history = [];
    this.currentTermId = null;

    // If multiple terms, check for saved disambiguation choice first
    if (termIds.length > 1) {
      const pattern = termIds.sort().join('|');
      const savedChoice = await this.getDisambiguationChoice(pattern);
      
      if (savedChoice && termIds.includes(savedChoice)) {
        // User previously chose this term, show it directly
        await this.showTerm(savedChoice, x, y);
        return;
      }
      
      await this.showDisambiguation(termIds, x, y, pattern);
      return;
    }

    await this.showTerm(termIds[0], x, y);
  }

  /**
   * Get saved disambiguation choice
   * @param {string} pattern
   * @returns {Promise<string|null>}
   */
  async getDisambiguationChoice(pattern) {
    try {
      const response = await this.sendRuntimeMessage({
        type: 'GET_DISAMBIGUATION_CHOICE',
        payload: { pattern },
      });
      return response?.termId || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save disambiguation choice
   * @param {string} pattern
   * @param {string} termId
   */
  async saveDisambiguationChoice(pattern, termId) {
    try {
      await this.sendRuntimeMessage({
        type: 'SAVE_DISAMBIGUATION_CHOICE',
        payload: { pattern, termId },
      });
    } catch (error) {
      logger.error('Failed to save disambiguation choice:', error);
    }
  }

  /**
   * Show a single term
   * @param {string} termId
   * @param {number} x
   * @param {number} y
   */
  /**
   * Show loading skeleton while fetching term content
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  showLoadingSkeleton(x, y) {
    const theme = this.isDarkMode() ? 'dark' : 'light';
    const skeletonHTML = `
      <div class="ems-popup ems-popup-loading" data-theme="${theme}">
        <header class="ems-popup-header">
          <div class="ems-header-left">
            <div class="ems-skeleton ems-skeleton-icon"></div>
            <div class="ems-skeleton ems-skeleton-title"></div>
          </div>
        </header>
        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            <div class="ems-skeleton ems-skeleton-tags"></div>
            <div class="ems-skeleton ems-skeleton-section"></div>
            <div class="ems-skeleton ems-skeleton-section"></div>
            <div class="ems-skeleton ems-skeleton-section-short"></div>
          </main>
        </div>
      </div>
    `;
    
    this.render(skeletonHTML);
    this.position(x, y);
    this.showContainer();
    
    // Apply saved size to skeleton (always have a value due to default)
    const popup = this.shadow.querySelector('.ems-popup');
    if (popup) {
      popup.style.width = `${this.savedSize.width}px`;
      popup.style.height = `${this.savedSize.height}px`;
    }
  }

  /**
   * Show the popup container
   */
  showContainer() {
    this.container.style.display = 'block';
    this.container.style.visibility = 'visible';
    this.container.style.opacity = '1';
    this.container.style.pointerEvents = 'auto';
  }

  /**
   * Hide the popup container
   */
  hideContainer() {
    this.container.style.display = 'none';
    this.container.style.visibility = 'hidden';
    this.container.style.opacity = '0';
    this.container.style.pointerEvents = 'none';
  }

  async showTerm(termId, x, y, searchQuery = null) {
    logger.info('Showing popup for:', termId);

    // Show loading skeleton while fetching
    this.showLoadingSkeleton(x, y);

    // Get term content
    const term = await this.fetchTermContent(termId);
    if (!term) {
      logger.error('Term not found:', termId);
      return;
    }

    // Update current term ID (history is managed by navigateToTerm for internal navigation)
    this.currentTermId = termId;

    // Build and render HTML
    const html = this.buildTermHTML(term);
    this.render(html);

    // Position and show
    this.position(x, y);
    this.showContainer();
    this.isVisible = true;

    // Apply saved size and settings
    const popup = this.shadow.querySelector('.ems-popup');
    if (popup) {
      popup.focus();
      this.applySavedSettings(popup);
      
      // Highlight search terms if query was provided
      if (searchQuery) {
        this.highlightSearchTerms(popup, searchQuery);
      }
    }
  }

  /**
   * Apply saved size and settings to popup
   * @param {HTMLElement} popup
   */
  applySavedSettings(popup) {
    if (!popup) return;
    
    // Apply font size
    if (this.fontSize && this.fontSize !== 100) {
      popup.style.fontSize = `${this.fontSize}%`;
    }
    
    // Apply saved dimensions (always have a value now due to default)
    popup.style.width = `${this.savedSize.width}px`;
    popup.style.height = `${this.savedSize.height}px`;
    
    // Set up resize observer
    this.observeResize(popup);
  }

  /**
   * Observe resize events on popup
   * @param {HTMLElement} popup
   */
  observeResize(popup) {
    // Disconnect previous observer if exists
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Debounced save on resize
    let resizeTimeout = null;
    
    this.resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        this.saveCurrentSize();
      }, 500);
    });
    
    this.resizeObserver.observe(popup);
  }

  /**
   * Show disambiguation menu for multiple term matches
   * @param {string[]} termIds
   * @param {number} x
   * @param {number} y
   * @param {string} pattern - Pattern key for saving choice
   */
  async showDisambiguation(termIds, x, y, pattern = null) {
    const terms = [];
    for (const id of termIds) {
      const term = await this.fetchTermContent(id);
      if (term) {
        terms.push(term);
      }
    }

    // Store pattern for later
    this._currentDisambiguationPattern = pattern;

    const html = this.buildDisambiguationHTML(terms);
    this.render(html);
    this.position(x, y);
    this.showContainer();
    this.isVisible = true;
    
    // Apply saved settings
    const popup = this.shadow.querySelector('.ems-popup');
    if (popup) {
      this.applySavedSettings(popup);
    }
  }

  /**
   * Show search results
   * @param {string} query
   * @param {Object[]} results
   */
  showSearchResults(query, results) {
    const html = this.buildSearchResultsHTML(query, results);
    this.render(html);

    // Position in center of viewport
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 3;
    this.position(x, y);

    this.showContainer();
    this.isVisible = true;
    
    // Apply saved settings
    const popup = this.shadow.querySelector('.ems-popup');
    if (popup) {
      this.applySavedSettings(popup);
    }
  }

  /**
   * Hide the popup
   */
  hide() {
    // Disconnect ResizeObserver BEFORE hiding to prevent saving tiny dimensions
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    this.hideContainer();
    this.isVisible = false;
    this.isPreviewVisible = false;
  }

  /**
   * Show a mini preview for hover mode
   * @param {string[]} termIds
   * @param {number} x
   * @param {number} y
   */
  async showPreview(termIds, x, y) {
    if (!termIds || termIds.length === 0 || this.isVisible) {
      return;
    }

    // Get the first term for preview
    const term = await this.fetchTermContent(termIds[0]);
    if (!term) {
      return;
    }

    const html = this.buildPreviewHTML(term, termIds);
    this.render(html);
    this.position(x, y);
    
    this.showContainer();
    this.isPreviewVisible = true;

    // Add mouse enter handler to keep preview visible
    const preview = this.shadow.querySelector('.ems-preview');
    if (preview) {
      preview.addEventListener('mouseenter', () => {
        this._keepPreview = true;
      });
      preview.addEventListener('mouseleave', () => {
        this._keepPreview = false;
        setTimeout(() => {
          if (!this._keepPreview && this.isPreviewVisible) {
            this.hidePreview();
          }
        }, 100);
      });
      preview.addEventListener('click', () => {
        // Click on preview opens full popup
        const termId = preview.dataset.termId;
        if (termId) {
          this.hidePreview();
          this.showTerm(termId, x, y);
        }
      });
    }
  }

  /**
   * Hide the mini preview
   */
  hidePreview() {
    if (!this.isPreviewVisible) {
      return;
    }
    
    if (this._keepPreview) {
      return;
    }

    this.hideContainer();
    this.isPreviewVisible = false;
  }

  /**
   * Build HTML for mini preview
   * @param {Object} term
   * @param {string[]} termIds
   * @returns {string}
   */
  buildPreviewHTML(term, termIds) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');
    const primaryTag = term.primary_tag || '';
    const level = term.level || 'medschool';
    const isPremed = level === 'premed';
    
    // Use green accent for premed terms, otherwise use tag color
    const defaultAccent = isPremed ? '#10B981' : '#6C5CE7';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: defaultAccent, icon: isPremed ? '📖' : '📚' };
    const headerAccent = isPremed ? '#10B981' : tagInfo.accent;
    
    const displayTag = primaryTag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const definition = term.definition || 'No definition available.';
    const hasMultiple = termIds.length > 1;

    return `
      <div class="ems-preview ${isPremed ? 'ems-preview--premed' : ''}" role="tooltip" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" data-level="${level}">
        <div class="ems-preview-header" style="background: linear-gradient(135deg, ${headerAccent} 0%, ${this.adjustColor(headerAccent, 20)} 100%);">
          <span class="ems-preview-icon">${tagInfo.icon}</span>
          <span class="ems-preview-title">${this.escapeHTML(name)}</span>
          <span class="ems-preview-tag" style="background: rgba(255,255,255,0.2)">${isPremed ? 'PREMED' : displayTag}</span>
        </div>
        <div class="ems-preview-body">
          <p>${this.renderMarkdown(definition)}</p>
        </div>
        <div class="ems-preview-footer">
          ${hasMultiple ? `<span class="ems-preview-multiple">+${termIds.length - 1} more</span>` : ''}
          <span class="ems-preview-hint">Click for details</span>
        </div>
      </div>
    `;
  }

  /**
   * Adjust a hex color brightness
   * @param {string} hex - Hex color
   * @param {number} percent - Percentage to lighten (positive) or darken (negative)
   * @returns {string} Adjusted hex color
   */
  adjustColor(hex, percent) {
    // Remove # if present
    hex = hex.replace(/^#/, '');
    
    // Parse RGB
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    // Adjust
    r = Math.min(255, Math.max(0, r + (r * percent / 100)));
    g = Math.min(255, Math.max(0, g + (g * percent / 100)));
    b = Math.min(255, Math.max(0, b + (b * percent / 100)));
    
    // Convert back to hex
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  }

  /**
   * Navigate back in history
   */
  goBack() {
    if (this.history.length === 0) {
      return;
    }

    const prevTermId = this.history.pop();
    // Set currentTermId to null to prevent it being re-added to history
    this.currentTermId = null;
    this.showTerm(prevTermId, 
      parseInt(this.container.style.left) || window.innerWidth / 2,
      parseInt(this.container.style.top) || window.innerHeight / 3
    );
  }

  /**
   * Jump to a specific point in history
   * @param {number} index - History index (0 = first term)
   */
  jumpToHistory(index) {
    if (index <= 0 || index > this.history.length) {
      // Go back to first term
      const firstTerm = this.history[0];
      this.history = [];
      this.currentTermId = null;
      this.showTerm(firstTerm,
        parseInt(this.container.style.left) || window.innerWidth / 2,
        parseInt(this.container.style.top) || window.innerHeight / 3
      );
    } else {
      // Pop history up to that point
      const targetTerm = this.history[index - 1];
      this.history = this.history.slice(0, index - 1);
      this.currentTermId = null;
      this.showTerm(targetTerm,
        parseInt(this.container.style.left) || window.innerWidth / 2,
        parseInt(this.container.style.top) || window.innerHeight / 3
      );
    }
  }

  /**
   * Navigate to a term from within the popup (internal navigation).
   * This creates a "knowledge rabbit hole" experience by tracking history.
   * Only called when clicking on terms INSIDE the popup content.
   * @param {string} termId - The term to navigate to
   */
  navigateToTerm(termId) {
    if (!termId) return;

    // Get current term from the popup
    const popup = this.shadow?.querySelector('.ems-popup');
    const currentTermId = popup?.dataset.termId || this.currentTermId;

    // Don't navigate to the same term
    if (termId === currentTermId) {
      this.showToast('Already viewing this term');
      return;
    }

    // Push current term to history before navigating
    if (currentTermId) {
      this.history.push(currentTermId);
    }

    // Update current term ID
    this.currentTermId = termId;

    // Navigate to the new term (reuse current popup position)
    this.showTerm(termId,
      parseInt(this.container.style.left) || window.innerWidth / 2,
      parseInt(this.container.style.top) || window.innerHeight / 3
    );
  }

  /**
   * Update the back button visibility and history badge
   */
  updateBackButton() {
    if (!this.shadow) return;
    
    const backBtn = this.shadow.querySelector('.ems-back-btn');
    const historyBadge = this.shadow.querySelector('.ems-history-badge');
    
    if (backBtn) {
      backBtn.hidden = this.history.length === 0;
    }
    
    if (historyBadge) {
      if (this.history.length > 0) {
        historyBadge.textContent = this.history.length;
        historyBadge.classList.add('visible');
      } else {
        historyBadge.classList.remove('visible');
      }
    }
  }

  /**
   * Fetch term content from background
   * @param {string} termId
   * @returns {Promise<Object|null>}
   */
  async fetchTermContent(termId) {
    try {
      const response = await this.sendRuntimeMessage({
        type: MESSAGE_TYPES.GET_TERM,
        payload: { termId },
      });
      return response?.term || null;
    } catch (error) {
      logger.error('Failed to fetch term:', error);
      return null;
    }
  }

  /**
   * Render HTML into shadow DOM
   * @param {string} html
   */
  render(html) {
    // Clear existing content (except styles)
    const existingContent = this.shadow.querySelector('.ems-popup-wrapper');
    if (existingContent) {
      existingContent.remove();
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'ems-popup-wrapper';
    wrapper.innerHTML = this.sanitize(html);

    // Add event handlers
    this.attachEventHandlers(wrapper);

    this.shadow.appendChild(wrapper);
  }

  /**
   * Attach event handlers to popup elements
   * @param {HTMLElement} wrapper
   */
  attachEventHandlers(wrapper) {
    // Close button
    const closeBtn = wrapper.querySelector('.ems-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }

    // Back button (in toolbar)
    const backBtn = wrapper.querySelector('.ems-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.goBack());
    }

    // Breadcrumb items
    const breadcrumbItems = wrapper.querySelectorAll('.ems-breadcrumb-item');
    for (const item of breadcrumbItems) {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index, 10);
        this.jumpToHistory(index);
      });
    }

    // Font size controls
    const fontDecreaseBtn = wrapper.querySelector('.ems-font-decrease-btn');
    const fontIncreaseBtn = wrapper.querySelector('.ems-font-increase-btn');
    const fontDisplay = wrapper.querySelector('.ems-font-size-display');
    
    if (fontDecreaseBtn) {
      fontDecreaseBtn.addEventListener('click', () => {
        if (this.fontSize > 70) {
          this.fontSize -= 10;
          this.applyFontSize(wrapper, fontDisplay);
        }
      });
    }
    
    if (fontIncreaseBtn) {
      fontIncreaseBtn.addEventListener('click', () => {
        if (this.fontSize < 150) {
          this.fontSize += 10;
          this.applyFontSize(wrapper, fontDisplay);
        }
      });
    }

    // Copy button
    const copyBtn = wrapper.querySelector('.ems-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyDefinition(wrapper));
    }

    // Section copy buttons
    const sectionCopyBtns = wrapper.querySelectorAll('.ems-section-copy-btn');
    for (const btn of sectionCopyBtns) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent section collapse
        const sectionKey = btn.dataset.section;
        if (sectionKey) {
          this.copySection(wrapper, sectionKey);
        }
      });
    }

    // Menu toggle
    const menuToggle = wrapper.querySelector('.ems-menu-toggle-btn');
    const dropdownMenu = wrapper.querySelector('.ems-dropdown-menu');
    if (menuToggle && dropdownMenu) {
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('visible');
      });
      
      // Close menu when clicking outside
      wrapper.addEventListener('click', (e) => {
        if (!e.target.closest('.ems-menu-btn')) {
          dropdownMenu.classList.remove('visible');
        }
      });
    }

    // Expand all button
    const expandAllBtn = wrapper.querySelector('.ems-expand-all-btn');
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        this.expandAllSections(wrapper);
        dropdownMenu?.classList.remove('visible');
      });
    }

    // Collapse all button
    const collapseAllBtn = wrapper.querySelector('.ems-collapse-all-btn');
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        this.collapseAllSections(wrapper);
        dropdownMenu?.classList.remove('visible');
      });
    }

    // Show history button
    const showHistoryBtn = wrapper.querySelector('.ems-show-history-btn');
    if (showHistoryBtn) {
      showHistoryBtn.addEventListener('click', () => {
        this.showHistoryInfo();
        dropdownMenu?.classList.remove('visible');
      });
    }

    // Section toggles
    const sectionHeaders = wrapper.querySelectorAll('.ems-section-header');
    for (const header of sectionHeaders) {
      header.addEventListener('click', () => this.toggleSection(header));
    }

    // Term links (rabbit hole navigation) - uses navigateToTerm to track history
    const termLinks = wrapper.querySelectorAll('.ems-term-link');
    for (const link of termLinks) {
      link.addEventListener('click', e => {
        e.preventDefault();
        const termId = link.dataset.termId;
        if (termId) {
          this.navigateToTerm(termId);
        }
      });
    }

    // "Part of" banner toggle (expand/collapse hidden links)
    const partOfToggle = wrapper.querySelector('.ems-part-of-toggle');
    if (partOfToggle) {
      partOfToggle.addEventListener('click', e => {
        e.stopPropagation();
        const hidden = wrapper.querySelector('.ems-part-of-hidden');
        if (hidden) {
          const isExpanded = partOfToggle.getAttribute('aria-expanded') === 'true';
          partOfToggle.setAttribute('aria-expanded', !isExpanded);
          hidden.hidden = isExpanded;
          partOfToggle.textContent = isExpanded 
            ? `+${hidden.querySelectorAll('.ems-part-of-link').length} more` 
            : 'Show less';
        }
      });
    }

    // Disambiguation options
    const options = wrapper.querySelectorAll('.ems-disambiguation-option');
    for (const option of options) {
      option.addEventListener('click', async () => {
        const termId = option.dataset.termId;
        if (termId) {
          // Save the disambiguation choice
          if (this._currentDisambiguationPattern) {
            await this.saveDisambiguationChoice(this._currentDisambiguationPattern, termId);
            this._currentDisambiguationPattern = null;
          }
          
          this.showTerm(termId,
            parseInt(this.container.style.left) || window.innerWidth / 2,
            parseInt(this.container.style.top) || window.innerHeight / 3
          );
        }
      });
    }

    // Spoiler buttons
    const spoilerBtns = wrapper.querySelectorAll('.ems-spoiler-btn');
    for (const btn of spoilerBtns) {
      btn.addEventListener('click', () => {
        btn.style.display = 'none';
        const content = btn.nextElementSibling;
        if (content) {
          content.classList.add('revealed');
        }
      });
    }

    // Image thumbnails - click to zoom
    const imageThumbnails = wrapper.querySelectorAll('.ems-image-thumbnail');
    for (const img of imageThumbnails) {
      img.addEventListener('click', () => {
        this.openImageModal(wrapper, img.src, img.alt);
      });
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openImageModal(wrapper, img.src, img.alt);
        }
      });
    }

    // Image modal close handlers
    const imageModal = wrapper.querySelector('.ems-image-modal');
    if (imageModal) {
      const backdrop = imageModal.querySelector('.ems-image-modal-backdrop');
      const closeBtn = imageModal.querySelector('.ems-modal-close');
      
      if (backdrop) {
        backdrop.addEventListener('click', () => this.closeImageModal(wrapper));
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeImageModal(wrapper));
      }
    }

    // Favorite button (in toolbar)
    const favoriteBtn = wrapper.querySelector('.ems-favorite-btn');
    if (favoriteBtn) {
      // Check initial favorite state
      this.checkFavoriteState(favoriteBtn);
      
      favoriteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const termId = favoriteBtn.dataset.termId;
        if (termId) {
          await this.toggleFavorite(termId, favoriteBtn);
        }
      });
    }

    // Keyboard shortcuts
    this.attachKeyboardShortcuts(wrapper);

    // Initialize section dots
    this.initSectionDots(wrapper);

    // Initialize resize handle
    this.initResizeHandle(wrapper);
  }

  /**
   * Initialize the resize handle for popup resizing
   */
  initResizeHandle(wrapper) {
    const handle = wrapper.querySelector('.ems-resize-handle');
    const popup = wrapper.querySelector('.ems-popup');
    
    if (!handle || !popup) return;
    
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    let sizeLabel = null;
    
    const createSizeLabel = () => {
      sizeLabel = document.createElement('div');
      sizeLabel.className = 'ems-size-label';
      wrapper.appendChild(sizeLabel);
    };
    
    const updateSizeLabel = (w, h) => {
      if (sizeLabel) {
        sizeLabel.textContent = `${w} × ${h}`;
      }
    };
    
    const removeSizeLabel = () => {
      if (sizeLabel) {
        sizeLabel.remove();
        sizeLabel = null;
      }
    };
    
    const finishResize = () => {
      if (!isResizing) return;
      
      isResizing = false;
      popup.classList.remove('ems-resizing');
      removeSizeLabel();
      
      // Save the new size
      const rect = popup.getBoundingClientRect();
      this.savedSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      this.saveCurrentSize();
    };
    
    handle.addEventListener('pointerdown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = popup.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      
      popup.classList.add('ems-resizing');
      createSizeLabel();
      updateSizeLabel(Math.round(startWidth), Math.round(startHeight));
      
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) {
        // Pointer capture not supported
      }
      
      e.preventDefault();
      e.stopPropagation();
    });
    
    handle.addEventListener('pointermove', (e) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newWidth = Math.max(320, Math.min(800, startWidth + deltaX));
      const newHeight = Math.max(200, Math.min(900, startHeight + deltaY));
      
      popup.style.width = `${newWidth}px`;
      popup.style.height = `${newHeight}px`;
      
      updateSizeLabel(Math.round(newWidth), Math.round(newHeight));
      
      e.preventDefault();
    });
    
    handle.addEventListener('pointerup', (e) => {
      finishResize();
      e.preventDefault();
    });
    
    handle.addEventListener('pointercancel', () => {
      finishResize();
    });
    
    // Fallback mouseup
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        finishResize();
      }
    });
  }

  /**
   * Initialize section quick-jump dots
   */
  initSectionDots(wrapper) {
    const dotsContainer = wrapper.querySelector('.ems-section-dots');
    const sections = wrapper.querySelectorAll('.ems-section');
    const scrollContainer = wrapper.querySelector('.ems-popup-scroll');
    
    if (!dotsContainer || sections.length === 0 || !scrollContainer) return;
    
    // Store sections for scroll tracking
    this._sections = Array.from(sections);
    this._activeSection = 0;
    
    // Create dots for each section
    sections.forEach((section, index) => {
      const sectionKey = section.dataset.section;
      const headerTitle = section.querySelector('.ems-section-title');
      const label = headerTitle ? headerTitle.textContent.trim() : `Section ${index + 1}`;
      
      // Get section accent color
      const sectionStyle = getComputedStyle(section);
      const accentColor = sectionStyle.getPropertyValue('--section-accent') || 'var(--ems-purple)';
      
      const dot = document.createElement('button');
      dot.className = 'ems-section-dot';
      dot.dataset.index = index;
      dot.dataset.label = label;
      dot.setAttribute('aria-label', `Jump to ${label}`);
      dot.title = label;
      dot.style.setProperty('--dot-color', accentColor);
      
      dot.addEventListener('click', () => {
        this.scrollToSection(wrapper, index);
      });
      
      dotsContainer.appendChild(dot);
    });
    
    // Set up scroll observer
    this.initScrollObserver(wrapper);
  }

  /**
   * Initialize scroll observer for section tracking
   */
  initScrollObserver(wrapper) {
    const scrollContainer = wrapper.querySelector('.ems-popup-scroll');
    if (!scrollContainer || !this._sections?.length) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = this._sections.indexOf(entry.target);
          if (index !== -1) {
            this.setActiveSection(wrapper, index);
          }
        }
      });
    }, {
      root: scrollContainer,
      threshold: 0.3,
    });
    
    this._sections.forEach(section => observer.observe(section));
  }

  /**
   * Set the active section dot
   */
  setActiveSection(wrapper, index) {
    this._activeSection = index;
    const dots = wrapper.querySelectorAll('.ems-section-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  /**
   * Scroll to a specific section
   */
  scrollToSection(wrapper, index) {
    const section = this._sections?.[index];
    if (!section) return;
    
    // Expand if collapsed
    if (section.classList.contains('collapsed')) {
      section.classList.remove('collapsed');
      const toggleBtn = section.querySelector('.ems-toggle-btn');
      if (toggleBtn) toggleBtn.textContent = '−';
      const header = section.querySelector('.ems-section-header');
      if (header) header.setAttribute('aria-expanded', 'true');
      const content = section.querySelector('.ems-section-content');
      if (content) content.setAttribute('aria-hidden', 'false');
    }
    
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.setActiveSection(wrapper, index);
  }

  /**
   * Apply font size to popup
   */
  applyFontSize(wrapper, fontDisplay) {
    const popup = wrapper.querySelector('.ems-popup');
    if (popup) {
      popup.style.fontSize = `${this.fontSize}%`;
    }
    if (fontDisplay) {
      fontDisplay.textContent = `${this.fontSize}%`;
    }
    // Save the font size preference
    this.saveFontSize();
  }

  /**
   * Save font size to storage
   */
  async saveFontSize() {
    try {
      await this.sendRuntimeMessage({
        type: 'SAVE_FONT_SIZE',
        payload: { fontSize: this.fontSize },
      });
    } catch (error) {
      logger.error('Failed to save font size:', error);
    }
  }

  /**
   * Copy definition to clipboard
   */
  copyDefinition(wrapper) {
    const defSection = wrapper.querySelector('[data-section="definition"] .ems-section-content');
    if (defSection) {
      const text = defSection.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 Copied to clipboard!');
      }).catch(() => {
        this.showToast('Failed to copy');
      });
    }
  }

  /**
   * Copy a specific section's content to clipboard
   * @param {HTMLElement} wrapper - The popup wrapper element
   * @param {string} sectionKey - The section key to copy
   */
  copySection(wrapper, sectionKey) {
    const section = wrapper.querySelector(`[data-section="${sectionKey}"] .ems-section-content`);
    if (section) {
      const text = section.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('📋 Section copied!');
      }).catch(() => {
        this.showToast('Failed to copy');
      });
    }
  }

  /**
   * Expand all sections
   */
  expandAllSections(wrapper) {
    const sections = wrapper.querySelectorAll('.ems-section');
    for (const section of sections) {
      section.classList.remove('collapsed');
      const toggle = section.querySelector('.ems-toggle-btn');
      if (toggle) toggle.textContent = '−';
      const header = section.querySelector('.ems-section-header');
      if (header) header.setAttribute('aria-expanded', 'true');
      const content = section.querySelector('.ems-section-content');
      if (content) content.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * Collapse all sections
   */
  collapseAllSections(wrapper) {
    const sections = wrapper.querySelectorAll('.ems-section');
    for (const section of sections) {
      section.classList.add('collapsed');
      const toggle = section.querySelector('.ems-toggle-btn');
      if (toggle) toggle.textContent = '+';
      const header = section.querySelector('.ems-section-header');
      if (header) header.setAttribute('aria-expanded', 'false');
      const content = section.querySelector('.ems-section-content');
      if (content) content.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Show history info in a toast
   */
  showHistoryInfo() {
    if (this.history.length === 0) {
      this.showToast('No navigation history yet');
    } else {
      this.showToast(`📜 ${this.history.length} terms in history`);
    }
  }

  /**
   * Highlight search terms in popup content
   * @param {HTMLElement} popup - The popup element
   * @param {string} query - Search query to highlight
   */
  highlightSearchTerms(popup, query) {
    if (!query || query.length < 2) return;
    
    const content = popup.querySelector('.ems-popup-content');
    if (!content) return;
    
    // Escape regex special characters
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    // Walk text nodes and wrap matches with <mark>
    const walker = document.createTreeWalker(
      content,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    
    for (const node of textNodes) {
      if (regex.test(node.textContent)) {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(regex, '<mark class="ems-search-highlight">$1</mark>');
        node.parentNode.replaceChild(span, node);
      }
    }
  }

  /**
   * Open image zoom modal
   * @param {HTMLElement} wrapper - The popup wrapper element
   * @param {string} src - Image source URL
   * @param {string} alt - Image alt text
   */
  openImageModal(wrapper, src, alt) {
    const modal = wrapper.querySelector('.ems-image-modal');
    if (!modal) return;

    const modalImage = modal.querySelector('.ems-modal-image');
    const modalCaption = modal.querySelector('.ems-modal-caption');

    if (modalImage) {
      modalImage.src = src;
      modalImage.alt = alt;
    }
    if (modalCaption) {
      modalCaption.textContent = alt;
    }

    modal.hidden = false;
    modal.style.display = 'flex';
    
    // Focus the modal for keyboard navigation
    modal.focus();
    
    // Prevent scroll on popup while modal is open
    const popup = wrapper.querySelector('.ems-popup');
    if (popup) {
      popup.style.overflow = 'hidden';
    }
  }

  /**
   * Close image zoom modal
   * @param {HTMLElement} wrapper - The popup wrapper element
   */
  closeImageModal(wrapper) {
    const modal = wrapper.querySelector('.ems-image-modal');
    if (!modal) return;

    modal.hidden = true;
    modal.style.display = 'none';

    // Restore scroll on popup
    const popup = wrapper.querySelector('.ems-popup');
    if (popup) {
      popup.style.overflow = '';
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message, duration = 2500) {
    // Create toast container if not exists
    let toastContainer = this.shadow.querySelector('.ems-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'ems-toast-container';
      toastContainer.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        pointer-events: none;
      `;
      this.shadow.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'ems-toast';
    toast.style.cssText = `
      background: var(--ems-navy, #1a1a2e);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: fadeIn 0.2s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Remove after duration
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }

  /**
   * Attach keyboard shortcuts
   */
  attachKeyboardShortcuts(wrapper) {
    const popup = wrapper.querySelector('.ems-popup');
    if (!popup) return;

    popup.addEventListener('keydown', (e) => {
      // Escape - close image modal first, then popup
      if (e.key === 'Escape') {
        const imageModal = wrapper.querySelector('.ems-image-modal');
        if (imageModal && !imageModal.hidden) {
          this.closeImageModal(wrapper);
          return;
        }
        this.hide();
        return;
      }

      // Backspace - go back
      if (e.key === 'Backspace' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        this.goBack();
        return;
      }

      // F - toggle favorite
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        const favBtn = wrapper.querySelector('.ems-favorite-btn');
        if (favBtn) favBtn.click();
        return;
      }

      // E - expand all
      if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
        this.expandAllSections(wrapper);
        return;
      }

      // C - collapse all (when no selection)
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim() === '') {
          this.collapseAllSections(wrapper);
        }
        return;
      }

      // + or = - increase font
      if (e.key === '+' || e.key === '=') {
        const fontDisplay = wrapper.querySelector('.ems-font-size-display');
        if (this.fontSize < 150) {
          this.fontSize += 10;
          this.applyFontSize(wrapper, fontDisplay);
        }
        return;
      }

      // - - decrease font
      if (e.key === '-') {
        const fontDisplay = wrapper.querySelector('.ems-font-size-display');
        if (this.fontSize > 70) {
          this.fontSize -= 10;
          this.applyFontSize(wrapper, fontDisplay);
        }
        return;
      }

      // Ctrl+C - copy definition when no selection
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim() === '') {
          e.preventDefault();
          this.copyDefinition(wrapper);
        }
      }
    });
  }

  /**
   * Check and update favorite button state
   * @param {HTMLElement} btn
   */
  async checkFavoriteState(btn) {
    const termId = btn.dataset.termId;
    if (!termId) return;

    try {
      const response = await this.sendRuntimeMessage({
        type: MESSAGE_TYPES.IS_FAVORITE,
        payload: { termId },
      });
      
      if (response?.isFavorite) {
        btn.classList.add('favorited');
        btn.textContent = '♥';
        btn.title = 'Remove from favorites';
      }
    } catch (error) {
      logger.error('Failed to check favorite state:', error);
    }
  }

  /**
   * Toggle favorite status
   * @param {string} termId
   * @param {HTMLElement} btn
   */
  async toggleFavorite(termId, btn) {
    try {
      const response = await this.sendRuntimeMessage({
        type: MESSAGE_TYPES.TOGGLE_FAVORITE,
        payload: { termId },
      });
      
      if (response?.isFavorite) {
        btn.classList.add('favorited');
        btn.textContent = '♥';
        btn.title = 'Remove from favorites';
      } else {
        btn.classList.remove('favorited');
        btn.textContent = '♡';
        btn.title = 'Add to favorites';
      }
    } catch (error) {
      logger.error('Failed to toggle favorite:', error);
    }
  }

  /**
   * Toggle a section's collapsed state
   * @param {HTMLElement} header
   */
  toggleSection(header) {
    const section = header.closest('.ems-section');
    if (!section) return;

    const isCollapsed = section.classList.toggle('collapsed');
    const content = section.querySelector('.ems-section-content');
    const toggle = header.querySelector('.ems-toggle-btn');

    if (content) {
      content.setAttribute('aria-hidden', isCollapsed);
    }
    if (toggle) {
      toggle.textContent = isCollapsed ? '+' : '−';
    }
    header.setAttribute('aria-expanded', !isCollapsed);
  }

  /**
   * Position the popup near coordinates, ensuring it stays within viewport
   * @param {number} x
   * @param {number} y
   */
  position(x, y) {
    const popup = this.shadow.querySelector('.ems-popup, .ems-preview, .ems-disambiguation');
    if (!popup) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10; // Minimum margin from edges

    // Make popup visible temporarily to measure it (but keep hidden visually)
    const wasHidden = this.container.style.display === 'none';
    this.container.style.display = 'block';
    this.container.style.visibility = 'hidden';
    this.container.style.opacity = '0';
    this.container.style.left = '0px';
    this.container.style.top = '0px';
    
    // Get actual dimensions
    const rect = popup.getBoundingClientRect();
    const popupWidth = rect.width || 450;
    const popupHeight = rect.height || 400;
    
    // Calculate available space in each direction
    const spaceRight = viewportWidth - x;
    const spaceLeft = x;
    const spaceBelow = viewportHeight - y;
    const spaceAbove = y;

    // Determine horizontal position
    let left;
    if (spaceRight >= popupWidth + margin) {
      // Fits to the right
      left = x;
    } else if (spaceLeft >= popupWidth + margin) {
      // Fits to the left
      left = x - popupWidth;
    } else {
      // Center it horizontally and constrain
      left = Math.max(margin, Math.min(x - popupWidth / 2, viewportWidth - popupWidth - margin));
    }

    // Determine vertical position
    let top;
    const offsetBelow = 15; // Gap between trigger and popup
    const offsetAbove = 10;

    if (spaceBelow >= popupHeight + offsetBelow + margin) {
      // Fits below
      top = y + offsetBelow;
    } else if (spaceAbove >= popupHeight + offsetAbove + margin) {
      // Fits above
      top = y - popupHeight - offsetAbove;
    } else {
      // Not enough space either way - position to maximize visibility
      // Prefer below if more space there, else above
      if (spaceBelow >= spaceAbove) {
        top = Math.max(margin, viewportHeight - popupHeight - margin);
      } else {
        top = margin;
      }
    }

    // Final bounds check
    left = Math.max(margin, Math.min(left, viewportWidth - popupWidth - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - popupHeight - margin));

    // Apply position (visibility will be restored by showContainer())
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    // Keep hidden - showContainer() will make it visible
  }

  /**
   * Sanitize HTML to prevent XSS
   * @param {string} html
   * @returns {string}
   */
  sanitize(html) {
    // For now, use a simple sanitization
    // In production, use DOMPurify
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=/gi, 'data-blocked-');
  }

  /**
   * Build HTML for a term - routes to specialized builders based on term level
   * @param {Object} term
   * @returns {string}
   */
  buildTermHTML(term) {
    const level = term.level || 'medschool';

    // Beta term types - only show specialized layouts when beta is enabled
    if (this.betaFeaturesEnabled) {
      if (level === 'formula') return this.buildFormulaHTML(term);
      if (level === 'lab-value') return this.buildLabValueHTML(term);
      if (level === 'physiological') return this.buildPhysiologicalHTML(term);
    }

    // Standard term types
    if (level === 'premed') return this.buildPremedHTML(term);

    // Default: medschool layout
    return this.buildMedschoolHTML(term);
  }

  /**
   * Build HTML for medschool-level terms (default layout with all sections)
   * @param {Object} term
   * @returns {string}
   */
  buildMedschoolHTML(term) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: '#6C5CE7', icon: '📚' };
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');

    // Build sections HTML
    let sectionsHTML = '';
    for (const { key, icon, title } of SECTIONS) {
      const content = term[key];
      if (content) {
        const isCollapsed = COLLAPSED_SECTIONS.includes(key);
        sectionsHTML += this.buildSectionHTML(key, icon, title, content, isCollapsed, termId);
      }
    }

    // Build sources and credits if present
    if (term.sources?.length > 0) {
      sectionsHTML += this.buildSourcesHTML(term.sources);
    }
    if (term.credits?.length > 0) {
      sectionsHTML += this.buildCreditsHTML(term.credits);
    }

    // Build see also links
    const seeAlsoHTML = this.buildSeeAlsoHTML(term.see_also, term.prerequisites);

    // Build "Related to" banner
    const partOfHTML = this.buildPartOfHTML(term.see_also);

    const hasHistory = this.history.length > 0;

    return `
      <div class="ems-popup ${hasHistory ? 'has-history' : ''}" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" tabindex="-1">
        <header class="ems-popup-header">
          <div class="ems-header-left">
            <span class="ems-tag-icon">${tagInfo.icon}</span>
            <h1 id="ems-popup-title" class="ems-term-title">${this.escapeHTML(name)}</h1>
          </div>
          <div class="ems-header-right">
            <span class="ems-level-badge ems-level-badge--medschool">MED SCHOOL</span>
            <button class="ems-close-btn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="ems-tags-bar">
          ${this.buildTagsHTML(term.tags || [primaryTag])}
        </div>

        <div class="ems-breadcrumb-bar ${hasHistory ? 'visible' : ''}" id="breadcrumbBar">
          ${this.buildBreadcrumbsHTML(name)}
        </div>

        <div class="ems-toolbar">
          <div class="ems-toolbar-left">
            <div class="ems-back-btn-wrapper" ${hasHistory ? '' : 'style="display:none"'}>
              <button class="ems-tool-btn ems-back-btn" title="Go back (Backspace)">←</button>
              <span class="ems-history-badge ${hasHistory ? 'visible' : ''}">${this.history.length}</span>
            </div>
            <button class="ems-tool-btn ems-font-decrease-btn" title="Decrease font size (-)">A−</button>
            <span class="ems-font-size-display">${this.fontSize}%</span>
            <button class="ems-tool-btn ems-font-increase-btn" title="Increase font size (+)">A+</button>
          </div>
          <div class="ems-toolbar-right">
            <button class="ems-tool-btn ems-copy-btn" title="Copy definition (Ctrl+C)">📋</button>
            <button class="ems-tool-btn ems-favorite-btn" data-term-id="${this.escapeHTML(termId)}" title="Add to favorites (F)">♡</button>
            <div class="ems-menu-btn">
              <button class="ems-tool-btn ems-menu-toggle-btn" title="More options">⋮</button>
              <div class="ems-dropdown-menu">
                <button class="ems-expand-all-btn">↕ Expand All (E)</button>
                <button class="ems-collapse-all-btn">↔ Collapse All (C)</button>
                <hr>
                <button class="ems-show-history-btn">📜 View History</button>
              </div>
            </div>
          </div>
        </div>

        ${partOfHTML}

        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            ${sectionsHTML}
          </main>
          ${seeAlsoHTML}
        </div>
        <div class="ems-section-dots" id="sectionDots"></div>
        <div class="ems-resize-handle" id="resizeHandle"></div>
        
        <!-- Image Zoom Modal -->
        <div class="ems-image-modal" hidden>
          <div class="ems-image-modal-backdrop"></div>
          <div class="ems-image-modal-content">
            <img class="ems-modal-image" src="" alt="">
            <p class="ems-modal-caption"></p>
            <button class="ems-modal-close" aria-label="Close image">×</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Build HTML for premed-level terms (simpler layout with teal color scheme)
   * @param {Object} term
   * @returns {string}
   */
  buildPremedHTML(term) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: '#10B981', icon: '📖' }; // Teal accent for premed
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');

    // Premed only shows: definition, tips, exam_appearance
    const premedSections = [
      { key: 'definition', icon: '📖', title: 'Definition' },
      { key: 'tips', icon: '💡', title: 'Tips to Remember' },
      { key: 'exam_appearance', icon: '📝', title: "How You'll See It on Exams" },
    ];

    let sectionsHTML = '';
    for (const { key, icon, title } of premedSections) {
      const content = term[key];
      if (content) {
        sectionsHTML += this.buildPremedSectionHTML(key, icon, title, content, termId);
      }
    }

    // Build see also links
    const seeAlsoHTML = this.buildSeeAlsoHTML(term.see_also, term.prerequisites);
    const partOfHTML = this.buildPartOfHTML(term.see_also);

    const hasHistory = this.history.length > 0;

    return `
      <div class="ems-popup ems-popup--premed ${hasHistory ? 'has-history' : ''}" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" data-level="premed" tabindex="-1">
        <header class="ems-popup-header ems-popup-header--premed">
          <div class="ems-header-left">
            <span class="ems-tag-icon">${tagInfo.icon}</span>
            <h1 id="ems-popup-title" class="ems-term-title">${this.escapeHTML(name)}</h1>
          </div>
          <div class="ems-header-right">
            <span class="ems-level-badge ems-level-badge--premed">PREMED</span>
            <button class="ems-close-btn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="ems-toolbar ems-toolbar--premed">
          <div class="ems-toolbar-left">
            <div class="ems-back-btn-wrapper" ${hasHistory ? '' : 'style="display:none"'}>
              <button class="ems-tool-btn ems-back-btn" title="Go back (Backspace)">←</button>
              <span class="ems-history-badge ${hasHistory ? 'visible' : ''}">${this.history.length}</span>
            </div>
            <button class="ems-tool-btn ems-font-decrease-btn" title="Decrease font size (-)">A−</button>
            <span class="ems-font-size-display">${this.fontSize}%</span>
            <button class="ems-tool-btn ems-font-increase-btn" title="Increase font size (+)">A+</button>
          </div>
          <div class="ems-toolbar-right">
            <button class="ems-tool-btn ems-copy-btn" title="Copy definition (Ctrl+C)">📋</button>
            <button class="ems-tool-btn ems-favorite-btn" data-term-id="${this.escapeHTML(termId)}" title="Add to favorites (F)">♡</button>
          </div>
        </div>

        <div class="ems-breadcrumb-bar ${hasHistory ? 'visible' : ''}" id="breadcrumbBar">
          ${this.buildBreadcrumbsHTML(name)}
        </div>

        ${partOfHTML}

        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            ${sectionsHTML}
          </main>
          ${seeAlsoHTML}
        </div>
        <div class="ems-resize-handle" id="resizeHandle"></div>
      </div>
    `;
  }

  /**
   * Build HTML for a premed section (simpler styling)
   */
  buildPremedSectionHTML(key, icon, title, content, termId) {
    let contentHTML = '';
    
    if (key === 'tips' && Array.isArray(content)) {
      // Tips as checkmark list
      const items = content.map(item => 
        `<li>${this.renderMarkdown(typeof item === 'string' ? item : JSON.stringify(item))}</li>`
      ).join('');
      contentHTML = `<ul class="ems-premed-tips">${items}</ul>`;
    } else if (key === 'exam_appearance' && Array.isArray(content)) {
      // Exam appearance as styled list
      const items = content.map(item => 
        `<li>${this.renderMarkdown(typeof item === 'string' ? item : JSON.stringify(item))}</li>`
      ).join('');
      contentHTML = `<ul class="ems-premed-exam">${items}</ul>`;
    } else if (typeof content === 'string') {
      contentHTML = `<p>${this.renderMarkdown(content)}</p>`;
    } else if (Array.isArray(content)) {
      contentHTML = this.buildListHTML(content);
    }

    // Apply inline term highlighting for definition
    if (key === 'definition' && termId) {
      contentHTML = this.highlightTermsInContent(contentHTML, termId);
    }

    return `
      <section class="ems-section ems-section--premed" data-section="${key}">
        <header class="ems-section-header" aria-expanded="true">
          <span class="ems-section-title">
            <span class="ems-section-icon">${icon}</span>
            ${title}
          </span>
          <div class="ems-section-actions">
            <span class="ems-toggle-btn">−</span>
          </div>
        </header>
        <div class="ems-section-content" aria-hidden="false">
          ${contentHTML}
        </div>
      </section>
    `;
  }

  /**
   * Build HTML for formula-level terms (beta feature)
   * @param {Object} term
   * @returns {string}
   */
  buildFormulaHTML(term) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: '#f59e0b', icon: '🔢' };
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');
    const hasHistory = this.history.length > 0;

    // Build formula display
    const formula = term.formula || term.definition || '';
    const variables = term.variables || [];
    const interpretation = term.interpretation || term.why_it_matters || '';

    let variablesHTML = '';
    if (variables.length > 0) {
      variablesHTML = `
        <div class="ems-formula-variables">
          <div class="ems-formula-variables-title">Variables:</div>
          ${variables.map(v => `
            <div class="ems-formula-variable">
              <span class="ems-variable-symbol">${this.escapeHTML(v.symbol || v.name || '')}</span>
              <span class="ems-variable-desc">${this.escapeHTML(v.description || v.unit || '')}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Build calculator section if inputs are defined
    const inputs = term.calculator_inputs || variables.filter(v => v.input);
    let calculatorHTML = '';
    if (inputs.length > 0) {
      calculatorHTML = `
        <div class="ems-formula-calculator">
          <div class="ems-calculator-title">🧮 Calculator</div>
          <div class="ems-calculator-inputs">
            ${inputs.map(input => `
              <div class="ems-calculator-input-row">
                <label>${this.escapeHTML(input.label || input.symbol || input.name || 'Value')}</label>
                <input type="number" class="ems-calculator-input" data-var="${this.escapeHTML(input.symbol || input.name || '')}" placeholder="${this.escapeHTML(input.unit || '')}">
                <span class="ems-input-unit">${this.escapeHTML(input.unit || '')}</span>
              </div>
            `).join('')}
          </div>
          <button class="ems-calculator-btn" onclick="this.closest('.ems-formula-calculator').querySelector('.ems-calculator-result').textContent = 'Calculating...'">Calculate</button>
          <div class="ems-calculator-result"></div>
        </div>
      `;
    }

    return `
      <div class="ems-popup ems-popup--formula ${hasHistory ? 'has-history' : ''}" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" data-level="formula" tabindex="-1">
        <header class="ems-popup-header ems-popup-header--formula">
          <div class="ems-header-left">
            <span class="ems-tag-icon">${tagInfo.icon}</span>
            <h1 id="ems-popup-title" class="ems-term-title">${this.escapeHTML(name)}</h1>
            <span class="ems-level-badge ems-level-badge--beta">🧪 BETA</span>
          </div>
          <div class="ems-header-right">
            <button class="ems-close-btn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="ems-toolbar">
          <div class="ems-toolbar-left">
            <button class="ems-tool-btn ems-back-btn" title="Go back" ${hasHistory ? '' : 'hidden'}>←</button>
          </div>
          <div class="ems-toolbar-right">
            <button class="ems-tool-btn ems-copy-btn" title="Copy">📋</button>
            <button class="ems-tool-btn ems-favorite-btn" data-term-id="${this.escapeHTML(termId)}" title="Favorite">♡</button>
          </div>
        </div>

        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            <div class="ems-formula-display">
              <div class="ems-formula-expression">${this.renderMarkdown(formula)}</div>
            </div>
            ${variablesHTML}
            ${calculatorHTML}
            ${interpretation ? `
              <section class="ems-section" data-section="interpretation">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title">
                    <span class="ems-section-icon">💡</span>
                    Interpretation
                  </span>
                </header>
                <div class="ems-section-content">
                  <p>${this.renderMarkdown(interpretation)}</p>
                </div>
              </section>
            ` : ''}
          </main>
        </div>
        <div class="ems-resize-handle" id="resizeHandle"></div>
      </div>
    `;
  }

  /**
   * Build HTML for lab-value-level terms (beta feature)
   * @param {Object} term
   * @returns {string}
   */
  buildLabValueHTML(term) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: '#06d6a0', icon: '🧪' };
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');
    const hasHistory = this.history.length > 0;

    // Lab value specific data
    const normalRange = term.normal_range || term.reference_range || {};
    const unit = term.unit || normalRange.unit || '';
    const low = normalRange.low || normalRange.min || '';
    const high = normalRange.high || normalRange.max || '';
    const criticalLow = term.critical_low || '';
    const criticalHigh = term.critical_high || '';
    const causesHigh = term.causes_high || [];
    const causesLow = term.causes_low || [];

    return `
      <div class="ems-popup ems-popup--lab-value ${hasHistory ? 'has-history' : ''}" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" data-level="lab-value" tabindex="-1">
        <header class="ems-popup-header ems-popup-header--lab-value">
          <div class="ems-header-left">
            <span class="ems-tag-icon">${tagInfo.icon}</span>
            <h1 id="ems-popup-title" class="ems-term-title">${this.escapeHTML(name)}</h1>
            <span class="ems-level-badge ems-level-badge--beta">🧪 BETA</span>
          </div>
          <div class="ems-header-right">
            <button class="ems-close-btn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="ems-toolbar">
          <div class="ems-toolbar-left">
            <button class="ems-tool-btn ems-back-btn" title="Go back" ${hasHistory ? '' : 'hidden'}>←</button>
          </div>
          <div class="ems-toolbar-right">
            <button class="ems-tool-btn ems-copy-btn" title="Copy">📋</button>
            <button class="ems-tool-btn ems-favorite-btn" data-term-id="${this.escapeHTML(termId)}" title="Favorite">♡</button>
          </div>
        </div>

        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            <div class="ems-lab-value-range">
              <div class="ems-range-title">Reference Range</div>
              <div class="ems-range-display">
                ${criticalLow ? `<span class="ems-range-critical-low" title="Critical low">${this.escapeHTML(criticalLow)}</span>` : ''}
                <span class="ems-range-low">${this.escapeHTML(String(low))}</span>
                <span class="ems-range-dash">—</span>
                <span class="ems-range-high">${this.escapeHTML(String(high))}</span>
                ${criticalHigh ? `<span class="ems-range-critical-high" title="Critical high">${this.escapeHTML(criticalHigh)}</span>` : ''}
                <span class="ems-range-unit">${this.escapeHTML(unit)}</span>
              </div>
            </div>

            ${term.definition ? `
              <section class="ems-section" data-section="definition">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">📖</span> Definition</span>
                </header>
                <div class="ems-section-content">
                  <p>${this.renderMarkdown(term.definition)}</p>
                </div>
              </section>
            ` : ''}

            ${causesHigh.length > 0 ? `
              <section class="ems-section ems-section--high" data-section="causes_high">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">⬆️</span> Causes of Elevated Levels</span>
                </header>
                <div class="ems-section-content">
                  <ul class="ems-list">${causesHigh.map(c => `<li>${this.renderMarkdown(c)}</li>`).join('')}</ul>
                </div>
              </section>
            ` : ''}

            ${causesLow.length > 0 ? `
              <section class="ems-section ems-section--low" data-section="causes_low">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">⬇️</span> Causes of Low Levels</span>
                </header>
                <div class="ems-section-content">
                  <ul class="ems-list">${causesLow.map(c => `<li>${this.renderMarkdown(c)}</li>`).join('')}</ul>
                </div>
              </section>
            ` : ''}
          </main>
        </div>
        <div class="ems-resize-handle" id="resizeHandle"></div>
      </div>
    `;
  }

  /**
   * Build HTML for physiological-level terms (beta feature)
   * @param {Object} term
   * @returns {string}
   */
  buildPhysiologicalHTML(term) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';
    const name = term.names?.[0] || term.id;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { accent: '#8b5cf6', icon: '📈' };
    const termId = term.id || name.toLowerCase().replace(/\s+/g, '-');
    const hasHistory = this.history.length > 0;

    // Physiological value data
    const normalValue = term.normal_value || term.normal || {};
    const unit = term.unit || normalValue.unit || '';
    const value = normalValue.value || normalValue.mean || '';
    const range = normalValue.range || '';
    const relatedValues = term.related_values || [];
    const clinicalRelevance = term.clinical_relevance || term.why_it_matters || '';

    return `
      <div class="ems-popup ems-popup--physiological ${hasHistory ? 'has-history' : ''}" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" data-theme="${theme}" data-term-id="${this.escapeHTML(termId)}" data-level="physiological" tabindex="-1">
        <header class="ems-popup-header ems-popup-header--physiological">
          <div class="ems-header-left">
            <span class="ems-tag-icon">${tagInfo.icon}</span>
            <h1 id="ems-popup-title" class="ems-term-title">${this.escapeHTML(name)}</h1>
            <span class="ems-level-badge ems-level-badge--beta">🧪 BETA</span>
          </div>
          <div class="ems-header-right">
            <button class="ems-close-btn" aria-label="Close">×</button>
          </div>
        </header>

        <div class="ems-toolbar">
          <div class="ems-toolbar-left">
            <button class="ems-tool-btn ems-back-btn" title="Go back" ${hasHistory ? '' : 'hidden'}>←</button>
          </div>
          <div class="ems-toolbar-right">
            <button class="ems-tool-btn ems-copy-btn" title="Copy">📋</button>
            <button class="ems-tool-btn ems-favorite-btn" data-term-id="${this.escapeHTML(termId)}" title="Favorite">♡</button>
          </div>
        </div>

        <div class="ems-popup-scroll">
          <main class="ems-popup-content">
            <div class="ems-physiological-value">
              <div class="ems-value-title">Normal Value</div>
              <div class="ems-value-display">
                <span class="ems-value-number">${this.escapeHTML(String(value))}</span>
                <span class="ems-value-unit">${this.escapeHTML(unit)}</span>
                ${range ? `<span class="ems-value-range">(${this.escapeHTML(range)})</span>` : ''}
              </div>
            </div>

            ${term.definition ? `
              <section class="ems-section" data-section="definition">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">📖</span> Definition</span>
                </header>
                <div class="ems-section-content">
                  <p>${this.renderMarkdown(term.definition)}</p>
                </div>
              </section>
            ` : ''}

            ${clinicalRelevance ? `
              <section class="ems-section" data-section="clinical_relevance">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">💡</span> Clinical Relevance</span>
                </header>
                <div class="ems-section-content">
                  <p>${this.renderMarkdown(clinicalRelevance)}</p>
                </div>
              </section>
            ` : ''}

            ${relatedValues.length > 0 ? `
              <section class="ems-section" data-section="related_values">
                <header class="ems-section-header" aria-expanded="true">
                  <span class="ems-section-title"><span class="ems-section-icon">🔗</span> Related Values</span>
                </header>
                <div class="ems-section-content">
                  <div class="ems-related-values-grid">
                    ${relatedValues.map(rv => `
                      <div class="ems-related-value-card">
                        <div class="ems-rv-name">${this.escapeHTML(rv.name || rv.id || '')}</div>
                        <div class="ems-rv-value">${this.escapeHTML(String(rv.value || ''))}</div>
                        <div class="ems-rv-unit">${this.escapeHTML(rv.unit || '')}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </section>
            ` : ''}
          </main>
        </div>
        <div class="ems-resize-handle" id="resizeHandle"></div>
      </div>
    `;
  }

  /**
   * Build HTML for a single section
   * @param {string} key - Section key
   * @param {string} icon - Section icon
   * @param {string} title - Section title
   * @param {string|Array} content - Section content
   * @param {boolean} isCollapsed - Whether section is collapsed
   * @param {string} [termId] - Current term ID for inline highlighting
   */
  buildSectionHTML(key, icon, title, content, isCollapsed, termId = null) {
    const collapsedClass = isCollapsed ? ' collapsed' : '';
    const toggleIcon = isCollapsed ? '+' : '−';
    const ariaHidden = isCollapsed ? 'true' : 'false';

    // Sections that should have inline term highlighting
    const highlightSections = ['definition', 'why_it_matters', 'treatment', 'problem_solving', 'tricks', 'red_flags'];

    let contentHTML = '';
    if (typeof content === 'string') {
      contentHTML = `<p>${this.renderMarkdown(content)}</p>`;
    } else if (Array.isArray(content)) {
      if (key === 'differentials') {
        contentHTML = this.buildDifferentialsHTML(content);
      } else if (key === 'cases') {
        contentHTML = this.buildCasesHTML(content);
      } else if (key === 'images') {
        contentHTML = this.buildImagesHTML(content);
      } else {
        contentHTML = this.buildListHTML(content);
      }
    }

    // Apply inline term highlighting for text-heavy sections
    if (highlightSections.includes(key) && termId) {
      contentHTML = this.highlightTermsInContent(contentHTML, termId);
    }

    return `
      <section class="ems-section${collapsedClass}" data-section="${key}">
        <header class="ems-section-header" aria-expanded="${!isCollapsed}">
          <span class="ems-section-title">
            <span class="ems-section-icon">${icon}</span>
            ${title}
          </span>
          <div class="ems-section-actions">
            <button class="ems-section-copy-btn" data-section="${key}" title="Copy section" aria-label="Copy ${title}">📋</button>
            <span class="ems-toggle-btn">${toggleIcon}</span>
          </div>
        </header>
        <div class="ems-section-content" aria-hidden="${ariaHidden}">
          ${contentHTML}
        </div>
      </section>
    `;
  }

  /**
   * Build HTML for breadcrumb navigation
   */
  buildBreadcrumbsHTML(currentName) {
    if (this.history.length === 0) {
      return '';
    }

    let html = '<span class="ems-breadcrumb-item ems-breadcrumb-home" data-index="0" title="Go to first term">🏠</span>';
    
    // Show last 3 history items (or fewer)
    const showCount = Math.min(this.history.length, 3);
    const startIdx = this.history.length - showCount;
    
    for (let i = startIdx; i < this.history.length; i++) {
      const termId = this.history[i];
      const displayName = termId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const truncName = displayName.length > 20 ? displayName.slice(0, 18) + '...' : displayName;
      
      html += `<span class="ems-breadcrumb-sep">›</span>`;
      html += `<span class="ems-breadcrumb-item" data-index="${i + 1}" title="${this.escapeHTML(displayName)}">${this.escapeHTML(truncName)}</span>`;
    }
    
    // Current term
    html += `<span class="ems-breadcrumb-sep">›</span>`;
    html += `<span class="ems-breadcrumb-current">${this.escapeHTML(currentName)}</span>`;
    
    return html;
  }

  /**
   * Build HTML for tags
   */
  buildTagsHTML(tags) {
    return tags.slice(0, 5).map(tag => {
      const info = TAG_COLORS[tag] || { accent: '#6C5CE7', icon: '📚' };
      const displayName = tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<span class="ems-tag" style="background-color: ${info.accent}">${info.icon} ${displayName}</span>`;
    }).join('');
  }

  /**
   * Build HTML for a bullet list
   */
  buildListHTML(items) {
    const listItems = items.map(item => 
      `<li>${this.renderMarkdown(typeof item === 'string' ? item : JSON.stringify(item))}</li>`
    ).join('');
    return `<ul class="ems-list">${listItems}</ul>`;
  }

  /**
   * Build HTML for differentials
   */
  buildDifferentialsHTML(diffs) {
    return diffs.map(diff => {
      if (typeof diff === 'object') {
        const name = diff.name || diff.id || 'Unknown';
        const hint = diff.hint || '';
        return `
          <div class="ems-differential-card">
            <div class="ems-differential-name">${this.escapeHTML(name)}</div>
            <div class="ems-differential-hint">${this.renderMarkdown(hint)}</div>
          </div>
        `;
      }
      return `<div class="ems-differential-card">${this.escapeHTML(diff)}</div>`;
    }).join('');
  }

  /**
   * Build HTML for clinical cases
   */
  buildCasesHTML(cases) {
    return cases.map((c, i) => {
      if (typeof c !== 'object') return '';

      const stem = c.stem || '';
      const clues = c.clues || [];
      const answer = c.answer || '';
      const teaching = c.teaching || '';

      const cluesHTML = clues.length > 0 ? `
        <div class="ems-case-clues">
          <div class="ems-case-clues-title">🔍 Clues:</div>
          <ul>${clues.map(clue => `<li>${this.renderMarkdown(clue)}</li>`).join('')}</ul>
        </div>
      ` : '';

      return `
        <div class="ems-case">
          <div class="ems-case-stem">${this.renderMarkdown(stem)}</div>
          ${cluesHTML}
          <div class="ems-spoiler-container">
            <button class="ems-spoiler-btn">💡 Reveal Answer</button>
            <div class="ems-spoiler-content">
              <div class="ems-case-answer">✅ ${this.renderMarkdown(answer)}</div>
              ${teaching ? `<div class="ems-case-teaching">📚 ${this.renderMarkdown(teaching)}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Build HTML for images
   */
  buildImagesHTML(images) {
    return images.map(img => {
      if (typeof img !== 'object') return '';
      const src = img.src || '';
      const alt = img.alt || 'Medical image';
      return `
        <div class="ems-image-container">
          <img class="ems-image ems-image-thumbnail" src="${this.escapeHTML(src)}" alt="${this.escapeHTML(alt)}" loading="lazy" tabindex="0" role="button" aria-label="Click to zoom: ${this.escapeHTML(alt)}">
          <p class="ems-image-caption">${this.escapeHTML(alt)}</p>
        </div>
      `;
    }).join('');
  }

  /**
   * Build HTML for sources
   */
  buildSourcesHTML(sources) {
    const items = sources.map(source => {
      if (typeof source === 'string') {
        return `<li>${this.renderMarkdown(source)}</li>`;
      }
      const title = source.title || source.name || 'Source';
      const url = source.url || source.link || '';
      if (url) {
        return `<li><a href="${this.escapeHTML(url)}" target="_blank" rel="noopener">${this.escapeHTML(title)}</a></li>`;
      }
      return `<li>${this.escapeHTML(title)}</li>`;
    }).join('');

    return `
      <section class="ems-section collapsed" data-section="sources">
        <header class="ems-section-header" aria-expanded="false">
          <span class="ems-section-title">
            <span class="ems-section-icon">📚</span>
            Sources
          </span>
          <span class="ems-toggle-btn">+</span>
        </header>
        <div class="ems-section-content" aria-hidden="true">
          <ul class="ems-list">${items}</ul>
        </div>
      </section>
    `;
  }

  /**
   * Build HTML for credits
   */
  buildCreditsHTML(credits) {
    const items = credits.map(credit => {
      if (typeof credit === 'string') {
        return `<li>${this.escapeHTML(credit)}</li>`;
      }
      const display = credit.display || credit.name || 'Contributor';
      return `<li>${this.escapeHTML(display)}</li>`;
    }).join('');

    return `
      <section class="ems-section collapsed" data-section="credits">
        <header class="ems-section-header" aria-expanded="false">
          <span class="ems-section-title">
            <span class="ems-section-icon">👤</span>
            Credits
          </span>
          <span class="ems-toggle-btn">+</span>
        </header>
        <div class="ems-section-content" aria-hidden="true">
          <ul class="ems-list">${items}</ul>
        </div>
      </section>
    `;
  }

  /**
   * Build HTML for see also links
   */
  buildSeeAlsoHTML(seeAlso, prerequisites) {
    if (!seeAlso?.length && !prerequisites?.length) {
      return '';
    }

    let rowsHTML = '';

    if (prerequisites?.length > 0) {
      const tagsHTML = prerequisites.slice(0, 5).map(item => {
        const id = typeof item === 'string' ? item : item.id;
        const name = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<span class="ems-term-link" data-term-id="${this.escapeHTML(id)}">${this.escapeHTML(name)}</span>`;
      }).join('');
      rowsHTML += `<div class="ems-see-also-row">
        <span class="ems-see-also-label">Learn first:</span>
        <div class="ems-see-also-tags">${tagsHTML}</div>
      </div>`;
    }

    if (seeAlso?.length > 0) {
      const tagsHTML = seeAlso.slice(0, 5).map(item => {
        const id = typeof item === 'string' ? item : item.id;
        const name = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `<span class="ems-term-link" data-term-id="${this.escapeHTML(id)}">${this.escapeHTML(name)}</span>`;
      }).join('');
      rowsHTML += `<div class="ems-see-also-row">
        <span class="ems-see-also-label">See also:</span>
        <div class="ems-see-also-tags">${tagsHTML}</div>
      </div>`;
    }

    return `
      <footer class="ems-popup-footer">
        <div class="ems-see-also">${rowsHTML}</div>
      </footer>
    `;
  }

  /**
   * Build "Related to" / "Part of" banner HTML
   * Shows related terms at the top of the popup content
   * @param {Array} seeAlso - Related terms
   * @param {number} maxVisible - Maximum visible items before toggle
   * @returns {string} HTML string
   */
  buildPartOfHTML(seeAlso, maxVisible = 3) {
    if (!seeAlso?.length) return '';

    const formatName = (id) => {
      const termId = typeof id === 'string' ? id : id?.id || '';
      return termId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const getTermId = (item) => typeof item === 'string' ? item : item?.id || '';

    const visible = seeAlso.slice(0, maxVisible);
    const hidden = seeAlso.slice(maxVisible);

    let linksHTML = visible.map(item => {
      const termId = getTermId(item);
      const name = formatName(termId);
      return `<span class="ems-part-of-link ems-term-link" data-term-id="${this.escapeHTML(termId)}">${this.escapeHTML(name)}</span>`;
    }).join('');

    let toggleHTML = '';
    let hiddenHTML = '';
    if (hidden.length > 0) {
      toggleHTML = `<button class="ems-part-of-toggle" aria-expanded="false">+${hidden.length} more</button>`;
      hiddenHTML = `<div class="ems-part-of-hidden" hidden>
        ${hidden.map(item => {
          const termId = getTermId(item);
          const name = formatName(termId);
          return `<span class="ems-part-of-link ems-term-link" data-term-id="${this.escapeHTML(termId)}">${this.escapeHTML(name)}</span>`;
        }).join('')}
      </div>`;
    }

    return `
      <div class="ems-part-of-banner">
        <span class="ems-part-of-icon">📚</span>
        <span class="ems-part-of-label">Related to:</span>
        <div class="ems-part-of-links">
          ${linksHTML}
          ${toggleHTML}
          ${hiddenHTML}
        </div>
      </div>
    `;
  }

  /**
   * Build disambiguation HTML
   */
  buildDisambiguationHTML(terms) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';

    const optionsHTML = terms.map(term => {
      const name = term.names?.[0] || term.id;
      const primaryTag = term.primary_tag || '';
      const tagInfo = TAG_COLORS[primaryTag] || { accent: '#6C5CE7', icon: '📚' };
      const displayTag = primaryTag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      return `
        <div class="ems-disambiguation-option" data-term-id="${this.escapeHTML(term.id)}">
          <span class="ems-disambiguation-icon">${tagInfo.icon}</span>
          <span class="ems-disambiguation-name">${this.escapeHTML(name)}</span>
          <span class="ems-disambiguation-tag" style="background:${tagInfo.accent}">${displayTag}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="ems-popup ems-disambiguation" data-theme="${theme}" role="dialog" aria-modal="true">
        <div class="ems-disambiguation-title">Select term:</div>
        ${optionsHTML}
      </div>
    `;
  }

  /**
   * Build search results HTML
   */
  buildSearchResultsHTML(query, results) {
    const isDark = this.isDarkMode();
    const theme = isDark ? 'dark' : 'light';

    const resultsHTML = results.map(term => {
      const name = term.name || term.id;
      const primaryTag = term.primaryTag || '';
      const tagInfo = TAG_COLORS[primaryTag] || { accent: '#6C5CE7', icon: '📚' };

      return `
        <div class="ems-search-result ems-disambiguation-option" data-term-id="${this.escapeHTML(term.id)}">
          <span class="ems-disambiguation-icon">${tagInfo.icon}</span>
          <span class="ems-disambiguation-name">${this.escapeHTML(name)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="ems-popup ems-search-results" data-theme="${theme}" role="dialog" aria-modal="true">
        <header class="ems-popup-header">
          <span class="ems-search-query">Results for "${this.escapeHTML(query)}"</span>
          <button class="ems-close-btn" aria-label="Close">×</button>
        </header>
        <div class="ems-search-results-list">
          ${resultsHTML || '<p class="ems-no-results">No results found</p>'}
        </div>
      </div>
    `;
  }

  /**
   * Render simple markdown (bold, italic, links)
   */
  renderMarkdown(text) {
    if (!text) return '';

    return this.escapeHTML(text)
      // Markdown-style formatting
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Restore allowed HTML tags that were escaped
      .replace(/&lt;u&gt;/g, '<u>')
      .replace(/&lt;\/u&gt;/g, '</u>')
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  }

  /**
   * Highlight terms in content by scanning for glossary terms and wrapping them in clickable spans.
   * Excludes the current term being viewed to avoid self-references.
   * @param {string} html - The HTML content to process
   * @param {string} currentTermId - The current term ID to exclude
   * @returns {string} - HTML with terms wrapped in clickable spans
   */
  highlightTermsInContent(html, currentTermId) {
    if (!html || !this.termPatterns || this.termPatterns.size === 0) {
      return html;
    }

    // Extract text content from HTML for matching
    // Create a temporary element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const textContent = tempDiv.textContent || '';

    if (!textContent.trim()) {
      return html;
    }

    // Find all pattern matches in the text
    const matches = [];
    const lowerText = textContent.toLowerCase();

    // Sort patterns by length (descending) to match longer patterns first
    const sortedPatterns = Array.from(this.termPatterns.keys())
      .filter(p => p.length >= 3) // Skip very short patterns
      .sort((a, b) => b.length - a.length);

    for (const pattern of sortedPatterns) {
      const lowerPattern = pattern.toLowerCase();
      let searchIndex = 0;

      while (searchIndex < lowerText.length) {
        const pos = lowerText.indexOf(lowerPattern, searchIndex);
        if (pos === -1) break;

        // Check word boundaries
        const prevChar = pos > 0 ? lowerText[pos - 1] : ' ';
        const nextChar = pos + lowerPattern.length < lowerText.length 
          ? lowerText[pos + lowerPattern.length] 
          : ' ';

        const isWordBoundaryStart = !/[a-zA-Z0-9]/.test(prevChar);
        const isWordBoundaryEnd = !/[a-zA-Z0-9]/.test(nextChar);

        if (isWordBoundaryStart && isWordBoundaryEnd) {
          const termIds = this.termPatterns.get(pattern) || [];
          // Exclude the current term
          const filteredTermIds = termIds.filter(id => id !== currentTermId);

          if (filteredTermIds.length > 0) {
            matches.push({
              start: pos,
              end: pos + lowerPattern.length,
              pattern,
              termId: filteredTermIds[0],
              originalText: textContent.slice(pos, pos + lowerPattern.length)
            });
          }
        }

        searchIndex = pos + 1;
      }
    }

    if (matches.length === 0) {
      return html;
    }

    // Remove overlapping matches (keep longer ones)
    const nonOverlapping = [];
    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    for (const match of matches) {
      const overlaps = nonOverlapping.some(m => 
        (match.start >= m.start && match.start < m.end) ||
        (match.end > m.start && match.end <= m.end)
      );
      if (!overlaps) {
        nonOverlapping.push(match);
      }
    }

    if (nonOverlapping.length === 0) {
      return html;
    }

    // Now we need to replace the matched text in the original HTML
    // This is tricky because the positions are for text content, not HTML
    // We'll use a simple approach: replace the first occurrence of each matched text
    let result = html;
    
    // Sort by length (descending) to replace longer matches first
    nonOverlapping.sort((a, b) => b.originalText.length - a.originalText.length);

    // Track what we've replaced to avoid double-replacing
    const replaced = new Set();

    for (const match of nonOverlapping) {
      const { originalText, termId } = match;
      
      // Skip if we've already replaced this exact text
      const key = `${originalText.toLowerCase()}-${termId}`;
      if (replaced.has(key)) continue;

      // Create the replacement span (using data-term-id for click handling)
      const replacement = `<span class="ems-inline-term ems-term-link" data-term-id="${this.escapeHTML(termId)}">${this.escapeHTML(originalText)}</span>`;

      // Create a regex that matches the text but not already-wrapped terms
      // This avoids matching inside existing ems-inline-term spans
      const safeText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!<span[^>]*>)\\b(${safeText})\\b(?![^<]*<\\/span>)`, 'i');

      if (regex.test(result)) {
        result = result.replace(regex, replacement);
        replaced.add(key);
      }
    }

    return result;
  }

  /**
   * Escape HTML special characters
   */
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Check if dark mode is enabled based on theme setting
   * @returns {boolean}
   */
  isDarkMode() {
    if (this.themeSetting === 'dark') {
      return true;
    }
    if (this.themeSetting === 'light') {
      return false;
    }
    // 'auto' - use system preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  /**
   * Get fallback CSS styles
   */
  getFallbackCSS() {
    return `
      .ems-popup {
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        width: 450px;
        max-height: 80vh;
        background: #fff;
        border: 3px solid #1a1a2e;
        border-radius: 16px;
        box-shadow: 6px 6px 0 rgba(26, 26, 46, 0.3);
        overflow: hidden;
      }
      .ems-popup[data-theme="dark"] {
        background: #1e1e2e;
        color: #f0f4f8;
        border-color: #4a4a6a;
      }
      .ems-popup-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, #6C5CE7 0%, #a855f7 100%);
        color: white;
      }
      .ems-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ems-term-title {
        font-size: 18px;
        font-weight: 700;
        margin: 0;
      }
      .ems-close-btn, .ems-back-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
      }
      .ems-close-btn:hover, .ems-back-btn:hover {
        background: rgba(255,255,255,0.3);
      }
      .ems-tags-bar {
        display: flex;
        gap: 6px;
        padding: 8px 16px;
        flex-wrap: wrap;
        border-bottom: 2px solid #eee;
      }
      .ems-popup[data-theme="dark"] .ems-tags-bar {
        border-color: #4a4a6a;
      }
      .ems-tag {
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        color: white;
        text-transform: uppercase;
      }
      .ems-popup-scroll {
        max-height: calc(80vh - 120px);
        overflow-y: auto;
      }
      .ems-popup-content {
        padding: 16px;
      }
      .ems-section {
        margin-bottom: 12px;
        border: 2px solid #eee;
        border-radius: 12px;
        overflow: hidden;
      }
      .ems-popup[data-theme="dark"] .ems-section {
        border-color: #4a4a6a;
      }
      .ems-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #f8f7ff;
        cursor: pointer;
        user-select: none;
      }
      .ems-popup[data-theme="dark"] .ems-section-header {
        background: #2d2d44;
      }
      .ems-section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }
      .ems-toggle-btn {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
      }
      .ems-section.collapsed .ems-section-content {
        display: none;
      }
      .ems-section-content {
        padding: 12px 14px;
      }
      .ems-list {
        margin: 0;
        padding-left: 20px;
      }
      .ems-list li {
        margin-bottom: 8px;
        line-height: 1.5;
      }
      .ems-popup-footer {
        padding: 12px 16px;
        border-top: 2px solid #eee;
        background: #f8f7ff;
      }
      .ems-popup[data-theme="dark"] .ems-popup-footer {
        border-color: #4a4a6a;
        background: #2d2d44;
      }
      .ems-term-link {
        color: #6C5CE7;
        cursor: pointer;
        margin-right: 8px;
        text-decoration: underline;
      }
      .ems-term-link:hover {
        color: #5a4dd1;
      }
      .ems-disambiguation-option {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
      }
      .ems-disambiguation-option:hover {
        background: #f0e6ff;
      }
      .ems-popup[data-theme="dark"] .ems-disambiguation-option:hover {
        background: #3d3d5c;
      }
      .ems-disambiguation-name {
        flex: 1;
        font-weight: 600;
      }
      .ems-disambiguation-tag {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        color: white;
        text-transform: uppercase;
      }
      .ems-spoiler-btn {
        background: #6C5CE7;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      }
      .ems-spoiler-content {
        display: none;
      }
      .ems-spoiler-content.revealed {
        display: block;
        margin-top: 12px;
        padding: 12px;
        background: #f0e6ff;
        border-radius: 8px;
      }
      .ems-popup[data-theme="dark"] .ems-spoiler-content.revealed {
        background: #3d3d5c;
      }
    `;
  }
}

export default PopupUI;
