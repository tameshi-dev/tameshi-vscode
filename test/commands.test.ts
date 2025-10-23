// Mock vscode-languageclient before any imports
jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: class LanguageClient {},
    LanguageClientOptions: {},
    ServerOptions: {}
}));

// Mock extension module
const mockLSPClientInstance = {
    getClient: jest.fn(),
    sendRequest: jest.fn()
};

jest.mock('../src/extension', () => ({
    getLSPClientInstance: jest.fn(() => mockLSPClientInstance)
}));

import { registerCommands } from '../src/commands/index';

// Mock dependencies
const mockContext = {
    subscriptions: [],
    globalState: { get: jest.fn(), update: jest.fn() },
    workspaceState: { get: jest.fn(), update: jest.fn() },
    extensionPath: '/test/extension',
    extensionUri: { fsPath: '/test/extension' }
} as any;

const mockOutputChannel = { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() } as any;
const mockStatusBarItem = { text: '', show: jest.fn(), hide: jest.fn(), dispose: jest.fn() } as any;
const mockFindingsProvider = {
    refresh: jest.fn(),
    updateFindings: jest.fn(),
    setScanning: jest.fn(),
    loadFindings: jest.fn()
} as any;
const mockLSPClient = { sendRequest: jest.fn() };

// Mock VS Code API
const mockCommands: any = {};

jest.mock('vscode', () => ({
    commands: {
        registerCommand: jest.fn((command: string, handler: Function) => {
            mockCommands[command] = handler;
            return { dispose: jest.fn() };
        }),
        executeCommand: jest.fn()
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showSaveDialog: jest.fn(),
        withProgress: jest.fn((options, task) => task()),
        activeTextEditor: { document: { uri: { fsPath: '/test/file.sol', toString: () => 'file:///test/file.sol' } } }
    },
    workspace: { openTextDocument: jest.fn() },
    Uri: { file: jest.fn((path: string) => ({ fsPath: path, toString: () => `file://${path}` })) },
    ProgressLocation: { Notification: 15 }
}), { virtual: true });

jest.mock('../src/webviews/detailsPanel', () => ({
    DetailsPanel: { createOrShow: jest.fn(), updateFinding: jest.fn() }
}));

describe('Commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.keys(mockCommands).forEach(key => delete mockCommands[key]);
        mockLSPClientInstance.getClient.mockReturnValue(mockLSPClient);
        mockContext.globalState.get.mockReturnValue(mockLSPClientInstance);
    });

    test('should register all commands', () => {
        const commands = registerCommands(mockContext, mockOutputChannel, mockStatusBarItem, mockFindingsProvider);

        expect(commands.length).toBeGreaterThanOrEqual(10);
        expect(mockCommands['tameshi.scanWorkspace.client']).toBeDefined();
        expect(mockCommands['tameshi.scanFile.client']).toBeDefined();
        expect(mockCommands['tameshi.clearFindings']).toBeDefined();
        expect(mockCommands['tameshi.restart']).toBeDefined();
    });

    test('should execute workspace scan successfully', async () => {
        registerCommands(mockContext, mockOutputChannel, mockStatusBarItem, mockFindingsProvider);
        mockLSPClient.sendRequest.mockResolvedValue({ success: true, findings: [] });

        await mockCommands['tameshi.scanWorkspace.client']();

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[CLIENT] Scan Workspace command invoked');
        expect(mockLSPClient.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
            command: 'tameshi.scanWorkspace',
            arguments: []
        });
    });

    test('should handle scan file command', async () => {
        registerCommands(mockContext, mockOutputChannel, mockStatusBarItem, mockFindingsProvider);
        mockLSPClient.sendRequest.mockResolvedValue({ success: true, findings: [] });
        const vscode = require('vscode');
        const testUri = vscode.Uri.file('/test/file.sol');

        await mockCommands['tameshi.scanFile.client'](testUri);

        expect(mockLSPClient.sendRequest).toHaveBeenCalledWith('workspace/executeCommand', {
            command: 'tameshi.scanFile',
            arguments: ['file:///test/file.sol']
        });
    });

    test('should handle clear findings command', async () => {
        registerCommands(mockContext, mockOutputChannel, mockStatusBarItem, mockFindingsProvider);

        await mockCommands['tameshi.clearFindings']();

        expect(mockFindingsProvider.updateFindings).toHaveBeenCalledWith([]);
    });
});
