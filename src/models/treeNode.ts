import * as vscode from 'vscode';
import { PrdTask } from './task';

export type TreeNodeType = 'header' | 'task' | 'file';

export interface TreeNode {
    id: string;
    type: TreeNodeType;
    label: string;
    task?: PrdTask;
    children: TreeNode[];
    parent?: TreeNode;
    level?: number; // For headers: 1 = #, 2 = ##, 3 = ###
    uri?: vscode.Uri;
    collapsibleState?: vscode.TreeItemCollapsibleState;
}