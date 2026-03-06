import * as vscode from 'vscode';
import * as path from 'path';
import {
    scanProject,
    scanFile,
    getLastScanResult,
    onScanComplete,
    removeItem,
    ignoreItem as markIgnored,
    clearIgnoredItems,
    clearResults,
    DeadCodeItem,
    dispose as disposeAnalyzer,
} from './analyzer/index';
import { loadConfig, startConfigWatcher } from './config/configManager';
import { DeadCodeTreeProvider } from './providers/treeProvider';
import { DecorationProvider, DeadCodeLensProvider } from './providers/decorationProvider';
import { DiagnosticProvider, DeadCodeActionProvider } from './providers/diagnosticProvider';
import { deleteDeadCodeItem } from './actions/deleteAction';
import { ignoreItem, ignoreFile, clearAllIgnored } from './actions/ignoreAction';
import { BulkCleanupWizard } from './actions/bulkAction';
import { FileWatcher } from './watchers/fileWatcher';
import { exportReport } from './reports/htmlReport';
import { copyBadgeToClipboard } from './reports/badgeGenerator';
import { DashboardPanel } from './dashboard';
import * as logger from './utils/logger';
import { relativePath } from './utils/helpers';

let treeProvider: DeadCodeTreeProvider;
let decorationProvider: DecorationProvider;
let codeLensProvider: DeadCodeLensProvider;
let diagnosticProvider: DiagnosticProvider;
let fileWatcher: FileWatcher;
let dashboardPanel: DashboardPanel;
let bulkWizard: BulkCleanupWizard;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger.info('DeadSweep extension activating...');

    await loadConfig();
    startConfigWatcher(context);

    treeProvider = new DeadCodeTreeProvider();
    decorationProvider = new DecorationProvider();
    codeLensProvider = new DeadCodeLensProvider();
    diagnosticProvider = new DiagnosticProvider();
    fileWatcher = new FileWatcher();
    dashboardPanel = new DashboardPanel(context);
    bulkWizard = new BulkCleanupWizard(context);

    const treeView = vscode.window.createTreeView('deadsweep.resultsView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    context.subscriptions.push(treeView);

    onScanComplete((result) => {
        const count = result.items.filter(i => !i.ignored).length;
        treeView.badge = count > 0 ? { value: count, tooltip: `${count} dead code items` } : undefined;
        fileWatcher.updateStatusBar(count);
    });

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'typescriptreact' },
                { scheme: 'file', language: 'javascriptreact' },
                { scheme: 'file', language: 'python' },
                { scheme: 'file', language: 'css' },
                { scheme: 'file', language: 'scss' },
            ],
            codeLensProvider
        )
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            [
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'typescriptreact' },
                { scheme: 'file', language: 'javascriptreact' },
                { scheme: 'file', language: 'python' },
                { scheme: 'file', language: 'css' },
                { scheme: 'file', language: 'scss' },
            ],
            new DeadCodeActionProvider(),
            {
                providedCodeActionKinds: DeadCodeActionProvider.providedCodeActionKinds,
            }
        )
    );

    registerCommands(context);

    fileWatcher.start(context);

    context.subscriptions.push(
        { dispose: () => treeProvider.dispose() },
        { dispose: () => decorationProvider.dispose() },
        { dispose: () => codeLensProvider.dispose() },
        { dispose: () => diagnosticProvider.dispose() },
        { dispose: () => fileWatcher.dispose() },
        { dispose: () => dashboardPanel.dispose() },
        { dispose: () => disposeAnalyzer() },
    );

    logger.info('DeadSweep extension activated successfully');
}

