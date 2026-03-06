import * as vscode from 'vscode';
import { scanFile } from '../analyzer/index';
import { getConfig, onConfigChanged } from '../config/configManager';
import { debounce, getLanguageFromExtension } from '../utils/helpers';
import * as logger from '../utils/logger';
import * as path from 'path';

export class FileWatcher {
    private watcher: vscode.Disposable | undefined;
    private disposables: vscode.Disposable[] = [];
    private statusBarItem: vscode.StatusBarItem;
    private isScanning = false;
    private debouncedScan: ((uri: vscode.Uri) => void) | undefined;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'deadsweep.openDashboard';
        this.statusBarItem.tooltip = 'DeadSweep — Click to open dashboard';
        this.statusBarItem.show();
        this.updateStatusBar(0);
    }

    start(context: vscode.ExtensionContext): void {
        const config = getConfig();
        if (!config.autoScanOnSave) {
            logger.info('Auto scan on save is disabled');
            return;
        }

        this.debouncedScan = debounce((uri: vscode.Uri) => {
            this.scanFileDebounced(uri);
        }, 500) as unknown as (uri: vscode.Uri) => void;

        this.watcher = vscode.workspace.onDidSaveTextDocument((document) => {
            const ext = path.extname(document.uri.fsPath);
            const lang = getLanguageFromExtension(ext);
            const config = getConfig();

            if (config.languages.includes(lang) || lang === 'unknown') {
                this.debouncedScan?.(document.uri);
            }
        });

        this.disposables.push(this.watcher);

        this.disposables.push(
            onConfigChanged((config) => {
                if (!config.autoScanOnSave) {
                    this.stop();
                }
            })
        );

        context.subscriptions.push(...this.disposables);
        context.subscriptions.push(this.statusBarItem);

        logger.info('File watcher started');
    }

    stop(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
        logger.info('File watcher stopped');
    }

    updateStatusBar(count: number): void {
        if (this.isScanning) {
            this.statusBarItem.text = '$(loading~spin) DeadSweep scanning...';
            this.statusBarItem.backgroundColor = undefined;
        } else if (count === 0) {
            this.statusBarItem.text = '$(check) DeadSweep: Clean';
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(alert) 🧹 ${count} dead item${count !== 1 ? 's' : ''}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    setScanning(scanning: boolean): void {
        this.isScanning = scanning;
        if (scanning) {
            this.statusBarItem.text = '$(loading~spin) DeadSweep scanning...';
        }
    }

    private async scanFileDebounced(uri: vscode.Uri): Promise<void> {
        if (this.isScanning) { return; }

        try {
            this.setScanning(true);
            logger.debug(`Auto-scanning: ${uri.fsPath}`);
            const result = await scanFile(uri.fsPath);
            this.updateStatusBar(result.items.length);
        } catch (err) {
            logger.error('Auto-scan failed', err);
        } finally {
            this.setScanning(false);
        }
    }

    dispose(): void {
        this.stop();
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
