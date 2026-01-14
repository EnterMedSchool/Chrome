/**
 * DOM Highlighter for EnterMedSchool Glossary
 * Traverses text nodes and wraps matching terms with highlight spans.
 * Uses MutationObserver for dynamic content.
 * 
 * @module highlighter
 */

import { SKIP_ELEMENTS, SKIP_EDITOR_SELECTORS, SKIP_RICH_TEXT_SELECTORS, SKIP_CONTENTEDITABLE_SELECTORS, PERFORMANCE, PAGE_TYPES } from '../shared/constants.js';
import * as logger from '../shared/logger.js';

/**
 * DOM Highlighter class
 */
export class Highlighter {
  /**
   * @param {import('./term-matcher.js').TermMatcher} matcher
   */
  constructor(matcher) {
    /** @type {import('./term-matcher.js').TermMatcher} */
    this.matcher = matcher;
    /** @type {MutationObserver|null} */
    this.observer = null;
    /** @type {Set<Node>} */
    this.processedNodes = new WeakSet();
    /** @type {number} */
    this.debounceTimer = null;
    /** @type {boolean} */
    this.isProcessing = false;
    /** @type {string} */
    this.highlightStyle = 'underline';
    /** @type {string} */
    this.highlightColor = '#6C5CE7';
    /** @type {string} */
    this.pageType = PAGE_TYPES.NORMAL;
    /** @type {Element|null} */
    this.focusedContentEditable = null;
  }

  /**
   * Set the page type for smart highlighting behavior
   * @param {string} pageType - One of PAGE_TYPES values
   */
  setPageType(pageType) {
    this.pageType = pageType;
    logger.info('Highlighter page type set to:', pageType);
  }

  /**
   * Set highlight style
   * @param {string} style - 'underline', 'background', or 'bold'
   * @param {string} color - CSS color value
   */
  setStyle(style, color) {
    this.highlightStyle = style;
    this.highlightColor = color;

    // Update CSS variable
    document.documentElement.style.setProperty('--ems-highlight-color', color);
  }

  /**
   * Start highlighting the page
   */
  start() {
    logger.info('Starting highlighter');
    this.processPage();
    this.startObserver();
  }

  /**
   * Stop highlighting and clean up
   */
  stop() {
    logger.info('Stopping highlighter');
    this.stopObserver();
    this.removeHighlights();
  }

  /**
   * Process the entire page
   */
  processPage() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.time('processPage');

