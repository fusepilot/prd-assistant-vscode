import * as fs from 'fs';
import * as path from 'path';
import { vi } from 'vitest';
import { 
    MockTextDocument, 
    MockWorkspaceFolder, 
    createMockTextDocument, 
    createMockUri, 
    createMockWorkspaceFolder,
    mockVscode
} from '../mocks/vscode';

/**
 * Test helper utilities for PRD Assistant extension tests
 */

// Re-export mock creation functions for convenience
export { createMockTextDocument, createMockUri, createMockWorkspaceFolder, createMockWorkspaceEdit, createMockPosition, createMockRange, createMockTextEdit, mockVscode } from '../mocks/vscode';

export interface TestWorkspace {
    name: string;
    folders: MockWorkspaceFolder[];
    documents: MockTextDocument[];
}

export interface TestFixture {
    name: string;
    path: string;
    workspace: TestWorkspace;
}

/**
 * Load a test fixture from the fixtures directory
 */
export async function loadTestFixture(fixtureName: string): Promise<TestFixture> {
    const fixturePath = path.join(__dirname, '..', 'fixtures', fixtureName);
    
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Test fixture not found: ${fixtureName}`);
    }

    const workspace = await loadWorkspaceFromPath(fixturePath, fixtureName);
    
    return {
        name: fixtureName,
        path: fixturePath,
        workspace
    };
}

/**
 * Load workspace structure from a directory path
 */
export async function loadWorkspaceFromPath(dirPath: string, workspaceName: string): Promise<TestWorkspace> {
    const documents: MockTextDocument[] = [];
    const folders: MockWorkspaceFolder[] = [];

    // Add main workspace folder
    const workspaceUri = createMockUri(dirPath);
    folders.push(createMockWorkspaceFolder(workspaceName, workspaceUri));

    // Recursively load all markdown files
    const markdownFiles = await findMarkdownFiles(dirPath);
    
    for (const filePath of markdownFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(dirPath, filePath);
        const fullPath = path.join(dirPath, relativePath);
        
        const document = createMockTextDocument(fullPath, content, 'markdown');
        documents.push(document);
    }

    return {
        name: workspaceName,
        folders,
        documents
    };
}

/**
 * Recursively find all markdown files in a directory
 */
async function findMarkdownFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    function scanDirectory(currentPath: string) {
        if (!fs.existsSync(currentPath)) {
            return;
        }

        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                scanDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }
    }
    
    scanDirectory(dirPath);
    return files;
}

/**
 * Setup mock workspace with specific documents
 */
export function setupMockWorkspace(documents: MockTextDocument[]): void {
    // Clear existing workspace
    mockVscode.workspace.workspaceFolders = [];
    
    // Add workspace folders for unique document directories
    const folders = new Map<string, MockWorkspaceFolder>();
    
    documents.forEach(doc => {
        const dirPath = path.dirname(doc.fileName);
        if (!folders.has(dirPath)) {
            const folderName = path.basename(dirPath) || 'workspace';
            const folder = createMockWorkspaceFolder(folderName, createMockUri(dirPath));
            folders.set(dirPath, folder);
        }
    });
    
    mockVscode.workspace.workspaceFolders = Array.from(folders.values());
}

/**
 * Create a simple mock configuration for testing
 */
export function createMockConfiguration(settings: Record<string, any> = {}) {
    const defaultSettings = {
        'autoGenerateIds': true,
        'idFormat': 'sequential',
        'showCodeLens': true,
        'decorateAssignees': true,
        'decorateDeepLinks': true,
        'taskFilter': 'all',
        'normalizeCheckboxes': true,
        'filePatterns': ['*prd*.md', 'PRD*.md', '*PRD*.md'],
        'additionalFiles': [],
        'enableCodeLensForHeaders': true,
        'enableCodeLensForTasks': true,
        'enableConversionCodeLens': true,
        'showProgressInTreeView': true,
        'autoProcessDocuments': true,
        'showDuplicateWarnings': true,
        'enableQuickFixes': true,
        'defaultAssignee': '',
        'taskIdPrefix': 'PRD',
        'enableDecorations': true,
        'searchSubdirectoriesDepth': 1
    };

    const mergedSettings = { ...defaultSettings, ...settings };

    return {
        get: vi.fn((key: string, defaultValue?: any) => {
            return mergedSettings[key] !== undefined ? mergedSettings[key] : defaultValue;
        }),
        has: vi.fn((key: string) => mergedSettings.hasOwnProperty(key)),
        inspect: vi.fn(),
        update: vi.fn()
    };
}

/**
 * Setup mock VSCode configuration
 */
export function setupMockConfiguration(settings: Record<string, any> = {}) {
    const mockConfig = createMockConfiguration(settings);
    mockVscode.workspace.getConfiguration = vi.fn(() => mockConfig);
    return mockConfig;
}

/**
 * Create test documents with specific content
 */
export function createTestDocuments(specs: Array<{ name: string; content: string; path?: string }>): MockTextDocument[] {
    return specs.map(spec => {
        const filePath = spec.path || `/test/${spec.name}`;
        return createMockTextDocument(filePath, spec.content, 'markdown');
    });
}

/**
 * Helper to create a document with predefined PRD content
 */
export function createPrdDocument(
    fileName: string = 'PRD.md', 
    content?: string,
    filePath?: string
): MockTextDocument {
    const defaultContent = `# Test PRD

## Features

- [ ] PRD-100001 Test feature @alice
- [x] PRD-100002 Completed feature @bob
- [ ] PRD-100003 Another feature

## Backend

- [ ] PRD-200001 API development @charlie
  - [ ] PRD-200002 User API @charlie
  - [ ] PRD-200003 Product API @diana
`;

    return createMockTextDocument(
        filePath || `/test/${fileName}`,
        content || defaultContent,
        'markdown'
    );
}

/**
 * Assert that two arrays contain the same elements (order-independent)
 */
export function assertArraysEqual<T>(actual: T[], expected: T[], message?: string) {
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();
    
    if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
        throw new Error(
            message || 
            `Arrays not equal:\nActual: ${JSON.stringify(actualSorted)}\nExpected: ${JSON.stringify(expectedSorted)}`
        );
    }
}

/**
 * Wait for a specified amount of time (useful for async tests)
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock file system structure for testing
 */
export interface MockFileSystemEntry {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: MockFileSystemEntry[];
}

export function createMockFileSystem(entries: MockFileSystemEntry[], basePath: string = '/test'): MockTextDocument[] {
    const documents: MockTextDocument[] = [];

    function processEntry(entry: MockFileSystemEntry, currentPath: string) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.type === 'file' && entry.name.endsWith('.md')) {
            const content = entry.content || `# ${entry.name}\n\nTest content`;
            documents.push(createMockTextDocument(fullPath, content, 'markdown'));
        } else if (entry.type === 'directory' && entry.children) {
            entry.children.forEach(child => processEntry(child, fullPath));
        }
    }

    entries.forEach(entry => processEntry(entry, basePath));
    return documents;
}

/**
 * Extract task IDs from document content using regex
 */
export function extractTaskIds(content: string): string[] {
    const taskIdRegex = /PRD-\d+/g;
    const matches = content.match(taskIdRegex);
    return matches || [];
}

/**
 * Count completed and total tasks in content
 */
export function countTasks(content: string): { completed: number; total: number } {
    const taskRegex = /^[\s]*- \[([x ])\] (PRD-\d+)/gm;
    let completed = 0;
    let total = 0;
    let match;

    while ((match = taskRegex.exec(content)) !== null) {
        total++;
        if (match[1] === 'x') {
            completed++;
        }
    }

    return { completed, total };
}

/**
 * Reset all mocks between tests
 */
export function resetMocks() {
    vi.clearAllMocks();
    mockVscode.workspace.workspaceFolders = [];
    setupMockConfiguration();
}