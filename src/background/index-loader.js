/**
 * Index Loader for EMS Medical Glossary
 * Loads term data and builds an in-memory index for fast pattern matching.
 * All data is bundled with the extension (no remote fetching).
 * 
 * @module index-loader
 */

import { EXCLUDED_PATTERNS, TAG_COLORS, PERFORMANCE } from '../shared/constants.js';
import * as logger from '../shared/logger.js';

// Import all term data statically (bundled with extension)
// This will be populated by the build process
let termsData = null;
let tagsData = null;

/**
 * In-memory glossary index for fast term lookup
 */
export class GlossaryIndex {
  constructor() {
    /** @type {Map<string, string[]>} pattern -> [term_ids] */
    this.patterns = new Map();
    /** @type {Map<string, Object>} pattern -> {isCaseSensitive, originalCase} */
    this.patternMetadata = new Map();
    /** @type {Map<string, Object>} term_id -> metadata */
    this.terms = new Map();
    /** @type {Map<string, Object>} tag_id -> {accent, icon} */
    this.tags = new Map();
    /** @type {string[]} Sorted by length (longest first) */
    this.allPatterns = [];
    /** @type {boolean} */
    this._loaded = false;
  }

  isLoaded() {
    return this._loaded;
  }

  /**
   * Get all patterns sorted by length (longest first for matching priority)
   * @returns {string[]}
   */
  getAllPatterns() {
    return this.allPatterns;
  }

  /**
   * Get term IDs that match a pattern
   * @param {string} pattern
   * @returns {string[]}
   */
  getTermIdsForPattern(pattern) {
    return this.patterns.get(pattern.toLowerCase()) || [];
  }

  /**
   * Get metadata for a pattern
   * @param {string} pattern
   * @returns {Object|null}
   */
  getPatternMetadata(pattern) {
    return this.patternMetadata.get(pattern.toLowerCase()) || null;
  }

  /**
   * Get term metadata by ID
   * @param {string} termId
   * @returns {Object|null}
   */
  getTermMetadata(termId) {
    return this.terms.get(termId) || null;
  }

  /**
   * Get full term content by ID
   * @param {string} termId
   * @returns {Object|null}
   */
  getTermContent(termId) {
    const meta = this.terms.get(termId);
    if (!meta) {
      return null;
    }
    return meta.fullContent || null;
  }

  /**
   * Get tag info (color and icon)
   * @param {string} tagId
   * @returns {Object}
   */
  getTagInfo(tagId) {
    return this.tags.get(tagId) || { accent: '#6C5CE7', icon: '📚' };
  }

