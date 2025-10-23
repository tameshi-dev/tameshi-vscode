import * as vscode from 'vscode';
import * as path from 'path';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { ConfigManager } from '../config';
import { FindingsProvider } from '../views/findingsView';
import { FindingDetailsService } from '../services/findingDetailsService';
import { BinaryFinder } from '../services/binaryFinder';
import { Downloader } from '../services/downloader';
import { ScanProgressParams, FindingsUpdatedParams } from './protocol';

export class LSPClient {
    private client: LanguageClient | undefined;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private findingsProvider: FindingsProvider;
    private refreshTimeout: NodeJS.Timeout | undefined;
    private detailsService: FindingDetailsService;
    private binaryFinder: BinaryFinder;
    private downloader: Downloader;

    constructor(
        context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel,
        statusBarItem: vscode.StatusBarItem,
        findingsProvider: FindingsProvider
    ) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.statusBarItem = statusBarItem;
        this.findingsProvider = findingsProvider;
        this.binaryFinder = new BinaryFinder(context);
        this.downloader = new Downloader(context);

        const config = ConfigManager.getConfiguration();
        const cacheTimeout = config.details?.cacheTimeout || 600000;
        this.detailsService = new FindingDetailsService(100, cacheTimeout);
    }

    public async start(): Promise<LanguageClient> {
        if (this.client) {
            await this.client.stop();
        }

        const config = ConfigManager.getConfiguration();
        const serverPath = await this.getServerPath();

        if (!serverPath) {
            this.outputChannel.appendLine('Tameshi LSP server not found');
            this.outputChannel.appendLine('Please install tameshi-lsp or configure the path in settings');
            this.outputChannel.appendLine('Configuration: tameshi.server.path');

            setTimeout(() => {
                vscode.window.showInformationMessage(
                    'Tameshi LSP server not found. Please configure the server path in settings.',
                    'Open Settings', 'Dismiss'
                ).then(choice => {
                    if (choice === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'tameshi.server.path');
                    }
                });
            }, 2000);

            throw new Error('Tameshi LSP server not found');
        }

        this.outputChannel.appendLine(`Starting Tameshi LSP server from: ${serverPath}`);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const serverOptions: ServerOptions = {
            run: {
                command: serverPath,
                args: ['--stdio', ...config.server.args],
                transport: TransportKind.stdio,
                options: {
                    cwd: workspaceFolder,
                    env: {
                        ...process.env,
                        ...config.server.env,
                        RUST_LOG: 'debug'
                    }
                }
            },
            debug: {
                command: serverPath,
                args: ['--stdio', '--debug', ...config.server.args],
                transport: TransportKind.stdio,
                options: {
                    cwd: workspaceFolder,
                    env: {
                        ...process.env,
                        ...config.server.env,
                        TAMESHI_LOG_LEVEL: 'debug'
                    }
                }
            }
        };

        const initOptions = ConfigManager.getInitializationOptions();
        this.outputChannel.appendLine(`[CLIENT] Initialization options: ${JSON.stringify(initOptions, null, 2)}`);

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'solidity' }
            ],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sol')
            },
            outputChannel: this.outputChannel,
            initializationOptions: initOptions,
            workspaceFolder: vscode.workspace.workspaceFolders?.[0],

            diagnosticCollectionName: 'tameshi',

            middleware: {
                handleDiagnostics: (uri, diagnostics, next) => {
                    this.handleDiagnostics(uri, diagnostics);
                    next(uri, diagnostics);
                }
            }
        };

        this.client = new LanguageClient(
            'tameshi-lsp',
            'Tameshi Security Scanner',
            serverOptions,
            clientOptions
        );

        this.client.onDidChangeState(event => {
            this.outputChannel.appendLine(`[STATE] LSP state change: ${event.oldState} -> ${event.newState}`);

            if (event.newState === 1) {
                this.outputChannel.appendLine('[STATE] Setting status to Ready');
                this.statusBarItem.text = '$(shield) Tameshi: Ready';
                this.statusBarItem.color = undefined;
            } else if (event.newState === 3) {
                this.outputChannel.appendLine('[STATE] Setting status to Stopped');
                this.statusBarItem.text = '$(shield) Tameshi: Stopped';
                this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            } else if (event.newState === 2) {
                this.outputChannel.appendLine('[STATE] LSP is starting...');
                this.statusBarItem.text = '$(sync~spin) Tameshi: Starting...';
                this.statusBarItem.color = undefined;
            } else {
                this.outputChannel.appendLine(`[STATE] Unknown state: ${event.newState}`);
            }
        });

        try {
            await this.client.start();

            this.detailsService.setLSPClient(this.client);

            this.client.onNotification('tameshi/scanProgress', (params: ScanProgressParams) => {
                this.handleScanProgress(params);
            });

            this.client.onNotification('tameshi/scanComplete', (params: ScanProgressParams) => {
                this.handleScanComplete(params);
            });

            this.client.onNotification('tameshi/findingsUpdated', (params: FindingsUpdatedParams) => {
                this.handleFindingsUpdated(params);
            });

            this.outputChannel.appendLine('[STATE] Tameshi LSP server started successfully');
            this.outputChannel.appendLine(`[STATE] Client state after start: ${this.client.state}`);

            this.statusBarItem.text = '$(shield) Tameshi: Ready';
            this.statusBarItem.color = undefined;

            return this.client;
        } catch (error) {
            this.outputChannel.appendLine(`Failed to start LSP server: ${error}`);
            this.statusBarItem.text = '$(shield) Tameshi: Error';
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
            
            vscode.window.showErrorMessage(
                'Failed to start Tameshi LSP server. Check output for details.',
                'Show Output', 'Check Settings', 'Restart'
            ).then(choice => {
                if (choice === 'Show Output') {
                    this.outputChannel.show();
                } else if (choice === 'Check Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'tameshi');
                } else if (choice === 'Restart') {
                    vscode.commands.executeCommand('tameshi.restart');
                }
            });
            
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (this.client) {
            await this.client.stop();
            this.client = undefined;
        }
        this.statusBarItem.text = '$(shield) Tameshi: Idle';
        this.statusBarItem.color = undefined;
    }

    public getClient(): LanguageClient | undefined {
        return this.client;
    }

    public getDetailsService(): FindingDetailsService {
        return this.detailsService;
    }

    private async getServerPath(): Promise<string | undefined> {
        this.outputChannel.appendLine('Looking for Tameshi LSP server binary...');
        const location = await this.binaryFinder.find();

        if (location) {
            this.outputChannel.appendLine(`Found binary from ${location.source}: ${location.path}`);
            return location.path;
        }

        this.outputChannel.appendLine('No binary found, prompting user...');

        const action = await vscode.window.showInformationMessage(
            'Tameshi LSP server not found. Would you like to download it?',
            'Download',
            'Cancel'
        );

        this.outputChannel.appendLine(`User selected: ${action || 'Cancel'}`);

        if (action === 'Download') {
            this.outputChannel.appendLine('Starting download...');
            const downloadedPath = await this.downloader.downloadLatestBinary();
            if (downloadedPath) {
                this.outputChannel.appendLine(`Downloaded to: ${downloadedPath}`);
                return downloadedPath;
            } else {
                this.outputChannel.appendLine('Download failed or was cancelled');
            }
        }

        this.outputChannel.appendLine('Server binary not found and download cancelled or failed');
        return undefined;
    }

    private handleScanProgress(params: ScanProgressParams): void {
        const { message, percentage } = params;
        this.statusBarItem.text = `$(shield) Tameshi: ${message}`;

        if (percentage !== undefined) {
            this.statusBarItem.text += ` (${percentage}%)`;
        }
    }

    private handleScanComplete(params: ScanProgressParams): void {
        const message = params.message;
        const success = true;
        const findingsCount = 0;

        if (success) {
            this.statusBarItem.text = `$(shield) Tameshi: ${findingsCount || 0} findings`;
            this.statusBarItem.color = findingsCount > 0 ?
                new vscode.ThemeColor('statusBarItem.warningForeground') :
                undefined;

            this.outputChannel.appendLine('[CLIENT] Scan complete - waiting for findingsUpdated notification');

            vscode.commands.executeCommand('setContext', 'tameshi.hasFindings', (findingsCount || 0) > 0);
        } else {
            this.statusBarItem.text = '$(shield) Tameshi: Scan failed';
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');

            if (message) {
                vscode.window.showErrorMessage(`Scan failed: ${message}`);
            }
        }
    }

    private handleFindingsUpdated(params: FindingsUpdatedParams): void {
        const { files, versions, scanEpoch, scanType } = params;

        this.outputChannel.appendLine(`[CLIENT] Received findingsUpdated notification - epoch: ${scanEpoch}, files: ${files?.length || 0}, scanType: ${scanType || 'unknown'}`);

        if (versions) {
            for (const [uri, version] of Object.entries(versions)) {
                this.outputChannel.appendLine(`  - ${uri}: version ${version}`);
            }
        }

        if (files && files.length > 0) {
            const { getScanSchedulerInstance } = require('../extension');
            const scheduler = getScanSchedulerInstance();

            if (scheduler) {
                const filePaths = files.map((uri: string) => vscode.Uri.parse(uri).fsPath);

                const effectiveScanType = scanType || this.inferScanType(params);

                scheduler.updateAIScanState(filePaths, effectiveScanType);
            }
        }

        this.detailsService.invalidateCache();

        if (scanEpoch !== undefined) {
            this.findingsProvider.loadFindingsWithEpoch(scanEpoch);
        } else {
            this.outputChannel.appendLine('[CLIENT] WARNING: Received findingsUpdated without scanEpoch');
            this.findingsProvider.loadFindings();
        }

        const hasFindings = (params.count ?? 0) > 0;
        vscode.commands.executeCommand('setContext', 'tameshi.hasFindings', hasFindings);
    }

    /**
     * Infer scan type from findings data
     * Returns 'ai' if any AI findings are present, 'deterministic' otherwise
     */
    private inferScanType(params: FindingsUpdatedParams): 'deterministic' | 'ai' | 'hybrid' | undefined {
        return undefined;
    }

    private handleDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
        this.outputChannel.appendLine(`Received ${diagnostics.length} diagnostics for ${uri.fsPath}`);

        const findingIds = diagnostics
            .map(d => {
                const diagWithData = d as vscode.Diagnostic & { data?: { finding_id?: string } };
                return diagWithData.data?.finding_id;
            })
            .filter((id): id is string => id !== undefined);

        this.outputChannel.appendLine(`Diagnostics contain ${findingIds.length} Tameshi findings`);

        const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warningCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;

        if (errorCount > 0) {
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        } else if (warningCount > 0) {
            this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        } else {
            this.statusBarItem.color = undefined;
        }

        this.outputChannel.appendLine('[CLIENT] Diagnostics received - waiting for findingsUpdated notification');

        diagnostics.forEach((diag, index) => {
            if (diag.source === 'tameshi') {
                this.outputChannel.appendLine(`  [${index}] ${diag.message} (${diag.code}) at line ${diag.range.start.line + 1}`);
            }
        });
    }
}