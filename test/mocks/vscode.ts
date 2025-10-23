// Mock VS Code API for testing
export class MockEventEmitter {
    private listeners: Function[] = [];
    
    fire(event?: any): void {
        this.listeners.forEach(listener => listener(event));
    }
    
    get event() {
        return (listener: Function) => {
            this.listeners.push(listener);
            return { dispose: jest.fn() };
        };
    }
}

export const vscode = {
    EventEmitter: MockEventEmitter,
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn(),
            update: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn()
        })),
        onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
        workspaceFolders: [
            {
                uri: { fsPath: '/test/workspace' },
                name: 'test-workspace',
                index: 0
            }
        ],
        createFileSystemWatcher: jest.fn(() => ({
            dispose: jest.fn()
        })),
        openTextDocument: jest.fn(),
        fs: {
            stat: jest.fn()
        }
    },
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showSaveDialog: jest.fn(),
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })),
        createStatusBarItem: jest.fn(() => ({
            text: '',
            tooltip: '',
            command: '',
            color: undefined,
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })),
        createTreeView: jest.fn(() => ({
            dispose: jest.fn(),
            reveal: jest.fn()
        })),
        createWebviewPanel: jest.fn(() => ({
            webview: {
                html: '',
                asWebviewUri: jest.fn(),
                onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                cspSource: 'mock-csp-source'
            },
            onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
            reveal: jest.fn(),
            dispose: jest.fn(),
            title: ''
        })),
        withProgress: jest.fn((options, task) => task()),
        activeTextEditor: {
            document: {
                uri: { fsPath: '/test/file.sol' }
            }
        }
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn()
    },
    languages: {
        createDiagnosticCollection: jest.fn(() => ({
            dispose: jest.fn(),
            set: jest.fn(),
            clear: jest.fn()
        }))
    },
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
        joinPath: jest.fn((base: any, ...segments: string[]) => ({
            fsPath: [base.fsPath, ...segments].join('/'),
            toString: () => [base.fsPath, ...segments].join('/')
        })),
        parse: jest.fn()
    },
    Range: jest.fn((startLine: number, startChar: number, endLine: number, endChar: number) => ({
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar }
    })),
    Position: jest.fn((line: number, character: number) => ({ line, character })),
    ThemeIcon: jest.fn((name: string, color?: any) => ({ id: name, color })),
    ThemeColor: jest.fn((name: string) => ({ id: name })),
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },
    TreeItem: jest.fn(),
    ViewColumn: {
        One: 1,
        Two: 2,
        Beside: -2
    },
    ProgressLocation: {
        Notification: 15
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    env: {
        clipboard: {
            writeText: jest.fn()
        },
        openExternal: jest.fn()
    },
    extensions: {
        getExtension: jest.fn()
    }
};

// Mock the entire vscode module
jest.mock('vscode', () => vscode, { virtual: true });