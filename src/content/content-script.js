/**
 * Content Script for EnterMedSchool Glossary
 * Entry point that initializes highlighting and popup functionality.
 * 
 * @module content-script
 */

import { TermMatcher } from './term-matcher.js';
import { Highlighter } from './highlighter.js';
import { PopupUI } from './popup-ui.js';
import { SearchOverlay } from './search-overlay.js';
import { MESSAGE_TYPES, STORAGE_KEYS, PAGE_TYPES, SMART_CONTENTEDITABLE_HOSTS } from '../shared/constants.js';
import * as logger from '../shared/logger.js';

// Mark that we're loaded (for service worker detection)
window.__EMS_GLOSSARY_LOADED__ = true;

// Global error handler for extension context invalidated errors
// This prevents uncaught errors when the extension is reloaded
window.addEventListener('error', (event) => {
  if (event.message?.includes('Extension context invalidated')) {
    event.preventDefault();
    logger.warn('Extension was reloaded - please refresh the page');
    return true;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('Extension context invalidated') ||
      event.reason?.message?.includes('Receiving end does not exist')) {
    event.preventDefault();
    logger.warn('Extension connection lost - please refresh the page');
    return true;
  }
});

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
 * Main controller class for the content script
 */
class EMSGlossary {
  constructor() {
    /** @type {TermMatcher|null} */
    this.matcher = null;
    /** @type {Highlighter|null} */
    this.highlighter = null;
    /** @type {PopupUI|null} */
    this.popup = null;
    /** @type {SearchOverlay|null} */
    this.searchOverlay = null;
    /** @type {Object} */
    this.index = null;
    /** @type {boolean} */
    this.isEnabled = true;
    /** @type {Object} */
    this.settings = null;
    /** @type {string} */
    this.pageType = PAGE_TYPES.NORMAL;
    /** @type {Element|null} */
    this._lastFocusedElement = null;
  }

  /**
   * Detect the type of page we're on
   * @returns {string} One of PAGE_TYPES values
   */
  detectPageType() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const url = window.location.href;

    // Check for PDF
    if (this.isPDFPage(url, pathname)) {
      return PAGE_TYPES.PDF;
    }

    // Check for Notion
    if (SMART_CONTENTEDITABLE_HOSTS.some(host => hostname.includes(host))) {
      return PAGE_TYPES.NOTION;
    }

