import * as vscode from "vscode";
import { PrdTaskManager } from "../managers/prdTaskManager";
import { isPrdFile } from "../utils/prdUtils";

export class PrdCodeLensProvider implements vscode.CodeLensProvider {
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
    const tasks = this.taskManager.getTasksByDocument(document.uri);
    const lines = document.getText().split("\n");

    // Process headers for completion stats and add task buttons
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch && this.isHeaderCodeLensEnabled()) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];
        const range = new vscode.Range(i, 0, i, line.length);

        // Find tasks under this header
        const tasksUnderHeader = tasks.filter((task) => {
          if (task.headers && task.headers.length > 0) {
            // Check if this header is in the task's header chain
            return task.headers.some((h) => h.line === i && h.text === headerText);
          }
          return false;
        });

        if (tasksUnderHeader.length > 0) {
          // Calculate completion percentage
          const completedTasks = tasksUnderHeader.filter((t) => t.completed).length;
          const percentage = Math.round((completedTasks / tasksUnderHeader.length) * 100);

          // Add completion stats
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: `${completedTasks}/${tasksUnderHeader.length} tasks (${percentage}%)`,
              command: "",
            })
          );
          
        }

        // Add "Add Task" button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Add Task",
            command: "prd-assistant.addTaskToHeader",
            arguments: [i, level, headerText],
          })
        );
        

        // Add copy task list button if there are tasks
        if (tasksUnderHeader.length > 0) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              title: "Copy Uncompleted Task List",
              command: "prd-assistant.copyTaskList",
              arguments: [tasksUnderHeader],
            })
          );
          
        }
      }
    }

    // Process individual tasks
    if (this.isTaskCodeLensEnabled()) {
      for (const task of tasks) {
        const line = document.lineAt(task.line);
        const range = new vscode.Range(line.range.start, line.range.end);

        // Toggle task action
        codeLenses.push(
        new vscode.CodeLens(range, {
          title: task.completed ? "Completed" : "Mark Complete",
          command: "prd-assistant.toggleTask",
          arguments: [task.id],
        })
      );
      

      // Assign task action
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: task.assignee ? `Assigned to ${task.assignee}` : "Assign Task",
          command: "prd-assistant.assignTask",
          arguments: [task.id],
        })
      );
      

      // Copy link action
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: "Copy Link",
          command: "prd-assistant.copyDeepLink",
          arguments: [task.id],
        })
      );
      

      // Add subtask button and show subtask count if any
      if (task.children.length > 0) {
        // Add subtask button
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: "Add Subtask",
            command: "prd-assistant.addTaskToTask",
            arguments: [task],
          })
        );
        

        // Show subtask count
        const completedSubtasks = task.children.filter((child) => child.completed).length;
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `${completedSubtasks}/${task.children.length} subtasks`,
            command: "",
          })
        );
        
      }

      // Add deconvert button
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: "Deconvert",
          command: "prd-assistant.deconvertTask",
          arguments: [task.id],
        })
      );
      
      }
    }

    return codeLenses;
  }

  private isEnabled(): boolean {
    const configEnabled = vscode.workspace.getConfiguration("prdAssistant").get("showCodeLens", true);
    return configEnabled && this._sessionEnabled;
  }
  
  private isHeaderCodeLensEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("prdAssistant");
    return config.get<boolean>("enableCodeLensForHeaders", true);
  }
  
  private isTaskCodeLensEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("prdAssistant");
    return config.get<boolean>("enableCodeLensForTasks", true);
  }
}
