# Tameshi Security Scanner

[![Tests](https://github.com/tameshi-dev/tameshi-vscode/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/tameshi-dev/tameshi-vscode/actions/workflows/test.yml)
[![Latest Release](https://img.shields.io/github/release/tameshi-dev/tameshi-vscode.svg)](https://github.com/tameshi-dev/tameshi-vscode/releases/latest)
![Preview](https://img.shields.io/badge/Status-Preview-orange)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Security analysis for Solidity smart contracts with multi-scanner vulnerability detection and LLM-powered analysis.

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=GianlucaBrigandi.tameshi-vscode)

## Features

### Multi-Scanner Vulnerability Detection

Tameshi combines multiple security analysis engines:

- Pattern-based static analysis for common vulnerabilities
- Data flow analysis to track tainted data through contracts
- Control flow analysis to detect logic flaws and unsafe paths
- Source-level scanners that analyze Solidity AST
- IR-level scanners using ThalIR intermediate representation
- 25 specialized scanners detecting:
  - Reentrancy (classic, cross-function, read-only)
  - Access control vulnerabilities
  - Integer overflow/underflow
  - Unchecked external calls
  - DoS patterns
  - Timestamp manipulation
  - Dangerous delegatecall usage
  - Price manipulation risks

### LLM-Powered Analysis

Optional OpenAI integration for semantic analysis:

- Context-aware detection based on business logic
- Detection of project-specific vulnerability patterns
- Remediation suggestions with examples
- Confidence scoring for findings
- Correlation of findings across scanners

### Finding Correlation

Correlation of findings across scanners:

- Cross-validation to reduce false positives
- Confidence boosting when multiple scanners agree
- Relationship mapping between vulnerabilities
- Duplicate elimination across scanners
- Multi-scanner agreement tracking

### Scanning Triggers

Multiple scanning trigger options:

- On Save - scan files when saved
- On Idle - scan workspace during inactivity
- On Workspace Open - scan on startup if results are stale
- Git Integration - scan after pull, checkout, or merge
- Smart Rescan - rescan when editing code with LLM findings
- Manual - scan file or workspace on demand

### Editor Integration

Integration with VS Code editor:

- Inline diagnostics with squiggly underlines
- Gutter icons with severity indicators
- Hover tooltips with vulnerability information
- CodeLens summary per function and file
- Status bar with workspace security overview
- Multi-location highlighting for related findings

### Vulnerability Triage

Sidebar view for managing findings:

- Grouping by severity, file, or rule type
- Filtering by severity level
- Detailed vulnerability context and recommendations
- Navigation to affected code
- Correlation indicators
- Analysis type tags (LLM vs deterministic)
- SARIF export for CI/CD integration

### Configuration

Customization options:

- Exclude patterns for test files, libraries, build artifacts
- Include patterns to focus scanning on specific directories
- Severity thresholds
- Rule-level enable/disable
- Performance settings (concurrency, timeouts, memory)
- Display preferences

## Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=GianlucaBrigandi.tameshi-vscode)
2. Open a Solidity project (extension activates when `.sol` files are detected)
3. Run a scan using the command palette (`Cmd/Ctrl+Shift+P` → "Tameshi: Scan Workspace")
4. View findings in the Tameshi sidebar (shield icon in the Activity Bar)
5. Click on findings to navigate to vulnerable code

### LSP Server

The Tameshi LSP server downloads automatically on first use. Manual installation is supported if automatic download fails.

**Supported Platforms:** macOS (Intel & Apple Silicon), Linux (x64 & ARM64), Windows (x64 & ARM64)

For manual installation, [download the binary](https://github.com/tameshi-dev/TameshiLSP/releases) and configure `tameshi.server.path` in settings.

## Commands

Command Palette (`Cmd/Ctrl+Shift+P`):

### Deterministic Scanning
- `Tameshi: Scan Workspace` - Analyze entire project
- `Tameshi: Scan Current File` - Analyze active file

### LLM Scanning
- `Tameshi: Run LLM Scan on Current File` - LLM analysis of current file
- `Tameshi: Run LLM Scan on Workspace` - LLM analysis of entire project

### Management
- `Tameshi: Clear Findings` - Remove all findings
- `Tameshi: Restart Language Server` - Restart LSP server
- `Tameshi: Open Finding Details` - View detailed finding information
- `Tameshi: Export SARIF Report to Workspace` - Export findings in SARIF format

## Configuration

### Scan Triggers

```json
{
  "tameshi.scan.onSave": "file",
  "tameshi.scan.onIdle.enabled": true,
  "tameshi.scan.onWorkspaceOpen.enabled": true,
  "tameshi.scan.git.enabled": false
}
```

### File Patterns

```json
{
  "tameshi.scan.include": ["**/*.sol"],
  "tameshi.scan.exclude": [
    "**/node_modules/**",
    "**/lib/**",
    "**/out/**",
    "**/test/**"
  ]
}
```

### LLM Features

```json
{
  "tameshi.llm.enabled": false,
  "tameshi.llm.provider": "openai",
  "tameshi.llm.apiKey": "",
  "tameshi.llm.model": "gpt-4",
  "tameshi.llm.enabledScanners": [
    "reentrancy",
    "access_control",
    "unchecked_returns"
  ]
}
```

### Smart Rescan

```json
{
  "tameshi.scan.ai.smartRescan": "batch",
  "tameshi.scan.ai.smartRescan.debounce": 3000,
  "tameshi.scan.ai.smartRescan.batchThreshold": 5
}
```

### Editor Display

```json
{
  "tameshi.editor.hovers.enabled": true,
  "tameshi.editor.gutterIcons.enabled": true,
  "tameshi.editor.codeLens.enabled": true,
  "tameshi.editor.statusBar.enabled": true
}
```

Additional configuration options are available in VS Code settings (`Cmd/Ctrl+,` → search "tameshi").

## Security

- The LSP server runs locally and analyzes code without sending it to external servers
- LLM features send code snippets to OpenAI for analysis
- The extension does not execute smart contract code or interact with blockchains
- API keys are stored in VS Code settings (machine-specific settings available for security)

Review OpenAI's data handling policies before enabling LLM features.

## Troubleshooting

**Extension not activating**
- Ensure `.sol` files exist in workspace
- Check Output panel → "Tameshi Language Server" for errors
- Run "Tameshi: Scan Workspace" from Command Palette

**No findings displayed**
- Verify Solidity syntax is valid (extension requires valid syntax)
- Check Tameshi sidebar in Activity Bar (shield icon)
- Review Output → "Tameshi Language Server" for error messages

**Server crashes or timeouts**
- Run `Tameshi: Restart Language Server` from Command Palette
- Verify server path in settings
- Review Output panel for error messages
- Increase `tameshi.limits.timeout` in settings if needed

**LLM features not working**
- Verify `tameshi.llm.enabled` is set to `true`
- Check `tameshi.llm.apiKey` configuration
- Verify internet connectivity
- Review OpenAI API status and rate limits
- Check Output panel for API-related errors

**Performance issues**
- Exclude unnecessary directories (node_modules, lib, out, test)
- Reduce `tameshi.limits.concurrency` for lower-end hardware
- Disable idle scanning if it interferes with workflow
- Use file-level scanning instead of workspace scanning for quick checks

## Feedback

- Report issues: [GitHub Issues](https://github.com/tameshi-dev/tameshi-vscode/issues)
- Documentation: [tameshi.dev](https://tameshi.dev)
- Include in bug reports: VS Code version, extension version, sample code, error messages from Output panel

When reporting issues, include output from "Tameshi Language Server" in the Output panel (`View → Output → Select "Tameshi Language Server"`).

## License

MIT - See [LICENSE](LICENSE) for details
