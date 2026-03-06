import * as vscode from 'vscode';
import { DeadCodeItem, DeadCodeType, ScanResult, onScanComplete } from '../analyzer/index';

export class DiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('deadsweep');

        this.disposables.push(
            this.diagnosticCollection,
            onScanComplete((result: ScanResult) => {
                this.updateDiagnostics(result.items);
            })
        );
    }

    private updateDiagnostics(items: DeadCodeItem[]): void {
        this.diagnosticCollection.clear();

        const grouped = new Map<string, DeadCodeItem[]>();
        for (const item of items) {
            if (item.ignored) { continue; }
            const group = grouped.get(item.filePath) || [];
            group.push(item);
            grouped.set(item.filePath, group);
        }

        for (const [filePath, fileItems] of grouped) {
            const uri = vscode.Uri.file(filePath);
            const diagnostics: vscode.Diagnostic[] = [];

            for (const item of fileItems) {
                const line = Math.max(0, item.line - 1);
                const endLine = Math.max(line, (item.endLine || item.line) - 1);

                const range = new vscode.Range(
                    line, item.column || 0,
                    item.type === DeadCodeType.Import ? line : endLine,
                    item.type === DeadCodeType.Import ? 1000 : 1000
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `${item.message} (${item.confidence}% confidence)`,
                    vscode.DiagnosticSeverity.Warning
                );

                diagnostic.source = 'DeadSweep';
                diagnostic.code = {
                    value: `dead-${item.type}`,
                    target: vscode.Uri.parse('https://github.com/PrinceSajjadHussain/deadsweep#rules'),
                };
                diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];

                diagnostics.push(diagnostic);
            }

            this.diagnosticCollection.set(uri, diagnostics);
        }
    }

    clear(): void {
        this.diagnosticCollection.clear();
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

export class DeadCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'DeadSweep') { continue; }

            const removeAction = new vscode.CodeAction(
                `🗑 Remove dead code`,
                vscode.CodeActionKind.QuickFix
            );
            removeAction.command = {
                command: 'deadsweep.deleteItem',
                title: 'Remove Dead Code',
                arguments: [{
                    filePath: document.uri.fsPath,
                    line: diagnostic.range.start.line + 1,
                    name: this.extractNameFromMessage(diagnostic.message),
                }],
            };
            removeAction.diagnostics = [diagnostic];
            removeAction.isPreferred = true;
            actions.push(removeAction);

            const ignoreAction = new vscode.CodeAction(
                `👁 Ignore this item`,
                vscode.CodeActionKind.QuickFix
            );
            ignoreAction.command = {
                command: 'deadsweep.ignoreItem',
                title: 'Ignore This Item',
                arguments: [{
                    filePath: document.uri.fsPath,
                    line: diagnostic.range.start.line + 1,
                    name: this.extractNameFromMessage(diagnostic.message),
                }],
            };
            ignoreAction.diagnostics = [diagnostic];
            actions.push(ignoreAction);
        }

        return actions;
    }

    private extractNameFromMessage(message: string): string {
        const match = /'([^']+)'/.exec(message);
        return match ? match[1] : 'unknown';
    }
}
