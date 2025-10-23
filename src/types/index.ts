export * from './findings';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'informational';

export interface Finding {
    id: string;
    rule: string;
    severity: Severity;
    confidence: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    location: {
        file: string;
        line: number;
        column: number;
        endLine?: number;
        endColumn?: number;
    };
    code?: string;
    references?: string[];
    scannerType?: 'deterministic' | 'llm' | 'hybrid' | 'ir' | 'source';
    scannerId?: string;
    correlationId?: string;
    correlationType?: 'augmentation' | 'duplicate' | 'related' | 'refinement' | 'conflict';
}
