jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: class LanguageClient {}
}));

import { DetailsPanel } from '../src/webviews/detailsPanel';
import { Finding } from '../src/views/findingsView';

const mockWebview = {
    html: '',
    asWebviewUri: jest.fn((uri: any) => uri),
    onDidReceiveMessage: jest.fn((handler: Function) => {
        mockWebview._messageHandler = handler;
        return { dispose: jest.fn() };
    }),
    postMessage: jest.fn(),
    _messageHandler: undefined as Function | undefined
};

const mockWebviewPanel = {
    webview: mockWebview,
    onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeViewState: jest.fn(() => ({ dispose: jest.fn() })),
    visible: true,
    reveal: jest.fn(),
    dispose: jest.fn(),
    title: 'Finding Details'
};

jest.mock('vscode', () => ({
    window: { createWebviewPanel: jest.fn(() => mockWebviewPanel) },
    ViewColumn: { Beside: -2 },
    Uri: { joinPath: jest.fn((base: any, ...segments: string[]) => ({ fsPath: [base.fsPath, ...segments].join('/') })) },
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: '/mock/workspace' },
            name: 'mock-workspace',
            index: 0
        }],
        getConfiguration: jest.fn(() => ({
            get: jest.fn()
        }))
    }
}), { virtual: true });

describe('DetailsPanel', () => {
    let extensionUri: any;
    let mockFinding: Finding;

    beforeEach(() => {
        jest.clearAllMocks();
        DetailsPanel.currentPanel = undefined;
        extensionUri = { fsPath: '/test/extension' };

        mockFinding = {
            id: 'finding-1',
            rule: 'reentrancy-eth',
            severity: 'critical',
            confidence: 'high',
            title: 'Reentrancy vulnerability',
            description: 'Potential reentrancy attack',
            location: { file: '/test/Vulnerable.sol', line: 42, column: 8 },
            code: 'msg.sender.call{value: amount}("");'
        };

        mockWebview.html = '';
    });

    test('should create new panel when none exists', () => {
        const panel = DetailsPanel.createOrShow(extensionUri, mockFinding);

        expect(panel).toBeInstanceOf(DetailsPanel);
        expect(DetailsPanel.currentPanel).toBe(panel);

        const vscode = require('vscode');
        expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });

    test('should reveal existing panel when one exists', () => {
        const firstPanel = DetailsPanel.createOrShow(extensionUri, mockFinding);
        const secondPanel = DetailsPanel.createOrShow(extensionUri);

        expect(firstPanel).toBe(secondPanel);
        expect(mockWebviewPanel.reveal).toHaveBeenCalled();
    });

    test('should generate HTML with finding details', () => {
        DetailsPanel.createOrShow(extensionUri, mockFinding);

        const html = mockWebview.html;
        expect(html).toContain(mockFinding.title);
        expect(html).toContain(mockFinding.description);
        expect(html).toContain(mockFinding.severity.toUpperCase());
    });

    test('should dispose panel and clear static reference', () => {
        const panel = DetailsPanel.createOrShow(extensionUri, mockFinding);

        panel.dispose();

        expect(mockWebviewPanel.dispose).toHaveBeenCalled();
        expect(DetailsPanel.currentPanel).toBeUndefined();
    });
});
