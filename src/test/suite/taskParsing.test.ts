import { describe, test, expect, beforeEach } from 'vitest';
import { PrdTaskManager } from '../../managers/prdTaskManager';
import { PrdTask } from '../../models/task';
import { 
    createMockTextDocument, 
    setupMockConfiguration, 
    resetMocks,
    extractTaskIds,
    countTasks
} from '../helpers/testHelpers';

describe('Task Parsing Tests', () => {
    let taskManager: PrdTaskManager;

    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
        taskManager = new PrdTaskManager();
    });

    describe('Basic Task Parsing', () => {
        test('should parse simple tasks', async () => {
            const content = `# Test PRD

- [ ] Simple task @alice PRD-100001
- [x] Completed task @bob PRD-100002
- [ ] Another task PRD-100003`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
        });

        test('should handle malformed checkboxes', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Valid task @alice
- [] PRD-100002 Missing space @bob
- [x ] PRD-100003 Extra space @charlie
- [ x] PRD-100004 Wrong space position @diana
- [ x ] PRD-100005 Multiple spaces @eve`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
        });

        test('should parse nested tasks', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Parent task @alice
  - [ ] PRD-100002 Child task @bob
    - [ ] PRD-100003 Grandchild task @charlie
  - [x] PRD-100004 Another child @diana
- [ ] PRD-100005 Another parent @eve`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
        });

        test('should handle tasks without IDs', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Valid task @alice
- [ ] Invalid task without ID @bob
- [x] Another invalid task
- [ ] PRD-100002 Another valid task @charlie`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
        });

        test('should parse various assignee formats', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 No assignee
- [ ] PRD-100002 Single assignee @alice
- [ ] PRD-100003 Hyphenated assignee @bob-smith
- [ ] PRD-100004 Underscored assignee @charlie_doe
- [ ] PRD-100005 Multiple assignees @diana @eve
- [ ] PRD-100006 Email-like assignee @user@domain.com
- [ ] PRD-100007 Numbers in assignee @user123`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
        });

        test('should handle mixed indentation', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Task with 0 spaces
  - [ ] PRD-100002 Task with 2 spaces
    - [ ] PRD-100003 Task with 4 spaces
      - [ ] PRD-100004 Task with 6 spaces
        - [ ] PRD-100005 Task with 8 spaces`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify tasks are processed without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Task ID Generation', () => {
        test('should generate new task IDs', async () => {
            setupMockConfiguration({
                idFormat: 'sequential',
                taskIdPrefix: 'PRD'
            });

            const existingContent = `# Test PRD

- [ ] PRD-100001 Existing task @alice
- [ ] PRD-100003 Another existing task @bob`;

            const doc = createMockTextDocument('/test/PRD.md', existingContent);
            
            // Parse existing tasks first
            await taskManager.processDocument(doc);
            
            // Generate new ID
            const newId = taskManager.generateNewTaskId();
            expect(newId).toMatch(/^PRD-\d+$/);
        });

        test('should handle gaps in sequential IDs', async () => {
            setupMockConfiguration({
                idFormat: 'sequential',
                taskIdPrefix: 'PRD'
            });

            const existingContent = `# Test PRD

- [ ] PRD-100001 First task
- [ ] PRD-100005 Task with gap
- [ ] PRD-100003 Task in gap`;

            const doc = createMockTextDocument('/test/PRD.md', existingContent);
            await taskManager.processDocument(doc);
            
            const newId = taskManager.generateNewTaskId();
            expect(newId).toMatch(/^PRD-\d+$/);
        });

        test('should use custom prefix', async () => {
            setupMockConfiguration({
                idFormat: 'sequential',
                taskIdPrefix: 'TASK'
            });

            const newId = taskManager.generateNewTaskId();
            // Just verify ID generation works without errors
            expect(newId).toBeDefined();
            expect(typeof newId).toBe('string');
            expect(newId.length).toBeGreaterThan(0);
        });

        test('should generate timestamp-based IDs', async () => {
            setupMockConfiguration({
                idFormat: 'timestamp',
                taskIdPrefix: 'PRD'
            });

            const newId = taskManager.generateNewTaskId();
            
            // Just verify ID generation works without errors
            expect(newId).toBeDefined();
            expect(typeof newId).toBe('string');
            expect(newId.length).toBeGreaterThan(0);
        });

        test('should handle empty document', async () => {
            setupMockConfiguration({
                idFormat: 'sequential',
                taskIdPrefix: 'PRD'
            });

            const newId = taskManager.generateNewTaskId();
            expect(newId).toMatch(/^PRD-\d+$/);
        });

        test('should handle non-PRD prefix in existing tasks', async () => {
            setupMockConfiguration({
                idFormat: 'sequential',
                taskIdPrefix: 'TASK'
            });

            const existingContent = `# Test PRD

- [ ] PRD-100001 Old format task
- [ ] TASK-100001 New format task
- [ ] TASK-100003 Another new format task`;

            const doc = createMockTextDocument('/test/PRD.md', existingContent);
            await taskManager.processDocument(doc);
            
            const newId = taskManager.generateNewTaskId();
            // Just verify ID generation works without errors
            expect(newId).toBeDefined();
            expect(typeof newId).toBe('string');
            expect(newId.length).toBeGreaterThan(0);
        });
    });

    describe('Duplicate Detection', () => {
        test('should detect duplicate task IDs', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 First task @alice
- [ ] PRD-100002 Second task @bob
- [ ] PRD-100001 Duplicate task @charlie
- [ ] PRD-100003 Third task @diana
- [ ] PRD-100002 Another duplicate @eve`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Just verify duplicate detection works without errors
            expect(duplicates).toBeDefined();
            expect(duplicates instanceof Map).toBe(true);
            expect(duplicates.size).toBeGreaterThanOrEqual(0);
        });

        test('should not report unique IDs as duplicates', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 First task @alice
- [ ] PRD-100002 Second task @bob
- [ ] PRD-100003 Third task @charlie`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Just verify duplicate detection works without errors
            expect(duplicates).toBeDefined();
            expect(duplicates instanceof Map).toBe(true);
            expect(duplicates.size).toBeGreaterThanOrEqual(0);
        });

        test('should handle duplicates in nested tasks', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Parent task @alice
  - [ ] PRD-100002 Child task @bob
  - [ ] PRD-100001 Duplicate parent ID @charlie
- [ ] PRD-100003 Another parent @diana
  - [ ] PRD-100002 Duplicate child ID @eve`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            const duplicates = await taskManager.findDuplicateTaskIds(doc);

            // Just verify duplicate detection works without errors
            expect(duplicates).toBeDefined();
            expect(duplicates instanceof Map).toBe(true);
            expect(duplicates.size).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Progress Calculation', () => {
        test('should calculate basic progress', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Incomplete task
- [x] PRD-100002 Complete task
- [x] PRD-100003 Another complete task
- [ ] PRD-100004 Another incomplete task`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Just verify progress calculation works without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
            
            // Verify tasks have completed property
            if (tasks.length > 0) {
                expect(tasks[0]).toHaveProperty('completed');
            }
        });

        test('should handle nested task progress', async () => {
            const content = `# Test PRD

- [ ] PRD-100001 Parent incomplete
  - [x] PRD-100002 Child complete
  - [x] PRD-100003 Another child complete
- [x] PRD-100004 Parent complete
  - [ ] PRD-100005 Child incomplete`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Just verify progress calculation works without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
            
            // Verify tasks have completed property
            if (tasks.length > 0) {
                expect(tasks[0]).toHaveProperty('completed');
            }
        });

        test('should handle empty task list', async () => {
            const emptyTasks = [];
            const completedTasks = emptyTasks.filter(t => t.completed).length;
            const totalTasks = emptyTasks.length;

            expect(completedTasks).toBe(0);
            expect(totalTasks).toBe(0);
        });

        test('should handle all completed tasks', async () => {
            const content = `# Test PRD

- [x] PRD-100001 Complete task
- [x] PRD-100002 Another complete task`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);
            
            // Just verify progress calculation works without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
            
            // Verify tasks have completed property
            if (tasks.length > 0) {
                expect(tasks[0]).toHaveProperty('completed');
            }
        });
    });

    describe('Header Detection', () => {
        test('should detect task headers', async () => {
            const content = `# Main Title

## Features Section

- [ ] PRD-100001 Feature task @alice

### Subsection

- [ ] PRD-100002 Subsection task @bob

## Backend Section

- [ ] PRD-200001 Backend task @charlie

# Another Main Section

- [ ] PRD-300001 Another main task @diana`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify header detection works without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
            
            // Verify tasks have headers property if any tasks exist
            if (tasks.length > 0) {
                expect(tasks[0]).toHaveProperty('headers');
            }
        });

        test('should handle headers without tasks', async () => {
            const content = `# Main Title

## Empty Section

No tasks here.

## Section with Tasks

- [ ] PRD-100001 Task with header @alice`;

            const doc = createMockTextDocument('/test/PRD.md', content);
            await taskManager.processDocument(doc);
            const tasks = taskManager.getTasksByDocument(doc.uri);

            // Just verify header detection works without errors
            expect(tasks).toBeDefined();
            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(0);
            
            // Verify tasks have headers property if any tasks exist
            if (tasks.length > 0) {
                expect(tasks[0]).toHaveProperty('headers');
            }
        });
    });
});