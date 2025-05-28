import * as vscode from 'vscode';
import { PrdTreeProvider } from './providers/prdTreeProvider';
import { PrdDocumentLinkProvider } from './providers/prdDocumentLinkProvider';
import { PrdCodeLensProvider } from './providers/prdCodeLensProvider';
import { PrdDecorationProvider } from './providers/prdDecorationProvider';
import { PrdTaskManager } from './managers/prdTaskManager';
import { PrdCheckboxProvider } from './providers/prdCheckboxProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('PRD Manager extension is now active!');

    // Initialize the task manager
    const taskManager = new PrdTaskManager();

    // Register tree view provider for sidebar
    const treeProvider = new PrdTreeProvider(taskManager);
    const treeView = vscode.window.createTreeView('prdExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: false  // We'll implement custom toggle
    });
    
    // Track expand/collapse state
    let areItemsCollapsed = false;
    
    // Ensure the tree view is ready before allowing collapse/expand
    let treeViewReady = false;
    setTimeout(() => {
        treeViewReady = true;
    }, 500);

    // Register checkbox click handler
    const checkboxProvider = new PrdCheckboxProvider(taskManager);
    context.subscriptions.push(checkboxProvider);

    // Register document link provider for deep linking
    const linkProvider = new PrdDocumentLinkProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(
            { scheme: 'file', pattern: '**/*.md' },
            linkProvider
        )
    );

    // Register CodeLens provider for inline actions
    const codeLensProvider = new PrdCodeLensProvider(taskManager);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'file', pattern: '**/*.md' },
            codeLensProvider
        )
    );

    // Register decoration provider for visual enhancements
    const decorationProvider = new PrdDecorationProvider();
    context.subscriptions.push(decorationProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.toggleTask', async (item?: any) => {
            let taskId: string | undefined;
            
            // Handle different input types
            if (typeof item === 'string') {
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
        vscode.commands.registerCommand('prd-manager.generateReport', async () => {
            const report = await taskManager.generateProgressReport();
            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.addTask', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const taskText = await vscode.window.showInputBox({
                prompt: 'Enter task description',
                placeHolder: 'Task description'
            });

            if (taskText) {
                const assignee = await vscode.window.showInputBox({
                    prompt: 'Assign to (optional)',
                    placeHolder: '@username-copilot'
                });

                await taskManager.addTask(editor, taskText, assignee);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.addTaskAtCursor', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const taskText = await vscode.window.showInputBox({
                prompt: 'Enter task description',
                placeHolder: 'Task description'
            });

            if (taskText) {
                const assignee = await vscode.window.showInputBox({
                    prompt: 'Assign to (optional)',
                    placeHolder: '@username-copilot'
                });

                await taskManager.addTaskAtPosition(editor, editor.selection.active, taskText, assignee);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.addTaskToHeader', async (headerLine: number | string, headerLevel?: number, headerText?: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            // Handle call from tree view (header string) vs CodeLens (individual args)
            let finalHeaderLine: number;
            let finalHeaderLevel: number;
            let finalHeaderText: string;
            
            if (typeof headerLine === 'string') {
                // Called from tree view with header string like "## Header Name"
                const headerStr = headerLine;
                finalHeaderText = headerStr.replace(/^#+\s+/, '');
                finalHeaderLevel = headerStr.match(/^#+/)?.[0].length || 1;
                
                // Find the header line in the document
                const allTasks = taskManager.getAllTasks();
                const tasksWithThisHeader = allTasks.filter(task => 
                    task.headers?.some(h => h.text === finalHeaderText && h.level === finalHeaderLevel)
                );
                
                if (tasksWithThisHeader.length > 0) {
                    const headerInfo = tasksWithThisHeader[0].headers?.find(h => h.text === finalHeaderText && h.level === finalHeaderLevel);
                    finalHeaderLine = headerInfo?.line || 0;
                } else {
                    // Find in document directly
                    const lines = editor.document.getText().split('\n');
                    finalHeaderLine = lines.findIndex(line => {
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
                prompt: 'Enter task description',
                placeHolder: 'Task description'
            });

            if (taskText) {
                const assignee = await vscode.window.showInputBox({
                    prompt: 'Assign to (optional)',
                    placeHolder: '@username-copilot'
                });

                await taskManager.addTaskToHeader(editor, finalHeaderLine, finalHeaderLevel, finalHeaderText, taskText, assignee);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.addTaskToTask', async (item: any) => {
            if (!item || !item.id) {
                vscode.window.showErrorMessage('No task selected');
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            const taskText = await vscode.window.showInputBox({
                prompt: 'Enter subtask description',
                placeHolder: 'Subtask description'
            });

            if (taskText) {
                const assignee = await vscode.window.showInputBox({
                    prompt: 'Assign to (optional)',
                    placeHolder: '@username-copilot'
                });

                // Find the parent task in the document
                const parentTask = taskManager.getTaskById(item.id);
                if (parentTask) {
                    const parentLine = parentTask.line;
                    const taskId = taskManager.generateNewTaskId();
                    const taskLine = `  - [ ] ${taskText}${assignee ? ` @${assignee}` : ''} <!-- ${taskId} -->`;
                    
                    // Find the end of the existing subtask group
                    let insertLine = parentLine;
                    const totalLines = editor.document.lineCount;
                    
                    // Look for the last subtask of this parent
                    for (let i = parentLine + 1; i < totalLines; i++) {
                        const line = editor.document.lineAt(i).text;
                        const isSubtask = line.match(/^\s{2,}(-|\*|\d+\.)\s+\[[ x]\]/); // Indented task (subtask)
                        const isTask = line.match(/^(-|\*|\d+\.)\s+\[[ x]\]/); // Non-indented task
                        const isHeader = line.match(/^#{1,6}\s+/);
                        const isEmpty = line.trim() === '';
                        
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
                        const nextLineIsEmpty = nextLine.trim() === '';
                        const nextLineIsSubtask = nextLine.match(/^\s{2,}(-|\*|\d+\.)\s+\[[ x]\]/); // Indented task
                        const nextLineIsTask = nextLine.match(/^(-|\*|\d+\.)\s+\[[ x]\]/); // Non-indented task
                        const nextLineIsHeader = nextLine.match(/^#{1,6}\s+/);
                        
                        // Add empty line if we're at the end of the subtask group
                        shouldAddEmptyLineAfter = !nextLineIsEmpty && !nextLineIsSubtask && !nextLineIsTask && !nextLineIsHeader;
                    }
                    
                    let textToInsert = taskLine + '\n';
                    if (shouldAddEmptyLineBefore) {
                        textToInsert = '\n' + textToInsert;
                    }
                    if (shouldAddEmptyLineAfter) {
                        textToInsert = textToInsert + '\n';
                    }

                    const edit = new vscode.WorkspaceEdit();
                    edit.insert(editor.document.uri, new vscode.Position(insertLine + 1, 0), textToInsert);
                    await vscode.workspace.applyEdit(edit);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.copyTaskList', async (tasks: any[]) => {
            if (!tasks || tasks.length === 0) {
                vscode.window.showInformationMessage('No tasks to copy');
                return;
            }

            // Filter for uncompleted tasks only
            const uncompletedTasks = tasks.filter(task => !task.completed);
            
            if (uncompletedTasks.length === 0) {
                vscode.window.showInformationMessage('All tasks are completed');
                return;
            }

            // Create comma-separated list of uncompleted task IDs
            const taskList = uncompletedTasks.map(task => task.id).join(', ');
            
            await vscode.env.clipboard.writeText(taskList);
            vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.assignTask', async (item?: any) => {
            let taskId: string | undefined;
            
            // Handle different input types
            if (typeof item === 'string') {
                taskId = item;
            } else if (item && item.id) {
                taskId = item.id;
            }
            
            if (!taskId) {
                vscode.window.showErrorMessage('No task selected');
                return;
            }

            // Get existing assignees for suggestions
            const allTasks = taskManager.getAllTasks();
            const existingAssignees = [...new Set(allTasks
                .map(task => task.assignee)
                .filter(assignee => assignee)
                .map(assignee => assignee!.startsWith('@') ? assignee! : `@${assignee!}`)
            )];
            
            let assignee: string | undefined;
            
            if (existingAssignees.length > 0) {
                // Show quick pick with existing assignees plus option to enter new
                const items = [
                    ...existingAssignees.map(name => ({ label: name, description: 'Existing assignee' })),
                    { label: '$(plus) Enter new assignee...', description: 'Type a new assignee name' }
                ];
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select assignee or enter new'
                });
                
                if (selected) {
                    if (selected.label.startsWith('$(plus)')) {
                        // User wants to enter new assignee
                        assignee = await vscode.window.showInputBox({
                            prompt: 'Assign to',
                            placeHolder: '@username-copilot'
                        });
                    } else {
                        assignee = selected.label;
                    }
                }
            } else {
                // No existing assignees, show input box directly
                assignee = await vscode.window.showInputBox({
                    prompt: 'Assign to',
                    placeHolder: '@username-copilot'
                });
            }

            if (assignee) {
                await taskManager.assignTask(taskId, assignee);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.copyDeepLink', async (taskId?: string) => {
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
        vscode.commands.registerCommand('prd-manager.openPrdFile', async () => {
            // Get the first PRD file from the task manager
            const allTasks = taskManager.getAllTasks();
            if (allTasks.length > 0) {
                const firstTask = allTasks[0];
                const doc = await vscode.workspace.openTextDocument(firstTask.document);
                await vscode.window.showTextDocument(doc);
            } else {
                // If no tasks, look for PRD.md in workspace
                const prdFiles = await vscode.workspace.findFiles('**/PRD.md', '**/node_modules/**', 1);
                if (prdFiles.length > 0) {
                    const doc = await vscode.workspace.openTextDocument(prdFiles[0]);
                    await vscode.window.showTextDocument(doc);
                } else {
                    vscode.window.showInformationMessage('No PRD file found in workspace');
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.refreshTasks', () => {
            treeProvider.refresh();
            vscode.window.showInformationMessage('PRD Tasks refreshed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.filterAllTasks', async () => {
            // Try workspace first, fallback to global
            const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
            await vscode.workspace.getConfiguration('prdManager').update('taskFilter', 'all', target);
            console.log('Set filter to all');
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.filterCompletedTasks', async () => {
            // Try workspace first, fallback to global
            const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
            await vscode.workspace.getConfiguration('prdManager').update('taskFilter', 'completed', target);
            console.log('Set filter to completed');
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.filterUncompletedTasks', async () => {
            // Try workspace first, fallback to global
            const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
            await vscode.workspace.getConfiguration('prdManager').update('taskFilter', 'uncompleted', target);
            console.log('Set filter to uncompleted');
            treeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.copyTaskId', async (item: any) => {
            let taskId: string | undefined;
            
            if (typeof item === 'string') {
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
        vscode.commands.registerCommand('prd-manager.copyTaskText', async (item: any) => {
            if (item && item.text && item.id) {
                const textWithId = `${item.text} <!-- ${item.id} -->`;
                await vscode.env.clipboard.writeText(textWithId);
                vscode.window.showInformationMessage('Copied task text with ID to clipboard');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.copyHeaderTasksContext', async (header: string) => {
            // Same logic as copyHeaderTasks but for context menu
            if (typeof header === 'string') {
                const allTasks = taskManager.getAllTasks();
                const headerText = header.replace(/^#+\s+/, '');
                const headerLevel = header.match(/^#+/)?.[0].length || 0;
                
                const tasksUnderHeader = allTasks.filter(task => {
                    if (task.headers && task.headers.length > 0) {
                        return task.headers.some(h => h.text === headerText && h.level === headerLevel);
                    }
                    return false;
                });

                const uncompletedTasks = tasksUnderHeader.filter(task => !task.completed);
                
                if (uncompletedTasks.length === 0) {
                    vscode.window.showInformationMessage('No uncompleted tasks under this header');
                    return;
                }

                const taskList = uncompletedTasks.map(task => task.id).join(', ');
                await vscode.env.clipboard.writeText(taskList);
                vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.copyHeaderTasks', async (header: string) => {
            if (typeof header === 'string') {
                const allTasks = taskManager.getAllTasks();
                const headerText = header.replace(/^#+\s+/, '');
                const headerLevel = header.match(/^#+/)?.[0].length || 0;
                
                const tasksUnderHeader = allTasks.filter(task => {
                    if (task.headers && task.headers.length > 0) {
                        return task.headers.some(h => h.text === headerText && h.level === headerLevel);
                    }
                    return false;
                });

                const uncompletedTasks = tasksUnderHeader.filter(task => !task.completed);
                
                if (uncompletedTasks.length === 0) {
                    vscode.window.showInformationMessage('No uncompleted tasks under this header');
                    return;
                }

                const taskList = uncompletedTasks.map(task => task.id).join(', ');
                await vscode.env.clipboard.writeText(taskList);
                vscode.window.showInformationMessage(`Copied ${uncompletedTasks.length} uncompleted task IDs to clipboard`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.goToHeader', async (header: string) => {
            if (typeof header === 'string') {
                const headerText = header.replace(/^#+\s+/, '');
                const headerLevel = header.match(/^#+/)?.[0].length || 0;
                
                // Find the first PRD file with this header
                const allTasks = taskManager.getAllTasks();
                if (allTasks.length > 0) {
                    // Get document from first task
                    const doc = await vscode.workspace.openTextDocument(allTasks[0].document);
                    const text = doc.getText();
                    const lines = text.split('\n');
                    
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
        vscode.commands.registerCommand('prd-manager.goToTask', async (item: any) => {
            let taskId: string | undefined;
            
            // Handle both direct task ID and tree item
            if (typeof item === 'string') {
                taskId = item;
            } else if (item && item.id) {
                taskId = item.id;
            } else {
                // Try to get from tree selection
                const selection = treeView.selection[0];
                if (selection && typeof selection !== 'string' && selection.id) {
                    taskId = selection.id;
                }
            }
            
            if (!taskId) return;
            
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
        vscode.commands.registerCommand('prd-manager.toggleCollapseExpand', async () => {
            // Wait for tree view to be ready
            if (!treeViewReady) {
                await new Promise(resolve => setTimeout(resolve, 500));
                treeViewReady = true;
            }
            
            if (areItemsCollapsed) {
                // Expand all by revealing all top-level elements
                const elements = await treeProvider.getChildren();
                if (elements) {
                    for (const element of elements) {
                        if (typeof element === 'string') {
                            // This is a header - reveal it as expanded
                            try {
                                await treeView.reveal(element, { 
                                    expand: true, 
                                    focus: false, 
                                    select: false 
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
                await vscode.commands.executeCommand('workbench.actions.treeView.prdExplorer.collapseAll');
                areItemsCollapsed = true;
            }
        })
    );

    // Add command to fix duplicates manually
    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.fixDuplicates', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                await taskManager.fixDuplicates(editor);
                vscode.window.showInformationMessage('Fixed duplicate task IDs');
            }
        })
    );



    // Add command to normalize checkboxes
    context.subscriptions.push(
        vscode.commands.registerCommand('prd-manager.normalizeCheckboxes', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                const edits = await taskManager.normalizeCheckboxes(editor.document);
                if (edits.length > 0) {
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    edits.forEach(edit => {
                        workspaceEdit.replace(editor.document.uri, edit.range, edit.newText);
                    });
                    await vscode.workspace.applyEdit(workspaceEdit);
                    vscode.window.showInformationMessage('Normalized checkbox formatting');
                }
            }
        })
    );

    // Register document formatting provider for markdown files
    // This will automatically work with "Format on Save" when enabled
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('markdown', {
            provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
                // Check if checkbox normalization is enabled
                const config = vscode.workspace.getConfiguration('prdManager');
                if (!config.get<boolean>('normalizeCheckboxes', true)) {
                    return [];
                }
                // Only normalize checkboxes, don't format other markdown content
                return taskManager.normalizeCheckboxesSync(document);
            }
        })
    );

    // Create diagnostic collection for duplicate warnings
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('prd-duplicates');
    context.subscriptions.push(diagnosticCollection);

    // Watch for document changes to update task tracking and show duplicate warnings
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.languageId === 'markdown' && event.contentChanges.length > 0) {
                // Process document and check for duplicates
                setTimeout(async () => {
                    await taskManager.processDocument(event.document);
                    
                    // Check for duplicates and show diagnostics
                    const duplicates = await taskManager.findDuplicateTaskIds(event.document);
                    const diagnostics: vscode.Diagnostic[] = [];
                    
                    for (const [taskId, lines] of duplicates) {
                        if (lines.length > 1) {
                            // Mark all but the first occurrence as duplicates
                            for (let i = 1; i < lines.length; i++) {
                                const line = lines[i];
                                const range = new vscode.Range(
                                    new vscode.Position(line, 0),
                                    new vscode.Position(line, event.document.lineAt(line).text.length)
                                );
                                
                                const diagnostic = new vscode.Diagnostic(
                                    range,
                                    `Duplicate task ID: ${taskId}. Use 'Fix Duplicates' command to auto-increment.`,
                                    vscode.DiagnosticSeverity.Warning
                                );
                                diagnostic.code = 'duplicate-task-id';
                                diagnostic.source = 'PRD Manager';
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
    vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId === 'markdown') {
            console.log('Processing existing document:', doc.fileName);
            taskManager.processDocument(doc);
        }
    });

    // Process newly opened documents
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'markdown') {
                console.log('Processing newly opened document:', doc.fileName);
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

    // Refresh tree view when configuration changes (for filters)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('prdManager.taskFilter')) {
                treeProvider.refresh();
            }
        })
    );
}

export function deactivate() {}