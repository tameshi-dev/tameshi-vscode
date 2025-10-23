import * as vscode from 'vscode';
import { Finding } from '../../types';
import { FindingIndexer } from '../findingIndexer';
import { HoverContent } from './hoverContent';
import { getConfig } from '../../config';
import { GutterDecorator } from '../gutterIcons/gutterDecorator';

export class TameshiHoverProvider implements vscode.HoverProvider {
    constructor(
        private findingIndexer: FindingIndexer,
        private gutterDecorator?: GutterDecorator
    ) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const config = getConfig();
        if (config.editor?.hovers?.enabled === false) {
            return null;
        }

        if (document.languageId !== 'solidity') {
            return null;
        }

        const line = position.line + 1;
        const findings = this.findingIndexer.findingsAtLine(document.uri.fsPath, line);

        if (findings.length === 0) {
            return null;
        }

        const selectedFindingId = this.gutterDecorator?.getSelectedFindingForLine(document.uri.fsPath, line);

        const markdown = HoverContent.build(findings, { selectedFindingId });

        const lineRange = document.lineAt(position.line).range;
        return new vscode.Hover(markdown, lineRange);
    }
}
