import * as vscode from 'vscode';
import { Finding, Severity } from '../../types';

export interface StatusBarContent {
    text: string;
    tooltip: vscode.MarkdownString;
    backgroundColor: vscode.ThemeColor | undefined;
}

export class StatusBarFormatter {
    static format(findings: Finding[]): StatusBarContent {
        const critical = findings.filter(f => f.severity === 'critical').length;
        const high = findings.filter(f => f.severity === 'high').length;
        const medium = findings.filter(f => f.severity === 'medium').length;
        const low = findings.filter(f => f.severity === 'low').length;

        let text = '$(shield) Tameshi: ';

        if (critical > 0) {
            text += `${critical}$(error) `;
        }
        if (high > 0) {
            text += `${high}$(warning) `;
        }
        if (medium > 0) {
            text += `${medium}$(info) `;
        }

        if (critical === 0 && high === 0 && medium === 0) {
            text += '$(check) No issues';
        }

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown('**Vulnerability Triage Summary**\n\n');
        tooltip.appendMarkdown(`Critical: ${critical}\n\n`);
        tooltip.appendMarkdown(`High: ${high}\n\n`);
        tooltip.appendMarkdown(`Medium: ${medium}\n\n`);
        tooltip.appendMarkdown(`Low: ${low}\n\n`);
        tooltip.appendMarkdown('---\n\n');
        tooltip.appendMarkdown('Click to open Vulnerability Triage view');

        const backgroundColor = critical > 0
            ? new vscode.ThemeColor('statusBarItem.errorBackground')
            : high > 0
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;

        return { text, tooltip, backgroundColor };
    }
}
