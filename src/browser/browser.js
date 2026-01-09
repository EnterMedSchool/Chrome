/**
 * Term Browser for EMS Medical Glossary
 * Browse all terms organized by category.
 * 
 * @module browser
 */

import { MESSAGE_TYPES, TAG_COLORS } from '../shared/constants.js';

// State
let allTerms = [];
let categories = new Map();
let currentCategory = '__all__';
let currentFilter = '';
let selectedTermId = null;
let selectedIndex = -1;
let filteredTerms = [];

// DOM Elements
let categoryList;
let termList;
let termCount;
let currentCategoryLabel;
let filterInput;
let emptyState;
let loadingState;
let termPreview;
let previewContent;
let previewPlaceholder;
let totalTermsEl;
let totalCategoriesEl;

/**
 * Initialize the term browser
 */
async function init() {
  // Get DOM references
  categoryList = document.getElementById('categoryList');
  termList = document.getElementById('termList');
  termCount = document.getElementById('termCount');
  currentCategoryLabel = document.getElementById('currentCategory');
  filterInput = document.getElementById('filterInput');
  emptyState = document.getElementById('emptyState');
  loadingState = document.getElementById('loadingState');
  termPreview = document.getElementById('termPreview');
  previewContent = document.getElementById('previewContent');
  previewPlaceholder = termPreview.querySelector('.preview-placeholder');
  totalTermsEl = document.getElementById('totalTerms');
  totalCategoriesEl = document.getElementById('totalCategories');
  
  // Set up event listeners
  setupEventListeners();
  
  // Load terms
  await loadTerms();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Filter input
  filterInput.addEventListener('input', debounce(handleFilterChange, 150));
  
  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Load terms from the service worker
 */
async function loadTerms() {
  loadingState.style.display = 'flex';
  emptyState.style.display = 'none';
  
  try {
    // Get all terms by searching with empty query (returns all)
    const response = await fetch(chrome.runtime.getURL('data/terms-bundle.json'));
    if (response.ok) {
      allTerms = await response.json();
    } else {
      console.error('Failed to load terms');
      allTerms = [];
    }
    
    // Build categories
    buildCategories();
    
    // Render UI
    renderCategories();
    renderTerms();
    
    // Update footer stats
    totalTermsEl.textContent = allTerms.length;
    totalCategoriesEl.textContent = categories.size;
    
    loadingState.style.display = 'none';
  } catch (error) {
    console.error('Failed to load terms:', error);
    loadingState.style.display = 'none';
    emptyState.style.display = 'flex';
  }
}

/**
 * Build categories from terms
 */
function buildCategories() {
  categories.clear();
  
  for (const term of allTerms) {
    const tag = term.primary_tag || 'other';
    if (!categories.has(tag)) {
      categories.set(tag, []);
    }
    categories.get(tag).push(term);
  }
}

/**
 * Render category list
 */
function renderCategories() {
  // Build category items HTML
  let html = `
    <li class="category-item${currentCategory === '__all__' ? ' active' : ''}" data-category="__all__">
      <span class="category-icon">📚</span>
      <span class="category-name">All Terms</span>
      <span class="category-count">${allTerms.length}</span>
    </li>
  `;
  
  // Sort categories by count (descending)
  const sortedCategories = Array.from(categories.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  for (const [tag, terms] of sortedCategories) {
    const tagInfo = TAG_COLORS[tag] || { icon: '📚', accent: '#6C5CE7' };
    const displayName = tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isActive = currentCategory === tag;
    
    html += `
      <li class="category-item${isActive ? ' active' : ''}" data-category="${escapeHTML(tag)}">
        <span class="category-icon">${tagInfo.icon}</span>
        <span class="category-name">${escapeHTML(displayName)}</span>
        <span class="category-count">${terms.length}</span>
      </li>
    `;
  }
  
  categoryList.innerHTML = html;
  
  // Add click handlers
  categoryList.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      const category = item.dataset.category;
      selectCategory(category);
    });
  });
}

/**
 * Select a category
 * @param {string} category
 */
