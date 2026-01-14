/**
 * EnterMedSchool Glossary - Extension Popup Script
 * Handles settings UI and communication with service worker.
 */

import { MESSAGE_TYPES, STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants.js';

// DOM Elements
const enableToggle = document.getElementById('enableToggle');
const termCount = document.getElementById('termCount');
const highlightCount = document.getElementById('highlightCount');
const viewCount = document.getElementById('viewCount');
const toggleSiteBtn = document.getElementById('toggleSiteBtn');
// Domain card elements
const domainCard = document.getElementById('domainCard');
const domainStatusIcon = document.getElementById('domainStatusIcon');
const domainName = document.getElementById('domainName');
const domainLabel = document.getElementById('domainLabel');
// PDF notice element
const pdfNoticeSection = document.getElementById('pdfNoticeSection');
const styleBtns = document.querySelectorAll('.style-btn');
const colorBtns = document.querySelectorAll('.color-btn');
const customColor = document.getElementById('customColor');
const themeBtns = document.querySelectorAll('.theme-btn');
const searchBtn = document.getElementById('searchBtn');
const browseBtn = document.getElementById('browseBtn');
const statsBtn = document.getElementById('statsBtn');
const hoverPreviewToggle = document.getElementById('hoverPreviewToggle');
const hoverDelaySection = document.getElementById('hoverDelaySection');
const hoverDelaySlider = document.getElementById('hoverDelaySlider');
const hoverDelayValue = document.getElementById('hoverDelayValue');
const betaFeaturesToggle = document.getElementById('betaFeaturesToggle');
const levelBtns = document.querySelectorAll('.level-btn');
const fontDecrease = document.getElementById('fontDecrease');
const fontIncrease = document.getElementById('fontIncrease');
const fontValue = document.getElementById('fontValue');
const versionDisplay = document.getElementById('versionDisplay');
const pauseExtensionBtn = document.getElementById('pauseExtensionBtn');

// State
let currentSettings = null;
let currentTab = null;
let currentHostname = null;
let isPDFPage = false;

/**
 * Initialize the popup
 */
async function init() {
  // Set version from manifest
  if (versionDisplay) {
    const manifest = chrome.runtime.getManifest();
    versionDisplay.textContent = `v${manifest.version}`;
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (tab?.url) {
    try {
      currentHostname = new URL(tab.url).hostname;
    } catch (e) {
      currentHostname = null;
    }
  }

  // Load settings
  await loadSettings();

  // Load stats
  await loadStats();

  // Get page status (checks for PDF, Notion, etc.)
  await getPageStatus();

  // Get highlight count from page
  await getHighlightCount();

  // Set up event listeners
  setupEventListeners();
}

/**
 * Get page status from content script
 */
async function getPageStatus() {
  if (!currentTab?.id) {
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'GET_PAGE_STATUS',
    });
    
    if (response?.isPDF) {
      isPDFPage = true;
      showPDFNotice();
    }
  } catch (error) {
    // Content script not loaded - check URL for PDF
    if (currentTab?.url) {
      try {
        const url = new URL(currentTab.url);
        if (url.pathname.toLowerCase().endsWith('.pdf')) {
          isPDFPage = true;
          showPDFNotice();
        }
      } catch (e) {
        // Invalid URL
      }
    }
  }
}

/**
 * Show PDF notice in popup
 */
function showPDFNotice() {
  if (pdfNoticeSection) {
    pdfNoticeSection.style.display = 'block';
  }
  
  // Update domain card to indicate PDF
  if (domainLabel) {
    domainLabel.textContent = 'PDF - Not supported';
  }
  if (domainStatusIcon) {
    domainStatusIcon.classList.add('disabled');
    domainStatusIcon.classList.remove('active');
  }
  if (domainCard) {
    domainCard.classList.add('disabled');
    domainCard.classList.remove('active');
  }
  if (highlightCount) {
    highlightCount.textContent = 'N/A';
  }
  if (toggleSiteBtn) {
    toggleSiteBtn.disabled = true;
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    currentSettings = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_SETTINGS,
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
    currentSettings = { ...DEFAULT_SETTINGS };
  }

  // Apply to UI
  enableToggle.checked = currentSettings.enabled;

  // Site status
  updateSiteStatus();

  // Highlight style
  styleBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === currentSettings.highlightStyle);
  });

  // Color
  colorBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === currentSettings.highlightColor);
  });
  customColor.value = currentSettings.highlightColor;

  // Theme
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentSettings.theme);
  });

  // Hover preview
  if (hoverPreviewToggle) {
    hoverPreviewToggle.checked = currentSettings.hoverPreview || false;
  }

  // Hover delay
  if (hoverDelaySlider) {
    const delay = currentSettings.hoverDelay || 300;
    hoverDelaySlider.value = delay;
    if (hoverDelayValue) {
      hoverDelayValue.textContent = `${delay}ms`;
    }
    // Show/hide based on hover preview toggle
    if (hoverDelaySection) {
      hoverDelaySection.style.display = currentSettings.hoverPreview ? 'block' : 'none';
    }
  }

  // Beta features
  if (betaFeaturesToggle) {
    betaFeaturesToggle.checked = currentSettings.enableBetaFeatures || false;
  }

  // User level
  levelBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === currentSettings.userLevel);
  });

  // Font size
  if (fontValue) {
    fontValue.textContent = `${currentSettings.fontSize || 100}%`;
  }
}

