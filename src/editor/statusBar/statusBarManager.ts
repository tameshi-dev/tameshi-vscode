import * as vscode from 'vscode';
import { Finding } from '../../types';
import { StatusBarFormatter } from './statusBarFormatter';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private currentLineItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'workbench.view.extension.tameshi';

        this.currentLineItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
    }

    update(findings: Finding[]): void {
        const { text, tooltip, backgroundColor } = StatusBarFormatter.format(findings);

        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.backgroundColor = backgroundColor;
        this.statusBarItem.show();
    }

    /**
     * Update status bar with info about findings on the current line
     */
    updateCurrentLine(findings: Finding[]): void {
        if (findings.length === 0) {
            this.currentLineItem.hide();
            return;
        }

        if (findings.length === 1) {
            const finding = findings[0];
            const severityIcon = this.getSeverityIcon(finding.severity);
            this.currentLineItem.text = `${severityIcon} ${finding.title}`;
            this.currentLineItem.tooltip = `${finding.severity.toUpperCase()}: ${finding.description}`;
            this.currentLineItem.backgroundColor = undefined;
        } else {
            const highestSeverity = this.getHighestSeverity(findings);
            const severityIcon = this.getSeverityIcon(highestSeverity);
            const scannerTypes = this.getUniqueScannerTypes(findings);

            this.currentLineItem.text = `${severityIcon} ${findings.length} findings`;
            this.currentLineItem.tooltip = this.buildMultiFindingTooltip(findings, scannerTypes);
            this.currentLineItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        this.currentLineItem.show();
    }

    private getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'critical': return '$(error)';
            case 'high': return '$(warning)';
            case 'medium': return '$(info)';
            case 'low': return '$(circle-outline)';
            default: return '$(info)';
        }
    }

    private getHighestSeverity(findings: Finding[]): string {
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        for (const severity of severityOrder) {
            if (findings.some(f => f.severity === severity)) {
                return severity;
            }
        }
        return 'info';
    }

    private getUniqueScannerTypes(findings: Finding[]): string[] {
        const types = new Set<string>();
        for (const finding of findings) {
            const scannerType = (finding as any).scannerType || 'deterministic';
            types.add(scannerType);
        }
        return Array.from(types);
    }

    private buildMultiFindingTooltip(findings: Finding[], scannerTypes: string[]): string {
        const scannerLabels = scannerTypes.map(t =>
            t === 'llm' ? 'AI Lab' :
            t === 'deterministic' ? 'Deterministic' :
            t === 'ir' ? 'IR Analysis' :
            t === 'hybrid' ? 'Hybrid' : t
        );

        let tooltip = `${findings.length} findings on this line\n`;

        if (scannerTypes.length > 1) {
            tooltip += `Scanner Agreement: ${scannerLabels.join(' + ')}\n`;
        }

        tooltip += '\n';
        for (const [i, finding] of findings.entries()) {
            tooltip += `${i + 1}. [${finding.severity.toUpperCase()}] ${finding.title}\n`;
        }

        return tooltip;
    }

    hide(): void {
        this.statusBarItem.hide();
        this.currentLineItem.hide();
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.currentLineItem.dispose();
    }
}
