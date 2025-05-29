import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Checks if a document is a PRD file based on filename patterns or additional files list
 */
export function isPrdFile(document: vscode.TextDocument): boolean {
  // Check if it's a markdown file first
  if (document.languageId !== 'markdown') {
    return false;
  }

  const config = vscode.workspace.getConfiguration('prdManager');
  const filename = path.basename(document.fileName);
  
  // Check if it's in the additional files list
  const additionalFiles = config.get<string[]>('additionalFiles', []);
  if (additionalFiles.some(file => {
    // Check both basename and full path matches
    return filename === file || document.fileName.endsWith(file);
  })) {
    return true;
  }
  
  // Check if filename matches any pattern
  const patterns = config.get<string[]>('filePatterns', ['*prd*.md', 'PRD*.md', '*PRD*.md']);
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
  const additionalFiles = config.get<string[]>('additionalFiles', []);
  
  // Convert simple patterns to workspace glob patterns
  const globPatterns = patterns.map(pattern => `**/${pattern}`);
  
  // Add additional files as specific glob patterns
  additionalFiles.forEach(file => {
    // Support both exact filename and path-based matches
    globPatterns.push(`**/${file}`);
    globPatterns.push(file);
  });
  
  return globPatterns;
}