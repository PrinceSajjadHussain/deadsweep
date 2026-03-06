import * as logger from '../utils/logger';
import { readFileContent } from '../utils/helpers';
import { DeadCodeItem, DeadCodeType, AnalysisResult } from './types';

interface PythonSymbol {
    name: string;
    type: DeadCodeType;
    line: number;
    endLine: number;
    column: number;
    fullText: string;
}

export class PythonAnalyzer {
    async analyze(files: string[]): Promise<AnalysisResult> {
        const items: DeadCodeItem[] = [];
        const pyFiles = files.filter(f => f.endsWith('.py'));

        if (pyFiles.length === 0) {
            return { items, language: 'python' };
        }

        const allSymbols = new Map<string, PythonSymbol[]>();
        const allReferences = new Map<string, Set<string>>();
        const allImports = new Map<string, { name: string; line: number; fullText: string }[]>();

        for (const filePath of pyFiles) {
            try {
                const content = await readFileContent(filePath);
                const lines = content.split('\n');

                const symbols = this.extractSymbols(lines, filePath);
                allSymbols.set(filePath, symbols);

                const refs = this.extractReferences(content);
                allReferences.set(filePath, refs);

                const imports = this.extractImports(lines);
                allImports.set(filePath, imports);
            } catch (err) {
                logger.error(`Error reading Python file: ${filePath}`, err);
            }
        }

        for (const filePath of pyFiles) {
            const symbols = allSymbols.get(filePath) || [];
            const fileRefs = new Set<string>();

            for (const [fp, refs] of allReferences) {
                if (fp !== filePath) {
                    for (const ref of refs) {
                        fileRefs.add(ref);
                    }
                }
            }

            const localRefs = allReferences.get(filePath) || new Set<string>();

            for (const symbol of symbols) {
                if (symbol.name.startsWith('_') && !symbol.name.startsWith('__')) {
                    const usedLocally = this.isUsedInFile(symbol.name, filePath, allReferences);
                    if (!usedLocally) {
                        items.push({
                            name: symbol.name,
                            type: symbol.type,
                            filePath,
                            line: symbol.line,
                            endLine: symbol.endLine,
                            column: symbol.column,
                            confidence: 85,
                            language: 'python',
                            message: `${this.typeLabel(symbol.type)} '${symbol.name}' is declared but never used`,
                            fullText: symbol.fullText,
                        });
                    }
                } else {
                    const usedAnywhere = fileRefs.has(symbol.name) || this.isUsedInFile(symbol.name, filePath, allReferences);
                    if (!usedAnywhere) {
                        let confidence = 70;
                        if (symbol.name.startsWith('__') && symbol.name.endsWith('__')) { confidence = 30; }
                        if (symbol.type === DeadCodeType.Function && symbol.name === 'main') { confidence = 20; }
                        if (symbol.type === DeadCodeType.Class) { confidence = 65; }

                        items.push({
                            name: symbol.name,
                            type: symbol.type,
                            filePath,
                            line: symbol.line,
                            endLine: symbol.endLine,
                            column: symbol.column,
                            confidence,
                            language: 'python',
                            message: `${this.typeLabel(symbol.type)} '${symbol.name}' is declared but never referenced`,
                            fullText: symbol.fullText,
                        });
                    }
                }
            }

            const imports = allImports.get(filePath) || [];
            for (const imp of imports) {
                if (this.hasIgnoreComment(filePath, imp.line, allSymbols)) { continue; }
                const usedLocally = localRefs.has(imp.name);
                if (!usedLocally) {
                    items.push({
                        name: imp.name,
                        type: DeadCodeType.Import,
                        filePath,
                        line: imp.line,
                        endLine: imp.line,
                        column: 0,
                        confidence: 90,
                        language: 'python',
                        message: `Import '${imp.name}' is imported but never used`,
                        fullText: imp.fullText,
                    });
                }
            }
        }

        return { items, language: 'python' };
    }