function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('deadsweep.scan', async () => {
            fileWatcher.setScanning(true);
            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'DeadSweep: Scanning project...',
                        cancellable: false,
                    },
                    async (progress) => {
                        const result = await scanProject(progress);
                        const count = result.items.filter(i => !i.ignored).length;
                        if (count === 0) {
                            vscode.window.showInformationMessage('✅ No dead code found. Your project is clean!');
                        } else {
                            vscode.window.showInformationMessage(
                                `🧹 Found ${count} dead code item${count !== 1 ? 's' : ''} in ${result.scannedFiles} files (${result.scanDuration}ms)`
                            );
                        }
                    }
                );
            } finally {
                fileWatcher.setScanning(false);
            }
        }),

        vscode.commands.registerCommand('deadsweep.scanFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file is currently open.');
                return;
            }

            fileWatcher.setScanning(true);
            try {
                const result = await scanFile(editor.document.uri.fsPath);
                const count = result.items.length;
                if (count === 0) {
                    vscode.window.showInformationMessage(`✅ No dead code found in ${path.basename(editor.document.uri.fsPath)}`);
                } else {
                    vscode.window.showInformationMessage(
                        `🧹 Found ${count} dead code item${count !== 1 ? 's' : ''} in ${path.basename(editor.document.uri.fsPath)}`
                    );
                }
            } finally {
                fileWatcher.setScanning(false);
            }
        }),

        vscode.commands.registerCommand('deadsweep.openDashboard', async () => {
            await dashboardPanel.show();
        }),

        vscode.commands.registerCommand('deadsweep.runWizard', async () => {
            const result = getLastScanResult();
            if (!result || result.items.length === 0) {
                const runScan = await vscode.window.showInformationMessage(
                    'No scan results available. Run a scan first?',
                    'Scan Now',
                    'Cancel'
                );
                if (runScan === 'Scan Now') {
                    await vscode.commands.executeCommand('deadsweep.scan');
                }
                return;
            }
            await bulkWizard.show();
        }),

        vscode.commands.registerCommand('deadsweep.exportReport', async () => {
            const result = getLastScanResult();
            if (!result) {
                vscode.window.showWarningMessage('No scan results to export. Run a scan first.');
                return;
            }
            await exportReport(result);
        }),

        vscode.commands.registerCommand('deadsweep.clearIgnored', async () => {
            await clearAllIgnored(context);
        }),

        vscode.commands.registerCommand('deadsweep.clearResults', () => {
            clearResults();
            vscode.window.showInformationMessage('🧹 DeadSweep results cleared.');
        }),

        vscode.commands.registerCommand('deadsweep.rescan', async () => {
            clearResults();
            await vscode.commands.executeCommand('deadsweep.scan');
        }),

        vscode.commands.registerCommand('deadsweep.deleteItem', async (item?: DeadCodeItem) => {
            if (!item) {
                const result = getLastScanResult();
                if (!result) { return; }
                const items = result.items.filter(i => !i.ignored);
                if (items.length === 0) { return; }

                const selected = await vscode.window.showQuickPick(
                    items.map(i => ({
                        label: i.name,
                        description: `${i.type} · ${relativePath(i.filePath)}:${i.line}`,
                        detail: i.message,
                        item: i,
                    })),
                    { placeHolder: 'Select dead code item to delete' }
                );
                if (selected) {
                    item = (selected as { item: DeadCodeItem }).item;
                }
            }

            if (item) {
                const success = await deleteDeadCodeItem(item);
                if (success) {
                    vscode.window.showInformationMessage(`Deleted: ${item.name}`);
                }
            }
        }),

        vscode.commands.registerCommand('deadsweep.ignoreItem', async (item?: DeadCodeItem) => {
            if (!item) {
                const result = getLastScanResult();
                if (!result) { return; }
                const items = result.items.filter(i => !i.ignored);

                const selected = await vscode.window.showQuickPick(
                    items.map(i => ({
                        label: i.name,
                        description: `${i.type} · ${relativePath(i.filePath)}:${i.line}`,
                        item: i,
                    })),
                    { placeHolder: 'Select dead code item to ignore' }
                );
                if (selected) {
                    item = (selected as { item: DeadCodeItem }).item;
                }
            }

            if (item) {
                await ignoreItem(item);
            }
        }),

        vscode.commands.registerCommand('deadsweep.ignoreFile', async (item?: DeadCodeItem) => {
            if (item) {
                await ignoreFile(item.filePath);
            } else {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await ignoreFile(editor.document.uri.fsPath);
                }
            }
        }),

        vscode.commands.registerCommand('deadsweep.jumpToItem', async (item?: DeadCodeItem) => {
            if (!item) { return; }

            const uri = vscode.Uri.file(item.filePath);
            const line = Math.max(0, item.line - 1);
            const range = new vscode.Range(line, item.column || 0, line, item.column || 0);

            await vscode.window.showTextDocument(uri, {
                selection: range,
                preview: false,
            });
        }),

        vscode.commands.registerCommand('deadsweep.copyLocation', async (item?: DeadCodeItem) => {
            if (!item) { return; }
            const location = `${relativePath(item.filePath)}:${item.line}`;
            await vscode.env.clipboard.writeText(location);
            vscode.window.showInformationMessage(`Copied: ${location}`);
        })
    );
}

export function deactivate(): void {
    logger.info('DeadSweep extension deactivated');
    logger.dispose();
}
