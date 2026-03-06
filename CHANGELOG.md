# Changelog

All notable changes to the **DeadSweep** extension will be documented in this file.

## [1.0.0] - 2026-03-06

### 🎉 Initial Release

#### Dead Code Detection
- TypeScript/JavaScript analysis via `ts-morph` AST engine
  - Detects unused: variables, functions, classes, interfaces, types, enums, imports, exports
  - Cross-file reference analysis
  - Respects re-exports and barrel files
- Python dead code detection
  - Detects unused: functions, classes, variables, imports
  - Regex-based AST analysis
- CSS/SCSS unused selector detection
  - Finds unreferenced class selectors and ID selectors
  - Scans source files for class name references

#### Sidebar Panel
- Custom Activity Bar icon (broom)
- Tree view grouped by File → Type → Item
- Badge count on Activity Bar
- Right-click context menu: Delete, Ignore, Jump to Definition, Copy Location

#### Inline Editor Decorations
- Gutter icons on dead code lines
- Hover tooltips with detailed information
- CodeLens actions: Remove, Ignore, Confidence indicator

#### Problems Panel Integration
- Diagnostics with Warning severity
- `DiagnosticTag.Unnecessary` for strikethrough styling
- Quick Fix code actions

#### Bulk Cleanup Wizard
- Multi-step webview UI
- Confidence-based pre-selection
- Diff preview before applying
- Full undo support via WorkspaceEdit API

#### Dashboard
- Clean Score percentage
- Chart.js breakdown by type and language
- Top 10 files listing
- Historical scan trend

#### Reports & Badges
- Self-contained HTML report export
- Shareable Markdown badge generation
- One-click clipboard copy

#### Auto File Watcher
- Automatic re-scan on file save
- 500ms debounce
- Status bar item with live count

#### Confidence Scoring
- 0–100% confidence rating per item
- Accounts for: dynamic access, eval, barrel files, exports, naming conventions

#### Configuration
- `.deadsweeprc.json` file support
- VS Code settings integration
- Glob-based ignore patterns
- Regex-based name ignore patterns

#### Ignore / Whitelist
- Inline `// deadsweep-ignore` comments
- File-level ignoring via config
- Clear all ignored items command
