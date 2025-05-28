#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PrdTaskManager } from "./prd-task-manager.js";
// Initialize the PRD task manager
const taskManager = new PrdTaskManager();
// Create the MCP server
const server = new Server({
    name: "prd-manager",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
        resources: {},
    },
});
// Define tool schemas using Zod
const ListTasksSchema = z.object({
    filter: z.enum(["all", "completed", "uncompleted"]).optional().default("all"),
    document: z.string().optional().describe("Filter tasks by document path"),
});
const ToggleTaskSchema = z.object({
    taskId: z.string().describe("The PRD task ID (e.g., PRD-100001)"),
});
const CreateTaskSchema = z.object({
    text: z.string().describe("The task description"),
    assignee: z.string().optional().describe("Optional assignee (e.g., @username-copilot)"),
    document: z.string().optional().describe("Document path (defaults to active document)"),
});
const AssignTaskSchema = z.object({
    taskId: z.string().describe("The PRD task ID"),
    assignee: z.string().describe("Assignee username (e.g., @username-copilot)"),
});
const GetTaskSchema = z.object({
    taskId: z.string().describe("The PRD task ID"),
});
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_tasks",
                description: "List all PRD tasks with optional filtering",
                inputSchema: {
                    type: "object",
                    properties: {
                        filter: {
                            type: "string",
                            enum: ["all", "completed", "uncompleted"],
                            description: "Filter tasks by completion status",
                            default: "all"
                        },
                        document: {
                            type: "string",
                            description: "Filter tasks by document path"
                        }
                    }
                }
            },
            {
                name: "toggle_task",
                description: "Toggle a task's completion status",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "The PRD task ID (e.g., PRD-100001)"
                        }
                    },
                    required: ["taskId"]
                }
            },
            {
                name: "create_task",
                description: "Create a new PRD task",
                inputSchema: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "The task description"
                        },
                        assignee: {
                            type: "string",
                            description: "Optional assignee (e.g., @username-copilot)"
                        },
                        document: {
                            type: "string",
                            description: "Document path (defaults to active document)"
                        }
                    },
                    required: ["text"]
                }
            },
            {
                name: "assign_task",
                description: "Assign a task to someone",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "The PRD task ID"
                        },
                        assignee: {
                            type: "string",
                            description: "Assignee username (e.g., @username-copilot)"
                        }
                    },
                    required: ["taskId", "assignee"]
                }
            },
            {
                name: "get_task",
                description: "Get detailed information about a specific task",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: {
                            type: "string",
                            description: "The PRD task ID"
                        }
                    },
                    required: ["taskId"]
                }
            }
        ]
    };
});
// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "list_tasks": {
                const { filter, document } = ListTasksSchema.parse(args);
                const tasks = await taskManager.listTasks(filter, document);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Found ${tasks.length} tasks:\n\n` +
                                tasks.map(task => `${task.completed ? '✅' : '⬜'} ${task.id}: ${task.text}` +
                                    (task.assignee ? ` (@${task.assignee})` : '') +
                                    ` [${task.document}:${task.line}]`).join('\n')
                        }
                    ]
                };
            }
            case "toggle_task": {
                const { taskId } = ToggleTaskSchema.parse(args);
                const result = await taskManager.toggleTask(taskId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Task ${taskId} marked as ${result.completed ? 'completed' : 'uncompleted'}`
                        }
                    ]
                };
            }
            case "create_task": {
                const { text, assignee, document } = CreateTaskSchema.parse(args);
                const task = await taskManager.createTask(text, assignee, document);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Created task ${task.id}: ${task.text}` +
                                (task.assignee ? ` (assigned to @${task.assignee})` : '')
                        }
                    ]
                };
            }
            case "assign_task": {
                const { taskId, assignee } = AssignTaskSchema.parse(args);
                const task = await taskManager.assignTask(taskId, assignee);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Task ${taskId} assigned to @${task.assignee}`
                        }
                    ]
                };
            }
            case "get_task": {
                const { taskId } = GetTaskSchema.parse(args);
                const task = await taskManager.getTask(taskId);
                if (!task) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Task ${taskId} not found`
                            }
                        ]
                    };
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: `Task Details:\n` +
                                `ID: ${task.id}\n` +
                                `Text: ${task.text}\n` +
                                `Status: ${task.completed ? 'Completed' : 'Uncompleted'}\n` +
                                `Assignee: ${task.assignee || 'Unassigned'}\n` +
                                `Document: ${task.document}\n` +
                                `Line: ${task.line}\n` +
                                `Children: ${task.children.length} subtasks\n` +
                                `Headers: ${task.headers?.map(h => h.text).join(' > ') || 'None'}`
                        }
                    ]
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${errorMessage}`
                }
            ],
            isError: true
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr (not stdout, which is used for MCP protocol)
    console.error("PRD Manager MCP server started");
}
main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map