class MockEventEmitter {
    private listeners: Function[] = [];
    get event() {
        return (listener: Function) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
    }
    fire(data?: any) {
        this.listeners.forEach(listener => listener(data));
    }
}

const mockConfigGet = jest.fn();

jest.mock('vscode', () => ({
    workspace: { getConfiguration: jest.fn(() => ({ get: mockConfigGet })) },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TreeItem: jest.fn().mockImplementation(function(this: any, label: any, collapsibleState: any) {
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = undefined;
        this.description = undefined;
        this.tooltip = undefined;
        this.iconPath = undefined;
        this.command = undefined;
        return this;
    }),
    ThemeIcon: jest.fn(),
    ThemeColor: jest.fn(),
    Uri: { file: jest.fn((path: string) => ({ fsPath: path })) },
    Range: jest.fn(),
    EventEmitter: MockEventEmitter
}), { virtual: true });

jest.mock('../src/config', () => ({
    ConfigManager: {
        getConfiguration: jest.fn(() => ({ findings: { view: { groupBy: 'severity' }, mergeMode: 'separate' } }))
    }
}));

import { FindingsProvider, Finding } from '../src/views/findingsView';

const mockContext = {
    subscriptions: [],
    globalState: { get: jest.fn(), update: jest.fn() },
    workspaceState: { get: jest.fn(), update: jest.fn() },
    extensionPath: '/test/extension'
} as any;

describe('FindingsProvider', () => {
    let provider: FindingsProvider;
    let mockFindings: Finding[];

    beforeEach(() => {
        jest.clearAllMocks();
        mockConfigGet.mockImplementation((key: string) => 'severity');

        provider = new FindingsProvider(mockContext);

        mockFindings = [
            {
                id: 'finding-1',
                rule: 'reentrancy-eth',
                severity: 'critical',
                confidence: 'high',
                title: 'Reentrancy vulnerability',
                description: 'Potential reentrancy attack',
                location: { file: '/test/Vulnerable.sol', line: 42, column: 8 }
            },
            {
                id: 'finding-2',
                rule: 'unchecked-send',
                severity: 'high',
                confidence: 'medium',
                title: 'Unchecked external call',
                description: 'Return value not checked',
                location: { file: '/test/Vulnerable.sol', line: 58, column: 12 }
            }
        ];
    });

    test('should update findings and trigger refresh', async () => {
        const refreshSpy = jest.spyOn(provider, 'refresh');

        await provider.updateFindings(mockFindings);

        expect(provider['findings']).toEqual(mockFindings);
        expect(refreshSpy).toHaveBeenCalled();
    });

    test('should return grouped findings at root level', async () => {
        await provider.updateFindings(mockFindings);
        const children = await provider.getChildren();

        expect(children).toHaveLength(1); // Vulnerability Triage root group
        expect(children[0]).toHaveProperty('label');
        const rootGroup = children[0] as any;
        expect(rootGroup.label).toContain('Vulnerability Triage');
        expect(rootGroup).toHaveProperty('children');
        expect(rootGroup.children).toHaveLength(2); // Deterministic + AI Lab groups
    });

    test('should create tree item for finding', async () => {
        await provider.updateFindings(mockFindings);
        const finding = mockFindings[0];
        const treeItem = provider.getTreeItem(finding);

        expect(treeItem.label).toBe(finding.title);
        expect(treeItem.description).toContain(finding.rule);
        expect(treeItem.contextValue).toBe('finding');
    });

    test('should emit tree data change event on refresh', () => {
        const emitSpy = jest.spyOn(provider['_onDidChangeTreeData'], 'fire');

        provider.refresh();

        expect(emitSpy).toHaveBeenCalled();
    });
});
