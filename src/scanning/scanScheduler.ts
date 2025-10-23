import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ConfigManager } from '../config';
import { LanguageClient } from 'vscode-languageclient/node';
import { FindingsProvider } from '../views/findingsView';
import { ChangeTracker } from './changeTracker';
import { Finding, ExtendedFinding, getScannerType } from '../types';

interface ScanOptions {
    scope: 'file' | 'workspace' | 'changed-files';
    files?: string[];
    reason?: string;
}

interface AIRescanStats {
    triggered: number;
    deduplicated: number;
    batched: number;
    avoided: number;
    lastTriggerTime?: number;
}

const TIMING_CONSTANTS = {
    DEFAULT_IDLE_THRESHOLD_MS: 30000,
    SAVE_DEBOUNCE_MS: 1500,
    WORKSPACE_SETTLE_MS: 3000,
    LSP_CLIENT_MAX_WAIT_MS: 30000,
    LSP_CLIENT_RETRY_MS: 1000,
    LSP_SAVE_PROCESS_DELAY_MS: 500,
    MS_PER_SECOND: 1000,
    SECONDS_PER_MINUTE: 60,
    MINUTES_PER_HOUR: 60
} as const;

export class ScanScheduler implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    private lastScannedHash: Map<string, string> = new Map();

    private pendingScans: Map<string, { hash: string; epoch: number }> = new Map();
    private epochByFile: Map<string, number> = new Map();

    private saveTimers: Map<string, NodeJS.Timeout> = new Map();

    private idleTimer: NodeJS.Timeout | undefined;
    private idleThresholdMs: number = TIMING_CONSTANTS.DEFAULT_IDLE_THRESHOLD_MS;

    private lastWorkspaceScan: number = 0;

    private lastAIScanVersion: Map<string, number> = new Map();
    private lastAIScanHash: Map<string, string> = new Map();
    private lastAIScanTimestamp: Map<string, number> = new Map();
    private lastScannedTimestamp: Map<string, number> = new Map();
    private pendingAIRescans: Set<string> = new Set();
    private aiBatchTimer: NodeJS.Timeout | undefined;
    private inflightAIScans: Map<string, vscode.CancellationTokenSource> = new Map();
    private aiRescanStats: AIRescanStats = {
        triggered: 0,
        deduplicated: 0,
        batched: 0,
        avoided: 0
    };

    constructor(
        private context: vscode.ExtensionContext,
        private getLSPClient: () => LanguageClient | undefined,
        outputChannel: vscode.OutputChannel,
        private findingsProvider: FindingsProvider,
        private changeTracker: ChangeTracker
    ) {
        this.outputChannel = outputChannel;
        this.setupListeners();
        this.setupScanCompletionHandler();
        this.checkWorkspaceOpenScan();
    }

    /**
     * Setup handler for scan completion
     * Monitors diagnostics to detect when scan completes
     * Note: We no longer load findings here - the server sends findingsUpdated notification
     */
    private setupScanCompletionHandler(): void {
        vscode.languages.onDidChangeDiagnostics(event => {
            for (const uri of event.uris) {
                const filePath = uri.fsPath;
                const pending = this.pendingScans.get(filePath);

                if (!pending) {
                    continue;
                }

                const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
                if (document) {
                    const currentHash = this.hashContent(document.getText());
                    const currentLines = document.lineCount;

                    this.outputChannel.appendLine(`[ScanScheduler] Scan completed for ${filePath}`);
                    this.outputChannel.appendLine(`  - Expected hash: ${pending.hash.substring(0, 8)}...`);
                    this.outputChannel.appendLine(`  - Current hash: ${currentHash.substring(0, 8)}...`);
                    this.outputChannel.appendLine(`  - Current line count: ${currentLines}`);

                    if (currentHash === pending.hash) {
                        this.outputChannel.appendLine(`[ScanScheduler] ✓ Hash matches! Scan is fresh (epoch: ${pending.epoch})`);

                        this.lastScannedHash.set(filePath, currentHash);
                        this.lastScannedTimestamp.set(filePath, Date.now());

                        this.pendingScans.delete(filePath);

                        this.outputChannel.appendLine('[ScanScheduler] Waiting for findingsUpdated notification from server');
                    } else {
                        this.outputChannel.appendLine(`[ScanScheduler] ✗ Hash mismatch - ignoring stale results (epoch: ${pending.epoch})`);
                    }
                }
            }
        }, null, this.disposables);
    }

    private setupListeners(): void {
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(doc => this.handleSave(doc))
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(() => this.resetIdleTimer())
        );
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(() => this.resetIdleTimer())
        );

        const config = ConfigManager.getConfiguration();
        if (config.scan?.git?.enabled) {
            this.setupGitWatcher();
        }

        this.outputChannel.appendLine('[ScanScheduler] Listeners initialized');
    }

    /**
     * Handle file save with smart debouncing and hash checking
     * Compares to LAST SCANNED hash, not last observed hash
     */
    private async handleSave(document: vscode.TextDocument): Promise<void> {
        const config = ConfigManager.getConfiguration();

        if (config.scan?.onSave === 'none') {
            return;
        }

        if (!this.isSolidityOrYul(document)) {
            return;
        }

        const filePath = document.uri.fsPath;

        const content = document.getText();
        const hash = this.hashContent(content);

        const onSaveMode = config.scan?.onSaveMode ?? 'smart';

        this.outputChannel.appendLine(`[ScanScheduler] handleSave for ${filePath} - mode: ${onSaveMode}`);

        if (onSaveMode === 'off') {
            this.outputChannel.appendLine(`[ScanScheduler] On-save scanning disabled by onSaveMode=off`);
            return;
        }

        if (onSaveMode === 'smart') {
            const smartRescanMode = config.scan?.ai?.smartRescan ?? 'off';

            if (smartRescanMode !== 'off') {
                this.outputChannel.appendLine(`[ScanScheduler] Smart mode: checking SmartAIRescan first`);

                const allFindings = this.findingsProvider.getFindings();
                const aiFindings = this.filterAIFindings(allFindings, filePath);

                if (aiFindings.length > 0) {
                    const lastAIHash = this.lastAIScanHash.get(filePath);
                    const lastScannedHash = this.lastScannedHash.get(filePath);

                    if (lastAIHash === hash) {
                        this.outputChannel.appendLine(`[ScanScheduler] Content unchanged since last AI scan, skipping all scans`);
                        return;
                    }

                    this.outputChannel.appendLine(`[ScanScheduler] Skipping deterministic scan; SmartAIRescan will handle file ${filePath}`);
                    await this.handleSmartAIRescan(document);
                    return;
                } else {
                    this.outputChannel.appendLine(`[ScanScheduler] No AI findings for this file, checking if deterministic scan is needed`);
                }
            }

        }

        if (onSaveMode === 'ai') {
            this.outputChannel.appendLine(`[ScanScheduler] AI mode: running AI scan only`);
            await this.triggerAIFileScan(filePath, 'on-save-ai-mode');
            return;
        }


        const lastScannedHash = this.lastScannedHash.get(filePath);

        if (lastScannedHash === hash) {
            this.outputChannel.appendLine(`[ScanScheduler] Skipping deterministic scan - content unchanged since last scan: ${filePath}`);
            return;
        }

        const epoch = (this.epochByFile.get(filePath) ?? 0) + 1;
        this.epochByFile.set(filePath, epoch);

        this.pendingScans.set(filePath, { hash, epoch });
        this.outputChannel.appendLine(`[ScanScheduler] Scheduling deterministic scan for ${filePath} (epoch: ${epoch}, hash: ${hash.substring(0, 8)}...)`);

        const existingTimer = this.saveTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(async () => {
            this.saveTimers.delete(filePath);
            await this.scheduleScanWithEpoch(filePath, hash, epoch, config.scan?.onSave === 'workspace' ? 'workspace' : 'file');
        }, TIMING_CONSTANTS.SAVE_DEBOUNCE_MS);

        this.saveTimers.set(filePath, timer);
    }

    /**
     * Reset idle timer - called on any user activity
     */
    private resetIdleTimer(): void {
        const config = ConfigManager.getConfiguration();

        const idleMode = config.scan?.onIdle?.mode ?? 'off';

        if (!config.scan?.onIdle?.enabled || idleMode === 'off') {
            return;
        }

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        const idleSeconds = config.scan?.onIdle?.idleSeconds || 30;
        this.idleThresholdMs = idleSeconds * TIMING_CONSTANTS.MS_PER_SECOND;

        this.idleTimer = setTimeout(async () => {
            this.outputChannel.appendLine(`[ScanScheduler] User idle for ${idleSeconds}s - triggering ${idleMode} scan`);

            if (idleMode === 'ai-workspace') {
                await this.triggerAIWorkspaceScan('idle-timer');
            } else if (idleMode === 'workspace') {
                this.scheduleScan({
                    scope: 'workspace',
                    reason: 'idle'
                });
            }
        }, this.idleThresholdMs);
    }

    /**
     * Check if workspace needs scanning on open
     */
    private async checkWorkspaceOpenScan(): Promise<void> {
        const config = ConfigManager.getConfiguration();

        if (!config.scan?.onWorkspaceOpen?.enabled) {
            this.outputChannel.appendLine('[ScanScheduler] Workspace open scan disabled in settings');
            return;
        }

        await new Promise(resolve => setTimeout(resolve, TIMING_CONSTANTS.WORKSPACE_SETTLE_MS));

        const startTime = Date.now();
        while (!this.getLSPClient() && (Date.now() - startTime) < TIMING_CONSTANTS.LSP_CLIENT_MAX_WAIT_MS) {
            this.outputChannel.appendLine('[ScanScheduler] Waiting for LSP client to be ready...');
            await new Promise(resolve => setTimeout(resolve, TIMING_CONSTANTS.LSP_CLIENT_RETRY_MS));
        }

        if (!this.getLSPClient()) {
            this.outputChannel.appendLine('[ScanScheduler] LSP client not available after 30s - skipping workspace open scan');
            return;
        }

        const lastScanTime = this.context.workspaceState.get<number>('lastFullScan');
        const staleThresholdHours = config.scan?.onWorkspaceOpen?.staleThresholdHours || 8;

        if (!lastScanTime) {
            this.outputChannel.appendLine('[ScanScheduler] No previous scan found - running initial workspace scan');
            this.scheduleScan({
                scope: 'workspace',
                reason: 'workspace-open-first-time'
            });
            return;
        }

        const hoursSinceLastScan = (Date.now() - lastScanTime) / TIMING_CONSTANTS.MS_PER_SECOND / TIMING_CONSTANTS.SECONDS_PER_MINUTE / TIMING_CONSTANTS.MINUTES_PER_HOUR;

        if (hoursSinceLastScan > staleThresholdHours) {
            this.outputChannel.appendLine(`[ScanScheduler] Scan is stale (${hoursSinceLastScan.toFixed(1)}h old) - running fresh workspace scan`);
            this.scheduleScan({
                scope: 'workspace',
                reason: 'workspace-open-stale'
            });
        } else {
            this.outputChannel.appendLine(`[ScanScheduler] Last scan was ${hoursSinceLastScan.toFixed(1)}h ago - still fresh`);
        }
    }

    /**
     * Setup Git file watcher for branch changes, pulls, merges
     */
    private setupGitWatcher(): void {
        const gitHeadWatcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');

        gitHeadWatcher.onDidChange(async () => {
            this.outputChannel.appendLine('[ScanScheduler] Git HEAD changed - checking for modified files');

            const config = ConfigManager.getConfiguration();
            if (!config.scan?.git?.scanChangedOnly) {
                this.scheduleScan({
                    scope: 'workspace',
                    reason: 'git-event'
                });
                return;
            }

            try {
                const changedFiles = await this.getGitChangedFiles();
                if (changedFiles.length > 0) {
                    this.outputChannel.appendLine(`[ScanScheduler] Git changed files: ${changedFiles.join(', ')}`);
                    this.scheduleScan({
                        scope: 'changed-files',
                        files: changedFiles,
                        reason: 'git-changed-files'
                    });
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(`[ScanScheduler] Failed to get git changed files: ${errorMessage}`);
            }
        });

        this.disposables.push(gitHeadWatcher);
        this.outputChannel.appendLine('[ScanScheduler] Git integration enabled');
    }

    /**
     * Get list of changed Solidity/Yul files from git
     */
    private async getGitChangedFiles(): Promise<string[]> {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        try {
            const { stdout } = await execAsync('git diff HEAD@{1} --name-only "*.sol" "*.yul"', {
                cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
            });

            return stdout
                .toString()
                .split('\n')
                .filter((f: string) => f.trim().length > 0)
                .map((f: string) => {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                    return `${workspaceRoot}/${f}`;
                });
        } catch (error: unknown) {
            return [];
        }
    }

    /**
     * Schedule a scan with epoch tracking (for save-triggered scans)
     */
    private async scheduleScanWithEpoch(filePath: string, hash: string, epoch: number, scope: 'file' | 'workspace'): Promise<void> {
        const lspClient = this.getLSPClient();
        if (!lspClient) {
            this.outputChannel.appendLine('[ScanScheduler] LSP client not available - skipping scan');
            return;
        }

        this.outputChannel.appendLine(`[ScanScheduler] Executing scan - file: ${filePath}, epoch: ${epoch}, scope: ${scope}`);

        try {
            await new Promise(resolve => setTimeout(resolve, TIMING_CONSTANTS.LSP_SAVE_PROCESS_DELAY_MS));

            const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
            if (document) {
                const currentHash = this.hashContent(document.getText());
                if (currentHash !== hash) {
                    this.outputChannel.appendLine(`[ScanScheduler] Document content changed during scan delay (expected ${hash.substring(0, 8)}, got ${currentHash.substring(0, 8)}), cancelling scan`);
                    this.pendingScans.delete(filePath);
                    return;
                }

                this.outputChannel.appendLine(`[ScanScheduler] Document verified before scan: ${document.lineCount} lines, hash ${currentHash.substring(0, 8)}...`);
            }

            if (scope === 'workspace') {
                await lspClient.sendRequest('workspace/executeCommand', {
                    command: 'tameshi.scanWorkspace',
                    arguments: []
                });
            } else {
                await lspClient.sendRequest('workspace/executeCommand', {
                    command: 'tameshi.scanFile',
                    arguments: [vscode.Uri.file(filePath).toString()]
                });
            }

            this.outputChannel.appendLine(`[ScanScheduler] ✓ Scan request sent for epoch ${epoch}`);


        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[ScanScheduler] ✗ Scan failed: ${errorMessage}`);
            this.pendingScans.delete(filePath);
        }
    }

    /**
     * Schedule a scan with the given options (for non-save triggers)
     */
    private async scheduleScan(options: ScanOptions): Promise<void> {
        const lspClient = this.getLSPClient();
        if (!lspClient) {
            this.outputChannel.appendLine('[ScanScheduler] LSP client not available - skipping scan');
            return;
        }

        this.outputChannel.appendLine(`[ScanScheduler] Scheduling scan - scope: ${options.scope}, reason: ${options.reason}`);

        try {
            if (options.scope === 'file' && options.files && options.files.length > 0) {
                const filePath = options.files[0];
                await lspClient.sendRequest('workspace/executeCommand', {
                    command: 'tameshi.scanFile',
                    arguments: [vscode.Uri.file(filePath).toString()]
                });

                this.outputChannel.appendLine(`[ScanScheduler] ✓ Scanned file: ${filePath}`);
            } else if (options.scope === 'changed-files' && options.files && options.files.length > 0) {
                for (const filePath of options.files) {
                    await lspClient.sendRequest('workspace/executeCommand', {
                        command: 'tameshi.scanFile',
                        arguments: [vscode.Uri.file(filePath).toString()]
                    });
                }

                this.outputChannel.appendLine(`[ScanScheduler] ✓ Scanned ${options.files.length} changed files`);
            } else {
                await lspClient.sendRequest('workspace/executeCommand', {
                    command: 'tameshi.scanWorkspace',
                    arguments: []
                });

                this.lastWorkspaceScan = Date.now();
                await this.context.workspaceState.update('lastFullScan', this.lastWorkspaceScan);

                this.outputChannel.appendLine(`[ScanScheduler] ✓ Scanned workspace`);
            }

            this.outputChannel.appendLine('[ScanScheduler] Waiting for findingsUpdated notification from server');

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[ScanScheduler] ✗ Scan failed: ${errorMessage}`);
        }
    }

    /**
     * Compute MD5 hash of file content
     */
    private hashContent(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Check if document is Solidity or Yul
     */
    private isSolidityOrYul(document: vscode.TextDocument): boolean {
        return document.languageId === 'solidity' ||
               document.languageId === 'yul' ||
               document.fileName.endsWith('.sol') ||
               document.fileName.endsWith('.yul');
    }

    /**
     * Trigger manual workspace scan
     */
    public async scanWorkspaceNow(): Promise<void> {
        await this.scheduleScan({
            scope: 'workspace',
            reason: 'manual'
        });
    }

    /**
     * Trigger manual file scan
     */
    public async scanFileNow(filePath: string): Promise<void> {
        await this.scheduleScan({
            scope: 'file',
            files: [filePath],
            reason: 'manual'
        });
    }

    /**
     * Smart AI Rescan - checks if AI findings are affected by changes and triggers rescan
     */
    private async handleSmartAIRescan(document: vscode.TextDocument): Promise<void> {
        const config = ConfigManager.getConfiguration();

        if (config.scan?.ai?.smartRescan === 'off') {
            this.aiRescanStats.avoided++;
            return;
        }

        const filePath = document.uri.fsPath;

        const allFindings = this.findingsProvider.getFindings();
        const aiFindings = this.filterAIFindings(allFindings, filePath);

        if (aiFindings.length === 0) {
            this.outputChannel.appendLine(`[SmartAIRescan] No AI findings for ${filePath}, skipping`);
            this.aiRescanStats.avoided++;
            return;
        }

        this.outputChannel.appendLine(`[SmartAIRescan] Checking ${filePath}: ${aiFindings.length} AI findings`);

        const lastAIHash = this.lastAIScanHash.get(filePath);
        const lastAITimestamp = this.lastAIScanTimestamp.get(filePath);
        const currentHash = this.changeTracker.getContentHash(document);
        const documentModifiedTime = document.version;

        if (lastAIHash === currentHash && lastAITimestamp) {
            const lastScanVersion = this.lastAIScanVersion.get(filePath);
            if (lastScanVersion !== undefined && documentModifiedTime <= lastScanVersion) {
                this.outputChannel.appendLine(
                    `[SmartAIRescan] Content unchanged since last AI scan (hash match, version ${documentModifiedTime} <= ${lastScanVersion}), skipping`
                );
                this.aiRescanStats.avoided++;
                return;
            }

            this.outputChannel.appendLine(
                `[SmartAIRescan] Hash matches but document has been modified since last scan (version ${documentModifiedTime} > ${lastScanVersion || 'none'}), continuing...`
            );
        }

        if (lastAIHash !== currentHash) {
            this.outputChannel.appendLine(`[SmartAIRescan] Content has changed since last AI scan (hash mismatch)`);
        }

        const modifiedLines = this.changeTracker.getModifiedLines(filePath);

        if (modifiedLines.size === 0) {
            this.outputChannel.appendLine(`[SmartAIRescan] No modified lines tracked, skipping`);
            this.aiRescanStats.avoided++;
            return;
        }

        const contextLines = config.scan?.ai?.smartRescanContextLines ?? 2;
        const affectedFindings = this.checkFindingsAffected(aiFindings, modifiedLines, contextLines);

        if (affectedFindings.length === 0) {
            this.outputChannel.appendLine(
                `[SmartAIRescan] No AI findings affected by changes (${modifiedLines.size} modified lines)`
            );
            this.aiRescanStats.avoided++;
            return;
        }

        const minSeverity = config.scan?.ai?.smartRescanMinSeverity ?? 'info';
        const filteredFindings = this.filterBySeverity(affectedFindings, minSeverity);

        if (filteredFindings.length === 0) {
            this.outputChannel.appendLine(
                `[SmartAIRescan] No AI findings meet severity threshold (${minSeverity})`
            );
            this.aiRescanStats.avoided++;
            return;
        }

        this.outputChannel.appendLine(
            `[SmartAIRescan] ✓ Intersection found! ${filteredFindings.length} AI findings affected:`
        );
        for (const finding of filteredFindings) {
            const startLine = finding.location.line;
            const endLine = (finding.location as any).endLine ?? startLine;
            this.outputChannel.appendLine(
                `  - "${finding.title}" (${finding.severity}) at lines ${startLine}-${endLine}`
            );
        }

        const mode = config.scan?.ai?.smartRescan ?? 'batch';

        if (mode === 'file') {
            await this.triggerAIFileScan(filePath, 'intersection-hit');
            this.aiRescanStats.triggered++;
        } else if (mode === 'batch') {
            this.scheduleAIBatchRescan(filePath);
        }
    }

    /**
     * Filter findings to only AI/LLM findings for a specific file
     */
    private filterAIFindings(findings: Finding[], filePath: string): ExtendedFinding[] {
        return findings
            .filter(f => {
                const extended = f as ExtendedFinding;
                const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');
                return (scannerType === 'llm' || scannerType === 'hybrid') && f.location.file === filePath;
            }) as ExtendedFinding[];
    }

    /**
     * Check if any findings are affected by modified lines (with context window)
     */
    private checkFindingsAffected(
        findings: ExtendedFinding[],
        modifiedLines: Set<number>,
        contextLines: number
    ): ExtendedFinding[] {
        const affected: ExtendedFinding[] = [];

        for (const finding of findings) {
            const startLine = finding.location.line;
            const endLine = (finding.location as any).endLine ?? startLine;

            for (let line = startLine - contextLines; line <= endLine + contextLines; line++) {
                if (modifiedLines.has(line)) {
                    affected.push(finding);
                    break;
                }
            }
        }

        return affected;
    }

    /**
     * Filter findings by severity threshold
     */
    private filterBySeverity(findings: ExtendedFinding[], minSeverity: string): ExtendedFinding[] {
        const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
        const minIndex = severityOrder.indexOf(minSeverity);

        if (minIndex === -1) {
            return findings;
        }

        return findings.filter(f => {
            const severityIndex = severityOrder.indexOf(f.severity);
            return severityIndex >= minIndex;
        });
    }

    /**
     * Schedule AI batch rescan with debouncing
     */
    private scheduleAIBatchRescan(filePath: string): void {
        this.pendingAIRescans.add(filePath);

        if (this.aiBatchTimer) {
            clearTimeout(this.aiBatchTimer);
        }

        const config = ConfigManager.getConfiguration();
        const debounce = config.scan?.ai?.smartRescanDebounce ?? 3000;
        const batchThreshold = config.scan?.ai?.smartRescanBatchThreshold ?? 5;

        this.outputChannel.appendLine(
            `[SmartAIRescan] Batching ${filePath} (${this.pendingAIRescans.size} files pending)`
        );

        this.aiBatchTimer = setTimeout(async () => {
            const files = Array.from(this.pendingAIRescans);
            this.pendingAIRescans.clear();

            if (files.length === 0) {
                return;
            }

            if (files.length >= batchThreshold) {
                this.outputChannel.appendLine(
                    `[SmartAIRescan] Batching ${files.length} files → triggering workspace AI scan`
                );
                await this.triggerAIWorkspaceScan('batch-threshold-reached');
                this.aiRescanStats.batched += files.length;
            } else {
                this.outputChannel.appendLine(
                    `[SmartAIRescan] Triggering AI file scans for ${files.length} files`
                );
                for (const file of files) {
                    await this.triggerAIFileScan(file, 'batch-debounced');
                }
                this.aiRescanStats.triggered += files.length;
            }
        }, debounce);
    }

    /**
     * Trigger AI scan for a specific file
     */
    private async triggerAIFileScan(filePath: string, reason: string): Promise<void> {
        const lspClient = this.getLSPClient();

        if (!lspClient) {
            this.outputChannel.appendLine('[SmartAIRescan] LSP client not available, skipping AI rescan');
            return;
        }

        if (this.inflightAIScans.has(filePath)) {
            this.outputChannel.appendLine(`[SmartAIRescan] AI scan already in flight for ${filePath}, deduplicating`);
            this.aiRescanStats.deduplicated++;
            return;
        }

        try {
            this.outputChannel.appendLine(`[SmartAIRescan] Triggering AI file scan: ${filePath} (reason: ${reason})`);

            const cancellationTokenSource = new vscode.CancellationTokenSource();
            this.inflightAIScans.set(filePath, cancellationTokenSource);

            const fileUri = vscode.Uri.file(filePath);

            await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.llmScanFile',
                arguments: [fileUri.toString()]
            });

            const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
            if (document) {
                this.lastAIScanVersion.set(filePath, document.version);
                this.lastAIScanHash.set(filePath, this.changeTracker.getContentHash(document));
                this.lastAIScanTimestamp.set(filePath, Date.now());

                this.changeTracker.clearFile(filePath);
            }

            this.outputChannel.appendLine(`[SmartAIRescan] ✓ AI scan completed for ${filePath}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[SmartAIRescan] ✗ AI scan failed for ${filePath}: ${errorMessage}`);
        } finally {
            this.inflightAIScans.delete(filePath);
        }
    }

    /**
     * Trigger AI workspace scan
     */
    private async triggerAIWorkspaceScan(reason: string): Promise<void> {
        const lspClient = this.getLSPClient();

        if (!lspClient) {
            this.outputChannel.appendLine('[SmartAIRescan] LSP client not available, skipping AI workspace scan');
            return;
        }

        try {
            this.outputChannel.appendLine(`[SmartAIRescan] Triggering AI workspace scan (reason: ${reason})`);

            await lspClient.sendRequest('workspace/executeCommand', {
                command: 'tameshi.llmScanWorkspace',
                arguments: []
            });

            this.lastAIScanVersion.clear();
            this.lastAIScanHash.clear();
            this.changeTracker.clearAll();

            this.outputChannel.appendLine('[SmartAIRescan] ✓ AI workspace scan completed');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`[SmartAIRescan] ✗ AI workspace scan failed: ${errorMessage}`);
        }
    }

    /**
     * Get AI rescan statistics
     */
    public getAIRescanStats(): AIRescanStats {
        return { ...this.aiRescanStats };
    }

    /**
     * Update AI scan state for files after LSP notification
     * Called when findingsUpdated notification is received
     */
    public updateAIScanState(files: string[], scanType?: 'deterministic' | 'ai' | 'hybrid'): void {
        const now = Date.now();

        for (const filePath of files) {
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
            if (!document) {
                continue;
            }

            const hash = this.changeTracker.getContentHash(document);
            const version = document.version;

            if (scanType === 'ai' || scanType === 'hybrid') {
                this.lastAIScanHash.set(filePath, hash);
                this.lastAIScanVersion.set(filePath, version);
                this.lastAIScanTimestamp.set(filePath, now);

                this.outputChannel.appendLine(
                    `[ScanScheduler] AI state updated for ${filePath} (hash ${hash.substring(0, 8)}, version ${version})`
                );

                this.changeTracker.clearFile(filePath);
            }

            if (scanType === 'deterministic' || scanType === 'hybrid' || scanType === undefined) {
                this.lastScannedHash.set(filePath, hash);
                this.lastScannedTimestamp.set(filePath, now);

                this.outputChannel.appendLine(
                    `[ScanScheduler] Deterministic state updated for ${filePath} (hash ${hash.substring(0, 8)})`
                );
            }
        }
    }

    dispose(): void {
        for (const timer of this.saveTimers.values()) {
            clearTimeout(timer);
        }
        this.saveTimers.clear();

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        if (this.aiBatchTimer) {
            clearTimeout(this.aiBatchTimer);
        }

        for (const tokenSource of this.inflightAIScans.values()) {
            tokenSource.cancel();
            tokenSource.dispose();
        }
        this.inflightAIScans.clear();

        this.disposables.forEach(d => d.dispose());
    }
}
