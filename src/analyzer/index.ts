import * as vscode from 'vscode';
import * as path from 'path';
import * as logger from '../utils/logger';
import { getWorkspaceRoot, matchesGlob, getLanguageFromExtension, getExtensionsForLanguage } from '../utils/helpers';
import { getConfig, DeadSweepConfig } from '../config/configManager';
import { TsAnalyzer } from './tsAnalyzer';
import { PythonAnalyzer } from './pythonAnalyzer';
import { CssAnalyzer } from './cssAnalyzer';
import { DeadCodeType, DeadCodeItem, AnalysisResult, ScanResult } from './types';

export { DeadCodeType, DeadCodeItem, AnalysisResult, ScanResult };

const onScanCompleteEmitter = new vscode.EventEmitter<ScanResult>();
export const onScanComplete = onScanCompleteEmitter.event;

let lastScanResult: ScanResult | undefined;

const tsAnalyzer = new TsAnalyzer();
const pythonAnalyzer = new PythonAnalyzer();
const cssAnalyzer = new CssAnalyzer();

export function getLastScanResult(): ScanResult | undefined {
    return lastScanResult;
}

export async function scanProject(
    progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<ScanResult> {
    const startTime = Date.now();
    const config = getConfig();
    const root = getWorkspaceRoot();

    if (!root) {
        return { items: [], scannedFiles: 0, scanDuration: 0, timestamp: Date.now() };
    }

    progress?.report({ message: 'Finding files...', increment: 0 });
    logger.info('Starting full project scan');

    const files = await collectFiles(config);
    const totalFiles = files.length;

    progress?.report({ message: `Found ${totalFiles} files to analyze`, increment: 10 });
    logger.info(`Found ${totalFiles} files to analyze`);

    const allItems: DeadCodeItem[] = [];
    const analysisPromises: Promise<AnalysisResult>[] = [];

    if (config.languages.includes('typescript') || config.languages.includes('javascript')) {
        progress?.report({ message: 'Analyzing TypeScript/JavaScript...', increment: 20 });
        analysisPromises.push(tsAnalyzer.analyze(files));
    }

    if (config.languages.includes('python')) {
        progress?.report({ message: 'Analyzing Python...', increment: 20 });
        analysisPromises.push(pythonAnalyzer.analyze(files));
    }

    if (config.languages.includes('css')) {
        progress?.report({ message: 'Analyzing CSS/SCSS...', increment: 20 });
        analysisPromises.push(cssAnalyzer.analyze(files));
    }

    const results = await Promise.all(analysisPromises);
    for (const result of results) {
        allItems.push(...result.items);
    }

    const filteredItems = allItems.filter(item => item.confidence >= config.confidenceThreshold);

    progress?.report({ message: 'Scan complete!', increment: 30 });

    const scanResult: ScanResult = {
        items: filteredItems,
        scannedFiles: totalFiles,
        scanDuration: Date.now() - startTime,
        timestamp: Date.now(),
    };

    lastScanResult = scanResult;
    onScanCompleteEmitter.fire(scanResult);

    logger.info(`Scan complete: ${filteredItems.length} dead code items found in ${scanResult.scanDuration}ms`);

    return scanResult;
}

export async function scanFile(filePath: string): Promise<ScanResult> {
    const startTime = Date.now();
    const config = getConfig();
    const ext = path.extname(filePath);
    const language = getLanguageFromExtension(ext);
    const allFiles = await collectFiles(config);
    const allItems: DeadCodeItem[] = [];

    if ((language === 'typescript' || language === 'javascript') &&
        (config.languages.includes('typescript') || config.languages.includes('javascript'))) {
        const result = await tsAnalyzer.analyzeFile(filePath, allFiles);
        allItems.push(...result.items);
    }

    if (language === 'python' && config.languages.includes('python')) {
        const result = await pythonAnalyzer.analyze([filePath]);
        allItems.push(...result.items);
    }

    if (language === 'css' && config.languages.includes('css')) {
        const result = await cssAnalyzer.analyze([filePath, ...allFiles]);
        allItems.push(...result.items.filter((i: DeadCodeItem) => i.filePath === filePath));
    }

    const filteredItems = allItems.filter(item => item.confidence >= config.confidenceThreshold);
    const itemsForFile = filteredItems.filter(i => path.resolve(i.filePath) === path.resolve(filePath));

    const scanResult: ScanResult = {
        items: itemsForFile,
        scannedFiles: 1,
        scanDuration: Date.now() - startTime,
        timestamp: Date.now(),
    };

    if (lastScanResult) {
        const otherItems = lastScanResult.items.filter(i => path.resolve(i.filePath) !== path.resolve(filePath));
        lastScanResult = {
            items: [...otherItems, ...itemsForFile],
            scannedFiles: lastScanResult.scannedFiles,
            scanDuration: scanResult.scanDuration,
            timestamp: Date.now(),
        };
        onScanCompleteEmitter.fire(lastScanResult);
    } else {
        lastScanResult = scanResult;
        onScanCompleteEmitter.fire(scanResult);
    }

    return scanResult;
}

async function collectFiles(config: DeadSweepConfig): Promise<string[]> {
    const extensions: string[] = [];
    for (const lang of config.languages) {
        extensions.push(...getExtensionsForLanguage(lang));
    }

    if (extensions.length === 0) {
        return [];
    }

    const globPattern = extensions.length === 1
        ? `**/*.${extensions[0]}`
        : `**/*.{${extensions.join(',')}}`;

    const ignoreGlob = config.ignore.length > 0
        ? `{${config.ignore.join(',')}}`
        : undefined;

    const uris = await vscode.workspace.findFiles(globPattern, ignoreGlob, 10000);

    let files = uris.map(uri => uri.fsPath);

    if (config.ignorePatterns.length > 0) {
        files = files.filter(f => {
            const baseName = path.basename(f, path.extname(f));
            return !config.ignorePatterns.some(pattern => {
                try {
                    return new RegExp(pattern).test(baseName);
                } catch {
                    return false;
                }
            });
        });
    }

    return files;
}

export function removeItem(item: DeadCodeItem): void {
    if (lastScanResult) {
        lastScanResult.items = lastScanResult.items.filter(i =>
            !(i.filePath === item.filePath && i.line === item.line && i.name === item.name)
        );
        onScanCompleteEmitter.fire(lastScanResult);
    }
}

export function ignoreItem(item: DeadCodeItem): void {
    if (lastScanResult) {
        const found = lastScanResult.items.find(i =>
            i.filePath === item.filePath && i.line === item.line && i.name === item.name
        );
        if (found) {
            found.ignored = true;
        }
        onScanCompleteEmitter.fire(lastScanResult);
    }
}

export function clearIgnoredItems(): void {
    if (lastScanResult) {
        lastScanResult.items = lastScanResult.items.filter(i => !i.ignored);
        onScanCompleteEmitter.fire(lastScanResult);
    }
}

export function dispose(): void {
    tsAnalyzer.dispose();
    onScanCompleteEmitter.dispose();
}
