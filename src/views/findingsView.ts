import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigManager } from '../config';
import { ExtendedFinding, getScannerType } from '../types/findings';
import { FindingCorrelationService, CorrelationConfig } from '../services/findingCorrelationService';
import { getLogger, LogCategory } from '../utils/logger';
import { mapSeverity, mapConfidence, mapScannerType } from '../utils/lspMappers';

/**
 * LSP response for getFindings request
 */
interface LSPGetFindingsResponse {
    findings: LSPFinding[];
}

/**
 * LSP Finding structure
 */
interface LSPFinding {
    id: string;
    scanner_id?: string;
    rule?: string;
    scanner_type?: string;
    finding_type?: string;
    severity: string;
    confidence: string;
    title: string;
    description: string;
    locations: Array<{
        file: string;
        line: number;
        column: number;
        end_line?: number;
        end_column?: number;
    }>;
    code_frame?: {
        content: string;
    };
    metadata?: {
        references?: string[];
        analysis_type?: string;
        correlations?: LSPCorrelation[];
        [key: string]: unknown;
    };
    augmented_data?: unknown;
    detected_at?: string;
    augmented_at?: string;
}

/**
 * LSP Correlation structure
 */
interface LSPCorrelation {
    related_finding_id: string;
    relationship: string;
    correlation_strength?: number;
}

export interface Finding {
    id: string;
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'informational';
    confidence: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    location: {
        file: string;
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
    };
    code?: string;
    references?: string[];
}

export interface FindingGroup {
    label: string;
    children: (Finding | FindingGroup)[];
    contextValue?: string;
    description?: string;
    correlationScore?: number;
    correlationType?: string;
    scannerCount?: number;
}

export class FindingsProvider implements vscode.TreeDataProvider<Finding | FindingGroup> {
    private _onDidChangeTreeData: vscode.EventEmitter<Finding | FindingGroup | undefined | null | void> = new vscode.EventEmitter<Finding | FindingGroup | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Finding | FindingGroup | undefined | null | void> = this._onDidChangeTreeData.event;

    private findings: Finding[] = [];
    private rawFindings: ExtendedFinding[] = [];
    private mergedFindings: ExtendedFinding[] = [];
    private correlationService: FindingCorrelationService;
    private context: vscode.ExtensionContext;
    private mergeMode: boolean = false;
    private findingsUpdateCallbacks: Array<(findings: Finding[]) => void> = [];
    private treeView: vscode.TreeView<Finding | FindingGroup> | undefined;

    private scanningState: {
        deterministic: boolean;
        llm: boolean;
        all: boolean;
    } = { deterministic: false, llm: false, all: false };

    private lastAppliedScanEpoch: number = 0;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        const config = ConfigManager.getConfiguration();
        const correlationConfig: CorrelationConfig = {
            minCorrelationScore: config.findings.minCorrelationScore,
            minAugmentationConfidence: config.findings.minAugmentationConfidence,
            severityUpgradePolicy: config.findings.severityUpgradePolicy
        };
        this.correlationService = new FindingCorrelationService(correlationConfig);