    try {
      this.processNode(document.body);
    } catch (error) {
      logger.error('Error processing page:', error);
    } finally {
      this.isProcessing = false;
      logger.timeEnd('processPage');
    }
  }

  /**
   * Process a DOM node and its descendants
   * @param {Node} root
   */
  processNode(root) {
    if (!root || this.shouldSkipNode(root)) {
      return;
    }

    // Use TreeWalker for efficient text node traversal
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => {
          if (this.shouldSkipNode(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Process in batches to avoid blocking
    this.processBatch(textNodes, 0);
  }

  /**
   * Process a batch of text nodes
   * @param {Text[]} nodes
   * @param {number} startIndex
   */
  processBatch(nodes, startIndex) {
    const endIndex = Math.min(startIndex + PERFORMANCE.BATCH_SIZE, nodes.length);

    for (let i = startIndex; i < endIndex; i++) {
      this.processTextNode(nodes[i]);
    }

    if (endIndex < nodes.length) {
      // Schedule next batch
      if ('requestIdleCallback' in window) {
        requestIdleCallback(
          () => this.processBatch(nodes, endIndex),
          { timeout: PERFORMANCE.IDLE_DEADLINE_MS }
        );
      } else {
        setTimeout(() => this.processBatch(nodes, endIndex), 0);
      }
    }
  }

  /**
   * Process a single text node
   * @param {Text} textNode
   */
  processTextNode(textNode) {
    if (!textNode.parentNode || this.processedNodes.has(textNode)) {
      return;
    }

    const text = textNode.textContent;
    if (!text || text.length < 2) {
      return;
    }

    // Find matches in this text
    const matches = this.matcher.findTerms(text);
    if (matches.length === 0) {
      this.processedNodes.add(textNode);
      return;
    }

    // Create document fragment with highlighted spans
    const fragment = this.createHighlightedFragment(text, matches);

    // Replace text node with fragment
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  /**
   * Create a document fragment with highlighted terms
   * @param {string} text
   * @param {Array<{start: number, end: number, termIds: string[]}>} matches
   * @returns {DocumentFragment}
   */
  createHighlightedFragment(text, matches) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const { start, end, termIds } of matches) {
      // Add text before match
      if (start > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, start))
        );
      }

      // Create highlight span
      const span = document.createElement('span');
      span.className = `ems-term ems-term--${this.highlightStyle}`;
      span.dataset.termIds = termIds.join(',');
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      span.setAttribute(
        'aria-label',
        `Medical term: ${text.slice(start, end)}. Press Enter for definition.`
      );
      span.setAttribute('aria-haspopup', 'dialog');
      span.textContent = text.slice(start, end);

      // Add multi indicator if multiple matches
      if (termIds.length > 1) {
        span.classList.add('ems-term--multi');
      }

      fragment.appendChild(span);
      lastIndex = end;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(
        document.createTextNode(text.slice(lastIndex))
      );
    }

    return fragment;
  }

  /**
   * Check if a node should be skipped
   * @param {Element} node
   * @returns {boolean}
   */
  shouldSkipNode(node) {
    if (!node) {
      return true;
    }

    // Skip if already highlighted
    if (node.classList?.contains('ems-term')) {
      return true;
    }

    // Skip if inside our popup
    if (node.closest?.('.ems-popup-container')) {
      return true;
    }

    // Skip certain elements
    const tagName = node.tagName?.toLowerCase();
    if (SKIP_ELEMENTS.includes(tagName)) {
      return true;
    }

    // Skip code editor elements (always skip these - true code editors)
    for (const selector of SKIP_EDITOR_SELECTORS) {
      try {
        if (node.matches?.(selector) || node.closest?.(selector)) {
          return true;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // Handle rich text editors and contenteditable based on page type
    if (this.pageType === PAGE_TYPES.NOTION) {
      // On Notion: only skip rich text editors (ProseMirror) and contenteditable if focused
      const smartSkipSelectors = [...SKIP_RICH_TEXT_SELECTORS, ...SKIP_CONTENTEDITABLE_SELECTORS];
      
      for (const selector of smartSkipSelectors) {
        try {
          const editableEl = node.matches?.(selector) ? node : node.closest?.(selector);
          if (editableEl) {
            // Skip if this element or any parent is currently focused
            if (this.isElementFocused(editableEl)) {
              return true;
            }
            // Don't skip - allow highlighting in non-focused editable on Notion
            return false;
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }
    } else {
      // On other sites: always skip rich text editors
      for (const selector of SKIP_RICH_TEXT_SELECTORS) {
        try {
          if (node.matches?.(selector) || node.closest?.(selector)) {
            return true;
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }
      
      // On other sites: always skip contenteditable
      for (const selector of SKIP_CONTENTEDITABLE_SELECTORS) {
        try {
          if (node.matches?.(selector) || node.closest?.(selector)) {
            return true;
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }
    }

    return false;
  }

  /**
   * Check if an element or its descendants are currently focused
   * @param {Element} element
   * @returns {boolean}
   */
  isElementFocused(element) {
    if (!element) return false;
    
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    
    // Check if the element itself is focused or contains the focused element
    return element === activeElement || element.contains(activeElement);
  }

  /**
   * Track focused contenteditable element
   * @param {Element|null} element
   */
  setFocusedContentEditable(element) {
    this.focusedContentEditable = element;
  }

  /**
   * Start observing DOM changes
   */
  startObserver() {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver(mutations => {
      this.handleMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * Stop observing DOM changes
   */
  stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Handle DOM mutations with debouncing
   * @param {MutationRecord[]} mutations
   */
  handleMutations(mutations) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Collect nodes to process
    const nodesToProcess = new Set();

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            nodesToProcess.add(node);
          } else if (node.nodeType === Node.TEXT_NODE) {
            nodesToProcess.add(node.parentElement);
          }
        }
      } else if (mutation.type === 'characterData') {
        nodesToProcess.add(mutation.target.parentElement);
      }
    }

    if (nodesToProcess.size === 0) {
      return;
    }

    // Debounce processing
    this.debounceTimer = setTimeout(() => {
      for (const node of nodesToProcess) {
        if (node && !this.shouldSkipNode(node)) {
          this.processNode(node);
        }
      }
    }, PERFORMANCE.DEBOUNCE_MS);
  }

  /**
   * Remove all highlights from the page
   */
  removeHighlights() {
    const highlights = document.querySelectorAll('.ems-term');

    for (const span of highlights) {
      const text = document.createTextNode(span.textContent);
      span.parentNode.replaceChild(text, span);
    }

    // Normalize text nodes
    document.body.normalize();
  }

  /**
   * Get the number of unique highlighted terms on the page
   * @returns {number}
   */
  getHighlightCount() {
    const highlights = document.querySelectorAll('.ems-term');
    const uniqueTermIds = new Set();
    for (const span of highlights) {
      const ids = span.dataset.termIds?.split(',') || [];
      ids.forEach(id => uniqueTermIds.add(id));
    }
    return uniqueTermIds.size;
  }
}

/**
 * Create a new Highlighter instance
 * @param {import('./term-matcher.js').TermMatcher} matcher
 * @returns {Highlighter}
 */
export function createHighlighter(matcher) {
  return new Highlighter(matcher);
}

export default Highlighter;
