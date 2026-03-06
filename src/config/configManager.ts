import * as vscode from 'vscode';
import * as path from 'path';
import * as logger from '../utils/logger';
import { fileExists, readFileContent, getWorkspaceRoot } from '../utils/helpers';

export interface DeadSweepConfig {
    languages: string[];
    ignore: string[];
    ignorePatterns: string[];
    confidenceThreshold: number;
    ciFailThreshold: number;
    autoScanOnSave: boolean;
    showInlineDecorations: boolean;
    showCodeLens: boolean;
}

const DEFAULT_CONFIG: DeadSweepConfig = {
    languages: ['typescript', 'javascript', 'python', 'css'],
    ignore: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/.git/**'],
    ignorePatterns: [],
    confidenceThreshold: 70,
    ciFailThreshold: 10,
    autoScanOnSave: true,
    showInlineDecorations: true,
    showCodeLens: true,
};

let cachedConfig: DeadSweepConfig | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;
const onConfigChangedEmitter = new vscode.EventEmitter<DeadSweepConfig>();
export const onConfigChanged = onConfigChangedEmitter.event;

export function getConfig(): DeadSweepConfig {
    if (cachedConfig) {
        return { ...cachedConfig };
    }
    return { ...DEFAULT_CONFIG };
}

export async function loadConfig(): Promise<DeadSweepConfig> {
    const vsConfig = vscode.workspace.getConfiguration('deadsweep');
    const merged: DeadSweepConfig = { ...DEFAULT_CONFIG };

    merged.languages = vsConfig.get<string[]>('languages', DEFAULT_CONFIG.languages);
    merged.ignore = vsConfig.get<string[]>('ignore', DEFAULT_CONFIG.ignore);
    merged.confidenceThreshold = vsConfig.get<number>('confidenceThreshold', DEFAULT_CONFIG.confidenceThreshold);
    merged.ciFailThreshold = vsConfig.get<number>('ciFailThreshold', DEFAULT_CONFIG.ciFailThreshold);
    merged.autoScanOnSave = vsConfig.get<boolean>('autoScanOnSave', DEFAULT_CONFIG.autoScanOnSave);
    merged.showInlineDecorations = vsConfig.get<boolean>('showInlineDecorations', DEFAULT_CONFIG.showInlineDecorations);
    merged.showCodeLens = vsConfig.get<boolean>('showCodeLens', DEFAULT_CONFIG.showCodeLens);

    const root = getWorkspaceRoot();
    if (root) {
        const rcPath = path.join(root, '.deadsweeprc.json');
        if (await fileExists(rcPath)) {
            try {
                const content = await readFileContent(rcPath);
                const rcConfig = JSON.parse(content);

                if (rcConfig.languages) { merged.languages = rcConfig.languages; }
                if (rcConfig.ignore) { merged.ignore = [...merged.ignore, ...rcConfig.ignore]; }
                if (rcConfig.ignorePatterns) { merged.ignorePatterns = rcConfig.ignorePatterns; }
                if (typeof rcConfig.confidenceThreshold === 'number') { merged.confidenceThreshold = rcConfig.confidenceThreshold; }
                if (typeof rcConfig.ciFailThreshold === 'number') { merged.ciFailThreshold = rcConfig.ciFailThreshold; }
                if (typeof rcConfig.autoScanOnSave === 'boolean') { merged.autoScanOnSave = rcConfig.autoScanOnSave; }
                if (typeof rcConfig.showInlineDecorations === 'boolean') { merged.showInlineDecorations = rcConfig.showInlineDecorations; }
                if (typeof rcConfig.showCodeLens === 'boolean') { merged.showCodeLens = rcConfig.showCodeLens; }

                logger.info('Loaded .deadsweeprc.json config');
            } catch (err) {
                logger.error('Failed to parse .deadsweeprc.json', err);
            }
        }
    }

    const unique = (arr: string[]) => [...new Set(arr)];
    merged.ignore = unique(merged.ignore);

    cachedConfig = merged;
    return { ...merged };
}

export function startConfigWatcher(context: vscode.ExtensionContext): void {
    configWatcher = vscode.workspace.createFileSystemWatcher('**/.deadsweeprc.json');

    configWatcher.onDidChange(async () => {
        logger.info('.deadsweeprc.json changed, reloading config');
        const config = await loadConfig();
        onConfigChangedEmitter.fire(config);
    });

    configWatcher.onDidCreate(async () => {
        logger.info('.deadsweeprc.json created, loading config');
        const config = await loadConfig();
        onConfigChangedEmitter.fire(config);
    });

    configWatcher.onDidDelete(async () => {
        logger.info('.deadsweeprc.json deleted, resetting to defaults');
        cachedConfig = undefined;
        const config = await loadConfig();
        onConfigChangedEmitter.fire(config);
    });

    context.subscriptions.push(configWatcher);
    context.subscriptions.push(onConfigChangedEmitter);

    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('deadsweep')) {
            logger.info('VS Code DeadSweep settings changed, reloading');
            cachedConfig = undefined;
            const config = await loadConfig();
            onConfigChangedEmitter.fire(config);
        }
    }, null, context.subscriptions);
}

export async function addIgnorePattern(pattern: string): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) { return; }

    const rcPath = path.join(root, '.deadsweeprc.json');
    let rcConfig: Record<string, unknown> = {};

    if (await fileExists(rcPath)) {
        try {
            const content = await readFileContent(rcPath);
            rcConfig = JSON.parse(content);
        } catch {
            rcConfig = {};
        }
    }

    const ignoreList = (rcConfig['ignore'] as string[]) || [];
    if (!ignoreList.includes(pattern)) {
        ignoreList.push(pattern);
        rcConfig['ignore'] = ignoreList;
    }

    const uri = vscode.Uri.file(rcPath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(rcConfig, null, 2), 'utf-8'));
    logger.info(`Added ignore pattern: ${pattern}`);
}

export function clearConfig(): void {
    cachedConfig = undefined;
}