    return PAGE_TYPES.NORMAL;
  }

  /**
   * Check if current page is a PDF
   * @param {string} url - Full URL
   * @param {string} pathname - URL pathname
   * @returns {boolean}
   */
  isPDFPage(url, pathname) {
    // Check URL path ends with .pdf
    if (pathname.toLowerCase().endsWith('.pdf')) {
      return true;
    }

    // Check for Chrome's PDF viewer (content-type based)
    // Chrome loads PDFs with embed element having type="application/pdf"
    const embedPdf = document.querySelector('embed[type="application/pdf"]');
    if (embedPdf) {
      return true;
    }

    // Check for Firefox's PDF.js viewer
    if (document.querySelector('#viewer.pdfViewer')) {
      return true;
    }

    // Check URL contains PDF viewer indicators
    if (url.includes('pdfviewer') || url.includes('pdf.js')) {
      return true;
    }

    return false;
  }

  /**
   * Initialize the glossary
   */
  async init() {
    logger.info('Initializing EMS Glossary content script');

    try {
      // Detect page type first
      this.pageType = this.detectPageType();
      logger.info('Detected page type:', this.pageType);

      // Handle PDF pages - show notice and exit early
      if (this.pageType === PAGE_TYPES.PDF) {
        logger.info('PDF page detected - highlighting not supported');
        this.showPDFNotice();
        // Still set up message listener for popup communication
        this.setupMessageListener();
        return;
      }

      // Get settings
      this.settings = await this.getSettings();
      this.isEnabled = this.settings.enabled;

      // Check if site is enabled
      const hostname = window.location.hostname;
      if (this.settings.disabledSites.includes(hostname)) {
        logger.info('Site is disabled:', hostname);
        this.isEnabled = false;
        return;
      }

      if (!this.isEnabled) {
        logger.info('Extension is disabled globally');
        return;
      }

      // Load the term index
      await this.loadIndex();

      // Initialize components
      this.matcher = new TermMatcher(this.index);
      this.matcher.setUserLevel(this.settings.userLevel);
      this.matcher.setBetaFeatures(this.settings.enableBetaFeatures || false);
      this.highlighter = new Highlighter(this.matcher);
      
      // Set page type on highlighter for smart contenteditable handling
      this.highlighter.setPageType(this.pageType);
      
      this.popup = new PopupUI();
      this.popup.setBetaFeatures(this.settings.enableBetaFeatures || false);
      // Pass term patterns to popup for inline term highlighting
      if (this.index.patterns) {
        this.popup.setTermPatterns(this.index.patterns);
      }

      // Apply settings
      this.highlighter.setStyle(
        this.settings.highlightStyle,
        this.settings.highlightColor
      );

      // Set theme for popup
      this.popup.setTheme(this.settings.theme);
      this.popup.setFontSize(this.settings.fontSize);

      // Initialize search overlay
      this.searchOverlay = new SearchOverlay();
      this.searchOverlay.setTheme(this.settings.theme);
      this.searchOverlay.init((termId, searchQuery) => {
        // When a term is selected from search, show the popup with search highlighting
        this.popup?.showTerm(termId, window.innerWidth / 2, window.innerHeight / 3, searchQuery);
      });

      // Set up event listeners
      this.setupEventListeners();

      // Start highlighting
      this.highlighter.start();

      // Initialize popup
      this.popup.init();

      logger.info('EMS Glossary initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize:', error);
    }
  }

  /**
   * Show a non-intrusive notice on PDF pages
   */
  showPDFNotice() {
    // Create a small, dismissible notice
    const notice = document.createElement('div');
    notice.id = 'ems-pdf-notice';
    notice.innerHTML = `
      <div class="ems-pdf-notice-content">
        <span class="ems-pdf-notice-icon">📄</span>
        <span class="ems-pdf-notice-text">EMS Glossary: PDF highlighting not available. Copy text to a webpage to use.</span>
        <button class="ems-pdf-notice-close" aria-label="Dismiss">×</button>
      </div>
    `;
    
    // Style the notice
    const style = document.createElement('style');
    style.textContent = `
      #ems-pdf-notice {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: ems-slide-in 0.3s ease-out;
      }
      @keyframes ems-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .ems-pdf-notice-content {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #1a1a2e;
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 350px;
      }
      .ems-pdf-notice-icon {
        font-size: 20px;
      }
      .ems-pdf-notice-text {
        font-size: 13px;
        line-height: 1.4;
      }
      .ems-pdf-notice-close {
        background: none;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .ems-pdf-notice-close:hover {
        color: #fff;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notice);
    
    // Add close handler
    notice.querySelector('.ems-pdf-notice-close').addEventListener('click', () => {
      notice.remove();
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (notice.parentNode) {
        notice.style.animation = 'ems-slide-in 0.3s ease-out reverse';
        setTimeout(() => notice.remove(), 300);
      }
    }, 10000);
  }

  /**
   * Set up just the message listener (for PDF pages)
   */
  setupMessageListener() {
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }
  }

  /**
   * Get settings from storage via service worker
   */
  async getSettings() {
    try {
      const response = await sendRuntimeMessage({
        type: MESSAGE_TYPES.GET_SETTINGS,
      });
      return response || {
        enabled: true,
        highlightStyle: 'underline',
        highlightColor: '#6C5CE7',
        disabledSites: [],
      };
    } catch (error) {
      logger.error('Failed to get settings:', error);
      return {
        enabled: true,
        highlightStyle: 'underline',
        highlightColor: '#6C5CE7',
        disabledSites: [],
      };
    }
  }

  /**
   * Load the term index from service worker
   */
  async loadIndex() {
    // Create a lightweight index proxy that fetches data on demand
    this.index = {
      patterns: new Map(),
      patternMetadata: new Map(),
      terms: new Map(),
      _allPatterns: [],

      getAllPatterns: () => this._allPatterns,
      
      getTermIdsForPattern: (pattern) => {
        return this.patterns.get(pattern.toLowerCase()) || [];
      },
      
      getPatternMetadata: (pattern) => {
        return this.patternMetadata.get(pattern.toLowerCase()) || null;
      },

      getTermContent: async (termId) => {
        const response = await sendRuntimeMessage({
          type: MESSAGE_TYPES.GET_TERM,
          payload: { termId },
        });
        return response?.term || null;
      },
    };

    // Fetch the full pattern list from service worker
    // For performance, we load patterns but fetch term content on demand
    try {
      if (!chrome?.runtime?.getURL) {
        logger.warn('Extension runtime unavailable - cannot load terms');
        return;
      }
      const response = await fetch(chrome.runtime.getURL('data/terms-bundle.json'));
      if (response.ok) {
        const terms = await response.json();
        this.buildLocalIndex(terms);
      }
    } catch (error) {
      logger.error('Failed to load terms:', error);
    }
  }

  /**
   * Build local pattern index from terms
   * @param {Object[]} terms
   */
  buildLocalIndex(terms) {
    for (const term of terms) {
      const termId = term.id || term.names?.[0]?.toLowerCase().replace(/\s+/g, '-');
      if (!termId) continue;

      // Store term metadata
      this.index.terms.set(termId, {
        id: termId,
        name: term.names?.[0] || termId,
        primaryTag: term.primary_tag || '',
        definition: term.definition || '',
        level: term.level || 'medschool',
        fullContent: term,
      });

      // Extract patterns
      const patterns = [
        ...(term.patterns || []),
        ...(term.names || []),
        ...(term.aliases || []),
        ...(term.abbr || []),
      ];

      for (const pattern of patterns) {
        const normalized = pattern.toLowerCase().trim();
        if (!normalized || normalized.length < 2) continue;

        if (!this.index.patterns.has(normalized)) {
          this.index.patterns.set(normalized, []);
        }
        const ids = this.index.patterns.get(normalized);
        if (!ids.includes(termId)) {
          ids.push(termId);
        }

        // Store case sensitivity metadata
        if (!this.index.patternMetadata.has(normalized)) {
          const isAbbr = term.abbr?.includes(pattern);
          const meta = this.getCaseSensitivity(normalized, pattern, isAbbr);
          this.index.patternMetadata.set(normalized, meta);
        }
      }
    }

    // Sort patterns by length
    this.index._allPatterns = Array.from(this.index.patterns.keys())
      .sort((a, b) => b.length - a.length);

    // Update getter
    this.index.getAllPatterns = () => this.index._allPatterns;
    this.index.getTermIdsForPattern = (pattern) => {
      return this.index.patterns.get(pattern.toLowerCase()) || [];
    };
    this.index.getPatternMetadata = (pattern) => {
      return this.index.patternMetadata.get(pattern.toLowerCase()) || null;
    };

    // Count terms by level for debugging
    let premedCount = 0;
    let medschoolCount = 0;
    for (const [, meta] of this.index.terms) {
      if (meta.level === 'premed') premedCount++;
      else if (meta.level === 'medschool' || !meta.level) medschoolCount++;
    }
    logger.info(`Built index: ${this.index.terms.size} terms (${premedCount} premed, ${medschoolCount} medschool), ${this.index.patterns.size} patterns`);
  }

  /**
   * Get case sensitivity for a pattern
   */
  getCaseSensitivity(normalized, original, isAbbr) {
    const originalStripped = original.trim();

    if (isAbbr && normalized.length <= 6) {
      return { isCaseSensitive: true, originalCase: originalStripped.toUpperCase() };
    }

    if (normalized.length <= 4 && originalStripped === originalStripped.toUpperCase()) {
      return { isCaseSensitive: true, originalCase: originalStripped };
    }

    return { isCaseSensitive: false, originalCase: null };
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for term clicks
    document.addEventListener('click', this.handleTermClick.bind(this));
    document.addEventListener('keydown', this.handleKeydown.bind(this));

    // Listen for middle-click to open underlying links
    document.addEventListener('auxclick', this.handleTermMiddleClick.bind(this));

    // Listen for hover events (for hover preview mode)
    document.addEventListener('mouseenter', this.handleTermHover.bind(this), true);
    document.addEventListener('mouseleave', this.handleTermLeave.bind(this), true);

    // Listen for messages from service worker
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    // On Notion pages, track focus/blur to re-highlight after editing
    if (this.pageType === PAGE_TYPES.NOTION) {
      this.setupNotionFocusHandlers();
    }
  }

  /**
   * Set up focus/blur handlers for Notion pages
   * Re-highlights content when user stops editing
   */
  setupNotionFocusHandlers() {
    // Selectors for editable areas on Notion (ProseMirror + contenteditable)
    const editableSelectors = [
      '.ProseMirror',
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '[contenteditable]:not([contenteditable="false"])',
    ];
    
    const matchesEditable = (el) => {
      if (!el) return false;
      return editableSelectors.some(sel => {
        try {
          return el.matches?.(sel);
        } catch (e) {
          return false;
        }
      });
    };
    
    const findEditableAncestor = (el) => {
      if (!el) return null;
      for (const sel of editableSelectors) {
        try {
          const ancestor = el.closest?.(sel);
          if (ancestor) return ancestor;
        } catch (e) {
          // Invalid selector
        }
      }
      return null;
    };

    // Track focus on editable elements
    document.addEventListener('focusin', (event) => {
      const target = event.target;
      const editableEl = matchesEditable(target) ? target : findEditableAncestor(target);
      if (editableEl) {
        this._lastFocusedElement = editableEl;
        logger.debug('Notion: Focus in editable', this._lastFocusedElement);
      }
    }, true);

    // Re-highlight when focus leaves editable
    document.addEventListener('focusout', (event) => {
      const target = event.target;
      const editableEl = matchesEditable(target) ? target : findEditableAncestor(target);
      
      if (editableEl) {
        // Debounce to allow for focus moving between editable elements
        setTimeout(() => {
          // Check if focus has moved to another editable
          const activeEl = document.activeElement;
          const activeEditable = findEditableAncestor(activeEl);
          
          // If focus is now outside editable areas, re-process the previously focused element
          if (!activeEditable && this._lastFocusedElement) {
            logger.debug('Notion: Focus out - re-highlighting', this._lastFocusedElement);
            
            // Clear highlights in this element first (they may have been modified while editing)
            this.removeHighlightsFromElement(this._lastFocusedElement);
            
            // Re-process this node
            if (this.highlighter) {
              this.highlighter.processNode(this._lastFocusedElement);
            }
            
            this._lastFocusedElement = null;
          }
        }, 100);
      }
    }, true);
  }

  /**
   * Remove highlights from a specific element
   * @param {Element} element
   */
  removeHighlightsFromElement(element) {
    if (!element) return;
    
    const highlights = element.querySelectorAll('.ems-term');
    for (const span of highlights) {
      const text = document.createTextNode(span.textContent);
      span.parentNode?.replaceChild(text, span);
    }
    
    // Normalize text nodes
    element.normalize();
  }

  /** @type {number|null} Hover preview timeout */
  _hoverTimeout = null;
  /** @type {HTMLElement|null} Currently hovered term element */
  _hoveredTerm = null;

  /**
   * Handle hover on highlighted term (for preview mode)
   * @param {MouseEvent} event
   */
  handleTermHover(event) {
    const term = event.target.closest?.('.ems-term');
    if (!term || !this.settings?.hoverPreview) {
      return;
    }

    // Clear any existing timeout
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
    }

    this._hoveredTerm = term;
    const delay = this.settings.hoverDelay || 300;

    this._hoverTimeout = setTimeout(() => {
      if (this._hoveredTerm === term) {
        const termIds = term.dataset.termIds?.split(',') || [];
        if (termIds.length > 0) {
          const rect = term.getBoundingClientRect();
          this.popup?.showPreview(termIds, rect.left + rect.width / 2, rect.bottom + 5);
        }
      }
    }, delay);
  }

  /**
   * Handle mouse leaving highlighted term
   * @param {MouseEvent} event
   */
  handleTermLeave(event) {
    const term = event.target.closest?.('.ems-term');
    if (!term) {
      return;
    }

    // Clear hover timeout
    if (this._hoverTimeout) {
      clearTimeout(this._hoverTimeout);
      this._hoverTimeout = null;
    }

    if (this._hoveredTerm === term) {
      this._hoveredTerm = null;
      
      // Hide preview after a short delay (allows moving to popup)
      setTimeout(() => {
        if (!this._hoveredTerm) {
          this.popup?.hidePreview();
        }
      }, 100);
    }
  }

  /**
   * Handle click on highlighted term
   * @param {MouseEvent} event
   */
  handleTermClick(event) {
    const term = event.target.closest('.ems-term');
    if (!term) {
      return;
    }

    // If Ctrl+Click or Cmd+Click, allow the native link behavior
    const parentLink = term.closest('a');
    if (parentLink && (event.ctrlKey || event.metaKey)) {
      // Don't prevent default - let the link open (in new tab by default with Ctrl/Cmd)
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const termIds = term.dataset.termIds?.split(',') || [];
    if (termIds.length === 0) {
      return;
    }

    // Record view
    const firstTermId = termIds[0];
    const termData = this.index.terms.get(firstTermId);
    if (termData) {
      sendRuntimeMessage({
        type: MESSAGE_TYPES.RECORD_VIEW,
        payload: {
          termId: firstTermId,
          category: termData.primaryTag,
        },
      });
    }

    // Get the term's position for popup placement
    // Using term element position instead of click coordinates ensures
    // consistent behavior for both mouse clicks and keyboard activation
    const rect = term.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.bottom;

    // Show popup near the term
    this.popup?.show(termIds, x, y);
  }

  /**
   * Handle middle-click on highlighted term (to open underlying links)
   * @param {MouseEvent} event
   */
  handleTermMiddleClick(event) {
    // Only handle middle-click (button === 1)
    if (event.button !== 1) {
      return;
    }

    const term = event.target.closest('.ems-term');
    if (!term) {
      return;
    }

    // Check if the term is inside a link
    const parentLink = term.closest('a');
    if (parentLink && parentLink.href) {
      // Open the link in a new tab (middle-click default behavior)
      window.open(parentLink.href, '_blank');
      event.preventDefault();
    }
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    const term = event.target.closest('.ems-term');
    
    if (term && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      term.click();
    }

    if (event.key === 'Escape') {
      this.popup?.hide();
    }
  }

  /**
   * Handle messages from service worker
   * @param {Object} message
   * @param {Object} sender
   * @param {Function} sendResponse
   */
  handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;

    switch (type) {
      case 'HIGHLIGHT':
        this.highlighter?.start();
        sendResponse({ success: true });
        break;

      case 'ENABLE':
        this.isEnabled = true;
        this.highlighter?.start();
        sendResponse({ success: true });
        break;

      case 'DISABLE':
        this.isEnabled = false;
        this.highlighter?.stop();
        sendResponse({ success: true });
        break;

      case 'UPDATE_SETTINGS':
        if (payload) {
          this.settings = { ...this.settings, ...payload };
          this.highlighter?.setStyle(
            this.settings.highlightStyle,
            this.settings.highlightColor
          );
          // Update popup and search overlay theme if theme setting changed
          if (payload.theme) {
            this.popup?.setTheme(payload.theme);
            this.searchOverlay?.setTheme(payload.theme);
          }
          // Update user level if changed
          if (payload.userLevel && this.matcher) {
            this.matcher.setUserLevel(payload.userLevel);
            // Re-highlight with new level filter
            this.highlighter?.stop();
            this.highlighter?.start();
          }
          // Update beta features if changed
          if (payload.enableBetaFeatures !== undefined) {
            this.matcher?.setBetaFeatures(payload.enableBetaFeatures);
            this.popup?.setBetaFeatures(payload.enableBetaFeatures);
            // Re-highlight with new beta filter
            this.highlighter?.stop();
            this.highlighter?.start();
          }
          // Update font size if changed
          if (payload.fontSize !== undefined) {
            this.popup?.setFontSize(payload.fontSize);
          }
        }
        sendResponse({ success: true });
        break;

      case 'OPEN_SEARCH':
        this.searchOverlay?.show(payload?.query || '');
        sendResponse({ success: true });
        break;

      case 'SHOW_SEARCH_RESULTS':
        if (payload?.results?.length > 0) {
          this.popup?.showSearchResults(payload.query, payload.results);
        }
        sendResponse({ success: true });
        break;

      case 'SHOW_TERM_POPUP':
        if (payload?.termId) {
          this.popup?.showTerm(
            payload.termId,
            window.innerWidth / 2,
            window.innerHeight / 3
          );
        }
        sendResponse({ success: true });
        break;

      case 'GET_HIGHLIGHT_COUNT':
        const count = this.highlighter?.getHighlightCount() || 0;
        sendResponse({ count });
        break;

      case 'GET_PAGE_STATUS':
        sendResponse({ 
          pageType: this.pageType,
          isEnabled: this.isEnabled,
          isPDF: this.pageType === PAGE_TYPES.PDF,
          isNotion: this.pageType === PAGE_TYPES.NOTION,
        });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const glossary = new EMSGlossary();
    glossary.init();
  });
} else {
  const glossary = new EMSGlossary();
  glossary.init();
}
