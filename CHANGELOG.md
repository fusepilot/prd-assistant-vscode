# Change Log

All notable changes to the "prd-manager" extension will be documented in this file.

## [1.0.0] - 2025-01-28

### Added
- **Interactive Task Management**: Toggle task completion with keyboard shortcuts (Ctrl+Enter)
- **Automatic ID Generation**: Smart sequential task IDs (PRD-100001, PRD-100002, etc.)
- **Task Assignment System**: @username syntax with visual indicators and filtering
- **Deep Linking**: Clickable PRD-XXXXXX references for easy navigation
- **Tree View Explorer**: Hierarchical task display with progress tracking and filtering
- **CodeLens Integration**: Inline actions above tasks and headers
- **Progress Reporting**: Export to Markdown, CSV, and JSON formats
- **Syntax Highlighting**: Visual decorations for tasks, assignees, and task IDs
- **Checkbox Normalization**: Automatic formatting fixes on save
- **Duplicate ID Detection**: Quick Fix actions for ID conflicts
- **Advanced Task Management**:
  - Convert list items to tasks
  - Convert tasks back to list items
  - Add subtasks to existing tasks
  - Bulk task operations
- **Configurable Experience**:
  - Custom file patterns for PRD recognition
  - Granular feature toggles for CodeLens, decorations, and progress
  - Session-based visibility controls
  - Customizable task ID prefixes and formats

### Technical
- TypeScript strict mode with full type safety
- Modular provider architecture
- Comprehensive VSCode API integration
- Performance optimized for large documents
- Real-time document processing and updates