import * as vscode from 'vscode';
import { PrdTask } from '../models/task';

export class PrdTaskManager {
    private tasks: Map<string, PrdTask[]> = new Map();
    private taskById: Map<string, PrdTask> = new Map();
    private _onTasksChanged = new vscode.EventEmitter<void>();
    public readonly onTasksChanged = this._onTasksChanged.event;
    private idCounter = 0;
    private isProcessing = false;

    private readonly taskRegex = /^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(?:<!--\s*(PRD-\d{6})\s*-->)?$/gm;
    private readonly taskIdRegex = /PRD-\d{6}/g;

    async processDocument(document: vscode.TextDocument): Promise<void> {
        // Skip if we're already processing to avoid loops
        if (this.isProcessing) {
            return;
        }

        console.log('Processing document:', document.fileName);

        const allTasks: PrdTask[] = [];
        const content = document.getText();
        const lines = content.split('\n');
        let modified = false;
        let currentHeaders: { level: number; text: string; line: number }[] = [];

        // Clear existing tasks for this document
        const existingTasks = this.tasks.get(document.uri.toString()) || [];
        existingTasks.forEach(task => this.taskById.delete(task.id));

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for headers
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                const level = headerMatch[1].length;
                const headerText = headerMatch[2];
                
                // Remove headers at the same or deeper level
                currentHeaders = currentHeaders.filter(h => h.level < level);
                currentHeaders.push({ level, text: headerText, line: i });
                continue;
            }
            
