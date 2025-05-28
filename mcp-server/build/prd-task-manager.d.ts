export interface PrdTask {
    id: string;
    text: string;
    completed: boolean;
    assignee?: string;
    document: string;
    line: number;
    children: PrdTask[];
    headers?: Array<{
        text: string;
        level: number;
        line: number;
    }>;
}
export interface PrdHeader {
    text: string;
    level: number;
    line: number;
}
export declare class PrdTaskManager {
    private workspaceRoot;
    constructor(workspaceRoot?: string);
    /**
     * List all tasks with optional filtering
     */
    listTasks(filter?: 'all' | 'completed' | 'uncompleted', documentPath?: string): Promise<PrdTask[]>;
    /**
     * Get a specific task by ID
     */
    getTask(taskId: string): Promise<PrdTask | null>;
    /**
     * Toggle a task's completion status
     */
    toggleTask(taskId: string): Promise<PrdTask>;
    /**
     * Create a new task
     */
    createTask(text: string, assignee?: string, documentPath?: string): Promise<PrdTask>;
    /**
     * Assign a task to someone
     */
    assignTask(taskId: string, assignee: string): Promise<PrdTask>;
    /**
     * Get all tasks from PRD files
     */
    private getAllTasks;
    /**
     * Parse tasks from a single document
     */
    private parseTasksFromDocument;
    /**
     * Check if a line is a task line
     */
    private isTaskLine;
    /**
     * Parse a task line into a PrdTask object
     */
    private parseTaskLine;
    /**
     * Get task indentation level
     */
    private getTaskIndent;
    /**
     * Find all PRD files in the workspace
     */
    private findPrdFiles;
    /**
     * Generate a new task ID
     */
    private generateNewTaskId;
}
