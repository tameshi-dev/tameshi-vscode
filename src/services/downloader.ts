import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { CONSTANTS } from '../constants';

interface GitHubRelease {
    tag_name: string;
    name: string;
    draft: boolean;
    prerelease: boolean;
    assets: Array<{
        name: string;
        browser_download_url: string;
    }>;
}

export class Downloader {
    constructor(private context: vscode.ExtensionContext) {}

    async downloadLatestBinary(): Promise<string | null> {
        const releases = await this.fetchReleases();
        if (releases.length === 0) {
            const action = await vscode.window.showWarningMessage(
                'No releases found on GitHub. Would you like to download from a custom URL or use a local file?',
                'Enter URL',
                'Browse Local File',
                'Cancel'
            );

            if (action === 'Enter URL') {
                const url = await vscode.window.showInputBox({
                    prompt: 'Enter the URL to download the Tameshi LSP binary',
                    placeHolder: 'https://example.com/tameshi-lsp-binary',
                    validateInput: (value) => {
                        if (!value) return 'URL is required';
                        if (!value.startsWith('https://')) {
                            return 'URL must start with https://';
                        }
                        return null;
                    }
                });

                if (url) {
                    return await this.downloadFromUrl(url);
                }
            } else if (action === 'Browse Local File') {
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    title: 'Select Tameshi LSP Binary',
                    filters: {
                        'Executable': ['exe', ''],
                        'All Files': ['*']
                    }
                });

                if (fileUri && fileUri[0]) {
                    const downloadPath = this.getDownloadPath();
                    await this.ensureDirectoryExists(path.dirname(downloadPath));

                    fs.copyFileSync(fileUri[0].fsPath, downloadPath);
                    await this.makeExecutable(downloadPath);

                    vscode.window.showInformationMessage('Binary copied successfully');
                    return downloadPath;
                }
            }

            return null;
        }

        const selectedRelease = releases[0];

        const asset = selectedRelease.assets.find(
            a => a.name === CONSTANTS.platformSpecificAssetName
        );

        if (!asset) {
            vscode.window.showErrorMessage(
                `No binary found for your platform: ${CONSTANTS.platformSpecificAssetName}`
            );
            return null;
        }

        const downloadPath = this.getDownloadPath();
        await this.ensureDirectoryExists(path.dirname(downloadPath));

        const success = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Downloading Tameshi LSP ${selectedRelease.tag_name}`,
                cancellable: false
            },
            async (progress) => {
                return await this.downloadFile(
                    asset.browser_download_url,
                    downloadPath,
                    progress
                );
            }
        );

        if (success) {
            await this.makeExecutable(downloadPath);
            vscode.window.showInformationMessage(
                `Successfully downloaded Tameshi LSP ${selectedRelease.tag_name}`
            );
            return downloadPath;
        }

        return null;
    }

    private async fetchReleases(): Promise<GitHubRelease[]> {
        return new Promise((resolve) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${CONSTANTS.githubRepo}/releases?per_page=10`,
                method: 'GET',
                headers: {
                    'User-Agent': 'tameshi-vscode',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            https.get(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.message) {
                            resolve([]);
                            return;
                        }

                        if (!Array.isArray(parsed)) {
                            resolve([]);
                            return;
                        }

                        const releases = parsed as GitHubRelease[];
                        const validReleases = releases.filter(r => !r.draft && !r.prerelease);
                        resolve(validReleases);
                    } catch (error) {
                        resolve([]);
                    }
                });
            }).on('error', () => {
                resolve([]);
            });
        });
    }

    private async downloadFromUrl(url: string): Promise<string | null> {
        const downloadPath = this.getDownloadPath();
        await this.ensureDirectoryExists(path.dirname(downloadPath));

        const success = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Downloading from custom URL`,
                cancellable: false
            },
            async (progress) => {
                return await this.downloadFile(url, downloadPath, progress);
            }
        );

        if (success) {
            await this.makeExecutable(downloadPath);
            vscode.window.showInformationMessage('Successfully downloaded Tameshi LSP');
            return downloadPath;
        }

        return null;
    }

    private downloadFile(
        url: string,
        destination: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const file = fs.createWriteStream(destination);

            https.get(url, { headers: { 'User-Agent': 'tameshi-vscode' } }, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        https.get(redirectUrl, { headers: { 'User-Agent': 'tameshi-vscode' } }, (redirectResponse) => {
                            const totalSize = parseInt(redirectResponse.headers['content-length'] || '0', 10);
                            let downloadedSize = 0;
                            let lastReportedProgress = 0;

                            redirectResponse.on('data', (chunk) => {
                                downloadedSize += chunk.length;
                                const currentProgress = Math.round((downloadedSize / totalSize) * 100);

                                if (currentProgress > lastReportedProgress) {
                                    progress.report({
                                        increment: currentProgress - lastReportedProgress,
                                        message: `${currentProgress}%`
                                    });
                                    lastReportedProgress = currentProgress;
                                }
                            });

                            redirectResponse.pipe(file);

                            file.on('finish', () => {
                                file.close();
                                resolve(true);
                            });
                        }).on('error', (err) => {
                            fs.unlink(destination, () => {});
                            vscode.window.showErrorMessage(`Download failed: ${err.message}`);
                            resolve(false);
                        });
                    }
                } else if (response.statusCode === 200) {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(true);
                    });
                } else {
                    file.close();
                    fs.unlink(destination, () => {});
                    vscode.window.showErrorMessage(`Download failed with status: ${response.statusCode}`);
                    resolve(false);
                }
            }).on('error', (err) => {
                fs.unlink(destination, () => {});
                vscode.window.showErrorMessage(`Download failed: ${err.message}`);
                resolve(false);
            });
        });
    }

    private getDownloadPath(): string {
        return vscode.Uri.joinPath(
            this.context.globalStorageUri,
            CONSTANTS.globalStorageFolderForBinary,
            CONSTANTS.binaryName
        ).fsPath;
    }

    private async ensureDirectoryExists(dir: string): Promise<void> {
        try {
            await fs.promises.mkdir(dir, { recursive: true });
        } catch (error) {
        }
    }

    private async makeExecutable(filePath: string): Promise<void> {
        if (process.platform !== 'win32') {
            try {
                await fs.promises.chmod(filePath, 0o755);
            } catch (error) {
            }
        }
    }
}
