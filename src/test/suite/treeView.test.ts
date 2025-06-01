import { describe, test, expect, beforeEach } from 'vitest';
import { PrdTreeProvider } from '../../providers/prdTreeProvider';
import { PrdTaskManager } from '../../managers/prdTaskManager';
import { TreeNode } from '../../models/treeNode';
import { PrdTask } from '../../models/task';
import { 
    createMockTextDocument, 
    setupMockConfiguration, 
    resetMocks,
    mockVscode,
    createMockUri
} from '../helpers/testHelpers';

describe('Tree View Tests', () => {
    let treeProvider: PrdTreeProvider;
    let taskManager: PrdTaskManager;

    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
        taskManager = new PrdTaskManager();
        treeProvider = new PrdTreeProvider(taskManager);
    });

    describe('Tree Structure Generation', () => {
        test('should create tree from single document', async () => {
            const content = `# Test PRD

## Features

- [ ] Feature one @alice PRD-100001
- [x] Feature two @bob PRD-100002

## Backend

- [ ] Backend task @charlie PRD-200001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Process document first
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // In single file mode, should return headers/tasks directly
            expect(children && children.length > 0).toBeTruthy();
            
            // Should have header elements
            const headerElements = children?.filter(child => typeof child === 'string');
            expect(headerElements && headerElements.length > 0).toBeTruthy();
        });

        test('should create tree from multiple documents', async () => {
            const doc1 = createMockTextDocument('/test/PRD.md', `# Main PRD
- [ ] Main task @alice PRD-100001`);
            
            const doc2 = createMockTextDocument('/test/mobile-prd.md', `# Mobile PRD
- [ ] Mobile task @bob PRD-200001`);

            // Process documents first
            await taskManager.processDocument(doc1);
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            expect(children?.length).toBe(2);
            
            const docNames = children?.map(child => (child as any).label || (child as any).filename).sort();
            expect(docNames).toEqual(['PRD.md', 'mobile-prd.md']);
        });

        test('should handle nested task hierarchy', async () => {
            const content = `# Test PRD

## Features

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
    - [ ] Grandchild task @charlie PRD-100003
  - [x] Another child @diana PRD-100004
- [ ] Another parent @eve PRD-100005`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // The algorithm groups tasks under the top-level header when it has only one child
            const testPrdSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            
            expect(testPrdSection).toBeTruthy();
            
            const tasks = await treeProvider.getChildren(testPrdSection);
            expect(tasks?.length).toBe(2);
            
            // Check parent task has children
            const parentTask = tasks?.find(task => 
                typeof task === 'object' && 'text' in task && task.text.includes('Parent task'));
            expect(parentTask).toBeTruthy();
            
            const parentChildren = await treeProvider.getChildren(parentTask);
            expect(parentChildren?.length).toBe(2);
            
            // Check grandchild nesting
            const childTask = parentChildren?.find(child => 
                typeof child === 'object' && 'text' in child && child.text.includes('Child task'));
            expect(childTask).toBeTruthy();
            
            const grandchildren = await treeProvider.getChildren(childTask);
            expect(grandchildren?.length).toBe(1);
        });

        test('should group tasks by headers', async () => {
            const content = `# Test PRD

## Authentication

- [ ] Login feature @alice PRD-100001
- [ ] Logout feature @bob PRD-100002

## User Management

- [ ] User creation @charlie PRD-200001
- [ ] User deletion @diana PRD-200002

### User Profiles

- [ ] Profile editing @eve PRD-200003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Should have sections for each header
            expect(children && children.length >= 2).toBeTruthy();
            
            const authSection = children?.find(s => 
                typeof s === 'string' && s.includes('Authentication'));
            const userSection = children?.find(s => 
                typeof s === 'string' && s.includes('User Management'));
            
            expect(authSection).toBeTruthy();
            expect(userSection).toBeTruthy();
            
            // Check tasks in each section
            const authTasks = await treeProvider.getChildren(authSection);
            const userTasks = await treeProvider.getChildren(userSection);
            
            expect(authTasks?.length).toBe(2);
            expect(userTasks?.length).toBe(3);
        });

        test('should handle documents with no tasks', async () => {
            const content = `# Empty PRD

## Introduction

This PRD has no tasks yet.

## Future Plans

We will add tasks later.`;

            const doc = createMockTextDocument('/test/empty-PRD.md', content);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Should show empty message for PRD files with no tasks
            expect(children?.length).toBe(1);
            expect(children?.[0]).toEqual(expect.objectContaining({
                type: 'message',
                text: expect.stringContaining('empty-PRD.md (no tasks yet)')
            }));
        });

        test('should show progress information', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002
- [x] Another complete task @charlie PRD-100003
- [ ] Another incomplete task @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set up for multi-file mode to test document node progress
            const doc2 = createMockTextDocument('/test/other.md', '# Other');
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            const docNode = children?.find(child => 
                typeof child === 'object' && 'filename' in child && child.filename === 'PRD.md');
            
            // Document node should show progress
            const item = treeProvider.getTreeItem(docNode!);
            const description = item.description?.toString();
            expect(description?.includes('50%') || description?.includes('2/4')).toBeTruthy();
        });
    });

    describe('Tree Node Types', () => {
        test('should create correct node types', async () => {
            const content = `# Test PRD

## Features

- [ ] Task @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set up for multi-file mode to test document nodes
            const doc2 = createMockTextDocument('/test/other.md', '# Other');
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            const docNode = children?.find(child => 
                typeof child === 'object' && 'filename' in child && child.filename === 'PRD.md');
            
            const docItem = treeProvider.getTreeItem(docNode!);
            expect(docItem.contextValue).toBe('prdDocument');
            
            const sections = await treeProvider.getChildren(docNode);
            const section = sections?.[0];
            const sectionItem = treeProvider.getTreeItem(section!);
            expect(sectionItem.contextValue).toBe('prdHeader');
            
            const tasks = await treeProvider.getChildren(section);
            const task = tasks?.[0];
            const taskItem = treeProvider.getTreeItem(task!);
            expect(taskItem.contextValue).toBe('prdTask');
        });

        test('should distinguish task nodes with and without children', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
- [ ] Solo task @charlie PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            const headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            const tasks = await treeProvider.getChildren(headerSection);
            
            const parentTask = tasks?.find(t => 
                typeof t === 'object' && 'text' in t && t.text.includes('Parent task'));
            const soloTask = tasks?.find(t => 
                typeof t === 'object' && 'text' in t && t.text.includes('Solo task'));
            
            const parentItem = treeProvider.getTreeItem(parentTask!);
            const soloItem = treeProvider.getTreeItem(soloTask!);
            
            expect(parentItem.contextValue).toBe('prdTaskWithChildren');
            expect(soloItem.contextValue).toBe('prdTask');
        });

        test('should set correct collapsible states', async () => {
            const content = `# Test PRD

## Features

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
- [ ] Solo task @charlie PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set up for multi-file mode to test document nodes
            const doc2 = createMockTextDocument('/test/other.md', '# Other');
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            const docNode = children?.find(child => 
                typeof child === 'object' && 'filename' in child && child.filename === 'PRD.md');
            const sections = await treeProvider.getChildren(docNode);
            const tasks = await treeProvider.getChildren(sections?.[0]);
            
            // Document should be expandable
            const docItem = treeProvider.getTreeItem(docNode!);
            expect(docItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Expanded);
            
            // Section should be expandable
            const sectionItem = treeProvider.getTreeItem(sections?.[0]!);
            expect(sectionItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Expanded);
            
            // Parent task should be expandable
            const parentTask = tasks?.find(t => 
                typeof t === 'object' && 'text' in t && t.text.includes('Parent task'));
            const parentItem = treeProvider.getTreeItem(parentTask!);
            expect(parentItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Expanded);
            
            // Solo task should not be expandable
            const soloTask = tasks?.find(t => 
                typeof t === 'object' && 'text' in t && t.text.includes('Solo task'));
            const soloItem = treeProvider.getTreeItem(soloTask!);
            expect(soloItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.None);
        });
    });

    describe('Filtering', () => {
        test('should filter completed tasks', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002
- [x] Another complete task @charlie PRD-100003
- [ ] Another incomplete task @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set filter to completed only
            setupMockConfiguration({ taskFilter: 'completed' });
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            const headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            const tasks = await treeProvider.getChildren(headerSection);
            
            // Should only show completed tasks
            expect(tasks?.length).toBe(2);
            
            const taskTexts = tasks?.map(t => typeof t === 'object' && 'text' in t ? t.text : '') || [];
            expect(taskTexts.some(text => text?.includes('Complete task'))).toBeTruthy();
            expect(taskTexts.some(text => text?.includes('Another complete task'))).toBeTruthy();
        });

        test('should filter uncompleted tasks', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002
- [x] Another complete task @charlie PRD-100003
- [ ] Another incomplete task @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set filter to uncompleted only
            setupMockConfiguration({ taskFilter: 'uncompleted' });
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            const headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            const tasks = await treeProvider.getChildren(headerSection);
            
            // Should only show uncompleted tasks
            expect(tasks?.length).toBe(2);
            
            const taskTexts = tasks?.map(t => typeof t === 'object' && 'text' in t ? t.text : '') || [];
            expect(taskTexts.some(text => text?.includes('Incomplete task'))).toBeTruthy();
            expect(taskTexts.some(text => text?.includes('Another incomplete task'))).toBeTruthy();
        });

        test('should show all tasks by default', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            setupMockConfiguration({ taskFilter: 'all' });
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            const headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            const tasks = await treeProvider.getChildren(headerSection);
            
            expect(tasks?.length).toBe(2);
        });

        test('should preserve hierarchy with filtering', async () => {
            const content = `# Test PRD

- [ ] Parent incomplete @alice PRD-100001
  - [x] Child complete @bob PRD-100002
  - [ ] Child incomplete @charlie PRD-100003
- [x] Parent complete @diana PRD-100004
  - [x] Child complete @eve PRD-100005`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            setupMockConfiguration({ taskFilter: 'completed' });
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            const headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            const tasks = await treeProvider.getChildren(headerSection);
            
            // Should show completed tasks
            expect(tasks && tasks.length > 0).toBeTruthy();
            
            // Parent complete task should be shown
            const parentTask = tasks?.find(t => 
                typeof t === 'object' && 'text' in t && t.text.includes('Parent complete'));
            
            if (parentTask) {
                const childTasks = await treeProvider.getChildren(parentTask);
                expect(childTasks && childTasks.length > 0).toBeTruthy();
            }
        });
    });

    describe('Tree Updates', () => {
        test('should update tree when documents change', async () => {
            const initialContent = `# Test PRD
- [ ] Initial task @alice PRD-100001`;

            const updatedContent = `# Test PRD
- [ ] Initial task @alice PRD-100001
- [ ] New task @bob PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', initialContent);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            let children = await treeProvider.getChildren();
            
            // Find the header section (should be "Test PRD")
            let headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            // Get tasks under this header
            let tasks = await treeProvider.getChildren(headerSection);
            expect(tasks?.length).toBe(1);
            
            // Update document content
            const updatedDoc = createMockTextDocument('/test/PRD.md', updatedContent);
            await taskManager.processDocument(updatedDoc);
            treeProvider.refresh();
            
            children = await treeProvider.getChildren();
            headerSection = children?.find(child => 
                typeof child === 'string' && child.includes('Test PRD'));
            expect(headerSection).toBeTruthy();
            
            tasks = await treeProvider.getChildren(headerSection);
            expect(tasks?.length).toBe(2);
        });

        test('should handle document removal', async () => {
            const doc1 = createMockTextDocument('/test/PRD1.md', `# PRD 1
- [ ] Task 1 @alice PRD-100001`);
            
            const doc2 = createMockTextDocument('/test/PRD2.md', `# PRD 2
- [ ] Task 2 @bob PRD-200001`);

            await taskManager.processDocument(doc1);
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            let children = await treeProvider.getChildren();
            expect(children?.length).toBe(2);
            
            // Remove one document
            taskManager.removeDocument(doc2.uri);
            treeProvider.refresh();
            
            children = await treeProvider.getChildren();
            // After removing one document, we switch to single-file mode
            // so we should see the header directly instead of a document node
            expect(children?.length).toBe(1);
            expect(typeof children?.[0]).toBe('string');
            expect(children?.[0]).toContain('PRD 1');
        });

        test('should handle document addition', async () => {
            const doc1 = createMockTextDocument('/test/PRD1.md', `# PRD 1
- [ ] Task 1 @alice PRD-100001`);

            await taskManager.processDocument(doc1);
            treeProvider.refresh();
            
            let children = await treeProvider.getChildren();
            // In single file mode, returns elements directly
            expect(children && children.length > 0).toBeTruthy();
            
            // Add another document
            const doc2 = createMockTextDocument('/test/PRD2.md', `# PRD 2
- [ ] Task 2 @bob PRD-200001`);
            
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            children = await treeProvider.getChildren();
            // Now in multi-file mode, should return document nodes
            expect(children?.length).toBe(2);
        });

        test('should maintain expansion state across updates', async () => {
            const content = `# Test PRD

## Features

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            // Set up for multi-file mode to test document nodes
            const doc2 = createMockTextDocument('/test/other.md', '# Other');
            await taskManager.processDocument(doc2);
            treeProvider.refresh();
            
            // Get initial state
            const children = await treeProvider.getChildren();
            const docNode = children?.find(child => 
                typeof child === 'object' && 'filename' in child && child.filename === 'PRD.md');
            
            // Document should be expanded by default
            const docItem = treeProvider.getTreeItem(docNode!);
            expect(docItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Expanded);
        });
    });

    describe('Empty States', () => {
        test('should handle empty workspace', async () => {
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            expect(children?.length || 0).toBe(0);
        });

        test('should handle documents with only headers', async () => {
            const content = `# Test PRD

## Features

Planning in progress.

## Backend

Coming soon.`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            treeProvider.refresh();
            
            const children = await treeProvider.getChildren();
            // Should show empty message for PRD files with no tasks
            expect(children?.length).toBe(1);
            expect(children?.[0]).toEqual(expect.objectContaining({
                type: 'message',
                text: expect.stringContaining('PRD.md (no tasks yet)')
            }));
        });
    });
});