import * as path from 'path';
import * as fs from 'fs';
import { FindingCorrelationService } from '../../src/services/findingCorrelationService';
import { ExtendedFinding, getScannerType } from '../../src/types/findings';

describe('End-to-End Correlation Workflow', () => {
    let correlationService: FindingCorrelationService;
    let testFindings: ExtendedFinding[];

    beforeAll(() => {
        correlationService = new FindingCorrelationService();

        const fixturesPath = path.join(__dirname, '../fixtures');
        const detData = JSON.parse(fs.readFileSync(path.join(fixturesPath, 'deterministicFindings.json'), 'utf-8'));
        const llmData = JSON.parse(fs.readFileSync(path.join(fixturesPath, 'llmAugmentations.json'), 'utf-8'));

        const detFindings: ExtendedFinding[] = detData.findings.map((f: any) => ({
            id: f.id,
            rule: f.scanner_id,
            severity: f.severity,
            confidence: f.confidence,
            title: f.title,
            description: f.description,
            location: {
                file: f.locations[0].file,
                line: f.locations[0].line,
                column: f.locations[0].column
            },
            scannerType: getScannerType(f.scanner_id, f.metadata),
            scannerId: f.scanner_id,
            findingType: f.finding_type
        }));

        const llmFindings: ExtendedFinding[] = llmData.findings.map((f: any) => ({
            id: f.id,
            rule: f.scanner_id,
            severity: f.severity,
            confidence: f.confidence,
            title: f.title,
            description: f.description,
            location: {
                file: f.locations?.[0]?.file || '',
                line: f.locations?.[0]?.line || 1,
                column: f.locations?.[0]?.column || 1
            },
            scannerType: getScannerType(f.scanner_id, f.metadata),
            scannerId: f.scanner_id,
            findingType: f.finding_type
        }));

        testFindings = [...detFindings, ...llmFindings];
    });

    test('should identify and correlate related findings', () => {
        const correlated = correlationService.correlateFindings(testFindings);
        const withCorrelations = correlated.filter(f => f.correlationMetadata?.relatedFindingIds?.length);

        expect(withCorrelations.length).toBeGreaterThan(0);
    });

    test('should merge duplicate findings from multiple scanners', () => {
        const duplicates: ExtendedFinding[] = [
            {
                id: 'source-reent',
                rule: 'source_reentrancy',
                severity: 'high',
                confidence: 'high',
                title: 'Reentrancy',
                description: 'Source analysis',
                location: { file: '/test/contract.sol', line: 15, column: 9 },
                scannerType: 'source',
                findingType: 'reentrancy'
            },
            {
                id: 'ir-reent',
                rule: 'cranelift_reentrancy',
                severity: 'high',
                confidence: 'medium',
                title: 'Reentrancy',
                description: 'IR analysis',
                location: { file: '/test/contract.sol', line: 15, column: 9 },
                scannerType: 'ir',
                findingType: 'reentrancy'
            }
        ];

        const merged = correlationService.mergeDuplicates(duplicates);

        expect(merged.length).toBe(1);
        expect(merged[0].title).toContain('2 scanners');
    });

    test('should handle empty finding sets', () => {
        const empty: ExtendedFinding[] = [];
        const correlated = correlationService.correlateFindings(empty);

        expect(correlated.length).toBe(0);
    });
});
