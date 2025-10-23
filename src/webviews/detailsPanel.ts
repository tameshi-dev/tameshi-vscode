import * as vscode from 'vscode';
import { Finding } from '../views/findingsView';
import { ExtendedFinding, getScannerType } from '../types/findings';
import { getLSPClientInstance } from '../extension';
import { getLogger, LogCategory } from '../utils/logger';

export class DetailsPanel {
    public static currentPanel: DetailsPanel | undefined;
    public static readonly viewType = 'tameshiDetails';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _finding: Finding | undefined;
    private _isLoading: boolean = false;
    private _isInitialized: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, finding?: Finding) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        if (DetailsPanel.currentPanel) {
            getLogger().debug(LogCategory.UI, 'Panel already exists, revealing...');
            getLogger().debug(LogCategory.UI, 'Panel visible:', DetailsPanel.currentPanel._panel.visible);
            getLogger().debug(LogCategory.UI, 'Panel active:', DetailsPanel.currentPanel._panel.active);

            const currentColumn = DetailsPanel.currentPanel._panel.viewColumn || vscode.ViewColumn.Two;
            DetailsPanel.currentPanel._panel.reveal(currentColumn, false);

            getLogger().debug(LogCategory.UI, 'After reveal - visible:', DetailsPanel.currentPanel._panel.visible);
            getLogger().debug(LogCategory.UI, 'After reveal - active:', DetailsPanel.currentPanel._panel.active);

            if (finding) {
                getLogger().debug(LogCategory.UI, 'Updating finding:', finding.id);
                DetailsPanel.currentPanel.updateFinding(finding);
            }
            return DetailsPanel.currentPanel;
        }

        getLogger().debug(LogCategory.UI, 'Creating new panel in column:', column);
        const panel = vscode.window.createWebviewPanel(
            DetailsPanel.viewType,
            'Finding Details',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        DetailsPanel.currentPanel = new DetailsPanel(panel, extensionUri, finding);
        getLogger().debug(LogCategory.UI, 'New panel created');
        return DetailsPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, finding?: Finding) {
        getLogger().debug(LogCategory.UI, 'Constructor called with finding:', finding?.id || 'NO FINDING');
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._finding = finding;

        this._isInitialized = true;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => {
            },
            null,
            this._disposables
        );
    }

    public async updateFinding(finding: Finding) {
        getLogger().debug(LogCategory.UI, 'updateFinding() called with:', finding.id, 'initialized:', this._isInitialized);
        this._finding = finding;
        this._panel.title = `Finding: ${finding.title}`;

        if (this._isInitialized) {
            this._isLoading = true;
            this._update();
        }

        try {
            const lspClient = getLSPClientInstance();
            const detailsService = lspClient?.getDetailsService();

            if (detailsService) {
                const enrichedFinding = await detailsService.fetchDetails(finding.id);

                if (enrichedFinding) {
                    this._finding = { ...finding, ...enrichedFinding } as Finding;
                }
            }
        } catch (error) {
            getLogger().warn(LogCategory.UI, 'Failed to fetch finding details:', error);
        } finally {
            this._isLoading = false;
            if (this._isInitialized) {
                this._update();
            }
        }
    }

    public dispose() {
        DetailsPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        getLogger().debug(LogCategory.UI, '_update() called, finding:', this._finding?.id || 'NO FINDING');
        getLogger().debug(LogCategory.UI, '_update() isLoading:', this._isLoading);
        const webview = this._panel.webview;
        const html = this._getHtmlForWebview(webview);
        getLogger().debug(LogCategory.UI, 'Generated HTML length:', html.length);
        getLogger().debug(LogCategory.UI, 'HTML preview:', html.substring(0, 200));
        this._panel.webview.html = html;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        if (!this._finding) {
            return `<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Finding Details</title>
                </head>
                <body>
                    <p>No finding selected</p>
                </body>
                </html>`;
        }

        const finding = this._finding;
        const severityClass = `severity-${finding.severity}`;
        const confidenceClass = `confidence-${finding.confidence}`;
        const loadingIndicator = this._isLoading ? '<div class="loading-indicator">Loading enriched details...</div>' : '';

        return `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Finding Details</title>
            </head>
            <body>
                <div class="container">
                    ${loadingIndicator}
                    <header class="finding-header">
                        <h1 class="finding-title">${escapeHtml(finding.title)}</h1>
                        <div class="finding-meta">
                            <span class="severity ${severityClass}">${finding.severity.toUpperCase()}</span>
                            <span class="confidence ${confidenceClass}">Confidence: ${finding.confidence}</span>
                            <span class="rule">Rule: ${escapeHtml(finding.rule)}</span>
                        </div>
                    </header>

                    <section class="finding-description">
                        <h2>Description</h2>
                        <p>${escapeHtml(finding.description)}</p>
                    </section>

                    <section class="finding-location">
                        <h2>Location</h2>
                        <div class="location-info">
                            ${this._renderFilePath(finding.location.file)}
                            <p><strong>Line:</strong> ${finding.location.line}</p>
                            <p><strong>Column:</strong> ${finding.location.column}</p>
                        </div>
                    </section>

                    ${this._renderScannerBadges(finding)}

                    ${this._renderCodeFrame(finding)}

                    ${this._renderAugmentedData(finding)}

                    ${this._renderRemediationGuidance(finding)}

                    ${this._renderRelatedFindings(finding)}

                    ${finding.references && finding.references.length > 0 ? `
                    <section class="finding-references">
                        <h2>References</h2>
                        <ul>
                            ${finding.references.map(ref => `
                                <li>${escapeHtml(ref)}</li>
                            `).join('')}
                        </ul>
                    </section>
                    ` : ''}
                </div>
            </body>
            </html>`;
    }

    private _renderFilePath(filePath: string): string {
        const fs = require('fs');
        const path = require('path');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const fileExists = fs.existsSync(filePath);

        if (!fileExists) {
            const basename = path.basename(filePath);
            const dirname = path.dirname(filePath);

            let suggestion = '';
            if (workspaceFolder) {
                const possiblePath = path.join(workspaceFolder.uri.fsPath, 'test-workspace', basename);
                if (fs.existsSync(possiblePath)) {
                    suggestion = `<p class="warning-note">⚠️ <strong>Note:</strong> This finding references a stale path. File may exist at: <code>${escapeHtml(possiblePath)}</code></p>`;
                }
            }

            return `
                <div class="stale-path-warning">
                    <p><strong>File:</strong> <code style="color: #f48771;">${escapeHtml(filePath)}</code> <span style="color: #f48771; font-weight: bold;">⚠️ FILE NOT FOUND</span></p>
                    <p class="warning-note">⚠️ <strong>Warning:</strong> This finding references a file that doesn't exist. This is likely stale data from the LSP server cache.</p>
                    ${suggestion}
                </div>`;
        }

        return `<p><strong>File:</strong> ${escapeHtml(filePath)}</p>`;
    }

    private _renderScannerBadges(finding: Finding): string {
        const extended = finding as ExtendedFinding;
        if (!extended.scannerId && !extended.scannerType) {
            return '';
        }

        const scannerType = extended.scannerType || getScannerType(extended.scannerId || '');
        const scannerIcons: Record<string, string> = {
            'deterministic': '🛡️',
            'llm': '✨',
            'hybrid': '🔬',
            'ir': '⚙️',
            'source': '📝'
        };

        const scannerNames: Record<string, string> = {
            'deterministic': 'Deterministic',
            'llm': 'LLM-based',
            'hybrid': 'Hybrid',
            'ir': 'IR Analysis',
            'source': 'Source'
        };

        const icon = scannerIcons[scannerType] || '🔍';
        const name = scannerNames[scannerType] || 'Unknown';

        let badgeHtml = `
            <section class="scanner-info">
                <div class="scanner-badge">
                    <span class="scanner-icon">${icon}</span>
                    <span class="scanner-name">${name}</span>
                    ${extended.scannerId ? `<span class="scanner-id">${escapeHtml(extended.scannerId)}</span>` : ''}
                </div>
        `;

        if (extended.correlationMetadata) {
            const meta = extended.correlationMetadata;
            if (meta.relatedFindingIds && meta.relatedFindingIds.length > 0) {
                badgeHtml += `
                    <div class="correlation-info">
                        <span class="correlation-badge">Confirmed by ${meta.relatedFindingIds.length} scanner${meta.relatedFindingIds.length > 1 ? 's' : ''}</span>
                        ${meta.confidenceBoost ? `<span class="confidence-boost">+${Math.round(meta.confidenceBoost * 100)}% confidence</span>` : ''}
                    </div>
                `;
            }
        }

        badgeHtml += '</section>';
        return badgeHtml;
    }

    private _renderCodeFrame(finding: Finding): string {
        if (!finding.code) {
            return '';
        }

        const lines = finding.code.split('\n');
        const startLine = finding.location.line;

        const codeWithLineNumbers = lines.map((line, idx) => {
            const lineNum = startLine + idx;
            const isHighlighted = lineNum === finding.location.line;
            return `<div class="code-line ${isHighlighted ? 'highlighted' : ''}"><span class="line-number">${lineNum}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
        }).join('');

        return `
            <section class="finding-code">
                <h2>Code Frame</h2>
                <div class="code-frame">
                    ${codeWithLineNumbers}
                </div>
            </section>
        `;
    }

    private _renderAugmentedData(finding: Finding): string {
        const extended = finding as ExtendedFinding;
        if (!extended.augmentedData) {
            return '';
        }

        const augmentedData = extended.augmentedData;
        let html = '<section class="augmented-data">';

        if (augmentedData.riskScore !== undefined) {
            const riskLevel = augmentedData.riskScore >= 75 ? 'critical' : augmentedData.riskScore >= 50 ? 'high' : augmentedData.riskScore >= 25 ? 'medium' : 'low';
            html += `
                <div class="risk-score">
                    <h3>Risk Score</h3>
                    <div class="risk-meter">
                        <div class="risk-fill risk-${riskLevel}" style="width: ${augmentedData.riskScore}%"></div>
                    </div>
                    <span class="risk-value">${augmentedData.riskScore}/100</span>
                </div>
            `;
        }

        if (augmentedData.contextualAnalysis) {
            html += `
                <details class="collapsible" open>
                    <summary><h3>Contextual Analysis</h3></summary>
                    <div class="content">${escapeHtml(augmentedData.contextualAnalysis)}</div>
                </details>
            `;
        }

        if (augmentedData.impactAssessment) {
            html += `
                <details class="collapsible" open>
                    <summary><h3>Impact Assessment</h3></summary>
                    <div class="content">${escapeHtml(augmentedData.impactAssessment)}</div>
                </details>
            `;
        }

        if (augmentedData.exploitScenario) {
            html += `
                <details class="collapsible">
                    <summary><h3>Exploit Scenario</h3></summary>
                    <div class="content exploit-scenario">${escapeHtml(augmentedData.exploitScenario)}</div>
                </details>
            `;
        }

        if (augmentedData.similarPatterns && augmentedData.similarPatterns.length > 0) {
            html += `
                <details class="collapsible">
                    <summary><h3>Similar Patterns</h3></summary>
                    <ul class="similar-patterns">
                        ${augmentedData.similarPatterns.map(pattern => `<li>${escapeHtml(pattern)}</li>`).join('')}
                    </ul>
                </details>
            `;
        }

        if (augmentedData.codeExamples && augmentedData.codeExamples.length > 0) {
            html += `
                <details class="collapsible">
                    <summary><h3>Code Examples</h3></summary>
                    <div class="code-examples">
                        ${augmentedData.codeExamples.map(example => `<pre><code>${escapeHtml(example)}</code></pre>`).join('')}
                    </div>
                </details>
            `;
        }

        html += '</section>';
        return html;
    }

    private _renderRemediationGuidance(finding: Finding): string {
        const extended = finding as ExtendedFinding;
        if (!extended.augmentedData?.remediationGuidance || extended.augmentedData.remediationGuidance.length === 0) {
            return '';
        }

        const steps = extended.augmentedData.remediationGuidance;
        return `
            <section class="remediation-guidance">
                <h2>Remediation Steps</h2>
                <ol class="remediation-steps">
                    ${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                </ol>
            </section>
        `;
    }

    private _renderRelatedFindings(finding: Finding): string {
        const extended = finding as ExtendedFinding;
        if (!extended.correlationMetadata?.relatedFindingIds || extended.correlationMetadata.relatedFindingIds.length === 0) {
            return '';
        }

        const relatedIds = extended.correlationMetadata.relatedFindingIds;

        const lspClient = getLSPClientInstance();
        const findingsProvider = (lspClient as any)?.findingsProvider;
        const allFindings = findingsProvider ? findingsProvider.getFindings() : [];

        const findingMap = new Map<string, Finding>();
        for (const f of allFindings) {
            findingMap.set(f.id, f);
        }

        return `
            <section class="related-findings">
                <h2>Related Findings</h2>
                <p class="related-info">This finding is correlated with ${relatedIds.length} other finding${relatedIds.length > 1 ? 's' : ''}:</p>
                <ul class="related-list">
                    ${relatedIds.map((id: string) => {
                        const relatedFinding = findingMap.get(id);
                        if (relatedFinding) {
                            const relatedExtended = relatedFinding as ExtendedFinding;
                            const scannerType = relatedExtended.scannerType || getScannerType(relatedExtended.scannerId || '');
                            const scannerIcon = scannerType === 'llm' ? '✨' : scannerType === 'hybrid' ? '🔬' : '🛡️';
                            const severityColor = relatedFinding.severity === 'critical' ? 'red' :
                                                  relatedFinding.severity === 'high' ? 'orange' :
                                                  relatedFinding.severity === 'medium' ? 'yellow' : 'blue';
                            const fileName = relatedFinding.location.file.split('/').pop();

                            return `
                                <li class="related-item">
                                    <div class="related-header">
                                        <span class="related-scanner">${scannerIcon} ${escapeHtml(relatedExtended.scannerId || 'Unknown')}</span>
                                        <span class="related-severity" style="background-color: ${severityColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em;">${relatedFinding.severity.toUpperCase()}</span>
                                    </div>
                                    <div class="related-title">${escapeHtml(relatedFinding.title)}</div>
                                    <div class="related-location" style="color: #888; font-size: 0.9em;">${escapeHtml(fileName || '')}:${relatedFinding.location.line}</div>
                                </li>
                            `;
                        } else {
                            return `
                                <li class="related-item">
                                    <div class="related-title" style="color: #888;">Finding not found in current results</div>
                                    <div class="related-location" style="font-size: 0.8em; color: #666;">ID: ${escapeHtml(id.substring(0, 8))}...</div>
                                </li>
                            `;
                        }
                    }).join('')}
                </ul>
            </section>
        `;
    }
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}