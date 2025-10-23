import { MockLanguageClient } from './mocks/languageClient';

const mockLanguageClient = new MockLanguageClient();

jest.mock('vscode-languageclient/node', () => ({
    LanguageClient: jest.fn(() => mockLanguageClient),
    TransportKind: { stdio: 1, ipc: 2, pipe: 3, socket: 4 }
}), { virtual: true });

const mockGetConfiguration = jest.fn();
const mockGetInitializationOptions = jest.fn();
jest.mock('../src/config', () => ({
    ConfigManager: {
        getConfiguration: mockGetConfiguration,
        getInitializationOptions: mockGetInitializationOptions
    }
}));

jest.mock('../src/extension', () => ({
    getScanSchedulerInstance: jest.fn(() => ({
        updateAIScanState: jest.fn()
    }))
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        access: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        chmod: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' }, name: 'test-workspace', index: 0 }],
        fs: { stat: jest.fn().mockResolvedValue({ type: 1 }) },
        createFileSystemWatcher: jest.fn(() => ({
            onDidCreate: jest.fn(),
            onDidChange: jest.fn(),
            onDidDelete: jest.fn(),
            dispose: jest.fn()
        })),
        getConfiguration: jest.fn(() => ({
            get: jest.fn()
        }))
    },
    window: { showErrorMessage: jest.fn() },
    Uri: {
        parse: jest.fn((uri: string) => ({ fsPath: uri.replace('file://', '') })),
        joinPath: jest.fn((...args: any[]) => ({ fsPath: args.join('/') }))
    },
    ThemeColor: jest.fn()
}), { virtual: true });

import { LSPClient } from '../src/lsp/client';

const mockContext = {
    subscriptions: [],
    globalState: { get: jest.fn(), update: jest.fn() },
    extensionPath: '/test/extension',
    extensionUri: { fsPath: '/test/extension' },
    globalStorageUri: { fsPath: '/test/global-storage' }
} as any;

const mockOutputChannel = { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() } as any;
const mockStatusBarItem = { text: '', color: undefined, show: jest.fn(), dispose: jest.fn() } as any;
const mockFindingsProvider = {
    refresh: jest.fn(),
    updateFindings: jest.fn(),
    loadFindings: jest.fn(),
    loadFindingsWithEpoch: jest.fn()
} as any;

describe('LSPClient', () => {
    let lspClient: LSPClient;

    beforeEach(() => {
        mockStatusBarItem.text = '';
        mockStatusBarItem.color = undefined;

        mockLanguageClient['_onNotificationHandlers'].clear();
        mockLanguageClient.start.mockClear().mockResolvedValue(undefined);
        mockLanguageClient.stop.mockClear().mockResolvedValue(undefined);
        mockLanguageClient.sendRequest.mockClear().mockResolvedValue({ success: true });

        mockGetConfiguration.mockReturnValue({
            server: { path: '/usr/local/bin/tameshi-lsp', args: [], env: {} }
        });

        mockGetInitializationOptions.mockReturnValue({
            adapter: 'cli',
            scan: { include: ['**/*.sol'], exclude: ['**/node_modules/**'] }
        });

        lspClient = new LSPClient(mockContext, mockOutputChannel, mockStatusBarItem, mockFindingsProvider);
    });

    test('should create LSPClient instance', () => {
        expect(lspClient).toBeDefined();
        expect(lspClient.getClient()).toBeUndefined();
    });

    test('should return client after successful start', async () => {
        mockLanguageClient.start.mockResolvedValue(undefined);

        const client = await lspClient.start();

        expect(client).toBeDefined();
        expect(lspClient.getClient()).toBeDefined();
    });

    test('should set status to Idle when stopped', async () => {
        mockLanguageClient.start.mockResolvedValue(undefined);
        await lspClient.start();

        await lspClient.stop();

        expect(mockStatusBarItem.text).toBe('$(shield) Tameshi: Idle');
        expect(lspClient.getClient()).toBeUndefined();
    });
});
