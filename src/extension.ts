import * as vscode from "vscode";
import { PrdTreeProvider } from "./providers/prdTreeProvider";
import { PrdDocumentLinkProvider } from "./providers/prdDocumentLinkProvider";
import { PrdCodeLensProvider } from "./providers/prdCodeLensProvider";
import { PrdDecorationProvider } from "./providers/prdDecorationProvider";
import { PrdTaskManager } from "./managers/prdTaskManager";
import { PrdConversionCodeLensProvider } from "./providers/prdConversionCodeLensProvider";
import { PrdQuickFixProvider } from "./providers/prdQuickFixProvider";
import { isPrdFile, getPrdFilePatterns } from "./utils/prdUtils";

export function activate(context: vscode.ExtensionContext) {
  console.log("PRD Assistant extension is now active!");

  // Initialize the task manager
  const taskManager = new PrdTaskManager();
  
  // Function to update context based on active editor
  const updatePrdFileContext = (editor: vscode.TextEditor | undefined) => {
    if (editor && editor.document) {
      const isPrd = isPrdFile(editor.document);
      vscode.commands.executeCommand('setContext', 'prdAssistant.isPrdFile', isPrd);
    } else {
      vscode.commands.executeCommand('setContext', 'prdAssistant.isPrdFile', false);
    }
  };
  
  // Set initial context
  updatePrdFileContext(vscode.window.activeTextEditor);
  
  // Update context when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      updatePrdFileContext(editor);
    })
  );

  // Register tree view provider for sidebar
  const treeProvider = new PrdTreeProvider(taskManager);
  const treeView = vscode.window.createTreeView("prdExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: false, // We'll implement custom toggle
  });

  // Track expand/collapse state
  let areItemsCollapsed = false;

  // Ensure the tree view is ready before allowing collapse/expand
  let treeViewReady = false;
  setTimeout(() => {
    treeViewReady = true;
  }, 500);


  // Register document link provider for deep linking
  const linkProvider = new PrdDocumentLinkProvider();
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider({ scheme: "file", pattern: "**/*.md" }, linkProvider));

  // Register CodeLens provider for inline actions
  const codeLensProvider = new PrdCodeLensProvider(taskManager);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", pattern: "**/*.md" }, codeLensProvider));

  // Register conversion CodeLens provider
  const conversionCodeLensProvider = new PrdConversionCodeLensProvider(taskManager);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file", pattern: "**/*.md" }, conversionCodeLensProvider));

  // Register Quick Fix provider for duplicate ID fixes
  const quickFixProvider = new PrdQuickFixProvider(taskManager);
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: "file", pattern: "**/*.md" }, quickFixProvider, {
    providedCodeActionKinds: PrdQuickFixProvider.providedCodeActionKinds
  }));

  // Register decoration provider for visual enhancements
  const decorationProvider = new PrdDecorationProvider();
  context.subscriptions.push(decorationProvider);

  // Define scan function for reuse
  const scanWorkspaceForPRDs = async () => {
    console.log("Scanning workspace for PRD files...");
    // Try multiple patterns to catch all PRD files
    const patterns = getPrdFilePatterns();

    const allPrdFiles = new Set<string>();
    for (const pattern of patterns) {
      const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
      files.forEach((file) => allPrdFiles.add(file.toString()));
    }

    const prdFiles = Array.from(allPrdFiles).map((uriString) => vscode.Uri.parse(uriString));
    console.log(
      "Found PRD files:",
      prdFiles.map((f) => f.fsPath)
    );

    for (const file of prdFiles) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        console.log("Processing PRD file:", doc.fileName);
        await taskManager.processDocument(doc);

        // Check how many tasks were found
        const tasks = taskManager.getTasksByDocument(file);
        console.log(`  -> Found ${tasks.length} tasks in ${doc.fileName}`);
      } catch (error) {
        console.log("Error processing PRD file:", file.fsPath, error);
      }
    }

    // After processing all files, log the documents in the task manager
    const documents = taskManager.getDocuments();
    console.log(
      "TaskManager now has documents:",
      documents.map((d) => d.fsPath)
    );
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.toggleTask", async (item?: any) => {
      let taskId: string | undefined;

      // Handle different input types
      if (typeof item === "string") {
        taskId = item;
      } else if (item && item.id) {
        taskId = item.id;
      }

      if (taskId) {
        // Toggle by task ID (from tree view or CodeLens)
        await taskManager.toggleTaskById(taskId);
      } else {
        // Toggle by position (from keyboard shortcut or menu)
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const position = editor.selection.active;
          await taskManager.toggleTaskAtPosition(editor.document, position);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.generateReport", async () => {
      const report = await taskManager.generateProgressReport();
      const doc = await vscode.workspace.openTextDocument({
        content: report,
        language: "markdown",
      });
      await vscode.window.showTextDocument(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.exportReportCsv", async () => {
      const csv = await taskManager.generateProgressReportCsv();
      const defaultUri = vscode.Uri.file('prd-progress-report.csv');
      
      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          'CSV Files': ['csv'],
          'All Files': ['*']
        },
        title: 'Export Progress Report as CSV'
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
        vscode.window.showInformationMessage(`Progress report exported to ${uri.fsPath}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.exportReportJson", async () => {
      const json = await taskManager.generateProgressReportJson();
      const defaultUri = vscode.Uri.file('prd-progress-report.json');
      
      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: {
          'JSON Files': ['json'],
          'All Files': ['*']
        },
        title: 'Export Progress Report as JSON'
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage(`Progress report exported to ${uri.fsPath}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.addTask", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const taskText = await vscode.window.showInputBox({
        prompt: "Enter task description",
        placeHolder: "Task description",
      });

      if (taskText) {
        const assignee = await vscode.window.showInputBox({
          prompt: "Assign to (optional)",
          placeHolder: "@username-copilot",
        });

        await taskManager.addTask(editor, taskText, assignee);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.addTaskAtCursor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const taskText = await vscode.window.showInputBox({
        prompt: "Enter task description",
        placeHolder: "Task description",
      });

      if (taskText) {
        const assignee = await vscode.window.showInputBox({
          prompt: "Assign to (optional)",
          placeHolder: "@username-copilot",
        });

        await taskManager.addTaskAtPosition(editor, editor.selection.active, taskText, assignee);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.addTaskToHeader", async (headerLine: number | string, headerLevel?: number, headerText?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      // Handle call from tree view (header string) vs CodeLens (individual args)
      let finalHeaderLine: number;
      let finalHeaderLevel: number;
      let finalHeaderText: string;

      if (typeof headerLine === "string") {
        // Called from tree view with header string like "## Header Name"
        const headerStr = headerLine;
        finalHeaderText = headerStr.replace(/^#+\s+/, "");
        finalHeaderLevel = headerStr.match(/^#+/)?.[0].length || 1;

        // Find the header line in the document
        const allTasks = taskManager.getAllTasks();
        const tasksWithThisHeader = allTasks.filter((task) => task.headers?.some((h) => h.text === finalHeaderText && h.level === finalHeaderLevel));

        if (tasksWithThisHeader.length > 0) {
          const headerInfo = tasksWithThisHeader[0].headers?.find((h) => h.text === finalHeaderText && h.level === finalHeaderLevel);
          finalHeaderLine = headerInfo?.line || 0;
        } else {
          // Find in document directly
          const lines = editor.document.getText().split("\n");
          finalHeaderLine = lines.findIndex((line) => {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            return match && match[1].length === finalHeaderLevel && match[2] === finalHeaderText;
          });
        }
      } else {
        // Called from CodeLens with individual parameters
        finalHeaderLine = headerLine;
        finalHeaderLevel = headerLevel!;
        finalHeaderText = headerText!;
      }

      const taskText = await vscode.window.showInputBox({
        prompt: "Enter task description",
        placeHolder: "Task description",
      });

      if (taskText) {
        const assignee = await vscode.window.showInputBox({
          prompt: "Assign to (optional)",
          placeHolder: "@username-copilot",
        });

        await taskManager.addTaskToHeader(editor, finalHeaderLine, finalHeaderLevel, finalHeaderText, taskText, assignee);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.addTaskToTask", async (item: any) => {
      if (!item || !item.id) {
        vscode.window.showErrorMessage("No task selected");
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const taskText = await vscode.window.showInputBox({
        prompt: "Enter subtask description",
        placeHolder: "Subtask description",
      });

      if (taskText) {
        const assignee = await vscode.window.showInputBox({
          prompt: "Assign to (optional)",
          placeHolder: "@username-copilot",
        });

        // Find the parent task in the document
        const parentTask = taskManager.getTaskById(item.id);
        if (parentTask) {
          const parentLine = parentTask.line;
          const taskId = taskManager.generateNewTaskId();
          const taskLine = `  - [ ] ${taskText}${assignee ? ` @${assignee}` : ""} ${taskId}`;

          // Find the end of the existing subtask group
          let insertLine = parentLine;
          const totalLines = editor.document.lineCount;

          // Look for the last subtask of this parent
          for (let i = parentLine + 1; i < totalLines; i++) {
            const line = editor.document.lineAt(i).text;
            const isSubtask = line.match(/^\s{2,}(-|\*|\d+\.)\s+\[[ x]\]/); // Indented task (subtask)
            const isTask = line.match(/^(-|\*|\d+\.)\s+\[[ x]\]/); // Non-indented task
            const isHeader = line.match(/^#{1,6}\s+/);
            const isEmpty = line.trim() === "";

            if (isSubtask) {
              // This is a subtask, update our insert position
              insertLine = i;
            } else if (isTask || isHeader || (!isEmpty && !isSubtask)) {
              // Hit a non-subtask item, stop looking
              break;
            }
            // Continue if it's an empty line
          }

          // Check if we should add empty lines before and after
          const insertAfterLineText = editor.document.lineAt(insertLine).text;
          const insertAfterLineIsTask = insertAfterLineText.match(/^(-|\*|\d+\.)\s+\[[ x]\]/) || insertAfterLineText.match(/^\s{2,}(-|\*|\d+\.)\s+\[[ x]\]/);

          let shouldAddEmptyLineBefore = false;
          if (!insertAfterLineIsTask) {
            // If line we're inserting after is not a task, add empty line before
            shouldAddEmptyLineBefore = true;
          }

          const nextLineExists = insertLine + 1 < editor.document.lineCount;
          let shouldAddEmptyLineAfter = false;

          if (nextLineExists) {
            const nextLine = editor.document.lineAt(insertLine + 1).text;
            const nextLineIsEmpty = nextLine.trim() === "";
            const nextLineIsSubtask = nextLine.match(/^\s{2,}(-|\*|\d+\.)\s+\[[ x]\]/); // Indented task
            const nextLineIsTask = nextLine.match(/^(-|\*|\d+\.)\s+\[[ x]\]/); // Non-indented task
            const nextLineIsHeader = nextLine.match(/^#{1,6}\s+/);

            // Add empty line if we're at the end of the subtask group
            shouldAddEmptyLineAfter = !nextLineIsEmpty && !nextLineIsSubtask && !nextLineIsTask && !nextLineIsHeader;
          }

          let textToInsert = taskLine + "\n";
          if (shouldAddEmptyLineBefore) {
            textToInsert = "\n" + textToInsert;
          }
          if (shouldAddEmptyLineAfter) {
            textToInsert = textToInsert + "\n";
          }

          const edit = new vscode.WorkspaceEdit();
          edit.insert(editor.document.uri, new vscode.Position(insertLine + 1, 0), textToInsert);
          await vscode.workspace.applyEdit(edit);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyTaskList", async (tasks: any[]) => {
      if (!tasks || tasks.length === 0) {
        vscode.window.showInformationMessage("No tasks to copy");
        return;
      }

      // Filter for uncompleted tasks only
      const uncompletedTasks = tasks.filter((task) => !task.completed);

      if (uncompletedTasks.length === 0) {
        vscode.window.showInformationMessage("All tasks are completed");
        return;
      }

      // Create comma-separated list of uncompleted task IDs
      const taskList = uncompletedTasks.map((task) => task.id).join(", ");

      await vscode.env.clipboard.writeText(taskList);
      vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.assignTask", async (item?: any) => {
      let taskId: string | undefined;

      // Handle different input types
      if (typeof item === "string") {
        taskId = item;
      } else if (item && item.id) {
        taskId = item.id;
      }

      if (!taskId) {
        vscode.window.showErrorMessage("No task selected");
        return;
      }

      // Get existing assignees for suggestions
      const allTasks = taskManager.getAllTasks();
      const existingAssignees = [
        ...new Set(
          allTasks
            .map((task) => task.assignee)
            .filter((assignee) => assignee)
            .map((assignee) => (assignee!.startsWith("@") ? assignee! : `@${assignee!}`))
        ),
      ];

      let assignee: string | undefined;

      if (existingAssignees.length > 0) {
        // Show quick pick with existing assignees plus option to enter new
        const items = [
          ...existingAssignees.map((name) => ({ label: name, description: "Existing assignee" })),
          { label: "$(plus) Enter new assignee...", description: "Type a new assignee name" },
        ];

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select assignee or enter new",
        });

        if (selected) {
          if (selected.label.startsWith("$(plus)")) {
            // User wants to enter new assignee
            assignee = await vscode.window.showInputBox({
              prompt: "Assign to",
              placeHolder: "@username-copilot",
            });
          } else {
            assignee = selected.label;
          }
        }
      } else {
        // No existing assignees, show input box directly
        assignee = await vscode.window.showInputBox({
          prompt: "Assign to",
          placeHolder: "@username-copilot",
        });
      }

      if (assignee) {
        await taskManager.assignTask(taskId, assignee);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyDeepLink", async (taskId?: string) => {
      if (!taskId) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          taskId = taskManager.getTaskIdAtPosition(editor.document, editor.selection.active);
        }
      }

      if (taskId) {
        await vscode.env.clipboard.writeText(taskId);
        vscode.window.showInformationMessage(`Copied ${taskId} to clipboard`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.openPrdFile", async () => {
      // Get the first PRD file from the task manager
      const allTasks = taskManager.getAllTasks();
      if (allTasks.length > 0) {
        const firstTask = allTasks[0];
        const doc = await vscode.workspace.openTextDocument(firstTask.document);
        await vscode.window.showTextDocument(doc);
      } else {
        // If no tasks, look for PRD.md in workspace
        const prdFiles = await vscode.workspace.findFiles("**/PRD.md", "**/node_modules/**", 1);
        if (prdFiles.length > 0) {
          const doc = await vscode.workspace.openTextDocument(prdFiles[0]);
          await vscode.window.showTextDocument(doc);
        } else {
          vscode.window.showInformationMessage("No PRD file found in workspace");
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.createPrdFile", async () => {
      // Check if PRD.md already exists in workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open");
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri;
      const prdFileUri = vscode.Uri.joinPath(workspaceRoot, "PRD.md");

      try {
        // Check if file already exists
        await vscode.workspace.fs.stat(prdFileUri);
        vscode.window.showInformationMessage("PRD.md already exists in workspace root");
        
        // Open the existing file
        const doc = await vscode.workspace.openTextDocument(prdFileUri);
        await vscode.window.showTextDocument(doc);
        return;
      } catch (error) {
        // File doesn't exist, create it
      }

      // Create empty PRD file with basic template
      const prdTemplate = `# Product Requirements Document

## Overview
Brief description of the product or feature.

## Requirements

### Functional Requirements
- [ ] Requirement 1 PRD-100001
- [ ] Requirement 2 PRD-100002

### Technical Requirements
- [ ] Technical requirement 1 PRD-100003
- [ ] Technical requirement 2 PRD-100004

## Tasks

### Implementation
- [ ] Task 1 PRD-100005
- [ ] Task 2 PRD-100006

### Testing
- [ ] Test 1 PRD-100007
- [ ] Test 2 PRD-100008

## Notes
Additional notes and considerations.
`;

      try {
        await vscode.workspace.fs.writeFile(prdFileUri, Buffer.from(prdTemplate, 'utf8'));
        
        // Open the new file
        const doc = await vscode.workspace.openTextDocument(prdFileUri);
        await vscode.window.showTextDocument(doc);
        
        // Process the document to register tasks
        await taskManager.processDocument(doc);
        treeProvider.refresh();
        
        vscode.window.showInformationMessage("Created PRD.md in workspace root");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create PRD.md: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.debugScan", async () => {
      console.log("=== DEBUG SCAN TRIGGERED ===");
      await scanWorkspaceForPRDs();
      treeProvider.refresh();
      const documents = taskManager.getDocuments();
      vscode.window.showInformationMessage(`Found ${documents.length} PRD documents. Check console for details.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.refreshTasks", async () => {
      // Rescan workspace for PRD files
      await scanWorkspaceForPRDs();
      treeProvider.refresh();
      vscode.window.showInformationMessage("PRD Tasks refreshed");
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.filterAllTasks", async () => {
      // Try workspace first, fallback to global
      const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration("prdManager").update("taskFilter", "all", target);
      console.log("Set filter to all");
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.filterCompletedTasks", async () => {
      // Try workspace first, fallback to global
      const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration("prdManager").update("taskFilter", "completed", target);
      console.log("Set filter to completed");
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.filterUncompletedTasks", async () => {
      // Try workspace first, fallback to global
      const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration("prdManager").update("taskFilter", "uncompleted", target);
      console.log("Set filter to uncompleted");
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyTaskId", async (item: any) => {
      let taskId: string | undefined;

      if (typeof item === "string") {
        taskId = item;
      } else if (item && item.id) {
        taskId = item.id;
      }

      if (taskId) {
        await vscode.env.clipboard.writeText(taskId);
        vscode.window.showInformationMessage(`Copied ${taskId} to clipboard`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyTaskText", async (item: any) => {
      if (item && item.text && item.id) {
        const textWithId = `${item.text} ${item.id}`;
        await vscode.env.clipboard.writeText(textWithId);
        vscode.window.showInformationMessage("Copied task text with ID to clipboard");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyHeaderTasksContext", async (header: string) => {
      // Same logic as copyHeaderTasks but for context menu
      if (typeof header === "string") {
        const allTasks = taskManager.getAllTasks();
        const headerText = header.replace(/^#+\s+/, "");
        const headerLevel = header.match(/^#+/)?.[0].length || 0;

        const tasksUnderHeader = allTasks.filter((task) => {
          if (task.headers && task.headers.length > 0) {
            return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
          }
          return false;
        });

        const uncompletedTasks = tasksUnderHeader.filter((task) => !task.completed);

        if (uncompletedTasks.length === 0) {
          vscode.window.showInformationMessage("No uncompleted tasks under this header");
          return;
        }

        const taskList = uncompletedTasks.map((task) => task.id).join(", ");
        await vscode.env.clipboard.writeText(taskList);
        vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.copyHeaderTasks", async (header: string) => {
      if (typeof header === "string") {
        const allTasks = taskManager.getAllTasks();
        const headerText = header.replace(/^#+\s+/, "");
        const headerLevel = header.match(/^#+/)?.[0].length || 0;

        const tasksUnderHeader = allTasks.filter((task) => {
          if (task.headers && task.headers.length > 0) {
            return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
          }
          return false;
        });

        const uncompletedTasks = tasksUnderHeader.filter((task) => !task.completed);

        if (uncompletedTasks.length === 0) {
          vscode.window.showInformationMessage("No uncompleted tasks under this header");
          return;
        }

        const taskList = uncompletedTasks.map((task) => task.id).join(", ");
        await vscode.env.clipboard.writeText(taskList);
        vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.goToHeader", async (header: string) => {
      if (typeof header === "string") {
        let headerText: string;
        let headerLevel: number;
        let documentUri: vscode.Uri | null = null;

        // Parse header to extract document URI if present (multi-file mode)
        if (header.includes("::")) {
          const [uriString, headerPart] = header.split("::", 2);
          documentUri = vscode.Uri.parse(uriString);
          headerText = headerPart.replace(/^#+\s+/, "");
          headerLevel = headerPart.match(/^#+/)?.[0].length || 0;
        } else {
          // Single file mode
          headerText = header.replace(/^#+\s+/, "");
          headerLevel = header.match(/^#+/)?.[0].length || 0;
        }

        // Determine which document to search
        let targetDocument: vscode.Uri | undefined;
        if (documentUri) {
          targetDocument = documentUri;
        } else {
          // Single file mode: find any document with this header
          const allTasks = taskManager.getAllTasks();
          for (const task of allTasks) {
            if (task.headers && task.headers.some((h) => h.text === headerText && h.level === headerLevel)) {
              targetDocument = task.document;
              break;
            }
          }
        }

        if (targetDocument) {
          const doc = await vscode.workspace.openTextDocument(targetDocument);
          const text = doc.getText();
          const lines = text.split("\n");

          // Find the header line
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
              const level = headerMatch[1].length;
              const text = headerMatch[2];
              if (level === headerLevel && text === headerText) {
                // Found the header, open and jump to it
                const editor = await vscode.window.showTextDocument(doc);
                const position = new vscode.Position(i, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                return;
              }
            }
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.openDocument", async (documentNode: any) => {
      if (documentNode && documentNode.uri) {
        const doc = await vscode.workspace.openTextDocument(documentNode.uri);
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.goToTask", async (item: any) => {
      let taskId: string | undefined;

      // Handle both direct task ID and tree item
      if (typeof item === "string") {
        taskId = item;
      } else if (item && item.id) {
        taskId = item.id;
      } else {
        // Try to get from tree selection
        const selection = treeView.selection[0];
        if (selection && typeof selection !== "string" && !(typeof selection === "object" && "type" in selection)) {
          // This is a PrdTask
          const task = selection as any;
          if (task.id) {
            taskId = task.id;
          }
        }
      }

      if (!taskId) {
        return;
      }

      const task = taskManager.getTaskById(taskId);
      if (task) {
        const doc = await vscode.workspace.openTextDocument(task.document);
        const editor = await vscode.window.showTextDocument(doc);

        // Move cursor to the task line
        const position = new vscode.Position(task.line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    })
  );

  // Add command to toggle collapse/expand tree view
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.toggleCollapseExpand", async () => {
      // Wait for tree view to be ready
      if (!treeViewReady) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        treeViewReady = true;
      }

      if (areItemsCollapsed) {
        // Expand all by revealing all top-level elements
        const elements = await treeProvider.getChildren();
        if (elements) {
          for (const element of elements) {
            if (typeof element === "string") {
              // This is a header - reveal it as expanded
              try {
                await treeView.reveal(element, {
                  expand: true,
                  focus: false,
                  select: false,
                });
              } catch (error) {
                // Ignore errors if element can't be revealed
              }
            }
          }
        }
        areItemsCollapsed = false;
      } else {
        // Collapse all using built-in command
        await vscode.commands.executeCommand("workbench.actions.treeView.prdExplorer.collapseAll");
        areItemsCollapsed = true;
      }
    })
  );

  // Add command to fix duplicates manually
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.fixDuplicates", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "markdown") {
        await taskManager.fixDuplicates(editor);
        vscode.window.showInformationMessage("Fixed duplicate task IDs");
      }
    })
  );

  // Add command to normalize checkboxes
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.normalizeCheckboxes", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "markdown") {
        const edits = await taskManager.normalizeCheckboxes(editor.document);
        if (edits.length > 0) {
          const workspaceEdit = new vscode.WorkspaceEdit();
          edits.forEach((edit) => {
            workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
          });
          await vscode.workspace.applyEdit(workspaceEdit);
          vscode.window.showInformationMessage("Normalized checkbox formatting");
        }
      }
    })
  );

  // Session-only CodeLens toggle state
  let codeLensEnabled = true;

  const updateCodeLensState = () => {
    vscode.commands.executeCommand("setContext", "prdAssistant.codeLensEnabled", codeLensEnabled);
    // Update provider state and refresh
    codeLensProvider.setSessionEnabled(codeLensEnabled);
    codeLensProvider.refresh();
    conversionCodeLensProvider.setSessionEnabled(codeLensEnabled);
    conversionCodeLensProvider.refresh();
  };

  updateCodeLensState();

  // Add commands to toggle CodeLens (both on and off states)
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.toggleCodeLens", async () => {
      codeLensEnabled = !codeLensEnabled;
      updateCodeLensState();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.toggleCodeLensOff", async () => {
      codeLensEnabled = !codeLensEnabled;
      updateCodeLensState();
    })
  );

  // Register list item conversion commands
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.convertListItem", async (documentUri: vscode.Uri, lineNumber: number) => {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const editor = await vscode.window.showTextDocument(document);

      const line = document.lineAt(lineNumber);
      const lineText = line.text;

      // Parse the list item
      const listItemMatch = lineText.match(/^(\s*)(-|\*|\d+\.)\s+(.+)$/);
      if (listItemMatch) {
        const indent = listItemMatch[1];
        const content = listItemMatch[3];

        // Generate new task ID using smart collision avoidance
        const taskId = taskManager.generateNewTaskId();

        // Convert to task format (no HTML comments)
        const newText = `${indent}- [ ] ${content} ${taskId}`;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(documentUri, line.range, newText);
        await vscode.workspace.applyEdit(edit);

        // Process the document to update task tracking
        await taskManager.processDocument(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.convertSectionListItems", async (documentUri: vscode.Uri, headerLine: number) => {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const editor = await vscode.window.showTextDocument(document);
      const lines = document.getText().split("\n");
      const tasks = taskManager.getTasksByDocument(documentUri);
      const taskLines = new Set(tasks.map((task) => task.line));

      // Process the document first to ensure all existing IDs are tracked
      await taskManager.processDocument(document);

      const edits: { line: number; newText: string }[] = [];
      
      // Get the initial highest ID to start incrementing from
      const allTasks = taskManager.getAllTasks();
      let highestId = 100000; // Default starting ID
      for (const task of allTasks) {
        const match = task.id.match(/^PRD-(\d+)$/);
        if (match) {
          const numericPart = parseInt(match[1], 10);
          if (numericPart > highestId) {
            highestId = numericPart;
          }
        }
      }
      let nextIdNumber = highestId + 1;

      // Find convertible items under the header
      for (let i = headerLine + 1; i < lines.length; i++) {
        const line = lines[i];

        // Stop if we hit another header
        if (line.match(/^#{1,6}\s+/)) {
          break;
        }

        // Skip if already a task
        if (taskLines.has(i)) {
          continue;
        }

        // Check for convertible list item
        const listItemMatch = line.match(/^(\s*)(-|\*|\d+\.)\s+(.+)$/);
        if (listItemMatch) {
          const content = listItemMatch[3];

          // Skip if already has checkbox or PRD ID
          if (content.match(/^\[([ x])\]/) || content.match(/PRD-\d{6}/) || content.trim() === "") {
            continue;
          }

          const indent = listItemMatch[1];
          // Generate sequential ID
          const taskId = `PRD-${String(nextIdNumber).padStart(6, '0')}`;
          nextIdNumber++;
          const newText = `${indent}- [ ] ${content} ${taskId}`;

          edits.push({ line: i, newText });
        }
      }

      // Apply all edits
      if (edits.length > 0) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        edits.forEach((edit) => {
          const lineRange = document.lineAt(edit.line).range;
          workspaceEdit.replace(documentUri, lineRange, edit.newText);
        });

        await vscode.workspace.applyEdit(workspaceEdit);
        await taskManager.processDocument(document);

        vscode.window.showInformationMessage(`Converted ${edits.length} list items to tasks`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.convertAllListItems", async (documentUri: vscode.Uri) => {
      const document = await vscode.workspace.openTextDocument(documentUri);
      const editor = await vscode.window.showTextDocument(document);
      const lines = document.getText().split("\n");
      const tasks = taskManager.getTasksByDocument(documentUri);
      const taskLines = new Set(tasks.map((task) => task.line));

      // Process the document first to ensure all existing IDs are tracked
      await taskManager.processDocument(document);

      const edits: { line: number; newText: string }[] = [];
      
      // Get the initial highest ID to start incrementing from
      const allTasks = taskManager.getAllTasks();
      let highestId = 100000; // Default starting ID
      for (const task of allTasks) {
        const match = task.id.match(/^PRD-(\d+)$/);
        if (match) {
          const numericPart = parseInt(match[1], 10);
          if (numericPart > highestId) {
            highestId = numericPart;
          }
        }
      }
      let nextIdNumber = highestId + 1;

      // Find all convertible list items
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip if already a task
        if (taskLines.has(i)) {
          continue;
        }

        // Check for convertible list item
        const listItemMatch = line.match(/^(\s*)(-|\*|\d+\.)\s+(.+)$/);
        if (listItemMatch) {
          const content = listItemMatch[3];

          // Skip if already has checkbox or PRD ID
          if (content.match(/^\[([ x])\]/) || content.match(/PRD-\d{6}/) || content.trim() === "") {
            continue;
          }

          const indent = listItemMatch[1];
          // Generate sequential ID
          const taskId = `PRD-${String(nextIdNumber).padStart(6, '0')}`;
          nextIdNumber++;
          const newText = `${indent}- [ ] ${content} ${taskId}`;

          edits.push({ line: i, newText });
        }
      }

      // Apply all edits
      if (edits.length > 0) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        edits.forEach((edit) => {
          const lineRange = document.lineAt(edit.line).range;
          workspaceEdit.replace(documentUri, lineRange, edit.newText);
        });

        await vscode.workspace.applyEdit(workspaceEdit);
        await taskManager.processDocument(document);

        vscode.window.showInformationMessage(`Converted ${edits.length} list items to tasks`);
      } else {
        vscode.window.showInformationMessage("No convertible list items found");
      }
    })
  );

  // Register deconvert task command
  context.subscriptions.push(
    vscode.commands.registerCommand("prd-assistant.deconvertTask", async (taskId: string) => {
      if (!taskId) {
        vscode.window.showErrorMessage("No task ID provided");
        return;
      }

      const task = taskManager.getTaskById(taskId);
      if (!task) {
        vscode.window.showErrorMessage("Task not found");
        return;
      }

      const document = await vscode.workspace.openTextDocument(task.document);
      const editor = await vscode.window.showTextDocument(document);
      const line = document.lineAt(task.line);
      const lineText = line.text;

      // Parse the task line to extract components
      const taskMatch = lineText.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);
      if (taskMatch) {
        const [, indent, , , taskText, assignee, ] = taskMatch;
        
        // Convert back to list item format, preserving assignee but removing checkbox and PRD ID
        let newText = `${indent}- ${taskText}`;
        if (assignee) {
          newText += ` @${assignee}`;
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(task.document, line.range, newText);
        await vscode.workspace.applyEdit(edit);

        // Process the document to update task tracking
        await taskManager.processDocument(document);
        
        vscode.window.showInformationMessage(`Converted task ${taskId} to list item`);
      }
    })
  );

  // Register document formatting provider for markdown files
  // This will automatically work with "Format on Save" when enabled
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("markdown", {
      provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        // Only format PRD files
        if (!isPrdFile(document)) {
          return [];
        }
        
        // Check if checkbox normalization is enabled
        const config = vscode.workspace.getConfiguration("prdManager");
        if (!config.get<boolean>("normalizeCheckboxes", true)) {
          return [];
        }
        // Only normalize checkboxes, don't format other markdown content
        return taskManager.normalizeCheckboxesSync(document);
      },
    })
  );

  // Create diagnostic collection for duplicate warnings
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("prd-duplicates");
  context.subscriptions.push(diagnosticCollection);

  // Watch for document changes to update task tracking and show duplicate warnings
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      if (event.document.languageId === "markdown" && event.contentChanges.length > 0 && isPrdFile(event.document)) {
        const config = vscode.workspace.getConfiguration("prdManager");
        const autoProcess = config.get<boolean>("autoProcessDocuments", true);
        const showWarnings = config.get<boolean>("showDuplicateWarnings", true);
        
        if (!autoProcess) {
          return;
        }
        
        // Process document and check for duplicates
        setTimeout(async () => {
          await taskManager.processDocument(event.document);

          if (!showWarnings) {
            return;
          }

          // Check for duplicates and show diagnostics
          const duplicates = await taskManager.findDuplicateTaskIds(event.document);
          const diagnostics: vscode.Diagnostic[] = [];

          for (const [taskId, lines] of duplicates) {
            if (lines.length > 1) {
              // Mark all but the first occurrence as duplicates
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, event.document.lineAt(line).text.length));

                const diagnostic = new vscode.Diagnostic(range, `Duplicate task ID: ${taskId}. Use 'Fix Duplicates' command to auto-increment.`, vscode.DiagnosticSeverity.Warning);
                diagnostic.code = "duplicate-task-id";
                diagnostic.source = "PRD Assistant";
                diagnostics.push(diagnostic);
              }
            }
          }

          diagnosticCollection.set(event.document.uri, diagnostics);
        }, 300);
      }
    })
  );

  // Process already opened documents
  vscode.workspace.textDocuments.forEach((doc) => {
    if (doc.languageId === "markdown" && isPrdFile(doc)) {
      console.log("Processing existing PRD document:", doc.fileName);
      taskManager.processDocument(doc);
    }
  });

  // Scan workspace for PRD files on activation
  scanWorkspaceForPRDs().then(() => {
    console.log("Workspace scan complete, refreshing tree view");
    treeProvider.refresh();
  });

  // Process newly opened documents
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "markdown" && isPrdFile(doc)) {
        console.log("Processing newly opened PRD document:", doc.fileName);
        taskManager.processDocument(doc);
      }
    })
  );

  // Refresh tree view when documents change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      treeProvider.refresh();
    })
  );

  // Also refresh when active editor changes (this might fix the "switch file" issue)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && editor.document.languageId === "markdown") {
        console.log("Active editor changed to markdown file:", editor.document.fileName);
        // Process the document if it's not already processed
        await taskManager.processDocument(editor.document);
        treeProvider.refresh();
      }
    })
  );

  // Refresh tree view when configuration changes (for filters)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("prdAssistant.taskFilter")) {
        treeProvider.refresh();
      }
    })
  );
}

export function deactivate() {}
