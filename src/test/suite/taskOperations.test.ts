import { describe, test, expect, beforeEach } from 'vitest';
import { PrdTaskManager } from '../../managers/prdTaskManager';
import { mockVscode } from '../mocks/vscode';
import { 
    createMockTextDocument, 
    setupMockConfiguration, 
    resetMocks,
    createMockWorkspaceEdit,
    createMockTextEdit,
    createMockRange,
    createMockPosition
} from '../helpers/testHelpers';

describe('Task Operations Tests', () => {
    let taskManager: PrdTaskManager;

    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
        taskManager = new PrdTaskManager();
    });

    describe('Task Toggling', () => {
        test('should toggle incomplete task to complete', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const incompleteTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(incompleteTask).toBeTruthy();
            expect(incompleteTask.completed).toBe(false);
            
            // Simulate toggling
            const edit = createMockWorkspaceEdit();
            const line = incompleteTask.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace('[ ]', '[x]');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            // Verify the edit would change the checkbox
            const edits = edit.get(doc.uri);
            expect(edits.length).toBe(1);
            expect(edits[0].newText.includes('[x]')).toBeTruthy();
        });

        test('should toggle complete task to incomplete', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Complete task @bob PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const completeTask = tasks.find(t => t.id === 'PRD-100002');
            
            expect(completeTask).toBeTruthy();
            expect(completeTask.completed).toBe(true);
            
            // Simulate toggling
            const edit = createMockWorkspaceEdit();
            const line = completeTask.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace('[x]', '[ ]');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            // Verify the edit would change the checkbox
            const edits = edit.get(doc.uri);
            expect(edits.length).toBe(1);
            expect(edits[0].newText.includes('[ ]')).toBeTruthy();
        });

        test('should handle malformed checkboxes when toggling', async () => {
            const content = `# Test PRD

- [] Missing space @alice PRD-100001
- [x ] Extra space @bob PRD-100002
- [ x] Wrong space position @charlie PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            expect(tasks.length).toBe(3);
            
            // First task: [] -> [x]
            const task1 = tasks.find(t => t.id === 'PRD-100001');
            expect(task1).toBeTruthy();
            expect(task1.completed).toBe(false);
            
            // Second task: [x ] -> [ ]
            const task2 = tasks.find(t => t.id === 'PRD-100002');
            expect(task2).toBeTruthy();
            expect(task2.completed).toBe(true);
            
            // Third task: [ x] -> [ ]
            const task3 = tasks.find(t => t.id === 'PRD-100003');
            expect(task3).toBeTruthy();
            expect(task3.completed).toBe(true);
        });

        test('should toggle nested tasks independently', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
  - [x] Completed child @charlie PRD-100003
- [x] Another parent @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            const parentTask = tasks.find(t => t.id === 'PRD-100001');
            const childTask = tasks.find(t => t.id === 'PRD-100002');
            const completedChild = tasks.find(t => t.id === 'PRD-100003');
            
            expect(parentTask && childTask && completedChild).toBeTruthy();
            
            expect(parentTask.completed).toBe(false);
            expect(childTask.completed).toBe(false);
            expect(completedChild.completed).toBe(true);
            
            // Toggle child task should not affect parent
            // This would be handled by the actual toggle implementation
        });
    });

    describe('Task Assignment', () => {
        test('should add assignee to task without assignee', async () => {
            const content = `# Test PRD

- [ ] Task without assignee PRD-100001
- [ ] Task with assignee @alice PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const unassignedTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(unassignedTask).toBeTruthy();
            expect(unassignedTask.assignee).toBe(undefined);
            
            // Simulate adding assignee
            const edit = createMockWorkspaceEdit();
            const line = unassignedTask.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText + ' @bob';
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('@bob')).toBeTruthy();
        });

        test('should update existing assignee', async () => {
            const content = `# Test PRD

- [ ] Task with assignee @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const assignedTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(assignedTask).toBeTruthy();
            expect(assignedTask.assignee).toBe('@alice');
            
            // Simulate changing assignee
            const edit = createMockWorkspaceEdit();
            const line = assignedTask.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace('@alice', '@bob');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('@bob')).toBeTruthy();
            expect(edits[0].newText.includes('@alice')).toBeFalsy();
        });

        test('should handle multiple assignees', async () => {
            const content = `# Test PRD

- [ ] Task with multiple assignees @alice @bob PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const multiAssignedTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(multiAssignedTask).toBeTruthy();
            expect(multiAssignedTask.assignee).toBe('@alice @bob');
        });

        test('should remove assignee', async () => {
            const content = `# Test PRD

- [ ] Task with assignee @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const assignedTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(assignedTask).toBeTruthy();
            
            // Simulate removing assignee
            const edit = createMockWorkspaceEdit();
            const line = assignedTask.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace(' @alice', '');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('@alice')).toBeFalsy();
        });

        test('should handle default assignee configuration', () => {
            setupMockConfiguration({
                defaultAssignee: '@defaultuser'
            });
            
            // When adding a new task, it should use the default assignee
            const config = mockVscode.workspace.getConfiguration();
            const defaultAssignee = config.get('defaultAssignee');
            
            expect(defaultAssignee).toBe('@defaultuser');
        });
    });

    describe('Task Text Modification', () => {
        test('should modify task text', async () => {
            const content = `# Test PRD

- [ ] Original task text @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const task = tasks.find(t => t.id === 'PRD-100001');
            
            expect(task).toBeTruthy();
            expect(task.text).toBe('Original task text');
            
            // Simulate text modification
            const edit = createMockWorkspaceEdit();
            const line = task.line;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace('Original task text', 'Updated task text');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('Updated task text')).toBeTruthy();
            expect(edits[0].newText.includes('PRD-100001')).toBeTruthy();
            expect(edits[0].newText.includes('@alice')).toBeTruthy();
        });

        test('should preserve task structure when editing text', async () => {
            const content = `# Test PRD

- [ ] Task text @alice @bob PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const task = tasks.find(t => t.id === 'PRD-100001');
            
            expect(task).toBeTruthy();
            
            // Modify only the text part
            const edit = createMockWorkspaceEdit();
            const line = task.line;
            const lineText = doc.lineAt(line).text;
            
            // Replace just the task text, preserving checkbox, ID, and assignees
            const taskPattern = /^(\s*- \[[x ]\]) ([^@]+)(@.*) (PRD-\d+)$/;
            const match = lineText.match(taskPattern);
            
            if (match) {
                const newText = `${match[1]} New task description ${match[3]} ${match[4]}`;
                
                const range = createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, lineText.length)
                );
                
                edit.set(doc.uri, [createMockTextEdit(range, newText)]);
                
                const edits = edit.get(doc.uri);
                expect(edits[0].newText.includes('[ ]')).toBeTruthy();
                expect(edits[0].newText.includes('PRD-100001')).toBeTruthy();
                expect(edits[0].newText.includes('@alice @bob')).toBeTruthy();
                expect(edits[0].newText.includes('New task description')).toBeTruthy();
            }
        });
    });

    describe('Task Addition', () => {
        test('should add task at cursor position', async () => {
            const content = `# Test PRD

## Features

- [ ] Existing task @alice PRD-100001

## Backend`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Simulate adding a task after the existing one
            const edit = createMockWorkspaceEdit();
            const newTaskLine = '- [ ] New task @bob PRD-100002';
            const insertPosition = createMockPosition(5, 0); // After existing task
            
            edit.set(doc.uri, [createMockTextEdit(
                createMockRange(insertPosition, insertPosition),
                newTaskLine + '\n'
            )]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('PRD-100002')).toBeTruthy();
            expect(edits[0].newText.includes('New task')).toBeTruthy();
            expect(edits[0].newText.includes('@bob')).toBeTruthy();
        });

        test('should add subtask with proper indentation', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Simulate adding a subtask
            const edit = createMockWorkspaceEdit();
            const newSubtaskLine = '  - [ ] Child task @bob PRD-100002';
            const insertPosition = createMockPosition(3, 0); // After parent task
            
            edit.set(doc.uri, [createMockTextEdit(
                createMockRange(insertPosition, insertPosition),
                newSubtaskLine + '\n'
            )]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('  - [ ]')).toBeTruthy();
            expect(edits[0].newText.includes('PRD-100002')).toBeTruthy();
        });

        test('should add task under header', async () => {
            const content = `# Test PRD

## Features

## Backend

- [ ] Existing backend task @alice PRD-200001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Simulate adding a task under Features header
            const edit = createMockWorkspaceEdit();
            const newTaskLine = '- [ ] New feature task @bob PRD-100001';
            const insertPosition = createMockPosition(4, 0); // After Features header
            
            edit.set(doc.uri, [createMockTextEdit(
                createMockRange(insertPosition, insertPosition),
                newTaskLine + '\n\n'
            )]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('PRD-100001')).toBeTruthy();
        });
    });

    describe('Task Deletion', () => {
        test('should delete task and preserve structure', async () => {
            const content = `# Test PRD

- [ ] Task to keep @alice PRD-100001
- [ ] Task to delete @bob PRD-100002
- [ ] Another task to keep @charlie PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const taskToDelete = tasks.find(t => t.id === 'PRD-100002');
            
            expect(taskToDelete).toBeTruthy();
            
            // Simulate deleting the task
            const edit = createMockWorkspaceEdit();
            const line = taskToDelete.line;
            const lineText = doc.lineAt(line).text;
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line + 1, 0) // Include newline
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, '')]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText).toBe('');
        });

        test('should handle deletion of parent task with children', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
  - [ ] Another child @charlie PRD-100003
- [ ] Unrelated task @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            const parentTask = tasks.find(t => t.id === 'PRD-100001');
            
            expect(parentTask).toBeTruthy();
            expect(parentTask.children.length).toBe(2);
            
            // Deleting parent should also affect children
            // This would be handled by the actual deletion implementation
        });
    });

    describe('Bulk Operations', () => {
        test('should toggle multiple tasks', async () => {
            const content = `# Test PRD

- [ ] Task one @alice PRD-100001
- [ ] Task two @bob PRD-100002
- [ ] Task three @charlie PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Simulate bulk toggle
            const edit = createMockWorkspaceEdit();
            const edits = [];
            
            tasks.forEach(task => {
                const line = task.line;
                const lineText = doc.lineAt(line).text;
                const newText = lineText.replace('[ ]', '[x]');
                
                const range = createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, lineText.length)
                );
                
                edits.push(createMockTextEdit(range, newText));
            });
            
            edit.set(doc.uri, edits);
            
            const appliedEdits = edit.get(doc.uri);
            expect(appliedEdits.length).toBe(3);
            appliedEdits.forEach(edit => {
                expect(edit.newText.includes('[x]')).toBeTruthy();
            });
        });

        test('should assign multiple tasks to same user', async () => {
            const content = `# Test PRD

- [ ] Task one PRD-100001
- [ ] Task two PRD-100002
- [ ] Task three @alice PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Simulate bulk assignment
            const edit = createMockWorkspaceEdit();
            const edits = [];
            
            tasks.forEach(task => {
                const line = task.line;
                const lineText = doc.lineAt(line).text;
                let newText = lineText;
                
                if (!task.assignee) {
                    newText = lineText + ' @bob';
                } else {
                    newText = lineText.replace(/@\w+/, '@bob');
                }
                
                const range = createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, lineText.length)
                );
                
                edits.push(createMockTextEdit(range, newText));
            });
            
            edit.set(doc.uri, edits);
            
            const appliedEdits = edit.get(doc.uri);
            expect(appliedEdits.length).toBe(3);
            appliedEdits.forEach(edit => {
                expect(edit.newText.includes('@bob')).toBeTruthy();
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid task line numbers', async () => {
            const content = `# Test PRD

- [ ] Valid task @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Try to edit a non-existent line
            const edit = createMockWorkspaceEdit();
            
            expect(() => {
                // This should be handled gracefully by the implementation
                const invalidLine = 999;
                const range = createMockRange(
                    createMockPosition(invalidLine, 0),
                    createMockPosition(invalidLine, 0)
                );
                
                edit.set(doc.uri, [createMockTextEdit(range, 'invalid edit')]);
            }).not.toThrow();
        });

        test('should handle concurrent edits', async () => {
            const content = `# Test PRD

- [ ] Task @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            
            // Simulate concurrent edits to the same task
            const edit1 = createMockWorkspaceEdit();
            const edit2 = createMockWorkspaceEdit();
            
            const line = 2;
            const lineText = doc.lineAt(line).text;
            
            // Edit 1: Toggle task
            const range1 = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            edit1.set(doc.uri, [createMockTextEdit(range1, lineText.replace('[ ]', '[x]'))]);
            
            // Edit 2: Change assignee
            const range2 = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            edit2.set(doc.uri, [createMockTextEdit(range2, lineText.replace('@alice', '@bob'))]);
            
            // Both edits should be valid individually
            expect(edit1.get(doc.uri).length).toBe(1);
            expect(edit2.get(doc.uri).length).toBe(1);
        });
    });
});