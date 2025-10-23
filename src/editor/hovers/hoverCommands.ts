import * as vscode from 'vscode';
import { ExtendedFinding } from '../../types/findings';

export class HoverCommands {
    private static outputChannel: vscode.OutputChannel | undefined;

    static register(context: vscode.ExtensionContext): void {
        this.outputChannel = vscode.window.createOutputChannel('Tameshi Finding Details');
        context.subscriptions.push(this.outputChannel);

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'tameshi.viewFindingDetails',
                this.handleViewFindingDetails.bind(this)
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'tameshi.viewAllFindings',
                this.handleViewAllFindings.bind(this)
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'tameshi.showCorrelation',
                this.handleShowCorrelation
            )
        );


        context.subscriptions.push(
            vscode.commands.registerCommand(
                'tameshi.viewFunctionFindings',
                this.handleViewFunctionFindings
            )
        );
    }

    private static handleViewFindingDetails(finding: ExtendedFinding): void {
        if (!this.outputChannel) {
            return;
        }

        this.outputChannel.clear();
        this.outputChannel.show(true);

        const separator = '═'.repeat(80);
        const divider = '─'.repeat(80);

        this.outputChannel.appendLine(separator);

        const severityEmoji = this.getSeverityEmoji(finding.severity);
        const severityUpper = (finding.severity || 'unknown').toUpperCase();
        this.outputChannel.appendLine(`${severityEmoji} ${severityUpper}: ${finding.title}`);

        this.outputChannel.appendLine(separator);
        this.outputChannel.appendLine('');

        if (finding.description) {
            this.outputChannel.appendLine('📝 DESCRIPTION:');
            this.outputChannel.appendLine(this.wrapText(finding.description, 80));
            this.outputChannel.appendLine('');
        }

        if (finding.location) {
            this.outputChannel.appendLine('📍 LOCATION:');
            this.outputChannel.appendLine(`File:   ${finding.location.file}`);
            this.outputChannel.appendLine(`Line:   ${finding.location.line}:${finding.location.column}`);
            this.outputChannel.appendLine('');
        }

        this.outputChannel.appendLine('🔍 SCANNER:');
        this.outputChannel.appendLine(`Type:       ${finding.scannerType || 'unknown'}`);
        this.outputChannel.appendLine(`ID:         ${finding.scannerId || 'unknown'}`);
        if (finding.rule) {
            this.outputChannel.appendLine(`Rule:       ${finding.rule}`);
        }
        this.outputChannel.appendLine('');

        if (finding.confidence) {
            this.outputChannel.appendLine(`⚡ CONFIDENCE: ${finding.confidence}`);
            this.outputChannel.appendLine('');
        }

        if (finding.correlationMetadata?.relatedFindingIds && finding.correlationMetadata.relatedFindingIds.length > 0) {
            const count = finding.correlationMetadata.relatedFindingIds.length;
            this.outputChannel.appendLine(`🔗 RELATED FINDINGS: ${count} correlated finding${count > 1 ? 's' : ''}`);
            for (const id of finding.correlationMetadata.relatedFindingIds.slice(0, 5)) {
                this.outputChannel.appendLine(`  - ${id}`);
            }
            if (finding.correlationMetadata.relatedFindingIds.length > 5) {
                this.outputChannel.appendLine(`  ... and ${finding.correlationMetadata.relatedFindingIds.length - 5} more`);
            }
            this.outputChannel.appendLine('');
        }

        if (finding.code) {
            this.outputChannel.appendLine('💻 CODE:');
            this.outputChannel.appendLine(divider);
            this.outputChannel.appendLine(finding.code);
            this.outputChannel.appendLine(divider);
            this.outputChannel.appendLine('');
        }

        if (finding.references && finding.references.length > 0) {
            this.outputChannel.appendLine('📚 REFERENCES:');
            for (const ref of finding.references) {
                this.outputChannel.appendLine(`  - ${ref}`);
            }
            this.outputChannel.appendLine('');
        }

        if (finding.metadata) {
            this.outputChannel.appendLine('📋 METADATA:');
            this.outputChannel.appendLine(JSON.stringify(finding.metadata, null, 2));
            this.outputChannel.appendLine('');
        }

        this.outputChannel.appendLine(separator);
        this.outputChannel.appendLine(`Finding ID: ${finding.id}`);
        this.outputChannel.appendLine(separator);
    }

    private static handleViewAllFindings(args: { findings: ExtendedFinding[] }): void {
        vscode.commands.executeCommand('workbench.view.extension.tameshi');
    }

    private static handleShowCorrelation(args: { correlationId: string }): void {
        vscode.commands.executeCommand('workbench.view.extension.tameshi');
    }

    private static handleViewFunctionFindings(args: { functionName: string; findings: string[] }): void {
        vscode.commands.executeCommand('workbench.view.extension.tameshi');
    }

    private static getSeverityEmoji(severity: string): string {
        const map: Record<string, string> = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🔵',
            'info': 'ℹ️'
        };
        return map[severity] || '⚪';
    }

    private static wrapText(text: string, maxWidth: number): string {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            if (currentLine.length + word.length + 1 <= maxWidth) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                }
                currentLine = word;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.join('\n');
    }
}
