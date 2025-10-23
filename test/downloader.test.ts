import { Downloader } from '../src/services/downloader';
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import { EventEmitter } from 'events';

jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showInputBox: jest.fn(),
        showOpenDialog: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn()
    },
    ProgressLocation: {
        Notification: 15
    },
    Uri: {
        joinPath: jest.fn((...args: any[]) => {
            const paths = args.slice(1).map((p: any) => typeof p === 'string' ? p : p.fsPath);
            return { fsPath: [args[0].fsPath, ...paths].join('/') };
        })
    }
}), { virtual: true });

const mockShowInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const mockShowWarningMessage = vscode.window.showWarningMessage as jest.Mock;
const mockShowQuickPick = vscode.window.showQuickPick as jest.Mock;
const mockShowInputBox = vscode.window.showInputBox as jest.Mock;
const mockShowOpenDialog = vscode.window.showOpenDialog as jest.Mock;
const mockShowErrorMessage = vscode.window.showErrorMessage as jest.Mock;
const mockWithProgress = vscode.window.withProgress as jest.Mock;

jest.mock('../src/constants', () => ({
    CONSTANTS: {
        binaryName: 'tameshi-lsp',
        globalStorageFolderForBinary: 'bin',
        platformSpecificAssetName: 'tameshi-lsp-x86_64-apple-darwin',
        githubRepo: 'tameshi-dev/TameshiLSP'
    }
}));

jest.mock('fs', () => ({
    createWriteStream: jest.fn(),
    promises: {
        mkdir: jest.fn(),
        chmod: jest.fn()
    },
    copyFileSync: jest.fn()
}));

const mockMkdir = require('fs').promises.mkdir;
const mockChmod = require('fs').promises.chmod;
const mockCopyFileSync = require('fs').copyFileSync;

jest.mock('https', () => ({
    get: jest.fn()
}));

const mockHttpsGet = require('https').get;

describe('Downloader', () => {
    let downloader: Downloader;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            globalStorageUri: { fsPath: '/global-storage' }
        } as any;

        mockShowWarningMessage.mockClear();
        mockShowQuickPick.mockClear();
        mockShowInputBox.mockClear();
        mockShowOpenDialog.mockClear();
        mockShowInformationMessage.mockClear();
        mockShowErrorMessage.mockClear();
        mockWithProgress.mockClear();
        mockHttpsGet.mockClear();
        mockMkdir.mockClear().mockResolvedValue(undefined);
        mockChmod.mockClear().mockResolvedValue(undefined);
        mockCopyFileSync.mockClear();

        downloader = new Downloader(mockContext);
    });

    describe('downloadLatestBinary - no releases', () => {
        beforeEach(() => {
            const mockResponse = new EventEmitter() as any;
            mockResponse.statusCode = 200;
            mockHttpsGet.mockImplementation((url: any, callback: Function) => {
                callback(mockResponse);
                setTimeout(() => {
                    mockResponse.emit('data', JSON.stringify([]));
                    mockResponse.emit('end');
                }, 0);
                return new EventEmitter();
            });
        });

        test('should show warning message with correct options', async () => {
            mockShowWarningMessage.mockResolvedValue('Cancel');

            await downloader.downloadLatestBinary();

            expect(mockShowWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('No releases found'),
                'Enter URL',
                'Browse Local File',
                'Cancel'
            );
        });

        test('should return null when user cancels', async () => {
            mockShowWarningMessage.mockResolvedValue('Cancel');

            const result = await downloader.downloadLatestBinary();

            expect(result).toBeNull();
        });
    });

    describe('downloadLatestBinary - with releases', () => {
        beforeEach(() => {
            const releases = [
                {
                    tag_name: 'v0.2.0',
                    name: 'Release 0.2.0',
                    draft: false,
                    prerelease: false,
                    assets: [
                        {
                            name: 'tameshi-lsp-x86_64-apple-darwin',
                            browser_download_url: 'https://github.com/tameshi-dev/TameshiLSP/releases/download/v0.2.0/tameshi-lsp-x86_64-apple-darwin'
                        }
                    ]
                },
                {
                    tag_name: 'v0.1.0',
                    name: 'Release 0.1.0',
                    draft: false,
                    prerelease: false,
                    assets: [
                        {
                            name: 'tameshi-lsp-x86_64-apple-darwin',
                            browser_download_url: 'https://github.com/tameshi-dev/TameshiLSP/releases/download/v0.1.0/tameshi-lsp-x86_64-apple-darwin'
                        }
                    ]
                }
            ];

            const mockResponse = new EventEmitter() as any;
            mockResponse.statusCode = 200;
            mockHttpsGet.mockImplementation((url: any, callback: Function) => {
                callback(mockResponse);
                setTimeout(() => {
                    mockResponse.emit('data', JSON.stringify(releases));
                    mockResponse.emit('end');
                }, 0);
                return new EventEmitter();
            });
        });

        test('should prompt for version selection with correct options', async () => {
            mockShowQuickPick.mockResolvedValue(undefined);

            await downloader.downloadLatestBinary();

            expect(mockShowQuickPick).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ label: 'v0.2.0', description: 'Latest' }),
                    expect.objectContaining({ label: 'v0.1.0' })
                ]),
                expect.any(Object)
            );
        });

        test('should show error if platform asset not found', async () => {
            mockShowQuickPick.mockResolvedValue({
                label: 'v0.2.0',
                release: {
                    tag_name: 'v0.2.0',
                    assets: [
                        {
                            name: 'wrong-binary-name',
                            browser_download_url: 'https://example.com/binary'
                        }
                    ]
                }
            });

            const result = await downloader.downloadLatestBinary();

            expect(mockShowErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('No binary found for your platform')
            );
            expect(result).toBeNull();
        });

        test('should return null when user cancels version selection', async () => {
            mockShowQuickPick.mockResolvedValue(undefined);

            const result = await downloader.downloadLatestBinary();

            expect(result).toBeNull();
        });
    });

    describe('input validation', () => {
        beforeEach(() => {
            const mockResponse = new EventEmitter() as any;
            mockResponse.statusCode = 200;
            mockHttpsGet.mockImplementation((url: any, callback: Function) => {
                callback(mockResponse);
                setTimeout(() => {
                    mockResponse.emit('data', JSON.stringify([]));
                    mockResponse.emit('end');
                }, 0);
                return new EventEmitter();
            });
        });

        test('should validate custom URL must start with https', async () => {
            mockShowWarningMessage.mockResolvedValue('Enter URL');

            let validationFunction: Function | undefined;
            mockShowInputBox.mockImplementation((options: any) => {
                validationFunction = options.validateInput;
                return Promise.resolve(undefined);
            });

            await downloader.downloadLatestBinary();

            expect(validationFunction).toBeDefined();
            expect(validationFunction!('')).toBe('URL is required');
            expect(validationFunction!('http://example.com')).toBe('URL must start with https://');
            expect(validationFunction!('https://example.com')).toBeNull();
        });
    });
});
