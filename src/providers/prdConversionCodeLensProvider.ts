import * as vscode from "vscode";
import { PrdTaskManager } from "../managers/prdTaskManager";
import { isPrdFile } from "../utils/prdUtils";

export class PrdConversionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private _sessionEnabled = true;

  constructor(private taskManager: PrdTaskManager) {
    taskManager.onTasksChanged(() => this._onDidChangeCodeLenses.fire());
  }

  public setSessionEnabled(enabled: boolean): void {
    this._sessionEnabled = enabled;
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
    if (!this.isEnabled() || !isPrdFile(document)) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    const lines = document.getText().split("\n");
    const tasks = this.taskManager.getTasksByDocument(document.uri);
    
    // Track existing task lines to avoid conversion buttons on them
    const taskLines = new Set(tasks.map(task => task.line));
    
    // Add conversion button at the top of the file
    const convertibleItems = this.findConvertibleItems(lines, taskLines);
    if (convertibleItems.length > 0) {
      codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `Convert All List Items to Tasks (${convertibleItems.length} items)`,
          command: "prd-manager.convertAllListItems",
          arguments: [document.uri]
        })
      );
    }

    // Process each line for individual conversion opportunities
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip if this line is already a valid task
      if (taskLines.has(i)) {
        continue;
      }

      // Check for headers with convertible list items underneath
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const headerItems = this.findConvertibleItemsUnderHeader(lines, i, taskLines);
        if (headerItems.length > 0) {
          const range = new vscode.Range(i, 0, i, line.length);
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `Convert Section List Items to Tasks (${headerItems.length} items)`,
              command: "prd-manager.convertSectionListItems", 
              arguments: [document.uri, i]
            })
          );
        }
        continue;
      }

      // Check for individual convertible list items
      if (this.isConvertibleListItem(line, taskLines.has(i))) {
        const range = new vscode.Range(i, 0, i, line.length);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Convert to Task",
            command: "prd-manager.convertListItem",
            arguments: [document.uri, i]
          })
        );
      }
    }

    return codeLenses;
  }

  private findConvertibleItems(lines: string[], taskLines: Set<number>): number[] {
    const items: number[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (!taskLines.has(i) && this.isConvertibleListItem(lines[i], false)) {
        items.push(i);
      }
    }
    
    return items;
  }

  private findConvertibleItemsUnderHeader(lines: string[], headerLine: number, taskLines: Set<number>): number[] {
    const items: number[] = [];
    
    // Look for list items after the header until we hit another header or end of file
    for (let i = headerLine + 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Stop if we hit another header
      if (line.match(/^#{1,6}\s+/)) {
        break;
      }
      
      // Check if this is a convertible list item
      if (!taskLines.has(i) && this.isConvertibleListItem(line, false)) {
        items.push(i);
      }
    }
    
    return items;
  }

  private isConvertibleListItem(line: string, isTask: boolean): boolean {
    if (isTask) {
      return false; // Already a task
    }
    
    // Match list items that are NOT already checkboxes
    // Patterns: "- item", "* item", "1. item", "  - item" etc.
    const listItemMatch = line.match(/^(\s*)(-|\*|\d+\.)\s+(.+)$/);
    if (!listItemMatch) {
      return false;
    }
    
    const content = listItemMatch[3];
    
    // Skip if it already has a checkbox
    if (content.match(/^\[([ x])\]/)) {
      return false;
    }
    
    // Skip if it already has a PRD ID (at end of line or in HTML comment)
    if (content.match(/PRD-\d{6}/)) {
      return false;
    }
    
    // Skip empty content
    if (content.trim() === '') {
      return false;
    }
    
    return true;
  }

  private isEnabled(): boolean {
    const configEnabled = vscode.workspace.getConfiguration("prdManager").get("showCodeLens", true);
    const conversionEnabled = vscode.workspace.getConfiguration("prdManager").get("enableConversionCodeLens", true);
    return configEnabled && conversionEnabled && this._sessionEnabled;
  }
}