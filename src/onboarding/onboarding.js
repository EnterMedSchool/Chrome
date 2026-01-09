/**
 * EMS Medical Glossary - Onboarding Script
 * Handles slide navigation and settings during first-run experience.
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants.js';

// DOM Elements
const slidesContainer = document.getElementById('slidesContainer');
const slides = document.querySelectorAll('.slide');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const slideDots = document.getElementById('slideDots');
const dots = document.querySelectorAll('.dot');
const progressFill = document.getElementById('progressFill');
const styleBtns = document.querySelectorAll('.style-btn');
const colorBtns = document.querySelectorAll('.color-btn');

// State
let currentSlide = 1;
const totalSlides = slides.length;
let selectedStyle = 'underline';
let selectedColor = '#6C5CE7';

/**
 * Initialize the onboarding
 */
function init() {
  setupEventListeners();
  updateUI();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Navigation buttons
  prevBtn.addEventListener('click', goToPrevSlide);
  nextBtn.addEventListener('click', handleNextClick);

  // Dots navigation
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      goToSlide(parseInt(dot.dataset.slide));
    });
  });

  // Style buttons
  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStyle = btn.dataset.style;
      updateDemoHighlight();
    });
  });

  // Color buttons
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
      updateDemoHighlight();
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      handleNextClick();
    } else if (e.key === 'ArrowLeft') {
      goToPrevSlide();
    }
  });
}

/**
 * Go to a specific slide
 */
function goToSlide(slideNum) {
  if (slideNum < 1 || slideNum > totalSlides) {
    return;
  }

  currentSlide = slideNum;
  updateUI();
}

/**
 * Go to the previous slide
 */
function goToPrevSlide() {
  if (currentSlide > 1) {
    currentSlide--;
    updateUI();
  }
}

/**
 * Handle next button click
 */
function handleNextClick() {
  if (currentSlide < totalSlides) {
    currentSlide++;
    updateUI();
  } else {
    // Complete onboarding
    completeOnboarding();
  }
}

/**
 * Update the UI based on current slide
 */
function updateUI() {
  // Update slides
  slides.forEach(slide => {
    slide.classList.remove('active');
    if (parseInt(slide.dataset.slide) === currentSlide) {
      slide.classList.add('active');
    }
  });

  // Update dots
  dots.forEach(dot => {
    dot.classList.remove('active');
    if (parseInt(dot.dataset.slide) === currentSlide) {
      dot.classList.add('active');
    }
  });

  // Update progress bar
  const progress = (currentSlide / totalSlides) * 100;
  progressFill.style.width = `${progress}%`;

  // Update navigation buttons
  prevBtn.disabled = currentSlide === 1;

  if (currentSlide === totalSlides) {
    nextBtn.textContent = "Let's Go! 🚀";
    nextBtn.classList.add('complete');
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.classList.remove('complete');
  }
}

/**
 * Update demo highlight style
 */
function updateDemoHighlight() {
  const highlights = document.querySelectorAll('.demo-highlight');
  
  highlights.forEach(el => {
    el.style.textDecorationColor = selectedColor;
    
    // Reset styles
    el.style.textDecoration = 'none';
    el.style.background = 'none';
    el.style.fontWeight = 'normal';
    el.style.color = 'inherit';

    switch (selectedStyle) {
      case 'underline':
        el.style.textDecoration = 'underline';
        el.style.textDecorationColor = selectedColor;
        el.style.textDecorationThickness = '2px';
        el.style.textUnderlineOffset = '3px';
        break;
      case 'background':
        el.style.background = `${selectedColor}25`;
        el.style.padding = '0 4px';
        el.style.borderRadius = '3px';
        break;
      case 'bold':
        el.style.fontWeight = '700';
        el.style.color = selectedColor;
        break;
    }
  });
}

/**
 * Complete the onboarding and save settings
 */
async function completeOnboarding() {
  try {
    // Save settings
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      payload: {
        highlightStyle: selectedStyle,
        highlightColor: selectedColor,
      },
    });

    // Mark onboarding as complete
    await chrome.storage.local.set({
      [STORAGE_KEYS.ONBOARDING_COMPLETE]: true,
    });

    // Close the tab
    window.close();
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    // Close anyway
    window.close();
  }
}

// Initialize on load
init();