            const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(?:<!--\s*(PRD-\d{6})\s*-->)?$/);
            
            if (match) {
                const [, indent, bullet, checked, text, assignee, existingId] = match;
                let taskId = existingId;

                // Generate ID if missing
                if (!taskId && this.getConfig('autoGenerateIds')) {
                    taskId = this.generateTaskId();
                    // Preserve the original bullet type
                    lines[i] = `${indent}${bullet} [${checked}] ${text}${assignee ? ` @${assignee}` : ''} <!-- ${taskId} -->`;
                    modified = true;
                }

                if (taskId) {
                    const task: PrdTask = {
                        id: taskId,
                        text: text.trim(),
                        completed: checked === 'x',
                        assignee: assignee,
                        line: i,
                        document: document.uri,
                        children: [],
                        headers: [...currentHeaders] // Store the current header context
                    } as PrdTask & { headers?: { level: number; text: string; line: number }[] };

                    allTasks.push(task);
                    this.taskById.set(taskId, task);
                }
            }
        }

        if (modified) {
            this.isProcessing = true;
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(lines.length - 1, lines[lines.length - 1].length)
            );
            edit.replace(document.uri, fullRange, lines.join('\n'));
            await vscode.workspace.applyEdit(edit);
            this.isProcessing = false;
        }

        // Build task hierarchy based on indentation
        this.buildTaskHierarchy(allTasks, lines);
        this.tasks.set(document.uri.toString(), allTasks);
        
        console.log(`Found ${allTasks.length} tasks in ${document.fileName}`);
        allTasks.forEach(task => {
            console.log(`  - ${task.id}: ${task.text}`);
        });
        
        this._onTasksChanged.fire();
    }

    private buildTaskHierarchy(tasks: PrdTask[], lines: string[]): void {
        const stack: { task: PrdTask; indent: number }[] = [];

        tasks.forEach(task => {
            const line = lines[task.line];
            const indent = this.getIndentLevel(line);

            // Pop tasks from stack that are at the same or deeper level
            while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            // If there's a parent task in the stack, make this task its child
            if (stack.length > 0) {
                const parent = stack[stack.length - 1].task;
                parent.children.push(task);
                task.parent = parent;
            }

            stack.push({ task, indent });
        });
    }

    private getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        if (match) {
            // Count spaces (each space = 1) or tabs (each tab = 4)
            return match[1].split('').reduce((count, char) => {
                return count + (char === '\t' ? 4 : 1);
            }, 0);
        }
        return 0;
    }

    async toggleTaskById(taskId: string): Promise<void> {
        const task = this.taskById.get(taskId);
        if (!task) {
            vscode.window.showErrorMessage(`Task ${taskId} not found`);
            return;
        }

        // Read the file content directly without opening in editor
        const fileContent = await vscode.workspace.fs.readFile(task.document);
        const text = Buffer.from(fileContent).toString('utf8');
        const lines = text.split('\n');
        
        if (task.line >= lines.length) {
            vscode.window.showErrorMessage(`Task line ${task.line} out of bounds`);
            return;
        }

        const line = lines[task.line];
        const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(?:<!--\s*(PRD-\d{6})\s*-->)?$/);

        if (match) {
            const [, indent, bullet, checked, taskText, assignee, foundTaskId] = match;
            
            // Verify we're toggling the right task
            if (foundTaskId !== taskId) {
                vscode.window.showErrorMessage(`Task mismatch: expected ${taskId}, found ${foundTaskId}`);
                return;
            }

            const newChecked = checked === ' ' ? 'x' : ' ';
            lines[task.line] = `${indent}${bullet} [${newChecked}] ${taskText}${assignee ? ` @${assignee}` : ''}${foundTaskId ? ` <!-- ${foundTaskId} -->` : ''}`;

            // Write the file back
            this.isProcessing = true;
            const newContent = lines.join('\n');
            await vscode.workspace.fs.writeFile(task.document, Buffer.from(newContent, 'utf8'));
            this.isProcessing = false;

            // Update task in memory
            task.completed = newChecked === 'x';
            
            // If the document is open, refresh it
            const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === task.document.toString());
            if (openDoc) {
                // The file watcher will pick up the change and update the document
                // We just need to ensure our model is updated
                setTimeout(() => this.processDocument(openDoc), 200);
            }
            
            this._onTasksChanged.fire();
        }
    }

    async toggleTaskAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
        const line = document.lineAt(position.line);
        const match = line.text.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(?:<!--\s*(PRD-\d{6})\s*-->)?$/);

        if (match) {
            const [, indent, bullet, checked, text, assignee, taskId] = match;
            
            if (taskId) {
                // If we have a task ID, use that for accuracy
                await this.toggleTaskById(taskId);
            } else {
                // Otherwise toggle inline without ID
                const newChecked = checked === ' ' ? 'x' : ' ';
                const newLine = `${indent}${bullet} [${newChecked}] ${text}${assignee ? ` @${assignee}` : ''}`;

                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, line.range, newLine);
                await vscode.workspace.applyEdit(edit);
            }
        }
    }

    async addTask(editor: vscode.TextEditor, taskText: string, assignee?: string): Promise<void> {
        const position = editor.selection.active;
        const line = position.line;
        const taskId = this.generateTaskId();
        const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ''} <!-- ${taskId} -->`;

        this.isProcessing = true;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, new vscode.Position(line + 1, 0), taskLine + '\n');
        await vscode.workspace.applyEdit(edit);
        this.isProcessing = false;
    }

    async addTaskAtPosition(editor: vscode.TextEditor, position: vscode.Position, taskText: string, assignee?: string): Promise<void> {
        const line = position.line;
        const taskId = this.generateTaskId();
        const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ''} <!-- ${taskId} -->`;

        this.isProcessing = true;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(editor.document.uri, new vscode.Position(line + 1, 0), taskLine + '\n');
        await vscode.workspace.applyEdit(edit);
        this.isProcessing = false;
    }

    async addTaskToHeader(editor: vscode.TextEditor, headerLine: number, headerLevel: number, headerText: string, taskText: string, assignee?: string): Promise<void> {
        const document = editor.document;
        const lines = document.getText().split('\n');
        
        // Find where to insert the task
        let insertLine = headerLine;
        let foundNextSection = false;
        
        // Look for the next header at the same or higher level
        for (let i = headerLine + 1; i < lines.length; i++) {
            const line = lines[i];
            const nextHeaderMatch = line.match(/^(#{1,6})\s+/);
            
            if (nextHeaderMatch) {
                const nextLevel = nextHeaderMatch[1].length;
                if (nextLevel <= headerLevel) {
                    // Found a header at same or higher level, insert before it
                    insertLine = i - 1;
                    foundNextSection = true;
                    break;
                }
            }
        }
        
        if (!foundNextSection) {
            // No next section found, find the last non-empty line
            for (let i = lines.length - 1; i > headerLine; i--) {
                if (lines[i].trim() !== '') {
                    insertLine = i;
                    break;
                }
            }
        }
        
        // Check if there's already content right after the header
        let hasContentAfterHeader = false;
        if (headerLine + 1 < lines.length) {
            const nextLine = lines[headerLine + 1].trim();
            hasContentAfterHeader = nextLine !== '' && !nextLine.match(/^#/);
        }

        const taskId = this.generateTaskId();
        // No indentation - tasks should be at the beginning of the line
        const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ''} <!-- ${taskId} -->`;

        this.isProcessing = true;
        const edit = new vscode.WorkspaceEdit();
        
        // Determine where and how to insert
        if (insertLine === headerLine) {
            // Insert right after header with a blank line
            edit.insert(document.uri, new vscode.Position(headerLine + 1, 0), '\n' + taskLine + '\n');
        } else {
            // Insert after the last relevant line
            const insertAfterLine = lines[insertLine];
            if (insertAfterLine.trim() !== '') {
                // Add newline before task if the line isn't empty
                edit.insert(document.uri, new vscode.Position(insertLine + 1, 0), taskLine + '\n');
            } else {
                // Replace empty line
                edit.replace(document.uri, new vscode.Range(insertLine, 0, insertLine + 1, 0), taskLine + '\n');
            }
        }
        
        await vscode.workspace.applyEdit(edit);
        this.isProcessing = false;
    }

    private getLastChildLine(task: PrdTask): number {
        let lastLine = task.line;
        task.children.forEach(child => {
            lastLine = Math.max(lastLine, this.getLastChildLine(child));
        });
        return lastLine;
    }

    async assignTask(taskId: string, assignee: string): Promise<void> {
        const task = this.taskById.get(taskId);
        if (!task) return;

        // Read the file content directly without opening in editor
        const fileContent = await vscode.workspace.fs.readFile(task.document);
        const text = Buffer.from(fileContent).toString('utf8');
        const lines = text.split('\n');
        
        if (task.line >= lines.length) {
            vscode.window.showErrorMessage(`Task line ${task.line} out of bounds`);
            return;
        }

        let line = lines[task.line];

        // Remove existing assignee if present
        line = line.replace(/@[\w-]+(?:-copilot)?/, '').trim();
        
        // Add new assignee before the task ID comment
        line = line.replace(/(\s*<!--\s*PRD-\d{6}\s*-->)$/, ` ${assignee}$1`);

        lines[task.line] = line;

        // Write the file back
        this.isProcessing = true;
        const newContent = lines.join('\n');
        await vscode.workspace.fs.writeFile(task.document, Buffer.from(newContent, 'utf8'));
        this.isProcessing = false;

        // Update task in memory
        task.assignee = assignee.replace('@', '');
        
        // If the document is open, refresh it
        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === task.document.toString());
        if (openDoc) {
            setTimeout(() => this.processDocument(openDoc), 200);
        }
        
        this._onTasksChanged.fire();
    }

    getTaskIdAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        const line = document.lineAt(position.line);
        const match = line.text.match(/<!--\s*(PRD-\d{6})\s*-->/);
        return match ? match[1] : undefined;
    }

    async generateProgressReport(): Promise<string> {
        let totalTasks = 0;
        let completedTasks = 0;
        const tasksByAssignee = new Map<string, { total: number; completed: number }>();

        this.taskById.forEach(task => {
            totalTasks++;
            if (task.completed) completedTasks++;

            if (task.assignee) {
                const stats = tasksByAssignee.get(task.assignee) || { total: 0, completed: 0 };
                stats.total++;
                if (task.completed) stats.completed++;
                tasksByAssignee.set(task.assignee, stats);
            }
        });

        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        let report = `# PRD Progress Report\n\n`;
        report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
        report += `## Overall Progress\n\n`;
        report += `- Total Tasks: ${totalTasks}\n`;
        report += `- Completed: ${completedTasks}\n`;
        report += `- Remaining: ${totalTasks - completedTasks}\n`;
        report += `- Completion: ${completionPercentage}%\n\n`;

        if (tasksByAssignee.size > 0) {
            report += `## Progress by Assignee\n\n`;
            report += `| Assignee | Total | Completed | Progress |\n`;
            report += `|----------|-------|-----------|----------|\n`;

            tasksByAssignee.forEach((stats, assignee) => {
                const percentage = Math.round((stats.completed / stats.total) * 100);
                report += `| ${assignee} | ${stats.total} | ${stats.completed} | ${percentage}% |\n`;
            });
        }

        return report;
    }

    getAllTasks(): PrdTask[] {
        const allTasks: PrdTask[] = [];
        this.tasks.forEach(tasks => allTasks.push(...tasks));
        return allTasks;
    }

    getTasksByDocument(uri: vscode.Uri): PrdTask[] {
        return this.tasks.get(uri.toString()) || [];
    }

    getTaskById(taskId: string): PrdTask | undefined {
        return this.taskById.get(taskId);
    }

    private generateTaskId(): string {
        // Use timestamp + counter to ensure uniqueness
        const timestamp = Date.now().toString().slice(-6);
        const paddedCounter = this.idCounter.toString().padStart(3, '0');
        this.idCounter = (this.idCounter + 1) % 1000; // Reset after 999
        
        // Take last 3 digits of timestamp and append counter
        const id = `PRD-${timestamp.slice(-3)}${paddedCounter}`;
        
        // Ensure uniqueness
        if (this.taskById.has(id)) {
            return this.generateTaskId();
        }
        
        return id;
    }

    private getConfig<T>(key: string): T | undefined {
        return vscode.workspace.getConfiguration('prdManager').get<T>(key);
    }
}