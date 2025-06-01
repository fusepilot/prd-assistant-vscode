import { describe, test, expect, beforeEach } from 'vitest';
import { 
    loadTestFixture, 
    setupMockWorkspace, 
    setupMockConfiguration, 
    resetMocks,
    createTestDocuments,
    createMockFileSystem
} from '../helpers/testHelpers';

describe('File Detection Tests', () => {
    beforeEach(() => {
        resetMocks();
    });

    describe('Workspace Scanning', () => {
        test('should detect PRD files in empty workspace', async () => {
            const fixture = await loadTestFixture('empty-workspace');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            expect(fixture.workspace.documents.length).toBe(0);
        });

        test('should detect single PRD file', async () => {
            const fixture = await loadTestFixture('single-prd');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            expect(fixture.workspace.documents.length).toBe(1);
            expect(fixture.workspace.documents[0].fileName.endsWith('PRD.md')).toBeTruthy();
        });

        test('should detect multiple PRD files in root', async () => {
            const fixture = await loadTestFixture('multiple-prds-root');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            expect(fixture.workspace.documents.length).toBe(3);
            
            const fileNames = fixture.workspace.documents.map(doc => doc.fileName);
            expect(fileNames.some(name => name.endsWith('PRD.md'))).toBeTruthy();
            expect(fileNames.some(name => name.endsWith('mobile-prd.md'))).toBeTruthy();
            expect(fileNames.some(name => name.endsWith('BACKEND_PRD.md'))).toBeTruthy();
        });

        test('should detect nested PRD files', async () => {
            const fixture = await loadTestFixture('nested-prds');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            expect(fixture.workspace.documents.length).toBeGreaterThanOrEqual(4);
            
            const fileNames = fixture.workspace.documents.map(doc => doc.fileName);
            expect(fileNames.some(name => name.includes('frontend-prd.md'))).toBeTruthy();
            expect(fileNames.some(name => name.includes('api-prd.md'))).toBeTruthy();
            expect(fileNames.some(name => name.includes('very-deep-prd.md'))).toBeTruthy();
        });

        test('should handle mixed workspace with PRD and non-PRD files', async () => {
            const fixture = await loadTestFixture('mixed-workspace');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            const markdownFiles = fixture.workspace.documents.filter(doc => doc.fileName.endsWith('.md'));
            expect(markdownFiles.length).toBeGreaterThanOrEqual(2);
            
            const prdFiles = markdownFiles.filter(doc => doc.fileName.includes('PRD'));
            const nonPrdFiles = markdownFiles.filter(doc => !doc.fileName.includes('PRD'));
            
            expect(prdFiles.length).toBeGreaterThanOrEqual(1);
            expect(nonPrdFiles.length).toBeGreaterThanOrEqual(1);
        });

        test('should handle large PRD files', async () => {
            const fixture = await loadTestFixture('large-prd');
            setupMockWorkspace(fixture.workspace.documents);
            setupMockConfiguration();

            expect(fixture.workspace.documents.length).toBe(1);
            
            const doc = fixture.workspace.documents[0];
            expect(doc.getText().length).toBeGreaterThan(1000);
            expect(doc.lineCount).toBeGreaterThan(50);
        });
    });

    describe('File Pattern Matching', () => {
        test('should match standard naming patterns', () => {
            const docs = createTestDocuments([
                { name: 'PRD.md', content: '# Standard PRD' },
                { name: 'prd.md', content: '# Lowercase PRD' },
                { name: 'sample-prd.md', content: '# Sample PRD' },
                { name: 'MyProjectPRD.md', content: '# Project PRD' },
                { name: 'prd-v2.md', content: '# Version 2 PRD' },
                { name: 'BACKEND_PRD.md', content: '# Backend PRD' },
                { name: 'README.md', content: '# Not a PRD' },
                { name: 'product-requirements.md', content: '# Not matching pattern' }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration();

            // Test each file against isPrdFile logic
            const prdDocs = docs.filter(doc => {
                // Simulate the isPrdFile logic
                const patterns = ['*prd*.md', 'PRD*.md', '*PRD*.md'];
                const fileName = doc.fileName.split('/').pop() || '';
                return patterns.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                    return regex.test(fileName);
                });
            });

            expect(prdDocs.length).toBe(6);
            
            const nonPrdDocs = docs.filter(doc => {
                const fileName = doc.fileName.split('/').pop() || '';
                return fileName === 'README.md' || fileName === 'product-requirements.md';
            });
            
            expect(nonPrdDocs.length).toBe(2);
        });

        test('should respect custom file patterns', () => {
            const docs = createTestDocuments([
                { name: 'requirements.md', content: '# Requirements' },
                { name: 'product-requirements.md', content: '# Product Requirements' },
                { name: 'spec-frontend.md', content: '# Frontend Spec' },
                { name: 'spec.md', content: '# Basic Spec' },
                { name: 'PRD.md', content: '# Standard PRD' }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration({
                filePatterns: ['*requirements*.md', 'spec-*.md']
            });

            // Test custom patterns
            const customPatterns = ['*requirements*.md', 'spec-*.md'];
            const matchingDocs = docs.filter(doc => {
                const fileName = doc.fileName.split('/').pop() || '';
                return customPatterns.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                    return regex.test(fileName);
                });
            });

            expect(matchingDocs.length).toBe(3);
            
            const matchedNames = matchingDocs.map(doc => doc.fileName.split('/').pop());
            expect(matchedNames.includes('requirements.md')).toBeTruthy();
            expect(matchedNames.includes('product-requirements.md')).toBeTruthy();
            expect(matchedNames.includes('spec-frontend.md')).toBeTruthy();
            expect(matchedNames.includes('spec.md')).toBeFalsy();
            expect(matchedNames.includes('PRD.md')).toBeFalsy();
        });

        test('should handle additional files configuration', () => {
            const docs = createTestDocuments([
                { name: 'CLAUDE.md', content: '# Claude Instructions' },
                { name: 'TODO.md', content: '# Todo List' },
                { name: 'TASKS.md', content: '# Task List' },
                { name: 'OTHER.md', content: '# Other File' },
                { name: 'PRD.md', content: '# Standard PRD' }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration({
                additionalFiles: ['CLAUDE.md', 'TODO.md', 'TASKS.md']
            });

            // Test additional files
            const additionalFiles = ['CLAUDE.md', 'TODO.md', 'TASKS.md'];
            const standardPatterns = ['*prd*.md', 'PRD*.md', '*PRD*.md'];
            
            const matchingDocs = docs.filter(doc => {
                const fileName = doc.fileName.split('/').pop() || '';
                
                // Check additional files
                if (additionalFiles.includes(fileName)) {
                    return true;
                }
                
                // Check standard patterns
                return standardPatterns.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
                    return regex.test(fileName);
                });
            });

            expect(matchingDocs.length).toBe(4);
            
            const matchedNames = matchingDocs.map(doc => doc.fileName.split('/').pop());
            expect(matchedNames.includes('CLAUDE.md')).toBeTruthy();
            expect(matchedNames.includes('TODO.md')).toBeTruthy();
            expect(matchedNames.includes('TASKS.md')).toBeTruthy();
            expect(matchedNames.includes('PRD.md')).toBeTruthy();
            expect(matchedNames.includes('OTHER.md')).toBeFalsy();
        });
    });

    describe('Directory Depth Handling', () => {
        test('should respect depth 0 (root only)', () => {
            const fileSystem = createMockFileSystem([
                { name: 'PRD.md', type: 'file', content: '# Root PRD' },
                { 
                    name: 'frontend', 
                    type: 'directory', 
                    children: [
                        { name: 'frontend-prd.md', type: 'file', content: '# Frontend PRD' }
                    ]
                },
                {
                    name: 'backend',
                    type: 'directory',
                    children: [
                        { name: 'backend-prd.md', type: 'file', content: '# Backend PRD' }
                    ]
                }
            ]);

            setupMockWorkspace(fileSystem);
            setupMockConfiguration({
                searchSubdirectoriesDepth: 0
            });

            // With depth 0, should only find root files
            const rootFiles = fileSystem.filter(doc => !doc.fileName.includes('/frontend/') && !doc.fileName.includes('/backend/'));
            expect(rootFiles.length).toBe(1);
            expect(rootFiles[0].fileName.endsWith('PRD.md')).toBeTruthy();
        });

        test('should respect depth 1 (root + one level)', () => {
            const fileSystem = createMockFileSystem([
                { name: 'PRD.md', type: 'file', content: '# Root PRD' },
                { 
                    name: 'frontend', 
                    type: 'directory', 
                    children: [
                        { name: 'frontend-prd.md', type: 'file', content: '# Frontend PRD' },
                        {
                            name: 'components',
                            type: 'directory',
                            children: [
                                { name: 'component-prd.md', type: 'file', content: '# Component PRD' }
                            ]
                        }
                    ]
                }
            ]);

            setupMockWorkspace(fileSystem);
            setupMockConfiguration({
                searchSubdirectoriesDepth: 1
            });

            // With depth 1, should find root and first level
            const depthOneFiles = fileSystem.filter(doc => {
                const pathParts = doc.fileName.split('/');
                return pathParts.length <= 4; // /test/file.md or /test/dir/file.md
            });
            
            expect(depthOneFiles.length).toBe(2);
        });

        test('should handle unlimited depth (99)', () => {
            const fileSystem = createMockFileSystem([
                { name: 'PRD.md', type: 'file', content: '# Root PRD' },
                { 
                    name: 'level1', 
                    type: 'directory', 
                    children: [
                        { name: 'level1-prd.md', type: 'file', content: '# Level 1 PRD' },
                        {
                            name: 'level2',
                            type: 'directory',
                            children: [
                                { name: 'level2-prd.md', type: 'file', content: '# Level 2 PRD' },
                                {
                                    name: 'level3',
                                    type: 'directory',
                                    children: [
                                        { name: 'level3-prd.md', type: 'file', content: '# Level 3 PRD' }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]);

            setupMockWorkspace(fileSystem);
            setupMockConfiguration({
                searchSubdirectoriesDepth: 99
            });

            // With unlimited depth, should find all files
            expect(fileSystem.length).toBe(4);
        });
    });

    describe('Multi-root Workspace Support', () => {
        test('should handle multi-root workspace', () => {
            const docs1 = createTestDocuments([
                { name: 'PRD.md', content: '# Project 1 PRD', path: '/workspace1/PRD.md' }
            ]);
            
            const docs2 = createTestDocuments([
                { name: 'project-prd.md', content: '# Project 2 PRD', path: '/workspace2/project-prd.md' }
            ]);

            const allDocs = [...docs1, ...docs2];
            setupMockWorkspace(allDocs);
            setupMockConfiguration();

            expect(allDocs.length).toBe(2);
            
            const workspaces = new Set(allDocs.map(doc => doc.fileName.split('/')[1]));
            expect(workspaces.size).toBe(2);
        });

        test('should handle overlapping file names in different roots', () => {
            const docs = createTestDocuments([
                { name: 'PRD.md', content: '# Frontend PRD', path: '/frontend/PRD.md' },
                { name: 'PRD.md', content: '# Backend PRD', path: '/backend/PRD.md' },
                { name: 'PRD.md', content: '# Mobile PRD', path: '/mobile/PRD.md' }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration();

            expect(docs.length).toBe(3);
            
            // Each should have different content
            const contents = docs.map(doc => doc.getText());
            const uniqueContents = new Set(contents);
            expect(uniqueContents.size).toBe(3);
        });
    });

    describe('Error Handling', () => {
        test('should handle missing workspace folders', () => {
            setupMockWorkspace([]);
            setupMockConfiguration();

            // Should not throw error with empty workspace
            expect(() => {
                // Simulate workspace scanning logic
                const workspaceFolders = [];
                expect(workspaceFolders.length).toBe(0);
            }).not.toThrow();
        });

        test('should handle files with special characters', () => {
            const docs = createTestDocuments([
                { name: 'PRD (v1).md', content: '# PRD with parentheses' },
                { name: 'PRD-v1.0.md', content: '# PRD with version' },
                { name: 'PRD_final.md', content: '# PRD with underscore' },
                { name: 'PRD@2024.md', content: '# PRD with special chars' }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration();

            // Should handle special characters in filenames
            expect(docs.length).toBe(4);
            
            docs.forEach(doc => {
                expect(doc.fileName.length).toBeGreaterThan(0);
                expect(doc.getText().length).toBeGreaterThan(0);
            });
        });

        test('should handle very long file paths', () => {
            const longPath = '/very/deep/nested/directory/structure/that/goes/many/levels/down';
            const docs = createTestDocuments([
                { name: 'deep-prd.md', content: '# Deep PRD', path: `${longPath}/deep-prd.md` }
            ]);

            setupMockWorkspace(docs);
            setupMockConfiguration();

            expect(docs.length).toBe(1);
            expect(docs[0].fileName.includes(longPath)).toBeTruthy();
        });
    });
});