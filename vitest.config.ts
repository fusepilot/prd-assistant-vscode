import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
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
      'vscode': resolve(__dirname, 'src/test/mocks/vscode.ts')
    }
  },
  
  // Define globals for TypeScript
  define: {
    global: 'globalThis'
  }
});