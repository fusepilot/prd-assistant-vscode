import * as vscode from "vscode";
import { PrdTask } from "../models/task";

export class PrdTaskManager {
  private tasks: Map<string, PrdTask[]> = new Map();
  private taskById: Map<string, PrdTask> = new Map();
  private _onTasksChanged = new vscode.EventEmitter<void>();
  public readonly onTasksChanged = this._onTasksChanged.event;
  private idCounter = 0;
  private isProcessing = false;

  private readonly taskRegex = /^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/gm;
  private readonly taskIdRegex = /PRD-\d{6}/g;

  async processDocument(document: vscode.TextDocument): Promise<void> {
    // Skip if we're already processing to avoid loops
    if (this.isProcessing) {
      console.log("Skipping document processing (already in progress):", document.fileName);
      return;
    }

    console.log("Processing document:", document.fileName, "URI:", document.uri.toString());

    const allTasks: PrdTask[] = [];
    const content = document.getText();
    const lines = content.split("\n");
    let modified = false;
    let currentHeaders: { level: number; text: string; line: number }[] = [];
    const seenIds = new Set<string>();

    // Clear existing tasks for this document
    const existingTasks = this.tasks.get(document.uri.toString()) || [];
    existingTasks.forEach((task) => this.taskById.delete(task.id));

    // Get all existing IDs from other documents
    const existingIdsFromOtherDocs = new Set<string>();
    this.tasks.forEach((tasks, uri) => {
      if (uri !== document.uri.toString()) {
        tasks.forEach((task) => existingIdsFromOtherDocs.add(task.id));
      }
    });

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // First, normalize task formatting (checkbox and spacing)
      const taskMatch = line.match(/^(\s*)(-|\*|\d+\.)\s*\[([^\]]*)\]\s*(.*?)$/);
      if (taskMatch) {
        const [, indent, bullet, checkboxContent, restOfLine] = taskMatch;
        
        // Normalize checkbox content
        let normalizedCheckbox = checkboxContent;
        if (checkboxContent === "" || checkboxContent === " " || checkboxContent === "  " || checkboxContent === "   ") {
          normalizedCheckbox = " ";
        } else if (checkboxContent.toLowerCase() === "x" || checkboxContent === " x" || checkboxContent === "x " || checkboxContent === " x ") {
          normalizedCheckbox = "x";
        }
        
        // Handle multiple or misplaced PRD IDs in the rest of the line
        let cleanedRestOfLine = restOfLine.trim();
        const prdIds = cleanedRestOfLine.match(/PRD-\d{6}/g);
        
        if (prdIds && prdIds.length > 0) {
          // Remove all PRD IDs from the text
          cleanedRestOfLine = cleanedRestOfLine.replace(/PRD-\d{6}/g, '').trim();
          // Remove extra spaces that might be left behind
          cleanedRestOfLine = cleanedRestOfLine.replace(/\s+/g, ' ').trim();
          // Add back only one ID at the end
          cleanedRestOfLine = `${cleanedRestOfLine} ${prdIds[0]}`;
        }
        
        // Build normalized line with consistent single spacing
        const normalizedLine = `${indent}- [${normalizedCheckbox}] ${cleanedRestOfLine}`;
        
        if (normalizedLine !== line) {
          line = normalizedLine;
          lines[i] = line;
          modified = true;
        }
      }

      // Check for headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];

