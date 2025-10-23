import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { LSPClient } from './lsp/client';
import { ConfigManager } from './config';
import { FindingsProvider } from './views/findingsView';
import { DetailsPanel } from './webviews/detailsPanel';
import { registerCommands } from './commands/index';
import { EditorDecorationManager } from './editor/decorationManager';
import { ScanScheduler } from './scanning/scanScheduler';
import { ChangeTracker } from './scanning/changeTracker';
import { getLogger, LogCategory } from './utils/logger';

let client: LanguageClient | undefined;
let lspClientInstance: LSPClient | undefined;
let outputChannel: vscode.OutputChannel;
let findingsProvider: FindingsProvider;
let statusBarItem: vscode.StatusBarItem;
let decorationManager: EditorDecorationManager | undefined;
let scanScheduler: ScanScheduler | undefined;
let changeTracker: ChangeTracker | undefined;

export function getLSPClientInstance(): LSPClient | undefined {
    return lspClientInstance;
}

export function getScanSchedulerInstance(): ScanScheduler | undefined {
    return scanScheduler;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('Tameshi');
    outputChannel.appendLine('=== Tameshi Extension Activating ===');
    outputChannel.appendLine(`Time: ${new Date().toISOString()}`);
    outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
    outputChannel.appendLine(`VS Code version: ${vscode.version}`);
    outputChannel.show();

    getLogger().debug(LogCategory.UI, 'Extension activate() called');
    vscode.window.showInformationMessage('Tameshi extension is activating...');

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(shield) Tameshi: Initializing';
    statusBarItem.tooltip = 'Tameshi Security Scanner - Initializing...';
    statusBarItem.command = 'tameshi.scanWorkspace.client';
    statusBarItem.show();

    outputChannel.appendLine('Status bar registered with command: tameshi.scanWorkspace.client');

    findingsProvider = new FindingsProvider(context);
    const findingsTreeView = vscode.window.createTreeView('tameshi.findings', {
        treeDataProvider: findingsProvider,
        showCollapseAll: true
    });

    findingsProvider.setTreeView(findingsTreeView);

    decorationManager = new EditorDecorationManager(findingsProvider, context);
    outputChannel.appendLine('Editor decoration manager initialized');

    const commands = registerCommands(context, outputChannel, statusBarItem, findingsProvider);
    context.subscriptions.push(...commands);
    outputChannel.appendLine('Extension commands registered');

    lspClientInstance = new LSPClient(context, outputChannel, statusBarItem, findingsProvider);

    setImmediate(() => {
        outputChannel.appendLine('Starting LSP client in background...');

        const startTimeout = setTimeout(() => {
            outputChannel.appendLine('LSP client start timeout - continuing without LSP');
            statusBarItem.text = '$(warning) Tameshi: No LSP';
            statusBarItem.tooltip = 'Tameshi LSP server is not running';
            statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        }, 5000);

        lspClientInstance!.start()
            .then((startedClient) => {
                clearTimeout(startTimeout);
                client = startedClient;
                outputChannel.appendLine('LSP client started successfully');
                statusBarItem.text = '$(shield) Tameshi: Ready';
                statusBarItem.tooltip = 'Tameshi Security Scanner - Ready';
                statusBarItem.color = undefined;

                setTimeout(() => {
                    findingsProvider.loadFindings();
                }, 1000);
            })
            .catch((error) => {
                clearTimeout(startTimeout);
                outputChannel.appendLine(`LSP client failed to start: ${error}`);
                outputChannel.appendLine('Extension will continue without LSP support');

                statusBarItem.text = '$(warning) Tameshi: Server Error';
                statusBarItem.tooltip = 'Click to configure Tameshi LSP server path';
                statusBarItem.command = 'workbench.action.openSettings';
                statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
            });
    });

        const configChangeDisposable = ConfigManager.onConfigurationChanged(async () => {
            outputChannel.appendLine('Configuration changed, restarting LSP client...');
            if (lspClientInstance) {
                await lspClientInstance.stop();
                client = await lspClientInstance.start();
            }
        });

        changeTracker = new ChangeTracker(outputChannel);
        outputChannel.appendLine('Change tracker initialized');

        scanScheduler = new ScanScheduler(
            context,
            () => lspClientInstance?.getClient(),
            outputChannel,
            findingsProvider,
            changeTracker
        );
        outputChannel.appendLine('Scan scheduler initialized');

        context.subscriptions.push(
            vscode.workspace.onDidRenameFiles(e => {
                for (const file of e.files) {
                    changeTracker?.handleFileRename(file.oldUri.fsPath, file.newUri.fsPath);
                }
            }),
            vscode.workspace.onDidDeleteFiles(e => {
                for (const file of e.files) {
                    changeTracker?.handleFileDelete(file.fsPath);
                }
            })
        );

        context.subscriptions.push(
            outputChannel,
            statusBarItem,
            findingsTreeView,
            configChangeDisposable,
            scanScheduler,
            changeTracker
        );

        if (decorationManager) {
            context.subscriptions.push(decorationManager);
        }

    vscode.commands.executeCommand('setContext', 'tameshi.isActive', true);

    outputChannel.appendLine('=== Tameshi Extension Activated ===');

    return Promise.resolve();
}

export async function deactivate(): Promise<void> {
    outputChannel?.appendLine('Extension deactivating...');

    vscode.commands.executeCommand('setContext', 'tameshi.isActive', false);
    vscode.commands.executeCommand('setContext', 'tameshi.hasFindings', false);

    if (client) {
        await client.stop();
        client = undefined;
    }
}
