import {
    ExtendedFinding,
    IFindingCorrelationService,
    CorrelationType,
    findingsOverlap,
    findingsAreSimilarType,
    getScannerType,
    AugmentedData
} from '../types/findings';

/**
 * Configuration options for correlation service
 */
export interface CorrelationConfig {
    minCorrelationScore?: number;
    minAugmentationConfidence?: 'low' | 'medium' | 'high';
    severityUpgradePolicy?: 'off' | 'llm_high_conf_only' | 'any_llm' | 'multi_scanner';
}

/**
 * Service for correlating findings from different scanners
 */
export class FindingCorrelationService implements IFindingCorrelationService {
    private config: CorrelationConfig;

    constructor(config?: CorrelationConfig) {
        this.config = {
            minCorrelationScore: config?.minCorrelationScore ?? 0.5,
            minAugmentationConfidence: config?.minAugmentationConfidence ?? 'medium',
            severityUpgradePolicy: config?.severityUpgradePolicy ?? 'llm_high_conf_only'
        };
    }

    /**
     * Update configuration
     */
    public updateConfig(config: CorrelationConfig): void {
        this.config = {
            ...this.config,
            ...config
        };
    }

    /**
     * Correlate findings based on location and type
     */
    correlateFindings(findings: ExtendedFinding[]): ExtendedFinding[] {
        const correlated = [...findings];

        const locationGroups = this.groupByLocation(correlated);

        for (const group of locationGroups) {
            this.correlateFindingGroup(group);
        }

        return correlated;
    }

    /**
     * Augment a deterministic finding with LLM data
     */
    augmentFinding(baseFinding: ExtendedFinding, llmFinding: ExtendedFinding): ExtendedFinding {
        const meetsConfidenceThreshold = this.meetsMinConfidence(llmFinding.confidence);

        const augmented: ExtendedFinding = {
            ...baseFinding,
            correlationMetadata: {
                ...baseFinding.correlationMetadata,
                relatedFindingIds: [
                    ...(baseFinding.correlationMetadata?.relatedFindingIds ?? []),
                    llmFinding.id
                ],
                correlationType: 'augmentation',
                confidenceBoost: this.calculateConfidenceBoost(baseFinding, llmFinding),
                scannerAgreement: this.determineScannerAgreement(baseFinding, llmFinding)
            },
            augmentedData: meetsConfidenceThreshold ? (llmFinding.metadata?.augmented_data || llmFinding.augmentedData) : undefined,
            augmentedAt: meetsConfidenceThreshold ? new Date() : undefined
        };

        if (this.shouldUpgradeSeverity(baseFinding, llmFinding)) {
            augmented.severity = llmFinding.severity;
        }

        return augmented;
    }

    /**
     * Find related findings for a given finding
     */
    findRelatedFindings(finding: ExtendedFinding, allFindings: ExtendedFinding[]): ExtendedFinding[] {
        const related: ExtendedFinding[] = [];

        for (const other of allFindings) {
            if (other.id === finding.id) {
                continue;
            }

            const score = this.calculateCorrelationScore(finding, other);
            if (score > (this.config.minCorrelationScore ?? 0.5)) {
                related.push(other);
            }
        }

        return related.sort((a, b) => {
            const scoreA = this.calculateCorrelationScore(finding, a);
            const scoreB = this.calculateCorrelationScore(finding, b);
            return scoreB - scoreA;
        });
    }

    /**
     * Calculate correlation score between two findings (0.0 - 1.0)
     */
    calculateCorrelationScore(finding1: ExtendedFinding, finding2: ExtendedFinding): number {
        let score = 0;

        if (findingsOverlap(finding1, finding2)) {
            const overlapAmount = this.calculateLocationOverlap(finding1, finding2);
            score += 0.4 * overlapAmount;
        }

        if (findingsAreSimilarType(finding1, finding2)) {
            score += 0.4;
        }

        if (finding1.severity === finding2.severity) {
            score += 0.1;
        }

        if (finding1.metadata?.related_to === finding2.id ||
            finding2.metadata?.related_to === finding1.id) {
            score += 0.1;
        }

        return Math.min(score, 1.0);
    }

    /**
     * Merge duplicate findings from different scanners
     */
    mergeDuplicates(findings: ExtendedFinding[]): ExtendedFinding[] {
        const merged: ExtendedFinding[] = [];
        const processed = new Set<string>();

        for (const finding of findings) {
            if (processed.has(finding.id)) {
                continue;
            }

            const duplicates = findings.filter(f =>
                f.id !== finding.id &&
                !processed.has(f.id) &&
                this.areDuplicates(finding, f)
            );

            if (duplicates.length === 0) {
                merged.push(finding);
            } else {
                const mergedFinding = this.mergeFindingGroup([finding, ...duplicates]);
                merged.push(mergedFinding);

                processed.add(finding.id);
                duplicates.forEach(d => processed.add(d.id));
            }
        }

        return merged;
    }


