// Mock vscode workspace configuration
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockOnDidChangeConfiguration = jest.fn();

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: mockGet,
            update: mockUpdate
        })),
        onDidChangeConfiguration: mockOnDidChangeConfiguration
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
}), { virtual: true });

import { ConfigManager } from '../src/config';

describe('ConfigManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Set up default mock responses
        mockGet.mockImplementation((key: string, defaultValue?: any) => {
            const config: any = {
                'server.path': '',
                'server.args': [],
                'scan.onSave': 'file',
                'scan.include': ['**/*.sol', '**/*.yul'],
                'scan.exclude': ['**/node_modules/**'],
                'adapter': 'cli',
                'cli.path': '',
                'findings.view.groupBy': 'severity',
                'rules': {},
                'limits': {},
                'docs.baseUrl': 'https://docs.tameshi.dev'
            };
            return config[key] !== undefined ? config[key] : defaultValue;
        });
    });

    test('should return default configuration', () => {
        const config = ConfigManager.getConfiguration();

        expect(config).toBeDefined();
        expect(config.server.path).toBe('');
        expect(config.scan.onSave).toBe('file');
        expect(config.adapter).toBe('cli');
        expect(config.findings.view.groupBy).toBe('severity');
    });

    test('should handle custom configuration values', () => {
        mockGet.mockImplementation((key: string, defaultValue?: any) => {
            const customConfig: any = {
                'server.path': '/custom/path/tameshi-lsp',
                'scan.onSave': 'workspace',
                'adapter': 'daemon'
            };
            return customConfig[key] !== undefined ? customConfig[key] : defaultValue;
        });

        const config = ConfigManager.getConfiguration();

        expect(config.server.path).toBe('/custom/path/tameshi-lsp');
        expect(config.scan.onSave).toBe('workspace');
        expect(config.adapter).toBe('daemon');
    });

    test('should return initialization options from configuration', () => {
        const options = ConfigManager.getInitializationOptions();

        expect(options).toEqual({
            adapter: 'cli',
            cliPath: '',
            scan: {
                include: ['**/*.sol', '**/*.yul'],
                exclude: ['**/node_modules/**'],
                onSave: 'file'
            },
            rules: {},
            limits: {},
            docs: {
                baseUrl: 'https://docs.tameshi.dev'
            }
        });
    });

    test('should register configuration change listener', () => {
        const callback = jest.fn();
        mockOnDidChangeConfiguration.mockReturnValue({ dispose: jest.fn() });

        const disposable = ConfigManager.onConfigurationChanged(callback);

        expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
        expect(disposable).toHaveProperty('dispose');
    });
});
