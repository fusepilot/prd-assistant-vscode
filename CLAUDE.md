# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development

```bash
# Install dependencies
npm install

# Development mode with auto-recompilation
npm run watch

# Type checking
npm run check-types

# Lint code
npm run lint

# Full build (type-check, lint, and bundle)
npm run compile

# Production build with minification
npm run package
```

### Testing

```bash
# Run tests (compiles and lints first)
npm test

# Pre-test preparation
npm run pretest
```

### Running the Extension

1. Press `F5` in VSCode to launch Extension Development Host
2. The extension will be pre-installed in the new window
3. After making changes, reload the window: Ctrl+Shift+P → "Developer: Reload Window"

## Architecture

This is a VSCode extension for managing Product Requirements Documents (PRDs) with interactive task management and AI integration.

### Key Components

- **src/extension.ts**: Main entry point - registers commands, providers, and initializes the extension
- **package.json**: Extension manifest defining commands, activation events, and configuration
- **esbuild.js**: Build configuration using esbuild for fast bundling with source maps

### Core Features to Implement (based on PRD.md)

1. **Interactive Checkboxes**: Make markdown checkboxes clickable with automatic state persistence
2. **Task ID Generation**: Auto-generate unique IDs (PRD-XXXXXX format) for each task
3. **Task Assignment**: Support @username-copilot syntax for task ownership
4. **Deep Linking**: Enable PRD-XXXXXX references to be clickable for navigation
5. **MCP Server**: Implement Model Context Protocol server for AI assistant integration
6. **Tree View**: Provide sidebar explorer showing task hierarchy and progress
7. **CodeLens**: Add inline actions and statistics above tasks
8. **Progress Reporting**: Generate completion statistics and export capabilities

### Extension API Patterns

- Use `vscode.languages.registerCodeLensProvider` for inline task actions
- Use `vscode.window.createTreeView` for the task explorer sidebar
- Use `vscode.languages.registerDocumentLinkProvider` for deep links
- Use `vscode.workspace.onDidChangeTextDocument` for real-time updates
- Use `vscode.languages.registerCompletionItemProvider` for @-mention autocomplete

### Development Notes

- TypeScript strict mode is enabled - ensure all types are properly defined
- The extension targets VSCode API 1.54.0+ (verify compatibility when using newer APIs)
- Use ES2022 features as configured in tsconfig.json
- Follow the existing modular structure when adding new providers/features

### Menu Synchronization

**IMPORTANT**: Keep PRD Tasks explorer context menus synchronized with CodeLens actions. When adding new actions to CodeLens providers, ensure they are also available in the tree view context menus and vice versa.

Current synchronized actions:
- **Tasks**: Toggle, Assign, Copy Link, Copy ID, Copy Text
- **Headers**: Add Task, Copy Uncompleted Task List, Go to Header

Both interfaces should provide the same core functionality to maintain consistency across the extension.
