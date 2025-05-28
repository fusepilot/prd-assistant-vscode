# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build & Development

```bash
# Install dependencies
pnpm install

# Development mode with auto-recompilation
pnpm run watch

# Type checking
pnpm run check-types

# Lint code
pnpm run lint

# Full build (type-check, lint, and bundle)
pnpm run compile

# Production build with minification
pnpm run package
```

### Testing

```bash
# Run tests (compiles and lints first)
pnpm test

# Pre-test preparation
pnpm run pretest
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
9. **Checkbox Normalization**: Automatically fix checkbox formatting on save ([] → [ ], [x ] → [x])

### Extension API Patterns

- Use `vscode.languages.registerCodeLensProvider` for inline task actions
- Use `vscode.window.createTreeView` for the task explorer sidebar
- Use `vscode.languages.registerDocumentLinkProvider` for deep links
- Use `vscode.workspace.onDidChangeTextDocument` for real-time updates
- Use `vscode.languages.registerCompletionItemProvider` for @-mention autocomplete
- Use `vscode.languages.registerDocumentFormattingEditProvider` for checkbox normalization on format

### Development Notes

- TypeScript strict mode is enabled - ensure all types are properly defined
- The extension targets VSCode API 1.54.0+ (verify compatibility when using newer APIs)
- Use ES2022 features as configured in tsconfig.json
- Follow the existing modular structure when adding new providers/features

### Checkbox Normalization

The extension provides automatic checkbox normalization to fix improperly formatted checkboxes:
- `[]` → `[ ]` (adds space for empty checkbox)
- `[x ]`, `[ x]`, `[ x ]` → `[x]` (normalizes checked checkbox)

To enable automatic normalization on save:
1. Open VSCode Settings (Cmd+,)
2. Search for "Format On Save"
3. Enable "Editor: Format On Save"
4. The extension will automatically normalize checkboxes when you save markdown files

You can also:
- Use the command "PRD: Normalize Checkbox Formatting" to manually normalize
- Disable normalization by setting `prdManager.normalizeCheckboxes` to false

### Menu Synchronization

**IMPORTANT**: Keep PRD Tasks explorer context menus synchronized with CodeLens actions. When adding new actions to CodeLens providers, ensure they are also available in the tree view context menus and vice versa.

Current synchronized actions:
- **Tasks**: Toggle, Assign, Copy Link, Copy ID, Copy Text, Deconvert
- **Headers**: Add Task, Copy Uncompleted Task List, Go to Header

Both interfaces provide the same core functionality to maintain consistency across the extension.

### MCP Server Integration

The extension includes a built-in MCP (Model Context Protocol) server that allows AI assistants and Copilots to interact with PRD tasks:

**Architecture**: The MCP server is bundled with the extension, not installed in user workspaces
**Location**: `mcp-server/` directory within the extension installation
**Build**: Run `npm run build` in the `mcp-server` directory during development
**Auto-Start Behavior**:
- MCP server automatically starts when the extension activates
- If not built, it attempts to build the server automatically (dev mode only)
- Status is shown in the VSCode status bar with click-to-toggle
- Server runs from extension directory, operates on active workspace files

**Commands Available**:
- "PRD: Start MCP Server" - Manually starts the MCP server process
- "PRD: Stop MCP Server" - Stops the MCP server process
- "PRD: Toggle MCP Server" - Toggles server on/off (also available via status bar)
- "PRD: List Tasks via MCP" - Demonstrates MCP task listing
- "PRD: Create Task via MCP" - Demonstrates MCP task creation

**MCP Tools Available**:
- `list_tasks` - List tasks with filtering options
- `toggle_task` - Toggle task completion status
- `create_task` - Create new tasks with assignees
- `assign_task` - Assign existing tasks to team members
- `get_task` - Get detailed task information

**Testing MCP Server**:
```bash
cd mcp-server
npm install && npm run build
npm test  # Basic functionality test
npm run inspector  # Interactive MCP Inspector
```

**Integration with AI Assistants**:
The MCP server enables AI assistants to read, modify, and create PRD tasks while maintaining consistency with the VSCode extension's task tracking system.
