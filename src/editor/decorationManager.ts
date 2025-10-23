import * as vscode from 'vscode';
import { Finding } from '../types';
import { FindingsProvider } from '../views/findingsView';
import { FindingIndexer } from './findingIndexer';
import { StatusBarManager } from './statusBar/statusBarManager';
import { GutterDecorator } from './gutterIcons/gutterDecorator';
import { TameshiHoverProvider } from './hovers/hoverProvider';
import { TameshiCodeLensProvider } from './codeLens/codeLensProvider';
import { getConfig } from '../config';
import { HoverCommands } from './hovers/hoverCommands';
import { getLogger, LogCategory } from '../utils/logger';

export class EditorDecorationManager implements vscode.Disposable {
    private statusBar: StatusBarManager;
    private gutterDecorator: GutterDecorator;
    private hoverProvider: TameshiHoverProvider;
    private codeLensProvider: TameshiCodeLensProvider;
    private findingIndexer: FindingIndexer;
    private disposables: vscode.Disposable[] = [];
    private updateTimeout: NodeJS.Timeout | undefined;

    private dirtyDocs: Set<string> = new Set();

    constructor(
        private findingsProvider: FindingsProvider,
        private context: vscode.ExtensionContext
    ) {
        this.findingIndexer = new FindingIndexer();

        this.statusBar = new StatusBarManager(context);

        this.gutterDecorator = new GutterDecorator(context);

        this.hoverProvider = new TameshiHoverProvider(this.findingIndexer, this.gutterDecorator);

        this.codeLensProvider = new TameshiCodeLensProvider(this.findingIndexer);

        this.registerProviders();

        HoverCommands.register(context);

        this.setupListeners();

        const subscription = findingsProvider.onFindingsUpdate((findings) => {
            this.updateDecorations(findings);
        });
        this.disposables.push(subscription);

        this.updateDecorations(findingsProvider.getFindings());
    }

    private registerProviders(): void {
        this.disposables.push(
            vscode.languages.registerHoverProvider(
                { language: 'solidity', scheme: 'file' },
                this.hoverProvider
            )
        );

        this.disposables.push(
            vscode.languages.registerCodeLensProvider(
                { language: 'solidity', scheme: 'file' },
                this.codeLensProvider
            )
        );
    }

    private setupListeners(): void {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document.languageId === 'solidity') {
                    this.onActiveEditorChanged(editor);
                    this.updateCurrentLineStatus(editor);
                }
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                if (e.textEditor.document.languageId === 'solidity') {
                    this.updateCurrentLineStatus(e.textEditor);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.languageId !== 'solidity') {
                    return;
                }

                const hasStructuralChange = e.contentChanges.some(change => {
                    const deletedLines = change.range.end.line - change.range.start.line;
                    const addedLines = change.text.split('\n').length - 1;
                    return deletedLines > 0 || addedLines > 0 || deletedLines !== addedLines;
                });

                if (hasStructuralChange) {
                    const key = e.document.uri.toString();

                    getLogger().debug(LogCategory.UI, `Structural change in ${e.document.uri.fsPath} - marking dirty`);

                    this.dirtyDocs.add(key);

                    for (const editor of vscode.window.visibleTextEditors) {
                        if (editor.document.uri.toString() === key) {
                            getLogger().debug(LogCategory.UI, `Clearing decorations for editor ${editor.viewColumn}`);
                            this.gutterDecorator.clearDecorations(editor);
                        }
                    }
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.languageId !== 'solidity') {
                    return;
                }

                const key = doc.uri.toString();
                getLogger().debug(LogCategory.UI, `Document saved: ${doc.uri.fsPath} - clearing dirty flag`);
                this.dirtyDocs.delete(key);
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('tameshi.editor')) {
                    this.reloadConfiguration();
                }
            })
        );
    }

    private updateCurrentLineStatus(editor: vscode.TextEditor): void {
        const currentLine = editor.selection.active.line + 1;
        const findingsOnLine = this.findingIndexer.findingsAtLine(
            editor.document.uri.fsPath,
            currentLine
        );

        this.statusBar.updateCurrentLine(findingsOnLine);
    }

    updateDecorations(findings: Finding[]): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        this.updateTimeout = setTimeout(() => {
            this.doUpdateDecorations(findings);
        }, 100);
    }

    private doUpdateDecorations(findings: Finding[]): void {
        this.findingIndexer.buildIndex(findings);

        const config = getConfig();
        if (config.editor?.statusBar?.enabled !== false) {
            this.statusBar.update(findings);
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.languageId === 'solidity') {
            const key = activeEditor.document.uri.toString();

            if (this.dirtyDocs.has(key)) {
                getLogger().debug(LogCategory.UI, `Suppressing stale decoration reapply for dirty document: ${activeEditor.document.uri.fsPath}`);
                return;
            }

            getLogger().debug(LogCategory.UI, `Applying decorations for ${findings.length} findings`);
            this.onActiveEditorChanged(activeEditor);
        }

        this.codeLensProvider.refresh();
    }

    onActiveEditorChanged(editor: vscode.TextEditor): void {
        const allFindings = this.findingsProvider.getFindings();

        const validatedFindings = this.findingIndexer.validateFindingsForDocument(editor.document, allFindings);
        const fileFindings = validatedFindings.filter(f => f.location.file === editor.document.uri.fsPath);

        const config = getConfig();
        if (config.editor?.gutterIcons?.enabled !== false) {
            this.gutterDecorator.applyDecorations(editor, fileFindings, validatedFindings);
        } else {
            this.gutterDecorator.clearDecorations(editor);
        }
    }

    private reloadConfiguration(): void {
        const findings = this.findingsProvider.getFindings();
        this.doUpdateDecorations(findings);
    }

    getIndexer(): FindingIndexer {
        return this.findingIndexer;
    }

    getCodeLensProvider(): TameshiCodeLensProvider {
        return this.codeLensProvider;
    }

    dispose(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.statusBar.dispose();
        this.gutterDecorator.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
