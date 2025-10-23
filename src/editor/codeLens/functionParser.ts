import * as vscode from 'vscode';

export interface FunctionDefinition {
    name: string;
    type: 'function' | 'constructor' | 'modifier' | 'fallback' | 'receive';
    range: vscode.Range;
    startLine: number;
    endLine: number;
}

export class SolidityFunctionParser {
    /**
     * Parse Solidity document to extract function definitions
     */
    static parse(document: vscode.TextDocument): FunctionDefinition[] {
        const functions: FunctionDefinition[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        const functionRegex = /^\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
        const constructorRegex = /^\s*constructor\s*\(/;
        const modifierRegex = /^\s*modifier\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
        const fallbackRegex = /^\s*fallback\s*\(/;
        const receiveRegex = /^\s*receive\s*\(/;

        let currentFunction: FunctionDefinition | null = null;
        let braceDepth = 0;
        let inFunction = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;

            if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
                continue;
            }

            if (!inFunction) {
                let match: RegExpMatchArray | null = null;
                let functionType: FunctionDefinition['type'] | null = null;
                let functionName = '';

                if ((match = line.match(functionRegex))) {
                    functionType = 'function';
                    functionName = match[1];
                } else if (line.match(constructorRegex)) {
                    functionType = 'constructor';
                    functionName = 'constructor';
                } else if ((match = line.match(modifierRegex))) {
                    functionType = 'modifier';
                    functionName = match[1];
                } else if (line.match(fallbackRegex)) {
                    functionType = 'fallback';
                    functionName = 'fallback';
                } else if (line.match(receiveRegex)) {
                    functionType = 'receive';
                    functionName = 'receive';
                }

                if (functionType) {
                    currentFunction = {
                        name: functionName,
                        type: functionType,
                        range: new vscode.Range(i, 0, i, 0),
                        startLine: lineNumber,
                        endLine: lineNumber
                    };
                    inFunction = true;
                }
            }

            if (inFunction && currentFunction) {
                for (const char of line) {
                    if (char === '{') {
                        braceDepth++;
                    } else if (char === '}') {
                        braceDepth--;
                        if (braceDepth === 0) {
                            currentFunction.endLine = lineNumber;
                            currentFunction.range = new vscode.Range(
                                currentFunction.startLine - 1,
                                0,
                                i,
                                line.length
                            );
                            functions.push(currentFunction);
                            currentFunction = null;
                            inFunction = false;
                            break;
                        }
                    }
                }
            }
        }

        return functions;
    }

    /**
     * Find the function that contains a specific line
     */
    static findFunctionAtLine(functions: FunctionDefinition[], line: number): FunctionDefinition | null {
        return functions.find(f => line >= f.startLine && line <= f.endLine) || null;
    }

    /**
     * Get all functions in a specific line range
     */
    static findFunctionsInRange(functions: FunctionDefinition[], startLine: number, endLine: number): FunctionDefinition[] {
        return functions.filter(f =>
            (f.startLine >= startLine && f.startLine <= endLine) ||
            (f.endLine >= startLine && f.endLine <= endLine) ||
            (f.startLine <= startLine && f.endLine >= endLine)
        );
    }
}