    private extractSymbols(lines: string[], filePath: string): PythonSymbol[] {
        const symbols: PythonSymbol[] = [];
        const funcRegex = /^(\s*)def\s+(\w+)\s*\(/;
        const classRegex = /^(\s*)class\s+(\w+)[\s:(]/;
        const varRegex = /^(\s*)(\w+)\s*(?::\s*\w[^=]*)?\s*=/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            let match = funcRegex.exec(line);
            if (match) {
                const indent = match[1].length;
                if (indent === 0) {
                    const endLine = this.findBlockEnd(lines, i, indent);
                    symbols.push({
                        name: match[2],
                        type: DeadCodeType.Function,
                        line: lineNum,
                        endLine,
                        column: indent,
                        fullText: line.trim(),
                    });
                }
                continue;
            }

            match = classRegex.exec(line);
            if (match) {
                const indent = match[1].length;
                if (indent === 0) {
                    const endLine = this.findBlockEnd(lines, i, indent);
                    symbols.push({
                        name: match[2],
                        type: DeadCodeType.Class,
                        line: lineNum,
                        endLine,
                        column: indent,
                        fullText: line.trim(),
                    });
                }
                continue;
            }

            match = varRegex.exec(line);
            if (match) {
                const indent = match[1].length;
                if (indent === 0 && !line.trim().startsWith('#')) {
                    const name = match[2];
                    if (!['if', 'else', 'elif', 'for', 'while', 'with', 'try', 'except', 'finally', 'return', 'import', 'from', 'class', 'def', 'print', 'self'].includes(name)) {
                        symbols.push({
                            name,
                            type: DeadCodeType.Variable,
                            line: lineNum,
                            endLine: lineNum,
                            column: indent,
                            fullText: line.trim(),
                        });
                    }
                }
            }
        }

        return symbols;
    }

    private findBlockEnd(lines: string[], startIdx: number, indent: number): number {
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '') { continue; }
            const currentIndent = line.length - line.trimStart().length;
            if (currentIndent <= indent && line.trim() !== '') {
                return i;
            }
        }
        return lines.length;
    }

    private extractReferences(content: string): Set<string> {
        const refs = new Set<string>();
        const wordRegex = /\b([a-zA-Z_]\w*)\b/g;
        let match;
        while ((match = wordRegex.exec(content)) !== null) {
            refs.add(match[1]);
        }
        return refs;
    }

    private extractImports(lines: string[]): { name: string; line: number; fullText: string }[] {
        const imports: { name: string; line: number; fullText: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNum = i + 1;

            const fromImportMatch = /^from\s+\S+\s+import\s+(.+)$/.exec(line);
            if (fromImportMatch) {
                const importPart = fromImportMatch[1];
                const names = importPart.split(',').map(n => n.trim().split(/\s+as\s+/));
                for (const parts of names) {
                    const importedName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                    if (importedName && importedName !== '*') {
                        imports.push({ name: importedName, line: lineNum, fullText: line });
                    }
                }
                continue;
            }

            const importMatch = /^import\s+(.+)$/.exec(line);
            if (importMatch) {
                const importPart = importMatch[1];
                const names = importPart.split(',').map(n => n.trim().split(/\s+as\s+/));
                for (const parts of names) {
                    const importedName = parts.length > 1 ? parts[1].trim() : parts[0].trim().split('.')[0];
                    if (importedName) {
                        imports.push({ name: importedName, line: lineNum, fullText: line });
                    }
                }
            }
        }

        return imports;
    }

    private isUsedInFile(symbolName: string, filePath: string, allRefs: Map<string, Set<string>>): boolean {
        const refs = allRefs.get(filePath);
        if (!refs) { return false; }

        let count = 0;
        for (const ref of refs) {
            if (ref === symbolName) {
                count++;
                if (count > 1) { return true; }
            }
        }
        return false;
    }

    private hasIgnoreComment(filePath: string, line: number, allSymbols: Map<string, PythonSymbol[]>): boolean {
        return false;
    }

    private typeLabel(type: DeadCodeType): string {
        switch (type) {
            case DeadCodeType.Function: return 'Function';
            case DeadCodeType.Class: return 'Class';
            case DeadCodeType.Variable: return 'Variable';
            case DeadCodeType.Import: return 'Import';
            default: return 'Symbol';
        }
    }
}
