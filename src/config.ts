import * as vscode from 'vscode';
import { getLogger, LogCategory } from './utils/logger';

/**
 * LSP Initialization Options
 */
export interface LSPInitializationOptions {
    adapter: 'cli' | 'daemon';
    cliPath: string;
    scan: {
        include: string[];
        exclude: string[];
        onSave: 'none' | 'file' | 'workspace';
    };
    rules: Record<string, unknown>;
    limits: {
        concurrency?: number;
        timeout?: number;
        memory?: number;
    };
    docs: {
        baseUrl: string;
    };
    llm?: {
        enabled: boolean;
        provider: {
            type: string;
            model: string;
            apiKey: string;
        };
        global: {
            defaultTemperature: number;
            defaultMaxTokens: number;
            defaultConfidenceThreshold: number;
            includeLowSeverity: boolean;
            retryAttempts: number;
            timeoutSeconds: number;
        };
        enabledScanners: string[];
        useIrScanning: boolean;
    };
}

export interface TameshiConfig {
    server: {
        path: string;
        args: string[];
        env: Record<string, string>;
    };
    scan: {
        onSave: 'none' | 'file' | 'workspace';
        onSaveMode: 'off' | 'deterministic' | 'ai' | 'smart';
        include: string[];
        exclude: string[];
        ai?: {
            smartRescan: 'off' | 'file' | 'batch';
            smartRescanDebounce: number;
            smartRescanContextLines: number;
            smartRescanBatchThreshold: number;
            smartRescanMinSeverity: 'info' | 'low' | 'medium' | 'high' | 'critical';
        };
        onIdle?: {
            enabled: boolean;
            idleSeconds: number;
            mode: 'off' | 'workspace' | 'ai-workspace';
        };
        onWorkspaceOpen?: {
            enabled: boolean;
            staleThresholdHours: number;
        };
        git?: {
            enabled: boolean;
            scanChangedOnly: boolean;
        };
    };
    rules: Record<string, any>;
    limits: {
        concurrency?: number;
        timeout?: number;
        memory?: number;
    };
    adapter: 'cli' | 'daemon';
    cli: {
        path: string;
    };
    findings: {
        view: {
            groupBy: 'severity' | 'file' | 'rule';
        };
        mergeMode?: 'raw' | 'merged';
        minCorrelationScore?: number;
        minAugmentationConfidence?: 'low' | 'medium' | 'high';
        severityUpgradePolicy?: 'off' | 'llm_high_conf_only' | 'any_llm' | 'multi_scanner';
    };
    details: {
        cacheTimeout?: number;
        prefetchLimit?: number;
    };
    docs: {
        baseUrl: string;
    };
    logging: {
        level: 'off' | 'error' | 'warn' | 'info' | 'debug';
    };
    llm: {
        enabled: boolean;
        provider: 'openai' | 'anthropic' | 'local';
        apiKey: string;
        model: string;
        temperature: number;
        maxTokens: number;
        confidenceThreshold: number;
        enabledScanners: string[];
        timeoutSeconds: number;
        includeLowSeverity: boolean;
        useIrScanning: boolean;
    };
    editor?: {
        hovers?: {
            enabled?: boolean;
            showAllScanners?: boolean;
            showCorrelationCount?: boolean;
            showQuickActions?: boolean;
        };
        gutterIcons?: {
            enabled?: boolean;
            showCorrelationBadge?: boolean;
        };
        codeLens?: {
            enabled?: boolean;
            showFileSummary?: boolean;
            showFunctionSummary?: boolean;
            minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
        };
        statusBar?: {
            enabled?: boolean;
            showCounts?: boolean;
            showFixable?: boolean;
        };
    };
}

export class ConfigManager {
    private static readonly CONFIGURATION_SECTION = 'tameshi';

