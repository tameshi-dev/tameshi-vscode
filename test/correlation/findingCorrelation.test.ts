import { FindingCorrelationService } from '../../src/services/findingCorrelationService';
import { ExtendedFinding } from '../../src/types/findings';

describe('FindingCorrelationService', () => {
    let service: FindingCorrelationService;

    beforeEach(() => {
        service = new FindingCorrelationService();
    });

    test('should return high score for identical location and type', () => {
        const finding1: ExtendedFinding = {
            id: 'f1',
            rule: 'reentrancy',
            severity: 'high',
            confidence: 'high',
            title: 'Test',
            description: 'Test',
            location: { file: '/test.sol', line: 10, column: 5 },
            findingType: 'reentrancy'
        };

        const finding2: ExtendedFinding = {
            ...finding1,
            id: 'f2',
            rule: 'source_reentrancy'
        };

        const score = service.calculateCorrelationScore(finding1, finding2);
        expect(score).toBeGreaterThan(0.8);
    });

    test('should augment deterministic finding with LLM data', () => {
        const detFinding: ExtendedFinding = {
            id: 'det-001',
            rule: 'source_reentrancy',
            severity: 'high',
            confidence: 'high',
            title: 'Reentrancy detected',
            description: 'Basic description',
            location: { file: '/test.sol', line: 15, column: 9 },
            scannerType: 'deterministic'
        };

        const llmFinding: ExtendedFinding = {
            id: 'llm-001',
            rule: 'reentrancy',
            severity: 'critical',
            confidence: 'medium',
            title: 'Critical reentrancy',
            description: 'Detailed LLM analysis',
            location: { file: '/test.sol', line: 15, column: 9 },
            scannerType: 'llm',
            augmentedData: {
                contextualAnalysis: 'Detailed context',
                impactAssessment: 'High impact',
                remediationGuidance: ['Fix 1', 'Fix 2'],
                riskScore: 95
            }
        };

        const augmented = service.augmentFinding(detFinding, llmFinding);

        expect(augmented.correlationMetadata).toBeDefined();
        expect(augmented.correlationMetadata?.relatedFindingIds).toContain('llm-001');
        expect(augmented.augmentedData).toBeDefined();
    });

    test('should merge exact duplicate findings', () => {
        const findings: ExtendedFinding[] = [
            {
                id: 'f1',
                rule: 'reentrancy',
                severity: 'high',
                confidence: 'high',
                title: 'Reentrancy',
                description: 'Desc 1',
                location: { file: '/test.sol', line: 15, column: 9 },
                findingType: 'reentrancy',
                scannerId: 'source_reentrancy'
            },
            {
                id: 'f2',
                rule: 'source_reentrancy',
                severity: 'high',
                confidence: 'high',
                title: 'Reentrancy',
                description: 'Desc 2',
                location: { file: '/test.sol', line: 15, column: 9 },
                findingType: 'reentrancy',
                scannerId: 'cranelift_reentrancy'
            }
        ];

        const merged = service.mergeDuplicates(findings);

        expect(merged.length).toBe(1);
        expect(merged[0].title).toContain('Confirmed by 2 scanners');
    });

    test('should correlate findings with cross-scanner agreement', () => {
        const findings: ExtendedFinding[] = [
            {
                id: 'f1',
                rule: 'source_reentrancy',
                severity: 'high',
                confidence: 'high',
                title: 'Test',
                description: 'Test',
                location: { file: '/test.sol', line: 15, column: 9 },
                findingType: 'reentrancy',
                scannerType: 'deterministic',
                scannerId: 'source_reentrancy'
            },
            {
                id: 'f2',
                rule: 'reentrancy',
                severity: 'high',
                confidence: 'medium',
                title: 'Test',
                description: 'Test',
                location: { file: '/test.sol', line: 15, column: 9 },
                findingType: 'reentrancy',
                scannerType: 'llm',
                scannerId: 'ai_scanner'
            }
        ];

        const correlated = service.correlateFindings(findings);

        expect(correlated[0].correlationMetadata).toBeDefined();
        expect(correlated[1].correlationMetadata).toBeDefined();
    });
});
