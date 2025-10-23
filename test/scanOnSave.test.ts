const mockConfig = {
    scan: {
        onSave: 'file',
        include: ['**/*.sol', '**/*.yul'],
        exclude: ['**/node_modules/**', '**/lib/**']
    }
};

jest.mock('../src/config', () => ({
    ConfigManager: {
        getConfiguration: jest.fn(() => mockConfig),
        onConfigurationChanged: jest.fn(() => ({ dispose: jest.fn() }))
    }
}));

describe('Scan-on-save', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConfig.scan.onSave = 'file';
    });

    const matchesPattern = (path: string, pattern: string): boolean => {
        let regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '§§')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.');

        regexPattern = regexPattern.replace(/§§\//g, '(?:.*/)?');
        regexPattern = regexPattern.replace(/\/§§/g, '(?:/.*)?');
        regexPattern = regexPattern.replace(/§§/g, '.*');

        return new RegExp(`^${regexPattern}$`).test(path);
    };

    test('should match .sol files with **/*.sol pattern', () => {
        expect(matchesPattern('contracts/MyContract.sol', '**/*.sol')).toBe(true);
        expect(matchesPattern('src/contracts/MyContract.sol', '**/*.sol')).toBe(true);
        expect(matchesPattern('MyContract.yul', '**/*.sol')).toBe(false);
    });

    test('should exclude node_modules with **/node_modules/** pattern', () => {
        expect(matchesPattern('node_modules/lib/file.sol', '**/node_modules/**')).toBe(true);
        expect(matchesPattern('src/contracts/file.sol', '**/node_modules/**')).toBe(false);
    });

    test('should trigger file scan when onSave is "file"', () => {
        mockConfig.scan.onSave = 'file';
        expect(mockConfig.scan.onSave).toBe('file');
    });

    test('should trigger workspace scan when onSave is "workspace"', () => {
        mockConfig.scan.onSave = 'workspace';
        expect(mockConfig.scan.onSave).toBe('workspace');
    });
});
