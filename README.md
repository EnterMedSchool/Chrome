# EnterMedSchool Glossary 📚

A Chrome extension that automatically highlights medical terminology on any webpage and provides instant, comprehensive definitions for medical students.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome Web Store](https://img.shields.io/badge/manifest-v3-green.svg)
![Terms](https://img.shields.io/badge/terms-336%2B-purple.svg)

## ✨ Features

- **336+ Medical Terms** - Comprehensive coverage of cardiology, neurology, pharmacology, pathology, and 20+ more specialties
- **Smart Highlighting** - Aho-Corasick algorithm for efficient, accurate term detection
- **Rich Definitions** - Each term includes:
  - 📖 Definition
  - 💡 Why It Matters (clinical relevance)
  - 🩺 How You'll See It (exam presentation)
  - 🔀 Differentials
  - 🧠 Tricks & Mnemonics
  - 🚨 Red Flags
  - 💊 Treatment
  - 🏥 Clinical Cases (with spoiler reveals!)
- **Beautiful UI** - "Chunky sticker" design with playful, bold aesthetics
- **100% Offline** - All data bundled; no network requests
- **Privacy First** - No data collection whatsoever
- **Dark Mode** - Automatic theme detection

## 🚀 Installation

### From Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store page](#) (coming soon)
2. Click "Add to Chrome"
3. Done! Start browsing medical content

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/EnterMedSchool/Chrome.git
cd Chrome

# Install dependencies
npm install

# Bundle term files
node scripts/bundle-terms.js

# Build for development
npm run dev

# Or build for production
npm run build
```

Then load the extension in Chrome:
1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+G` | Toggle extension on/off for current site |
| `Alt+Shift+S` | Open search |
| `Tab` / `Shift+Tab` | Navigate between highlighted terms |
| `Enter` / `Space` | Open popup for focused term |
| `Escape` | Close popup |
| `N` | Next term |
| `P` | Previous term |

## 🎨 Customization

- **Highlight Style**: Underline, background, or bold
- **Color**: Choose from presets or custom color picker
- **Per-site Control**: Enable/disable on specific websites
- **Theme**: Light, dark, or auto (follows system)

## 🔒 Privacy

This extension is built with privacy as a core principle:

- ✅ 100% offline after installation
- ✅ Zero network requests
- ✅ No data collection
- ✅ No analytics
- ✅ All data stored locally

Read our full [Privacy Policy](docs/PRIVACY.md).

## 🛠️ Technical Details

### Architecture

```
├── Manifest V3 (latest Chrome extension standard)
├── Content Script (term detection + highlighting)
├── Service Worker (background processing)
├── Shadow DOM (isolated popup UI)
└── IndexedDB/chrome.storage (local settings)
```

### Algorithm

Uses the **Aho-Corasick algorithm** for O(n + m + z) multi-pattern matching where:
- n = text length
- m = total pattern length  
- z = number of matches

This allows efficient scanning of large pages with 336+ terms without slowing down the browser.

### Performance Optimizations

- Debounced DOM mutations (150ms)
- Batch processing (50 nodes at a time)
- Viewport-priority highlighting
- LRU cache for term content
- requestIdleCallback for non-blocking work

## 📁 Project Structure

```
EMSChromeExtension/
├── manifest.json           # Chrome extension manifest
├── src/
│   ├── background/         # Service worker
│   ├── content/            # Content script (highlighting)
│   ├── popup/              # Extension popup UI
│   ├── onboarding/         # First-run experience
│   └── shared/             # Shared utilities
├── styles/                 # CSS files
├── data/
│   └── terms/              # 336+ term JSON files
├── assets/                 # Icons, fonts
├── tests/                  # Unit & E2E tests
└── docs/                   # Documentation
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

### Adding New Terms

Terms are stored as JSON files in `data/terms/`. Each term follows this structure:

```json
{
  "id": "term-id",
  "names": ["Primary Name", "Alternative Name"],
  "aliases": ["common alias", "abbreviation"],
  "abbr": ["ABBR"],
  "patterns": ["pattern to match"],
  "primary_tag": "cardio",
  "tags": ["cardio", "physiology"],
  "definition": "The definition...",
  "why_it_matters": "Clinical relevance...",
  "differentials": [...],
  "tricks": [...]
}
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **EnterMedSchool** - For the original Anki addon and term database
- **Medical students worldwide** - For feedback and suggestions
- All open-source libraries used in this project

---

Made with ❤️ by [EnterMedSchool](https://entermedschool.com)
