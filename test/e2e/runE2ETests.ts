/**
 * E2E Test Runner for Tameshi VS Code Extension
 * Runs both LSP server tests and extension integration tests
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        console.log('🚀 Starting Tameshi E2E Tests...');
        console.log('='.repeat(50));

        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        console.log('Extension path:', extensionDevelopmentPath);

        // The path to test runner
        const extensionTestsPath = path.resolve(__dirname, './');
        console.log('Tests path:', extensionTestsPath);

        // Test workspace path
        const testWorkspace = path.resolve(__dirname, '../../test-workspace');
        console.log('Test workspace:', testWorkspace);

        console.log('\n📋 Test Configuration:');
        console.log('- Extension Development Path:', extensionDevelopmentPath);
        console.log('- Extension Tests Path:', extensionTestsPath);
        console.log('- Test Workspace:', testWorkspace);
        console.log('- LSP Server Path: ../tameshi-lsp/target/debug/tameshi-lsp');

        console.log('\n🔧 Running E2E Tests...');
        
        // Download VS Code, unzip it and run the integration test
        const result = await runTests({ 
            extensionDevelopmentPath, 
            extensionTestsPath,
            launchArgs: [
                testWorkspace,
                '--disable-extensions', // Disable other extensions for clean test environment
                '--user-data-dir', path.join(__dirname, '../../.vscode-test/user-data'),
                '--disable-workspace-trust' // Disable workspace trust for tests
            ]
        });

        console.log('\n✅ E2E Tests completed successfully!');
        console.log('Test result code:', result);

    } catch (err) {
        console.error('\n❌ E2E Tests failed!');
        console.error('Error:', err);
        process.exit(1);
    }
}

// Check if this file is being run directly
if (require.main === module) {
    main();
}