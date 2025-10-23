/**
 * E2E Test Suite Entry Point
 * Configures and runs all end-to-end tests
 */

import * as path from 'path';
const Mocha = require('mocha');
import * as fs from 'fs';

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 60000, // 60 second timeout for E2E tests
        reporter: 'spec'
    });

    const testsRoot = __dirname;

    return new Promise((resolve, reject) => {
        try {
            console.log('🧪 Initializing E2E Test Suite...');
            console.log('Tests root:', testsRoot);

            // Find all test files
            const testFiles = findTestFiles(testsRoot);
            console.log('Found test files:', testFiles.map(f => path.relative(testsRoot, f)));

            // Add files to the test suite
            testFiles.forEach((f: string) => {
                console.log('Adding test file:', path.relative(testsRoot, f));
                mocha.addFile(f);
            });

            console.log(`\n📊 Test Suite Summary:`);
            console.log(`- Total test files: ${testFiles.length}`);
            console.log(`- Timeout: ${mocha.timeout()}ms`);
            console.log(`- Reporter: ${mocha.reporter()}`);

            console.log('\n🏃 Running E2E Tests...');
            console.log('-'.repeat(50));

            // Run the mocha test
            mocha.run((failures: number) => {
                console.log('\n' + '='.repeat(50));
                if (failures > 0) {
                    console.log(`❌ ${failures} test(s) failed`);
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    console.log('✅ All E2E tests passed!');
                    resolve();
                }
            });
        } catch (err) {
            console.error('❌ Error setting up E2E tests:', err);
            reject(err);
        }
    });
}

function findTestFiles(dir: string): string[] {
    const testFiles: string[] = [];
    
    try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && file !== 'node_modules') {
                testFiles.push(...findTestFiles(fullPath));
            } else if (file.endsWith('.test.js')) {
                testFiles.push(fullPath);
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
    }
    
    return testFiles;
}