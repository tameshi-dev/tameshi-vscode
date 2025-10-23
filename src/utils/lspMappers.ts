/**
 * LSP Type Mappers
 *
 * Centralizes all LSP type conversion logic to avoid duplication.
 * Maps LSP server types to extension types consistently across all components.
 */

import { Severity, Confidence, ScannerType, AnalysisType } from '../lsp/protocol';

/**
 * Map LSP severity string to typed Severity
 */
export function mapSeverity(lspSeverity: string): Severity {
    const normalized = lspSeverity.toLowerCase();

    const severityMap: Record<string, Severity> = {
        'critical': 'critical',
        'high': 'high',
        'medium': 'medium',
        'low': 'low',
        'informational': 'informational',
        'info': 'informational'
    };

    return severityMap[normalized] ?? 'informational';
}

/**
 * Map LSP confidence string to typed Confidence
 */
export function mapConfidence(lspConfidence: string): Confidence {
    const normalized = lspConfidence.toLowerCase();

    const confidenceMap: Record<string, Confidence> = {
        'high': 'high',
        'medium': 'medium',
        'low': 'low'
    };

    return confidenceMap[normalized] ?? 'medium';
}

/**
 * Map LSP scanner type string to typed ScannerType
 */
export function mapScannerType(lspScannerType: string): ScannerType {
    const normalized = lspScannerType.toLowerCase();

    if (normalized.startsWith('hybrid_') || normalized === 'hybrid') {
        return 'hybrid';
    }

    if (normalized.startsWith('llm_') || normalized === 'llm' ||
        ['openai', 'anthropic', 'claude', 'gpt', 'gemini', 'llama'].includes(normalized)) {
        return 'llm';
    }

    if (normalized.startsWith('source_') || normalized === 'source') {
        return 'source';
    }

    if (normalized.startsWith('cranelift_') || normalized === 'ir' || normalized.endsWith('_ir')) {
        return 'ir';
    }

    return 'deterministic';
}

/**
 * Map LSP analysis type string to typed AnalysisType
 */
export function mapAnalysisType(lspAnalysisType: string): AnalysisType {
    const normalized = lspAnalysisType.toLowerCase();

    const analysisTypeMap: Record<string, AnalysisType> = {
        'deterministic': 'Deterministic',
        'llm': 'LLM',
        'hybrid': 'Hybrid'
    };

    return analysisTypeMap[normalized] ?? 'Deterministic';
}

/**
 * Severity ordering for comparison (higher number = more severe)
 */
export function getSeverityScore(severity: Severity): number {
    const scores: Record<Severity, number> = {
        'critical': 5,
        'high': 4,
        'medium': 3,
        'low': 2,
        'informational': 1
    };

    return scores[severity] ?? 0;
}

/**
 * Confidence ordering for comparison (higher number = more confident)
 */
export function getConfidenceScore(confidence: Confidence): number {
    const scores: Record<Confidence, number> = {
        'high': 3,
        'medium': 2,
        'low': 1
    };

    return scores[confidence] ?? 0;
}

/**
 * Check if a scanner type is AI-based
 */
export function isAIScannerType(scannerType: ScannerType): boolean {
    return scannerType === 'llm' || scannerType === 'hybrid';
}

/**
 * Check if a scanner type is deterministic
 */
export function isDeterministicScannerType(scannerType: ScannerType): boolean {
    return scannerType === 'deterministic' || scannerType === 'source' || scannerType === 'ir';
}

/**
 * Get display name for scanner type
 */
export function getScannerTypeDisplayName(scannerType: ScannerType): string {
    const displayNames: Record<ScannerType, string> = {
        'deterministic': 'Deterministic',
        'llm': 'AI/LLM',
        'hybrid': 'Hybrid',
        'source': 'Source-based',
        'ir': 'IR-based'
    };

    return displayNames[scannerType] ?? 'Unknown';
}

/**
 * Get display name for severity
 */
export function getSeverityDisplayName(severity: Severity): string {
    const displayNames: Record<Severity, string> = {
        'critical': 'Critical',
        'high': 'High',
        'medium': 'Medium',
        'low': 'Low',
        'informational': 'Info'
    };

    return displayNames[severity] ?? severity;
}

/**
 * Get emoji icon for severity
 */
export function getSeverityIcon(severity: Severity): string {
    const icons: Record<Severity, string> = {
        'critical': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '🔵',
        'informational': '⚪'
    };

    return icons[severity] ?? '⚪';
}
