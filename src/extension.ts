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
        showCollapseAll: true
    });

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
        vscode.commands.registerCommand('prd-manager.addTaskToHeader', async (headerLine: number, headerLevel: number, headerText: string) => {
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

                await taskManager.addTaskToHeader(editor, headerLine, headerLevel, headerText, taskText, assignee);
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
        vscode.commands.registerCommand('prd-manager.assignTask', async (taskId?: string) => {
            const assignee = await vscode.window.showInputBox({
                prompt: 'Assign to',
                placeHolder: '@username-copilot'
            });

            if (assignee && taskId) {
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
            if (item && item.text) {
                await vscode.env.clipboard.writeText(item.text);
                vscode.window.showInformationMessage('Copied task text to clipboard');
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

    // Watch for document changes to update task IDs
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.languageId === 'markdown') {
                // Debounce to avoid processing during our own edits
                setTimeout(async () => {
                    await taskManager.processDocument(event.document);
                }, 100);
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
}

export function deactivate() {}