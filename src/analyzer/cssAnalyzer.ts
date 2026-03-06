import * as path from 'path';
import * as logger from '../utils/logger';
import { readFileContent } from '../utils/helpers';
import { DeadCodeItem, DeadCodeType, AnalysisResult } from './types';

interface CssRule {
    selector: string;
    line: number;
    endLine: number;
    fullText: string;
}

export class CssAnalyzer {
    async analyze(files: string[]): Promise<AnalysisResult> {
        const items: DeadCodeItem[] = [];
        const cssFiles = files.filter(f => /\.(css|scss|sass|less)$/.test(f));
        const nonCssFiles = files.filter(f => /\.(ts|tsx|js|jsx|html|vue|svelte|py)$/.test(f));

        if (cssFiles.length === 0) {
            return { items, language: 'css' };
        }

        const allClassNames = new Set<string>();
        const allIdNames = new Set<string>();

        for (const file of nonCssFiles) {
            try {
                const content = await readFileContent(file);
                const classRefs = this.extractClassReferences(content);
                const idRefs = this.extractIdReferences(content);
                classRefs.forEach(c => allClassNames.add(c));
                idRefs.forEach(id => allIdNames.add(id));
            } catch (err) {
                logger.debug(`Skipping file for CSS ref extraction: ${file}`);
            }
        }

        for (const cssFile of cssFiles) {
            try {
                const content = await readFileContent(cssFile);
                const rules = this.extractCssRules(content);

                for (const rule of rules) {
                    const classesInSelector = this.extractClassesFromSelector(rule.selector);
                    const idsInSelector = this.extractIdsFromSelector(rule.selector);

                    for (const className of classesInSelector) {
                        if (!allClassNames.has(className)) {
                            if (this.isUtilityOrFrameworkClass(className)) { continue; }

                            items.push({
                                name: `.${className}`,
                                type: DeadCodeType.CssClass,
                                filePath: cssFile,
                                line: rule.line,
                                endLine: rule.endLine,
                                column: 0,
                                confidence: this.calculateCssConfidence(className, rule.selector),
                                language: 'css',
                                message: `CSS class '.${className}' is defined but never referenced in source files`,
                                fullText: rule.fullText,
                            });
                        }
                    }

                    for (const idName of idsInSelector) {
                        if (!allIdNames.has(idName)) {
                            items.push({
                                name: `#${idName}`,
                                type: DeadCodeType.CssClass,
                                filePath: cssFile,
                                line: rule.line,
                                endLine: rule.endLine,
                                column: 0,
                                confidence: this.calculateCssConfidence(idName, rule.selector) - 5,
                                language: 'css',
                                message: `CSS ID '#${idName}' is defined but never referenced in source files`,
                                fullText: rule.fullText,
                            });
                        }
                    }
                }
            } catch (err) {
                logger.error(`Error analyzing CSS file: ${cssFile}`, err);
            }
        }

        return { items, language: 'css' };
    }