        // Remove headers at the same or deeper level
        currentHeaders = currentHeaders.filter((h) => h.level < level);
        currentHeaders.push({ level, text: headerText, line: i });
        continue;
      }

      const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

      if (match) {
        const [, indent, bullet, checked, textContent, assignee, existingId] = match;
        let taskId = existingId;
        let text = textContent;

        // Check for duplicate IDs but don't fix them here - let fixDuplicatesWithUndo handle it
        if (taskId && (seenIds.has(taskId) || existingIdsFromOtherDocs.has(taskId))) {
          // Skip duplicate tasks during processing
          continue;
        } else if (!taskId && this.getConfig("autoGenerateIds")) {
          // Check if there's already an ID in the text (e.g., no space before ID)
          const idInText = text.match(/(.*?)(PRD-\d{6})$/);
          if (idInText) {
            // ID exists in text, extract it
            taskId = idInText[2];
            text = idInText[1].trim();
            // Rewrite the line with proper spacing
            lines[i] = `${indent}${bullet} [${checked}] ${text}${assignee ? ` @${assignee}` : ""} ${taskId}`;
            modified = true;
          } else {
            // Generate ID if missing
            taskId = this.generateTaskId();
            // Preserve the original bullet type
            lines[i] = `${indent}${bullet} [${checked}] ${text}${assignee ? ` @${assignee}` : ""} ${taskId}`;
            modified = true;
          }
        }

        if (taskId) {
          seenIds.add(taskId);
          const task: PrdTask = {
            id: taskId,
            text: text.trim(),
            completed: checked === "x",
            assignee: assignee,
            line: i,
            document: document.uri,
            children: [],
            headers: [...currentHeaders], // Store the current header context
          } as PrdTask & { headers?: { level: number; text: string; line: number }[] };

          allTasks.push(task);
          this.taskById.set(taskId, task);
        }
      }
    }

    if (modified) {
      this.isProcessing = true;
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lines.length - 1, lines[lines.length - 1].length));
      edit.replace(document.uri, fullRange, lines.join("\n"));
      await vscode.workspace.applyEdit(edit);
      this.isProcessing = false;
    }

    // Build task hierarchy based on indentation
    this.buildTaskHierarchy(allTasks, lines);
    this.tasks.set(document.uri.toString(), allTasks);

    console.log(`Found ${allTasks.length} tasks in ${document.fileName}`);
    allTasks.forEach((task) => {
      console.log(`  - ${task.id}: ${task.text}`);
    });

    this._onTasksChanged.fire();
  }

  private buildTaskHierarchy(tasks: PrdTask[], lines: string[]): void {
    const stack: { task: PrdTask; indent: number }[] = [];

    tasks.forEach((task) => {
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
      return match[1].split("").reduce((count, char) => {
        return count + (char === "\t" ? 4 : 1);
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
    const text = Buffer.from(fileContent).toString("utf8");
    const lines = text.split("\n");

    if (task.line >= lines.length) {
      vscode.window.showErrorMessage(`Task line ${task.line} out of bounds`);
      return;
    }

    const line = lines[task.line];
    const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

    if (match) {
      const [, indent, bullet, checked, taskText, assignee, foundTaskId] = match;

      // Verify we're toggling the right task
      if (foundTaskId !== taskId) {
        vscode.window.showErrorMessage(`Task mismatch: expected ${taskId}, found ${foundTaskId}`);
        return;
      }

      const newChecked = checked === " " ? "x" : " ";
      lines[task.line] = `${indent}${bullet} [${newChecked}] ${taskText}${assignee ? ` @${assignee}` : ""}${foundTaskId ? ` ${foundTaskId}` : ""}`;

      // Write the file back
      this.isProcessing = true;
      const newContent = lines.join("\n");
      await vscode.workspace.fs.writeFile(task.document, Buffer.from(newContent, "utf8"));
      this.isProcessing = false;

      // Update task in memory
      task.completed = newChecked === "x";

      // If the document is open, refresh it
      const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === task.document.toString());
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
    const match = line.text.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

    if (match) {
      const [, indent, bullet, checked, text, assignee, taskId] = match;

      if (taskId) {
        // If we have a task ID, use that for accuracy
        await this.toggleTaskById(taskId);
      } else {
        // Otherwise toggle inline without ID
        const newChecked = checked === " " ? "x" : " ";
        const newLine = `${indent}${bullet} [${newChecked}] ${text}${assignee ? ` @${assignee}` : ""}`;

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
    const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ""} ${taskId}`;

    // Check if we should add empty line before the task
    const currentLine = editor.document.lineAt(line).text;
    const currentLineIsEmpty = currentLine.trim() === "";
    const currentLineIsTask = currentLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
    const currentLineIsHeader = currentLine.match(/^#{1,6}\s+/);

    let shouldAddEmptyLineBefore = false;
    if (!currentLineIsEmpty && !currentLineIsTask && !currentLineIsHeader) {
      shouldAddEmptyLineBefore = true;
    }

    // Check if we should add empty line after the task
    const nextLineExists = line + 1 < editor.document.lineCount;
    let shouldAddEmptyLineAfter = false;

    if (nextLineExists) {
      const nextLine = editor.document.lineAt(line + 1).text;
      const nextLineIsEmpty = nextLine.trim() === "";
      const nextLineIsTask = nextLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
      const nextLineIsHeader = nextLine.match(/^#{1,6}\s+/);

      // Add empty line if next line is not empty, not a task, not a header, and not already an empty line
      shouldAddEmptyLineAfter = !nextLineIsEmpty && !nextLineIsTask && !nextLineIsHeader;
    }

    let textToInsert = taskLine + "\n";
    if (shouldAddEmptyLineBefore) {
      textToInsert = "\n" + textToInsert;
    }
    if (shouldAddEmptyLineAfter) {
      textToInsert = textToInsert + "\n";
    }

    this.isProcessing = true;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(editor.document.uri, new vscode.Position(line + 1, 0), textToInsert);
    await vscode.workspace.applyEdit(edit);
    this.isProcessing = false;
  }

  async addTaskAtPosition(editor: vscode.TextEditor, position: vscode.Position, taskText: string, assignee?: string): Promise<void> {
    const line = position.line;
    const taskId = this.generateTaskId();
    const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ""} ${taskId}`;

    // Check if we should add empty line before the task
    const currentLine = editor.document.lineAt(line).text;
    const currentLineIsEmpty = currentLine.trim() === "";
    const currentLineIsTask = currentLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
    const currentLineIsHeader = currentLine.match(/^#{1,6}\s+/);

    let shouldAddEmptyLineBefore = false;
    if (!currentLineIsEmpty && !currentLineIsTask && !currentLineIsHeader) {
      shouldAddEmptyLineBefore = true;
    }

    // Check if we should add empty line after the task
    const nextLineExists = line + 1 < editor.document.lineCount;
    let shouldAddEmptyLineAfter = false;

    if (nextLineExists) {
      const nextLine = editor.document.lineAt(line + 1).text;
      const nextLineIsEmpty = nextLine.trim() === "";
      const nextLineIsTask = nextLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
      const nextLineIsHeader = nextLine.match(/^#{1,6}\s+/);

      // Add empty line if next line is not empty, not a task, not a header, and not already an empty line
      shouldAddEmptyLineAfter = !nextLineIsEmpty && !nextLineIsTask && !nextLineIsHeader;
    }

    let textToInsert = taskLine + "\n";
    if (shouldAddEmptyLineBefore) {
      textToInsert = "\n" + textToInsert;
    }
    if (shouldAddEmptyLineAfter) {
      textToInsert = textToInsert + "\n";
    }

    this.isProcessing = true;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(editor.document.uri, new vscode.Position(line + 1, 0), textToInsert);
    await vscode.workspace.applyEdit(edit);
    this.isProcessing = false;
  }

  async addTaskToHeader(editor: vscode.TextEditor, headerLine: number, headerLevel: number, headerText: string, taskText: string, assignee?: string): Promise<void> {
    const document = editor.document;
    const lines = document.getText().split("\n");

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
        if (lines[i].trim() !== "") {
          insertLine = i;
          break;
        }
      }
    }

    // Check if there's already content right after the header
    let hasContentAfterHeader = false;
    if (headerLine + 1 < lines.length) {
      const nextLine = lines[headerLine + 1].trim();
      hasContentAfterHeader = nextLine !== "" && !nextLine.match(/^#/);
    }

    const taskId = this.generateTaskId();
    // No indentation - tasks should be at the beginning of the line
    const taskLine = `- [ ] ${taskText}${assignee ? ` @${assignee}` : ""} ${taskId}`;

    this.isProcessing = true;
    const edit = new vscode.WorkspaceEdit();

    // Determine where and how to insert
    if (insertLine === headerLine) {
      // Insert right after header with a blank line
      edit.insert(document.uri, new vscode.Position(headerLine + 1, 0), "\n" + taskLine + "\n\n");
    } else {
      // Insert after the last relevant line
      const insertAfterLine = lines[insertLine];
      const nextLineExists = insertLine + 1 < lines.length;
      const nextLineIsEmpty = nextLineExists ? lines[insertLine + 1].trim() === "" : false;

      // Check if we need to add empty line before the task
      const insertAfterLineIsTask = insertAfterLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
      const insertAfterLineIsHeader = insertAfterLine.match(/^#{1,6}\s+/);
      const insertAfterLineIsEmpty = insertAfterLine.trim() === "";

      let shouldAddEmptyLineBefore = false;
      if (!insertAfterLineIsEmpty && !insertAfterLineIsTask && !insertAfterLineIsHeader) {
        shouldAddEmptyLineBefore = true;
      }

      // Check if we need to add empty line after the task
      let shouldAddEmptyLineAfter = false;
      if (nextLineExists && !nextLineIsEmpty) {
        const nextLine = lines[insertLine + 1];
        const nextLineIsTask = nextLine.match(/^\s*(-|\*|\d+\.)\s+\[[ x]\]/);
        const nextLineIsHeader = nextLine.match(/^#{1,6}\s+/);
        shouldAddEmptyLineAfter = !nextLineIsTask && !nextLineIsHeader;
      }

      if (insertAfterLine.trim() !== "") {
        // Build the text to insert
        let textToInsert = taskLine + "\n";
        if (shouldAddEmptyLineBefore) {
          textToInsert = "\n" + textToInsert;
        }
        if (shouldAddEmptyLineAfter) {
          textToInsert = textToInsert + "\n";
        }
        edit.insert(document.uri, new vscode.Position(insertLine + 1, 0), textToInsert);
      } else {
        // Replace empty line
        let textToInsert = taskLine + "\n";
        if (shouldAddEmptyLineAfter) {
          textToInsert = textToInsert + "\n";
        }
        edit.replace(document.uri, new vscode.Range(insertLine, 0, insertLine + 1, 0), textToInsert);
      }
    }

    await vscode.workspace.applyEdit(edit);
    this.isProcessing = false;
  }

  private getLastChildLine(task: PrdTask): number {
    let lastLine = task.line;
    task.children.forEach((child) => {
      lastLine = Math.max(lastLine, this.getLastChildLine(child));
    });
    return lastLine;
  }

  async assignTask(taskId: string, assignee: string): Promise<void> {
    const task = this.taskById.get(taskId);
    if (!task) {return;}

    // Read the file content directly without opening in editor
    const fileContent = await vscode.workspace.fs.readFile(task.document);
    const text = Buffer.from(fileContent).toString("utf8");
    const lines = text.split("\n");

    if (task.line >= lines.length) {
      vscode.window.showErrorMessage(`Task line ${task.line} out of bounds`);
      return;
    }

    let line = lines[task.line];

    // Remove existing assignee if present
    line = line.replace(/@[\w-]+(?:-copilot)?/, "").trim();

    // Add new assignee before the task ID
    line = line.replace(/(\s*PRD-\d{6})$/, ` ${assignee}$1`);

    lines[task.line] = line;

    // Write the file back
    this.isProcessing = true;
    const newContent = lines.join("\n");
    await vscode.workspace.fs.writeFile(task.document, Buffer.from(newContent, "utf8"));
    this.isProcessing = false;

    // Update task in memory
    task.assignee = assignee.replace("@", "");

    // If the document is open, refresh it
    const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === task.document.toString());
    if (openDoc) {
      setTimeout(() => this.processDocument(openDoc), 200);
    }

    this._onTasksChanged.fire();
  }

  getTaskIdAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    const line = document.lineAt(position.line);
    const match = line.text.match(/(PRD-\d{6})/);
    return match ? match[1] : undefined;
  }

  async generateProgressReport(): Promise<string> {
    let totalTasks = 0;
    let completedTasks = 0;
    const tasksByAssignee = new Map<string, { total: number; completed: number }>();

    this.taskById.forEach((task) => {
      totalTasks++;
      if (task.completed) {completedTasks++;}

      if (task.assignee) {
        const stats = tasksByAssignee.get(task.assignee) || { total: 0, completed: 0 };
        stats.total++;
        if (task.completed) {stats.completed++;}
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
    this.tasks.forEach((tasks) => allTasks.push(...tasks));
    return allTasks;
  }

  getTasksByDocument(uri: vscode.Uri): PrdTask[] {
    return this.tasks.get(uri.toString()) || [];
  }

  getDocuments(): vscode.Uri[] {
    return Array.from(this.tasks.keys()).map(uriString => vscode.Uri.parse(uriString));
  }

  getTaskById(taskId: string): PrdTask | undefined {
    return this.taskById.get(taskId);
  }

  async checkForDuplicates(document: vscode.TextDocument): Promise<boolean> {
    const lines = document.getText().split("\n");
    const seenIds = new Set<string>();
    const existingIdsFromOtherDocs = new Set<string>();

    // Get all existing IDs from other documents
    this.tasks.forEach((tasks, uri) => {
      if (uri !== document.uri.toString()) {
        tasks.forEach((task) => existingIdsFromOtherDocs.add(task.id));
      }
    });

    for (const line of lines) {
      const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

      if (match) {
        const [, , , , , , taskId] = match;

        if (taskId && (seenIds.has(taskId) || existingIdsFromOtherDocs.has(taskId))) {
          return true; // Found a duplicate
        } else if (taskId) {
          seenIds.add(taskId);
        }
      }
    }

    return false; // No duplicates found
  }

  async fixDuplicatesWithUndo(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const lines = document.getText().split("\n");
    const seenIds = new Set<string>();
    const existingIdsFromOtherDocs = new Set<string>();
    const duplicates: { line: number; oldId: string; newId: string; fullLine: string }[] = [];

    // Get all existing IDs from other documents
    this.tasks.forEach((tasks, uri) => {
      if (uri !== document.uri.toString()) {
        tasks.forEach((task) => existingIdsFromOtherDocs.add(task.id));
      }
    });

    // Find all duplicates
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

      if (match) {
        const [, indent, bullet, checked, text, assignee, taskId] = match;

        if (taskId && (seenIds.has(taskId) || existingIdsFromOtherDocs.has(taskId))) {
          // Found a duplicate
          const newTaskId = this.generateNextSequentialId(taskId, seenIds, existingIdsFromOtherDocs);
          const newLine = `${indent}${bullet} [${checked}] ${text}${assignee ? ` @${assignee}` : ""} ${newTaskId}`;

          duplicates.push({
            line: i,
            oldId: taskId,
            newId: newTaskId,
            fullLine: newLine,
          });

          seenIds.add(newTaskId);
        } else if (taskId) {
          seenIds.add(taskId);
        }
      }
    }

    // Fix duplicates using editor.edit to keep in same undo group
    if (duplicates.length > 0) {
      this.isProcessing = true;

      await editor.edit(
        (editBuilder) => {
          duplicates.forEach((dup) => {
            const range = new vscode.Range(dup.line, 0, dup.line, lines[dup.line].length);
            editBuilder.replace(range, dup.fullLine);
          });
        },
        {
          undoStopBefore: false, // Don't create undo stop before this edit
          undoStopAfter: false, // Don't create undo stop after this edit
        }
      );

      this.isProcessing = false;

      // Show subtle notification
      const plural = duplicates.length > 1 ? "s" : "";
      vscode.window.showInformationMessage(`Fixed ${duplicates.length} duplicate task ID${plural}`);
    }
  }

  private generateNextSequentialId(baseId: string, seenIds: Set<string>, existingIds: Set<string>): string {
    // Extract the numeric part from the ID
    const match = baseId.match(/^PRD-(\d+)$/);
    if (!match) {
      return this.generateTaskId();
    }

    let numericPart = parseInt(match[1], 10);
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      numericPart++;
      const newId = `PRD-${numericPart.toString().padStart(6, "0")}`;

      // Check if this ID is already in use anywhere
      if (!this.taskById.has(newId) && !seenIds.has(newId) && !existingIds.has(newId)) {
        return newId;
      }

      attempts++;
    }

    // Fallback to timestamp-based generation if we can't find a sequential ID
    return this.generateTaskId();
  }

  async findDuplicateTaskIds(document: vscode.TextDocument): Promise<Map<string, number[]>> {
    const duplicates = new Map<string, number[]>();
    const seenIds = new Map<string, number[]>();
    const lines = document.getText().split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

      if (match) {
        const taskId = match[6];
        if (taskId) {
          if (!seenIds.has(taskId)) {
            seenIds.set(taskId, []);
          }
          seenIds.get(taskId)!.push(i);
        }
      }
    }

    // Find which IDs have multiple occurrences
    for (const [taskId, lineNumbers] of seenIds) {
      if (lineNumbers.length > 1) {
        duplicates.set(taskId, lineNumbers);
      }
    }

    return duplicates;
  }

  async fixDuplicates(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const lines = document.getText().split("\n");
    const seenIds = new Set<string>();
    const existingIdsFromOtherDocs = new Set<string>();
    const duplicates: { line: number; oldId: string; newId: string; fullLine: string }[] = [];

    // Get all existing IDs from other documents
    this.tasks.forEach((tasks, uri) => {
      if (uri !== document.uri.toString()) {
        tasks.forEach((task) => existingIdsFromOtherDocs.add(task.id));
      }
    });

    // Find all duplicates
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);

      if (match) {
        const [, indent, bullet, checked, text, assignee, taskId] = match;

        if (taskId && (seenIds.has(taskId) || existingIdsFromOtherDocs.has(taskId))) {
          // Found a duplicate
          const newTaskId = this.generateNextSequentialId(taskId, seenIds, existingIdsFromOtherDocs);
          const newLine = `${indent}${bullet} [${checked}] ${text}${assignee ? ` @${assignee}` : ""} ${newTaskId}`;

          duplicates.push({
            line: i,
            oldId: taskId,
            newId: newTaskId,
            fullLine: newLine,
          });

          seenIds.add(newTaskId);
        } else if (taskId) {
          seenIds.add(taskId);
        }
      }
    }

    // Fix duplicates using editor.edit
    if (duplicates.length > 0) {
      this.isProcessing = true;

      await editor.edit((editBuilder) => {
        duplicates.forEach((dup) => {
          const range = new vscode.Range(dup.line, 0, dup.line, lines[dup.line].length);
          editBuilder.replace(range, dup.fullLine);
        });
      });

      this.isProcessing = false;
    }
  }

  private generateTaskId(): string {
    // First try to use smart incremental ID based on highest existing ID
    const smartId = this.generateIncrementalTaskId();
    if (smartId) {
      return smartId;
    }

    // Fallback to timestamp-based generation
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      // Use timestamp + counter to ensure uniqueness
      const timestamp = Date.now().toString();
      const paddedCounter = this.idCounter.toString().padStart(3, "0");
      this.idCounter = (this.idCounter + 1) % 1000; // Reset after 999

      // Take last 3 digits of timestamp and append counter
      const id = `PRD-${timestamp.slice(-3)}${paddedCounter}`;

      // Ensure uniqueness across all tasks
      if (!this.taskById.has(id)) {
        return id;
      }

      attempts++;
      // Add small delay to ensure timestamp changes
      if (attempts % 10 === 0) {
        const now = Date.now();
        while (Date.now() === now) {
          // Busy wait for 1ms
        }
      }
    }

    // Fallback: use full timestamp if we can't find a unique ID
    return `PRD-${Date.now()}`;
  }

  private generateIncrementalTaskId(): string | null {
    // Find the highest numeric ID across all tasks
    let highestId = 0;

    // Check all tasks in memory
    for (const task of this.taskById.values()) {
      const match = task.id.match(/^PRD-(\d+)$/);
      if (match) {
        const numericPart = parseInt(match[1], 10);
        if (numericPart > highestId) {
          highestId = numericPart;
        }
      }
    }

    // If we found any PRD-XXXXXX format IDs, increment from the highest
    if (highestId > 0) {
      const newId = `PRD-${(highestId + 1).toString().padStart(6, "0")}`;
      return newId;
    }

    // No PRD-XXXXXX format IDs found, start with PRD-000001
    return "PRD-100001";
  }

  public generateNewTaskId(): string {
    return this.generateTaskId();
  }

  private getConfig<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration("prdManager").get<T>(key);
  }

  async normalizeCheckboxes(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    return this.normalizeCheckboxesSync(document);
  }

  normalizeCheckboxesSync(document: vscode.TextDocument): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const text = document.getText();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Look for task lines - match with flexible spacing
      const match = line.match(/^(\s*)(-|\*|\d+\.)\s*\[([^\]]*)\]\s*(.*?)$/);

      if (match) {
        const [, indent, bullet, checkboxContent, restOfLine] = match;
        
        // Normalize checkbox content
        let normalizedCheckbox = checkboxContent;
        if (checkboxContent === "" || checkboxContent === " " || checkboxContent === "  " || checkboxContent === "   ") {
          normalizedCheckbox = " ";
        } else if (checkboxContent.toLowerCase() === "x" || checkboxContent === " x" || checkboxContent === "x " || checkboxContent === " x ") {
          normalizedCheckbox = "x";
        }
        
        // Handle multiple or misplaced PRD IDs in the rest of the line
        let cleanedRestOfLine = restOfLine.trim();
        const prdIds = cleanedRestOfLine.match(/PRD-\d{6}/g);
        
        if (prdIds && prdIds.length > 0) {
          // Remove all PRD IDs from the text
          cleanedRestOfLine = cleanedRestOfLine.replace(/PRD-\d{6}/g, '').trim();
          // Remove extra spaces that might be left behind
          cleanedRestOfLine = cleanedRestOfLine.replace(/\s+/g, ' ').trim();
          // Add back only one ID at the end
          cleanedRestOfLine = `${cleanedRestOfLine} ${prdIds[0]}`;
        }
        
        // Build normalized line with consistent single spacing
        // Always use dash (-) and ensure single spaces
        const normalizedLine = `${indent}- [${normalizedCheckbox}] ${cleanedRestOfLine}`;

        // Only create edit if line changed
        if (normalizedLine !== line) {
          const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.length));
          edits.push(vscode.TextEdit.replace(range, normalizedLine));
        }
      }
    }

    return edits;
  }
}
