/**
 * Shared constants for EMS Medical Glossary
 * @module constants
 */

// Extension info
export const EXTENSION_NAME = 'EMS Medical Glossary';
export const EXTENSION_VERSION = '1.0.0';

// Storage keys
export const STORAGE_KEYS = {
  ENABLED: 'ems_enabled',
  HIGHLIGHT_STYLE: 'ems_highlight_style',
  HIGHLIGHT_COLOR: 'ems_highlight_color',
  THEME: 'ems_theme',
  USER_LEVEL: 'ems_user_level',
  DISABLED_SITES: 'ems_disabled_sites',
  ENABLED_SITES: 'ems_enabled_sites',
  FAVORITES: 'ems_favorites',
  STATS: 'ems_stats',
  ONBOARDING_COMPLETE: 'ems_onboarding_complete',
  FONT_SIZE: 'ems_font_size',
  HOVER_PREVIEW: 'ems_hover_preview',
  HOVER_DELAY: 'ems_hover_delay',
};

// Default settings
export const DEFAULT_SETTINGS = {
  enabled: true,
  highlightStyle: 'underline', // 'underline', 'background', 'bold'
  highlightColor: '#6C5CE7',
  theme: 'auto', // 'light', 'dark', 'auto'
  userLevel: 'medschool', // 'premed', 'medschool', 'all'
  disabledSites: [],
  enabledSites: [],
  fontSize: 100,
  hoverPreview: false,
  hoverDelay: 300,
};

// Colors from tags.json
export const TAG_COLORS = {
  anatomy: { accent: '#ef476f', icon: '🦴' },
  histology: { accent: '#d66b8a', icon: '🔬' },
  physiology: { accent: '#06d6a0', icon: '📈' },
  biochemistry: { accent: '#118ab2', icon: '🧪' },
  genetics: { accent: '#5a3cc4', icon: '🧬' },
  cell_bio: { accent: '#7a5af5', icon: '🧫' },
  pharmacology: { accent: '#f59e0b', icon: '💊' },
  toxicology: { accent: '#d97706', icon: '☣️' },
  micro_bacteria: { accent: '#60a5fa', icon: '🦠' },
  micro_virus: { accent: '#3b82f6', icon: '🧿' },
  micro_fungi: { accent: '#2563eb', icon: '🍄' },
  micro_parasite: { accent: '#1d4ed8', icon: '🪱' },
  immunology: { accent: '#14b8a6', icon: '🛡️' },
  pathology: { accent: '#9b2226', icon: '🩸' },
  heme_onc: { accent: '#b91c1c', icon: '🎗️' },
  neuro: { accent: '#8b5cf6', icon: '🧠' },
  cardio: { accent: '#ef4444', icon: '❤️' },
  pulm: { accent: '#0ea5e9', icon: '🫁' },
  renal: { accent: '#16a34a', icon: '🫘' },
  gi: { accent: '#fb923c', icon: '🧻' },
  endo: { accent: '#a855f7', icon: '🦋' },
  repro: { accent: '#ec4899', icon: '🫃' },
  msk_derm: { accent: '#22c55e', icon: '🏃' },
  peds: { accent: '#f472b6', icon: '🧸' },
  obgyn: { accent: '#f43f5e', icon: '👶' },
  surgery: { accent: '#64748b', icon: '🔪' },
  emerg: { accent: '#f97316', icon: '🚑' },
  radiology: { accent: '#94a3b8', icon: '🩻' },
  psych: { accent: '#6b7280', icon: '🧠' },
  behavior: { accent: '#525252', icon: '🧩' },
  epi_stats: { accent: '#0ea5a0', icon: '📊' },
  ethics: { accent: '#a3a3a3', icon: '⚖️' },
  endocrine: { accent: '#a855f7', icon: '🦋' },
  infectious_dz: { accent: '#22d3ee', icon: '🧫' },
  rheum: { accent: '#16a34a', icon: '🦵' },
};

// Section display order (from Anki addon)
export const SECTIONS = [
  { key: 'definition', icon: '📖', title: 'Definition' },
  { key: 'why_it_matters', icon: '💡', title: 'Why It Matters' },
  { key: 'how_youll_see_it', icon: '🩺', title: "How You'll See It" },
  { key: 'problem_solving', icon: '🧩', title: 'Problem Solving' },
  { key: 'differentials', icon: '🔀', title: 'Differentials' },
  { key: 'tricks', icon: '🧠', title: 'Tricks & Mnemonics' },
  { key: 'red_flags', icon: '🚨', title: 'Red Flags' },
  { key: 'algorithm', icon: '📋', title: 'Algorithm' },
  { key: 'treatment', icon: '💊', title: 'Treatment' },
  { key: 'exam_appearance', icon: '📝', title: 'Exam Appearance' },
  { key: 'cases', icon: '🏥', title: 'Cases' },
  { key: 'images', icon: '🖼️', title: 'Images' },
];

// Sections collapsed by default
export const COLLAPSED_SECTIONS = ['sources', 'credits'];

// Elements to skip when highlighting
export const SKIP_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'textarea',
  'input',
  'select',
  'button',
  'code',
  'pre',
  'kbd',
  'var',
  'samp',
  'svg',
  'math',
  'canvas',
];

// CSS selectors for elements to skip (rich text editors, etc.)
export const SKIP_SELECTORS = [
  '[contenteditable="true"]',
  '[role="textbox"]',
  '.CodeMirror',
  '.ace_editor',
  '.monaco-editor',
  '.ProseMirror',
  '.tox-tinymce',
  '.cke_editable',
  '.ql-editor',
];

// Patterns to always exclude (common English words that are also abbreviations)
export const EXCLUDED_PATTERNS = ['an', 'as', 'be', 'he', 'is'];

// Message types for communication
export const MESSAGE_TYPES = {
  HIGHLIGHT_PAGE: 'HIGHLIGHT_PAGE',
  GET_TERM: 'GET_TERM',
  SEARCH_TERMS: 'SEARCH_TERMS',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  TOGGLE_SITE: 'TOGGLE_SITE',
  GET_STATS: 'GET_STATS',
  RECORD_VIEW: 'RECORD_VIEW',
  GET_FAVORITES: 'GET_FAVORITES',
  TOGGLE_FAVORITE: 'TOGGLE_FAVORITE',
  IS_FAVORITE: 'IS_FAVORITE',
  GET_MOST_VIEWED: 'GET_MOST_VIEWED',
};

// Performance settings
export const PERFORMANCE = {
  DEBOUNCE_MS: 150,
  BATCH_SIZE: 50,
  IDLE_DEADLINE_MS: 50,
  MAX_CACHE_SIZE: 100,
};