    private groupByLocation(findings: ExtendedFinding[]): ExtendedFinding[][] {
        const groups = new Map<string, ExtendedFinding[]>();

        for (const finding of findings) {
            const key = `${finding.location.file}:${Math.floor(finding.location.line / 10)}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(finding);
        }

        return Array.from(groups.values());
    }

    private correlateFindingGroup(group: ExtendedFinding[]): void {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const type1 = getScannerType(group[i].scannerId ?? '');
                const type2 = getScannerType(group[j].scannerId ?? '');

                const isDeterministic1 = (type1 === 'deterministic' || type1 === 'source' || type1 === 'ir');
                const isDeterministic2 = (type2 === 'deterministic' || type2 === 'source' || type2 === 'ir');
                const isAI1 = (type1 === 'llm' || type1 === 'hybrid');
                const isAI2 = (type2 === 'llm' || type2 === 'hybrid');

                const isDeterministicToAI = (isDeterministic1 && isAI2) || (isAI1 && isDeterministic2);

                if (!isDeterministicToAI) {
                    continue;
                }

                const score = this.calculateCorrelationScore(group[i], group[j]);
                if (score > 0.7) {
                    this.linkFindings(group[i], group[j], score);
                }
            }
        }
    }

    private linkFindings(f1: ExtendedFinding, f2: ExtendedFinding, score: number): void {
        if (!f1.correlationMetadata) {
            f1.correlationMetadata = {};
        }
        if (!f1.correlationMetadata.relatedFindingIds) {
            f1.correlationMetadata.relatedFindingIds = [];
        }
        if (!f1.correlationMetadata.relatedFindingIds.includes(f2.id)) {
            f1.correlationMetadata.relatedFindingIds.push(f2.id);
        }
        if (f1.correlationMetadata.correlationScore === undefined) {
            f1.correlationMetadata.correlationScore = score;
        }
        if (!f1.correlationMetadata.correlationType) {
            f1.correlationMetadata.correlationType = this.inferCorrelationType(f1, f2, score);
        }
        if (!f1.correlationMetadata.scannerAgreement) {
            f1.correlationMetadata.scannerAgreement = this.determineScannerAgreement(f1, f2);
        }

        if (!f2.correlationMetadata) {
            f2.correlationMetadata = {};
        }
        if (!f2.correlationMetadata.relatedFindingIds) {
            f2.correlationMetadata.relatedFindingIds = [];
        }
        if (!f2.correlationMetadata.relatedFindingIds.includes(f1.id)) {
            f2.correlationMetadata.relatedFindingIds.push(f1.id);
        }
        if (f2.correlationMetadata.correlationScore === undefined) {
            f2.correlationMetadata.correlationScore = score;
        }
        if (!f2.correlationMetadata.correlationType) {
            f2.correlationMetadata.correlationType = this.inferCorrelationType(f2, f1, score);
        }
        if (!f2.correlationMetadata.scannerAgreement) {
            f2.correlationMetadata.scannerAgreement = this.determineScannerAgreement(f2, f1);
        }
    }

    private inferCorrelationType(f1: ExtendedFinding, f2: ExtendedFinding, score: number): CorrelationType {
        const type1 = getScannerType(f1.scannerId ?? '');
        const type2 = getScannerType(f2.scannerId ?? '');

        if ((type1 === 'llm' && type2 === 'deterministic') || (type1 === 'deterministic' && type2 === 'llm')) {
            return 'augmentation';
        }

        if (score > 0.85 && type1 === type2) {
            return 'duplicate';
        }

        const severityOrder = ['low', 'medium', 'high', 'critical'];
        const s1Index = severityOrder.indexOf(f1.severity);
        const s2Index = severityOrder.indexOf(f2.severity);
        if (Math.abs(s1Index - s2Index) > 1) {
            return 'conflict';
        }

        return 'related';
    }

    private calculateLocationOverlap(f1: ExtendedFinding, f2: ExtendedFinding): number {
        if (f1.location.file !== f2.location.file) {
            return 0;
        }

        const f1Start = f1.location.line;
        const f1End = f1.location.endLine || f1.location.line;
        const f2Start = f2.location.line;
        const f2End = f2.location.endLine || f2.location.line;

        const overlapStart = Math.max(f1Start, f2Start);
        const overlapEnd = Math.min(f1End, f2End);

        if (overlapEnd < overlapStart) {
            return 0;
        }

        const overlapLines = overlapEnd - overlapStart + 1;
        const f1Lines = f1End - f1Start + 1;
        const f2Lines = f2End - f2Start + 1;
        const totalLines = Math.max(f1Lines, f2Lines);

        return overlapLines / totalLines;
    }

    private calculateConfidenceBoost(base: ExtendedFinding, llm: ExtendedFinding): number {
        let boost = 0;

        boost += 0.2;

        if (base.severity === llm.severity) {
            boost += 0.1;
        }

        if (llm.confidence === 'high') {
            boost += 0.15;
        }

        return Math.min(boost, 0.5);
    }

    private determineScannerAgreement(
        f1: ExtendedFinding,
        f2: ExtendedFinding
    ): 'full' | 'partial' | 'conflict' {
        const severityMatch = f1.severity === f2.severity;
        const typeMatch = findingsAreSimilarType(f1, f2);

        if (severityMatch && typeMatch) {
            return 'full';
        } else if (severityMatch || typeMatch) {
            return 'partial';
        } else {
            return 'conflict';
        }
    }

    private shouldUpgradeSeverity(base: ExtendedFinding, llm: ExtendedFinding): boolean {
        const policy = this.config.severityUpgradePolicy || 'llm_high_conf_only';

        if (policy === 'off') {
            return false;
        }

        const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
        const baseIndex = severityOrder.indexOf(base.severity);
        const llmIndex = severityOrder.indexOf(llm.severity);

        if (llmIndex <= baseIndex) {
            return false;
        }

        const isLLM = llm.scannerType === 'llm' || getScannerType(llm.scannerId ?? '') === 'llm';

        switch (policy) {
            case 'llm_high_conf_only':
                return isLLM && llm.confidence === 'high';
            case 'any_llm':
                return isLLM;
            case 'multi_scanner':
                return (llm.correlationMetadata?.relatedFindingIds?.length ?? 0) > 0;
            default:
                return false;
        }
    }

    private meetsMinConfidence(confidence: 'high' | 'medium' | 'low'): boolean {
        const minConf = this.config.minAugmentationConfidence || 'medium';
        const confidenceOrder = { low: 1, medium: 2, high: 3 };
        return confidenceOrder[confidence] >= confidenceOrder[minConf];
    }

    private areDuplicates(f1: ExtendedFinding, f2: ExtendedFinding): boolean {
        if (f1.location.file !== f2.location.file || f1.location.line !== f2.location.line) {
            return false;
        }

        if (!findingsAreSimilarType(f1, f2)) {
            return false;
        }

        return this.calculateCorrelationScore(f1, f2) >= 0.8;
    }

    private mergeFindingGroup(findings: ExtendedFinding[]): ExtendedFinding {
        const sorted = [...findings].sort((a, b) => {
            const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
            return severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity);
        });

        const base = sorted[0];
        const others = sorted.slice(1);

        const scannerIds = findings.map(f => f.scannerId || f.rule).filter(Boolean);

        const allAugmentedData = findings
            .filter(f => f.augmentedData || f.metadata?.augmented_data)
            .map(f => f.augmentedData || (f.metadata?.augmented_data as AugmentedData | undefined));

        return {
            ...base,
            title: `${base.title} (Confirmed by ${findings.length} scanners)`,
            description: this.mergeDescriptions(findings),
            correlationMetadata: {
                relatedFindingIds: others.map(f => f.id),
                correlationType: 'duplicate',
                scannerAgreement: 'full',
                confidenceBoost: 0.3 * (findings.length - 1)
            },
            augmentedData: allAugmentedData.length > 0 ? this.mergeAugmentedData(allAugmentedData) : undefined,
            metadata: {
                ...base.metadata,
                merged_from: findings.map(f => f.id),
                scanner_ids: scannerIds
            }
        };
    }

    private mergeDescriptions(findings: ExtendedFinding[]): string {
        const descriptions = findings.map(f => f.description);
        return descriptions.join(' | ');
    }

    private mergeAugmentedData(dataArray: Array<AugmentedData | undefined>): AugmentedData {
        const merged: AugmentedData = {};

        for (const data of dataArray) {
            if (!data) {
                continue;
            }
            if (data.contextualAnalysis) {
                merged.contextualAnalysis = data.contextualAnalysis;
            }
            if (data.impactAssessment) {
                merged.impactAssessment = data.impactAssessment;
            }
            if (data.remediationGuidance) {
                merged.remediationGuidance = data.remediationGuidance;
            }
            if (data.codeExamples) {
                merged.codeExamples = data.codeExamples;
            }
            if (data.riskScore !== undefined) {
                merged.riskScore = Math.max(merged.riskScore ?? 0, data.riskScore);
            }
        }

        return merged;
    }
}