    public static getConfiguration(): TameshiConfig {
        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        
        return {
            server: {
                path: config.get<string>('server.path', ''),
                args: config.get<string[]>('server.args', []),
                env: config.get<Record<string, string>>('server.env', {}) ?? {}
            },
            scan: {
                onSave: config.get<'none' | 'file' | 'workspace'>('scan.onSave', 'file'),
                onSaveMode: config.get<'off' | 'deterministic' | 'ai' | 'smart'>('scan.onSaveMode', 'smart'),
                include: config.get<string[]>('scan.include', ['**/*.sol', '**/*.yul']),
                exclude: config.get<string[]>('scan.exclude', ['**/node_modules/**', '**/lib/**', '**/out/**', '**/test/**']),
                ai: {
                    smartRescan: config.get<'off' | 'file' | 'batch'>('scan.ai.smartRescan', 'batch'),
                    smartRescanDebounce: config.get<number>('scan.ai.smartRescan.debounce', 3000),
                    smartRescanContextLines: config.get<number>('scan.ai.smartRescan.contextLines', 2),
                    smartRescanBatchThreshold: config.get<number>('scan.ai.smartRescan.batchThreshold', 5),
                    smartRescanMinSeverity: config.get<'info' | 'low' | 'medium' | 'high' | 'critical'>('scan.ai.smartRescan.minSeverity', 'info')
                },
                onIdle: {
                    enabled: config.get<boolean>('scan.onIdle.enabled', false),
                    idleSeconds: config.get<number>('scan.onIdle.idleSeconds', 30),
                    mode: config.get<'off' | 'workspace' | 'ai-workspace'>('scan.onIdle.mode', 'off')
                },
                onWorkspaceOpen: {
                    enabled: config.get<boolean>('scan.onWorkspaceOpen.enabled', true),
                    staleThresholdHours: config.get<number>('scan.onWorkspaceOpen.staleThresholdHours', 8)
                },
                git: {
                    enabled: config.get<boolean>('scan.git.enabled', false),
                    scanChangedOnly: config.get<boolean>('scan.git.scanChangedOnly', true)
                }
            },
            rules: config.get<Record<string, unknown>>('rules', {}) ?? {},
            limits: config.get<{concurrency?: number; timeout?: number; memory?: number}>('limits', {}),
            adapter: config.get<'cli' | 'daemon'>('adapter', 'cli'),
            cli: {
                path: config.get<string>('cli.path', '')
            },
            findings: {
                view: {
                    groupBy: config.get<'severity' | 'file' | 'rule'>('findings.view.groupBy', 'severity')
                },
                mergeMode: config.get<'raw' | 'merged'>('findings.mergeMode', 'raw'),
                minCorrelationScore: config.get<number>('findings.minCorrelationScore', 0.5),
                minAugmentationConfidence: config.get<'low' | 'medium' | 'high'>('findings.minAugmentationConfidence', 'medium'),
                severityUpgradePolicy: config.get<'off' | 'llm_high_conf_only' | 'any_llm' | 'multi_scanner'>('findings.severityUpgradePolicy', 'llm_high_conf_only')
            },
            details: {
                cacheTimeout: config.get<number>('details.cacheTimeout', 600000),
                prefetchLimit: config.get<number>('details.prefetchLimit', 10)
            },
            docs: {
                baseUrl: config.get<string>('docs.baseUrl', 'https://docs.tameshi.dev')
            },
            logging: {
                level: config.get<'off' | 'error' | 'warn' | 'info' | 'debug'>('logging.level', 'info')
            },
            llm: {
                enabled: config.get<boolean>('llm.enabled', false),
                provider: config.get<'openai' | 'anthropic' | 'local'>('llm.provider', 'openai'),
                apiKey: config.get<string>('llm.apiKey', ''),
                model: config.get<string>('llm.model', 'gpt-4'),
                temperature: config.get<number>('llm.temperature', 0.2),
                maxTokens: config.get<number>('llm.maxTokens', 4000),
                confidenceThreshold: config.get<number>('llm.confidenceThreshold', 0.5),
                enabledScanners: config.get<string[]>('llm.enabledScanners', ['reentrancy', 'access_control', 'unchecked_returns']),
                timeoutSeconds: config.get<number>('llm.timeoutSeconds', 120),
                includeLowSeverity: config.get<boolean>('llm.includeLowSeverity', false),
                useIrScanning: config.get<boolean>('llm.useIrScanning', false)
            },
            editor: {
                hovers: {
                    enabled: config.get<boolean>('editor.hovers.enabled', true),
                    showAllScanners: config.get<boolean>('editor.hovers.showAllScanners', true),
                    showCorrelationCount: config.get<boolean>('editor.hovers.showCorrelationCount', true),
                    showQuickActions: config.get<boolean>('editor.hovers.showQuickActions', true)
                },
                gutterIcons: {
                    enabled: config.get<boolean>('editor.gutterIcons.enabled', true),
                    showCorrelationBadge: config.get<boolean>('editor.gutterIcons.showCorrelationBadge', true)
                },
                codeLens: {
                    enabled: config.get<boolean>('editor.codeLens.enabled', true),
                    showFileSummary: config.get<boolean>('editor.codeLens.showFileSummary', true),
                    showFunctionSummary: config.get<boolean>('editor.codeLens.showFunctionSummary', true),
                    minSeverity: config.get<'critical' | 'high' | 'medium' | 'low' | 'info'>('editor.codeLens.minSeverity', 'medium')
                },
                statusBar: {
                    enabled: config.get<boolean>('editor.statusBar.enabled', true),
                    showCounts: config.get<boolean>('editor.statusBar.showCounts', true),
                    showFixable: config.get<boolean>('editor.statusBar.showFixable', false)
                }
            }
        };
    }

    public static getInitializationOptions(): LSPInitializationOptions {
        const config = this.getConfiguration();

        const initOptions: LSPInitializationOptions = {
            adapter: config.adapter,
            cliPath: config.cli.path,
            scan: {
                include: config.scan.include,
                exclude: config.scan.exclude,
                onSave: config.scan.onSave
            },
            rules: config.rules,
            limits: config.limits,
            docs: {
                baseUrl: config.docs.baseUrl
            },
            llm: config.llm.enabled ? {
                enabled: config.llm.enabled,
                provider: {
                    type: config.llm.provider,
                    model: config.llm.model,
                    apiKey: config.llm.apiKey
                },
                global: {
                    defaultTemperature: config.llm.temperature,
                    defaultMaxTokens: config.llm.maxTokens,
                    defaultConfidenceThreshold: config.llm.confidenceThreshold,
                    includeLowSeverity: config.llm.includeLowSeverity,
                    retryAttempts: 3,
                    timeoutSeconds: config.llm.timeoutSeconds
                },
                enabledScanners: config.llm.enabledScanners,
                useIrScanning: config.llm.useIrScanning
            } : undefined
        };

        getLogger().debug(LogCategory.LSP, 'LLM Config:', JSON.stringify({
            enabled: config.llm.enabled,
            hasApiKey: !!config.llm.apiKey,
            provider: config.llm.provider,
            model: config.llm.model
        }, null, 2));

        return initOptions;
    }

    public static async updateConfiguration<T>(
        section: string, 
        value: T, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        await config.update(section, value, target);
    }

    public static onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(this.CONFIGURATION_SECTION)) {
                callback();
            }
        });
    }
}

/**
 * Helper function to get the configuration
 */
export function getConfig(): TameshiConfig {
    return ConfigManager.getConfiguration();
}