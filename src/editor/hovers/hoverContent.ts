import * as vscode from 'vscode';
import { Finding, Severity } from '../../types';
import { getConfig } from '../../config';

export interface HoverContentOptions {
    showAllScanners?: boolean;
    showCorrelationCount?: boolean;
    showQuickActions?: boolean;
    selectedFindingId?: string;
}

export class HoverContent {
    static build(findings: Finding[], options: HoverContentOptions = {}): vscode.MarkdownString {
        const config = getConfig();
        const opts = {
            showAllScanners: options.showAllScanners ?? config.editor?.hovers?.showAllScanners ?? true,
            showCorrelationCount: options.showCorrelationCount ?? config.editor?.hovers?.showCorrelationCount ?? true,
            showQuickActions: options.showQuickActions ?? config.editor?.hovers?.showQuickActions ?? true
        };

        if (findings.length === 0) {
            return new vscode.MarkdownString('No findings at this location');
        }

        if (findings.length === 1) {
            return this.buildSingleFinding(findings[0], opts);
        }

        return this.buildMultipleFindings(findings, opts);
    }

    private static buildSingleFinding(finding: Finding, options: HoverContentOptions): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true;

        const emoji = this.getSeverityEmoji(finding.severity);
        md.appendMarkdown(`### ${emoji} ${this.escapeMarkdown(finding.title)}\n\n`);

        const scannerName = this.getScannerDisplayName(finding.scannerId || 'unknown');
        const scannerType = finding.scannerType || 'deterministic';
        md.appendMarkdown(`**Scanner:** ${scannerName} (${scannerType})\n\n`);

        const severityBadge = this.getSeverityBadge(finding.severity);
        md.appendMarkdown(`**Severity:** ${severityBadge}\n\n`);

        if (finding.description) {
            md.appendMarkdown(`${this.escapeMarkdown(finding.description)}\n\n`);
        }

        if (options.showCorrelationCount && finding.correlationId) {
            const correlationType = finding.correlationType || 'related';
            md.appendMarkdown(`**Correlation:** ${this.getCorrelationBadge(correlationType)}\n\n`);
        }

        if (options.showQuickActions) {
            md.appendMarkdown('---\n\n');
            md.appendMarkdown(this.buildQuickActions(finding));
        }

