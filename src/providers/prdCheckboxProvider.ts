import * as vscode from "vscode";
import { PrdTaskManager } from "../managers/prdTaskManager";

export class PrdCheckboxProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private taskManager: PrdTaskManager) {
    // Register click handler for markdown documents
    this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.handleSelectionChange, this));

    // Also handle mouse clicks
    this.disposables.push(
      vscode.commands.registerCommand("prd-manager.internalToggleTask", async (document: vscode.TextDocument, position: vscode.Position) => {
        await this.taskManager.toggleTaskAtPosition(document, position);
      })
    );
  }

  private async handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    // Only process single clicks (not selections)
    // if (event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
    //     return;
    // }
    // const editor = event.textEditor;
    // if (editor.document.languageId !== 'markdown') {
    //     return;
    // }
    // const position = event.selections[0].active;
    // const line = editor.document.lineAt(position.line);
    // // Check if we clicked on a checkbox
    // const checkboxMatch = line.text.match(/^(\s*)(-|\*|\d+\.)\s+\[([ x])\]/);
    // if (!checkboxMatch) {
    //     return;
    // }
    // // Calculate checkbox position
    // const checkboxStart = checkboxMatch[1].length + checkboxMatch[2].length + 2; // indent + bullet + space + '['
    // const checkboxEnd = checkboxStart + 3; // '[x]'
    // if (position.character >= checkboxStart && position.character <= checkboxEnd) {
    //     await this.taskManager.toggleTaskAtPosition(editor.document, position);
    // }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
