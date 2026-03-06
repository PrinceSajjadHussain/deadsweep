import * as vscode from 'vscode';
import { DeadCodeItem, DeadCodeType, removeItem } from '../analyzer/index';
import * as logger from '../utils/logger';

export async function deleteDeadCodeItem(item: DeadCodeItem): Promise<boolean> {
    const uri = vscode.Uri.file(item.filePath);

    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();

        const startLine = Math.max(0, item.line - 1);
        const endLine = Math.max(startLine, (item.endLine || item.line) - 1);

        if (item.type === DeadCodeType.Import) {
            const lineText = document.lineAt(startLine).text;

            if (isNamedImportPart(lineText, item.name)) {
                const newLineText = removeNamedImport(lineText, item.name);
                if (newLineText) {
                    const range = new vscode.Range(startLine, 0, startLine, lineText.length);
                    edit.replace(uri, range, newLineText);
                } else {
                    const range = getFullLineRange(document, startLine);
                    edit.delete(uri, range);
                }
            } else {
                const range = getFullLineRange(document, startLine);
                edit.delete(uri, range);
            }
        } else {
            const startPos = new vscode.Position(startLine, 0);
            const endPos = endLine < document.lineCount - 1
                ? new vscode.Position(endLine + 1, 0)
                : new vscode.Position(endLine, document.lineAt(endLine).text.length);

            let deleteStart = startLine;
            while (deleteStart > 0) {
                const prevLine = document.lineAt(deleteStart - 1).text.trim();
                if (prevLine === '' || prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*')) {
                    if (prevLine.startsWith('//') || prevLine.startsWith('/*') || prevLine.startsWith('*')) {
                        deleteStart--;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            const range = new vscode.Range(
                new vscode.Position(deleteStart, 0),
                endPos
            );
            edit.delete(uri, range);
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            removeItem(item);
            logger.info(`Deleted dead code: ${item.name} in ${item.filePath}:${item.line}`);
        }
        return success;
    } catch (err) {
        logger.error(`Failed to delete dead code: ${item.name}`, err);
        vscode.window.showErrorMessage(`Failed to delete ${item.name}: ${err}`);
        return false;
    }
}

function getFullLineRange(document: vscode.TextDocument, line: number): vscode.Range {
    if (line < document.lineCount - 1) {
        return new vscode.Range(line, 0, line + 1, 0);
    }
    const prevLineEnd = line > 0 ? document.lineAt(line - 1).text.length : 0;
    return new vscode.Range(
        line > 0 ? line - 1 : 0,
        line > 0 ? prevLineEnd : 0,
        line,
        document.lineAt(line).text.length
    );
}

function isNamedImportPart(lineText: string, name: string): boolean {
    const namedImportMatch = /\{([^}]+)\}/.exec(lineText);
    if (!namedImportMatch) { return false; }
    const names = namedImportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
    return names.length > 1 && names.includes(name);
}

function removeNamedImport(lineText: string, name: string): string | null {
    const namedImportMatch = /\{([^}]+)\}/.exec(lineText);
    if (!namedImportMatch) { return null; }

    const names = namedImportMatch[1]
        .split(',')
        .map(n => n.trim())
        .filter(n => {
            const baseName = n.split(/\s+as\s+/)[0].trim();
            return baseName !== name;
        });

    if (names.length === 0) {
        return null;
    }

    const newImportPart = `{ ${names.join(', ')} }`;
    return lineText.replace(/\{[^}]+\}/, newImportPart);
}

export async function deleteMultipleItems(items: DeadCodeItem[]): Promise<{ success: number; failed: number }> {
    const groupedByFile = new Map<string, DeadCodeItem[]>();
    for (const item of items) {
        const group = groupedByFile.get(item.filePath) || [];
        group.push(item);
        groupedByFile.set(item.filePath, group);
    }

    let success = 0;
    let failed = 0;

    for (const [filePath, fileItems] of groupedByFile) {
        const sorted = fileItems.sort((a, b) => b.line - a.line);
        for (const item of sorted) {
            const result = await deleteDeadCodeItem(item);
            if (result) {
                success++;
            } else {
                failed++;
            }
        }
    }

    return { success, failed };
}
