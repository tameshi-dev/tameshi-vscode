import * as vscode from 'vscode';
import { Finding, Severity } from '../../types';
import { ExtendedFinding, getScannerType } from '../../types/findings';
import { getLogger, LogCategory } from '../../utils/logger';

const PRIORITY_SCORES = {
    CROSS_SCANNER_AGREEMENT: 1000,
    SEVERITY: {
        CRITICAL: 500,
        HIGH: 400,
        MEDIUM: 300,
        LOW: 200,
        INFO: 100
    },
    SCANNER_TYPE_WITH_AGREEMENT: {
        DETERMINISTIC: 10,
        SOURCE: 9,
        IR: 8,
        HYBRID: 7,
        LLM: 6
    },
    SCANNER_TYPE_WITHOUT_AGREEMENT: {
        LLM: 10,
        HYBRID: 9,
        IR: 8,
        SOURCE: 7,
        DETERMINISTIC: 6
    }
} as const;

export class GutterDecorator implements vscode.Disposable {
    private decorationTypeCache: Map<string, vscode.TextEditorDecorationType> = new Map();
    private selectedFindingPerLine: Map<string, string> = new Map();

    constructor(private context: vscode.ExtensionContext) {
    }

    /**
     * Get the finding ID that was selected for gutter display at a specific line
     */
    getSelectedFindingForLine(filePath: string, line: number): string | undefined {
        return this.selectedFindingPerLine.get(`${filePath}:${line}`);
    }

    private getSeverityColors(severity: Severity): { light: string; dark: string } {
        switch (severity) {
            case 'critical':
                return { light: '#E51400', dark: '#F48771' };
            case 'high':
                return { light: '#E08E00', dark: '#CCA700' };
            case 'medium':
                return { light: '#0066BF', dark: '#3794FF' };
            case 'low':
                return { light: '#616161', dark: '#CCCCCC' };
            case 'info':
            case 'informational':
                return { light: '#616161', dark: '#CCCCCC' };
        }
    }