        const configMergeMode = config.findings.mergeMode === 'merged';
        this.mergeMode = context.workspaceState.get<boolean>('tameshi.mergeMode', configMergeMode);
    }

    public toggleMergeMode(): void {
        this.mergeMode = !this.mergeMode;
        this.context.workspaceState.update('tameshi.mergeMode', this.mergeMode);

        this.findings = this.mergeMode ? this.mergedFindings : this.rawFindings;
        this.refresh();
    }

    public isMergeMode(): boolean {
        return this.mergeMode;
    }

    public setTreeView(treeView: vscode.TreeView<Finding | FindingGroup>): void {
        this.treeView = treeView;
    }

    public async revealFinding(findingId: string): Promise<void> {
        if (!this.treeView) {
            getLogger().warn(LogCategory.UI, 'Tree view not set, cannot reveal finding');
            return;
        }

        const finding = this.findings.find(f => f.id === findingId);
        if (!finding) {
            getLogger().warn(LogCategory.UI, `Finding not found: ${findingId}`);
            return;
        }

        await this.treeView.reveal(finding, {
            select: true,
            focus: true,
            expand: true
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public setScanning(type: 'deterministic' | 'llm' | 'all', isScanning: boolean): void {
        this.scanningState[type] = isScanning;
        this.refresh();
    }

    public isScanning(type: 'deterministic' | 'llm' | 'all'): boolean {
        return this.scanningState[type];
    }

    async updateFindings(findings: Finding[]): Promise<void> {
        this.findings = findings;
        this.refresh();

        for (const callback of this.findingsUpdateCallbacks) {
            try {
                callback(findings);
            } catch (error) {
                getLogger().error(LogCategory.UI, 'Error in findings update callback:', error);
            }
        }
    }

    /**
     * Register a callback to be called whenever findings are updated
     */
    onFindingsUpdate(callback: (findings: Finding[]) => void): vscode.Disposable {
        this.findingsUpdateCallbacks.push(callback);

        return {
            dispose: () => {
                const index = this.findingsUpdateCallbacks.indexOf(callback);
                if (index >= 0) {
                    this.findingsUpdateCallbacks.splice(index, 1);
                }
            }
        };
    }

    /**
     * Get all current findings
     */
    getFindings(): Finding[] {
        return this.findings;
    }

    getTreeItem(element: Finding | FindingGroup): vscode.TreeItem {
        if ('children' in element) {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
            item.contextValue = element.contextValue || 'findingGroup';

            if (element.contextValue === 'correlationGroup') {
                const scorePercent = Math.round((element.correlationScore || 0) * 100);
                item.tooltip = `Correlation Score: ${scorePercent}%\n` +
                              `Type: ${element.correlationType}\n` +
                              `Scanners: ${element.scannerCount}\n` +
                              `Findings: ${element.children.length}`;
            } else if (element.contextValue === 'correlationFindingNode') {
                const wrappedFinding = element.children[0] as Finding;
                item.tooltip = wrappedFinding.description;
            } else {
                item.tooltip = `${element.children.length} items`;
            }

            let isScanning = false;
            if (element.contextValue === 'rootGroup' && this.scanningState.all) {
                isScanning = true;
                item.iconPath = new vscode.ThemeIcon('sync~spin');
                item.description = 'Scanning...';
                item.tooltip = 'Running all scans...';
            } else if (element.contextValue === 'scannerTypeGroup' && this.scanningState.deterministic) {
                isScanning = true;
                item.iconPath = new vscode.ThemeIcon('sync~spin');
                item.description = 'Scanning...';
                item.tooltip = 'Running deterministic scan...';
            } else if (element.contextValue === 'aiLabGroup' && this.scanningState.llm) {
                isScanning = true;
                item.iconPath = new vscode.ThemeIcon('sync~spin');
                item.description = 'Scanning...';
                item.tooltip = 'Running LLM scan...';
            }

            if (!isScanning) {
                if (element.contextValue === 'correlationRootGroup') {
                    item.iconPath = new vscode.ThemeIcon('link');
                } else if (element.contextValue === 'highConfidenceGroup') {
                    item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                } else if (element.contextValue === 'conflictGroup') {
                    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
                } else if (element.contextValue === 'relatedGroup') {
                    item.iconPath = new vscode.ThemeIcon('symbol-class');
                } else if (element.contextValue === 'correlationGroup') {
                    const severityIcon = element.label.includes('⚡') ? 'flame' :
                                       element.label.includes('🔴') ? 'error' :
                                       element.label.includes('🟡') ? 'warning' : 'info';
                    item.iconPath = new vscode.ThemeIcon(severityIcon);
                } else if (element.contextValue === 'correlationFindingNode') {
                    const isLLM = element.label.includes('🤖');
                    item.iconPath = new vscode.ThemeIcon(isLLM ? 'hubot' : 'shield');
                } else if (element.label.includes('Critical')) {
                    item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                } else if (element.label.includes('High')) {
                    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
                } else if (element.label.includes('Medium')) {
                    item.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('problemsInfoIcon.foreground'));
                } else {
                    item.iconPath = new vscode.ThemeIcon('folder');
                }

                if (element.description) {
                    item.description = element.description;
                }

                if (element.contextValue === 'rootGroup') {
                    item.command = {
                        command: 'tameshi.scanWorkspace.all',
                        title: 'Run All Scans',
                        arguments: []
                    };
                    item.tooltip = 'Click to run all scans (Deterministic + AI Lab)';
                } else if (element.contextValue === 'scannerTypeGroup') {
                    item.command = {
                        command: 'tameshi.scanWorkspace.client',
                        title: 'Run Deterministic Scan',
                        arguments: []
                    };
                    item.tooltip = 'Click to run deterministic scanners';
                } else if (element.contextValue === 'aiLabGroup') {
                    item.command = {
                        command: 'tameshi.scanWorkspace.llm',
                        title: 'Run AI Lab Scan',
                        arguments: []
                    };
                    item.tooltip = 'Click to run AI Lab scanners';
                } else if (element.contextValue === 'correlationFindingNode') {
                    const wrappedFinding = element.children[0] as Finding;
                    item.command = {
                        command: 'vscode.open',
                        title: 'Open',
                        arguments: [
                            vscode.Uri.file(wrappedFinding.location.file),
                            {
                                selection: new vscode.Range(
                                    wrappedFinding.location.line - 1,
                                    wrappedFinding.location.column - 1,
                                    (wrappedFinding.location.endLine || wrappedFinding.location.line) - 1,
                                    (wrappedFinding.location.endColumn || wrappedFinding.location.column) - 1
                                )
                            }
                        ]
                    };
                } else if (element.contextValue === 'correlationGroup') {
                    const firstFindingNode = element.children[0] as FindingGroup;
                    const firstFinding = firstFindingNode.children[0] as Finding;
                    item.command = {
                        command: 'vscode.open',
                        title: 'Open',
                        arguments: [
                            vscode.Uri.file(firstFinding.location.file),
                            {
                                selection: new vscode.Range(
                                    firstFinding.location.line - 1,
                                    firstFinding.location.column - 1,
                                    (firstFinding.location.endLine || firstFinding.location.line) - 1,
                                    (firstFinding.location.endColumn || firstFinding.location.column) - 1
                                )
                            }
                        ]
                    };
                }
            }

            return item;
        } else {
            const finding = element as Finding;
            const extended = finding as ExtendedFinding;

            let label = finding.title;
            if (extended.correlationMetadata?.relatedFindingIds && extended.correlationMetadata.relatedFindingIds.length > 0) {
                const count = extended.correlationMetadata.relatedFindingIds.length;
                const correlationType = extended.correlationMetadata.correlationType;

                if (correlationType === 'duplicate' || correlationType === 'augmentation') {
                    label += ` ✓ (${count + 1} scanner${count > 0 ? 's' : ''})`;
                } else if (correlationType === 'conflict') {
                    label += ` ⚠ (conflict)`;
                } else {
                    label += ` ~ (${count} related)`;
                }
            }

            const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);

            item.description = `${finding.rule} - ${path.basename(finding.location.file)}:${finding.location.line}`;
            item.tooltip = this._buildTooltip(finding, extended);
            item.contextValue = 'finding';

            item.iconPath = this._getIconForFinding(finding, extended);

            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [
                    vscode.Uri.file(finding.location.file),
                    {
                        selection: new vscode.Range(
                            finding.location.line - 1,
                            finding.location.column - 1,
                            (finding.location.endLine || finding.location.line) - 1,
                            (finding.location.endColumn || finding.location.column) - 1
                        )
                    }
                ]
            };

            return item;
        }
    }

    private _buildTooltip(finding: Finding, extended: ExtendedFinding): string {
        let tooltip = finding.description;

        if (extended.scannerId) {
            const scannerType = extended.scannerType || getScannerType(extended.scannerId);
            tooltip += `\n\nScanner: ${extended.scannerId} (${scannerType})`;
        }

        if (extended.correlationMetadata) {
            const meta = extended.correlationMetadata;
            if (meta.relatedFindingIds && meta.relatedFindingIds.length > 0) {
                tooltip += `\n\nCorrelation:`;
                tooltip += `\n  Type: ${meta.correlationType}`;
                tooltip += `\n  Related findings: ${meta.relatedFindingIds.length}`;

                if (meta.scannerAgreement) {
                    const agreementEmoji = meta.scannerAgreement === 'full' ? '✓' :
                                          meta.scannerAgreement === 'conflict' ? '⚠' : '~';
                    tooltip += `\n  Scanner agreement: ${agreementEmoji} ${meta.scannerAgreement}`;
                }

                if (meta.correlationScore !== undefined) {
                    tooltip += `\n  Correlation score: ${(meta.correlationScore * 100).toFixed(0)}%`;
                }

                if (meta.confidenceBoost) {
                    tooltip += `\n  Confidence boost: +${Math.round(meta.confidenceBoost * 100)}%`;
                }
            }
        }

        if (extended.augmentedData?.riskScore !== undefined) {
            tooltip += `\n\nRisk Score: ${extended.augmentedData.riskScore}/100`;
        }

        return tooltip;
    }

    private _getIconForFinding(finding: Finding, extended: ExtendedFinding): vscode.ThemeIcon {
        const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

        let iconName: string;
        switch (scannerType) {
            case 'llm':
                iconName = 'sparkle';
                break;
            case 'hybrid':
                iconName = 'beaker';
                break;
            case 'ir':
                iconName = 'gear';
                break;
            case 'source':
                iconName = 'file-code';
                break;
            default:
                iconName = 'shield';
                break;
        }

        let color: vscode.ThemeColor | undefined;
        switch (finding.severity) {
            case 'critical':
                color = new vscode.ThemeColor('errorForeground');
                break;
            case 'high':
                color = new vscode.ThemeColor('problemsWarningIcon.foreground');
                break;
            case 'medium':
                color = new vscode.ThemeColor('problemsInfoIcon.foreground');
                break;
            case 'low':
            case 'info':
                color = undefined;
                break;
        }

        return new vscode.ThemeIcon(iconName, color);
    }

    getChildren(element?: Finding | FindingGroup): Thenable<(Finding | FindingGroup)[]> {
        if (!element) {
            return Promise.resolve(this.getGroupedFindings());
        } else if ('children' in element) {
            return Promise.resolve(element.children);
        } else {
            return Promise.resolve([]);
        }
    }

    getParent(element: Finding | FindingGroup): vscode.ProviderResult<Finding | FindingGroup> {
        const rootGroups = this.getGroupedFindings();

        const findParent = (
            item: Finding | FindingGroup,
            groups: (Finding | FindingGroup)[],
            parent: Finding | FindingGroup | null = null
        ): Finding | FindingGroup | null => {
            for (const group of groups) {
                if (group === item) {
                    return parent;
                }

                if ('children' in group && group.children) {
                    if (group.children.includes(item)) {
                        return group;
                    }

                    const result = findParent(item, group.children, group);
                    if (result) {
                        return result;
                    }
                }
            }

            return null;
        };

        return findParent(element, rootGroups);
    }

    private getGroupedFindings(): (Finding | FindingGroup)[] {
        const validatedFindings = this.validateFindingsAgainstOpenDocuments(this.findings);

        const deterministicFindings: Finding[] = [];
        const aiLabFindings: Finding[] = [];

        for (const finding of validatedFindings) {
            const extended = finding as ExtendedFinding;
            const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

            if (scannerType === 'llm' || scannerType === 'hybrid') {
                aiLabFindings.push(finding);
            } else {
                deterministicFindings.push(finding);
            }
        }

        const scannerGroups: FindingGroup[] = [];

        scannerGroups.push({
            label: `🛡️ Deterministic Scanners (${deterministicFindings.length})`,
            children: deterministicFindings.length > 0 ? this.groupFindingsByConfig(deterministicFindings) : [],
            contextValue: 'scannerTypeGroup'
        });

        scannerGroups.push({
            label: `✨ AI Lab (${aiLabFindings.length})`,
            children: aiLabFindings.length > 0 ? this.groupFindingsByConfig(aiLabFindings) : [],
            contextValue: 'aiLabGroup'
        });

        const hasDeterministic = deterministicFindings.length > 0;
        const hasLLM = aiLabFindings.length > 0;

        if (hasDeterministic && hasLLM) {
            const correlationGroups = this.buildCorrelationGroups();
            const correlationCount = correlationGroups.reduce((sum, g) => sum + g.children.length, 0);
            const conflictCount = correlationGroups.find(g => g.contextValue === 'conflictGroup')?.children.length || 0;

            if (correlationCount > 0) {
                scannerGroups.push({
                    label: `🔗 Correlation (${correlationCount})${conflictCount > 0 ? ` ⚠ ${conflictCount} conflicts` : ''}`,
                    children: correlationGroups,
                    contextValue: 'correlationRootGroup',
                    description: 'Findings confirmed by multiple scanners'
                });
            } else {
                getLogger().debug(LogCategory.Correlation, 'No correlations found between deterministic and LLM findings');
            }
        } else {
            getLogger().debug(LogCategory.Correlation, `Skipping correlation node - need both scanner types (deterministic: ${hasDeterministic}, LLM: ${hasLLM})`);
        }

        return [{
            label: `Vulnerability Triage (${validatedFindings.length})`,
            children: scannerGroups,
            contextValue: 'rootGroup'
        }];
    }

    private groupFindingsByConfig(findings: Finding[]): (Finding | FindingGroup)[] {
        const config = ConfigManager.getConfiguration();
        const groupBy = config.findings.view.groupBy;

        const originalFindings = this.findings;
        this.findings = findings;

        let result: (Finding | FindingGroup)[];
        switch (groupBy) {
            case 'severity':
                result = this.groupBySeverity();
                break;
            case 'file':
                result = this.groupByFile();
                break;
            case 'rule':
                result = this.groupByRule();
                break;
            default:
                result = findings;
                break;
        }

        this.findings = originalFindings;
        return result;
    }

    private buildCorrelationGroups(): FindingGroup[] {
        const findingMap = new Map<string, ExtendedFinding>();
        for (const finding of this.findings) {
            findingMap.set(finding.id, finding as ExtendedFinding);
        }

        const correlatedGroups = new Map<string, ExtendedFinding[]>();
        const processedIds = new Set<string>();

        let findingsWithCorrelations = 0;
        const scannerTypeCounts = { deterministic: 0, llm: 0, hybrid: 0, other: 0 };
        for (const finding of this.findings) {
            const extended = finding as ExtendedFinding;
            const scannerType = extended.scannerType || getScannerType(extended.scannerId || '');

            if (scannerType === 'llm') scannerTypeCounts.llm++;
            else if (scannerType === 'hybrid') scannerTypeCounts.hybrid++;
            else if (scannerType === 'deterministic') scannerTypeCounts.deterministic++;
            else scannerTypeCounts.other++;

            if (extended.correlationMetadata?.relatedFindingIds && extended.correlationMetadata.relatedFindingIds.length > 0) {
                findingsWithCorrelations++;
                getLogger().debug(LogCategory.Correlation, `Finding ${finding.id} (${scannerType}/${extended.scannerId}) has ${extended.correlationMetadata.relatedFindingIds.length} correlations`);
            }
        }
        getLogger().debug(LogCategory.Correlation, `Found ${findingsWithCorrelations}/${this.findings.length} findings with correlation metadata`);
        getLogger().debug(LogCategory.Correlation, 'Scanner type counts:', scannerTypeCounts);

        for (const finding of this.findings) {
            const extended = finding as ExtendedFinding;

            if (processedIds.has(extended.id)) {
                continue;
            }

            if (extended.correlationMetadata?.relatedFindingIds && extended.correlationMetadata.relatedFindingIds.length > 0) {
                const groupId = extended.id;
                const group: ExtendedFinding[] = [extended];
                processedIds.add(extended.id);

                const scannerType = extended.scannerType || getScannerType(extended.scannerId || '');
                getLogger().debug(LogCategory.Correlation, `Creating group for finding ${extended.id} (${scannerType}) with ${extended.correlationMetadata.relatedFindingIds.length} related findings, type: ${extended.correlationMetadata.correlationType}`);
                getLogger().debug(LogCategory.Correlation, `Related IDs for ${extended.id}:`, extended.correlationMetadata.relatedFindingIds);

                for (const relatedId of extended.correlationMetadata.relatedFindingIds) {
                    const relatedFinding = findingMap.get(relatedId);
                    if (relatedFinding && !processedIds.has(relatedId)) {
                        const relatedScannerType = relatedFinding.scannerType || getScannerType(relatedFinding.scannerId || '');
                        getLogger().debug(LogCategory.Correlation, `Added related finding ${relatedId} (${relatedScannerType}) to group`);
                        group.push(relatedFinding);
                        processedIds.add(relatedId);
                    } else if (!relatedFinding) {
                        getLogger().warn(LogCategory.Correlation, `Could not find related finding with ID: ${relatedId}`);
                        getLogger().debug(LogCategory.Correlation, 'Available finding IDs:', Array.from(findingMap.keys()));
                    } else {
                        getLogger().debug(LogCategory.Correlation, `Skipping already processed finding: ${relatedId}`);
                    }
                }

                if (group.length >= 2) {
                    const hasLLM = group.some(f => {
                        const type = f.scannerType || getScannerType(f.scannerId || '');
                        return type === 'llm';
                    });
                    const hasDeterministic = group.some(f => {
                        const type = f.scannerType || getScannerType(f.scannerId || '');
                        return type === 'deterministic';
                    });

                    if (hasLLM && hasDeterministic) {
                        correlatedGroups.set(groupId, group);
                        getLogger().debug(LogCategory.Correlation, `Created group ${groupId} with ${group.length} findings (LLM + Deterministic)`);
                    } else {
                        getLogger().debug(LogCategory.Correlation, `Skipping group ${groupId} - not LLM+Deterministic (hasLLM: ${hasLLM}, hasDet: ${hasDeterministic})`);
                        processedIds.delete(extended.id);
                        for (const f of group) {
                            if (f.id !== extended.id) {
                                processedIds.delete(f.id);
                            }
                        }
                    }
                } else {
                    getLogger().debug(LogCategory.Correlation, `Skipping group ${groupId} - only has ${group.length} finding(s), need at least 2`);
                    processedIds.delete(extended.id);
                }
            }
        }

        getLogger().debug(LogCategory.Correlation, `Created ${correlatedGroups.size} correlation groups`);


        const highConfidence: FindingGroup[] = [];
        const conflicts: FindingGroup[] = [];

        for (const [groupId, groupFindings] of correlatedGroups.entries()) {
            const primaryFinding = groupFindings[0];
            const correlationType = primaryFinding.correlationMetadata?.correlationType || 'related';
            const correlationScore = primaryFinding.correlationMetadata?.correlationScore || 0;
            const scannerAgreement = primaryFinding.correlationMetadata?.scannerAgreement || 'partial';

            if (groupFindings.length < 2) {
                getLogger().debug(LogCategory.Correlation, `Skipping group with only ${groupFindings.length} finding(s)`);
                continue;
            }

            if (correlationType === 'related' || correlationType === 'refinement') {
                getLogger().debug(LogCategory.Correlation, `Skipping low-signal correlation type: ${correlationType} for finding ${primaryFinding.id}`);
                continue;
            }

            const location = primaryFinding.location;
            const fileName = path.basename(location.file);
            const severityEmoji = this.getSeverityEmoji(primaryFinding.severity);

            const typeLabel = correlationType === 'duplicate' ? 'Duplicate' :
                            correlationType === 'augmentation' ? 'Confirmed' :
                            'Conflict';

            const correlationGroup: FindingGroup = {
                label: `${severityEmoji} ${primaryFinding.title.substring(0, 35)}... @ ${fileName}:${location.line}`,
                description: `${typeLabel} • ${Math.round(correlationScore * 100)}% • ${groupFindings.length} scanners`,
                children: groupFindings.map(f => this.createCorrelationFindingNode(f)),
                contextValue: 'correlationGroup',
                correlationScore,
                correlationType,
                scannerCount: groupFindings.length
            };

            if (correlationType === 'duplicate' || correlationType === 'augmentation') {
                highConfidence.push(correlationGroup);
            } else if (correlationType === 'conflict') {
                conflicts.push(correlationGroup);
            }
        }

        const categories: FindingGroup[] = [];

        if (highConfidence.length > 0) {
            highConfidence.sort((a, b) => (b.correlationScore || 0) - (a.correlationScore || 0));

            categories.push({
                label: `✅ Scanner Agreement (${highConfidence.length})`,
                children: highConfidence,
                contextValue: 'highConfidenceGroup',
                description: 'Multiple scanners confirmed these issues'
            });
        }

        if (conflicts.length > 0) {
            categories.push({
                label: `⚠️ Scanner Disagreement (${conflicts.length})`,
                children: conflicts,
                contextValue: 'conflictGroup',
                description: 'Scanners report conflicting severity or details'
            });
        }

        return categories;
    }

    /**
     * Validate findings against open documents and file system
     * Filters out findings that reference files or lines that no longer exist
     */
    private validateFindingsAgainstOpenDocuments(findings: Finding[]): Finding[] {
        const fs = require('fs');
        const validatedFindings: Finding[] = [];

        for (const finding of findings) {
            if (!fs.existsSync(finding.location.file)) {
                getLogger().debug(LogCategory.UI, `Filtering stale finding - file doesn't exist: ${finding.location.file}`);
                getLogger().debug(LogCategory.UI, `  Finding: ${finding.title}`);
                continue;
            }

            const openDocument = vscode.workspace.textDocuments.find(
                doc => doc.uri.fsPath === finding.location.file
            );

            if (!openDocument) {
                validatedFindings.push(finding);
                continue;
            }

            const findingLine = finding.location.line;
            const totalLines = openDocument.lineCount;

            if (findingLine < 1 || findingLine > totalLines) {
                getLogger().debug(LogCategory.UI, `Filtering stale finding from tree - line ${findingLine} doesn't exist (file has ${totalLines} lines): ${finding.title}`);
                continue;
            }

            validatedFindings.push(finding);
        }

        return validatedFindings;
    }

    private getSeverityEmoji(severity: string): string {
        switch (severity) {
            case 'critical': return '⚡';
            case 'high': return '🔴';
            case 'medium': return '🟡';
            case 'low': return '🔵';
            default: return 'ℹ️';
        }
    }

    private createCorrelationFindingNode(finding: ExtendedFinding): FindingGroup {
        const scannerType = finding.scannerType || (finding.scannerId ? getScannerType(finding.scannerId) : 'deterministic');
        const scannerIcon = scannerType === 'llm' || scannerType === 'hybrid' ? '🤖' : '🛡️';
        const scannerLabel = scannerType === 'llm' ? 'LLM' : scannerType === 'hybrid' ? 'Hybrid' : 'Deterministic';

        return {
            label: `${scannerIcon} ${scannerLabel}: "${finding.title}"`,
            description: `${finding.severity.toUpperCase()} • ${finding.confidence}`,
            children: [finding],
            contextValue: 'correlationFindingNode'
        };
    }

    private groupBySeverity(): FindingGroup[] {
        const groups = new Map<string, Finding[]>();

        for (const finding of this.findings) {
            const severity = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
            if (!groups.has(severity)) {
                groups.set(severity, []);
            }
            groups.get(severity)!.push(finding);
        }

        const severityOrder = ['Critical', 'High', 'Medium', 'Low', 'Info'];
        const result: FindingGroup[] = [];

        for (const severity of severityOrder) {
            if (groups.has(severity)) {
                const findings = groups.get(severity)!;
                result.push({
                    label: `${severity} (${findings.length})`,
                    children: findings.sort((a, b) => this._sortFindings(a, b)),
                    contextValue: 'severityGroup'
                });
            }
        }

        return result;
    }

    private _sortFindings(a: Finding, b: Finding): number {
        const extA = a as ExtendedFinding;
        const extB = b as ExtendedFinding;

        const aCorrelations = extA.correlationMetadata?.relatedFindingIds?.length || 0;
        const bCorrelations = extB.correlationMetadata?.relatedFindingIds?.length || 0;
        if (aCorrelations !== bCorrelations) {
            return bCorrelations - aCorrelations;
        }

        const aScore = extA.correlationMetadata?.correlationScore || 0;
        const bScore = extB.correlationMetadata?.correlationScore || 0;
        if (Math.abs(aScore - bScore) > 0.01) {
            return bScore - aScore;
        }

        const confidenceOrder = { high: 3, medium: 2, low: 1 };
        const aConf = confidenceOrder[a.confidence];
        const bConf = confidenceOrder[b.confidence];
        if (aConf !== bConf) {
            return bConf - aConf;
        }

        return a.title.localeCompare(b.title);
    }

    private groupByFile(): FindingGroup[] {
        const groups = new Map<string, Finding[]>();
        
        for (const finding of this.findings) {
            const fileName = path.basename(finding.location.file);
            if (!groups.has(fileName)) {
                groups.set(fileName, []);
            }
            groups.get(fileName)!.push(finding);
        }

        const result: FindingGroup[] = [];
        for (const [fileName, findings] of groups.entries()) {
            result.push({
                label: `${fileName} (${findings.length})`,
                children: findings.sort((a, b) => {
                    return a.location.line - b.location.line;
                }),
                contextValue: 'fileGroup'
            });
        }

        return result.sort((a, b) => a.label.localeCompare(b.label));
    }

    private groupByRule(): FindingGroup[] {
        const groups = new Map<string, Finding[]>();
        
        for (const finding of this.findings) {
            if (!groups.has(finding.rule)) {
                groups.set(finding.rule, []);
            }
            groups.get(finding.rule)!.push(finding);
        }

        const result: FindingGroup[] = [];
        for (const [rule, findings] of groups.entries()) {
            result.push({
                label: `${rule} (${findings.length})`,
                children: findings.sort((a, b) => a.title.localeCompare(b.title)),
                contextValue: 'ruleGroup'
            });
        }

        return result.sort((a, b) => a.label.localeCompare(b.label));
    }

    async loadFindingsWithEpoch(scanEpoch: number): Promise<void> {
        if (scanEpoch <= this.lastAppliedScanEpoch) {
            getLogger().debug(LogCategory.UI, `Ignoring stale findings update (epoch ${scanEpoch} <= ${this.lastAppliedScanEpoch})`);
            return;
        }

        getLogger().debug(LogCategory.UI, `Loading findings for epoch ${scanEpoch} (previous: ${this.lastAppliedScanEpoch})`);

        try {
            const { getLSPClientInstance } = await import('../extension');
            const lspClientInstance = getLSPClientInstance();
            const lspClient = lspClientInstance?.getClient();

            if (!lspClient) {
                getLogger().warn(LogCategory.LSP, 'LSP client not available for loading findings');
                await this.updateFindings([]);
                return;
            }

            const response = await lspClient.sendRequest('tameshi/getFindings', {
                scope: { type: 'workspace' },
                min_severity: 'low',
                min_confidence: 'low'
            }) as LSPGetFindingsResponse;

            if (response && response.findings) {
                getLogger().debug(LogCategory.LSP, `Received ${response.findings.length} findings from LSP`);

                const findingsByFile = new Map<string, number>();
                for (const f of response.findings) {
                    const file = f.locations[0]?.file || 'unknown';
                    findingsByFile.set(file, (findingsByFile.get(file) || 0) + 1);
                }
                getLogger().debug(LogCategory.LSP, 'Findings by file:');
                for (const [file, count] of findingsByFile.entries()) {
                    const basename = file.split('/').pop();
                    getLogger().debug(LogCategory.LSP, `  - ${basename}: ${count} findings`);
                }

                const findingsWithLSPCorrelations = response.findings.filter((f: LSPFinding) =>
                    f.metadata?.correlations && Array.isArray(f.metadata.correlations) && f.metadata.correlations.length > 0
                ).length;
                getLogger().debug(LogCategory.LSP, `${findingsWithLSPCorrelations} findings have LSP correlation metadata`);

                const rawFindings: ExtendedFinding[] = response.findings.map((lspFinding: LSPFinding) => ({
                    id: lspFinding.id,
                    rule: lspFinding.scanner_id || lspFinding.rule || 'unknown',
                    severity: mapSeverity(lspFinding.severity),
                    confidence: mapConfidence(lspFinding.confidence),
                    title: lspFinding.title,
                    description: lspFinding.description,
                    location: {
                        file: lspFinding.locations[0]?.file || '',
                        line: lspFinding.locations[0]?.line || 1,
                        column: lspFinding.locations[0]?.column || 1,
                        endLine: lspFinding.locations[0]?.end_line,
                        endColumn: lspFinding.locations[0]?.end_column
                    },
                    code: lspFinding.code_frame?.content || lspFinding.finding_type,
                    references: Array.isArray(lspFinding.metadata?.references)
                        ? lspFinding.metadata.references as string[]
                        : [],

                    scannerId: lspFinding.scanner_id,
                    findingType: lspFinding.finding_type,
                    scannerType: lspFinding.scanner_type
                        ? mapScannerType(lspFinding.scanner_type)
                        : (lspFinding.metadata?.analysis_type && typeof lspFinding.metadata.analysis_type === 'string'
                            ? mapScannerType(lspFinding.metadata.analysis_type)
                            : undefined),
                    metadata: lspFinding.metadata || {},

                    correlationMetadata: this.convertLSPCorrelations(lspFinding.metadata?.correlations as LSPCorrelation[] | undefined),

                    augmentedData: lspFinding.augmented_data as import('../types/findings').AugmentedData | undefined,

                    detectedAt: lspFinding.detected_at ? new Date(lspFinding.detected_at) : undefined,
                    augmentedAt: lspFinding.augmented_at ? new Date(lspFinding.augmented_at) : undefined
                }));

                const beforeClientCorrelation = rawFindings.filter(f =>
                    f.correlationMetadata?.relatedFindingIds && f.correlationMetadata.relatedFindingIds.length > 0
                ).length;
                getLogger().debug(LogCategory.Correlation, `Before client correlation: ${beforeClientCorrelation} findings have correlation metadata`);

                this.rawFindings = this.correlationService.correlateFindings(rawFindings);

                const afterClientCorrelation = this.rawFindings.filter(f =>
                    f.correlationMetadata?.relatedFindingIds && f.correlationMetadata.relatedFindingIds.length > 0
                ).length;
                getLogger().debug(LogCategory.Correlation, `After client correlation: ${afterClientCorrelation} findings have correlation metadata`);


                this.mergedFindings = this.correlationService.mergeDuplicates(this.rawFindings);

                this.findings = this.mergeMode ? this.mergedFindings : this.rawFindings;

                await this.updateFindings(this.findings);

                this.lastAppliedScanEpoch = scanEpoch;
                getLogger().debug(LogCategory.UI, `Loaded ${rawFindings.length} findings, ${this.mergedFindings.length} after merge (mode: ${this.mergeMode ? 'merged' : 'raw'}, epoch: ${scanEpoch})`);
            } else {
                this.rawFindings = [];
                this.mergedFindings = [];
                await this.updateFindings([]);

                this.lastAppliedScanEpoch = scanEpoch;
                getLogger().debug(LogCategory.LSP, `No findings returned from LSP server (epoch: ${scanEpoch})`);
            }
        } catch (error) {
            getLogger().error(LogCategory.LSP, `Failed to load findings for epoch ${scanEpoch}:`, error);
            await this.updateFindings([]);
        }
    }

    async loadFindings(): Promise<void> {
        await this.loadFindingsWithEpoch(0);
    }

    private convertLSPCorrelations(lspCorrelations: LSPCorrelation[] | undefined): import('../types/findings').CorrelationMetadata | undefined {
        if (!lspCorrelations || lspCorrelations.length === 0) {
            return undefined;
        }

        const relatedFindingIds = lspCorrelations.map((c: LSPCorrelation) => c.related_finding_id);

        const relationships = lspCorrelations.map((c: LSPCorrelation) => c.relationship);
        let correlationType: import('../types/findings').CorrelationType = 'related';

        if (relationships.includes('same_vulnerability')) {
            correlationType = 'duplicate';
        } else if (relationships.includes('confirms')) {
            correlationType = 'augmentation';
        } else if (relationships.includes('contradicts')) {
            correlationType = 'conflict';
        } else if (relationships.includes('related')) {
            correlationType = 'related';
        }

        const scores = lspCorrelations.map((c: LSPCorrelation) => c.correlation_strength || 0);
        const correlationScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        let scannerAgreement: 'full' | 'partial' | 'conflict' = 'partial';
        if (correlationType === 'duplicate' || correlationType === 'augmentation') {
            scannerAgreement = 'full';
        } else if (correlationType === 'conflict') {
            scannerAgreement = 'conflict';
        }

        return {
            relatedFindingIds,
            correlationType,
            correlationScore,
            scannerAgreement,
            validationStatus: 'pending'
        };
    }

}