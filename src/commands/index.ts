import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { LSPClient } from '../lsp/client';
import { FindingsProvider } from '../views/findingsView';
import { DetailsPanel } from '../webviews/detailsPanel';
import { getLSPClientInstance } from '../extension';

const UI_CONSTANTS = {
    TREE_VIEW_RENDER_DELAY_MS: 100
} as const;

export function registerCommands(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    statusBarItem: vscode.StatusBarItem,
    findingsProvider: FindingsProvider
): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];


    const scanWorkspace = vscode.commands.registerCommand('tameshi.scanWorkspace.client', async () => {
        outputChannel.appendLine('[CLIENT] Scan Workspace command invoked');
        outputChannel.show();

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            outputChannel.appendLine('[CLIENT] ERROR: LSP server not running');
            return;
        }

        try {
            findingsProvider.setScanning('deterministic', true);
            statusBarItem.text = '$(sync~spin) Tameshi: Scanning...';
            outputChannel.appendLine('[CLIENT] Sending workspace/executeCommand to LSP...');

            const result = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.scanWorkspace',
                arguments: []
            });

            outputChannel.appendLine(`[CLIENT] Scan result: ${JSON.stringify(result)}`);
            statusBarItem.text = '$(shield) Tameshi: Ready';
            vscode.window.showInformationMessage('Workspace scan completed');

            await findingsProvider.loadFindings();

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[CLIENT] Scan failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`Workspace scan failed: ${errorMessage}`);
            statusBarItem.text = '$(shield) Tameshi: Error';
        } finally {
            findingsProvider.setScanning('deterministic', false);
        }
    });

    const scanFile = vscode.commands.registerCommand('tameshi.scanFile.client', async (uri?: vscode.Uri) => {
        const fileUri = uri || vscode.window.activeTextEditor?.document.uri;

        if (!fileUri) {
            vscode.window.showErrorMessage('No file selected to scan');
            return;
        }

        outputChannel.appendLine(`[CLIENT] Scan File command invoked for: ${fileUri.toString()}`);
        outputChannel.show();

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            outputChannel.appendLine('[CLIENT] ERROR: LSP server not running');
            return;
        }

        try {
            statusBarItem.text = '$(sync~spin) Tameshi: Scanning file...';
            outputChannel.appendLine(`[CLIENT] Sending workspace/executeCommand with URI: ${fileUri.toString()}`);

            const result = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.scanFile',
                arguments: [fileUri.toString()]
            });

            outputChannel.appendLine(`[CLIENT] File scan result: ${JSON.stringify(result)}`);
            statusBarItem.text = '$(shield) Tameshi: Ready';
            vscode.window.showInformationMessage('File scan completed');

            await findingsProvider.loadFindings();

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[CLIENT] File scan failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`File scan failed: ${errorMessage}`);
            statusBarItem.text = '$(shield) Tameshi: Error';
        }
    });

    const restart = vscode.commands.registerCommand('tameshi.restart', async () => {
        outputChannel.appendLine('Command: Restart Language Server');

        try {
            const lspClientInstance = getLSPClientInstance();
            if (lspClientInstance) {
                await lspClientInstance.stop();
                await lspClientInstance.start();
                vscode.window.showInformationMessage('Tameshi LSP server restarted');
            } else {
                vscode.window.showErrorMessage('LSP client not found');
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`Restart failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`Restart failed: ${errorMessage}`);
        }
    });

    const openFindingDetails = vscode.commands.registerCommand('tameshi.openFindingDetails', async (finding?: unknown) => {
        outputChannel.appendLine('Command: Open Finding Details');
        outputChannel.appendLine(`Received finding argument: ${JSON.stringify(finding)}`);

        if (!finding) {
            vscode.window.showErrorMessage('No finding selected');
            outputChannel.appendLine('ERROR: No finding argument provided to command');
            return;
        }

        try {
            DetailsPanel.createOrShow(context.extensionUri, finding as import('../views/findingsView').Finding);
            outputChannel.appendLine('Details panel opened successfully');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`Failed to open finding details: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to open finding details: ${errorMessage}`);
        }
    });

    const clearFindings = vscode.commands.registerCommand('tameshi.clearFindings', async () => {
        outputChannel.appendLine('Command: Clear Findings');
        await findingsProvider.updateFindings([]);
        vscode.window.showInformationMessage('Findings cleared');
    });

    const llmScanFile = vscode.commands.registerCommand('tameshi.llmScanFile', async (uri?: vscode.Uri) => {
        const fileUri = uri || vscode.window.activeTextEditor?.document.uri;

        if (!fileUri) {
            vscode.window.showErrorMessage('No file selected for LLM scan');
            return;
        }

        outputChannel.appendLine(`[CLIENT] LLM Scan File command invoked for: ${fileUri.toString()}`);
        outputChannel.show();

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            outputChannel.appendLine('[CLIENT] ERROR: LSP server not running');
            return;
        }

        try {
            statusBarItem.text = '$(sync~spin) Tameshi: Running LLM scan...';
            outputChannel.appendLine(`[CLIENT] Sending LLM scan command for: ${fileUri.toString()}`);

            const result = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.llmScanFile',
                arguments: [fileUri.toString()]
            });

            outputChannel.appendLine(`[CLIENT] LLM scan result: ${JSON.stringify(result)}`);
            statusBarItem.text = '$(shield) Tameshi: Ready';

            if (typeof result === 'object' && result !== null) {
                if ('success' in result && result.success === false) {
                    const message = 'message' in result && typeof result.message === 'string' ? result.message : 'Unknown error';
                    vscode.window.showErrorMessage(`LLM scan failed: ${message}`);
                } else {
                    vscode.window.showInformationMessage('LLM scan completed');
                    await findingsProvider.loadFindings();
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[CLIENT] LLM scan failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`LLM scan failed: ${errorMessage}`);
            statusBarItem.text = '$(shield) Tameshi: Error';
        }
    });

    const scanWorkspaceAll = vscode.commands.registerCommand('tameshi.scanWorkspace.all', async () => {
        outputChannel.appendLine('[CLIENT] Run All Scans command invoked');
        outputChannel.show();

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            outputChannel.appendLine('[CLIENT] ERROR: LSP server not running');
            return;
        }

        try {
            findingsProvider.setScanning('all', true);

            statusBarItem.text = '$(sync~spin) Tameshi: Running deterministic scan...';
            outputChannel.appendLine('[CLIENT] Starting deterministic scan...');

            const deterministicResult = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.scanWorkspace',
                arguments: []
            });

            outputChannel.appendLine(`[CLIENT] Deterministic scan result: ${JSON.stringify(deterministicResult)}`);

            statusBarItem.text = '$(sync~spin) Tameshi: Running LLM scan...';
            outputChannel.appendLine('[CLIENT] Starting LLM scan...');

            const llmResult = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.llmScanWorkspace',
                arguments: []
            });

            outputChannel.appendLine(`[CLIENT] LLM scan result: ${JSON.stringify(llmResult)}`);
            statusBarItem.text = '$(shield) Tameshi: Ready';

            vscode.window.showInformationMessage('All scans completed (Deterministic + AI Lab)');

            await findingsProvider.loadFindings();

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[CLIENT] Scan failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`Scan failed: ${errorMessage}`);
            statusBarItem.text = '$(shield) Tameshi: Error';
        } finally {
            findingsProvider.setScanning('all', false);
        }
    });

    const llmScanWorkspaceHandler = async () => {
        outputChannel.appendLine('[CLIENT] LLM Scan Workspace command invoked');
        outputChannel.show();

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            outputChannel.appendLine('[CLIENT] ERROR: LSP server not running');
            return;
        }

        try {
            findingsProvider.setScanning('llm', true);
            statusBarItem.text = '$(sync~spin) Tameshi: Running LLM workspace scan...';
            outputChannel.appendLine('[CLIENT] Sending LLM workspace scan command...');

            const result = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.llmScanWorkspace',
                arguments: []
            });

            outputChannel.appendLine(`[CLIENT] LLM workspace scan result: ${JSON.stringify(result)}`);
            statusBarItem.text = '$(shield) Tameshi: Ready';

            if (typeof result === 'object' && result !== null) {
                if ('success' in result && result.success === false) {
                    const message = 'message' in result && typeof result.message === 'string' ? result.message : 'Unknown error';
                    vscode.window.showErrorMessage(`LLM workspace scan failed: ${message}`);
                } else {
                    vscode.window.showInformationMessage('LLM workspace scan completed');
                    await findingsProvider.loadFindings();
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[CLIENT] LLM workspace scan failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`LLM workspace scan failed: ${errorMessage}`);
            statusBarItem.text = '$(shield) Tameshi: Error';
        } finally {
            findingsProvider.setScanning('llm', false);
        }
    };

    const llmScanWorkspace = vscode.commands.registerCommand('tameshi.llmScanWorkspace', llmScanWorkspaceHandler);
    const llmScanWorkspaceAlias = vscode.commands.registerCommand('tameshi.scanWorkspace.llm', llmScanWorkspaceHandler);

    const showInFindings = vscode.commands.registerCommand('tameshi.showInFindings', async (finding?: unknown) => {
        outputChannel.appendLine('Command: Show in Findings');

        if (!finding || typeof finding !== 'object' || !('id' in finding)) {
            vscode.window.showErrorMessage('No finding provided');
            return;
        }

        try {
            await vscode.commands.executeCommand('workbench.view.extension.tameshi');

            await new Promise(resolve => setTimeout(resolve, UI_CONSTANTS.TREE_VIEW_RENDER_DELAY_MS));

            await findingsProvider.revealFinding((finding as { id: string }).id);

            outputChannel.appendLine(`Revealed finding in tree: ${(finding as { id: string }).id}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`Failed to show finding in tree: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to show finding: ${errorMessage}`);
        }
    });

    const exportSarifToWorkspace = vscode.commands.registerCommand('tameshi.exportReport.sarif', async () => {
        outputChannel.appendLine('Command: Export SARIF to Workspace');

        const lspClient = getLSPClient(context);
        if (!lspClient) {
            vscode.window.showErrorMessage('Tameshi LSP server is not running');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
            const filename = `tameshi-report-${timestamp}.sarif`;
            const outputPath = vscode.Uri.joinPath(workspaceFolder.uri, filename).fsPath;

            const exportRequest: {
                format: string;
                output_path: string;
                scope: { type: string };
                pretty: boolean;
            } = {
                format: 'sarif',
                output_path: outputPath,
                scope: { type: 'workspace' },
                pretty: true
            };

            outputChannel.appendLine(`Exporting SARIF report to: ${outputPath}`);

            const result = await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.exportReport',
                arguments: [exportRequest]
            });

            if (typeof result === 'object' && result !== null) {
                if ('output_path' in result && 'findings_count' in result && 'file_size' in result) {
                    const findingsCount = result.findings_count as number;
                    const fileSize = result.file_size as number;
                    const fileSizeKB = (fileSize / 1024).toFixed(2);

                    vscode.window.showInformationMessage(
                        `Exported ${findingsCount} findings (${fileSizeKB} KB) to ${filename}`,
                        'Open File'
                    ).then(selection => {
                        if (selection === 'Open File') {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputPath));
                        }
                    });
                    outputChannel.appendLine(`Successfully exported ${findingsCount} findings to ${filename}`);
                } else if ('success' in result && result.success === false) {
                    const message = 'message' in result && typeof result.message === 'string' ? result.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Export failed: ${message}`);
                    outputChannel.appendLine(`Export failed: ${message}`);
                }
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`Export failed: ${errorMessage}`);
            vscode.window.showErrorMessage(`Export failed: ${errorMessage}`);
        }
    });

    commands.push(
        scanWorkspace,
        scanFile,
        restart,
        openFindingDetails,
        clearFindings,
        llmScanFile,
        llmScanWorkspace,
        llmScanWorkspaceAlias,
        scanWorkspaceAll,
        showInFindings,
        exportSarifToWorkspace
    );

    return commands;
}

function getLSPClient(context: vscode.ExtensionContext): LanguageClient | undefined {
    const lspClientInstance = getLSPClientInstance();
    return lspClientInstance?.getClient();
}