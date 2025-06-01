// Don't import Node's EventEmitter since it conflicts with VSCode mock
import * as path from 'path';
import { vi } from 'vitest';

/**
 * Mock VSCode API for testing
 */

export interface MockTextDocument {
    uri: MockUri;
    fileName: string;
    languageId: string;
    lineCount: number;
    getText(range?: MockRange): string;
    lineAt(line: number): MockTextLine;
    positionAt(offset: number): MockPosition;
    offsetAt(position: MockPosition): number;
    save(): Thenable<boolean>;
}

export interface MockUri {
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;
    fsPath: string;
    toString(): string;
}

export interface MockPosition {
    line: number;
    character: number;
}

export interface MockRange {
    start: MockPosition;
    end: MockPosition;
}

export interface MockTextLine {
    lineNumber: number;
    text: string;
    range: MockRange;
    rangeIncludingLineBreak: MockRange;
    firstNonWhitespaceCharacterIndex: number;
    isEmptyOrWhitespace: boolean;
}

export interface MockWorkspaceFolder {
    uri: MockUri;
    name: string;
    index: number;
}

export interface MockTextEdit {
    range: MockRange;
    newText: string;
}

export interface MockWorkspaceEdit {
    set(uri: MockUri, edits: MockTextEdit[]): void;
    get(uri: MockUri): MockTextEdit[];
    has(uri: MockUri): boolean;
    delete(uri: MockUri): void;
    size: number;
    replace(uri: MockUri, range: MockRange, newText: string): void;
    insert(uri: MockUri, position: MockPosition, newText: string): void;
}

export class MockEventEmitter<T> {
    private listeners: ((e: T) => any)[] = [];

    event = (listener: (e: T) => any) => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(listener);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    };

    fire(data: T) {
        this.listeners.forEach(listener => listener(data));
    }
}

export function createMockUri(uriPath: string): MockUri {
    // Handle both absolute paths and already-formatted URIs
    let normalizedPath: string;
    if (uriPath.startsWith('file://')) {
        normalizedPath = uriPath.replace('file://', '');
    } else {
        normalizedPath = path.normalize(uriPath);
    }
    
    // Ensure consistent URI string format
    const uriString = `file://${normalizedPath}`;
    
    return {
        scheme: 'file',
        authority: '',
        path: normalizedPath,
        query: '',
        fragment: '',
        fsPath: normalizedPath,
        toString: () => uriString
    };
}

export function createMockPosition(line: number, character: number): MockPosition {
    return { line, character };
}

export function createMockRange(start: MockPosition, end: MockPosition): MockRange {
    return { start, end };
}

export function createMockTextDocument(
    filePath: string,
    content: string,
    languageId: string = 'markdown'
): MockTextDocument {
    const uri = createMockUri(filePath);
    const lines = content.split('\n');

    return {
        uri,
        fileName: filePath,
        languageId,
        lineCount: lines.length,
        getText: (range?: MockRange) => {
            if (!range) {
                return content;
            }
            const startOffset = offsetAt(range.start);
            const endOffset = offsetAt(range.end);
            return content.slice(startOffset, endOffset);
        },
        lineAt: (line: number) => {
            const text = lines[line] || '';
            return {
                lineNumber: line,
                text,
                range: createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, text.length)
                ),
                rangeIncludingLineBreak: createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, text.length + 1)
                ),
                firstNonWhitespaceCharacterIndex: text.search(/\S/),
                isEmptyOrWhitespace: text.trim().length === 0
            };
        },
        positionAt: (offset: number) => positionAt(offset),
        offsetAt: (position: MockPosition) => offsetAt(position),
        save: async () => true
    };

    function positionAt(offset: number): MockPosition {
        let line = 0;
        let character = 0;
        let currentOffset = 0;

        for (let i = 0; i < content.length && currentOffset < offset; i++) {
            if (content[i] === '\n') {
                line++;
                character = 0;
            } else {
                character++;
            }
            currentOffset++;
        }

        return createMockPosition(line, character);
    }

    function offsetAt(position: MockPosition): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }
        offset += Math.min(position.character, lines[position.line]?.length || 0);
        return offset;
    }
}

export function createMockWorkspaceFolder(name: string, uri: MockUri): MockWorkspaceFolder {
    return {
        uri,
        name,
        index: 0
    };
}

