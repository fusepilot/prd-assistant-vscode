# PRD Manager - VSCode Extension

Transform your Product Requirements Documents into interactive, trackable project dashboards with AI assistant integration.

## 🎯 Features

### ✅ Interactive Task Management

Turn your markdown task lists into interactive checkboxes with automatic progress tracking.

- Click checkboxes to toggle completion status
- Automatic task ID generation (PRD-XXXXXX format)
- Visual progress indicators
- Nested task support with hierarchy tracking

### 👥 Smart Task Assignment

Assign tasks to team members or AI Copilots with @-mention syntax.

- Syntax: `@username-copilot` for clear ownership
- Visual highlighting of assignees
- Bulk assignment capabilities
- Track workload by team member

### 🔗 Deep Linking System

Reference any task anywhere with automatic deep links.

- Every task gets a unique ID (e.g., PRD-123456)
- Click any PRD-XXXXXX reference to jump to that task
- Hover for quick task preview
- Copy shareable links with one click

### 🤖 MCP Server Integration

Built-in Model Context Protocol server enables AI assistants to interact with your PRDs programmatically.

Available MCP tools:

- `list_tasks` - Query tasks with filters
- `get_task` - Retrieve specific task details
- `update_task` - Modify task status or assignee
- `create_task` - Add new tasks programmatically
- `get_progress` - Generate progress statistics

### 📊 Visual Progress Tracking

Get instant visibility into project progress with multiple views.

- Tree view explorer in sidebar
- Inline CodeLens statistics
- Progress reports with charts
- Real-time updates

## 📋 Requirements

- Visual Studio Code 1.74.0 or higher
- Node.js 16.0 or higher (for MCP server)
- Git (for version control integration)

## 🚀 Getting Started

### Installation from Marketplace

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "PRD Manager"
4. Click Install

### Installation from Source

```bash
git clone https://github.com/yourusername/vscode-prd-manager
cd vscode-prd-manager
npm install
npm run compile
```

## 💻 Development Guide

### Development Workflow

1. **Launch Extension Development Host**

   - Press `F5` in VSCode (or run "Debug: Start Debugging" from Command Palette)
   - This opens a new "Extension Development Host" window
   - Your extension is pre-installed in this window
   - Open any folder with PRD.md files to test

2. **Making Changes**

   - Edit source files in `src/`
   - If using watch mode (`npm run watch`), TypeScript compiles automatically
   - **Reloading Changes**:
     - Run "Developer: Reload Window" from Command Palette (Ctrl+Shift+P)
     - Or click the green restart button in the debug toolbar
     - Or close and re-launch with F5

3. **Debugging**

   - Set breakpoints in your TypeScript code
   - Use VSCode's debug console
   - View extension logs in "Output" panel → "Extension Host"

4. **Testing Changes**
   - Create test PRD.md files in the Extension Host window
   - Test all features: checkboxes, assignments, deep links
   - Check the PRD Explorer view in the sidebar
   - Monitor the debug console for errors

### Project Structure

```
prd-manager/
├── .vscode/
│   ├── launch.json          # Launch configurations
│   └── tasks.json           # Build tasks
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── mcpServer.ts         # MCP server implementation
│   ├── prdTreeProvider.ts   # Tree view provider
│   ├── prdDecorationProvider.ts  # Text decorations
│   └── prdCodeLensProvider.ts    # CodeLens provider
├── syntaxes/
│   └── prd.tmLanguage.json  # Syntax highlighting rules
├── images/                   # Extension icons and screenshots
├── out/                      # Compiled JavaScript (git ignored)
├── node_modules/            # Dependencies (git ignored)
├── .gitignore               # Git ignore file
├── .vscodeignore            # Files to exclude from extension package
├── CHANGELOG.md             # Change log
├── package.json             # Extension manifest
├── package-lock.json        # Locked dependencies
├── tsconfig.json            # TypeScript configuration
└── README.md               # This file
```

### Common Development Tasks

**Available Scripts**

```bash
# Development
npm run compile     # Build TypeScript
npm run watch       # Watch mode for development
npm run lint        # Run ESLint
npm run test        # Run tests

# Packaging & Publishing
npm run package     # Create .vsix file for testing
npm run package:pre # Create pre-release .vsix
npm run build:prod  # Clean, compile, and package

# Publishing (requires vsce login)
npm run publish       # Publish current version
npm run publish:patch # Bump patch version and publish (1.0.0 → 1.0.1)
npm run publish:minor # Bump minor version and publish (1.0.0 → 1.1.0)
npm run publish:major # Bump major version and publish (1.0.0 → 2.0.0)
npm run publish:pre   # Publish as pre-release

# Utilities
npm run clean       # Remove build artifacts and .vsix files
```

