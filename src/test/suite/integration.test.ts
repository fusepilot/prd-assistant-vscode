import { describe, test, expect, beforeEach } from 'vitest';
import { PrdTaskManager } from '../../managers/prdTaskManager';
import { PrdTreeProvider } from '../../providers/prdTreeProvider';
import { 
    loadTestFixture,
    setupMockWorkspace,
    setupMockConfiguration,
    resetMocks,
    createTestDocuments
} from '../helpers/testHelpers';

describe('Integration Tests', () => {
    let taskManager: PrdTaskManager;
    let treeProvider: PrdTreeProvider;

    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
        taskManager = new PrdTaskManager();
        treeProvider = new PrdTreeProvider(taskManager);
    });

    describe('End-to-End Workflow', () => {
        test('should handle complete task lifecycle', async () => {
            const content = `# Test PRD

## Features

- [ ] PRD-100001 Initial feature @alice
- [ ] PRD-100002 Another feature @bob

## Backend

- [ ] PRD-200001 API development @charlie`;

            const doc = createTestDocuments([
                { name: 'PRD.md', content }
            ])[0];

            // 1. Parse tasks
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBe(3);

            // 2. Generate tree view
            treeProvider.refresh();
            const children = await treeProvider.getChildren();
            expect(children?.length).toBeGreaterThan(0);

            // 3. Calculate progress
            const completedTasks = tasks.filter(t => t.completed).length;
            const totalTasks = tasks.length;
            expect(completedTasks).toBe(0);
            expect(totalTasks).toBe(3);

            // 4. Simulate completing a task (would be done by toggle command)
            const updatedContent = content.replace('[ ] PRD-100001', '[x] PRD-100001');
            const updatedDoc = createTestDocuments([
                { name: 'PRD.md', content: updatedContent }
            ])[0];

            // 5. Re-parse and verify
            await taskManager.processDocument(updatedDoc);
            const updatedTasks = taskManager.getTasksByDocument(updatedDoc.uri);
            const updatedCompleted = updatedTasks.filter(t => t.completed).length;
            
            expect(updatedCompleted).toBe(1);
            expect(Math.round((updatedCompleted / updatedTasks.length) * 100)).toBe(33);
        });

        test('should handle multi-document workspace', async () => {
            const docs = createTestDocuments([
                { 
                    name: 'main-PRD.md', 
                    content: `# Main PRD
- [ ] PRD-100001 Main feature @alice
- [x] PRD-100002 Completed feature @bob`
                },
                { 
                    name: 'mobile-prd.md', 
                    content: `# Mobile PRD
- [ ] PRD-200001 iOS app @charlie
- [ ] PRD-200002 Android app @diana`
                }
            ]);

            setupMockWorkspace(docs);

            // Parse all documents
            for (const doc of docs) {
                await taskManager.processDocument(doc);
            }
            const allTasks = docs.flatMap(doc => taskManager.getTasksByDocument(doc.uri));
            expect(allTasks.length).toBe(4);

            // Generate tree for all documents
            treeProvider.refresh();
            const children = await treeProvider.getChildren();
            expect(children?.length).toBe(2);

            // Calculate overall progress
            const completedTasks = allTasks.filter(t => t.completed).length;
            expect(completedTasks).toBe(1);
            expect(allTasks.length).toBe(4);
        });

        test('should handle complex nested hierarchy', async () => {
            const fixture = await loadTestFixture('complex-hierarchy');
            const doc = fixture.workspace.documents[0];

            setupMockWorkspace([doc]);

            // Parse complex nested structure
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBeGreaterThan(10);

            // Verify hierarchy is preserved
            const parentTasks = tasks.filter(task => task.children.length > 0);
            expect(parentTasks.length).toBeGreaterThan(0);

            const deepestTasks = tasks.filter(task => {
                let depth = 0;
                let current = task.parent;
                while (current) {
                    depth++;
                    current = current.parent;
                }
                return depth > 1;
            });
            expect(deepestTasks.length).toBeGreaterThan(0);

            // Generate tree and verify structure
            treeProvider.refresh();
            const treeChildren = await treeProvider.getChildren();
            expect(treeChildren && treeChildren.length > 0).toBeTruthy();
        });
    });

    describe('Fixture-Based Tests', () => {
        test('should process empty workspace fixture', async () => {
            const fixture = await loadTestFixture('empty-workspace');
            setupMockWorkspace(fixture.workspace.documents);

            treeProvider.refresh();
            const children = await treeProvider.getChildren();
            expect(children?.length || 0).toBe(0);
        });

        test('should process single PRD fixture', async () => {
            const fixture = await loadTestFixture('single-prd');
            const doc = fixture.workspace.documents[0];
            
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBeGreaterThan(0);

            // Check for expected task structure
            const hasPrdTasks = tasks.some(task => task.id.startsWith('PRD-'));
            expect(hasPrdTasks).toBeTruthy();

            const hasAssignees = tasks.some(task => task.assignee);
            expect(hasAssignees).toBeTruthy();
        });

        test('should process large PRD fixture', async () => {
            const fixture = await loadTestFixture('large-prd');
            const doc = fixture.workspace.documents[0];

            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBeGreaterThanOrEqual(40);

            // Performance check - should parse quickly
            const startTime = Date.now();
            await taskManager.processDocument(doc);
            const parseTime = Date.now() - startTime;
            expect(parseTime).toBeLessThan(1000);

            // Check progress calculation on large dataset
            const completedTasks = tasks.filter(t => t.completed).length;
            expect(tasks.length).toBeGreaterThan(40);
            const percentage = Math.round((completedTasks / tasks.length) * 100);
            expect(percentage >= 0 && percentage <= 100).toBeTruthy();
        });

        test('should handle malformed tasks fixture', async () => {
            const fixture = await loadTestFixture('malformed-tasks');
            const doc = fixture.workspace.documents[0];

            // Should handle malformed tasks gracefully
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Should find valid tasks despite malformed ones
            const validTasks = tasks.filter(task => task.id.match(/^PRD-\d+$/));
            expect(validTasks.length).toBeGreaterThan(0);

            // Should not throw errors
            expect(() => {
                const completed = tasks.filter(t => t.completed).length;
                treeProvider.refresh();
            }).not.toThrow();
        });

        test('should detect and handle duplicate IDs fixture', async () => {
            const fixture = await loadTestFixture('duplicate-ids');
            const doc = fixture.workspace.documents[0];

            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            expect(duplicates.size).toBeGreaterThan(0);

            // Should still parse tasks despite duplicates
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBeGreaterThan(0);

            // Tree view should handle duplicates gracefully
            expect(() => {
                treeProvider.refresh();
            }).not.toThrow();
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle documents with no tasks', async () => {
            const fixture = await loadTestFixture('headers-only');
            const doc = fixture.workspace.documents[0];

            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBe(0);

            const completedTasks = tasks.filter(t => t.completed).length;
            expect(tasks.length).toBe(0);
            expect(completedTasks).toBe(0);

            treeProvider.refresh();
            const children = await treeProvider.getChildren();
            expect(children?.length).toBe(1);
        });

        test('should handle mixed file types in workspace', async () => {
            const fixture = await loadTestFixture('mixed-workspace');
            setupMockWorkspace(fixture.workspace.documents);

            // Should only process markdown files
            const markdownDocs = fixture.workspace.documents.filter(doc => 
                doc.fileName.endsWith('.md'));
            expect(markdownDocs.length).toBeGreaterThan(0);

            // Should process each markdown file
            for (const doc of markdownDocs) {
                await expect(taskManager.processDocument(doc)).resolves.not.toThrow();
            }
        });

        test('should handle rapid document changes', async () => {
            const initialContent = `# Test PRD
- [ ] Initial task @alice PRD-100001`;

            const updates = [
                `# Test PRD
- [ ] Initial task @alice PRD-100001
- [ ] New task @bob PRD-100002`,
                `# Test PRD
- [x] Initial task @alice PRD-100001
- [ ] New task @bob PRD-100002`,
                `# Test PRD
- [x] Initial task @alice PRD-100001
- [x] New task @bob PRD-100002
- [ ] Another task @charlie PRD-100003`
            ];

            const doc = createTestDocuments([
                { name: 'PRD.md', content: initialContent }
            ])[0];

            // Initial state
            await taskManager.processDocument(doc);
            let tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBe(1);

            // Process rapid updates
            for (const content of updates) {
                const updatedDoc = createTestDocuments([
                    { name: 'PRD.md', content }
                ])[0];

                await expect(async () => {
                    await taskManager.processDocument(updatedDoc);
                    tasks = taskManager.getTasksByDocument(updatedDoc.uri);
                    treeProvider.refresh();
                }).not.toThrow();
            }

            // Final state verification
            expect(tasks.length).toBe(3);
            const completedTasks = tasks.filter(t => t.completed).length;
            expect(completedTasks).toBe(2);
        });

        test('should handle very large nested hierarchies', async () => {
            // Create a deeply nested structure
            let content = '# Deep Hierarchy PRD\n\n';
            let indent = '';
            
            for (let i = 1; i <= 10; i++) {
                content += `${indent}- [ ] PRD-${i.toString().padStart(6, '0')} Level ${i} task @user${i}\n`;
                indent += '  '; // Increase indentation
            }

            const doc = createTestDocuments([
                { name: 'deep-PRD.md', content }
            ])[0];

            // Should handle deep nesting without stack overflow
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            expect(tasks.length).toBe(10);

            // Verify hierarchy depth
            const deepestTask = tasks.find(task => task.id === 'PRD-000010');
            expect(deepestTask).toBeTruthy();

            let depth = 0;
            let current = deepestTask?.parent;
            while (current) {
                depth++;
                current = current.parent;
            }
            expect(depth).toBe(9);

            // Tree view should handle deep nesting
            expect(() => {
                treeProvider.refresh();
            }).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should handle multiple large documents efficiently', async () => {
            // Create multiple large documents
            const largeDocs = [];
            for (let docIndex = 0; docIndex < 5; docIndex++) {
                let content = `# Large Document ${docIndex + 1}\n\n`;
                
                for (let i = 0; i < 100; i++) {
                    const taskId = `PRD-${docIndex + 1}${i.toString().padStart(4, '0')}`;
                    content += `- [ ] Task ${i + 1} in document ${docIndex + 1} @user${(i % 5) + 1} ${taskId}\n`;
                }
                
                largeDocs.push(createTestDocuments([
                    { name: `large-prd-${docIndex + 1}.md`, content }
                ])[0]);
            }

            const startTime = Date.now();

            // Process all documents
            for (const doc of largeDocs) {
                await taskManager.processDocument(doc);
            }
            const allTasks = largeDocs.flatMap(doc => taskManager.getTasksByDocument(doc.uri));
            
            // Generate tree for all documents
            treeProvider.refresh();
            
            // Calculate overall progress
            const completedTasks = allTasks.filter(t => t.completed).length;

            const totalTime = Date.now() - startTime;

            // Performance assertions
            expect(totalTime).toBeLessThan(5000);
            expect(allTasks.length).toBe(500);
            expect(allTasks.length).toBe(500);

            console.log(`Processed ${allTasks.length} tasks from ${largeDocs.length} documents in ${totalTime}ms`);
        });
    });
});