/**
 * Update site status display
 */
function updateSiteStatus() {
  if (!currentHostname) {
    domainName.textContent = 'This page';
    domainLabel.textContent = 'Cannot highlight';
    domainStatusIcon.classList.add('disabled');
    domainStatusIcon.classList.remove('active', 'paused');
    domainCard.classList.add('disabled');
    domainCard.classList.remove('active', 'paused');
    toggleSiteBtn.disabled = true;
    return;
  }

  // Show truncated domain name
  const displayName = currentHostname.length > 25 
    ? currentHostname.slice(0, 22) + '...' 
    : currentHostname;
  domainName.textContent = displayName;
  domainName.title = currentHostname;

  const isDisabled = currentSettings.disabledSites?.includes(currentHostname);
  const isPaused = !currentSettings.enabled;

  // Update pause button state
  if (pauseExtensionBtn) {
    if (isPaused) {
      pauseExtensionBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Resume Extension</span>';
      pauseExtensionBtn.classList.add('paused');
    } else {
      pauseExtensionBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Pause Extension</span>';
      pauseExtensionBtn.classList.remove('paused');
    }
  }

  // Reset classes
  domainStatusIcon.classList.remove('disabled', 'active', 'paused');
  domainCard.classList.remove('disabled', 'active', 'paused');

  if (isPaused) {
    domainLabel.textContent = 'Extension paused';
    domainStatusIcon.classList.add('paused');
    domainCard.classList.add('paused');
  } else if (isDisabled) {
    domainLabel.textContent = 'Disabled on this site';
    domainStatusIcon.classList.add('disabled');
    domainCard.classList.add('disabled');
    toggleSiteBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Enable on this site</span>';
    toggleSiteBtn.classList.add('enabled');
  } else {
    domainLabel.textContent = 'Active';
    domainStatusIcon.classList.add('active');
    domainCard.classList.add('active');
    toggleSiteBtn.innerHTML = '<span class="btn-icon">🚫</span><span class="btn-text">Disable on this site</span>';
    toggleSiteBtn.classList.remove('enabled');
  }
}

/**
 * Load usage stats
 */
async function loadStats() {
  try {
    const stats = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_STATS,
    });
    viewCount.textContent = stats.totalViews || 0;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

/**
 * Get highlight count from content script
 */
async function getHighlightCount() {
  if (!currentTab?.id) {
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'GET_HIGHLIGHT_COUNT',
    });
    if (response?.count !== undefined) {
      highlightCount.textContent = response.count;
    }
  } catch (error) {
    // Content script not loaded or error
    highlightCount.textContent = '-';
  }
}

/**
 * Save settings
 */
async function saveSettings(newSettings) {
  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      payload: newSettings,
    });
    currentSettings = { ...currentSettings, ...newSettings };
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Update content script with new settings
 */