function selectCategory(category) {
  currentCategory = category;
  selectedTermId = null;
  selectedIndex = -1;
  
  // Update active state
  categoryList.querySelectorAll('.category-item').forEach(item => {
    item.classList.toggle('active', item.dataset.category === category);
  });
  
  // Update header
  if (category === '__all__') {
    currentCategoryLabel.textContent = 'All Terms';
  } else {
    const displayName = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    currentCategoryLabel.textContent = displayName;
  }
  
  // Re-render terms
  renderTerms();
  
  // Hide preview
  hidePreview();
}

/**
 * Render term list
 */
function renderTerms() {
  // Get terms for current category
  let terms;
  if (currentCategory === '__all__') {
    terms = allTerms;
  } else {
    terms = categories.get(currentCategory) || [];
  }
  
  // Apply filter
  if (currentFilter) {
    const filterLower = currentFilter.toLowerCase();
    terms = terms.filter(term => {
      const name = (term.names?.[0] || term.id || '').toLowerCase();
      const definition = (term.definition || '').toLowerCase();
      return name.includes(filterLower) || definition.includes(filterLower);
    });
  }
  
  // Sort alphabetically
  terms = terms.sort((a, b) => {
    const nameA = (a.names?.[0] || a.id || '').toLowerCase();
    const nameB = (b.names?.[0] || b.id || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  filteredTerms = terms;
  
  // Update count
  termCount.textContent = `${terms.length} term${terms.length !== 1 ? 's' : ''}`;
  
  // Show empty state if no terms
  if (terms.length === 0) {
    termList.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Build term items HTML
  const html = terms.map((term, index) => {
    const termId = term.id || term.names?.[0]?.toLowerCase().replace(/\s+/g, '-');
    const name = term.names?.[0] || termId;
    const primaryTag = term.primary_tag || '';
    const tagInfo = TAG_COLORS[primaryTag] || { icon: '📚', accent: '#6C5CE7' };
    const displayTag = primaryTag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isSelected = selectedTermId === termId;
    
    return `
      <li class="term-item${isSelected ? ' selected' : ''}" data-term-id="${escapeHTML(termId)}" data-index="${index}">
        <span class="term-icon">${tagInfo.icon}</span>
        <span class="term-name">${escapeHTML(name)}</span>
        <span class="term-tag" style="background: ${tagInfo.accent}">${escapeHTML(displayTag)}</span>
      </li>
    `;
  }).join('');
  
  termList.innerHTML = html;
  
  // Add click handlers
  termList.querySelectorAll('.term-item').forEach(item => {
    item.addEventListener('click', () => {
      const termId = item.dataset.termId;
      const index = parseInt(item.dataset.index, 10);
      selectTerm(termId, index);
    });
    
    item.addEventListener('dblclick', () => {
      const termId = item.dataset.termId;
      openTermPopup(termId);
    });
  });
}

/**
 * Select a term
 * @param {string} termId
 * @param {number} index
 */
function selectTerm(termId, index) {
  selectedTermId = termId;
  selectedIndex = index;
  
  // Update selected state
  termList.querySelectorAll('.term-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.termId === termId);
  });
  
  // Show preview
  showPreview(termId);
}

/**
 * Show term preview
 * @param {string} termId
 */
function showPreview(termId) {
  const term = filteredTerms.find(t => (t.id || t.names?.[0]?.toLowerCase().replace(/\s+/g, '-')) === termId);
  if (!term) {
    hidePreview();
    return;
  }
  
  const name = term.names?.[0] || termId;
  const primaryTag = term.primary_tag || '';
  const tagInfo = TAG_COLORS[primaryTag] || { icon: '📚', accent: '#6C5CE7' };
  const displayTag = primaryTag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const definition = term.definition || 'No definition available.';
  const whyItMatters = term.why_it_matters || '';
  
  let tagsHTML = `<span class="preview-tag" style="background: ${tagInfo.accent}">${escapeHTML(displayTag)}</span>`;
  if (term.tags?.length > 0) {
    for (const tag of term.tags.slice(0, 3)) {
      if (tag !== primaryTag) {
        const info = TAG_COLORS[tag] || { accent: '#6C5CE7' };
        const display = tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        tagsHTML += `<span class="preview-tag" style="background: ${info.accent}">${escapeHTML(display)}</span>`;
      }
    }
  }
  
  let sectionsHTML = `
    <div class="preview-section">
      <div class="preview-section-title">📖 Definition</div>
      <div class="preview-section-content">${escapeHTML(definition)}</div>
    </div>
  `;
  
  if (whyItMatters) {
    sectionsHTML += `
      <div class="preview-section">
        <div class="preview-section-title">💡 Why It Matters</div>
        <div class="preview-section-content">${escapeHTML(typeof whyItMatters === 'string' ? whyItMatters : whyItMatters[0] || '')}</div>
      </div>
    `;
  }
  
  previewContent.innerHTML = `
    <div class="preview-header">
      <div class="preview-title">
        <span>${tagInfo.icon}</span>
        <span>${escapeHTML(name)}</span>
      </div>
      <div class="preview-tags">${tagsHTML}</div>
    </div>
    <div class="preview-body">
      ${sectionsHTML}
    </div>
    <div class="preview-actions">
      <button class="preview-btn" data-term-id="${escapeHTML(termId)}">
        View Full Details →
      </button>
    </div>
  `;
  
  // Add click handler for the button
  previewContent.querySelector('.preview-btn').addEventListener('click', () => {
    openTermPopup(termId);
  });
  
  previewPlaceholder.style.display = 'none';
  previewContent.style.display = 'flex';
}

/**
 * Hide preview
 */
function hidePreview() {
  previewPlaceholder.style.display = 'flex';
  previewContent.style.display = 'none';
}

/**
 * Open term in a popup window or communicate with extension
 * @param {string} termId
 */
async function openTermPopup(termId) {
  // Try to open in current tab's popup
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_TERM_POPUP',
        payload: { termId },
      });
    }
  } catch (error) {
    // If content script isn't available, show an alert
    console.log('Could not open popup in current tab');
    alert(`Term: ${termId}\n\nOpen a webpage and click on a highlighted term to see the full popup.`);
  }
}

