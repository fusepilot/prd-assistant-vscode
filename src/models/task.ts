import * as vscode from 'vscode';

export interface PrdTask {
    id: string;
    text: string;
    completed: boolean;
    assignee?: string;
    line: number;
    document: vscode.Uri;
    children: PrdTask[];
    parent?: PrdTask;
    headers?: { level: number; text: string; line: number }[];
}

export interface TaskPosition {
    line: number;
    column: number;
    document: vscode.Uri;
}