import * as vscode from 'vscode';
import { Project, SourceFile, Node, SyntaxKind, ts } from 'ts-morph';
import * as path from 'path';
import * as logger from '../utils/logger';
import { relativePath, getWorkspaceRoot } from '../utils/helpers';
import { DeadCodeItem, DeadCodeType, AnalysisResult } from './types';

export class TsAnalyzer {
    private project: Project | undefined;

    async analyze(files: string[]): Promise<AnalysisResult> {
        const items: DeadCodeItem[] = [];
        const root = getWorkspaceRoot();
        if (!root) {
            return { items, language: 'typescript' };
        }

        const tsFiles = files.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
        if (tsFiles.length === 0) {
            return { items, language: 'typescript' };
        }

        try {
            this.project = new Project({
                tsConfigFilePath: this.findTsConfig(root),
                skipAddingFilesFromTsConfig: true,
                skipFileDependencyResolution: false,
                compilerOptions: {
                    allowJs: true,
                    checkJs: true,
                    noEmit: true,
                },
            });

            for (const file of tsFiles) {
                try {
                    this.project.addSourceFileAtPath(file);
                } catch {
                    logger.debug(`Skipped file: ${file}`);
                }
            }

            this.project.resolveSourceFileDependencies();
            const sourceFiles = this.project.getSourceFiles();

            for (const sourceFile of sourceFiles) {
                const filePath = sourceFile.getFilePath();
                if (!tsFiles.some(f => path.resolve(f) === path.resolve(filePath))) {
                    continue;
                }

                try {
                    items.push(...this.analyzeUnusedImports(sourceFile, filePath));
                    items.push(...this.analyzeUnusedVariables(sourceFile, filePath));
                    items.push(...this.analyzeUnusedFunctions(sourceFile, filePath));
                    items.push(...this.analyzeUnusedClasses(sourceFile, filePath));
                    items.push(...this.analyzeUnusedInterfaces(sourceFile, filePath));
                    items.push(...this.analyzeUnusedTypes(sourceFile, filePath));
                    items.push(...this.analyzeUnusedEnums(sourceFile, filePath));
                    items.push(...this.analyzeUnusedExports(sourceFile, filePath));
                } catch (err) {
                    logger.error(`Error analyzing ${filePath}`, err);
                }
            }
        } catch (err) {
            logger.error('ts-morph project creation failed', err);
        }

        return { items, language: 'typescript' };
    }

    async analyzeFile(filePath: string, allFiles: string[]): Promise<AnalysisResult> {
        return this.analyze([...allFiles]);
    }

    dispose(): void {
        this.project = undefined;
    }

    private findTsConfig(root: string): string | undefined {
        const candidates = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json'];
        for (const name of candidates) {
            const fullPath = path.join(root, name);
            try {
                require('fs').accessSync(fullPath);
                return fullPath;
            } catch {
                continue;
            }
        }
        return undefined;
    }

    private isExported(node: Node): boolean {
        if (Node.isExportable(node)) {
            return node.isExported();
        }
        return false;
    }

    private isReExported(node: Node, sourceFile: SourceFile): boolean {
        if (!Node.hasName(node)) { return false; }
        const name = node.getName();

        const exportDecls = sourceFile.getExportDeclarations();
        for (const exportDecl of exportDecls) {
            const namedExports = exportDecl.getNamedExports();
            for (const ne of namedExports) {
                if (ne.getName() === name || ne.getAliasNode()?.getText() === name) {
                    return true;
                }
            }
        }
        return false;
    }

    private isBarrelFile(sourceFile: SourceFile): boolean {
        const baseName = path.basename(sourceFile.getFilePath());
        return baseName === 'index.ts' || baseName === 'index.js' || baseName === 'index.tsx' || baseName === 'index.jsx';
    }

    private hasDeadsweepIgnore(node: Node): boolean {
        const leadingComments = node.getLeadingCommentRanges();
        for (const comment of leadingComments) {
            if (comment.getText().includes('deadsweep-ignore')) {
                return true;
            }
        }
        return false;
    }

    private countReferences(node: Node): number {
        try {
            if (Node.isReferenceFindable(node)) {
                const refs = node.findReferencesAsNodes();
                const declarationLine = node.getStartLineNumber();
                const declarationFile = node.getSourceFile().getFilePath();

                return refs.filter(ref => {
                    const refFile = ref.getSourceFile().getFilePath();
                    const refLine = ref.getStartLineNumber();
                    return !(refFile === declarationFile && refLine === declarationLine);
                }).length;
            }
            return -1;
        } catch {
            return -1;
        }
    }

