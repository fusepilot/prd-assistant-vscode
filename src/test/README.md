# PRD Assistant Test Suite

This comprehensive test suite covers the core functionality of the PRD Assistant VSCode extension using Vitest as the test runner.

## Test Structure

### Test Fixtures (`fixtures/`)
The test suite includes realistic test fixtures representing different workspace scenarios:

- **`empty-workspace/`** - Empty workspace with no files
- **`single-prd/`** - Workspace with a single PRD file
- **`multiple-prds-root/`** - Multiple PRD files in the workspace root
- **`nested-prds/`** - PRD files nested in subdirectories at various depths
- **`mixed-workspace/`** - Workspace with both PRD and non-PRD files
- **`large-prd/`** - Large PRD file with many tasks for performance testing
- **`complex-hierarchy/`** - Complex nested task hierarchies
- **`naming-patterns/`** - Various file naming patterns (PRD.md, sample-prd.md, etc.)
- **`duplicate-ids/`** - Files with duplicate task IDs
- **`malformed-tasks/`** - Files with malformed tasks and various assignee formats
- **`different-assignees/`** - Various assignee format examples
- **`headers-only/`** - Files with headers but no tasks

### Test Infrastructure (`helpers/` and `mocks/`)

#### `mocks/vscode.ts`
Complete mock implementation of the VSCode API including:
- MockTextDocument with realistic text manipulation
- MockUri for file path handling
- MockWorkspaceEdit for edit operations
- MockEventEmitter for event handling
- Mock configurations and workspace management

#### `helpers/testHelpers.ts`
Comprehensive test utilities:
- Fixture loading and workspace setup
- Mock configuration management
- Test document creation utilities
- Assertion helpers for arrays and complex objects
- Performance testing utilities
- File system simulation

### Test Suites (`suite/`)

#### Core Functionality Tests

1. **`prdUtils.test.ts`** - PRD file detection and pattern matching
   - File pattern matching (case-insensitive)
   - Custom file patterns and additional files
   - Directory depth handling
   - Multi-root workspace support

2. **`taskParsing.test.ts`** - Task parsing and ID generation
   - Basic task parsing with various formats
   - Malformed checkbox handling
   - Nested task hierarchy parsing
   - Task ID generation (sequential/timestamp)
   - Header detection and association
   - Progress calculation

3. **`fileDetection.test.ts`** - Workspace scanning and file discovery
   - Various workspace configurations
   - Pattern matching across directory depths
   - Performance with large workspaces
   - Error handling for edge cases

4. **`treeView.test.ts`** - Tree view generation and management
   - Tree structure from single/multiple documents
   - Nested hierarchy representation
   - Task filtering (all/completed/uncompleted)
   - Tree updates and state management
   - Node types and collapsible states

5. **`taskOperations.test.ts`** - Task manipulation operations
   - Task toggling (complete/incomplete)
   - Assignment operations
   - Text modification while preserving structure
   - Task addition with proper indentation
   - Bulk operations
   - Error handling and concurrent edits

6. **`duplicateDetection.test.ts`** - Duplicate ID detection and fixing
   - Simple and complex duplicate scenarios
   - Cross-section and nested duplicates
   - Duplicate fixing while preserving structure
   - Edge cases and malformed tasks

7. **`integration.test.ts`** - End-to-end workflow testing
   - Complete task lifecycle
   - Multi-document workflows
   - Fixture-based comprehensive testing
   - Performance testing with large datasets
   - Error handling and recovery

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Compile Tests Only
```bash
npm run pretest
```

## Test Configuration

The test suite uses:
- **Vitest** for the test runner with Node.js environment
- **TypeScript** with strict type checking
- **Custom mock framework** for VSCode API simulation
- **V8 coverage provider** for code coverage reporting

### Key Configuration Files
- `vitest.config.ts` - Main test configuration with VSCode mock mapping
- `package.json` - Test scripts and dependencies
- `tsconfig.json` - TypeScript configuration including test files
- `src/test/extension.test.ts` - Main test entry point

