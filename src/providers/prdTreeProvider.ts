import * as vscode from "vscode";
import * as path from "path";
import { PrdTask } from "../models/task";
import { PrdTaskManager } from "../managers/prdTaskManager";

interface DocumentNode {
  type: 'document';
  uri: vscode.Uri;
  filename: string;
}

export class PrdTreeProvider implements vscode.TreeDataProvider<PrdTask | string | DocumentNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PrdTask | string | DocumentNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private currentDocumentContext: vscode.Uri | null = null;

  constructor(private taskManager: PrdTaskManager) {
    taskManager.onTasksChanged(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PrdTask | string | DocumentNode): vscode.TreeItem {
    if (typeof element === "object" && "type" in element && element.type === "document") {
      // This is a document node
      const item = new vscode.TreeItem(element.filename, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "prdDocument";
      item.iconPath = new vscode.ThemeIcon("markdown");
      item.resourceUri = element.uri;
      
      // Calculate document stats
      const tasks = this.taskManager.getTasksByDocument(element.uri);
      const rootTasks = tasks.filter(t => !t.parent);
      const completedTasks = rootTasks.filter(t => t.completed).length;
      if (rootTasks.length > 0) {
        const percentage = Math.round((completedTasks / rootTasks.length) * 100);
        item.description = `${completedTasks}/${rootTasks.length} (${percentage}%)`;
      }
      
      // Add command to open the document
      item.command = {
        command: "prd-manager.openDocument",
        title: "Open Document",
        arguments: [element],
      };
      
      return item;
    } else if (typeof element === "string") {
      // This is a header
      let headerText: string;
      // Handle multi-file mode headers that include document URI
      if (element.includes('::')) {
        const [, headerPart] = element.split('::', 2);
        headerText = headerPart.replace(/^#+\s+/, "");
      } else {
        headerText = element.replace(/^#+\s+/, "");
      }
      
      // Check if this header has any tasks under it
      const headerTasks = this.getTasksForHeader(element);
      const hasChildren = headerTasks.length > 0;
      
      const item = new vscode.TreeItem(headerText, hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.contextValue = "prdHeader";

      // Use the same icon for all header levels
      item.iconPath = new vscode.ThemeIcon("symbol-class");

      // Calculate and show completion percentage
      let headerLevel: number;
      let tasksUnderHeader: any[];
      
      if (element.includes('::')) {
        // Multi-file mode: extract level and get tasks from specific document
        const [uriString, headerPart] = element.split('::', 2);
        const documentUri = vscode.Uri.parse(uriString);
        headerLevel = headerPart.match(/^#+/)?.[0].length || 0;
        const documentTasks = this.taskManager.getTasksByDocument(documentUri);
        tasksUnderHeader = documentTasks.filter((task) => {
          if (task.headers && task.headers.length > 0) {
            return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
          }
          return false;
        });
      } else {
        // Single file mode: use all tasks
        headerLevel = element.match(/^#+/)?.[0].length || 0;
        const allTasks = this.taskManager.getAllTasks();
        tasksUnderHeader = allTasks.filter((task) => {
          if (task.headers && task.headers.length > 0) {
            return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
          }
          return false;
        });
      }

      if (tasksUnderHeader.length > 0) {
        const completedTasks = tasksUnderHeader.filter((t) => t.completed).length;
        const percentage = Math.round((completedTasks / tasksUnderHeader.length) * 100);
        item.description = `${completedTasks}/${tasksUnderHeader.length} (${percentage}%)`;
      }

      return item;
    } else {
      // This is a task (PrdTask)
      const task = element as PrdTask;
      const item = new vscode.TreeItem(task.text, task.children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);

      item.id = task.id;
      item.contextValue = task.children.length > 0 ? "prdTaskWithChildren" : "prdTask";

      // Set checkbox icon based on completion status
      item.iconPath = new vscode.ThemeIcon(task.completed ? "pass-filled" : "circle-large-outline");

      // Add assignee and task ID to description
      const descriptionParts = [];
      if (task.assignee) {
        descriptionParts.push(task.assignee);
      }
      descriptionParts.push(task.id);
      item.description = descriptionParts.join(' • ');

      // Add tooltip
      item.tooltip = `${task.completed ? "Completed" : "Pending"} - ${task.id}`;

      // Add command to toggle on click
      item.command = {
        command: "prd-manager.toggleTask",
        title: "Toggle Task",
        arguments: [task.id],
      };
      
      return item;
    }
  }

  getChildren(element?: PrdTask | string | DocumentNode): Thenable<(PrdTask | string | DocumentNode)[]> {
    if (!element) {
      // Return root level - check if we have multiple documents
      const documents = this.taskManager.getDocuments();
      console.log(`TreeProvider: Found ${documents.length} documents:`, documents.map(d => path.basename(d.fsPath)));
      
      if (documents.length > 1) {
        // Multiple files: return document nodes
        const documentNodes = documents.map(uri => ({
          type: 'document' as const,
          uri,
          filename: path.basename(uri.fsPath)
        }));
        console.log('TreeProvider: Returning document nodes for multi-file mode');
        return Promise.resolve(documentNodes);
      } else if (documents.length === 1) {
        // Single file: return headers/tasks directly
        console.log('TreeProvider: Single file mode, returning elements for:', path.basename(documents[0].fsPath));
        return Promise.resolve(this.getRootElementsForDocument(documents[0]));
      } else {
        // No documents
        console.log('TreeProvider: No documents found');
        return Promise.resolve([]);
      }
    } else if (typeof element === "object" && "type" in element && element.type === "document") {
      // Return headers/tasks for this document
      console.log('TreeProvider: Getting children for document:', element.filename);
      const elements = this.getRootElementsForDocument(element.uri);
      console.log(`TreeProvider: Document ${element.filename} has ${elements.length} root elements`);
      return Promise.resolve(elements);
    } else if (typeof element === "string") {
      // Return tasks under this header
      return Promise.resolve(this.getTasksForHeader(element));
    } else {
      // Return children of the task, applying filter
      const task = element as PrdTask;
      const filter = vscode.workspace.getConfiguration('prdManager').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');
      
      let filteredChildren = task.children;
      if (filter === 'completed') {
        filteredChildren = task.children.filter((child: PrdTask) => child.completed);
      } else if (filter === 'uncompleted') {
        filteredChildren = task.children.filter((child: PrdTask) => !child.completed);
      }
      
      // Sort children by line number to maintain document order
      filteredChildren.sort((a, b) => a.line - b.line);
      
      return Promise.resolve(filteredChildren);
    }
  }

  public getRootElements(): (PrdTask | string)[] {
    // This method is kept for backward compatibility but now delegates to the new method
    const documents = this.taskManager.getDocuments();
    if (documents.length === 1) {
      return this.getRootElementsForDocument(documents[0]);
    }
    return [];
  }

  public getRootElementsForDocument(documentUri: vscode.Uri): (PrdTask | string)[] {
    const elements: (PrdTask | string)[] = [];
    const documentTasks = this.taskManager.getTasksByDocument(documentUri);
    
    // Get current filter setting
    const filter = vscode.workspace.getConfiguration('prdManager').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');

    console.log("Getting root elements for document:", documentUri.fsPath, "total tasks:", documentTasks.length, "filter:", filter);

    // Filter tasks first
    const filteredTasks = documentTasks.filter((task) => {
      if (task.parent) {return false;} // Skip child tasks
      
      // Apply filter
      if (filter === 'completed' && !task.completed) {return false;}
      if (filter === 'uncompleted' && task.completed) {return false;}
      
      return true;
    });

    // Group tasks by their last header, preserving line order
    const headerGroups = new Map<string, {header: string, headerLine: number, tasks: PrdTask[]}>();
    
    filteredTasks.forEach((task) => {
      let headerKey = "No Header";
      let headerLine = -1;
      
      if (task.headers && task.headers.length > 0) {
        const lastHeader = task.headers[task.headers.length - 1];
        headerKey = `${documentUri.toString()}::${"#".repeat(lastHeader.level)} ${lastHeader.text}`;
        headerLine = lastHeader.line;
      }

      if (!headerGroups.has(headerKey)) {
        headerGroups.set(headerKey, {
          header: headerKey,
          headerLine: headerLine,
          tasks: []
        });
      }
      headerGroups.get(headerKey)!.tasks.push(task);
    });

    // Sort header groups by line number
    const sortedHeaderGroups = Array.from(headerGroups.values()).sort((a, b) => {
      if (a.headerLine === -1 && b.headerLine === -1) {return 0;}
      if (a.headerLine === -1) {return 1;} // "No Header" goes last
      if (b.headerLine === -1) {return -1;}
      return a.headerLine - b.headerLine;
    });

    // Add headers and tasks in order
    sortedHeaderGroups.forEach(group => {
      if (group.header !== "No Header") {
        elements.push(group.header);
      }
      
      // Sort tasks within the group by line number
      group.tasks.sort((a, b) => a.line - b.line);
      
      if (group.header === "No Header") {
        // Add tasks without headers directly
        group.tasks.forEach((task) => elements.push(task));
      }
    });

    return elements;
  }

  private getTasksForHeader(header: string): PrdTask[] {
    // Parse the header to extract document URI and header info
    let documentUri: vscode.Uri | null = null;
    let headerText: string;
    let headerLevel: number;

    if (header.includes('::')) {
      // Multi-file mode: extract document URI
      const [uriString, headerPart] = header.split('::', 2);
      documentUri = vscode.Uri.parse(uriString);
      headerText = headerPart.replace(/^#+\s+/, "");
      headerLevel = headerPart.match(/^#+/)?.[0].length || 0;
    } else {
      // Single file mode: use the header directly
      headerText = header.replace(/^#+\s+/, "");
      headerLevel = header.match(/^#+/)?.[0].length || 0;
    }
    
    // Get tasks from appropriate document(s)
    const tasks = documentUri ? this.taskManager.getTasksByDocument(documentUri) : this.taskManager.getAllTasks();
    
    // Get current filter setting
    const filter = vscode.workspace.getConfiguration('prdManager').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');

    const filteredTasks = tasks.filter((task) => {
      if (task.parent) {return false;} // Skip child tasks
      
      // Apply filter
      if (filter === 'completed' && !task.completed) {return false;}
      if (filter === 'uncompleted' && task.completed) {return false;}

      if (task.headers && task.headers.length > 0) {
        const lastHeader = task.headers[task.headers.length - 1];
        return lastHeader.text === headerText && lastHeader.level === headerLevel;
      }
      return false;
    });

    // Sort tasks by line number to maintain document order
    return filteredTasks.sort((a, b) => a.line - b.line);
  }

  getParent(element: PrdTask | string | DocumentNode): vscode.ProviderResult<PrdTask | string | DocumentNode> {
    if (typeof element === "string") {
      // Check if this is a header with document context
      if (element.includes('::')) {
        const [uriString] = element.split('::', 2);
        const documentUri = vscode.Uri.parse(uriString);
        return {
          type: 'document' as const,
          uri: documentUri,
          filename: path.basename(documentUri.fsPath)
        };
      }
      return undefined; // Headers in single-file mode have no parent
    } else if (typeof element === "object" && "type" in element && element.type === "document") {
      return undefined; // Document nodes have no parent
    } else {
      // This is a task
      const task = element as PrdTask;
      return task.parent;
    }
  }

}