export function createMockWorkspaceEdit(): MockWorkspaceEdit {
    const edits = new Map<string, MockTextEdit[]>();

    return {
        set: (uri: MockUri, textEdits: MockTextEdit[]) => {
            edits.set(uri.toString(), textEdits);
        },
        get: (uri: MockUri) => {
            return edits.get(uri.toString()) || [];
        },
        has: (uri: MockUri) => {
            return edits.has(uri.toString());
        },
        delete: (uri: MockUri) => {
            edits.delete(uri.toString());
        },
        get size() {
            return edits.size;
        },
        replace: (uri: MockUri, range: MockRange, newText: string) => {
            const edit = createMockTextEdit(range, newText);
            const existingEdits = edits.get(uri.toString()) || [];
            existingEdits.push(edit);
            edits.set(uri.toString(), existingEdits);
        },
        insert: (uri: MockUri, position: MockPosition, newText: string) => {
            const range = createMockRange(position, position);
            const edit = createMockTextEdit(range, newText);
            const existingEdits = edits.get(uri.toString()) || [];
            existingEdits.push(edit);
            edits.set(uri.toString(), existingEdits);
        }
    };
}

export function createMockTextEdit(range: MockRange, newText: string): MockTextEdit {
    return { range, newText };
}

export const mockVscode = {
    Uri: {
        file: createMockUri,
        parse: (value: string) => createMockUri(value)
    },
    Position: createMockPosition,
    Range: createMockRange,
    TextEdit: createMockTextEdit,
    WorkspaceEdit: createMockWorkspaceEdit,
    EventEmitter: MockEventEmitter,
    window: {
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        showQuickPick: vi.fn(),
        showInputBox: vi.fn(),
        activeTextEditor: undefined,
        visibleTextEditors: [],
        onDidChangeActiveTextEditor: new MockEventEmitter().event,
        onDidChangeVisibleTextEditors: new MockEventEmitter().event
    },
    workspace: {
        workspaceFolders: [] as MockWorkspaceFolder[],
        getConfiguration: vi.fn((section?: string) => ({
            get: vi.fn((key: string, defaultValue?: any) => defaultValue),
            has: vi.fn(() => false),
            inspect: vi.fn(),
            update: vi.fn()
        })),
        onDidChangeConfiguration: new MockEventEmitter().event,
        onDidChangeTextDocument: new MockEventEmitter().event,
        onDidCreateFiles: new MockEventEmitter().event,
        onDidDeleteFiles: new MockEventEmitter().event,
        onDidRenameFiles: new MockEventEmitter().event,
        applyEdit: vi.fn(async () => true),
        findFiles: vi.fn(async () => []),
        openTextDocument: vi.fn(),
        saveAll: vi.fn(async () => true)
    },
    languages: {
        registerCodeLensProvider: vi.fn(),
        registerDocumentLinkProvider: vi.fn(),
        registerDocumentFormattingEditProvider: vi.fn(),
        registerCompletionItemProvider: vi.fn(),
        registerHoverProvider: vi.fn()
    },
    commands: {
        registerCommand: vi.fn(),
        executeCommand: vi.fn()
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },
    TreeItem: class MockTreeItem {
        label: string;
        collapsibleState: number;
        constructor(label: string, collapsibleState?: number) {
            this.label = label;
            this.collapsibleState = collapsibleState || 0;
        }
    },
    ThemeIcon: class MockThemeIcon {
        id: string;
        color?: string;
        constructor(id: string, color?: string) {
            this.id = id;
            this.color = color;
        }
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
};

// Export the mock as default to replace vscode module
export default mockVscode;

// Export all vscode module parts as named exports
export const Uri = mockVscode.Uri;
export const Position = mockVscode.Position;
export const Range = mockVscode.Range;
export const TextEdit = mockVscode.TextEdit;
export const WorkspaceEdit = mockVscode.WorkspaceEdit;
export const TreeItem = mockVscode.TreeItem;
export const ThemeIcon = mockVscode.ThemeIcon;
export const TreeItemCollapsibleState = mockVscode.TreeItemCollapsibleState;
export const ConfigurationTarget = mockVscode.ConfigurationTarget;
export const window = mockVscode.window;
export const workspace = mockVscode.workspace;
export const languages = mockVscode.languages;
export const commands = mockVscode.commands;
export const EventEmitter = MockEventEmitter;

// Export individual classes for easier testing
export const MockUri = mockVscode.Uri;
export const MockPosition = mockVscode.Position;
export const MockRange = mockVscode.Range;
export const MockTextEdit = mockVscode.TextEdit;
export const MockWorkspaceEdit = mockVscode.WorkspaceEdit;
export const MockTreeItem = mockVscode.TreeItem;