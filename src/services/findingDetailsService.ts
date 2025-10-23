import { ExtendedFinding } from '../types/findings';
import { LanguageClient } from 'vscode-languageclient/node';
import { getLogger, LogCategory } from '../utils/logger';

/**
 * LSP response for finding details request
 */
interface LSPFindingDetailsResponse {
    id: string;
    scanner_id?: string;
    rule?: string;
    scanner_type?: string;
    finding_type?: string;
    severity: string;
    confidence: string;
    title: string;
    description: string;
    location?: {
        file: string;
        line: number;
        column: number;
        end_line?: number;
        end_column?: number;
    };
    locations?: Array<{
        file: string;
        line: number;
        column: number;
        end_line?: number;
        end_column?: number;
    }>;
    code_frame?: {
        content: string;
    };
    source_excerpt?: string;
    code?: string;
    references?: string[];
    metadata?: Record<string, unknown>;
    augmented_data?: {
        contextual_analysis?: string;
        impact_assessment?: string;
        remediation_guidance?: string[];
        code_examples?: string[];
        similar_patterns?: string[];
        exploit_scenario?: string;
        risk_score?: number;
    };
    correlation_metadata?: {
        parent_finding_id?: string;
        related_finding_ids?: string[];
        correlation_type?: string;
        confidence_boost?: number;
        correlation_score?: number;
        scanner_agreement?: string;
    };
    detected_at?: string;
    augmented_at?: string;
}

/**
 * LSP error response
 */
interface LSPError {
    code: number;
    message?: string;
}

/**
 * Cache entry for finding details
 */
interface CacheEntry {
    finding: ExtendedFinding;
    timestamp: number;
}

/**
 * Pending request for request coalescing
 */
interface PendingRequest {
    resolve: (finding: ExtendedFinding | null) => void;
    reject: (error: Error) => void;
}

/**
 * Service for fetching and caching finding details from LSP server
 * Implements LRU cache with TTL and request coalescing
 */
export class FindingDetailsService {
    private cache: Map<string, CacheEntry> = new Map();
    private pendingRequests: Map<string, PendingRequest[]> = new Map();
    private readonly maxCacheSize: number;
    private readonly cacheTTL: number;
    private lspClient: LanguageClient | undefined;
    private serverSupportsDetails: boolean = true;

    /**
     * @param maxCacheSize Maximum number of cached findings (default: 100)
     * @param cacheTTL Cache time-to-live in milliseconds (default: 10 minutes)
     */
    constructor(maxCacheSize: number = 100, cacheTTL: number = 600000) {
        this.maxCacheSize = maxCacheSize;
        this.cacheTTL = cacheTTL;
    }

    /**
     * Set the LSP client for fetching details
     */
    public setLSPClient(client: LanguageClient | undefined): void {
        this.lspClient = client;
    }

    /**
     * Fetch details for a finding (with caching and coalescing)
     */
    public async fetchDetails(findingId: string): Promise<ExtendedFinding | null> {
        const cached = this.getCached(findingId);
        if (cached) {
            return cached;
        }

        if (this.pendingRequests.has(findingId)) {
            return new Promise((resolve, reject) => {
                this.pendingRequests.get(findingId)!.push({ resolve, reject });
            });
        }

        this.pendingRequests.set(findingId, []);

        try {
            const finding = await this.fetchFromServer(findingId);

            if (finding) {
                this.setCached(findingId, finding);
            }

            const pending = this.pendingRequests.get(findingId) || [];
            pending.forEach(p => p.resolve(finding));
            this.pendingRequests.delete(findingId);

            return finding;
        } catch (error) {
            const pending = this.pendingRequests.get(findingId) || [];
            const err = error instanceof Error ? error : new Error(String(error));
            pending.forEach(p => p.reject(err));
            this.pendingRequests.delete(findingId);

            throw error;
        }
    }

    /**
     * Prefetch details for multiple findings (bounded by limit)
     */
    public async prefetchDetails(findingIds: string[], limit?: number): Promise<void> {
        const idsToFetch = limit ? findingIds.slice(0, limit) : findingIds;

        const promises = idsToFetch.map(id =>
            this.fetchDetails(id).catch(err => {
                getLogger().warn(LogCategory.UI, `Prefetch failed for finding ${id}:`, err);
                return null;
            })
        );

        Promise.all(promises).catch(() => {
        });
    }

