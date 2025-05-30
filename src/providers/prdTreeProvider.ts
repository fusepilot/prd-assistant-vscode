import * as vscode from "vscode";
import * as path from "path";
import { PrdTask } from "../models/task";
import { PrdTaskManager } from "../managers/prdTaskManager";

interface DocumentNode {
  type: 'document';
  uri: vscode.Uri;
  filename: string;
}

interface MessageNode {
  type: 'message';
  text: string;
  icon?: string;
}

export class PrdTreeProvider implements vscode.TreeDataProvider<PrdTask | string | DocumentNode | MessageNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PrdTask | string | DocumentNode | MessageNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private currentDocumentContext: vscode.Uri | null = null;
  private isScanning: boolean = false;
  private log: (message: string) => void = () => {};
  private refreshTimeout: NodeJS.Timeout | undefined;

  constructor(private taskManager: PrdTaskManager) {
    this.log('TreeProvider: Constructor called');
    taskManager.onTasksChanged(() => {
      this.log('TreeProvider: onTasksChanged event fired');
      this.refresh();
    });
    taskManager.onDocumentsChanged(() => {
      this.log('TreeProvider: onDocumentsChanged event fired');
      this.refresh();
    });
  }

  setLogger(log: (message: string) => void): void {
    this.log = log;
  }

  refresh(): void {
    // Debounce rapid refresh calls to prevent spam
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    
    this.refreshTimeout = setTimeout(() => {
      this.log('TreeProvider: refresh() executed');
      this._onDidChangeTreeData.fire();
      this.refreshTimeout = undefined;
    }, 50); // 50ms debounce
  }

  setScanning(scanning: boolean): void {
    this.log(`TreeProvider.setScanning: ${this.isScanning} -> ${scanning}`);
    this.isScanning = scanning;
    this.refresh();
  }

  getTreeItem(element: PrdTask | string | DocumentNode | MessageNode): vscode.TreeItem {
    if (typeof element === "object" && "type" in element && element.type === "message") {
      // This is a message node
      const item = new vscode.TreeItem(element.text, vscode.TreeItemCollapsibleState.None);
      item.contextValue = "prdMessage";
      item.iconPath = new vscode.ThemeIcon(element.icon || "info");
      
      // If it's an empty PRD file message, add command to open the file
      if (element.text.includes('(no tasks yet)')) {
        const documents = this.taskManager.getDocuments();
        if (documents.length === 1) {
          item.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [documents[0]]
          };
        }
      }
      
      return item;
    } else if (typeof element === "object" && "type" in element && element.type === "document") {
      // This is a document node
      const item = new vscode.TreeItem(element.filename, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "prdDocument";
      item.iconPath = new vscode.ThemeIcon("markdown");
      item.resourceUri = element.uri;
      
      // Calculate document stats
      const config = vscode.workspace.getConfiguration("prdAssistant");
      const showProgress = config.get<boolean>("showProgressInTreeView", true);
      
      if (showProgress) {
        const tasks = this.taskManager.getTasksByDocument(element.uri);
        const rootTasks = tasks.filter(t => !t.parent);
        const completedTasks = rootTasks.filter(t => t.completed).length;
        if (rootTasks.length > 0) {
          const percentage = Math.round((completedTasks / rootTasks.length) * 100);
          item.description = `${completedTasks}/${rootTasks.length} (${percentage}%)`;
        }
      }
      
      // Add command to open the document
      item.command = {
        command: "prd-assistant.openDocument",
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
      
      this.log(`TreeProvider: getTreeItem for header "${headerText}" - found ${headerTasks.length} tasks, hasChildren: ${hasChildren}`);
      
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
          // Don't filter out child tasks - we want to count all tasks under this header
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
          // Don't filter out child tasks - we want to count all tasks under this header
          if (task.headers && task.headers.length > 0) {
            return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
          }
          return false;
        });
      }

      const config = vscode.workspace.getConfiguration("prdAssistant");
      const showProgress = config.get<boolean>("showProgressInTreeView", true);
      
      if (showProgress && tasksUnderHeader.length > 0) {
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
        command: "prd-assistant.toggleTask",
        title: "Toggle Task",
        arguments: [task.id],
      };
      
      return item;
    }
  }

  getChildren(element?: PrdTask | string | DocumentNode | MessageNode): Thenable<(PrdTask | string | DocumentNode | MessageNode)[]> {
    if (!element) {
      // Return root level - first check if we're scanning
      this.log(`TreeProvider.getChildren: isScanning=${this.isScanning}`);
      if (this.isScanning) {
        const scanningMessage: MessageNode = {
          type: 'message',
          text: 'Scanning workspace for PRD files...',
          icon: 'sync~spin'
        };
        this.log('TreeProvider: Returning scanning message');
        return Promise.resolve([scanningMessage]);
      }
      
      // Check if we have multiple documents
      const documents = this.taskManager.getDocuments();
      this.log(`TreeProvider: Found ${documents.length} documents: ${documents.map(d => path.basename(d.fsPath)).join(', ')}`);
      
      if (documents.length > 1) {
        // Multiple files: filter based on whether they're "obviously" PRD files
        const documentNodes = documents
          .filter(uri => {
            const filename = path.basename(uri.fsPath).toLowerCase();
            const tasks = this.taskManager.getTasksByDocument(uri);
            
            // Always show files with "prd" in the name, regardless of tasks
            if (filename.includes('prd')) {
              return true;
            }
            
            // For other files (additional files), only show if they have tasks
            return tasks.length > 0;
          })
          .map(uri => ({
            type: 'document' as const,
            uri,
            filename: path.basename(uri.fsPath)
          }));
        console.log('TreeProvider: Returning document nodes for multi-file mode');
        return Promise.resolve(documentNodes);
      } else if (documents.length === 1) {
        // Single file: show it if it's obviously PRD or has tasks
        const singleDoc = documents[0];
        const filename = path.basename(singleDoc.fsPath).toLowerCase();
        const tasks = this.taskManager.getTasksByDocument(singleDoc);
        
        this.log(`TreeProvider: Single file analysis:`);
        this.log(`  - Filename: "${filename}"`);
        this.log(`  - Contains 'prd': ${filename.includes('prd')}`);
        this.log(`  - Tasks count: ${tasks.length}`);
        this.log(`  - Should show: ${filename.includes('prd') || tasks.length > 0}`);
        
        // Show if it has "prd" in name OR has tasks
        if (filename.includes('prd') || tasks.length > 0) {
          this.log('TreeProvider: Single file mode, returning elements for: ' + path.basename(singleDoc.fsPath));
          const elements = this.getRootElementsForDocument(singleDoc);
          this.log(`TreeProvider: getRootElementsForDocument returned ${elements.length} elements`);
          
          // If it's a PRD file with no tasks/headers, show a message instead of empty
          if (elements.length === 0 && filename.includes('prd')) {
            const emptyMessage: MessageNode = {
              type: 'message',
              text: `${path.basename(singleDoc.fsPath)} (no tasks yet)`,
              icon: 'file'
            };
            this.log('TreeProvider: Returning empty PRD file message');
            return Promise.resolve([emptyMessage]);
          }
          
          this.log(`TreeProvider: Returning ${elements.length} elements: ${elements.map(e => typeof e === 'string' ? e : e.text || 'task').join(', ')}`);
          return Promise.resolve(elements);
        } else {
          this.log('TreeProvider: Single file has no tasks and is not obviously PRD, returning empty');
          return Promise.resolve([]);
        }
      } else {
        // No documents
        this.log('TreeProvider: No documents found');
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
      const tasks = this.getTasksForHeader(element);
      this.log(`TreeProvider: getChildren for header "${element}" returning ${tasks.length} tasks`);
      return Promise.resolve(tasks);
    } else {
      // Return children of the task, applying filter
      const task = element as PrdTask;
      const filter = vscode.workspace.getConfiguration('prdAssistant').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');
      
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
    const filter = vscode.workspace.getConfiguration('prdAssistant').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');

    console.log("Getting root elements for document:", documentUri.fsPath, "total tasks:", documentTasks.length, "filter:", filter);

    // Filter tasks first
    const filteredTasks = documentTasks.filter((task) => {
      if (task.parent) {return false;} // Skip child tasks
      
      // Apply filter
      if (filter === 'completed' && !task.completed) {return false;}
      if (filter === 'uncompleted' && task.completed) {return false;}
      
      return true;
    });

    // Build a map of all headers and their relationships
    const headerHierarchy = new Map<string, Set<string>>();
    const allHeaders = new Set<string>();
    
    documentTasks.forEach((task) => {
      if (task.headers && task.headers.length > 0) {
        for (let i = 0; i < task.headers.length; i++) {
          const header = task.headers[i];
          const headerKey = `${"#".repeat(header.level)} ${header.text}`;
          allHeaders.add(headerKey);
          
          // Track parent-child relationships
          if (i > 0) {
            const parentHeader = task.headers[i - 1];
            const parentKey = `${"#".repeat(parentHeader.level)} ${parentHeader.text}`;
            
            if (!headerHierarchy.has(parentKey)) {
              headerHierarchy.set(parentKey, new Set());
            }
            headerHierarchy.get(parentKey)!.add(headerKey);
          }
        }
      }
    });

    // Group tasks by their optimal header
    const headerGroups = new Map<string, {header: string, headerLine: number, tasks: PrdTask[]}>();
    
    filteredTasks.forEach((task) => {
      let headerKey = "No Header";
      let headerLine = -1;
      
      if (task.headers && task.headers.length > 0) {
        // Start with the most specific header
        let selectedHeader = task.headers[task.headers.length - 1];
        
        // Check if we should use a parent header instead
        for (let i = task.headers.length - 1; i > 0; i--) {
          const currentHeader = task.headers[i];
          const currentKey = `${"#".repeat(currentHeader.level)} ${currentHeader.text}`;
          const parentHeader = task.headers[i - 1];
          const parentKey = `${"#".repeat(parentHeader.level)} ${parentHeader.text}`;
          
          // If the parent has only one child (this header), use the parent instead
          const siblings = headerHierarchy.get(parentKey) || new Set();
          if (siblings.size === 1 && siblings.has(currentKey)) {
            selectedHeader = parentHeader;
          } else {
            // Multiple siblings, stop here
            break;
          }
        }
        
        headerKey = `${documentUri.toString()}::${"#".repeat(selectedHeader.level)} ${selectedHeader.text}`;
        headerLine = selectedHeader.line;
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

    this.log(`TreeProvider: getTasksForHeader called with: "${header}"`);

    if (header.includes('::')) {
      // Multi-file mode: extract document URI
      const [uriString, headerPart] = header.split('::', 2);
      documentUri = vscode.Uri.parse(uriString);
      headerText = headerPart.replace(/^#+\s+/, "");
      headerLevel = headerPart.match(/^#+/)?.[0].length || 0;
      this.log(`TreeProvider: Parsed multi-file header - URI: ${uriString}, headerText: "${headerText}", level: ${headerLevel}`);
    } else {
      // Single file mode: use the header directly
      headerText = header.replace(/^#+\s+/, "");
      headerLevel = header.match(/^#+/)?.[0].length || 0;
      this.log(`TreeProvider: Parsed single-file header - headerText: "${headerText}", level: ${headerLevel}`);
    }
    
    // Get tasks from appropriate document(s)
    const tasks = documentUri ? this.taskManager.getTasksByDocument(documentUri) : this.taskManager.getAllTasks();
    this.log(`TreeProvider: Found ${tasks.length} total tasks to filter`);
    
    // Get current filter setting
    const filter = vscode.workspace.getConfiguration('prdAssistant').get<'all' | 'completed' | 'uncompleted'>('taskFilter', 'all');

    const filteredTasks = tasks.filter((task) => {
      if (task.parent) {return false;} // Skip child tasks
      
      // Apply filter
      if (filter === 'completed' && !task.completed) {return false;}
      if (filter === 'uncompleted' && task.completed) {return false;}

      if (task.headers && task.headers.length > 0) {
        // Check if ANY of the task's headers match the requested header
        return task.headers.some((h) => h.text === headerText && h.level === headerLevel);
      }
      return false;
    });

    this.log(`TreeProvider: After filtering, found ${filteredTasks.length} tasks for header "${headerText}" (level ${headerLevel})`);
    
    // Sort tasks by line number to maintain document order
    return filteredTasks.sort((a, b) => a.line - b.line);
  }

  getParent(element: PrdTask | string | DocumentNode | MessageNode): vscode.ProviderResult<PrdTask | string | DocumentNode | MessageNode> {
    if (typeof element === "object" && "type" in element && element.type === "message") {
      return undefined; // Message nodes have no parent
    } else if (typeof element === "string") {
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
