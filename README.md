# 🧹 DeadSweep

> Detect and remove dead code across your entire project — TypeScript, JavaScript, Python, and CSS.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/sajjad-ai.deadsweep?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=sajjad-ai.deadsweep)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/sajjad-ai.deadsweep)](https://marketplace.visualstudio.com/items?itemName=sajjad-ai.deadsweep)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![DeadSweep](https://img.shields.io/badge/dead--code-0%25-brightgreen)

---

## ✨ Features

### 🔍 Dead Code Detection
- **TypeScript / JavaScript** — Detects unused variables, functions, classes, interfaces, types, enums, imports, and exports using full AST analysis via [ts-morph](https://github.com/dsherret/ts-morph)
- **Python** — Finds unused functions, classes, variables, and imports using regex-based cross-file analysis
- **CSS / SCSS** — Identifies unused CSS classes and ID selectors by cross-referencing all source files
- Cross-file reference analysis across your entire workspace
- Confidence scoring system (0–100%) for safe removal

### 🌳 Sidebar Tree View
- Custom Activity Bar panel with broom icon
- Results grouped by **File → Type → Item**
- Badge count showing total dead code items
- Right-click context menu: Delete, Ignore, Jump to Definition, Copy Location

### ✏️ Inline Editor Decorations
- Red/orange gutter icon on dead code lines
- Hover tooltip with detailed information and quick actions
- CodeLens actions: 🗑 Remove | 👁 Ignore | Confidence %

### ⚠️ Problems Panel Integration
- Dead code appears as VS Code Diagnostics (Warning severity)
- `DiagnosticTag.Unnecessary` for native strikethrough styling
- Quick Fix code actions directly in the Problems panel

### 🧙‍♂️ Bulk Cleanup Wizard
- 4-step webview wizard:
  1. **Summary** — overview of all dead code found
  2. **Select** — pick items to delete (filter by type, select by confidence)
  3. **Preview** — review diff of what will be removed
  4. **Apply** — delete with full undo support via `WorkspaceEdit`

### 📊 Dashboard
- Clean Score percentage (0–100%) with animated ring
- Breakdown charts by language and type (powered by Chart.js)
- Top 10 files with most dead code
- Historical trend over time (stored in global state)

### 📄 Reports & Badges
- Export self-contained HTML report with dark theme
- Generate shareable Markdown/SVG badge for your README
- Copy badge to clipboard with one click

### ⚡ Auto File Watcher
- Automatic re-scan on file save (debounced at 500ms)
- Status bar item with live dead code count
- Click status bar to open Dashboard

### 🎯 Confidence Scoring
| Level | Range | Meaning |
|-------|-------|---------|
| 🟢 High | ≥ 90% | Never referenced anywhere — safe to delete |
| 🟡 Medium | 60–89% | Likely unused, some uncertainty |
| 🔴 Low | < 60% | Dynamic access patterns, string references, or eval detected |

### 🚫 Ignore / Whitelist System
- Right-click → **Ignore this item** → inserts `// deadsweep-ignore` comment
- Right-click → **Ignore this file** → adds path to `.deadsweeprc.json`
- Clear All Ignored removes all `deadsweep-ignore` comments across the workspace

---

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code / Cursor
2. Press `Ctrl+Shift+X` (Extensions sidebar)
3. Search **"DeadSweep"**
4. Click **Install**

### From VSIX (local)
```bash
code --install-extension deadsweep-1.0.0.vsix
```

### From Source
```bash
git clone https://github.com/PrinceSajjadHussain/deadsweep.git
cd deadsweep
npm install
npm run bundle
# Press F5 in VS Code to launch Extension Development Host
```

---

## 🚀 Usage

### Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `DeadSweep: Scan Entire Project` | `Ctrl+Shift+D` | Scan the whole workspace for dead code |
| `DeadSweep: Scan Current File` | — | Scan only the active file |
| `DeadSweep: Open Dashboard` | — | Open the analytics dashboard |
| `DeadSweep: Run Cleanup Wizard` | `Ctrl+Shift+X` | Launch the bulk cleanup wizard |
| `DeadSweep: Export HTML Report` | — | Generate and save an HTML report |
| `DeadSweep: Clear All Ignored Items` | — | Remove all deadsweep-ignore comments |

### Quick Start
1. Open a project in VS Code
2. Press `Ctrl+Shift+D` to scan your project
3. View results in the **DeadSweep** sidebar panel (broom icon in Activity Bar)
4. Click any item to jump to its location
5. Right-click → **Delete** or **Ignore**
6. Use the **Cleanup Wizard** (`Ctrl+Shift+X`) for bulk operations

---

## ⚙️ Configuration

### `.deadsweeprc.json` (project root)

```json
{
  "languages": ["typescript", "javascript", "python", "css"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "ignorePatterns": [".*_test$", "^test_.*"],
  "confidenceThreshold": 70,
  "ciFailThreshold": 10,
  "autoScanOnSave": true,
  "showInlineDecorations": true,
  "showCodeLens": true
}
```

### VS Code Settings (`settings.json`)

All settings are under the `deadsweep.*` namespace:

| Setting | Default | Description |
|---------|---------|-------------|
| `deadsweep.languages` | `["typescript", "javascript", "python", "css"]` | Languages to analyze |
| `deadsweep.ignore` | `["**/node_modules/**", "**/dist/**", ...]` | Glob patterns to exclude |
| `deadsweep.confidenceThreshold` | `70` | Minimum confidence to report (0–100) |
| `deadsweep.ciFailThreshold` | `10` | Max dead items before CI fails |
| `deadsweep.autoScanOnSave` | `true` | Re-scan file on save |
| `deadsweep.showInlineDecorations` | `true` | Show gutter icons and line highlights |
| `deadsweep.showCodeLens` | `true` | Show CodeLens above dead code |

> `.deadsweeprc.json` settings override VS Code settings when both exist.

---

## 🏗️ Supported Languages

| Language | Detects | Analysis Method |
|----------|---------|-----------------|
| TypeScript | Variables, functions, classes, interfaces, types, enums, imports, exports | AST via ts-morph |
| JavaScript | Variables, functions, classes, imports, exports | AST via ts-morph |
| Python | Functions, classes, variables, imports | Regex cross-file |
| CSS / SCSS | Class selectors, ID selectors | Cross-reference source files |

---

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/PrinceSajjadHussain/deadsweep.git
cd deadsweep

# Install dependencies
npm install

# Compile (type-check only)
npm run compile

# Bundle for development (with sourcemaps)
npm run bundle:dev

# Bundle for production (minified)
npm run bundle

# Package as .vsix
npm run package

# Publish to Marketplace
npm run publish
```

### Running in Development
1. Open the `deadsweep` folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension will be active in the new window — use `Ctrl+Shift+D` to scan

### Project Structure
```
deadsweep/
├── src/
│   ├── extension.ts          # Entry point — activate/deactivate, register commands
│   ├── dashboard.ts          # Dashboard webview panel (Chart.js)
│   ├── analyzer/
│   │   ├── types.ts          # Shared types: DeadCodeType, DeadCodeItem, etc.
│   │   ├── index.ts          # Orchestrator: scanProject(), scanFile()
│   │   ├── tsAnalyzer.ts     # TypeScript/JS analysis via ts-morph
│   │   ├── pythonAnalyzer.ts # Python analysis via regex
│   │   └── cssAnalyzer.ts    # CSS analysis via cross-reference
│   ├── providers/
│   │   ├── treeProvider.ts       # Sidebar TreeView
│   │   ├── decorationProvider.ts # Gutter icons, CodeLens
│   │   └── diagnosticProvider.ts # Problems panel, CodeActions
│   ├── actions/
│   │   ├── deleteAction.ts   # Single/multi delete via WorkspaceEdit
│   │   ├── ignoreAction.ts   # Inline comment + file-level ignoring
│   │   └── bulkAction.ts     # 4-step Cleanup Wizard webview
│   ├── watchers/
│   │   └── fileWatcher.ts    # Auto re-scan on save + status bar
│   ├── reports/
│   │   ├── htmlReport.ts     # HTML report generation
│   │   └── badgeGenerator.ts # Markdown/SVG badge
│   ├── config/
│   │   └── configManager.ts  # Merge VS Code settings + .deadsweeprc.json
│   └── utils/
│       ├── helpers.ts        # debounce, groupBy, relativePath, escapeHtml, etc.
│       └── logger.ts         # Output channel logger
├── media/
│   ├── broom.svg             # Activity Bar icon
│   └── icon.png              # Extension marketplace icon
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── .deadsweeprc.json         # Default config file
└── .vscodeignore             # Files excluded from .vsix
```

---

## 📋 Requirements

- **VS Code** `^1.85.0` (or compatible editors like Cursor)
- **Node.js** 18+ (for development)

---

## 📝 License

MIT © [Sajjad Hussain](https://github.com/PrinceSajjadHussain)

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/PrinceSajjadHussain/deadsweep).

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

<div align="center">
  <strong>🧹 Keep your codebase clean with DeadSweep</strong><br/>
  <a href="https://marketplace.visualstudio.com/items?itemName=sajjad-ai.deadsweep">Install from Marketplace</a> · 
  <a href="https://github.com/PrinceSajjadHussain/deadsweep">GitHub</a>
</div>