    private extractCssRules(content: string): CssRule[] {
        const rules: CssRule[] = [];
        const lines = content.split('\n');
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            if (line.startsWith('//') || line.startsWith('/*') || line === '') {
                i++;
                continue;
            }

            if (line.startsWith('@media') || line.startsWith('@keyframes') ||
                line.startsWith('@font-face') || line.startsWith('@import') ||
                line.startsWith('@charset') || line.startsWith('@supports')) {
                i++;
                continue;
            }

            const selectorMatch = /^([^{]+)\{/.exec(line);
            if (selectorMatch) {
                const selector = selectorMatch[1].trim();
                const startLine = i + 1;
                let braceCount = 0;
                let endLine = startLine;

                for (let j = i; j < lines.length; j++) {
                    for (const char of lines[j]) {
                        if (char === '{') { braceCount++; }
                        if (char === '}') { braceCount--; }
                    }
                    if (braceCount <= 0) {
                        endLine = j + 1;
                        break;
                    }
                }

                const fullText = lines.slice(i, endLine).join('\n').trim();
                if (selector && !selector.startsWith(':root') && !selector.startsWith('*')) {
                    rules.push({ selector, line: startLine, endLine, fullText });
                }
                i = endLine;
            } else {
                i++;
            }
        }

        return rules;
    }

    private extractClassesFromSelector(selector: string): string[] {
        const classRegex = /\.([a-zA-Z_][\w-]*)/g;
        const classes: string[] = [];
        let match;
        while ((match = classRegex.exec(selector)) !== null) {
            classes.push(match[1]);
        }
        return classes;
    }

    private extractIdsFromSelector(selector: string): string[] {
        const idRegex = /#([a-zA-Z_][\w-]*)/g;
        const ids: string[] = [];
        let match;
        while ((match = idRegex.exec(selector)) !== null) {
            ids.push(match[1]);
        }
        return ids;
    }

    private extractClassReferences(content: string): Set<string> {
        const refs = new Set<string>();

        const classNamePatterns = [
            /class="([^"]*)"/g,
            /class='([^']*)'/g,
            /className="([^"]*)"/g,
            /className='([^']*)'/g,
            /className=\{[`'"]([^`'"]*)[`'"]\}/g,
            /classList\.\w+\(['"]([^'"]*)['"]\)/g,
            /\.addClass\(['"]([^'"]*)['"]\)/g,
            /\.removeClass\(['"]([^'"]*)['"]\)/g,
            /\.toggleClass\(['"]([^'"]*)['"]\)/g,
            /\.hasClass\(['"]([^'"]*)['"]\)/g,
            /\bclass:\s*['"]([^'"]+)['"]/g,
            /clsx\([^)]*['"]([^'"]+)['"][^)]*\)/g,
            /classnames\([^)]*['"]([^'"]+)['"][^)]*\)/g,
        ];

        for (const pattern of classNamePatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const classes = match[1].split(/\s+/);
                classes.forEach(c => {
                    if (c.trim()) { refs.add(c.trim()); }
                });
            }
        }

        const templateLiteralClasses = /`[^`]*\$\{[^}]*\}[^`]*`/g;
        let tlMatch;
        while ((tlMatch = templateLiteralClasses.exec(content)) !== null) {
            const staticParts = tlMatch[0].replace(/\$\{[^}]*\}/g, ' ').replace(/`/g, '');
            staticParts.split(/\s+/).forEach(c => {
                if (c.trim() && /^[a-zA-Z_]/.test(c)) { refs.add(c.trim()); }
            });
        }

        return refs;
    }

    private extractIdReferences(content: string): Set<string> {
        const refs = new Set<string>();

        const idPatterns = [
            /id="([^"]*)"/g,
            /id='([^']*)'/g,
            /getElementById\(['"]([^'"]*)['"]\)/g,
            /querySelector\(['"]#([^'"]*)['"]\)/g,
        ];

        for (const pattern of idPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1].trim()) {
                    refs.add(match[1].trim());
                }
            }
        }

        return refs;
    }

    private isUtilityOrFrameworkClass(className: string): boolean {
        const frameworkPrefixes = [
            'container', 'row', 'col-', 'btn', 'nav', 'modal',
            'fa-', 'icon-', 'glyphicon-', 'material-icons',
            'sr-only', 'visually-hidden',
            'text-', 'bg-', 'border-', 'rounded-', 'd-', 'p-', 'm-',
            'flex-', 'justify-', 'align-', 'w-', 'h-',
        ];
        return frameworkPrefixes.some(prefix => className.startsWith(prefix));
    }

    private calculateCssConfidence(name: string, selector: string): number {
        let confidence = 80;

        if (selector.includes(':')) { confidence -= 10; }
        if (selector.includes('>') || selector.includes('+') || selector.includes('~')) { confidence -= 5; }
        if (name.includes('--')) { confidence -= 15; }
        if (name.startsWith('js-')) { confidence -= 20; }
        if (name.startsWith('is-') || name.startsWith('has-')) { confidence -= 15; }

        return Math.max(0, Math.min(100, confidence));
    }
}
