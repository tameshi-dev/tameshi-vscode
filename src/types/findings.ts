import * as vscode from 'vscode';

/**
 * Scanner types that can generate findings
 */
export type ScannerType = 'deterministic' | 'llm' | 'hybrid' | 'ir' | 'source';

/**
 * Types of correlations between findings
 */
export type CorrelationType = 'augmentation' | 'duplicate' | 'related' | 'refinement' | 'conflict';

/**
 * Metadata for correlating findings from different scanners
 */
export interface CorrelationMetadata {
    /** ID of the parent finding (for augmented findings) */
    parentFindingId?: string;

    /** IDs of related findings */
    relatedFindingIds?: string[];

    /** Type of correlation */
    correlationType?: CorrelationType;

    /** Confidence boost from correlation (0.0 - 1.0) */
    confidenceBoost?: number;

    /** Correlation score (0.0 - 1.0) */
    correlationScore?: number;

    /** Scanner agreement level */
    scannerAgreement?: 'full' | 'partial' | 'conflict';

    /** Validation status (user triage) */
    validationStatus?: 'confirmed' | 'disputed' | 'pending';

    /** When validation was done */
    validatedAt?: Date;

    /** Who validated (user/automated) */
    validatedBy?: string;

    /** Dispute reason if disputed */
    disputeReason?: string;
}

/**
 * Augmented data provided by LLM-based scanners
 */
export interface AugmentedData {
    /** Detailed contextual analysis */
    contextualAnalysis?: string;

    /** Business/security impact assessment */
    impactAssessment?: string;

    /** Step-by-step remediation guidance */
    remediationGuidance?: string[];

    /** Code examples for fixes */
    codeExamples?: string[];

    /** Similar vulnerability patterns found */
    similarPatterns?: string[];

    /** Exploitation scenario */
    exploitScenario?: string;

    /** Risk score (0-100) */
    riskScore?: number;
}

/**
 * Extended Finding interface with correlation support
 */
export interface ExtendedFinding {
    id: string;
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'informational';
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

    scannerType?: ScannerType;
    correlationMetadata?: CorrelationMetadata;
    augmentedData?: AugmentedData;

    scannerId?: string;
    findingType?: string;
    metadata?: Record<string, unknown>;

    detectedAt?: Date;
    augmentedAt?: Date;
}

/**
 * Service for correlating findings from different scanners
 */
export interface IFindingCorrelationService {
    /**
     * Correlate findings based on location and type
     */
    correlateFindings(findings: ExtendedFinding[]): ExtendedFinding[];

    /**
     * Augment a deterministic finding with LLM data
     */
    augmentFinding(baseFinding: ExtendedFinding, llmFinding: ExtendedFinding): ExtendedFinding;

    /**
     * Find related findings for a given finding
     */
    findRelatedFindings(finding: ExtendedFinding, allFindings: ExtendedFinding[]): ExtendedFinding[];

    /**
     * Calculate correlation score between two findings
     */
    calculateCorrelationScore(finding1: ExtendedFinding, finding2: ExtendedFinding): number;

    /**
     * Merge duplicate findings from different scanners
     */
    mergeDuplicates(findings: ExtendedFinding[]): ExtendedFinding[];
}

/**
 * Helper to check if findings overlap in location
 */
export function findingsOverlap(f1: ExtendedFinding, f2: ExtendedFinding): boolean {
    if (f1.location.file !== f2.location.file) {
        return false;
    }

    const f1Start = f1.location.line;
    const f1End = f1.location.endLine || f1.location.line;
    const f2Start = f2.location.line;
    const f2End = f2.location.endLine || f2.location.line;

    return !(f1End < f2Start || f2End < f1Start);
}

/**
 * Helper to check if findings are of similar type
 */
export function findingsAreSimilarType(f1: ExtendedFinding, f2: ExtendedFinding): boolean {
    if (f1.findingType && f2.findingType && f1.findingType === f2.findingType) {
        return true;
    }

    const rule1Base = f1.rule.replace(/^(source_|hybrid_|cranelift_)/, '');
    const rule2Base = f2.rule.replace(/^(source_|hybrid_|cranelift_)/, '');

    if (rule1Base === rule2Base && rule1Base.length > 0) {
        return true;
    }

    return false;
}

/**
 * Helper to determine scanner type from scanner ID
 */
export function getScannerType(scannerId: string, metadata?: Record<string, unknown>): ScannerType {
    const lowerCaseId = scannerId.toLowerCase();

    if (metadata?.llm_model || metadata?.ai_model) {
        return 'llm';
    }

    if (scannerId.startsWith('hybrid_')) {
        return 'hybrid';
    }

    if (['openai', 'anthropic', 'claude', 'gpt', 'gemini', 'llama', 'ai_scanner', 'llm_scanner'].includes(lowerCaseId)) {
        return 'llm';
    }

    if (lowerCaseId.includes('llm') || lowerCaseId.includes('ai_') || lowerCaseId.includes('ai-')) {
        return 'llm';
    }

    if (scannerId.startsWith('source_')) {
        return 'source';
    }

    if (scannerId.startsWith('cranelift_') || lowerCaseId === 'ir' || lowerCaseId.endsWith('_ir')) {
        return 'ir';
    }

    return 'deterministic';
}