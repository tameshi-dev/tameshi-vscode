import * as path from 'path';
import * as fs from 'fs';

export function run(): Promise<void> {
    // Create the mocha test
    const Mocha = require('mocha');
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    const testsRoot = __dirname;

    return new Promise((c, e) => {
        try {
            // Simple file discovery - look for .test.js files
            const testFiles = findTestFiles(testsRoot);
            
            // Add files to the test suite
            testFiles.forEach((f: string) => mocha.addFile(f));

            // Run the mocha test
            mocha.run((failures: number) => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            console.error(err);
            e(err);
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
            
            if (stat.isDirectory()) {
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