# 🧹 DeadSweep

> Detect and remove dead code across your entire project.

[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=deadsweep.deadsweep)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)](https://github.com/deadsweep/deadsweep)
![DeadSweep](https://img.shields.io/badge/dead--code-0%25-brightgreen)

---

## ✨ Features

### 🔍 Dead Code Detection
- **TypeScript / JavaScript**: Detects unused variables, functions, classes, interfaces, types, enums, imports, and exports
- **Python**: Finds unused functions, classes, variables, and imports
- **CSS / SCSS**: Identifies unused CSS classes and IDs
- Cross-file analysis across your entire workspace
- Confidence scoring system (0–100%) for safe removal

![Scan Demo](https://raw.githubusercontent.com/deadsweep/deadsweep/main/media/demo-scan.gif)

### 🌳 Sidebar Tree View
- Custom Activity Bar panel with broom icon
- Results grouped by: **File → Type → Item**
- Badge count showing total dead code items
- Right-click context menu: Delete, Ignore, Jump to Definition, Copy Location

![Tree View](https://raw.githubusercontent.com/deadsweep/deadsweep/main/media/demo-tree.gif)

### ✏️ Inline Editor Decorations
- Red/orange gutter icon on dead code lines
- Hover tooltip with detailed information
- CodeLens actions: 🗑 Remove | 👁 Ignore | Confidence %

### ⚠️ Problems Panel Integration
- All dead code appears as VS Code Diagnostics (Warning severity)
- Uses `DiagnosticTag.Unnecessary` for native strikethrough styling
- Quick Fix actions directly in the Problems panel

### 🧙‍♂️ Bulk Cleanup Wizard
- Multi-step webview UI
  - **Step 1:** Summary of all dead code found
  - **Step 2:** Select items to delete (pre-checked by confidence)
  - **Step 3:** Preview diff before applying
  - **Step 4:** Apply deletions with full undo support

![Wizard Demo](https://raw.githubusercontent.com/deadsweep/deadsweep/main/media/demo-wizard.gif)

### 📊 Dashboard
- Clean Score percentage (0–100%)
- Breakdown charts by language and type (Chart.js)
- Top 10 files with most dead code
- Historical trend over time

### 📄 Reports & Badges
- Export self-contained HTML report
- Generate shareable Markdown badge
- Copy badge to clipboard with one click

### ⚡ Auto File Watcher
- Automatic re-scan on file save
- Debounced scanning (500ms delay)
- Status bar with live dead code count

### 🎯 Confidence Scoring
- **High (≥90%):** Never referenced anywhere, safe to delete
- **Medium (60–89%):** Likely unused but with some uncertainty
- **Low (<60%):** Dynamic access patterns, string references, or eval usage detected

### 🚫 Ignore / Whitelist System
- Right-click → "Ignore this item" adds `// deadsweep-ignore` comment
- Right-click → "Ignore this file" adds to `.deadsweeprc.json`
- Support for glob patterns in config

---

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions)
3. Search for "DeadSweep"
4. Click **Install**

### From VSIX
```bash
code --install-extension deadsweep-1.0.0.vsix
```

---

## 🚀 Usage

### Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `DeadSweep: Scan Entire Project` | `Ctrl+Shift+D` | Scan the whole workspace |
| `DeadSweep: Scan Current File` | — | Scan only the active file |
| `DeadSweep: Open Dashboard` | — | Open the analytics dashboard |
| `DeadSweep: Run Cleanup Wizard` | `Ctrl+Shift+X` | Launch the bulk cleanup wizard |
| `DeadSweep: Export HTML Report` | — | Generate and save an HTML report |
| `DeadSweep: Clear All Ignored Items` | — | Remove all deadsweep-ignore comments |

### Quick Start
1. Open a project in VS Code
2. Press `Ctrl+Shift+D` to scan your project
3. View results in the DeadSweep sidebar panel
4. Click items to jump to their location
5. Right-click to delete or ignore
6. Run the Cleanup Wizard for bulk operations

---

## ⚙️ Configuration

### `.deadsweeprc.json`

Create a `.deadsweeprc.json` file in your project root:

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

### VS Code Settings

All settings are also available under `deadsweep.*` in VS Code Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `deadsweep.languages` | `["typescript", "javascript", "python", "css"]` | Languages to analyze |
| `deadsweep.ignore` | `["**/node_modules/**", ...]` | Glob patterns to ignore |
| `deadsweep.confidenceThreshold` | `70` | Minimum confidence to report |
| `deadsweep.autoScanOnSave` | `true` | Auto re-scan on save |
| `deadsweep.showInlineDecorations` | `true` | Show inline decorations |
| `deadsweep.showCodeLens` | `true` | Show CodeLens actions |

---

## 🏗️ Supported Languages

| Language | Detects |
|----------|---------|
| TypeScript | Variables, functions, classes, interfaces, types, enums, imports, exports |
| JavaScript | Variables, functions, classes, imports, exports |
| Python | Functions, classes, variables, imports |
| CSS / SCSS | Unused class selectors, ID selectors |

---

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/deadsweep/deadsweep.git
cd deadsweep

# Install dependencies
npm install

# Compile
npm run compile

# Bundle for production
npm run bundle

# Package as VSIX
npm run package
```

### Running in Development
1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension will be active in the new window

---

## 📋 Requirements

- VS Code `^1.85.0`
- Node.js 18+

---

## 📝 License

MIT © DeadSweep

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/deadsweep/deadsweep).

---

<div align="center">
  <strong>🧹 Keep your codebase clean with DeadSweep</strong>
</div>