    /**
     * Invalidate cache for a specific finding or all findings
     */
    public invalidateCache(findingId?: string): void {
        if (findingId) {
            this.cache.delete(findingId);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Check if server supports detail requests
     */
    public serverSupportsDetailRequests(): boolean {
        return this.serverSupportsDetails;
    }

    /**
     * Get cache statistics
     */
    public getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }


    /**
     * Get finding from cache if valid
     */
    private getCached(findingId: string): ExtendedFinding | null {
        const entry = this.cache.get(findingId);
        if (!entry) {
            return null;
        }

        const age = Date.now() - entry.timestamp;
        if (age > this.cacheTTL) {
            this.cache.delete(findingId);
            return null;
        }

        this.cache.delete(findingId);
        this.cache.set(findingId, entry);

        return entry.finding;
    }

    /**
     * Set finding in cache with LRU eviction
     */
    private setCached(findingId: string, finding: ExtendedFinding): void {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(findingId, {
            finding,
            timestamp: Date.now()
        });
    }

    /**
     * Fetch finding details from LSP server
     */
    private async fetchFromServer(findingId: string): Promise<ExtendedFinding | null> {
        if (!this.lspClient) {
            throw new Error('LSP client not available');
        }

        if (!this.serverSupportsDetails) {
            return null;
        }

        try {
            const response = await this.lspClient.sendRequest('tameshi/getFindingDetails', {
                findingId
            }) as LSPFindingDetailsResponse | null;

            if (!response) {
                return null;
            }

            return this.mapLSPResponseToExtendedFinding(response);
        } catch (error: unknown) {
            const lspError = error as LSPError;
            if (lspError.code === -32601 || lspError.message?.includes('method not found')) {
                getLogger().warn(LogCategory.LSP, 'LSP server does not support tameshi/getFindingDetails');
                this.serverSupportsDetails = false;
                return null;
            }

            throw error;
        }
    }

    /**
     * Map LSP response to ExtendedFinding format
     */
    private mapLSPResponseToExtendedFinding(response: LSPFindingDetailsResponse): ExtendedFinding {
        const augmentedData = response.augmented_data ? {
            contextualAnalysis: response.augmented_data.contextual_analysis,
            impactAssessment: response.augmented_data.impact_assessment,
            remediationGuidance: response.augmented_data.remediation_guidance,
            codeExamples: response.augmented_data.code_examples,
            similarPatterns: response.augmented_data.similar_patterns,
            exploitScenario: response.augmented_data.exploit_scenario,
            riskScore: response.augmented_data.risk_score
        } : undefined;

        return {
            id: response.id,
            rule: response.scanner_id || response.rule || 'unknown',
            severity: this.mapSeverity(response.severity),
            confidence: this.mapConfidence(response.confidence),
            title: response.title,
            description: response.description,
            location: {
                file: response.location?.file || response.locations?.[0]?.file || '',
                line: response.location?.line || response.locations?.[0]?.line || 1,
                column: response.location?.column || response.locations?.[0]?.column || 1,
                endLine: response.location?.end_line || response.locations?.[0]?.end_line,
                endColumn: response.location?.end_column || response.locations?.[0]?.end_column
            },
            code: response.code_frame?.content || response.source_excerpt || response.code,
            references: (response.references || response.metadata?.references || []) as string[],

            scannerId: response.scanner_id,
            findingType: response.finding_type,
            scannerType: this.inferScannerType(response.scanner_id || response.scanner_type),
            metadata: response.metadata || {},
            augmentedData,

            correlationMetadata: response.correlation_metadata ? {
                parentFindingId: response.correlation_metadata.parent_finding_id,
                relatedFindingIds: response.correlation_metadata.related_finding_ids,
                correlationType: this.mapCorrelationType(response.correlation_metadata.correlation_type),
                confidenceBoost: response.correlation_metadata.confidence_boost,
                correlationScore: response.correlation_metadata.correlation_score,
                scannerAgreement: this.mapScannerAgreement(response.correlation_metadata.scanner_agreement)
            } : undefined,

            detectedAt: response.detected_at ? new Date(response.detected_at) : undefined,
            augmentedAt: response.augmented_at ? new Date(response.augmented_at) : undefined
        };
    }

    /**
     * Map severity string to typed enum
     */
    private mapSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
        const s = severity?.toLowerCase();
        switch (s) {
            case 'critical': return 'critical';
            case 'high': return 'high';
            case 'medium': return 'medium';
            case 'low': return 'low';
            default: return 'info';
        }
    }

    /**
     * Map confidence string to typed enum
     */
    private mapConfidence(confidence: string): 'high' | 'medium' | 'low' {
        const c = confidence?.toLowerCase();
        switch (c) {
            case 'high': return 'high';
            case 'medium': return 'medium';
            case 'low': return 'low';
            default: return 'medium';
        }
    }

    /**
     * Map correlation type string to typed enum
     */
    private mapCorrelationType(correlationType?: string): 'augmentation' | 'duplicate' | 'related' | 'refinement' | 'conflict' | undefined {
        if (!correlationType) {
            return undefined;
        }
        const c = correlationType.toLowerCase();
        switch (c) {
            case 'augmentation': return 'augmentation';
            case 'duplicate': return 'duplicate';
            case 'related': return 'related';
            case 'refinement': return 'refinement';
            case 'conflict': return 'conflict';
            default: return 'related';
        }
    }

    /**
     * Map scanner agreement string to typed enum
     */
    private mapScannerAgreement(scannerAgreement?: string): 'full' | 'partial' | 'conflict' | undefined {
        if (!scannerAgreement) {
            return undefined;
        }
        const s = scannerAgreement.toLowerCase();
        switch (s) {
            case 'full': return 'full';
            case 'partial': return 'partial';
            case 'conflict': return 'conflict';
            default: return 'partial';
        }
    }

    /**
     * Infer scanner type from scanner ID
     */
    private inferScannerType(scannerId?: string): 'deterministic' | 'llm' | 'hybrid' | 'ir' | 'source' {
        if (!scannerId) {
            return 'deterministic';
        }

        if (scannerId.startsWith('source_')) {
            return 'source';
        } else if (scannerId.startsWith('cranelift_')) {
            return 'ir';
        } else if (scannerId.startsWith('hybrid_')) {
            return 'hybrid';
        } else if (['reentrancy', 'access_control', 'unchecked_returns', 'overflow', 'dos',
                     'timestamp', 'front_running', 'general'].includes(scannerId)) {
            return 'llm';
        }

        return 'deterministic';
    }
}
