import * as vscode from 'vscode';
import { Finding, Severity } from '../../types';
import { FunctionDefinition } from './functionParser';

export class LensFormatter {
    /**
     * Format file-level summary CodeLens
     */
    static formatFileSummary(findings: Finding[], range: vscode.Range): vscode.CodeLens {
        const critical = findings.filter(f => f.severity === 'critical').length;
        const high = findings.filter(f => f.severity === 'high').length;
        const medium = findings.filter(f => f.severity === 'medium').length;
        const low = findings.filter(f => f.severity === 'low').length;

        const parts: string[] = [];
        if (critical > 0) parts.push(`${critical} critical`);
        if (high > 0) parts.push(`${high} high`);
        if (medium > 0) parts.push(`${medium} medium`);
        if (low > 0) parts.push(`${low} low`);

        const title = parts.length > 0
            ? `$(shield) ${findings.length} finding${findings.length === 1 ? '' : 's'}: ${parts.join(', ')}`
            : '$(check) No security findings';

        const command: vscode.Command = {
            title,
            command: 'tameshi.viewAllFindings',
            arguments: [{ findings: findings.map(f => f.id) }]
        };

        return new vscode.CodeLens(range, command);
    }

    /**
     * Format function-level summary CodeLens
     */
    static formatFunctionSummary(
        func: FunctionDefinition,
        findings: Finding[],
        range: vscode.Range
    ): vscode.CodeLens | null {
        if (findings.length === 0) {
            return null;
        }

        const severityCounts = this.countBySeverity(findings);
        const highestSeverity = this.getHighestSeverity(findings);

        const icon = this.getSeverityIcon(highestSeverity);
        const parts: string[] = [];

        if (severityCounts.critical > 0) parts.push(`${severityCounts.critical} critical`);
        if (severityCounts.high > 0) parts.push(`${severityCounts.high} high`);
        if (severityCounts.medium > 0) parts.push(`${severityCounts.medium} medium`);

        const title = `${icon} ${func.name}: ${parts.join(', ')} (${findings.length} finding${findings.length === 1 ? '' : 's'})`;

        const command: vscode.Command = {
            title,
            command: 'tameshi.viewFunctionFindings',
            arguments: [{ functionName: func.name, findings: findings.map(f => f.id) }]
        };

        return new vscode.CodeLens(range, command);
    }

    /**
     * Format correlation indicator CodeLens
     */
    static formatCorrelationIndicator(
        findings: Finding[],
        range: vscode.Range
    ): vscode.CodeLens | null {
        const correlated = findings.filter(f => f.correlationId);
        if (correlated.length === 0) {
            return null;
        }

        const scannerTypes = new Set(correlated.map(f => f.scannerType || 'deterministic'));
        const hasAgreement = scannerTypes.has('llm') && scannerTypes.has('deterministic');

        if (!hasAgreement) {
            return null;
        }

        const title = `$(check-all) Scanner Agreement: ${correlated.length} correlated finding${correlated.length === 1 ? '' : 's'}`;

        const command: vscode.Command = {
            title,
            command: 'tameshi.showCorrelation',
            arguments: [{ correlationId: correlated[0].correlationId }]
        };

        return new vscode.CodeLens(range, command);
    }

    private static countBySeverity(findings: Finding[]): Record<Severity, number> {
        return {
            critical: findings.filter(f => f.severity === 'critical').length,
            high: findings.filter(f => f.severity === 'high').length,
            medium: findings.filter(f => f.severity === 'medium').length,
            low: findings.filter(f => f.severity === 'low').length,
            info: findings.filter(f => f.severity === 'info').length,
            informational: findings.filter(f => f.severity === 'informational').length
        };
    }

    private static getHighestSeverity(findings: Finding[]): Severity {
        const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
        for (const severity of severityOrder) {
            if (findings.some(f => f.severity === severity)) {
                return severity;
            }
        }
        return 'info';
    }

    private static getSeverityIcon(severity: Severity): string {
        const icons: Record<Severity, string> = {
            'critical': '$(error)',
            'high': '$(warning)',
            'medium': '$(info)',
            'low': '$(circle-outline)',
            'info': '$(info)',
            'informational': '$(info)'
        };
        return icons[severity] || '$(circle-outline)';
    }
}
