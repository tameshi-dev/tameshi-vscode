import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONSTANTS } from '../constants';

export interface BinaryLocation {
    path: string;
    source: 'settings' | 'downloaded';
}

export class BinaryFinder {
    constructor(private context: vscode.ExtensionContext) {}

    async find(): Promise<BinaryLocation | null> {
        const fromSettings = await this.findFromSettings();
        if (fromSettings) {
            return fromSettings;
        }

        const fromDownload = await this.findDownloaded();
        if (fromDownload) {
            return fromDownload;
        }

        return null;
    }

    private async findFromSettings(): Promise<BinaryLocation | null> {
        const config = vscode.workspace.getConfiguration('tameshi');
        const serverPath = config.get<string>('server.path');

        if (serverPath && serverPath.trim() !== '') {
            const resolvedPath = this.resolvePath(serverPath);
            if (await this.fileExists(resolvedPath)) {
                return { path: resolvedPath, source: 'settings' };
            }
        }

        return null;
    }

    private async findDownloaded(): Promise<BinaryLocation | null> {
        const downloadPath = this.getDownloadedBinaryPath();
        if (await this.fileExists(downloadPath)) {
            return { path: downloadPath, source: 'downloaded' };
        }
        return null;
    }

    getDownloadedBinaryPath(): string {
        return vscode.Uri.joinPath(
            this.context.globalStorageUri,
            CONSTANTS.globalStorageFolderForBinary,
            CONSTANTS.binaryName
        ).fsPath;
    }

    private resolvePath(inputPath: string): string {
        let resolvedPath = inputPath;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (workspaceFolder && resolvedPath.includes('${workspaceFolder}')) {
            resolvedPath = resolvedPath.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
        }

        if (path.isAbsolute(resolvedPath)) {
            return resolvedPath;
        }

        if (workspaceFolder) {
            return path.join(workspaceFolder.uri.fsPath, resolvedPath);
        }

        return resolvedPath;
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }
}
