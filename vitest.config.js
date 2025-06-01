"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    test: {
        // Use Node.js environment since we're testing a VSCode extension
        environment: 'node',
        // Test files patterns
        include: ['src/test/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'out', 'dist'],
        // Setup files
        setupFiles: ['src/test/helpers/testHelpers.ts'],
        // Globals
        globals: true,
        // Coverage
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'out/',
                'dist/',
                'src/test/',
                '**/*.d.ts'
            ]
        },
        // Timeout for tests
        testTimeout: 10000,
        // Mock options
        mockReset: true,
        clearMocks: true,
        restoreMocks: true
    },
    resolve: {
        alias: {
            // Map VSCode module to our mock
            'vscode': (0, path_1.resolve)(__dirname, 'src/test/mocks/vscode.ts')
        }
    },
    // Define globals for TypeScript
    define: {
        global: 'globalThis'
    }
});
//# sourceMappingURL=vitest.config.js.map