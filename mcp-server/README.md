# PRD Manager MCP Server

This is a Model Context Protocol (MCP) server that allows AI assistants and Copilots to interact with PRD (Product Requirements Document) tasks managed by the PRD Manager VSCode extension.

## Features

The MCP server provides the following tools for AI assistants:

### Tools Available

1. **`list_tasks`** - List all PRD tasks with optional filtering
   - Parameters:
     - `filter` (optional): "all", "completed", or "uncompleted"
     - `document` (optional): Filter tasks by specific document path
   - Returns: Formatted list of tasks with status, ID, text, assignee, and location

2. **`toggle_task`** - Toggle a task's completion status
   - Parameters:
     - `taskId` (required): The PRD task ID (e.g., "PRD-100001")
   - Returns: Confirmation of the task's new status

3. **`create_task`** - Create a new PRD task
   - Parameters:
     - `text` (required): The task description
     - `assignee` (optional): Assignee username (e.g., "@username-copilot")
     - `document` (optional): Target document path (defaults to first PRD file found)
   - Returns: Details of the newly created task

4. **`assign_task`** - Assign a task to someone
   - Parameters:
     - `taskId` (required): The PRD task ID
     - `assignee` (required): Assignee username (e.g., "@username-copilot")
   - Returns: Confirmation of task assignment

5. **`get_task`** - Get detailed information about a specific task
   - Parameters:
     - `taskId` (required): The PRD task ID
   - Returns: Detailed task information including status, assignee, location, subtasks, and headers

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- PRD Manager VSCode extension installed

### Build the Server

```bash
cd mcp-server
npm install
npm run build
```

### Test the Server

```bash
# Test basic functionality
npm test

# Use MCP Inspector for interactive testing
npm run inspector

# Test with specific workspace
WORKSPACE_ROOT=/path/to/your/workspace npm run start
```

## Usage

### From VSCode Extension

The PRD Manager VSCode extension includes built-in MCP server integration:

1. Open Command Palette (`Cmd+Shift+P`)
2. Run "PRD: Start MCP Server"
3. Use "PRD: List Tasks via MCP" or "PRD: Create Task via MCP"

### From Claude Desktop

Add this configuration to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "prd-manager": {
      "command": "node",
      "args": ["/path/to/prd-manager-vscode/mcp-server/build/index.js"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/workspace"
      }
    }
  }
}
```

### From Other MCP Clients

The server uses stdio transport and follows the MCP specification. Example usage:

```bash
# Start the server
WORKSPACE_ROOT=/path/to/workspace node build/index.js

# Send JSON-RPC requests via stdin
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tasks","arguments":{"filter":"all"}}}' | WORKSPACE_ROOT=/path/to/workspace node build/index.js
```

## API Examples

### List All Tasks
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_tasks",
    "arguments": {
      "filter": "all"
    }
  }
}
```

### Create a New Task
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "create_task",
    "arguments": {
      "text": "Implement user authentication",
      "assignee": "@john-copilot"
    }
  }
}
```

### Toggle Task Completion
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "toggle_task",
    "arguments": {
      "taskId": "PRD-100001"
    }
  }
}
```

## Environment Variables

- `WORKSPACE_ROOT`: Path to the workspace containing PRD files (defaults to current directory)

## File Format Support

The server works with markdown files containing tasks in the PRD Manager format:

```markdown
## Feature Section

- [ ] Task description PRD-100001
- [x] Completed task @assignee PRD-100002
  - [ ] Subtask PRD-100003
- [ ] Another task @john-copilot PRD-100004
```

## Error Handling

The server provides detailed error messages for:
- Invalid task IDs
- Missing PRD files
- Malformed task requests
- File system errors

## Development

### Project Structure
```
mcp-server/
├── src/
│   ├── index.ts           # Main MCP server
│   └── prd-task-manager.ts # Task management logic
├── test/
│   └── test-server.js     # Basic testing script
├── build/                 # Compiled JavaScript
└── package.json
```

### Adding New Tools

1. Define the tool schema in `src/index.ts`
2. Add the tool to the `ListToolsRequestSchema` handler
3. Implement the tool logic in the `CallToolRequestSchema` handler
4. Add corresponding methods to `PrdTaskManager` if needed

### Testing

- `npm test` - Run basic functionality tests
- `npm run inspector` - Use MCP Inspector for interactive testing
- `npm run dev` - Build and start server for development

## Integration with AI Assistants

This MCP server enables AI assistants to:

- **Read task status** - Get current state of all PRD tasks
- **Modify tasks** - Toggle completion, assign to team members
- **Create new work** - Add tasks to PRD documents
- **Track progress** - Monitor completion rates and assignments
- **Navigate projects** - Understand task relationships and hierarchy

The server maintains file system consistency and integrates seamlessly with the VSCode extension's task tracking.