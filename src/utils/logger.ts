/**
 * Logging utility for Tameshi VSCode Extension
 *
 * Provides structured logging with different levels and categories.
 * Replaces console.log usage with proper OutputChannel-based logging.
 */

import * as vscode from 'vscode';

export enum LogLevel {
    Error = 0,
    Warn = 1,
    Info = 2,
    Debug = 3,
    Trace = 4
}

export enum LogCategory {
    General = 'General',
    LSP = 'LSP',
    Scan = 'Scan',
    Correlation = 'Correlation',
    Config = 'Config',
    UI = 'UI',
    Cache = 'Cache',
    ChangeTracking = 'ChangeTracking'
}

export class Logger {
    private static instance: Logger | undefined;
    private outputChannel: vscode.OutputChannel;
    private level: LogLevel = LogLevel.Info;
    private enableTimestamps: boolean = true;

    private constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public static initialize(outputChannel: vscode.OutputChannel): void {
        Logger.instance = new Logger(outputChannel);
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
                const mockChannel = {
                    appendLine: () => {},
                    show: () => {},
                    clear: () => {},
                    dispose: () => {}
                } as any;
                Logger.instance = new Logger(mockChannel);
            } else {
                throw new Error('Logger not initialized. Call Logger.initialize() first.');
            }
        }
        return Logger.instance;
    }

    public setLevel(level: LogLevel): void {
        this.level = level;
        this.info(LogCategory.General, `Log level set to ${LogLevel[level]}`);
    }

    public setEnableTimestamps(enable: boolean): void {
        this.enableTimestamps = enable;
    }

    private formatMessage(category: LogCategory, level: LogLevel, message: string, ...args: unknown[]): string {
        const parts: string[] = [];

        if (this.enableTimestamps) {
            const timestamp = new Date().toISOString();
            parts.push(`[${timestamp}]`);
        }

        parts.push(`[${LogLevel[level].toUpperCase()}]`);
        parts.push(`[${category}]`);
        parts.push(message);

        if (args.length > 0) {
            const formattedArgs = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            parts.push(formattedArgs);
        }

        return parts.join(' ');
    }

    private log(category: LogCategory, level: LogLevel, message: string, ...args: unknown[]): void {
        if (level <= this.level) {
            const formatted = this.formatMessage(category, level, message, ...args);
            this.outputChannel.appendLine(formatted);
        }
    }

    public error(category: LogCategory, message: string, ...args: unknown[]): void {
        this.log(category, LogLevel.Error, message, ...args);
    }

    public warn(category: LogCategory, message: string, ...args: unknown[]): void {
        this.log(category, LogLevel.Warn, message, ...args);
    }

    public info(category: LogCategory, message: string, ...args: unknown[]): void {
        this.log(category, LogLevel.Info, message, ...args);
    }

    public debug(category: LogCategory, message: string, ...args: unknown[]): void {
        this.log(category, LogLevel.Debug, message, ...args);
    }

    public trace(category: LogCategory, message: string, ...args: unknown[]): void {
        this.log(category, LogLevel.Trace, message, ...args);
    }

    /**
     * Show the output channel to the user
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * Clear the output channel
     */
    public clear(): void {
        this.outputChannel.clear();
    }
}

/**
 * Convenience function to get logger instance
 */
export function getLogger(): Logger {
    return Logger.getInstance();
}
