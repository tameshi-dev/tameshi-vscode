import * as vscode from 'vscode';
import { Finding } from '../types';
import { getLogger, LogCategory } from '../utils/logger';

export interface FindingIndex {
    byFile: Map<string, Finding[]>;
    byLine: Map<string, Map<number, Finding[]>>;
}

export class FindingIndexer {
    private index: FindingIndex = {
        byFile: new Map(),
        byLine: new Map()
    };

    buildIndex(findings: Finding[]): FindingIndex {
        this.index = {
            byFile: new Map(),
            byLine: new Map()
        };

        for (const finding of findings) {
            const filePath = finding.location.file;
            const line = finding.location.line;

            if (!this.index.byFile.has(filePath)) {
                this.index.byFile.set(filePath, []);
            }
            this.index.byFile.get(filePath)!.push(finding);

            if (!this.index.byLine.has(filePath)) {
                this.index.byLine.set(filePath, new Map());
            }
            const fileLineMap = this.index.byLine.get(filePath)!;
            if (!fileLineMap.has(line)) {
                fileLineMap.set(line, []);
            }
            fileLineMap.get(line)!.push(finding);
        }

        return this.index;
    }

    /**
     * Validate and filter findings for a document
     * Removes findings that reference lines that no longer exist
     */
    validateFindingsForDocument(document: vscode.TextDocument, findings: Finding[]): Finding[] {
        const validFindings: Finding[] = [];
        const totalLines = document.lineCount;

        for (const finding of findings) {
            if (finding.location.file !== document.uri.fsPath) {
                validFindings.push(finding);
                continue;
            }

            const findingLine = finding.location.line;
            if (findingLine < 1 || findingLine > totalLines) {
                getLogger().debug(LogCategory.UI, `Filtering out stale finding - line ${findingLine} doesn't exist (file has ${totalLines} lines): ${finding.title}`);
                continue;
            }

            validFindings.push(finding);
        }

        return validFindings;
    }

    findingsForFile(filePath: string): Finding[] {
        return this.index.byFile.get(filePath) ?? [];
    }

    findingsAtLine(filePath: string, line: number): Finding[] {
        const fileLineMap = this.index.byLine.get(filePath);
        if (!fileLineMap) return [];
        return fileLineMap.get(line) ?? [];
    }

    findingsInRange(filePath: string, startLine: number, endLine: number): Finding[] {
        const fileFindings = this.findingsForFile(filePath);
        return fileFindings.filter(f =>
            f.location.line >= startLine && f.location.line <= endLine
        );
    }

    getAllFindings(): Finding[] {
        const allFindings: Finding[] = [];
        for (const findings of this.index.byFile.values()) {
            allFindings.push(...findings);
        }
        return allFindings;
    }
}
