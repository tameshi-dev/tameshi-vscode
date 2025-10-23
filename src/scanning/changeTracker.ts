import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Tracks document changes to identify modified lines for smart AI rescanning
 */
export class ChangeTracker implements vscode.Disposable {
    private modifiedLines: Map<string, Set<number>> = new Map();

    private documentVersions: Map<string, number> = new Map();

    private contentHashes: Map<string, string> = new Map();

    private lineDeltas: Map<string, Map<number, number>> = new Map();

    private disposables: vscode.Disposable[] = [];

    constructor(private outputChannel: vscode.OutputChannel) {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e))
        );
    }

    /**
     * Track changes in a document
     */
    private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'solidity') {
            return;
        }

        const filePath = event.document.uri.fsPath;
        const modifiedLines = this.modifiedLines.get(filePath) ?? new Set<number>();
        const lineDeltas = this.lineDeltas.get(filePath) ?? new Map<number, number>();

        for (const change of event.contentChanges) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const deletedLines = endLine - startLine;
            const addedLines = change.text.split('\n').length - 1;

            for (let line = startLine; line <= endLine; line++) {
                modifiedLines.add(line + 1);
            }

            const delta = addedLines - deletedLines;
            if (delta !== 0) {
                const shiftStartLine = endLine + 1;
                lineDeltas.set(shiftStartLine, (lineDeltas.get(shiftStartLine) ?? 0) + delta);

                this.outputChannel.appendLine(
                    `[ChangeTracker] Line delta at ${shiftStartLine}: ${delta > 0 ? '+' : ''}${delta}`
                );
            }
        }

        this.modifiedLines.set(filePath, modifiedLines);
        this.lineDeltas.set(filePath, lineDeltas);
        this.documentVersions.set(filePath, event.document.version);

        this.outputChannel.appendLine(
            `[ChangeTracker] ${filePath}: ${modifiedLines.size} lines modified, version ${event.document.version}`
        );
    }

    /**
     * Get all modified lines for a document (1-based)
     */
    public getModifiedLines(filePath: string): Set<number> {
        return this.modifiedLines.get(filePath) ?? new Set();
    }

    /**
     * Get current document version
     */
    public getDocumentVersion(filePath: string): number | undefined {
        return this.documentVersions.get(filePath);
    }

    /**
     * Get or compute content hash for a document
     */
    public getContentHash(document: vscode.TextDocument): string {
        const filePath = document.uri.fsPath;
        const cachedHash = this.contentHashes.get(filePath);

        const cachedVersion = this.documentVersions.get(filePath);
        if (cachedHash && cachedVersion === document.version) {
            return cachedHash;
        }

        const content = document.getText();
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        this.contentHashes.set(filePath, hash);

        return hash;
    }

    /**
     * Check if a specific line (1-based) has been modified
     */
    public isLineModified(filePath: string, line: number): boolean {
        const modifiedLines = this.modifiedLines.get(filePath);
        if (!modifiedLines) {
            return false;
        }
        return modifiedLines.has(line);
    }

    /**
     * Check if any line in a range has been modified
     */
    public isRangeModified(filePath: string, startLine: number, endLine: number): boolean {
        const modifiedLines = this.modifiedLines.get(filePath);
        if (!modifiedLines) {
            return false;
        }

        for (let line = startLine; line <= endLine; line++) {
            if (modifiedLines.has(line)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Apply line shift to a finding's line number
     * Returns the adjusted line number accounting for insertions/deletions above it
     */
    public applyLineShift(filePath: string, originalLine: number): number {
        const deltas = this.lineDeltas.get(filePath);
        if (!deltas || deltas.size === 0) {
            return originalLine;
        }

        let adjustedLine = originalLine;

        for (const [shiftLine, delta] of deltas.entries()) {
            if (shiftLine <= originalLine) {
                adjustedLine += delta;
            }
        }

        return adjustedLine;
    }

    /**
     * Clear tracking for a specific file (after successful scan)
     */
    public clearFile(filePath: string): void {
        this.modifiedLines.delete(filePath);
        this.lineDeltas.delete(filePath);

        this.outputChannel.appendLine(`[ChangeTracker] Cleared tracking for ${filePath}`);
    }

    /**
     * Clear all tracking (e.g., after workspace scan)
     */
    public clearAll(): void {
        this.modifiedLines.clear();
        this.lineDeltas.clear();

        this.outputChannel.appendLine('[ChangeTracker] Cleared all tracking');
    }

    /**
     * Update content hash after a successful scan
     */
    public updateContentHash(document: vscode.TextDocument): void {
        const filePath = document.uri.fsPath;
        const hash = this.getContentHash(document);
        this.contentHashes.set(filePath, hash);
    }

    /**
     * Check if document content has changed since last hash
     */
    public hasContentChanged(document: vscode.TextDocument): boolean {
        const filePath = document.uri.fsPath;
        const lastHash = this.contentHashes.get(filePath);

        if (!lastHash) {
            return true;
        }

        const currentHash = this.getContentHash(document);
        return currentHash !== lastHash;
    }

    /**
     * Handle file renames
     */
    public handleFileRename(oldPath: string, newPath: string): void {
        const modifiedLines = this.modifiedLines.get(oldPath);
        const version = this.documentVersions.get(oldPath);
        const hash = this.contentHashes.get(oldPath);
        const deltas = this.lineDeltas.get(oldPath);

        if (modifiedLines) this.modifiedLines.set(newPath, modifiedLines);
        if (version !== undefined) this.documentVersions.set(newPath, version);
        if (hash) this.contentHashes.set(newPath, hash);
        if (deltas) this.lineDeltas.set(newPath, deltas);

        this.clearFile(oldPath);

        this.outputChannel.appendLine(`[ChangeTracker] File renamed: ${oldPath} -> ${newPath}`);
    }

    /**
     * Handle file deletion
     */
    public handleFileDelete(filePath: string): void {
        this.clearFile(filePath);
        this.contentHashes.delete(filePath);

        this.outputChannel.appendLine(`[ChangeTracker] File deleted: ${filePath}`);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.modifiedLines.clear();
        this.documentVersions.clear();
        this.contentHashes.clear();
        this.lineDeltas.clear();
    }
}