    private createIconSvg(iconType: string, color: string, count?: number, hasAgreement?: boolean): string {
        const size = 16;

        let iconPath = '';

        switch (iconType) {
            case 'shield':
                iconPath = `<path d="M8 1L2 3v5c0 3.7 2.4 7.1 6 8 3.6-0.9 6-4.3 6-8V3l-6-2z" fill="${color}" opacity="0.9"/>
                            <path d="M8 2.5L3.5 4v4c0 2.8 1.8 5.3 4.5 6.2 2.7-0.9 4.5-3.4 4.5-6.2V4L8 2.5z" fill="none" stroke="${color}" stroke-width="1"/>`;
                break;
            case 'sparkle':
                iconPath = `<path d="M8 2l1.5 3 3.5 0.5-2.5 2.5 0.5 3.5-3-1.5-3 1.5 0.5-3.5L3 5.5 6.5 5 8 2z" fill="${color}"/>`;
                break;
            case 'gear':
                iconPath = `<path d="M8 4.5c-1.9 0-3.5 1.6-3.5 3.5s1.6 3.5 3.5 3.5 3.5-1.6 3.5-3.5-1.6-3.5-3.5-3.5zm0 5.5c-1.1 0-2-0.9-2-2s0.9-2 2-2 2 0.9 2 2-0.9 2-2 2z" fill="${color}"/>
                            <path d="M14.5 7h-1.7c-0.2-0.7-0.5-1.3-0.9-1.8l1.2-1.2-1.4-1.4-1.2 1.2c-0.6-0.4-1.2-0.7-1.8-0.9V1.5h-2v1.7c-0.7 0.2-1.3 0.5-1.8 0.9L3.7 2.9 2.3 4.3l1.2 1.2c-0.4 0.6-0.7 1.2-0.9 1.8H1.5v2h1.7c0.2 0.7 0.5 1.3 0.9 1.8l-1.2 1.2 1.4 1.4 1.2-1.2c0.6 0.4 1.2 0.7 1.8 0.9v1.7h2v-1.7c0.7-0.2 1.3-0.5 1.8-0.9l1.2 1.2 1.4-1.4-1.2-1.2c0.4-0.6 0.7-1.2 0.9-1.8h1.7V7z" fill="${color}" opacity="0.3"/>`;
                break;
            case 'beaker':
                iconPath = `<path d="M6 2v6L3 13c-0.5 0.9 0 2 1.2 2h7.6c1.2 0 1.7-1.1 1.2-2L10 8V2h1V1H5v1h1zm1 0h2v6l2.5 5H4.5L7 8V2z" fill="${color}"/>`;
                break;
            case 'file-code':
                iconPath = `<path d="M10 1H4v14h8V5l-2-4zm1 13H5V2h4v3h2v9z" fill="${color}" opacity="0.7"/>
                            <path d="M6 8l-1 1 1 1 0.5-0.5-0.5-0.5 0.5-0.5L6 8zm4 0l-0.5 0.5 0.5 0.5-0.5 0.5 0.5 0.5 1-1-1-1z" fill="${color}"/>`;
                break;
            default:
                iconPath = `<circle cx="8" cy="8" r="5" fill="${color}"/>`;
        }

        let badgeElement = '';
        if (count && count > 1) {
            const badgeText = count > 9 ? '9+' : count.toString();
            badgeElement = `
                <circle cx="12" cy="4" r="4.5" fill="#E51400"/>
                <text x="12" y="4" text-anchor="middle" dominant-baseline="central"
                      font-size="7" font-weight="bold" fill="white">${badgeText}</text>
            `;
        }

        let agreementIndicator = '';
        if (hasAgreement) {
            agreementIndicator = `
                <circle cx="12" cy="12" r="4" fill="#4CAF50"/>
                <path d="M 10 12 L 11.5 13.5 L 14 10.5" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            `;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${iconPath}${badgeElement}${agreementIndicator}</svg>`;
    }

    private createIconDataUri(iconType: string, color: string, count?: number, hasAgreement?: boolean): vscode.Uri {
        const svg = this.createIconSvg(iconType, color, count, hasAgreement);
        const encoded = encodeURIComponent(svg);
        return vscode.Uri.parse(`data:image/svg+xml,${encoded}`);
    }

    private hasCrossTypeScannerAgreement(finding: Finding, findingMap: Map<string, Finding>): boolean {
        const extended = finding as ExtendedFinding;
        const correlationMetadata = extended.correlationMetadata;

        if (!correlationMetadata) {
            return false;
        }

        const correlationType = correlationMetadata.correlationType;
        const relatedIds = correlationMetadata.relatedFindingIds ?? [];

        if (correlationType !== 'duplicate' && correlationType !== 'augmentation') {
            return false;
        }

        if (relatedIds.length === 0) {
            return false;
        }

        const currentScannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

        let hasDeterministic = currentScannerType === 'deterministic' || currentScannerType === 'source' || currentScannerType === 'ir';
        let hasLLM = currentScannerType === 'llm' || currentScannerType === 'hybrid';

        for (const relatedId of relatedIds) {
            const relatedFinding = findingMap.get(relatedId);
            if (!relatedFinding) {
                continue;
            }

            const relatedExtended = relatedFinding as ExtendedFinding;
            const relatedScannerType = relatedExtended.scannerType || (relatedExtended.scannerId ? getScannerType(relatedExtended.scannerId) : 'deterministic');

            if (relatedScannerType === 'llm' || relatedScannerType === 'hybrid') {
                hasLLM = true;
            }
            if (relatedScannerType === 'deterministic' || relatedScannerType === 'source' || relatedScannerType === 'ir') {
                hasDeterministic = true;
            }

            if (hasDeterministic && hasLLM) {
                return true;
            }
        }

        return hasDeterministic && hasLLM;
    }

    private getDecorationTypeForFinding(finding: Finding, findingMap: Map<string, Finding>, count?: number): vscode.TextEditorDecorationType {
        const extended = finding as ExtendedFinding;
        const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

        const hasAgreement = this.hasCrossTypeScannerAgreement(finding, findingMap);

        const cacheKey = `${scannerType}-${finding.severity}-${hasAgreement ? 'agreed' : 'single'}-${count || 1}`;

        if (this.decorationTypeCache.has(cacheKey)) {
            return this.decorationTypeCache.get(cacheKey)!;
        }

        let iconType: string;
        switch (scannerType) {
            case 'llm':
                iconType = 'sparkle';
                break;
            case 'hybrid':
                iconType = 'beaker';
                break;
            case 'ir':
                iconType = 'gear';
                break;
            case 'source':
                iconType = 'file-code';
                break;
            default:
                iconType = 'shield';
                break;
        }

        let colors: { light: string; dark: string };
        if (hasAgreement) {
            colors = { light: '#E51400', dark: '#F48771' };
        } else {
            colors = this.getSeverityColors(finding.severity);
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.createIconDataUri(iconType, colors.dark, count, hasAgreement),
            gutterIconSize: 'contain'
        });

        this.decorationTypeCache.set(cacheKey, decorationType);
        return decorationType;
    }

    /**
     * Calculate priority score for a finding (higher = more important)
     * Priority order: Cross-scanner agreement > Severity > Scanner type
     *
     * Special rule: When there's cross-scanner agreement, prefer deterministic
     * scanners for display (the green checkmark indicates AI confirmation)
     */
    private calculatePriority(finding: Finding, findingMap: Map<string, Finding>): number {
        const extended = finding as ExtendedFinding;
        const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

        let score = 0;

        const hasAgreement = this.hasCrossTypeScannerAgreement(finding, findingMap);
        if (hasAgreement) {
            score += PRIORITY_SCORES.CROSS_SCANNER_AGREEMENT;
        }

        const severityScore: Record<Severity, number> = {
            'critical': PRIORITY_SCORES.SEVERITY.CRITICAL,
            'high': PRIORITY_SCORES.SEVERITY.HIGH,
            'medium': PRIORITY_SCORES.SEVERITY.MEDIUM,
            'low': PRIORITY_SCORES.SEVERITY.LOW,
            'info': PRIORITY_SCORES.SEVERITY.INFO,
            'informational': PRIORITY_SCORES.SEVERITY.INFO
        };
        score += severityScore[finding.severity] || PRIORITY_SCORES.SEVERITY.INFO;

        const scannerTypeScore = hasAgreement
            ? PRIORITY_SCORES.SCANNER_TYPE_WITH_AGREEMENT
            : PRIORITY_SCORES.SCANNER_TYPE_WITHOUT_AGREEMENT;

        const upperScannerType = scannerType.toUpperCase() as keyof typeof scannerTypeScore;
        score += scannerTypeScore[upperScannerType] || PRIORITY_SCORES.SCANNER_TYPE_WITHOUT_AGREEMENT.DETERMINISTIC;

        return score;
    }

    applyDecorations(editor: vscode.TextEditor, fileFindings: Finding[], allFindings?: Finding[]): void {
        getLogger().debug(LogCategory.UI, `Applying decorations for ${fileFindings.length} findings in ${editor.document.uri.fsPath}`);

        for (const decorationType of this.decorationTypeCache.values()) {
            editor.setDecorations(decorationType, []);
        }

        const filePath = editor.document.uri.fsPath;
        for (const key of Array.from(this.selectedFindingPerLine.keys())) {
            if (key.startsWith(filePath + ':')) {
                this.selectedFindingPerLine.delete(key);
            }
        }

        const findingMap = new Map<string, Finding>();
        const findingsToMap = allFindings || fileFindings;
        for (const f of findingsToMap) {
            findingMap.set(f.id, f);
        }

        const findingsByLine = new Map<number, Finding[]>();
        for (const finding of fileFindings) {
            const line = finding.location.line;
            if (!findingsByLine.has(line)) {
                findingsByLine.set(line, []);
            }
            findingsByLine.get(line)!.push(finding);
        }

        const decorationMap = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();

        for (const [line, findings] of findingsByLine) {
            const extended = findings[0] as ExtendedFinding;
            const scannerType = extended.scannerType || (extended.scannerId ? getScannerType(extended.scannerId) : 'deterministic');

            getLogger().debug(LogCategory.UI, `Line ${line}: ${findings.length} finding(s)`);

            const sortedFindings = findings.sort((a, b) =>
                this.calculatePriority(b, findingMap) - this.calculatePriority(a, findingMap)
            );

            const selectedFinding = sortedFindings[0];
            const count = findings.length;

            this.selectedFindingPerLine.set(`${filePath}:${line}`, selectedFinding.id);

            getLogger().debug(LogCategory.UI, `Line ${line}: Selected "${selectedFinding.title}" (${count} total)`);

            const decorationType = this.getDecorationTypeForFinding(selectedFinding, findingMap, count);
            const zeroBasedLine = line - 1;
            const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);

            if (!decorationMap.has(decorationType)) {
                decorationMap.set(decorationType, []);
            }
            decorationMap.get(decorationType)!.push(range);
        }

        for (const [decorationType, ranges] of decorationMap) {
            editor.setDecorations(decorationType, ranges);
        }
    }

    clearDecorations(editor: vscode.TextEditor): void {
        getLogger().debug(LogCategory.UI, `Clearing all decorations for ${editor.document.uri.fsPath}`);
        for (const decorationType of this.decorationTypeCache.values()) {
            editor.setDecorations(decorationType, []);
        }

        const filePath = editor.document.uri.fsPath;
        for (const key of Array.from(this.selectedFindingPerLine.keys())) {
            if (key.startsWith(filePath + ':')) {
                this.selectedFindingPerLine.delete(key);
            }
        }
    }

    dispose(): void {
        for (const decorationType of this.decorationTypeCache.values()) {
            decorationType.dispose();
        }
        this.decorationTypeCache.clear();
    }
}
