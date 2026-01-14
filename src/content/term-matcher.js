/**
 * Term Matcher for EnterMedSchool Glossary
 * Implements Aho-Corasick algorithm for efficient multi-pattern matching.
 * Ported from Python implementation in the Anki addon.
 * 
 * @module term-matcher
 */

import { EXCLUDED_PATTERNS, BETA_TERM_LEVELS } from '../shared/constants.js';

/**
 * Node in the Aho-Corasick automaton
 */
class AhoCorasickNode {
  constructor() {
    /** @type {Map<string, AhoCorasickNode>} */
    this.children = new Map();
    /** @type {AhoCorasickNode|null} */
    this.fail = null;
    /** @type {string[]} */
    this.output = [];
    /** @type {number} */
    this.depth = 0;
  }
}

/**
 * Aho-Corasick automaton for multi-pattern string matching.
 * Finds all occurrences of multiple patterns in O(n + m + z) time,
 * where n = text length, m = total pattern length, z = number of matches.
 */
export class AhoCorasick {
  constructor() {
    /** @type {AhoCorasickNode} */
    this.root = new AhoCorasickNode();
    /** @type {boolean} */
    this._built = false;
  }

  /**
   * Add a pattern to the automaton
   * @param {string} pattern - Pattern to add
   */
  addPattern(pattern) {
    if (!pattern) {
      return;
    }

    let node = this.root;
    const lowerPattern = pattern.toLowerCase();

    for (const char of lowerPattern) {
      if (!node.children.has(char)) {
        const newNode = new AhoCorasickNode();
        newNode.depth = node.depth + 1;
        node.children.set(char, newNode);
      }
      node = node.children.get(char);
    }

    node.output.push(lowerPattern);
    this._built = false;
  }

  /**
   * Add multiple patterns at once
   * @param {string[]} patterns - Patterns to add
   */
  addPatterns(patterns) {
    for (const pattern of patterns) {
      this.addPattern(pattern);
    }
  }

  /**
   * Build failure links using BFS
   */
  build() {
    if (this._built) {
      return;
    }

    const queue = [];

    // Initialize failure links for depth-1 nodes
    for (const [, child] of this.root.children) {
      child.fail = this.root;
      queue.push(child);
    }

    // BFS to build failure links
    while (queue.length > 0) {
      const current = queue.shift();

      for (const [char, child] of current.children) {
        queue.push(child);

        // Follow failure links to find the longest proper suffix
        let fail = current.fail;
        while (fail && !fail.children.has(char)) {
          fail = fail.fail;
        }

        child.fail = fail ? fail.children.get(char) : this.root;

        // If child.fail is undefined, set to root
        if (!child.fail) {
          child.fail = this.root;
        }

        // Merge output from failure link
        child.output = [...child.output, ...child.fail.output];
      }
    }

    this._built = true;
  }

  /**
   * Search for all pattern occurrences in text
   * @param {string} text - Text to search in
   * @returns {Array<{start: number, end: number, pattern: string}>} Matches
   */
  search(text) {
    if (!this._built) {
      this.build();
    }

    const results = [];
    let node = this.root;
    const lowerText = text.toLowerCase();

    for (let i = 0; i < lowerText.length; i++) {
      const char = lowerText[i];

      // Follow failure links while char not found
      while (node && !node.children.has(char)) {
        node = node.fail;
      }

      if (!node) {
        node = this.root;
        continue;
      }

      node = node.children.get(char);

      // Report all patterns ending at this position
      for (const pattern of node.output) {
        const start = i - pattern.length + 1;
        results.push({ start, end: i + 1, pattern });
      }
    }

    return results;
  }
}

/**
 * High-level term matcher using Aho-Corasick.
 * Handles word boundaries, case sensitivity, and filtering.
 */
// Level hierarchy - higher index means more advanced
const LEVEL_HIERARCHY = {
  'premed': 0,
  'medschool': 1,
  'all': 2,
};

export class TermMatcher {
  /**
   * @param {Object} index - Term index with patterns and metadata
   */
  constructor(index) {
    /** @type {Object} */
    this.index = index;
    /** @type {AhoCorasick} */
    this.automaton = new AhoCorasick();
    /** @type {boolean} */
    this._initialized = false;
    /** @type {string} */
    this.userLevel = 'medschool';
    /** @type {boolean} */
    this.enableBetaFeatures = false;
  }

  /**
   * Set the user level for filtering
   * @param {string} level - 'premed', 'medschool', or 'all'
   */
  setUserLevel(level) {
    this.userLevel = level || 'medschool';
    console.info('[EMS] User level set to:', this.userLevel);
  }

  /**
   * Set whether beta features are enabled
   * @param {boolean} enabled
   */
  setBetaFeatures(enabled) {
    this.enableBetaFeatures = enabled;
  }

