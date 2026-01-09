/**
 * Unit tests for DOM Highlighter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Highlighter } from '../../src/content/highlighter.js';

describe('Highlighter', () => {
  let highlighter;
  let mockMatcher;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div id="test-content"></div>';

    // Create mock matcher
    mockMatcher = {
      findTerms: vi.fn(() => []),
      initialize: vi.fn(),
    };

    highlighter = new Highlighter(mockMatcher);
  });

  afterEach(() => {
    highlighter.stop();
  });

  describe('createHighlightedFragment', () => {
    it('should create fragment with highlighted terms', () => {
      const text = 'The patient has hypertension and diabetes';
      const matches = [
        { start: 16, end: 28, termIds: ['hypertension-001'] },
        { start: 33, end: 41, termIds: ['diabetes-001'] },
      ];

      const fragment = highlighter.createHighlightedFragment(text, matches);

      const container = document.createElement('div');
      container.appendChild(fragment);

      expect(container.innerHTML).toContain('ems-term');
      expect(container.querySelectorAll('.ems-term')).toHaveLength(2);
    });

    it('should set correct data attributes', () => {
      const text = 'Has CHF';
      const matches = [{ start: 4, end: 7, termIds: ['chf-001', 'chf-002'] }];

      const fragment = highlighter.createHighlightedFragment(text, matches);

      const container = document.createElement('div');
      container.appendChild(fragment);

      const term = container.querySelector('.ems-term');
      expect(term.dataset.termIds).toBe('chf-001,chf-002');
    });

    it('should add multi class for multiple term IDs', () => {
      const text = 'Has CHF';
      const matches = [{ start: 4, end: 7, termIds: ['chf-001', 'chf-002'] }];

      const fragment = highlighter.createHighlightedFragment(text, matches);

      const container = document.createElement('div');
      container.appendChild(fragment);

      const term = container.querySelector('.ems-term');
      expect(term.classList.contains('ems-term--multi')).toBe(true);
    });

    it('should set ARIA attributes for accessibility', () => {
      const text = 'Has hypertension';
      const matches = [{ start: 4, end: 16, termIds: ['htn-001'] }];

      const fragment = highlighter.createHighlightedFragment(text, matches);

      const container = document.createElement('div');
      container.appendChild(fragment);

      const term = container.querySelector('.ems-term');
      expect(term.getAttribute('role')).toBe('button');
      expect(term.getAttribute('tabindex')).toBe('0');
      expect(term.getAttribute('aria-haspopup')).toBe('dialog');
      expect(term.getAttribute('aria-label')).toContain('hypertension');
    });
  });

  describe('shouldSkipNode', () => {
    it('should skip script elements', () => {
      const script = document.createElement('script');
      expect(highlighter.shouldSkipNode(script)).toBe(true);
    });

    it('should skip style elements', () => {
      const style = document.createElement('style');
      expect(highlighter.shouldSkipNode(style)).toBe(true);
    });

    it('should skip textarea elements', () => {
      const textarea = document.createElement('textarea');
      expect(highlighter.shouldSkipNode(textarea)).toBe(true);
    });

    it('should skip input elements', () => {
      const input = document.createElement('input');
      expect(highlighter.shouldSkipNode(input)).toBe(true);
    });

    it('should skip code elements', () => {
      const code = document.createElement('code');
      expect(highlighter.shouldSkipNode(code)).toBe(true);
    });

    it('should skip contenteditable elements', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      expect(highlighter.shouldSkipNode(div)).toBe(true);
    });

    it('should skip already highlighted terms', () => {
      const span = document.createElement('span');
      span.classList.add('ems-term');
      expect(highlighter.shouldSkipNode(span)).toBe(true);
    });

    it('should skip popup container', () => {
      const popup = document.createElement('div');
      popup.classList.add('ems-popup-container');
      document.body.appendChild(popup);

      const inner = document.createElement('p');
      popup.appendChild(inner);

      expect(highlighter.shouldSkipNode(inner)).toBe(true);
    });

    it('should not skip regular paragraph', () => {
      const p = document.createElement('p');
      expect(highlighter.shouldSkipNode(p)).toBe(false);
    });
  });

  describe('setStyle', () => {
    it('should update highlight style', () => {
      highlighter.setStyle('background', '#ff0000');
      expect(highlighter.highlightStyle).toBe('background');
      expect(highlighter.highlightColor).toBe('#ff0000');
    });

    it('should set CSS variable', () => {
      highlighter.setStyle('underline', '#00ff00');
      const color = document.documentElement.style.getPropertyValue('--ems-highlight-color');
      expect(color).toBe('#00ff00');
    });
  });

  describe('removeHighlights', () => {
    it('should remove all highlight spans', () => {
      document.body.innerHTML = `
        <p>The <span class="ems-term">term</span> here</p>
        <p>Another <span class="ems-term">term</span> there</p>
      `;

      highlighter.removeHighlights();

      expect(document.querySelectorAll('.ems-term')).toHaveLength(0);
      expect(document.body.textContent).toContain('The term here');
      expect(document.body.textContent).toContain('Another term there');
    });
  });

  describe('getHighlightCount', () => {
    it('should return correct count', () => {
      document.body.innerHTML = `
        <p><span class="ems-term">A</span></p>
        <p><span class="ems-term">B</span></p>
        <p><span class="ems-term">C</span></p>
      `;

      expect(highlighter.getHighlightCount()).toBe(3);
    });

    it('should return 0 for no highlights', () => {
      document.body.innerHTML = '<p>No highlights here</p>';
      expect(highlighter.getHighlightCount()).toBe(0);
    });
  });
});
