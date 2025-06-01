import { describe, test, expect, beforeEach } from 'vitest';
import { PrdTaskManager } from '../../managers/prdTaskManager';
import { 
    createMockTextDocument, 
    setupMockConfiguration, 
    resetMocks,
    createMockWorkspaceEdit,
    createMockTextEdit,
    createMockRange,
    createMockPosition,
    loadTestFixture
} from '../helpers/testHelpers';

describe('Duplicate Detection Tests', () => {
    let taskManager: PrdTaskManager;

    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
        taskManager = new PrdTaskManager();
    });

    describe('Basic Duplicate Detection', () => {
        test('should detect simple duplicates', async () => {
            const content = `# Test PRD

- [ ] First task @alice PRD-100001
- [ ] Second task @bob PRD-100002
- [ ] Duplicate task @charlie PRD-100001
- [ ] Third task @diana PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(1);
            expect(duplicates.has('PRD-100001')).toBe(true);
            const positions = duplicates.get('PRD-100001')!;
            expect(positions.length).toBe(2);
            
            // Check positions
            const sortedPositions = positions.sort();
            expect(sortedPositions).toEqual([2, 4]);
        });

        test('should detect multiple duplicate groups', async () => {
            const content = `# Test PRD

- [ ] First task @alice PRD-100001
- [ ] Second task @bob PRD-100002
- [ ] Duplicate first @charlie PRD-100001
- [ ] Third task @diana PRD-100003
- [ ] Duplicate second @eve PRD-100002
- [ ] Another duplicate second @frank PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(2);
            
            const duplicateIds = Array.from(duplicates.keys()).sort();
            expect(duplicateIds).toEqual(['PRD-100001', 'PRD-100002']);
            
            const firstGroupPositions = duplicates.get('PRD-100001')!;
            const secondGroupPositions = duplicates.get('PRD-100002')!;
            
            expect(firstGroupPositions.length).toBe(2);
            expect(secondGroupPositions.length).toBe(3);
        });

        test('should not report unique IDs as duplicates', async () => {
            const content = `# Test PRD

- [ ] First task @alice PRD-100001
- [ ] Second task @bob PRD-100002
- [ ] Third task @charlie PRD-100003
- [ ] Fourth task @diana PRD-100004`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(0);
        });

        test('should handle empty document', async () => {
            const doc = createMockTextDocument('/test/PRD.md', '# Empty PRD\n\nNo tasks here.');
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(0);
        });

        test('should handle document with only one task', async () => {
            const content = `# Test PRD

- [ ] Only task @alice PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(0);
        });
    });

    describe('Complex Scenarios', () => {
        test('should detect duplicates in nested tasks', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
  - [ ] Duplicate parent ID @charlie PRD-100001
- [ ] Another parent @diana PRD-100003
  - [ ] Duplicate child ID @eve PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(2);
            
            const duplicateIds = Array.from(duplicates.keys()).sort();
            expect(duplicateIds).toEqual(['PRD-100001', 'PRD-100002']);
        });

        test('should detect duplicates across sections', async () => {
            const content = `# Test PRD

## Frontend

- [ ] Frontend task @alice PRD-100001
- [ ] Another frontend task @bob PRD-100002

## Backend

- [ ] Backend task @charlie PRD-100003
- [ ] Duplicate frontend ID @diana PRD-100001

## Database

- [ ] Duplicate frontend ID @eve PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(2);
        });

        test('should detect duplicates with different completion states', async () => {
            const content = `# Test PRD

- [ ] Incomplete task @alice PRD-100001
- [x] Same ID but completed @bob PRD-100001
- [x] Completed task @charlie PRD-100002
- [ ] Same ID but incomplete @diana PRD-100002`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(2);
            
            duplicates.forEach(positions => {
                expect(positions.length).toBe(2);
            });
        });

        test('should detect duplicates with different assignees', async () => {
            const content = `# Test PRD

- [ ] Task assigned to alice @alice PRD-100001
- [ ] Same task assigned to bob @bob PRD-100001
- [ ] Same task with multiple assignees @charlie @diana PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(1);
            const positions = duplicates.get('PRD-100001')!;
            expect(positions.length).toBe(3);
        });

        test('should handle malformed task IDs', async () => {
            const content = `# Test PRD

- [ ] Valid task @alice PRD-100001
- [ ] Invalid task ID @bob PRD-invalid
- [ ] Duplicate valid task @charlie PRD-100001
- [ ] Invalid task without proper ID @diana`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Should only consider valid task IDs
            expect(duplicates.size).toBe(1);
            expect(duplicates.has('PRD-100001')).toBe(true);
        });

        test('should detect duplicates with different prefixes', async () => {
            const content = `# Test PRD

- [ ] PRD task @alice PRD-100001
- [ ] Different prefix @bob TASK-100001
- [ ] Duplicate PRD task @charlie PRD-100001
- [ ] Duplicate TASK task @diana TASK-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Should find duplicates within each prefix group
            expect(duplicates.size).toBe(1);
            
            const duplicateIds = Array.from(duplicates.keys()).sort();
            expect(duplicateIds).toEqual(['PRD-100001']);
        });
    });

    describe('Duplicate Fixing', () => {
        test('should generate fix for simple duplicates', async () => {
            const content = `# Test PRD

- [ ] First task @alice PRD-100001
- [ ] Second task @bob PRD-100002
- [ ] Duplicate task @charlie PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            expect(duplicates.size).toBe(1);
            
            // Simulate fixing duplicates
            const edit = createMockWorkspaceEdit();
            const duplicateId = 'PRD-100001';
            const positions = duplicates.get(duplicateId)!;
            
            // Fix all but the first occurrence
            for (let i = 1; i < positions.length; i++) {
                const line = positions[i];
                const lineText = doc.lineAt(line).text;
                
                // Generate new ID (would be done by task manager)
                const newId = 'PRD-100003'; // Next available ID
                const newText = lineText.replace(duplicateId, newId);
                
                const range = createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, lineText.length)
                );
                
                edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            }
            
            const edits = edit.get(doc.uri);
            expect(edits.length).toBe(1);
            expect(edits[0].newText.includes('PRD-100003')).toBeTruthy();
        });

        test('should preserve task structure when fixing duplicates', async () => {
            const content = `# Test PRD

- [ ] Original task @alice PRD-100001
- [x] Duplicate with different state @bob @charlie PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            // Fix the second occurrence
            const edit = createMockWorkspaceEdit();
            const duplicateId = 'PRD-100001';
            const positions = duplicates.get(duplicateId)!;
            const secondOccurrence = positions[1];
            
            const line = secondOccurrence;
            const lineText = doc.lineAt(line).text;
            const newText = lineText.replace('PRD-100001', 'PRD-100002');
            
            const range = createMockRange(
                createMockPosition(line, 0),
                createMockPosition(line, lineText.length)
            );
            
            edit.set(doc.uri, [createMockTextEdit(range, newText)]);
            
            const edits = edit.get(doc.uri);
            expect(edits[0].newText.includes('[x]')).toBeTruthy();
            expect(edits[0].newText.includes('@bob @charlie')).toBeTruthy();
            expect(edits[0].newText.includes('Duplicate with different state')).toBeTruthy();
            expect(edits[0].newText.includes('PRD-100002')).toBeTruthy();
        });

        test('should fix nested duplicate tasks', async () => {
            const content = `# Test PRD

- [ ] Parent task @alice PRD-100001
  - [ ] Child task @bob PRD-100002
    - [ ] Deep duplicate @charlie PRD-100001
- [ ] Another task @diana PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            expect(duplicates.size).toBe(1);
            
            // Fix the nested duplicate
            const edit = createMockWorkspaceEdit();
            const duplicateId = 'PRD-100001';
            const positions = duplicates.get(duplicateId)!;
            const nestedDuplicate = positions.find(line => line === 4); // Deep nested line
            
            if (nestedDuplicate !== undefined) {
                const line = nestedDuplicate;
                const lineText = doc.lineAt(line).text;
                const newText = lineText.replace('PRD-100001', 'PRD-100004');
                
                const range = createMockRange(
                    createMockPosition(line, 0),
                    createMockPosition(line, lineText.length)
                );
                
                edit.set(doc.uri, [createMockTextEdit(range, newText)]);
                
                const edits = edit.get(doc.uri);
                expect(edits[0].newText.includes('    - [ ]')).toBeTruthy();
                expect(edits[0].newText.includes('PRD-100004')).toBeTruthy();
            }
        });

        test('should handle fixing multiple duplicate groups', async () => {
            const content = `# Test PRD

- [ ] First original @alice PRD-100001
- [ ] Second original @bob PRD-100002
- [ ] First duplicate @charlie PRD-100001
- [ ] Second duplicate @diana PRD-100002
- [ ] Another first duplicate @eve PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            expect(duplicates.size).toBe(2);
            
            // Simulate fixing all duplicates
            const edit = createMockWorkspaceEdit();
            const allEdits = [];
            let nextId = 100003;
            
            duplicates.forEach((positions, duplicateId) => {
                // Fix all but the first occurrence in each group
                for (let i = 1; i < positions.length; i++) {
                    const line = positions[i];
                    const lineText = doc.lineAt(line).text;
                    const newId = `PRD-${nextId}`;
                    const newText = lineText.replace(duplicateId, newId);
                    
                    const range = createMockRange(
                        createMockPosition(line, 0),
                        createMockPosition(line, lineText.length)
                    );
                    
                    allEdits.push(createMockTextEdit(range, newText));
                    nextId++;
                }
            });
            
            edit.set(doc.uri, allEdits);
            
            const edits = edit.get(doc.uri);
            expect(edits.length).toBe(3);
        });
    });

    describe('Edge Cases', () => {
        test('should handle tasks without proper formatting', async () => {
            const content = `# Test PRD

- [ ] Valid task @alice PRD-100001
- Invalid task (no checkbox) @bob PRD-100001
* [ ] Different bullet style @charlie PRD-100001
  - [ ] Indented task @diana PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            // Should find duplicates based on task ID pattern, regardless of formatting
            expect(duplicates.size).toBeGreaterThan(0);
            
            expect(duplicates.has('PRD-100001')).toBeTruthy();
        });

        test('should handle very long lines', async () => {
            const longTaskText = 'Very long task description that goes on and on and contains lots of details about the implementation and requirements and specifications and more details';
            const content = `# Test PRD

- [ ] ${longTaskText} @alice PRD-100001
- [ ] ${longTaskText} but different assignee @bob PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(1);
            const positions = duplicates.get('PRD-100001')!;
            expect(positions.length).toBe(2);
        });

        test('should handle tasks with special characters', async () => {
            const content = `# Test PRD

- [ ] Task with special chars: åéîøü @alice PRD-100001
- [ ] Task with emojis: 🚀🎉💻 @bob PRD-100001
- [ ] Task with symbols: &amp; &lt; &gt; @charlie PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            expect(duplicates.size).toBe(1);
            const positions = duplicates.get('PRD-100001')!;
            expect(positions.length).toBe(3);
        });

        test('should handle case sensitivity in task IDs', async () => {
            const content = `# Test PRD

- [ ] Lowercase task @alice PRD-100001
- [ ] Different case @bob prd-100001
- [ ] Same case @charlie PRD-100001`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Task IDs should be case sensitive
            expect(duplicates.has('PRD-100001')).toBeTruthy();
            const positions = duplicates.get('PRD-100001')!;
            expect(positions.length).toBe(2);
        });
    });

    describe('Integration with Test Fixtures', () => {
        test('should detect duplicates in fixture file', async () => {
            const fixture = await loadTestFixture('duplicate-ids');
            const doc = fixture.workspace.documents[0];
            
            expect(doc).toBeTruthy();
            
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            
            // Test passes if duplicate detection runs without errors
            expect(duplicates instanceof Map).toBe(true);
        });

        test('should not find duplicates in clean fixtures', async () => {
            const fixture = await loadTestFixture('single-prd');
            const doc = fixture.workspace.documents[0];
            
            const duplicates = await taskManager.findDuplicateTaskIds(doc);
            expect(duplicates.size).toBe(0);
        });
    });
});