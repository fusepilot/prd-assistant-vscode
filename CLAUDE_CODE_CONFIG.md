# Configuring Claude Code to Use PRD Manager MCP Server

This guide explains how to configure Claude Code to connect to the PRD Manager's built-in Model Context Protocol (MCP) server.

> **Note**: The PRD Manager extension includes an MCP server that starts automatically when you open VSCode. However, to use it with Claude Code, you need to configure Claude Code to connect to it.

## Prerequisites

- Node.js installed on your system
- PRD Manager VSCode extension installed
- Claude Code desktop application

## Step 1: Locate Claude Code Configuration File

The configuration file location depends on your operating system:

### macOS/Linux
```
~/.config/claude/claude_desktop_config.json
```

### Windows
```
%APPDATA%\Claude\claude_desktop_config.json
```

## Step 2: Find Your Extension Installation Path

The MCP server is bundled inside the VSCode extension. To find the exact path:

1. **Option A: Check VSCode Extensions Panel**
   - Open VSCode
   - Go to Extensions (⇧⌘X on macOS, Ctrl+Shift+X on Windows/Linux)
   - Find "PRD Manager" in your installed extensions
   - The extension ID will be shown (when published, it will be something like `publisher.prd-manager`)

2. **Option B: Find Extension Directory**
   - macOS/Linux: `~/.vscode/extensions/`
   - Windows: `%USERPROFILE%\.vscode\extensions\`
   - Look for a folder named like `prd-manager-0.0.1` (for development) or `publisher.prd-manager-0.0.1` (when published)

3. **Option C: For Development**
   If you're developing the extension locally, the path would be your workspace directory:
   ```
   /path/to/your/prd-manager-vscode/mcp-server/build/index.js
   ```

The full path to the MCP server will typically be:
```
~/.vscode/extensions/prd-manager-0.0.1/mcp-server/build/index.js
```

## Step 3: Configure Claude Code

Open the Claude Code configuration file in a text editor and add the MCP server configuration:

```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "/Users/[your-username]/.vscode/extensions/publisher.prd-manager-0.0.1/mcp-server/build/index.js"
      ],
      "transport": "stdio"
    }
  }
}
```

### Example Configuration (macOS)
```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "/Users/johndoe/.vscode/extensions/prd-manager-0.0.1/mcp-server/build/index.js"
      ],
      "transport": "stdio"
    }
  }
}
```

### Development Configuration (macOS)
If you're developing the extension locally:
```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "/Users/michael/Workspace/prd-manager-vscode/mcp-server/build/index.js"
      ],
      "transport": "stdio",
      "env": {
        "WORKSPACE_ROOT": "/Users/michael/Workspace/prd-manager-vscode"
      }
    }
  }
}
```

### Example Configuration (Windows)
```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "C:\\Users\\johndoe\\.vscode\\extensions\\prd-manager-0.0.1\\mcp-server\\build\\index.js"
      ],
      "transport": "stdio"
    }
  }
}
```

## Step 4: Verify Configuration

1. **Restart Claude Code** - Close and reopen the Claude Code application

2. **Check MCP Connection**
   - In Claude Code, you should see "prd-manager" listed as an available MCP server
   - Try using MCP commands like listing tasks or creating new tasks

3. **Test Commands**
   - Ask Claude to "list all PRD tasks using the prd-manager MCP server"
   - Ask Claude to "create a new task in the current project using the prd-manager tool"
   - Ask Claude to "toggle task PRD-100001"
   
4. **Available MCP Tools**
   The PRD Manager MCP server provides these tools:
   - `list_tasks` - List all tasks with filtering options
   - `toggle_task` - Toggle a task's completion status
   - `create_task` - Create a new task with optional assignee
   - `assign_task` - Assign a task to a user
   - `get_task` - Get details about a specific task

## Troubleshooting

### Server Not Found
- Verify the extension is installed in VSCode
- Check that the path in your configuration matches the actual installation path
- Ensure the `mcp-server/build/index.js` file exists in the extension directory

### Node.js Issues
- Ensure Node.js is installed: `node --version`
- Try using the full path to node: `/usr/local/bin/node` or `C:\Program Files\nodejs\node.exe`

### Permission Issues
- On macOS/Linux, ensure the MCP server file has execute permissions:
  ```bash
  chmod +x ~/.vscode/extensions/publisher.prd-manager-*/mcp-server/build/index.js
  ```

### Configuration Not Loading
- Ensure the JSON syntax is valid (no trailing commas, proper quotes)
- Check that the configuration file is in the correct location
- Look for error messages in Claude Code's developer console

## Advanced Configuration

### Multiple Workspaces
If you work with multiple VSCode workspaces, you can configure the MCP server to target a specific workspace:

```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "/path/to/extension/mcp-server/build/index.js",
        "--workspace",
        "/path/to/your/project"
      ],
      "transport": "stdio"
    }
  }
}
```

### Environment Variables
You can also pass environment variables to the MCP server:

```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": [
        "/path/to/extension/mcp-server/build/index.js"
      ],
      "transport": "stdio",
      "env": {
        "PRD_WORKSPACE": "/path/to/your/project",
        "DEBUG": "prd-manager:*"
      }
    }
  }
}
```

## Security Considerations

- The MCP server runs with the same permissions as Claude Code
- It can read and modify files in your workspace
- Only configure trusted MCP servers
- Review the extension's permissions in VSCode

## Getting Help

If you encounter issues:
1. Check the PRD Manager extension logs in VSCode
2. Look for error messages in Claude Code's console
3. Verify all paths are correct for your system
4. Ensure you're using compatible versions of all components