import * as vscode from 'vscode';
import { PrdTaskManager } from '../managers/prdTaskManager';
import { isPrdFile } from '../utils/prdUtils';

export class PrdQuickFixProvider implements vscode.CodeActionProvider {
  constructor(private taskManager: PrdTaskManager) {}

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];
    
    // Only provide actions for PRD files
    if (!isPrdFile(document)) {
      return actions;
    }

    // Look for duplicate task ID diagnostics
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code === 'duplicate-task-id' && diagnostic.source === 'PRD Manager') {
        const action = await this.createFixDuplicateIdAction(document, diagnostic);
        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  private async createFixDuplicateIdAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
  ): Promise<vscode.CodeAction | undefined> {
    const line = document.lineAt(diagnostic.range.start.line);
    const lineText = line.text;
    
    // Extract the duplicate task ID from the diagnostic message
    const match = diagnostic.message.match(/Duplicate task ID: (PRD-\d{6})/);
    if (!match) {
      return undefined;
    }

    const duplicateId = match[1];
    
    // Generate a new unique ID
    const newId = this.taskManager.generateNewTaskId();
    
    // Create the fix action
    const action = new vscode.CodeAction(
      `Fix duplicate ID: Change ${duplicateId} to ${newId}`,
      vscode.CodeActionKind.QuickFix
    );

    // Create the edit to replace the duplicate ID with the new one
    const edit = new vscode.WorkspaceEdit();
    const idMatch = lineText.match(/PRD-\d{6}/);
    if (idMatch && typeof idMatch.index === 'number') {
      const startPos = new vscode.Position(diagnostic.range.start.line, idMatch.index);
      const endPos = new vscode.Position(diagnostic.range.start.line, idMatch.index + idMatch[0].length);
      const replaceRange = new vscode.Range(startPos, endPos);
      
      edit.replace(document.uri, replaceRange, newId);
    }

    action.edit = edit;
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    return action;
  }
}