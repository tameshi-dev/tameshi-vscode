import { BinaryFinder } from '../src/services/binaryFinder';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }]
    },
    Uri: {
        joinPath: jest.fn((...args: any[]) => {
            const paths = args.slice(1).map((p: any) => typeof p === 'string' ? p : p.fsPath);
            return { fsPath: [args[0].fsPath, ...paths].join('/') };
        })
    }
}), { virtual: true });

jest.mock('../src/constants', () => ({
    CONSTANTS: {
        binaryName: 'tameshi-lsp',
        globalStorageFolderForBinary: 'bin'
    }
}));

jest.mock('fs', () => ({
    promises: {
        access: jest.fn()
    },
    constants: {
        F_OK: 0
    }
}));

const mockAccess = require('fs').promises.access;

describe('BinaryFinder', () => {
    let finder: BinaryFinder;
    let mockContext: vscode.ExtensionContext;
    let mockGetConfiguration: jest.Mock;

    beforeEach(() => {
        mockContext = {
            globalStorageUri: { fsPath: '/global-storage' }
        } as any;

        mockGetConfiguration = vscode.workspace.getConfiguration as jest.Mock;
        mockGetConfiguration.mockClear();
        mockAccess.mockClear();

        finder = new BinaryFinder(mockContext);
    });

    describe('find', () => {
        test('should return binary from settings if configured and exists', async () => {
            mockGetConfiguration.mockReturnValue({
                get: jest.fn((key: string) => key === 'server.path' ? '/custom/path/tameshi-lsp' : undefined)
            });
            mockAccess.mockResolvedValue(undefined);

            const result = await finder.find();

            expect(result).toEqual({
                path: '/custom/path/tameshi-lsp',
                source: 'settings'
            });
            expect(mockGetConfiguration).toHaveBeenCalledWith('tameshi');
        });

        test('should return downloaded binary if settings not configured', async () => {
            mockGetConfiguration.mockReturnValue({
                get: jest.fn(() => undefined)
            });
            mockAccess.mockResolvedValue(undefined);

            const result = await finder.find();

            expect(result).toEqual({
                path: '/global-storage/bin/tameshi-lsp',
                source: 'downloaded'
            });
        });

        test('should return null if no binary found', async () => {
            mockGetConfiguration.mockReturnValue({
                get: jest.fn(() => undefined)
            });
            mockAccess.mockRejectedValue(new Error('Not found'));

            const result = await finder.find();

            expect(result).toBeNull();
        });

        test('should resolve relative paths from settings', async () => {
            mockGetConfiguration.mockReturnValue({
                get: jest.fn((key: string) => key === 'server.path' ? './bin/tameshi-lsp' : undefined)
            });
            mockAccess.mockResolvedValue(undefined);

            const result = await finder.find();

            expect(result).toEqual({
                path: path.join('/workspace', 'bin', 'tameshi-lsp'),
                source: 'settings'
            });
        });
    });

    describe('getDownloadedBinaryPath', () => {
        test('should return correct path', () => {
            const path = finder.getDownloadedBinaryPath();

            expect(path).toBe('/global-storage/bin/tameshi-lsp');
        });
    });
});
