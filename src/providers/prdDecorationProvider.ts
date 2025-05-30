import * as vscode from 'vscode';
import { isPrdFile } from '../utils/prdUtils';

export class PrdDecorationProvider implements vscode.Disposable {
    private assigneeDecorationType: vscode.TextEditorDecorationType;
    private taskIdDecorationType: vscode.TextEditorDecorationType;
    private completedTaskDecorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Create decoration types
        this.assigneeDecorationType = vscode.window.createTextEditorDecorationType({
            color: new vscode.ThemeColor('terminal.ansiCyan'),
            fontWeight: 'bold'
        });

        this.taskIdDecorationType = vscode.window.createTextEditorDecorationType({
            color: new vscode.ThemeColor('terminal.ansiBlue'),
            textDecoration: 'underline',
            cursor: 'pointer'
        });

        this.completedTaskDecorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.7'
        });

        // Register event handlers
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Apply to all open editors
        vscode.window.visibleTextEditors.forEach(editor => {
            this.updateDecorations(editor);
        });
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        const config = vscode.workspace.getConfiguration('prdAssistant');
        const enableDecorations = config.get<boolean>('enableDecorations', true);
        
        if (!enableDecorations) {
            // Clear all decorations
            editor.setDecorations(this.assigneeDecorationType, []);
            editor.setDecorations(this.taskIdDecorationType, []);
            editor.setDecorations(this.completedTaskDecorationType, []);
            return;
        }
        if (editor.document.languageId !== 'markdown' || !isPrdFile(editor.document)) {
            return;
        }

        const assigneeDecorations: vscode.DecorationOptions[] = [];
        const taskIdDecorations: vscode.DecorationOptions[] = [];
        const completedTaskDecorations: vscode.DecorationOptions[] = [];

        const text = editor.document.getText();
        const lines = text.split('\n');

        lines.forEach((line, lineIndex) => {
            // Check for task lines
            const taskMatch = line.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]\s+(.*?)(?:\s+@([\w-]+(?:-copilot)?))?\s*(PRD-\d{6})?$/);
            
            if (taskMatch) {
                const [, , , checked, taskText, assignee, taskId] = taskMatch;

                // Highlight completed tasks
                if (checked === 'x' && this.getConfig('decorateCompletedTasks', true)) {
                    const startPos = new vscode.Position(lineIndex, 0);
                    const endPos = new vscode.Position(lineIndex, line.length);
                    completedTaskDecorations.push({
                        range: new vscode.Range(startPos, endPos)
                    });
                }

                // Highlight assignees
                if (assignee && this.getConfig('decorateAssignees', true)) {
                    const assigneeIndex = line.indexOf(`@${assignee}`);
                    if (assigneeIndex !== -1) {
                        const startPos = new vscode.Position(lineIndex, assigneeIndex);
                        const endPos = new vscode.Position(lineIndex, assigneeIndex + assignee.length + 1);
                        assigneeDecorations.push({
                            range: new vscode.Range(startPos, endPos),
                            hoverMessage: `Assigned to ${assignee}`
                        });
                    }
                }

                // Highlight task IDs
                if (taskId && this.getConfig('decorateDeepLinks', true)) {
                    const idIndex = line.indexOf(taskId);
                    if (idIndex !== -1) {
                        const startPos = new vscode.Position(lineIndex, idIndex);
                        const endPos = new vscode.Position(lineIndex, idIndex + taskId.length);
                        taskIdDecorations.push({
                            range: new vscode.Range(startPos, endPos),
                            hoverMessage: `Task ID: ${taskId}\nClick to copy`
                        });
                    }
                }
            }

            // Also highlight standalone PRD IDs
            const prdIdRegex = /PRD-\d{6}/g;
            let match;
            while ((match = prdIdRegex.exec(line)) !== null) {
                const startPos = new vscode.Position(lineIndex, match.index);
                const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
                taskIdDecorations.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: `Go to ${match[0]}`
                });
            }
        });

        editor.setDecorations(this.assigneeDecorationType, assigneeDecorations);
        editor.setDecorations(this.taskIdDecorationType, taskIdDecorations);
        editor.setDecorations(this.completedTaskDecorationType, completedTaskDecorations);
    }

    private getConfig<T>(key: string, defaultValue: T): T {
        return vscode.workspace.getConfiguration('prdAssistant').get(key, defaultValue);
    }

    dispose(): void {
        this.assigneeDecorationType.dispose();
        this.taskIdDecorationType.dispose();
        this.completedTaskDecorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}