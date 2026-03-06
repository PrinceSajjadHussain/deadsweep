import * as vscode from 'vscode';
import { DeadCodeItem, ScanResult, onScanComplete } from '../analyzer/index';
import { getConfig } from '../config/configManager';

export class DecorationProvider {
    private gutterDecorationType: vscode.TextEditorDecorationType;
    private lineDecorationType: vscode.TextEditorDecorationType;
    private items: DeadCodeItem[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.createGutterIcon(),
            gutterIconSize: '80%',
            overviewRulerColor: '#C0392B88',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });

        this.lineDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(192, 57, 43, 0.08)',
            isWholeLine: true,
            after: {
                contentText: ' ⚠️ unused',
                color: '#C0392B88',
                fontStyle: 'italic',
                margin: '0 0 0 2em',
            },
        });

        this.disposables.push(
            onScanComplete((result: ScanResult) => {
                this.items = result.items;
                this.updateAllEditors();
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.updateAllEditors();
            }),
            vscode.workspace.onDidChangeTextDocument(() => {
                this.updateAllEditors();
            })
        );
    }

    updateAllEditors(): void {
        const config = getConfig();
        if (!config.showInlineDecorations) {
            for (const editor of vscode.window.visibleTextEditors) {
                editor.setDecorations(this.gutterDecorationType, []);
                editor.setDecorations(this.lineDecorationType, []);
            }
            return;
        }

        for (const editor of vscode.window.visibleTextEditors) {
            this.updateEditor(editor);
        }
    }

    private updateEditor(editor: vscode.TextEditor): void {
        const filePath = editor.document.uri.fsPath;
        const fileItems = this.items.filter(item =>
            item.filePath === filePath && !item.ignored
        );

        const gutterDecorations: vscode.DecorationOptions[] = [];
        const lineDecorations: vscode.DecorationOptions[] = [];

        for (const item of fileItems) {
            const line = Math.max(0, item.line - 1);
            if (line >= editor.document.lineCount) { continue; }

            const range = new vscode.Range(line, 0, line, editor.document.lineAt(line).text.length);

            const hoverMessage = new vscode.MarkdownString(
                `⚠️ **Unused ${item.type}:** \`${item.name}\`\n\n` +
                `${item.message}\n\n` +
                `🎯 Confidence: **${item.confidence}%**\n\n` +
                `[🗑 Remove](command:deadsweep.deleteItem?${encodeURIComponent(JSON.stringify(item))}) | ` +
                `[👁 Ignore](command:deadsweep.ignoreItem?${encodeURIComponent(JSON.stringify(item))})`
            );
            hoverMessage.isTrusted = true;

            gutterDecorations.push({ range, hoverMessage });
            lineDecorations.push({ range, hoverMessage });
        }

        editor.setDecorations(this.gutterDecorationType, gutterDecorations);
        editor.setDecorations(this.lineDecorationType, lineDecorations);
    }

    private createGutterIcon(): vscode.Uri {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#C0392B">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#C0392B" stroke-width="1.5"/>
            <line x1="8" y1="4" x2="8" y2="9" stroke="#C0392B" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="8" cy="11.5" r="1" fill="#C0392B"/>
        </svg>`;
        return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    }

    dispose(): void {
        this.gutterDecorationType.dispose();
        this.lineDecorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

export class DeadCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private items: DeadCodeItem[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            onScanComplete((result: ScanResult) => {
                this.items = result.items;
                this._onDidChangeCodeLenses.fire();
            })
        );
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        const config = getConfig();
        if (!config.showCodeLens) {
            return [];
        }

        const filePath = document.uri.fsPath;
        const fileItems = this.items.filter(item =>
            item.filePath === filePath && !item.ignored
        );

        const lenses: vscode.CodeLens[] = [];

        for (const item of fileItems) {
            const line = Math.max(0, item.line - 1);
            if (line >= document.lineCount) { continue; }

            const range = new vscode.Range(line, 0, line, 0);

            lenses.push(new vscode.CodeLens(range, {
                title: `🗑 Remove`,
                command: 'deadsweep.deleteItem',
                arguments: [item],
                tooltip: `Remove unused ${item.type}: ${item.name}`,
            }));

            lenses.push(new vscode.CodeLens(range, {
                title: `👁 Ignore`,
                command: 'deadsweep.ignoreItem',
                arguments: [item],
                tooltip: `Ignore this ${item.type}`,
            }));

            lenses.push(new vscode.CodeLens(range, {
                title: `${item.confidence}% confidence`,
                command: '',
                tooltip: `DeadSweep is ${item.confidence}% confident this is safe to remove`,
            }));
        }

        return lenses;
    }

    dispose(): void {
        this._onDidChangeCodeLenses.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
