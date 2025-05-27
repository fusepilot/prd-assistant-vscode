import * as vscode from "vscode";
import * as path from "path";
import { PrdTask } from "../models/task";
import { PrdTaskManager } from "../managers/prdTaskManager";

export class PrdTreeProvider implements vscode.TreeDataProvider<PrdTask | string> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PrdTask | string | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private taskManager: PrdTaskManager) {
    taskManager.onTasksChanged(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PrdTask | string): vscode.TreeItem {
    if (typeof element === "string") {
      // This is a header
      const headerText = element.replace(/^#+\s+/, ""); // Remove the # symbols
      const item = new vscode.TreeItem(headerText, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "prdHeader";

      // Use the same icon for all header levels
      item.iconPath = new vscode.ThemeIcon("symbol-class");

      // Calculate and show completion percentage
      const headerLevel = element.match(/^#+/)?.[0].length || 0;
      const allTasks = this.taskManager.getAllTasks();
      const tasksUnderHeader = allTasks.filter((task) => {
        if (task.headers && task.headers.length > 0) {
          return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
        }
        return false;
      });

      if (tasksUnderHeader.length > 0) {
        const completedTasks = tasksUnderHeader.filter((t) => t.completed).length;
        const percentage = Math.round((completedTasks / tasksUnderHeader.length) * 100);
        item.description = `${completedTasks}/${tasksUnderHeader.length} (${percentage}%)`;
      }

      return item;
    } else {
      // This is a task
      const item = new vscode.TreeItem(element.text, element.children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);

      item.id = element.id;
      item.contextValue = "prdTask";

      // Set checkbox icon based on completion status
      item.iconPath = new vscode.ThemeIcon(element.completed ? "pass-filled" : "circle-large-outline");

      // Add assignee and task ID to description
      const descriptionParts = [];
      if (element.assignee) {
        descriptionParts.push(element.assignee);
      }
      descriptionParts.push(element.id);
      item.description = descriptionParts.join(' • ');

      // Add tooltip
      item.tooltip = `${element.completed ? "Completed" : "Pending"} - ${element.id}`;

      // Add command to toggle on click
      item.command = {
        command: "prd-manager.toggleTask",
        title: "Toggle Task",
        arguments: [element.id],
      };
      
      return item;
    }
  }

  getChildren(element?: PrdTask | string): Thenable<(PrdTask | string)[]> {
    if (!element) {
      // Return root level - all tasks grouped by headers
      return Promise.resolve(this.getRootElements());
    } else if (typeof element === "string") {
      // Return tasks under this header
      return Promise.resolve(this.getTasksForHeader(element));
    } else {
      // Return children of the task
      return Promise.resolve(element.children);
    }
  }

  private getRootElements(): (PrdTask | string)[] {
    const elements: (PrdTask | string)[] = [];
    const allTasks = this.taskManager.getAllTasks();
    const headerMap = new Map<string, PrdTask[]>();

    console.log("Getting root elements, total tasks:", allTasks.length);

    // Group tasks by their last header
    allTasks.forEach((task) => {
      if (task.parent) return; // Skip child tasks

      let headerKey = "No Header";
      if (task.headers && task.headers.length > 0) {
        const lastHeader = task.headers[task.headers.length - 1];
        headerKey = "#".repeat(lastHeader.level) + " " + lastHeader.text;
      }

      if (!headerMap.has(headerKey)) {
        headerMap.set(headerKey, []);
      }
      headerMap.get(headerKey)!.push(task);
    });

    // Add headers and tasks
    headerMap.forEach((tasks, header) => {
      if (header !== "No Header") {
        elements.push(header);
      } else {
        // Add tasks without headers directly
        tasks.forEach((task) => elements.push(task));
      }
    });

    return elements;
  }

  private getTasksForHeader(header: string): PrdTask[] {
    const allTasks = this.taskManager.getAllTasks();
    const headerText = header.replace(/^#+\s+/, "");
    const headerLevel = header.match(/^#+/)?.[0].length || 0;

    return allTasks.filter((task) => {
      if (task.parent) return false; // Skip child tasks

      if (task.headers && task.headers.length > 0) {
        const lastHeader = task.headers[task.headers.length - 1];
        return lastHeader.text === headerText && lastHeader.level === headerLevel;
      }
      return false;
    });
  }

  getParent(element: PrdTask | string): vscode.ProviderResult<PrdTask | string> {
    if (typeof element === "string") {
      return undefined; // Headers have no parent
    }
    return element.parent;
  }
}
