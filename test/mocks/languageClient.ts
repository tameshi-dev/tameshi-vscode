// Mock Language Client for testing
export class MockLanguageClient {
    private _onDidChangeState = jest.fn();
    private _onNotificationHandlers = new Map<string, Function>();

    public onDidChangeState = jest.fn((handler) => {
        this._onDidChangeState = handler;
        return { dispose: jest.fn() };
    });

    public start = jest.fn().mockResolvedValue(undefined);
    public stop = jest.fn().mockResolvedValue(undefined);
    public sendRequest = jest.fn().mockResolvedValue({ success: true });
    public onNotification = jest.fn((type: string, handler: Function) => {
        this._onNotificationHandlers.set(type, handler);
        return { dispose: jest.fn() };
    });

    // Helper methods for testing
    public simulateStateChange(newState: number) {
        if (this._onDidChangeState) {
            this._onDidChangeState({ newState });
        }
    }

    public simulateNotification(type: string, params: any) {
        const handler = this._onNotificationHandlers.get(type);
        if (handler) {
            handler(params);
        }
    }

    public getNotificationHandler(type: string) {
        return this._onNotificationHandlers.get(type);
    }
}

// Mock the LanguageClient constructor
export const LanguageClient = jest.fn(() => new MockLanguageClient());

// Mock server options and client options
export const ServerOptions = {};
export const LanguageClientOptions = {};
export const TransportKind = {
    stdio: 1,
    ipc: 2,
    pipe: 3,
    socket: 4
};

jest.mock('vscode-languageclient/node', () => ({
    LanguageClient,
    ServerOptions,
    LanguageClientOptions,
    TransportKind
}), { virtual: true });