        return md;
    }

    private static buildMultipleFindings(findings: Finding[], options: HoverContentOptions): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true;

        md.appendMarkdown(`### $(warning) ${findings.length} Findings on This Line\n\n`);

        const byType = this.groupByScannerType(findings);
        const hasMultipleTypes = byType.size > 1;

        if (hasMultipleTypes) {
            const types = Array.from(byType.keys()).map(t =>
                t === 'deterministic' ? 'Deterministic' :
                t === 'llm' ? 'AI Lab' :
                t === 'ir' ? 'IR Analysis' :
                t === 'hybrid' ? 'Hybrid' : t
            ).join(' + ');
            md.appendMarkdown(`**Scanner Agreement:** $(check) ${types}\n\n`);
        }

        md.appendMarkdown('---\n\n');

        for (const [index, finding] of findings.entries()) {
            const isSelected = finding.id === options.selectedFindingId;
            const emoji = this.getSeverityEmoji(finding.severity);
            const scannerName = this.getScannerDisplayName(finding.scannerId || 'unknown');
            const scannerType = finding.scannerType || 'deterministic';
            const severityBadge = this.getSeverityBadge(finding.severity);

            if (isSelected) {
                md.appendMarkdown(`**▶ Shown in Gutter**\n\n`);
            }

            md.appendMarkdown(`**${index + 1}. ${emoji} ${this.escapeMarkdown(finding.title)}**\n\n`);

            md.appendMarkdown(`**Scanner:** ${scannerName} (${scannerType}) | **Severity:** ${severityBadge}\n\n`);

            if (finding.description) {
                const desc = finding.description.length > 200
                    ? finding.description.substring(0, 200) + '...'
                    : finding.description;
                md.appendMarkdown(`${this.escapeMarkdown(desc)}\n\n`);
            }

            if (options.showQuickActions) {
                const actions: string[] = [];

                const showInTreeUri = vscode.Uri.parse(
                    `command:tameshi.showInFindings?${encodeURIComponent(JSON.stringify(finding))}`
                );
                actions.push(`[🌳 Show in Tree](${showInTreeUri})`);

                const detailsUri = vscode.Uri.parse(
                    `command:tameshi.openFindingDetails?${encodeURIComponent(JSON.stringify(finding))}`
                );
                actions.push(`[ℹ️ Details](${detailsUri})`);


                md.appendMarkdown(actions.join(' • ') + '\n\n');
            }

            if (index < findings.length - 1) {
                md.appendMarkdown('---\n\n');
            }
        }

        return md;
    }

    private static buildQuickActions(finding: Finding): string {
        const actions: string[] = [];

        const showInFindingsUri = vscode.Uri.parse(`command:tameshi.showInFindings?${encodeURIComponent(JSON.stringify(finding))}`);
        actions.push(`[🌳 Show in Tree](${showInFindingsUri} "Navigate to this finding in the Findings view")`);

        const detailsUri = vscode.Uri.parse(`command:tameshi.openFindingDetails?${encodeURIComponent(JSON.stringify(finding))}`);
        actions.push(`[ℹ️ Details](${detailsUri} "View full finding details")`);


        if (finding.correlationId) {
            const correlationUri = vscode.Uri.parse(`command:tameshi.showCorrelation?${encodeURIComponent(JSON.stringify({ correlationId: finding.correlationId }))}`);
            actions.push(`[🔗 Correlation](${correlationUri} "Show correlated findings")`);
        }

        return actions.join('  •  ');
    }

    private static getSeverityEmoji(severity: Severity): string {
        const map: Record<Severity, string> = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🔵',
            'info': 'ℹ️',
            'informational': 'ℹ️'
        };
        return map[severity] || '⚪';
    }

    private static getSeverityBadge(severity: Severity): string {
        const colors: Record<Severity, string> = {
            'critical': 'red',
            'high': 'orange',
            'medium': 'yellow',
            'low': 'blue',
            'info': 'gray',
            'informational': 'gray'
        };
        const color = colors[severity] || 'gray';
        return `<span style="background-color: ${color}; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;">${severity.toUpperCase()}</span>`;
    }

    private static getCorrelationBadge(correlationType: string): string {
        const labels: Record<string, string> = {
            'augmentation': '$(check) Augmentation (LLM + Deterministic)',
            'duplicate': '$(copy) Duplicate',
            'conflict': '$(warning) Conflict',
            'related': '$(link) Related',
            'refinement': '$(arrow-right) Refinement'
        };
        return labels[correlationType] || correlationType;
    }

    private static getScannerDisplayName(scannerId: string): string {
        const normalized = scannerId.toLowerCase();

        const genericMap: Record<string, string> = {
            'ai_scanner': 'AI Scanner',
            'llm_scanner': 'LLM Scanner',
            'openai': 'OpenAI',
            'anthropic': 'Claude'
        };

        if (genericMap[normalized]) {
            return genericMap[normalized];
        }

        return scannerId.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    private static groupByScannerType(findings: Finding[]): Map<string, Finding[]> {
        const grouped = new Map<string, Finding[]>();
        for (const finding of findings) {
            const type = finding.scannerType || 'deterministic';
            if (!grouped.has(type)) {
                grouped.set(type, []);
            }
            grouped.get(type)!.push(finding);
        }
        return grouped;
    }

    private static escapeMarkdown(text: string): string {
        return text
            .replace(/\\/g, '\\\\')
            .replace(/\*/g, '\\*')
            .replace(/_/g, '\\_')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/`/g, '\\`');
    }
}
