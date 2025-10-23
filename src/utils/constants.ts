/**
 * Centralized Constants for Tameshi Extension
 *
 * All magic numbers and configuration constants in one place.
 */

/**
 * Timing constants (all in milliseconds unless specified)
 */
export const TIMING = {
    /** Default idle threshold for activity detection */
    DEFAULT_IDLE_THRESHOLD_MS: 30000,

    /** Debounce delay for save events */
    SAVE_DEBOUNCE_MS: 1500,

    /** Settle time for workspace changes */
    WORKSPACE_SETTLE_MS: 3000,

    /** Maximum wait time for LSP client initialization */
    LSP_CLIENT_MAX_WAIT_MS: 30000,

    /** Retry interval for LSP client connection */
    LSP_CLIENT_RETRY_MS: 1000,

    /** Delay before processing save events */
    LSP_SAVE_PROCESS_DELAY_MS: 500,

    /** Milliseconds per second (for conversions) */
    MS_PER_SECOND: 1000,

    /** Seconds per minute (for conversions) */
    SECONDS_PER_MINUTE: 60,

    /** Minutes per hour (for conversions) */
    MINUTES_PER_HOUR: 60,

    /** Default cache timeout for finding details (10 minutes) */
    DETAILS_CACHE_TIMEOUT_MS: 600000,

    /** Debounce for smart AI rescan */
    SMART_RESCAN_DEBOUNCE_MS: 5000
} as const;

/**
 * Priority scores for gutter icon ranking
 */
export const PRIORITY_SCORES = {
    /** Boost for cross-scanner agreement */
    CROSS_SCANNER_AGREEMENT: 1000,

    /** Severity-based scores */
    SEVERITY: {
        CRITICAL: 500,
        HIGH: 400,
        MEDIUM: 300,
        LOW: 200,
        INFO: 100
    },

    /** Confidence-based multipliers */
    CONFIDENCE: {
        HIGH: 1.2,
        MEDIUM: 1.0,
        LOW: 0.8
    },

    /** Scanner type bonuses */
    SCANNER_TYPE: {
        HYBRID: 50,
        LLM: 30,
        DETERMINISTIC: 0
    },

    /** Correlation bonuses */
    CORRELATION: {
        HAS_CORRELATIONS: 100,
        PER_CORRELATION: 25,
        MAX_CORRELATION_BONUS: 250
    }
} as const;

/**
 * Cache and performance limits
 */
export const LIMITS = {
    /** Maximum cache size for finding details */
    MAX_DETAILS_CACHE_SIZE: 100,

    /** Maximum findings to display */
    MAX_FINDINGS_DISPLAY: 10000,

    /** Maximum depth for tree view nesting */
    MAX_TREE_DEPTH: 5,

    /** Maximum length for truncated text */
    MAX_TEXT_LENGTH: 200
} as const;

/**
 * File patterns
 */
export const FILE_PATTERNS = {
    /** Solidity file extensions */
    SOLIDITY_EXTENSIONS: ['.sol'],

    /** Yul file extensions */
    YUL_EXTENSIONS: ['.yul'],

    /** All supported extensions */
    SUPPORTED_EXTENSIONS: ['.sol', '.yul']
} as const;

/**
 * UI Text constants
 */
export const UI_TEXT = {
    /** Status bar messages */
    STATUS_BAR: {
        IDLE: '$(shield) Tameshi: Idle',
        READY: '$(shield) Tameshi: Ready',
        SCANNING: '$(shield) Tameshi: Scanning...',
        ERROR: '$(shield) Tameshi: Error'
    },

    /** Tree view labels */
    TREE_VIEW: {
        ROOT_TITLE: 'Vulnerability Triage',
        NO_FINDINGS: 'No findings detected',
        SCANNING: 'Scanning in progress...',
        CORRELATIONS: 'Cross-Scanner Correlations',
        DETERMINISTIC: '🛡️ Deterministic Scanners',
        AI_LAB: '✨ AI Lab'
    }
} as const;

/**
 * Validation thresholds
 */
export const THRESHOLDS = {
    /** Minimum correlation score to display */
    MIN_CORRELATION_SCORE: 0.5,

    /** Minimum confidence for high-priority findings */
    MIN_HIGH_PRIORITY_CONFIDENCE: 0.7,

    /** Maximum file size for inline scanning (in bytes) */
    MAX_INLINE_SCAN_SIZE: 1024 * 1024, // 1MB

    /** Minimum group size for correlation display */
    MIN_CORRELATION_GROUP_SIZE: 2
} as const;

/**
 * Default configuration values
 */
export const DEFAULTS = {
    /** Log level */
    LOG_LEVEL: 'info',

    /** Group findings by */
    GROUP_BY: 'severity',

    /** Scan on save mode */
    SCAN_ON_SAVE: 'smart',

    /** Smart rescan mode */
    SMART_RESCAN_MODE: 'off'
} as const;

/**
 * Type guards and validators
 */
export const REGEX_PATTERNS = {
    /** UUID pattern */
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

    /** SWC ID pattern */
    SWC_ID: /^SWC-\d{3}$/,

    /** Ethereum address pattern */
    ETH_ADDRESS: /^0x[a-fA-F0-9]{40}$/
} as const;