async function updateContentScript() {
  if (!currentTab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(currentTab.id, {
      type: 'UPDATE_SETTINGS',
      payload: currentSettings,
    });
  } catch (error) {
    // Content script not loaded
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Enable toggle
  enableToggle.addEventListener('change', async () => {
    await saveSettings({ enabled: enableToggle.checked });
    updateSiteStatus();

    if (currentTab?.id) {
      try {
        await chrome.tabs.sendMessage(currentTab.id, {
          type: enableToggle.checked ? 'ENABLE' : 'DISABLE',
        });
      } catch (error) {
        // Content script not loaded
      }
    }
  });

  // Pause extension button
  pauseExtensionBtn?.addEventListener('click', async () => {
    const newEnabledState = !currentSettings.enabled;
    enableToggle.checked = newEnabledState;
    await saveSettings({ enabled: newEnabledState });
    updateSiteStatus();

    if (currentTab?.id) {
      try {
        await chrome.tabs.sendMessage(currentTab.id, {
          type: newEnabledState ? 'ENABLE' : 'DISABLE',
        });
      } catch (error) {
        // Content script not loaded
      }
    }
  });

  // Toggle site
  toggleSiteBtn.addEventListener('click', async () => {
    if (!currentHostname) {
      return;
    }

    try {
      const isNowEnabled = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TOGGLE_SITE,
        payload: { hostname: currentHostname },
      });

      // Update local settings
      if (isNowEnabled) {
        currentSettings.disabledSites = currentSettings.disabledSites.filter(
          h => h !== currentHostname
        );
      } else {
        currentSettings.disabledSites = [...(currentSettings.disabledSites || []), currentHostname];
      }

      updateSiteStatus();

      // Notify content script
      if (currentTab?.id) {
        try {
          await chrome.tabs.sendMessage(currentTab.id, {
            type: isNowEnabled ? 'ENABLE' : 'DISABLE',
          });
        } catch (error) {
          // Content script not loaded
        }
      }
    } catch (error) {
      console.error('Failed to toggle site:', error);
    }
  });

  // Style buttons
  styleBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await saveSettings({ highlightStyle: btn.dataset.style });
      await updateContentScript();
    });
  });

  // Color buttons
  colorBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customColor.value = btn.dataset.color;
      await saveSettings({ highlightColor: btn.dataset.color });
      await updateContentScript();
    });
  });

  // Custom color
  customColor.addEventListener('change', async () => {
    colorBtns.forEach(b => b.classList.remove('active'));
    await saveSettings({ highlightColor: customColor.value });
    await updateContentScript();
  });

  // Theme buttons
  themeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await saveSettings({ theme: btn.dataset.theme });
      // Theme affects popup appearance, handled by CSS media query
    });
  });

  // Search button - open browse page (search is handled there)
  searchBtn?.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/browser/browser.html'),
    });
    window.close();
  });

  // Browse button - open term browser in new tab
  browseBtn?.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/browser/browser.html'),
    });
    window.close();
  });

  // Stats button - open stats page in new tab
  statsBtn?.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/stats/stats.html'),
    });
    window.close();
  });

  // Hover preview toggle
  hoverPreviewToggle?.addEventListener('change', async () => {
    await saveSettings({ hoverPreview: hoverPreviewToggle.checked });
    // Show/hide hover delay section
    if (hoverDelaySection) {
      hoverDelaySection.style.display = hoverPreviewToggle.checked ? 'block' : 'none';
    }
    await updateContentScript();
  });

  // Hover delay slider
  hoverDelaySlider?.addEventListener('input', () => {
    // Update display value in real-time
    if (hoverDelayValue) {
      hoverDelayValue.textContent = `${hoverDelaySlider.value}ms`;
    }
  });
  hoverDelaySlider?.addEventListener('change', async () => {
    const delay = parseInt(hoverDelaySlider.value, 10);
    await saveSettings({ hoverDelay: delay });
    await updateContentScript();
  });

  // Beta features toggle
  betaFeaturesToggle?.addEventListener('change', async () => {
    await saveSettings({ enableBetaFeatures: betaFeaturesToggle.checked });
    await updateContentScript();
  });

  // User level buttons
  levelBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      levelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await saveSettings({ userLevel: btn.dataset.level });
      await updateContentScript();
    });
  });

  // Font size buttons
  fontDecrease?.addEventListener('click', async () => {
    const current = currentSettings.fontSize || 100;
    const newSize = Math.max(70, current - 10);
    currentSettings.fontSize = newSize;
    fontValue.textContent = `${newSize}%`;
    await saveSettings({ fontSize: newSize });
    await updateContentScript();
  });

  fontIncrease?.addEventListener('click', async () => {
    const current = currentSettings.fontSize || 100;
    const newSize = Math.min(150, current + 10);
    currentSettings.fontSize = newSize;
    fontValue.textContent = `${newSize}%`;
    await saveSettings({ fontSize: newSize });
    await updateContentScript();
  });
}

// Initialize on load
init();
