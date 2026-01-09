/**
 * Unit tests for Aho-Corasick algorithm and TermMatcher
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AhoCorasick, TermMatcher } from '../../src/content/term-matcher.js';

describe('AhoCorasick', () => {
  let ac;

  beforeEach(() => {
    ac = new AhoCorasick();
  });

  describe('addPattern', () => {
    it('should add a simple pattern', () => {
      ac.addPattern('test');
      ac.build();
      const results = ac.search('this is a test');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ start: 10, end: 14, pattern: 'test' });
    });

    it('should handle empty pattern', () => {
      ac.addPattern('');
      ac.addPattern('test');
      ac.build();
      const results = ac.search('test');
      expect(results).toHaveLength(1);
    });

    it('should convert patterns to lowercase', () => {
      ac.addPattern('TEST');
      ac.build();
      const results = ac.search('this is a test');
      expect(results).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should find multiple patterns', () => {
      ac.addPattern('he');
      ac.addPattern('she');
      ac.addPattern('his');
      ac.addPattern('hers');
      ac.build();

      const results = ac.search('ushers');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.pattern === 'she')).toBe(true);
      expect(results.some(r => r.pattern === 'he')).toBe(true);
    });

    it('should find overlapping patterns', () => {
      ac.addPattern('abc');
      ac.addPattern('bcd');
      ac.build();

      const results = ac.search('abcd');
      expect(results).toHaveLength(2);
    });

    it('should find pattern at start', () => {
      ac.addPattern('start');
      ac.build();

      const results = ac.search('start of text');
      expect(results).toHaveLength(1);
      expect(results[0].start).toBe(0);
    });

    it('should find pattern at end', () => {
      ac.addPattern('end');
      ac.build();

      const results = ac.search('at the end');
      expect(results).toHaveLength(1);
      expect(results[0].end).toBe(10);
    });

    it('should return empty array for no matches', () => {
      ac.addPattern('xyz');
      ac.build();

      const results = ac.search('abcdefg');
      expect(results).toHaveLength(0);
    });

    it('should find same pattern multiple times', () => {
      ac.addPattern('the');
      ac.build();

      const results = ac.search('the quick brown fox jumps over the lazy dog');
      expect(results).toHaveLength(2);
    });
  });

  describe('medical term patterns', () => {
    it('should find medical abbreviations', () => {
      ac.addPattern('CHF');
      ac.addPattern('MI');
      ac.addPattern('HTN');
      ac.build();

      const results = ac.search('Patient has history of chf and htn');
      expect(results.some(r => r.pattern === 'chf')).toBe(true);
      expect(results.some(r => r.pattern === 'htn')).toBe(true);
    });

    it('should find multi-word terms', () => {
      ac.addPattern('heart failure');
      ac.addPattern('myocardial infarction');
      ac.build();

      const results = ac.search('Diagnosed with heart failure');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('heart failure');
    });
  });
});

describe('TermMatcher', () => {
  let matcher;
  let mockIndex;

  beforeEach(() => {
    mockIndex = {
      patterns: new Map([
        ['hypertension', ['hypertension-001']],
        ['htn', ['hypertension-001']],
        ['heart failure', ['heart-failure-001']],
        ['chf', ['heart-failure-001']],
        ['as', ['aortic-stenosis']], // Short pattern to test word boundary
      ]),
      patternMetadata: new Map([
        ['hypertension', { isCaseSensitive: false, originalCase: null }],
        ['htn', { isCaseSensitive: true, originalCase: 'HTN' }],
        ['heart failure', { isCaseSensitive: false, originalCase: null }],
        ['chf', { isCaseSensitive: true, originalCase: 'CHF' }],
        ['as', { isCaseSensitive: false, originalCase: null }],
      ]),

      getAllPatterns() {
        return Array.from(this.patterns.keys());
      },
      getTermIdsForPattern(pattern) {
        return this.patterns.get(pattern.toLowerCase()) || [];
      },
      getPatternMetadata(pattern) {
        return this.patternMetadata.get(pattern.toLowerCase()) || null;
      },
    };

    matcher = new TermMatcher(mockIndex);
  });

  describe('findTerms', () => {
    it('should find terms in text', () => {
      const results = matcher.findTerms('Patient has hypertension');
      expect(results).toHaveLength(1);
      expect(results[0].termIds).toContain('hypertension-001');
    });

    it('should respect word boundaries', () => {
      // "as" should not match inside "was" or "class"
      const results = matcher.findTerms('He was in class');
      expect(results).toHaveLength(0);
    });

    it('should exclude common short patterns like "as"', () => {
      // "as" is in EXCLUDED_PATTERNS to avoid false positives
      const results = matcher.findTerms('Diagnosed as severe');
      expect(results.some(r => r.termIds.includes('aortic-stenosis'))).toBe(false);
    });

    it('should check case sensitivity for abbreviations', () => {
      // "chf" should only match if case is correct (CHF)
      const resultsLower = matcher.findTerms('patient with chf');
      const resultsUpper = matcher.findTerms('patient with CHF');

      // Lower case should not match since CHF is case-sensitive
      expect(resultsLower).toHaveLength(0);
      // Upper case should match
      expect(resultsUpper).toHaveLength(1);
    });

    it('should find multiple terms', () => {
      const results = matcher.findTerms('Patient with hypertension and heart failure');
      expect(results).toHaveLength(2);
    });

    it('should remove overlapping matches', () => {
      // If we have overlapping patterns, longer one should win
      const overlappingIndex = {
        patterns: new Map([
          ['heart', ['heart']],
          ['heart failure', ['heart-failure']],
        ]),
        patternMetadata: new Map(),
        getAllPatterns() {
          return Array.from(this.patterns.keys()).sort((a, b) => b.length - a.length);
        },
        getTermIdsForPattern(p) {
          return this.patterns.get(p.toLowerCase()) || [];
        },
        getPatternMetadata() {
          return null;
        },
      };

      const m = new TermMatcher(overlappingIndex);
      const results = m.findTerms('Diagnosed with heart failure');

      // Should only have "heart failure", not separate "heart"
      expect(results).toHaveLength(1);
      expect(results[0].termIds).toContain('heart-failure');
    });

    it('should handle empty text', () => {
      const results = matcher.findTerms('');
      expect(results).toHaveLength(0);
    });

    it('should handle text with no matches', () => {
      const results = matcher.findTerms('The quick brown fox');
      expect(results).toHaveLength(0);
    });
  });
});
