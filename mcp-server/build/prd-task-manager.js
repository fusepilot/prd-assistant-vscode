import * as fs from 'fs/promises';
import { glob } from 'glob';
export class PrdTaskManager {
    workspaceRoot;
    constructor(workspaceRoot) {
        // Try to detect workspace root from environment or current directory
        this.workspaceRoot = workspaceRoot ||
            process.env.WORKSPACE_ROOT ||
            process.cwd();
    }
    /**
     * List all tasks with optional filtering
     */
    async listTasks(filter = 'all', documentPath) {
        const tasks = await this.getAllTasks(documentPath);
        switch (filter) {
            case 'completed':
                return tasks.filter(task => task.completed);
            case 'uncompleted':
                return tasks.filter(task => !task.completed);
            default:
                return tasks;
        }
    }
    /**
     * Get a specific task by ID
     */
    async getTask(taskId) {
        const tasks = await this.getAllTasks();
        return tasks.find(task => task.id === taskId) || null;
    }
    /**
     * Toggle a task's completion status
     */
    async toggleTask(taskId) {
        const task = await this.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        // Read the document
        const content = await fs.readFile(task.document, 'utf-8');
        const lines = content.split('\n');
        // Update the task line
        const line = lines[task.line];
        const newLine = task.completed
            ? line.replace(/\[x\]/, '[ ]') // Mark as uncompleted
            : line.replace(/\[ \]/, '[x]'); // Mark as completed
        lines[task.line] = newLine;
        // Write back to file
        await fs.writeFile(task.document, lines.join('\n'));
        // Return updated task
        task.completed = !task.completed;
        return task;
    }
    /**
     * Create a new task
     */
    async createTask(text, assignee, documentPath) {
        // If no document specified, try to find the first PRD file
        let targetDocument = documentPath;
        if (!targetDocument) {
            const prdFiles = await this.findPrdFiles();
            if (prdFiles.length === 0) {
                throw new Error('No PRD files found in workspace');
            }
            targetDocument = prdFiles[0];
        }
        // Generate new task ID
        const tasks = await this.getAllTasks();
        const taskId = this.generateNewTaskId(tasks);
        // Read the document
        const content = await fs.readFile(targetDocument, 'utf-8');
        const lines = content.split('\n');
        // Create the task line
        const assigneeText = assignee ? ` @${assignee.replace('@', '')}` : '';
        const taskLine = `- [ ] ${text}${assigneeText} ${taskId}`;
        // Find a good place to insert the task (after the last task or at the end)
        let insertIndex = lines.length;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (this.isTaskLine(lines[i])) {
                insertIndex = i + 1;
                break;
            }
        }
        // Insert the new task
        lines.splice(insertIndex, 0, taskLine);
        // Write back to file
        await fs.writeFile(targetDocument, lines.join('\n'));
        // Return the new task
        return {
            id: taskId,
            text,
            completed: false,
            assignee: assignee?.replace('@', ''),
            document: targetDocument,
            line: insertIndex,
            children: []
        };
    }
    /**
     * Assign a task to someone
     */
    async assignTask(taskId, assignee) {
        const task = await this.getTask(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        // Read the document
        const content = await fs.readFile(task.document, 'utf-8');
        const lines = content.split('\n');
        // Update the task line
        const line = lines[task.line];
        const cleanAssignee = assignee.replace('@', '');
        // Remove existing assignee and add new one
        const taskRegex = /^(\s*)(-|\*|\d+\.)\s+\[([x ])\]\s+(.*?)(?:\s+@[\w-]+(?:-copilot)?)?\s*(PRD-\d{6})$/;
        const match = line.match(taskRegex);
        if (match) {
            const [, indent, bullet, checked, text, prdId] = match;
            const newLine = `${indent}${bullet} [${checked}] ${text} @${cleanAssignee} ${prdId}`;
            lines[task.line] = newLine;
            // Write back to file
            await fs.writeFile(task.document, lines.join('\n'));
            // Update task object
            task.assignee = cleanAssignee;
        }
        return task;
    }
    /**
     * Get all tasks from PRD files
     */
    async getAllTasks(documentPath) {
        const tasks = [];
        const documents = documentPath ? [documentPath] : await this.findPrdFiles();
        for (const doc of documents) {
            try {
                const docTasks = await this.parseTasksFromDocument(doc);
                tasks.push(...docTasks);
            }
            catch (error) {
                console.error(`Error parsing tasks from ${doc}:`, error);
            }
        }
        return tasks;
    }
    /**
     * Parse tasks from a single document
     */
    async parseTasksFromDocument(documentPath) {
        const content = await fs.readFile(documentPath, 'utf-8');
        const lines = content.split('\n');
        const tasks = [];
        const headers = [];
        const taskStack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for headers
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                const level = headerMatch[1].length;
                const text = headerMatch[2];
                // Remove headers of same or lower level
                while (headers.length > 0 && headers[headers.length - 1].level >= level) {
                    headers.pop();
                }
                headers.push({ text, level, line: i });
                continue;
            }
            // Check for task lines
            if (this.isTaskLine(line)) {
                const task = this.parseTaskLine(line, i, documentPath);
                if (task) {
                    // Add current headers to task
                    task.headers = [...headers];
                    // Determine if this is a subtask based on indentation
                    const indent = line.match(/^(\s*)/)?.[1].length || 0;
                    // Find parent task based on indentation
                    while (taskStack.length > 0) {
                        const lastTask = taskStack[taskStack.length - 1];
                        const lastIndent = this.getTaskIndent(lastTask.document, lastTask.line);
                        if (lastIndent < indent) {
                            // This is a child of the last task
                            lastTask.children.push(task);
                            taskStack.push(task);
                            break;
                        }
                        else {
                            // Remove tasks with same or greater indentation
                            taskStack.pop();
                        }
                    }
                    if (taskStack.length === 0 || this.getTaskIndent(taskStack[taskStack.length - 1].document, taskStack[taskStack.length - 1].line) >= indent) {
                        // This is a top-level task
                        tasks.push(task);
                        taskStack.length = 0;
                        taskStack.push(task);
                    }
                }
            }
        }
        return tasks;
    }
    /**
     * Check if a line is a task line
     */
    isTaskLine(line) {
        return /^(\s*)(-|\*|\d+\.)\s+\[([x ])\]/.test(line);
    }
    /**
     * Parse a task line into a PrdTask object
     */
    parseTaskLine(line, lineNumber, document) {
        const taskRegex = /^(\s*)(-|\*|\d+\.)\s+\[([x ])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/;
        const match = line.match(taskRegex);
        if (!match)
            return null;
        const [, , , checked, text, assignee, id] = match;
        return {
            id: id || 'NO-ID',
            text: text.trim(),
            completed: checked === 'x',
            assignee,
            document,
            line: lineNumber,
            children: []
        };
    }
    /**
     * Get task indentation level
     */
    getTaskIndent(document, line) {
        // This would need to read the document again, but for simplicity we'll estimate
        return 0; // TODO: Implement proper indentation detection
    }
    /**
     * Find all PRD files in the workspace
     */
    async findPrdFiles() {
        const patterns = [
            '**/*{PRD,prd}*.md',
            '**/PRD*.md',
            '**/prd*.md',
            '**/*PRD*.md',
            '**/*prd*.md'
        ];
        const allFiles = new Set();
        for (const pattern of patterns) {
            try {
                const files = await glob(pattern, {
                    cwd: this.workspaceRoot,
                    ignore: ['**/node_modules/**'],
                    absolute: true
                });
                files.forEach(file => allFiles.add(file));
            }
            catch (error) {
                console.error(`Error globbing pattern ${pattern}:`, error);
            }
        }
        return Array.from(allFiles);
    }
    /**
     * Generate a new task ID
     */
    generateNewTaskId(existingTasks) {
        let highestId = 100000;
        for (const task of existingTasks) {
            const match = task.id.match(/^PRD-(\d+)$/);
            if (match) {
                const numericPart = parseInt(match[1], 10);
                if (numericPart > highestId) {
                    highestId = numericPart;
                }
            }
        }
        const nextId = highestId + 1;
        return `PRD-${String(nextId).padStart(6, '0')}`;
    }
}
