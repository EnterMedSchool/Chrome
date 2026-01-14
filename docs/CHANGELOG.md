# Changelog

All notable changes to EnterMedSchool Glossary will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-08

### Added

- **Initial Release** 🎉
- 336+ medical term definitions covering all major systems
- Automatic term highlighting on any webpage
- Click-to-view popup definitions with:
  - Definitions
  - Clinical pearls ("Why It Matters")
  - How you'll see it on exams
  - Differentials
  - Tricks & Mnemonics
  - Red flags
  - Treatment overviews
  - Clinical cases with spoiler reveals
- Three highlight styles: underline, background, bold
- Custom highlight color picker
- Dark and light theme support
- Keyboard shortcuts:
  - `Alt+Shift+G` - Toggle highlighting on/off
  - `Alt+Shift+S` - Open search
  - `Tab` / `Shift+Tab` - Navigate between terms
  - `Enter` / `Space` - Open popup for focused term
  - `Escape` - Close popup
- Right-click context menu for searching selected text
- Per-site enable/disable controls
- "Rabbit hole" navigation between related terms
- 100% offline functionality
- Privacy-focused (no data collection)
- Accessibility features (ARIA labels, keyboard navigation)
- Beautiful onboarding experience

### Technical

- Manifest V3 compliant
- Aho-Corasick algorithm for efficient term matching
- Shadow DOM isolation for popup UI
- MutationObserver for dynamic content (SPA support)
- Performance optimizations (debouncing, batching)
- Content Security Policy compliant (no eval, no remote code)

---

## Version History Format

### Types of Changes

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

---

## Roadmap

### Planned for 1.1.0

- [ ] Search functionality within popup
- [ ] Favorites list
- [ ] Usage statistics (opt-in)
- [ ] Spaced repetition integration
- [ ] More terms (aim for 500+)

### Planned for 1.2.0

- [ ] Note-taking on terms
- [ ] Custom term additions
- [ ] Export/import settings
- [ ] Sync across devices (optional)

---

[Unreleased]: https://github.com/entermedschool/ems-chrome-extension/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/entermedschool/ems-chrome-extension/releases/tag/v1.0.0