## Writing New Tests

### Adding Test Fixtures
1. Create a new directory under `src/test/fixtures/`
2. Add markdown files representing the scenario
3. Use the fixture in tests via `loadTestFixture('fixture-name')`

### Creating Unit Tests
```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { setupMockConfiguration, resetMocks, createMockTextDocument } from '../helpers/testHelpers';

describe('My Feature Tests', () => {
    beforeEach(() => {
        resetMocks();
        setupMockConfiguration();
    });

    test('should handle basic scenario', () => {
        const doc = createMockTextDocument('/test/PRD.md', '# Test content');
        // Your test logic here
    });
});
```

### Mock Configuration
```typescript
setupMockConfiguration({
    autoGenerateIds: true,
    taskFilter: 'all',
    filePatterns: ['*prd*.md'],
    // ... other settings
});
```

### Testing with Fixtures
```typescript
const fixture = await loadTestFixture('single-prd');
const doc = fixture.workspace.documents[0];
// Test with realistic fixture data
```

## Test Coverage Areas

### Functional Coverage
- ✅ Task parsing and ID generation
- ✅ File detection and workspace scanning  
- ✅ Tree view generation and updates
- ✅ Task operations (toggle, assign, edit)
- ✅ Duplicate detection and fixing
- ✅ Progress calculation and reporting
- ✅ Configuration handling
- ✅ Error handling and edge cases

### Scenario Coverage
- ✅ Empty workspaces
- ✅ Single and multiple PRD files
- ✅ Nested directory structures
- ✅ Large files and datasets
- ✅ Malformed content
- ✅ Various naming patterns
- ✅ Multi-root workspaces
- ✅ Complex hierarchies
- ✅ Performance edge cases

### Integration Coverage
- ✅ End-to-end workflows
- ✅ Component interaction
- ✅ State management
- ✅ Event handling
- ✅ Error recovery

## Performance Testing

The test suite includes performance benchmarks for:
- Large file parsing (>50 tasks)
- Multi-document processing (5+ documents)
- Deep nesting (10+ levels)
- Rapid updates and changes

Performance targets:
- Parse 100 tasks: < 100ms
- Process 5 large documents: < 5 seconds
- Handle 10-level nesting: No stack overflow
- Tree generation: < 500ms for typical workspace

## Debugging Tests

### VSCode Test Runner
1. Open the extension project in VSCode
2. Press `F5` to launch Extension Development Host
3. Use Command Palette: "Test: Run All Tests"

### Debug Specific Test
1. Set breakpoints in test files
2. Use Vitest UI for interactive debugging: `npm run test:ui`
3. Or use VSCode's built-in test debugging with Vitest extension

### Mock Debugging
- Use `console.log` in mock implementations
- Vitest provides built-in spy functionality for mock inspection
- Use Vitest's snapshot testing for complex object comparisons

## Common Issues and Solutions

### Test Isolation
- Always call `resetMocks()` in `beforeEach()`
- Don't rely on test execution order
- Vitest automatically clears mocks between tests with `clearMocks: true`

### Async Testing
- Use `async/await` for async operations
- Ensure all promises are awaited
- Set appropriate timeouts for long operations

### Mock Synchronization
- Ensure mocks match actual VSCode API signatures
- Update mocks when VSCode API changes
- Test both success and error paths

### Fixture Management
- Keep fixtures focused and minimal
- Document fixture purpose and structure
- Update fixtures when file format changes

## Contributing

When adding new features:
1. Add corresponding test fixtures if needed
2. Write unit tests for new functionality
3. Update integration tests for workflow changes
4. Ensure performance benchmarks still pass
5. Update this README with new test information

## Test Metrics

Current test coverage:
- Test Files: 7 suites + integration
- Test Cases: 100+ individual tests
- Fixtures: 12 realistic scenarios
- Mock Components: Complete VSCode API simulation
- Performance Tests: Large dataset handling

The test suite ensures the PRD Assistant extension works reliably across all supported scenarios and provides confidence for refactoring and feature additions.