  /**
   * Initialize the automaton from index patterns
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    const patterns = this.index.getAllPatterns();
    this.automaton.addPatterns(patterns);
    this.automaton.build();
    this._initialized = true;
  }

  /**
   * Find all term occurrences in text
   * @param {string} text - Plain text to search (HTML already stripped)
   * @returns {Array<{start: number, end: number, termIds: string[]}>} Matches
   */
  findTerms(text) {
    if (!this._initialized) {
      this.initialize();
    }

    if (!text) {
      return [];
    }

    // Get all raw matches
    const rawMatches = this.automaton.search(text);

    if (rawMatches.length === 0) {
      return [];
    }

    // Filter matches: word boundaries + case sensitivity
    const validMatches = [];

    for (const { start, end, pattern } of rawMatches) {
      // Skip excluded patterns
      if (EXCLUDED_PATTERNS.includes(pattern)) {
        continue;
      }

      // Check word boundaries first (fast check)
      if (!this._isWordBoundaryMatch(text, start, end)) {
        continue;
      }

      // Check case sensitivity (for short abbreviations)
      if (!this._isValidCaseMatch(text, start, end, pattern)) {
        continue;
      }

      const termIds = this.index.getTermIdsForPattern(pattern);
      if (termIds && termIds.length > 0) {
        // Filter term IDs based on user level
        const filteredTermIds = this._filterByLevel(termIds);
        if (filteredTermIds.length > 0) {
          validMatches.push({ start, end, pattern, termIds: filteredTermIds });
        }
      }
    }

    // Remove overlapping matches (keep longer ones)
    const nonOverlapping = this._removeOverlaps(validMatches);

    // Convert to output format
    return nonOverlapping.map(({ start, end, termIds }) => ({
      start,
      end,
      termIds,
    }));
  }

  /**
   * Filter term IDs based on user level and beta features
   * @private
   * @param {string[]} termIds
   * @returns {string[]}
   */
  _filterByLevel(termIds) {
    const filtered = termIds.filter(termId => {
      const termMeta = this.index.terms?.get(termId);
      if (!termMeta) {
        console.debug('[EMS] No metadata for term:', termId);
        return true; // If no metadata, include it
      }

      const termLevel = termMeta.level || 'medschool';

      // Filter out beta term types when beta features are disabled
      if (BETA_TERM_LEVELS.includes(termLevel) && !this.enableBetaFeatures) {
        return false;
      }

      // Filter by user level
      // 'all' shows medschool terms (not literally all terms)
      const effectiveLevel = this.userLevel === 'all' ? 'medschool' : this.userLevel;
      const userLevelValue = LEVEL_HIERARCHY[effectiveLevel] ?? 1;
      const termLevelValue = LEVEL_HIERARCHY[termLevel] ?? 1;

      // Only include terms that match the user's effective level
      if (termLevelValue !== userLevelValue) {
        return false;
      }

      return true;
    });
    
    return filtered;
  }

  /**
   * Check if a match satisfies case-sensitivity requirements
   * @private
   */
  _isValidCaseMatch(text, start, end, pattern) {
    // Get pattern metadata from the index
    const patternMeta = this.index.getPatternMetadata(pattern);

    if (!patternMeta) {
      // No metadata means allow match
      return true;
    }

    if (!patternMeta.isCaseSensitive) {
      // Pattern is not case-sensitive - allow match
      return true;
    }

    // Pattern IS case-sensitive - check if text matches original case
    const originalCase = patternMeta.originalCase;
    if (!originalCase) {
      return true;
    }

    const matchedText = text.slice(start, end);

    // Exact case match required
    return matchedText === originalCase;
  }

  /**
   * Check if match is at word boundaries
   * Prevents matching "as" inside "was" or "class"
   * @private
   */
  _isWordBoundaryMatch(text, start, end) {
    // Check start boundary
    if (start > 0) {
      const prevChar = text[start - 1];
      if (this._isWordChar(prevChar)) {
        return false;
      }
    }

    // Check end boundary
    if (end < text.length) {
      const nextChar = text[end];
      if (this._isWordChar(nextChar)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if character is a word character (alphanumeric)
   * @private
   */
  _isWordChar(char) {
    return /[a-zA-Z0-9]/.test(char);
  }

  /**
   * Remove overlapping matches, keeping longer ones
   * @private
   */
  _removeOverlaps(matches) {
    if (matches.length === 0) {
      return [];
    }

    // Sort by start position, then by length (descending)
    const sorted = [...matches].sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return (b.end - b.start) - (a.end - a.start);
    });

    const result = [];
    let lastEnd = -1;

    for (const match of sorted) {
      // Skip if overlapping with previous match
      if (match.start < lastEnd) {
        continue;
      }

      result.push(match);
      lastEnd = match.end;
    }

    return result;
  }

  /**
   * Get term IDs at a specific text position
   * @param {string} text - Text to search
   * @param {number} position - Position in text
   * @returns {string[]|null} Term IDs at position
   */
  getTermIdsAtPosition(text, position) {
    const matches = this.findTerms(text);

    for (const { start, end, termIds } of matches) {
      if (start <= position && position < end) {
        return termIds;
      }
    }

    return null;
  }
}

/**
 * Create a new TermMatcher instance
 * @param {Object} index - Term index
 * @returns {TermMatcher}
 */
export function createTermMatcher(index) {
  return new TermMatcher(index);
}

export default TermMatcher;
