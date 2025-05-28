import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { PrdTaskManager } from '../managers/prdTaskManager';

export interface McpRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

export interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

export class McpService {
  private server: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, (response: McpResponse) => void>();
  private isInitialized = false;
  private statusBarItem: vscode.StatusBarItem;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private taskManager: PrdTaskManager,
    private context: vscode.ExtensionContext
  ) {
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'prd-manager.toggleMcpServer';
    this.updateStatusBar('stopped');
    this.statusBarItem.show();
    context.subscriptions.push(this.statusBarItem);

    // Create output channel
    this.outputChannel = vscode.window.createOutputChannel('PRD MCP Server');
    context.subscriptions.push(this.outputChannel);
    this.log('PRD MCP Server initialized');
  }

  /**
   * Auto-start the MCP server silently (for extension activation)
   */
  async autoStart(): Promise<void> {
    let serverPath = this.getServerPath();
    if (!serverPath) {
      // Try to build the MCP server first
      this.log('MCP server not found, attempting to build...');
      try {
        this.updateStatusBar('building');
        await this.buildMcpServer();
        serverPath = this.getServerPath();
      } catch (buildError) {
        this.log(`MCP server build failed, skipping auto-start: ${buildError}`, 'error');
        return;
      }
    }

    if (!serverPath) {
      this.log('MCP server still not found after build attempt, skipping auto-start.', 'warn');
      return;
    }

    try {
      await this.start();
      this.log('MCP server auto-started successfully');
      this.updateStatusBar('running');
    } catch (error) {
      // Don't throw on auto-start failure - let user manually start if needed
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`MCP server auto-start failed: ${errorMsg}`, 'error');
      this.updateStatusBar('error');
    }
  }

  /**
   * Build the MCP server automatically
   */
  private async buildMcpServer(): Promise<void> {
    const extensionPath = this.context.extensionPath;
    const mcpServerDir = path.join(extensionPath, 'mcp-server');
    
    // Check if mcp-server directory exists
    try {
      fs.accessSync(mcpServerDir, fs.constants.F_OK);
    } catch {
      throw new Error('MCP server directory not found');
    }

    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: mcpServerDir,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      buildProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      buildProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      buildProcess.on('close', (code: number) => {
        if (code === 0) {
          this.log('MCP server built successfully');
          resolve();
        } else {
          this.log(`MCP server build failed: ${errorOutput}`, 'error');
          reject(new Error(`Build failed with code ${code}: ${errorOutput}`));
        }
      });

      buildProcess.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const serverPath = this.getServerPath();
    if (!serverPath) {
      const extensionPath = this.context.extensionPath;
      const expectedPath = path.join(extensionPath, 'mcp-server', 'build', 'index.js');
      throw new Error(`MCP server not found at ${expectedPath}. Please run 'npm run build' in the extension's mcp-server directory first.`);
    }

    this.log(`Starting MCP server: ${serverPath}`);
    this.outputChannel.show();

    // Set workspace root environment variable to the current workspace (where PRD files are)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    
    this.log(`MCP Server Configuration:`);
    this.log(`  Transport: stdio (no network address/port - communicates via process pipes)`);
    this.log(`  Server Path: ${serverPath}`);
    this.log(`  Workspace: ${workspaceRoot}`);
    this.log(`  Process ID: ${process.pid}`);
    this.log(`  Available Tools: list_tasks, toggle_task, create_task, assign_task, get_task`);
    this.log('');
    
    this.server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr
      env: {
        ...process.env,
        WORKSPACE_ROOT: workspaceRoot
      }
    });

    // Handle server output (JSON-RPC responses)
    this.server.stdout?.on('data', (data) => {
      const response = data.toString();
      try {
        const parsedData = JSON.parse(response);
        
        // Check if it's a response or a notification
        if ('id' in parsedData) {
          // It's a response
          this.handleResponse(parsedData as McpResponse);
        } else if ('method' in parsedData) {
          // It's a server notification
          this.log(`Server notification: ${parsedData.method}`);
        }
      } catch (error) {
        // Not JSON, might be a plain text message
        if (response.trim()) {
          this.log(`Server output: ${response.trim()}`);
        }
      }
    });

    // Handle server stderr (logs and errors)
    this.server.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.log(`Server log: ${message}`, 'info');
      }
    });

    this.server.on('error', (error) => {
      this.log(`MCP server error: ${error.message}`, 'error');
      vscode.window.showErrorMessage(`MCP server error: ${error.message}`);
    });

    this.server.on('exit', (code) => {
      this.log(`MCP server exited with code ${code}`, code === 0 ? 'info' : 'error');
      this.server = null;
      this.isInitialized = false;
      this.updateStatusBar('stopped');
    });

    // Initialize the server
    await this.initialize();
  }

  /**
   * Stop the MCP server
   */
  stop(): void {
    if (this.server) {
      this.server.kill();
      this.server = null;
      this.isInitialized = false;
      this.pendingRequests.clear();
      this.updateStatusBar('stopped');
    }
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.server !== null && !this.server.killed;
  }

  /**
   * List all tasks via MCP
   */
  async listTasks(filter?: 'all' | 'completed' | 'uncompleted', document?: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP server not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: 'list_tasks',
      arguments: {
        filter: filter || 'all',
        ...(document && { document })
      }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to list tasks');
    }

    return response.result?.content?.[0]?.text || 'No tasks found';
  }

  /**
   * Toggle a task via MCP
   */
  async toggleTask(taskId: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP server not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: 'toggle_task',
      arguments: { taskId }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to toggle task');
    }

    return response.result?.content?.[0]?.text || 'Task toggled';
  }

  /**
   * Create a task via MCP
   */
  async createTask(text: string, assignee?: string, document?: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP server not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: 'create_task',
      arguments: {
        text,
        ...(assignee && { assignee }),
        ...(document && { document })
      }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create task');
    }

    return response.result?.content?.[0]?.text || 'Task created';
  }

  /**
   * Get task details via MCP
   */
  async getTask(taskId: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP server not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: 'get_task',
      arguments: { taskId }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get task');
    }

    return response.result?.content?.[0]?.text || 'Task not found';
  }

  /**
   * Assign a task via MCP
   */
  async assignTask(taskId: string, assignee: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP server not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: 'assign_task',
      arguments: { taskId, assignee }
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to assign task');
    }

    return response.result?.content?.[0]?.text || 'Task assigned';
  }

  /**
   * Initialize the MCP server
   */
  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: 'prd-manager-vscode',
        version: '1.0.0'
      }
    });

    if (response.error) {
      throw new Error(`Failed to initialize MCP server: ${response.error.message}`);
    }

    this.isInitialized = true;
    this.log('MCP server initialized successfully');
    this.log('Server is ready to accept tool calls from AI assistants');
    this.updateStatusBar('running');
  }

  /**
   * Update status bar item
   */
  private updateStatusBar(status: 'stopped' | 'running' | 'error' | 'building'): void {
    switch (status) {
      case 'stopped':
        this.statusBarItem.text = '$(circle-outline) MCP Server';
        this.statusBarItem.tooltip = 'MCP Server: Stopped (click to start)';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'running':
        this.statusBarItem.text = '$(check-all) MCP Server';
        this.statusBarItem.tooltip = 'MCP Server: Running (click to stop)';
        this.statusBarItem.backgroundColor = undefined;
        break;
      case 'error':
        this.statusBarItem.text = '$(error) MCP Server';
        this.statusBarItem.tooltip = 'MCP Server: Error (click to retry)';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      case 'building':
        this.statusBarItem.text = '$(loading~spin) MCP Server';
        this.statusBarItem.tooltip = 'MCP Server: Building...';
        this.statusBarItem.backgroundColor = undefined;
        break;
    }
  }

  /**
   * Log to output channel
   */
  private log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
    this.outputChannel.appendLine(`${timestamp} ${prefix} ${message}`);
  }

  /**
   * Send a request to the MCP server
   */
  private async sendRequest(method: string, params: any): Promise<McpResponse> {
    if (!this.server || !this.server.stdin) {
      throw new Error('MCP server not available');
    }

    const id = ++this.requestId;
    const request: McpRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    // Log tool calls
    if (method === 'tools/call') {
      this.log(`Calling tool: ${params.name} with arguments: ${JSON.stringify(params.arguments)}`);
    }

    return new Promise((resolve, reject) => {
      // Set up response handler
      this.pendingRequests.set(id, resolve);

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('MCP request timeout'));
      }, 10000);

      // Send request
      try {
        this.server!.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      }

      // Clean up timeout when resolved
      const originalResolve = resolve;
      this.pendingRequests.set(id, (response) => {
        clearTimeout(timeout);
        
        // Log tool responses
        if (method === 'tools/call' && response.result?.content?.[0]?.text) {
          const resultPreview = response.result.content[0].text.split('\n')[0].substring(0, 100);
          this.log(`Tool ${params.name} completed: ${resultPreview}${response.result.content[0].text.length > 100 ? '...' : ''}`);
        }
        
        originalResolve(response);
      });
    });
  }

  /**
   * Handle responses from the MCP server
   */
  private handleResponse(response: McpResponse): void {
    const handler = this.pendingRequests.get(response.id);
    if (handler) {
      this.pendingRequests.delete(response.id);
      handler(response);
    }
  }

  /**
   * Get the path to the MCP server executable
   */
  private getServerPath(): string | null {
    // Get the extension's installation path from the context
    const extensionPath = this.context.extensionPath;
    const serverPath = path.join(extensionPath, 'mcp-server', 'build', 'index.js');
    
    try {
      // Check if the server exists
      fs.accessSync(serverPath, fs.constants.F_OK);
      console.log('Found MCP server at:', serverPath);
      return serverPath;
    } catch (error) {
      console.error('MCP server not found at:', serverPath, error);
      return null;
    }
  }
}