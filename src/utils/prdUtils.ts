import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Checks if a document is a PRD file based on filename patterns
 */
export function isPrdFile(document: vscode.TextDocument): boolean {
  // Check if it's a markdown file first
  if (document.languageId !== 'markdown') {
    return false;
  }

  // Get configured patterns
  const config = vscode.workspace.getConfiguration('prdManager');
  const patterns = config.get<string[]>('filePatterns', ['*prd*.md', 'PRD*.md', '*PRD*.md']);
  
  const filename = path.basename(document.fileName);
  
  // Check if filename matches any pattern
  return patterns.some(pattern => {
    // Make pattern case-insensitive by default
    return minimatch(filename, pattern, { nocase: true });
  });
}

/**
 * Gets the PRD file patterns for glob searches
 */
export function getPrdFilePatterns(): string[] {
  const config = vscode.workspace.getConfiguration('prdManager');
  const patterns = config.get<string[]>('filePatterns', ['*prd*.md', 'PRD*.md', '*PRD*.md']);
  
  // Convert simple patterns to workspace glob patterns
  return patterns.map(pattern => `**/${pattern}`);
}