**Watch Mode Development**

```bash
# Terminal 1: Auto-compile TypeScript
npm run watch

# Terminal 2: Run tests in watch mode
npm run watch-tests
```

**Run Extension**

- Press `F5` to launch Extension Development Host
- Or use "Debug: Start Debugging" from Command Palette

**Package for Testing**

```bash
npm run package
# Creates prd-manager-1.0.0.vsix for local testing
```

**Lint Code**

```bash
npm run lint
# Auto-fix issues
npm run lint -- --fix
```

**Compile TypeScript**

```bash
npm run compile
```

**Package Extension**

```bash
npm install -g @vscode/vsce
vsce package
# Creates prd-manager-1.0.0.vsix
```

### Debugging Tips

1. **Set Breakpoints**: Click in the gutter next to line numbers in `src/` files
2. **Debug Console**: Use for evaluating expressions while debugging
3. **Extension Host Logs**: View → Output → Select "Extension Host" from dropdown
4. **Developer Tools**: Help → Toggle Developer Tools (for UI debugging)

## 📦 Publishing to Marketplace

### Prerequisites

1. **Create Publisher Account**

   - Go to https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create a publisher ID

2. **Get Personal Access Token**

   - Visit https://dev.azure.com/your-org
   - Go to User Settings → Personal Access Tokens
   - Create token with "Marketplace (Publish)" scope

3. **Install VSCE (Visual Studio Code Extension Manager)**
   ```bash
   npm install -g @vscode/vsce
   ```

### Publishing Steps

1. **Update Version**

   ```bash
   # Update version in package.json
   npm version patch  # or minor/major
   ```

2. **Package Extension**

   ```bash
   vsce package
   ```

3. **Publish**

   ```bash
   vsce publish -p <your-personal-access-token>
   # or login once
   vsce login <publisher-id>
   vsce publish
   ```

4. **Update Existing Extension**
   ```bash
   vsce publish patch  # Auto-increment version and publish
   ```

### Pre-publish Checklist

- [ ] Update CHANGELOG.md
- [ ] Test all features in clean environment
- [ ] Update README with new features
- [ ] Add/update screenshots
- [ ] Run linter: `npm run lint`
- [ ] Run tests: `npm test`
- [ ] Check package size: `vsce ls`
- [ ] Verify LICENSE file exists

## ⚙️ Extension Settings

Configure PRD Manager through VSCode settings:

- `prdManager.mcpServer.enabled`: Enable/disable MCP server for AI integration (default: `true`)
- `prdManager.mcpServer.port`: Port for MCP server (default: `3000`)
- `prdManager.autoGenerateIds`: Automatically generate task IDs (default: `true`)
- `prdManager.idFormat`: ID generation strategy - `"sequential"` or `"timestamp"` (default: `"sequential"`)
- `prdManager.showCodeLens`: Show inline task actions (default: `true`)
- `prdManager.decorateAssignees`: Highlight @-mentions (default: `true`)
- `prdManager.decorateDeepLinks`: Make task IDs clickable (default: `true`)
- `prdManager.additionalFiles`: List of specific files to enhance with PRD Manager features (default: `[]`)
  - Example: `["CLAUDE.md", "TODO.md", "TASKS.md"]`
  - These files will have all PRD Manager features enabled regardless of their naming pattern

## 🐛 Known Issues

- Task IDs might regenerate if file is edited outside VSCode
- Large files (>1000 tasks) may have performance impact
- MCP server requires restart after port change

## 📝 Release Notes

### 1.0.0 - Initial Release

- ✅ Interactive checkbox functionality
- 🆔 Automatic task ID generation
- 👥 Task assignment with @-mentions
- 🔗 Deep linking between tasks
- 🤖 MCP server for AI integration
- 📊 Progress tracking and reporting
- 🎨 Syntax highlighting for PRD files

### 1.0.1 - Bug Fixes

- Fixed task ID persistence issue (#12)
- Improved performance for large files (#15)
- Better error handling for MCP connections (#18)

### 1.1.0 - Enhanced Features

- Added bulk task operations (#22)
- Improved assignee autocomplete (#25)
- Export reports to CSV/JSON (#28)
- Cross-file task references (#30)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♀️ Support

- **Documentation**: [Wiki](https://github.com/yourusername/vscode-prd-manager/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/vscode-prd-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/vscode-prd-manager/discussions)
- **Email**: support@prdmanager.dev

## 🏆 Acknowledgments

- Thanks to the VSCode team for the excellent extension API
- Model Context Protocol specification by Anthropic
- All our contributors and early adopters

---

**Made with ❤️ by the PRD Manager Team**