/**
 * Handle filter input change
 */
function handleFilterChange(e) {
  currentFilter = e.target.value.trim();
  selectedTermId = null;
  selectedIndex = -1;
  renderTerms();
  hidePreview();
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e
 */
function handleKeydown(e) {
  // Don't interfere if typing in input
  if (document.activeElement === filterInput && e.key !== 'Escape') {
    return;
  }
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      navigateTerms(1);
      break;
      
    case 'ArrowUp':
      e.preventDefault();
      navigateTerms(-1);
      break;
      
    case 'Enter':
      e.preventDefault();
      if (selectedTermId) {
        openTermPopup(selectedTermId);
      }
      break;
      
    case 'Escape':
      e.preventDefault();
      if (document.activeElement === filterInput) {
        filterInput.blur();
        filterInput.value = '';
        currentFilter = '';
        renderTerms();
      }
      break;
      
    case '/':
      if (document.activeElement !== filterInput) {
        e.preventDefault();
        filterInput.focus();
      }
      break;
  }
}

/**
 * Navigate terms with keyboard
 * @param {number} direction - 1 for down, -1 for up
 */
function navigateTerms(direction) {
  if (filteredTerms.length === 0) return;
  
  let newIndex = selectedIndex + direction;
  
  if (newIndex < 0) {
    newIndex = filteredTerms.length - 1;
  } else if (newIndex >= filteredTerms.length) {
    newIndex = 0;
  }
  
  const term = filteredTerms[newIndex];
  const termId = term.id || term.names?.[0]?.toLowerCase().replace(/\s+/g, '-');
  
  selectTerm(termId, newIndex);
  
  // Scroll into view
  const items = termList.querySelectorAll('.term-item');
  if (items[newIndex]) {
    items[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

/**
 * Debounce function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
