/**
 * Keyboard Handler for EMS Medical Glossary
 * Manages keyboard navigation between highlighted terms and popup interactions.
 * 
 * @module keyboard-handler
 */

import * as logger from '../shared/logger.js';

/**
 * Keyboard navigation controller
 */
export class KeyboardHandler {
  /**
   * @param {Object} options
   * @param {Function} options.onShowPopup - Callback to show popup for term
   * @param {Function} options.onHidePopup - Callback to hide popup
   * @param {Function} options.toggleFavorite - Callback to toggle favorite
   * @param {Function} options.copyDefinition - Callback to copy definition
   */
  constructor(options = {}) {
    this.onShowPopup = options.onShowPopup;
    this.onHidePopup = options.onHidePopup;
    this.toggleFavorite = options.toggleFavorite;
    this.copyDefinition = options.copyDefinition;

    /** @type {HTMLElement|null} */
    this.currentFocusedTerm = null;
    /** @type {HTMLElement[]} */
    this.highlightedTerms = [];
    /** @type {number} */
    this.currentIndex = -1;
    /** @type {boolean} */
    this.isEnabled = true;
  }

  /**
   * Initialize keyboard handler
   */
  init() {
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    document.addEventListener('focusin', this.handleFocusIn.bind(this));

    // Update term list when DOM changes
    this.updateTermsList();

    logger.debug('Keyboard handler initialized');
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
    document.removeEventListener('focusin', this.handleFocusIn.bind(this));
  }

  /**
   * Enable keyboard navigation
   */
  enable() {
    this.isEnabled = true;
  }

  /**
   * Disable keyboard navigation
   */
  disable() {
    this.isEnabled = false;
  }

  /**
   * Update the list of highlighted terms
   */
  updateTermsList() {
    this.highlightedTerms = Array.from(document.querySelectorAll('.ems-term'));
    logger.debug(`Found ${this.highlightedTerms.length} highlighted terms`);
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    if (!this.isEnabled) {
      return;
    }

    // Check if we're in an input field
    if (this.isInputElement(event.target)) {
      // Only handle Escape in inputs
      if (event.key === 'Escape') {
        this.onHidePopup?.();
      }
      return;
    }

    switch (event.key) {
      case 'Tab':
        // Let Tab work naturally for focus navigation
        // but update our tracking
        if (!event.shiftKey) {
          this.handleTabForward(event);
        } else {
          this.handleTabBackward(event);
        }
        break;

      case 'Enter':
      case ' ':
        if (this.currentFocusedTerm) {
          event.preventDefault();
          this.activateTerm(this.currentFocusedTerm);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.onHidePopup?.();
        break;

      case 'ArrowDown':
      case 'ArrowUp':
        // Navigate within popup if open
        // This is handled by the popup itself
        break;

      case 'f':
      case 'F':
        // Toggle favorite (if popup is open)
        if (event.key === 'f' && !event.ctrlKey && !event.metaKey) {
          this.toggleFavorite?.();
        }
        break;

      case 'c':
      case 'C':
        // Copy definition (if popup is open)
        if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
          // Let default copy work
        } else if (event.key === 'c' && !event.ctrlKey && !event.metaKey) {
          this.copyDefinition?.();
        }
        break;

      case 'n':
      case 'N':
        // Go to next term
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          this.focusNextTerm();
        }
        break;

      case 'p':
      case 'P':
        // Go to previous term
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          this.focusPreviousTerm();
        }
        break;
    }
  }

  /**
   * Handle focus changes
   * @param {FocusEvent} event
   */
  handleFocusIn(event) {
    const term = event.target.closest('.ems-term');
    if (term) {
      this.currentFocusedTerm = term;
      this.currentIndex = this.highlightedTerms.indexOf(term);
    }
  }

  /**
   * Handle Tab key (forward)
   * @param {KeyboardEvent} event
   */
  handleTabForward(event) {
    // Let natural tab order work, but if we're on a term,
    // we might want to show preview
    setTimeout(() => {
      this.updateCurrentFocus();
    }, 0);
  }

  /**
   * Handle Shift+Tab (backward)
   * @param {KeyboardEvent} event
   */
  handleTabBackward(event) {
    setTimeout(() => {
      this.updateCurrentFocus();
    }, 0);
  }

  /**
   * Update current focus tracking
   */
  updateCurrentFocus() {
    const activeElement = document.activeElement;
    if (activeElement?.classList.contains('ems-term')) {
      this.currentFocusedTerm = activeElement;
      this.currentIndex = this.highlightedTerms.indexOf(activeElement);
    }
  }

  /**
   * Focus the next highlighted term
   */
  focusNextTerm() {
    this.updateTermsList();

    if (this.highlightedTerms.length === 0) {
      return;
    }

    this.currentIndex++;
    if (this.currentIndex >= this.highlightedTerms.length) {
      this.currentIndex = 0;
    }

    this.focusTermAtIndex(this.currentIndex);
  }

  /**
   * Focus the previous highlighted term
   */
  focusPreviousTerm() {
    this.updateTermsList();

    if (this.highlightedTerms.length === 0) {
      return;
    }

    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = this.highlightedTerms.length - 1;
    }

    this.focusTermAtIndex(this.currentIndex);
  }

  /**
   * Focus a term at a specific index
   * @param {number} index
   */
  focusTermAtIndex(index) {
    const term = this.highlightedTerms[index];
    if (term) {
      term.focus();
      this.currentFocusedTerm = term;

      // Scroll into view if needed
      term.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  /**
   * Activate (click) a term
   * @param {HTMLElement} term
   */
  activateTerm(term) {
    if (!term) {
      return;
    }

    const termIds = term.dataset.termIds?.split(',') || [];
    if (termIds.length > 0) {
      const rect = term.getBoundingClientRect();
      this.onShowPopup?.(termIds, rect.left, rect.bottom);
    }
  }

  /**
   * Check if element is an input-like element
   * @param {Element} element
   * @returns {boolean}
   */
  isInputElement(element) {
    const tagName = element.tagName?.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      element.isContentEditable
    );
  }

  /**
   * Get the number of highlighted terms
   * @returns {number}
   */
  getTermCount() {
    this.updateTermsList();
    return this.highlightedTerms.length;
  }
}

/**
 * Create a keyboard handler instance
 * @param {Object} options
 * @returns {KeyboardHandler}
 */
export function createKeyboardHandler(options) {
  return new KeyboardHandler(options);
}

export default KeyboardHandler;