  /**
   * Search terms by name, pattern, or definition
   * @param {string} query
   * @param {number} limit
   * @returns {Object[]}
   */
  searchTerms(query, limit = 50) {
    const queryLower = query.toLowerCase().trim();
    if (!queryLower) {
      return [];
    }

    const results = [];
    const seen = new Set();

    // First: exact pattern matches
    const exactTermIds = this.getTermIdsForPattern(queryLower);
    for (const termId of exactTermIds) {
      if (!seen.has(termId)) {
        const term = this.terms.get(termId);
        if (term) {
          results.push(term);
          seen.add(termId);
        }
      }
    }

    // Second: prefix matches on patterns
    for (const [pattern, termIds] of this.patterns) {
      if (pattern.startsWith(queryLower)) {
        for (const termId of termIds) {
          if (!seen.has(termId)) {
            const term = this.terms.get(termId);
            if (term) {
              results.push(term);
              seen.add(termId);
            }
          }
        }
      }
    }

    // Third: substring matches on names
    for (const [termId, term] of this.terms) {
      if (!seen.has(termId)) {
        const name = (term.name || '').toLowerCase();
        if (name.includes(queryLower)) {
          results.push(term);
          seen.add(termId);
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get all terms
   * @returns {Object[]}
   */
  getAllTerms() {
    return Array.from(this.terms.values());
  }

  /**
   * Get terms by tag
   * @param {string} tagId
   * @returns {Object[]}
   */
  getTermsByTag(tagId) {
    return Array.from(this.terms.values()).filter(
      term => term.primaryTag === tagId
    );
  }
}

// Singleton index instance
let _index = null;

/**
 * Normalize a pattern for matching
 * @param {string} pattern
 * @returns {string}
 */
function normalizePattern(pattern) {
  return pattern.toLowerCase().trim();
}

/**
 * Check if a pattern should be excluded
 * @param {string} pattern
 * @returns {boolean}
 */
function isPatternExcluded(pattern) {
  return EXCLUDED_PATTERNS.includes(pattern.toLowerCase().trim());
}

/**
 * Determine if a pattern should require case-sensitive matching
 * @param {string} pattern
 * @param {string} original
 * @param {boolean} isFromAbbr
 * @returns {{isCaseSensitive: boolean, originalCase: string|null}}
 */
function shouldBeCaseSensitive(pattern, original, isFromAbbr = false) {
  const normalized = pattern.toLowerCase().trim();
  const originalStripped = original.trim();

  // Skip patterns in the excluded list
  if (EXCLUDED_PATTERNS.includes(normalized)) {
    return { isCaseSensitive: false, originalCase: null };
  }

  // If it came from the abbr field, treat as case-sensitive
  if (isFromAbbr && normalized.length <= 6) {
    return { isCaseSensitive: true, originalCase: originalStripped.toUpperCase() };
  }

  // Short patterns (<=4 chars) with all uppercase should be case-sensitive
  if (normalized.length <= 4 && originalStripped === originalStripped.toUpperCase()) {
    return { isCaseSensitive: true, originalCase: originalStripped };
  }

  // Mixed case abbreviations like "HbA1c" should be case-sensitive
  if (normalized.length <= 6 && /[A-Z]/.test(originalStripped)) {
    // But only if it's not normal sentence-case
    if (!(originalStripped[0] === originalStripped[0].toUpperCase() && 
          originalStripped.slice(1) === originalStripped.slice(1).toLowerCase())) {
      return { isCaseSensitive: true, originalCase: originalStripped };
    }
  }

  // Short all-alpha patterns that look like abbreviations
  if (normalized.length >= 2 && normalized.length <= 4 && /^[a-z]+$/.test(normalized)) {
    const commonWords = new Set([
      'the', 'and', 'but', 'for', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'are', 'has', 'his', 'how',
      'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'boy',
      'did', 'get', 'let', 'put', 'say', 'she', 'too', 'use', 'red',
      'flu', 'arm', 'leg', 'ear', 'eye', 'jaw', 'lip', 'rib', 'gum',
      'fat', 'gut', 'hip', 'toe', 'wet', 'dry', 'hot', 'raw', 'old'
    ]);
    if (!commonWords.has(normalized)) {
      return { isCaseSensitive: true, originalCase: normalized.toUpperCase() };
    }
  }

  return { isCaseSensitive: false, originalCase: null };
}

/**
 * Extract patterns from a term
 * @param {Object} termData
 * @returns {Array<{pattern: string, original: string, isFromAbbr: boolean}>}
 */
function extractPatternsFromTerm(termData) {
  const patterns = [];
  const seen = new Set();

  // Explicit patterns field
  if (termData.patterns) {
    for (const p of termData.patterns) {
      const normalized = normalizePattern(p);
      if (normalized && normalized.length >= 2 && !seen.has(normalized)) {
        if (!isPatternExcluded(normalized)) {
          patterns.push({ pattern: normalized, original: p.trim(), isFromAbbr: false });
          seen.add(normalized);
        }
      }
    }
  }

  // Names
  if (termData.names) {
    for (const name of termData.names) {
      const normalized = normalizePattern(name);
      if (normalized && !seen.has(normalized)) {
        if (!isPatternExcluded(normalized)) {
          patterns.push({ pattern: normalized, original: name.trim(), isFromAbbr: false });
          seen.add(normalized);
        }
      }
    }
  }

  // Aliases
  if (termData.aliases) {
    for (const alias of termData.aliases) {
      const normalized = normalizePattern(alias);
      if (normalized && !seen.has(normalized)) {
        if (!isPatternExcluded(normalized)) {
          patterns.push({ pattern: normalized, original: alias.trim(), isFromAbbr: false });
          seen.add(normalized);
        }
      }
    }
  }

  // Abbreviations
  if (termData.abbr) {
    for (const abbr of termData.abbr) {
      const normalized = normalizePattern(abbr);
      if (normalized && normalized.length >= 2 && !seen.has(normalized)) {
        if (!isPatternExcluded(normalized)) {
          patterns.push({ pattern: normalized, original: abbr.trim(), isFromAbbr: true });
          seen.add(normalized);
        }
      }
    }
  }

  return patterns;
}

/**
 * Load a single term into the index
 * @param {GlossaryIndex} index
 * @param {Object} termData
 */
function loadTerm(index, termData) {
  const termId = termData.id || termData.names?.[0]?.toLowerCase().replace(/\s+/g, '-');
  if (!termId) {
    return;
  }

  // Store term metadata
  index.terms.set(termId, {
    id: termId,
    name: termData.names?.[0] || termId,
    primaryTag: termData.primary_tag || '',
    tags: termData.tags || [],
    definition: termData.definition || '',
    level: termData.level || 'medschool',
    fullContent: termData,
  });

  // Extract and store patterns
  const patterns = extractPatternsFromTerm(termData);
  for (const { pattern, original, isFromAbbr } of patterns) {
    // Add to patterns map
    if (!index.patterns.has(pattern)) {
      index.patterns.set(pattern, []);
    }
    const termIds = index.patterns.get(pattern);
    if (!termIds.includes(termId)) {
      termIds.push(termId);
    }

    // Store pattern metadata (only once per pattern)
    if (!index.patternMetadata.has(pattern)) {
      const { isCaseSensitive, originalCase } = shouldBeCaseSensitive(pattern, original, isFromAbbr);
      index.patternMetadata.set(pattern, { isCaseSensitive, originalCase });
    }
  }
}

/**
 * Load all terms into the index
 * @param {GlossaryIndex} index
 * @param {Object[]} terms
 */
function loadAllTerms(index, terms) {
  for (const term of terms) {
    loadTerm(index, term);
  }

  // Sort patterns by length (longest first)
  index.allPatterns = Array.from(index.patterns.keys()).sort(
    (a, b) => b.length - a.length
  );

  index._loaded = true;
}

/**
 * Load tags into the index
 * @param {GlossaryIndex} index
 * @param {Object} tags
 */
function loadTags(index, tags) {
  for (const [tagId, tagInfo] of Object.entries(tags)) {
    index.tags.set(tagId, {
      accent: tagInfo.accent || '#6C5CE7',
      icon: tagInfo.icon || '📚',
    });
  }
}

/**
 * Initialize the index from bundled data
 * @returns {Promise<GlossaryIndex>}
 */
export async function loadIndex() {
  if (_index && _index.isLoaded()) {
    return _index;
  }

  logger.info('Loading glossary index...');
  const startTime = performance.now();

  _index = new GlossaryIndex();

  try {
    // Load tags from constants (bundled)
    loadTags(_index, TAG_COLORS);

    // Load terms from bundled data
    // In production, this will be loaded from the data/terms-bundle.json
    const terms = await loadTermsData();
    loadAllTerms(_index, terms);

    const elapsed = (performance.now() - startTime).toFixed(2);
    logger.info(`Index loaded: ${_index.terms.size} terms, ${_index.patterns.size} patterns in ${elapsed}ms`);
  } catch (error) {
    logger.error('Failed to load index:', error);
    _index._loaded = false;
  }

  return _index;
}

/**
 * Load terms data from bundled JSON
 * @returns {Promise<Object[]>}
 */
async function loadTermsData() {
  // Try to load from bundled terms file
  try {
    const response = await fetch(chrome.runtime.getURL('data/terms-bundle.json'));
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    logger.warn('Failed to load terms-bundle.json, trying individual files:', error);
  }

  // Fallback: load individual term files
  // This is slower but works during development
  return await loadTermsFromIndividualFiles();
}

/**
 * Load terms from individual JSON files (development fallback)
 * @returns {Promise<Object[]>}
 */
async function loadTermsFromIndividualFiles() {
  const terms = [];
  
  // This will be populated during build with actual file list
  // For now, we'll load the terms-list.txt to get file names
  try {
    const response = await fetch(chrome.runtime.getURL('data/terms/tags.json'));
    if (response.ok) {
      // Tags loaded, now we need to find term files
      // In production, use terms-bundle.json instead
      logger.warn('Individual file loading not fully implemented - use terms-bundle.json');
    }
  } catch (error) {
    logger.error('Failed to load term files:', error);
  }

  return terms;
}

/**
 * Get the loaded index
 * @returns {GlossaryIndex}
 */
export function getIndex() {
  if (!_index || !_index.isLoaded()) {
    throw new Error('Index not loaded. Call loadIndex() first.');
  }
  return _index;
}

/**
 * Check if index is ready
 * @returns {boolean}
 */
export function isIndexReady() {
  return _index !== null && _index.isLoaded();
}

/**
 * Reset the index (for testing)
 */
export function resetIndex() {
  _index = null;
}

export default {
  loadIndex,
  getIndex,
  isIndexReady,
  GlossaryIndex,
};
