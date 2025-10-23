# Tameshi Security Scanner (Preview)

[![Tests](https://github.com/tameshi-dev/tameshi-vscode/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/tameshi-dev/tameshi-vscode/actions/workflows/test.yml)
[![Latest Release](https://img.shields.io/github/release/tameshi-dev/tameshi-vscode.svg)](https://github.com/tameshi-dev/tameshi-vscode/releases/latest)
![Preview](https://img.shields.io/badge/Status-Preview-orange)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Comprehensive security analysis for Solidity, Yul, and EVM smart contracts with multi-scanner vulnerability detection and LLM-powered analysis.

## Install

### From Marketplace
Install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=tameshi.tameshi-vscode) or search for "Tameshi Security Scanner" in VS Code Extensions.

### From VSIX
```bash
code --install-extension tameshi-vscode-0.1.8.vsix
```

### First Run Setup
On first activation, the extension connects to the Tameshi LSP server for security analysis. Ensure you have the Tameshi LSP server installed on your system.

**Supported Platforms:**
- macOS (Intel & Apple Silicon)
- Linux (x64 & ARM64)
- Windows (x64)

You can configure the server path in settings: `tameshi.server.path`

## Usage

1. Open a Solidity or Yul project
2. Right-click any file or folder → Select "Tameshi" commands
3. Security findings are displayed in the Tameshi sidebar
4. Click on findings to view detailed analysis and suggested fixes

**Note:** The extension automatically detects your project root by looking for common configuration files (foundry.toml, hardhat.config.js, package.json, etc.).

**Available Commands** (Cmd+Shift+P):

- `Tameshi: Scan Workspace` - Analyze entire project for vulnerabilities
- `Tameshi: Scan Current File` - Analyze active file
- `Tameshi: Run LLM Scan on Current File` - Deep AI-powered analysis on current file
- `Tameshi: Run LLM Scan on Workspace` - Deep AI-powered analysis on entire project
- `Tameshi: Clear Findings` - Remove all current findings
- `Tameshi: Restart Language Server` - Restart the LSP server
- `Tameshi: Open Finding Details` - Open detailed information for a finding
- `Tameshi: Export SARIF Report to Workspace` - Export findings in SARIF format

## Features

### Multi-Scanner Vulnerability Detection

Tameshi combines multiple security scanners to provide comprehensive vulnerability detection:
- Pattern-based static analysis
- Data flow analysis
- Control flow analysis
- Optional LLM-powered deep analysis

### Smart Finding Correlation

Automatically correlates findings across different scanners to:
- Reduce false positives
- Provide confidence scores
- Show relationships between vulnerabilities
- Merge duplicate findings

### AI-Powered Analysis

Optional LLM integration provides:
- Deep semantic analysis
- Context-aware vulnerability detection
- Automatic severity assessment
- Detailed remediation suggestions

### Real-Time Scanning

- **On Save**: Automatically scan files when saved
- **On Idle**: Scan workspace during inactivity periods
- **On Workspace Open**: Scan on startup if results are stale
- **Git Integration**: Scan after pull, checkout, or merge operations
- **Smart Rescan**: Automatically rescan modified code with AI findings

### Rich Editor Integration

- **Gutter Icons**: Visual indicators for findings in the editor
- **Hover Details**: Rich tooltips with vulnerability information
- **CodeLens**: Inline summary of findings per function and file
- **Status Bar**: Quick overview of workspace security status

### Vulnerability Triage View

Dedicated sidebar view with:
- Findings grouped by severity, file, or rule
- Detailed vulnerability information
- One-click navigation to affected code
- Export capabilities

## Configuration

The extension can be configured through VS Code settings:

### Server Configuration

- `tameshi.server.path` - Path to the Tameshi LSP server executable (default: `""` - uses PATH lookup)
- `tameshi.server.args` - Additional arguments for the server (default: `[]`)
- `tameshi.server.env` - Environment variables for the server (default: `{}`)
- `tameshi.adapter` - Adapter mode: `cli` or `daemon` (default: `cli`)
- `tameshi.cli.path` - Path to the Tameshi CLI when using CLI adapter (default: `""`)

### Scan Configuration

- `tameshi.scan.onSave` - Trigger scans on save: `none`, `file`, or `workspace` (default: `file`)
- `tameshi.scan.onSave.debounce` - Milliseconds to wait after save (default: `1000`)
- `tameshi.scan.onIdle.enabled` - Enable idle scanning (default: `true`)
- `tameshi.scan.onIdle.idleSeconds` - Idle time before scan, 5-300 seconds (default: `30`)
- `tameshi.scan.onWorkspaceOpen.enabled` - Scan on workspace open (default: `true`)
- `tameshi.scan.onWorkspaceOpen.staleThresholdHours` - Hours before workspace scan is considered stale, 1-72 hours (default: `8`)
- `tameshi.scan.git.enabled` - Enable automatic scanning on Git events (pull, checkout, merge) (default: `false`)
- `tameshi.scan.git.scanChangedOnly` - Only scan files changed by Git operation vs full workspace scan (default: `true`)
- `tameshi.scan.include` - File patterns to include (default: `["**/*.sol", "**/*.yul"]`)
- `tameshi.scan.exclude` - File patterns to exclude (default: `["**/node_modules/**", "**/lib/**", "**/out/**"]`)

### AI/LLM Configuration

- `tameshi.llm.enabled` - Enable LLM-based analysis (default: `false`)
- `tameshi.llm.provider` - LLM provider: `openai`, `anthropic`, or `local` (default: `openai`)
- `tameshi.llm.apiKey` - API key for the LLM provider (default: `""`)
- `tameshi.llm.model` - Model to use (default: `gpt-4`)
- `tameshi.llm.temperature` - Temperature for responses, 0.0-2.0 (default: `0.2`)
- `tameshi.llm.maxTokens` - Maximum tokens for LLM responses, 100-32000 (default: `4000`)
- `tameshi.llm.confidenceThreshold` - Minimum confidence for findings, 0.0-1.0 (default: `0.5`)
- `tameshi.llm.enabledScanners` - List of enabled LLM scanners (default: `["reentrancy", "access_control", "unchecked_returns"]`)
- `tameshi.llm.timeoutSeconds` - Timeout for LLM scan operations in seconds, 30-600 (default: `120`)
- `tameshi.llm.includeLowSeverity` - Include low severity findings from LLM scanners (default: `false`)
- `tameshi.llm.useIrScanning` - Use IR-based scanning with ThalIR (default: `false`)

### Smart Rescan Configuration

- `tameshi.scan.ai.smartRescan` - Auto-rescan mode: `off`, `file`, or `batch` (default: `batch`)
- `tameshi.scan.ai.smartRescan.debounce` - Wait time before AI rescan in milliseconds (default: `3000`)
- `tameshi.scan.ai.smartRescan.contextLines` - Context lines to check above/below finding (default: `2`)
- `tameshi.scan.ai.smartRescan.batchThreshold` - Minimum affected files before workspace scan (default: `5`)
- `tameshi.scan.ai.smartRescan.minSeverity` - Minimum severity for rescan: `info`, `low`, `medium`, `high`, or `critical` (default: `info`)

### Display Configuration

- `tameshi.findings.view.groupBy` - Group findings by: `severity`, `file`, or `rule` (default: `severity`)
- `tameshi.findings.mergeMode` - Display mode: `raw` or `merged` (default: `raw`)
- `tameshi.findings.minCorrelationScore` - Minimum correlation score, 0.0-1.0 (default: `0.5`)
- `tameshi.findings.minAugmentationConfidence` - Minimum confidence for LLM augmentation: `low`, `medium`, or `high` (default: `medium`)
- `tameshi.findings.severityUpgradePolicy` - When to allow severity upgrades: `off`, `llm_high_conf_only`, `any_llm`, or `multi_scanner` (default: `llm_high_conf_only`)
- `tameshi.details.prefetchLimit` - Number of finding details to prefetch, 0-100 (default: `10`)
- `tameshi.details.cacheTimeout` - Cache timeout in milliseconds (default: `600000` - 10 minutes)

#### Editor Integration

- `tameshi.editor.hovers.enabled` - Show hover details (default: `true`)
- `tameshi.editor.hovers.showAllScanners` - Show details from all scanners in hover (default: `true`)
- `tameshi.editor.hovers.showCorrelationCount` - Show correlation count in hover (default: `true`)
- `tameshi.editor.hovers.showQuickActions` - Show quick action buttons in hover (default: `true`)
- `tameshi.editor.gutterIcons.enabled` - Show gutter icons (default: `true`)
- `tameshi.editor.gutterIcons.showCorrelationBadge` - Show correlation count badge on icons (default: `true`)
- `tameshi.editor.codeLens.enabled` - Show CodeLens (default: `true`)
- `tameshi.editor.codeLens.showFileSummary` - Show file-level summary CodeLens (default: `true`)
- `tameshi.editor.codeLens.showFunctionSummary` - Show function-level summary CodeLens (default: `true`)
- `tameshi.editor.codeLens.minSeverity` - Minimum severity for CodeLens: `critical`, `high`, `medium`, `low`, or `info` (default: `medium`)
- `tameshi.editor.statusBar.enabled` - Show status bar item (default: `true`)
- `tameshi.editor.statusBar.showCounts` - Show finding counts in status bar (default: `true`)
- `tameshi.editor.statusBar.showFixable` - Show count of auto-fixable findings (default: `true`)

### Analysis Configuration

- `tameshi.rules` - Per-rule configuration for enable/disable and severity overrides (default: `{}`)
- `tameshi.limits.concurrency` - Concurrent analysis threads (default: `4`)
- `tameshi.limits.timeout` - Analysis timeout in milliseconds (default: `60000`)
- `tameshi.limits.memory` - Memory limit in MB (default: `512`)

### Other Settings

- `tameshi.logging.level` - Logging level: `off`, `error`, `warn`, `info`, or `debug` (default: `info`)
- `tameshi.docs.baseUrl` - Base URL for documentation links (default: `https://docs.tameshi.dev`)

## Security Notice

This extension connects to the Tameshi LSP server for security analysis. The server:
- Runs locally on your machine
- Analyzes code without sending it to external servers (unless LLM features are enabled)
- LLM features require API keys and send code snippets to the configured provider
- Never executes smart contract code or interacts with blockchains

When using LLM features, code snippets are sent to your configured provider (OpenAI, Anthropic, etc.) for analysis. Review your provider's data handling policies before enabling LLM features.

## Known Limitations (Preview)

- LLM features require API keys and incur costs from your provider
- Performance may vary with very large codebases (>1000 contracts)
- Some advanced Solidity features may have limited support
- IR-based scanning (ThalIR) is experimental

## Troubleshooting

**Extension not activating?**

- Ensure you have `.sol` or `.yul` files in your workspace
- Check Output panel → "Tameshi" for errors
- Verify LSP server is installed and accessible

**No findings displayed?**

- Verify Solidity/Yul syntax is valid
- Check the Tameshi sidebar in the Activity Bar
- Try manually running "Tameshi: Scan Workspace"

**Server crashes or timeouts?**

- Run `Tameshi: Restart Language Server` from command palette
- Check server path configuration
- Review Output panel for error messages

**LLM features not working?**

- Verify API key is configured correctly
- Check `tameshi.llm.enabled` is set to `true`
- Ensure you have internet connectivity
- Review API provider status and rate limits

## Feedback

Report issues: https://github.com/tameshi-dev/tameshi-vscode/issues
Include: VS Code version, extension version, sample code, error messages

Documentation: https://tameshi.dev
