import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Tameshi Extension Integration E2E Tests', function(this: Mocha.Suite) {
    this.timeout(60000);

    test('should activate Tameshi extension', async function() {
        const extension = vscode.extensions.getExtension('tameshi.tameshi-vscode');
        assert.ok(extension, 'Tameshi extension should be installed');

        if (!extension.isActive) {
            await extension.activate();
        }

        assert.ok(extension.isActive, 'Extension should be active');
    });

    test('should register Tameshi commands', async function() {
        const commands = await vscode.commands.getCommands();
        const tameshiCommands = commands.filter(cmd => cmd.startsWith('tameshi.'));

        const expectedCommands = [
            'tameshi.scanWorkspace',
            'tameshi.scanFile',
            'tameshi.refreshResults',
            'tameshi.exportReport',
            'tameshi.openFindingDetails'
        ];

        for (const expectedCmd of expectedCommands) {
            assert.ok(
                tameshiCommands.includes(expectedCmd),
                `Command ${expectedCmd} should be registered`
            );
        }
    });

    test('should handle configuration changes', async function() {
        const config = vscode.workspace.getConfiguration('tameshi');
        const originalValue = config.get('scan.onSave');

        await config.update('scan.onSave', 'workspace', vscode.ConfigurationTarget.Workspace);
        const updatedValue = config.get('scan.onSave');

        assert.strictEqual(updatedValue, 'workspace', 'Configuration should be updated');

        // Restore original value
        await config.update('scan.onSave', originalValue, vscode.ConfigurationTarget.Workspace);
    });
});
