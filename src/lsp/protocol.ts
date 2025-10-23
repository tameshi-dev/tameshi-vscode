/**
 * LSP Protocol Type Definitions for Tameshi
 *
 * This file contains all type definitions for LSP requests, responses,
 * and notifications used by the Tameshi language server.
 */

/**
 * Base LSP types
 */
export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface Location {
    uri: string;
    range: Range;
}

export interface TextDocumentIdentifier {
    uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
    version: number;
}

/**
 * Scan-related types
 */
export type ScanScope = WorkspaceScope | FileScope;

export interface WorkspaceScope {
    type: 'workspace';
}

export interface FileScope {
    type: 'file';
    path: string;
}

export interface ScanOptions {
    force?: boolean;
    skipCache?: boolean;
}

/**
 * Scan request/response
 */
export interface ScanWorkspaceParams {
    scope: ScanScope;
    options?: ScanOptions;
}

export interface ScanWorkspaceResponse {
    success: boolean;
    message?: string;
    findingsCount?: number;
}

/**
 * Scan progress notification
 */
export interface ScanProgressParams {
    message: string;
    percentage?: number;
    stage?: 'initializing' | 'scanning' | 'analyzing' | 'complete';
}

/**
 * Findings updated notification
 */
export type ScanType = 'deterministic' | 'ai' | 'hybrid';

export interface FindingsUpdatedParams {
    files?: string[];
    versions?: Record<string, number>;
    scanEpoch?: number;
    scanType?: ScanType;
    count?: number;
}

/**
 * Finding severity and confidence
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Scanner types
 */
export type ScannerType = 'deterministic' | 'llm' | 'hybrid' | 'ir' | 'source';
export type AnalysisType = 'Deterministic' | 'LLM' | 'Hybrid';

/**
 * Correlation types
 */
export type CorrelationType = 'augmentation' | 'duplicate' | 'related' | 'refinement' | 'conflict';
export type ScannerAgreement = 'full' | 'partial' | 'conflict';
export type ValidationStatus = 'confirmed' | 'disputed' | 'pending';

export interface CorrelationInfo {
    relatedFindingId: string;
    correlationType: CorrelationType;
    scannerAgreement: ScannerAgreement;
    correlationScore: number;
    validationStatus?: ValidationStatus;
}

/**
 * Finding metadata
 */
export interface FindingMetadata {
    affectedFunctions: string[];
    affectedVariables: string[];
    affectedContracts: string[];
    recommendation?: string;
    references: string[];
    gasImpact?: number;
    correlations: CorrelationInfo[];
    analysisType?: AnalysisType;
}

/**
 * LSP Finding (from server)
 */
export interface LSPFinding {
    id: string;
    scannerId: string;
    swcId?: string;
    findingType: string;
    severity: string;
    baseSeverity: string;
    confidence: string;
    confidenceScore: number;
    title: string;
    description: string;
    locations: LSPLocation[];
    metadata?: FindingMetadata;
}

export interface LSPLocation {
    file: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    snippet?: string;
}

/**
 * Get findings request/response
 */
export interface GetFindingsParams {
    scope: ScanScope;
    minSeverity?: Severity;
    minConfidence?: Confidence;
}

export interface GetFindingsResponse {
    findings: LSPFinding[];
    totalCount: number;
    scanEpoch?: number;
}

/**
 * Export findings request/response
 */
export type ExportFormat = 'sarif' | 'json';

export interface ExportFindingsParams {
    format: ExportFormat;
    outputPath: string;
    scope: ScanScope;
    pretty?: boolean;
}

export interface ExportFindingsResponse {
    outputPath: string;
    findingsCount: number;
    format: ExportFormat;
    fileSize: number;
}

/**
 * LLM scan request/response
 */
export interface LLMScanParams {
    scope: ScanScope;
    options?: ScanOptions;
}

export interface LLMScanResponse {
    success: boolean;
    message?: string;
    findingsCount?: number;
}

/**
 * Execute command request
 */
export interface ExecuteCommandParams {
    command: string;
    arguments?: unknown[];
}

export interface ExecuteCommandResponse {
    success?: boolean;
    message?: string;
    [key: string]: unknown;
}

/**
 * Refresh results request
 */
export interface RefreshResultsParams {
    scope?: ScanScope;
}

export interface RefreshResultsResponse {
    success: boolean;
    findingsCount?: number;
}

/**
 * Configuration types
 */
export interface LLMConfigParams {
    enabled: boolean;
    provider?: string;
    model?: string;
    apiKey?: string;
}

export interface LLMConfigResponse {
    success: boolean;
    message?: string;
}

/**
 * Custom LSP requests
 */
export namespace TameshiRequests {
    export const ScanWorkspace = 'tameshi/scanWorkspace';
    export const ScanFile = 'tameshi/scanFile';
    export const GetFindings = 'tameshi/getFindings';
    export const ExportReport = 'tameshi/exportReport';
    export const RefreshResults = 'tameshi/refreshResults';
    export const LLMScan = 'tameshi/llmScan';
    export const ReloadLLMConfig = 'tameshi/reloadLLMConfig';
}

/**
 * Custom LSP notifications
 */
export namespace TameshiNotifications {
    export const ScanProgress = 'tameshi/scanProgress';
    export const FindingsUpdated = 'tameshi/findingsUpdated';
}

/**
 * Workspace execute command arguments
 */
export interface WorkspaceExecuteCommandParams {
    command: string;
    arguments: unknown[];
}
