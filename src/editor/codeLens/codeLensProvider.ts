import * as vscode from 'vscode';
import { Finding, Severity } from '../../types';
import { FindingIndexer } from '../findingIndexer';
import { SolidityFunctionParser, FunctionDefinition } from './functionParser';
import { LensFormatter } from './lensFormatter';
import { getConfig } from '../../config';

export class TameshiCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(private findingIndexer: FindingIndexer) {}

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const config = getConfig();

        if (config.editor?.codeLens?.enabled === false) {
            return [];
        }

        if (document.languageId !== 'solidity') {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        const findings = this.findingIndexer.findingsForFile(document.uri.fsPath);

        if (findings.length === 0) {
            return [];
        }

        const minSeverity = config.editor?.codeLens?.minSeverity || 'medium';
        const filteredFindings = this.filterBySeverity(findings, minSeverity);

        if (filteredFindings.length === 0) {
            return [];
        }

        const functions = SolidityFunctionParser.parse(document);

        if (config.editor?.codeLens?.showFileSummary !== false) {
            const fileSummaryLens = LensFormatter.formatFileSummary(
                filteredFindings,
                new vscode.Range(0, 0, 0, 0)
            );
            lenses.push(fileSummaryLens);
        }

        if (config.editor?.codeLens?.showFunctionSummary !== false) {
            for (const func of functions) {
                const functionFindings = this.findingIndexer.findingsInRange(
                    document.uri.fsPath,
                    func.startLine,
                    func.endLine
                );

                const filteredFunctionFindings = this.filterBySeverity(functionFindings, minSeverity);

                if (filteredFunctionFindings.length > 0) {
                    const funcLens = LensFormatter.formatFunctionSummary(
                        func,
                        filteredFunctionFindings,
                        new vscode.Range(func.startLine - 1, 0, func.startLine - 1, 0)
                    );

                    if (funcLens) {
                        lenses.push(funcLens);
                    }

                    const correlationLens = LensFormatter.formatCorrelationIndicator(
                        filteredFunctionFindings,
                        new vscode.Range(func.startLine - 1, 0, func.startLine - 1, 0)
                    );

                    if (correlationLens) {
                        lenses.push(correlationLens);
                    }
                }
            }
        }

        return lenses;
    }

    private filterBySeverity(findings: Finding[], minSeverity: Severity): Finding[] {
        const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
        const minIndex = severityOrder.indexOf(minSeverity);

        if (minIndex === -1) {
            return findings;
        }

        return findings.filter(f => {
            const severityIndex = severityOrder.indexOf(f.severity);
            return severityIndex <= minIndex;
        });
    }
}
