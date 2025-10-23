import { FindingDetailsService } from '../src/services/findingDetailsService';

const mockLSPClient = { sendRequest: jest.fn() };

describe('FindingDetailsService', () => {
    let service: FindingDetailsService;

    beforeEach(() => {
        service = new FindingDetailsService(100, 600000);
        service.setLSPClient(mockLSPClient as any);
        mockLSPClient.sendRequest.mockClear();
    });

    test('should cache fetched details', async () => {
        const mockResponse = {
            id: 'finding1',
            title: 'Test Finding',
            severity: 'high',
            confidence: 'high',
            description: 'Test description',
            scanner_id: 'test_scanner',
            locations: [{ file: '/test.sol', line: 10, column: 5 }]
        };

        mockLSPClient.sendRequest.mockResolvedValue(mockResponse);

        await service.fetchDetails('finding1');
        expect(mockLSPClient.sendRequest).toHaveBeenCalledTimes(1);

        await service.fetchDetails('finding1');
        expect(mockLSPClient.sendRequest).toHaveBeenCalledTimes(1); // Still 1, used cache
    });

    test('should invalidate specific cache entry', async () => {
        const mockResponse = {
            id: 'finding1',
            title: 'Test',
            severity: 'high',
            confidence: 'high',
            description: 'Test',
            scanner_id: 'test',
            locations: [{ file: '/test.sol', line: 10, column: 5 }]
        };

        mockLSPClient.sendRequest.mockResolvedValue(mockResponse);

        await service.fetchDetails('finding1');
        service.invalidateCache('finding1');
        await service.fetchDetails('finding1');

        expect(mockLSPClient.sendRequest).toHaveBeenCalledTimes(2);
    });

    test('should coalesce concurrent requests for same finding', async () => {
        const mockResponse = {
            id: 'finding1',
            title: 'Test',
            severity: 'high',
            confidence: 'high',
            description: 'Test',
            scanner_id: 'test',
            locations: [{ file: '/test.sol', line: 10, column: 5 }]
        };

        mockLSPClient.sendRequest.mockImplementation(() =>
            new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
        );

        const promises = [
            service.fetchDetails('finding1'),
            service.fetchDetails('finding1'),
            service.fetchDetails('finding1')
        ];

        await Promise.all(promises);

        expect(mockLSPClient.sendRequest).toHaveBeenCalledTimes(1);
    });
});
