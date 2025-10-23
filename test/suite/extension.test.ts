// Integration test for VS Code extension
// This file uses Mocha syntax as required by VS Code test runner

import * as assert from 'assert';
import * as vscode from 'vscode';

// Note: This test file is for VS Code integration testing
// Unit tests are in separate Jest test files

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('GianlucaBrigandi.tameshi-vscode'));
    });

    test('VS Code API should be available', () => {
        assert.ok(vscode.window);
        assert.ok(vscode.workspace);
        assert.ok(vscode.commands);
    });
});