    private calculateConfidence(refCount: number, node: Node, sourceFile: SourceFile): number {
        let confidence = 95;

        if (refCount < 0) {
            return 40;
        }

        if (this.isExported(node)) {
            confidence -= 20;
        }

        if (this.isBarrelFile(sourceFile)) {
            confidence -= 30;
        }

        const fileText = sourceFile.getFullText();
        if (Node.hasName(node)) {
            const name = node.getName();
            if (name && (fileText.includes(`['${name}']`) || fileText.includes(`["${name}"]`))) {
                confidence -= 25;
            }
            if (name && /eval|Function\(|require\(/.test(fileText)) {
                confidence -= 15;
            }
            if (name && name.startsWith('_')) {
                confidence -= 10;
            }
        }

        return Math.max(0, Math.min(100, confidence));
    }

    private analyzeUnusedImports(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const importDecls = sourceFile.getImportDeclarations();

        for (const importDecl of importDecls) {
            if (this.hasDeadsweepIgnore(importDecl)) { continue; }

            const namedImports = importDecl.getNamedImports();
            for (const named of namedImports) {
                const nameNode = named.getNameNode();
                const refs = this.countReferences(nameNode);
                if (refs === 0) {
                    items.push({
                        name: named.getName(),
                        type: DeadCodeType.Import,
                        filePath,
                        line: named.getStartLineNumber(),
                        endLine: named.getEndLineNumber(),
                        column: named.getStart() - named.getStartLinePos(),
                        confidence: 95,
                        language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                        message: `Import '${named.getName()}' is imported but never used`,
                        fullText: named.getFullText().trim(),
                    });
                }
            }

            const defaultImport = importDecl.getDefaultImport();
            if (defaultImport) {
                const refs = this.countReferences(defaultImport);
                if (refs === 0) {
                    items.push({
                        name: defaultImport.getText(),
                        type: DeadCodeType.Import,
                        filePath,
                        line: defaultImport.getStartLineNumber(),
                        endLine: importDecl.getEndLineNumber(),
                        column: defaultImport.getStart() - defaultImport.getStartLinePos(),
                        confidence: 95,
                        language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                        message: `Default import '${defaultImport.getText()}' is imported but never used`,
                        fullText: importDecl.getText().trim(),
                    });
                }
            }

            const namespaceImport = importDecl.getNamespaceImport();
            if (namespaceImport) {
                const refs = this.countReferences(namespaceImport);
                if (refs === 0) {
                    items.push({
                        name: namespaceImport.getText(),
                        type: DeadCodeType.Import,
                        filePath,
                        line: namespaceImport.getStartLineNumber(),
                        endLine: importDecl.getEndLineNumber(),
                        column: namespaceImport.getStart() - namespaceImport.getStartLinePos(),
                        confidence: 90,
                        language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                        message: `Namespace import '${namespaceImport.getText()}' is imported but never used`,
                        fullText: importDecl.getText().trim(),
                    });
                }
            }
        }

        return items;
    }

    private analyzeUnusedVariables(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const varStatements = sourceFile.getVariableStatements();

        for (const varStatement of varStatements) {
            if (this.hasDeadsweepIgnore(varStatement)) { continue; }
            if (this.isExported(varStatement) && this.isReExported(varStatement, sourceFile)) { continue; }

            for (const decl of varStatement.getDeclarations()) {
                const refs = this.countReferences(decl);
                if (refs === 0) {
                    const confidence = this.calculateConfidence(refs, decl, sourceFile);
                    items.push({
                        name: decl.getName(),
                        type: DeadCodeType.Variable,
                        filePath,
                        line: decl.getStartLineNumber(),
                        endLine: decl.getEndLineNumber(),
                        column: decl.getStart() - decl.getStartLinePos(),
                        confidence,
                        language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                        message: `Variable '${decl.getName()}' is declared but never used`,
                        fullText: varStatement.getText().trim(),
                    });
                }
            }
        }

        return items;
    }

    private analyzeUnusedFunctions(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const functions = sourceFile.getFunctions();

        for (const func of functions) {
            if (this.hasDeadsweepIgnore(func)) { continue; }
            if (!func.getName()) { continue; }
            if (this.isExported(func) && this.isReExported(func, sourceFile)) { continue; }

            const refs = this.countReferences(func);
            if (refs === 0) {
                const confidence = this.calculateConfidence(refs, func, sourceFile);
                items.push({
                    name: func.getName()!,
                    type: DeadCodeType.Function,
                    filePath,
                    line: func.getStartLineNumber(),
                    endLine: func.getEndLineNumber(),
                    column: func.getStart() - func.getStartLinePos(),
                    confidence,
                    language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                    message: `Function '${func.getName()}' is declared but never called`,
                    fullText: func.getText().substring(0, 200),
                });
            }
        }

        return items;
    }

    private analyzeUnusedClasses(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const classes = sourceFile.getClasses();

        for (const cls of classes) {
            if (this.hasDeadsweepIgnore(cls)) { continue; }
            if (!cls.getName()) { continue; }
            if (this.isExported(cls) && this.isReExported(cls, sourceFile)) { continue; }

            const refs = this.countReferences(cls);
            if (refs === 0) {
                const confidence = this.calculateConfidence(refs, cls, sourceFile);
                items.push({
                    name: cls.getName()!,
                    type: DeadCodeType.Class,
                    filePath,
                    line: cls.getStartLineNumber(),
                    endLine: cls.getEndLineNumber(),
                    column: cls.getStart() - cls.getStartLinePos(),
                    confidence,
                    language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                    message: `Class '${cls.getName()}' is declared but never instantiated or referenced`,
                    fullText: cls.getText().substring(0, 200),
                });
            }
        }

        return items;
    }

    private analyzeUnusedInterfaces(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const interfaces = sourceFile.getInterfaces();

        for (const iface of interfaces) {
            if (this.hasDeadsweepIgnore(iface)) { continue; }
            if (this.isExported(iface) && this.isReExported(iface, sourceFile)) { continue; }

            const refs = this.countReferences(iface);
            if (refs === 0) {
                const confidence = this.calculateConfidence(refs, iface, sourceFile);
                items.push({
                    name: iface.getName(),
                    type: DeadCodeType.Interface,
                    filePath,
                    line: iface.getStartLineNumber(),
                    endLine: iface.getEndLineNumber(),
                    column: iface.getStart() - iface.getStartLinePos(),
                    confidence,
                    language: 'typescript',
                    message: `Interface '${iface.getName()}' is declared but never used`,
                    fullText: iface.getText().substring(0, 200),
                });
            }
        }

        return items;
    }

    private analyzeUnusedTypes(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const typeAliases = sourceFile.getTypeAliases();

        for (const typeAlias of typeAliases) {
            if (this.hasDeadsweepIgnore(typeAlias)) { continue; }
            if (this.isExported(typeAlias) && this.isReExported(typeAlias, sourceFile)) { continue; }

            const refs = this.countReferences(typeAlias);
            if (refs === 0) {
                const confidence = this.calculateConfidence(refs, typeAlias, sourceFile);
                items.push({
                    name: typeAlias.getName(),
                    type: DeadCodeType.TypeAlias,
                    filePath,
                    line: typeAlias.getStartLineNumber(),
                    endLine: typeAlias.getEndLineNumber(),
                    column: typeAlias.getStart() - typeAlias.getStartLinePos(),
                    confidence,
                    language: 'typescript',
                    message: `Type alias '${typeAlias.getName()}' is declared but never used`,
                    fullText: typeAlias.getText().trim(),
                });
            }
        }

        return items;
    }

    private analyzeUnusedEnums(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];
        const enums = sourceFile.getEnums();

        for (const enumDecl of enums) {
            if (this.hasDeadsweepIgnore(enumDecl)) { continue; }
            if (this.isExported(enumDecl) && this.isReExported(enumDecl, sourceFile)) { continue; }

            const refs = this.countReferences(enumDecl);
            if (refs === 0) {
                const confidence = this.calculateConfidence(refs, enumDecl, sourceFile);
                items.push({
                    name: enumDecl.getName(),
                    type: DeadCodeType.Enum,
                    filePath,
                    line: enumDecl.getStartLineNumber(),
                    endLine: enumDecl.getEndLineNumber(),
                    column: enumDecl.getStart() - enumDecl.getStartLinePos(),
                    confidence,
                    language: 'typescript',
                    message: `Enum '${enumDecl.getName()}' is declared but never used`,
                    fullText: enumDecl.getText().substring(0, 200),
                });
            }
        }

        return items;
    }

    private analyzeUnusedExports(sourceFile: SourceFile, filePath: string): DeadCodeItem[] {
        const items: DeadCodeItem[] = [];

        if (this.isBarrelFile(sourceFile)) {
            return items;
        }

        const exportedDeclarations = sourceFile.getExportedDeclarations();
        for (const [name, declarations] of exportedDeclarations) {
            for (const decl of declarations) {
                if (this.hasDeadsweepIgnore(decl)) { continue; }

                try {
                    if (Node.isReferenceFindable(decl)) {
                        const refs = decl.findReferencesAsNodes();
                        const externalRefs = refs.filter(ref => {
                            return ref.getSourceFile().getFilePath() !== filePath;
                        });

                        if (externalRefs.length === 0 && this.isExported(decl)) {
                            const existingItem = items.find(i => i.name === name && i.filePath === filePath);
                            if (!existingItem) {
                                items.push({
                                    name,
                                    type: DeadCodeType.Export,
                                    filePath,
                                    line: decl.getStartLineNumber(),
                                    endLine: decl.getEndLineNumber(),
                                    column: decl.getStart() - decl.getStartLinePos(),
                                    confidence: 60,
                                    language: /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                                    message: `Export '${name}' is exported but never imported by other files`,
                                    fullText: decl.getText().substring(0, 200),
                                });
                            }
                        }
                    }
                } catch {
                    continue;
                }
            }
        }

        return items;
    }
}
