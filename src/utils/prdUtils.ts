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

  const config = vscode.workspace.getConfiguration('prdAssistant');
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
  const config = vscode.workspace.getConfiguration('prdAssistant');
  const patterns = config.get<string[]>('filePatterns', ['*prd*.md', 'PRD*.md', '*PRD*.md']);
  const additionalFiles = config.get<string[]>('additionalFiles', []);
  const searchDepth = config.get<number>('searchSubdirectoriesDepth', 1);
  
  // Generate glob patterns based on search depth
  const globPatterns: string[] = [];
  
  patterns.forEach(pattern => {
    if (searchDepth === 0) {
      // Only root directory
      globPatterns.push(pattern);
    } else if (searchDepth >= 99) {
      // Search all subdirectories (equivalent to **/pattern)
      globPatterns.push(`**/${pattern}`);
    } else {
      // Search up to specified depth
      for (let depth = 0; depth <= searchDepth; depth++) {
        if (depth === 0) {
          // Root directory
          globPatterns.push(pattern);
        } else {
          // Generate pattern for specific depth: */pattern, */*/pattern, etc.
          const depthPattern = '*/'.repeat(depth) + pattern;
          globPatterns.push(depthPattern);
        }
      }
    }
  });
  
  // Add additional files with the same depth logic
  additionalFiles.forEach(file => {
    if (searchDepth === 0) {
      // Only root directory
      globPatterns.push(file);
    } else if (searchDepth >= 99) {
      // Search all subdirectories
      globPatterns.push(`**/${file}`);
      globPatterns.push(file);
    } else {
      // Search up to specified depth
      for (let depth = 0; depth <= searchDepth; depth++) {
        if (depth === 0) {
          // Root directory
          globPatterns.push(file);
        } else {
          // Generate pattern for specific depth
          const depthPattern = '*/'.repeat(depth) + file;
          globPatterns.push(depthPattern);
        }
      }
    }
  });
  
  return globPatterns;
}