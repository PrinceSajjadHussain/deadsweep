import * as vscode from 'vscode';
import { DeadCodeItem, ignoreItem as markIgnored } from '../analyzer/index';
import { addIgnorePattern } from '../config/configManager';
import { relativePath } from '../utils/helpers';
import * as logger from '../utils/logger';

export async function ignoreItem(item: DeadCodeItem): Promise<void> {
    const uri = vscode.Uri.file(item.filePath);

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        const line = Math.max(0, item.line - 1);

        if (line < document.lineCount) {
            const lineText = document.lineAt(line).text;
            const indent = lineText.match(/^(\s*)/)?.[1] || '';

            let commentPrefix: string;
            if (item.language === 'python') {
                commentPrefix = `${indent}# deadsweep-ignore\n`;
            } else if (item.language === 'css') {
                commentPrefix = `${indent}/* deadsweep-ignore */\n`;
            } else {
                commentPrefix = `${indent}// deadsweep-ignore\n`;
            }

            edit.insert(uri, new vscode.Position(line, 0), commentPrefix);
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            markIgnored(item);
            logger.info(`Ignored item: ${item.name} in ${item.filePath}:${item.line}`);
            vscode.window.showInformationMessage(`Ignored: ${item.name}`);
        }
    } catch (err) {
        logger.error(`Failed to ignore item: ${item.name}`, err);
        vscode.window.showErrorMessage(`Failed to ignore ${item.name}: ${err}`);
    }
}

export async function ignoreFile(filePath: string): Promise<void> {
    const relative = relativePath(filePath);
    const pattern = relative.replace(/\\/g, '/');

    try {
        await addIgnorePattern(pattern);
        vscode.window.showInformationMessage(`File ignored: ${pattern}`);
        logger.info(`Added file to ignore list: ${pattern}`);
    } catch (err) {
        logger.error(`Failed to ignore file: ${filePath}`, err);
        vscode.window.showErrorMessage(`Failed to ignore file: ${err}`);
    }
}

export async function clearAllIgnored(context: vscode.ExtensionContext): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'Clear all ignored items? This will remove deadsweep-ignore comments from files.',
        { modal: true },
        'Clear All'
    );

    if (confirm !== 'Clear All') {
        return;
    }

    const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/dist/**}');
    let removedCount = 0;

    for (const uri of files) {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();

            if (!text.includes('deadsweep-ignore')) { continue; }

            const edit = new vscode.WorkspaceEdit();
            const lines = text.split('\n');
            const linesToRemove: number[] = [];

            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (
                    trimmed === '// deadsweep-ignore' ||
                    trimmed === '# deadsweep-ignore' ||
                    trimmed === '/* deadsweep-ignore */'
                ) {
                    linesToRemove.push(i);
                }
            }

            for (const lineIdx of linesToRemove.reverse()) {
                const range = lineIdx < document.lineCount - 1
                    ? new vscode.Range(lineIdx, 0, lineIdx + 1, 0)
                    : new vscode.Range(lineIdx, 0, lineIdx, lines[lineIdx].length);
                edit.delete(uri, range);
                removedCount++;
            }

            if (linesToRemove.length > 0) {
                await vscode.workspace.applyEdit(edit);
            }
        } catch {
            continue;
        }
    }

    vscode.window.showInformationMessage(`Cleared ${removedCount} deadsweep-ignore comment${removedCount !== 1 ? 's' : ''}`);
    logger.info(`Cleared ${removedCount} ignore comments`);
}
