import * as vscode from 'vscode';
import * as path from 'path';

export function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return folders[0].uri.fsPath;
    }
    return undefined;
}

export function relativePath(absolutePath: string): string {
    const root = getWorkspaceRoot();
    if (root && absolutePath.startsWith(root)) {
        return path.relative(root, absolutePath);
    }
    return absolutePath;
}

export function absolutePath(relPath: string): string {
    const root = getWorkspaceRoot();
    if (root) {
        return path.resolve(root, relPath);
    }
    return relPath;
}

export function debounce<T extends (...args: any[]) => void>(
    fn: T,
    delayMs: number
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn(...args);
            timer = undefined;
        }, delayMs);
    };
}

export function groupBy<T, K extends string | number>(
    items: T[],
    keyFn: (item: T) => K
): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of items) {
        const key = keyFn(item);
        const group = map.get(key) || [];
        group.push(item);
        map.set(key, group);
    }
    return map;
}

export function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export function matchesGlob(filePath: string, patterns: string[]): boolean {
    const minimatchLike = (pattern: string, target: string): boolean => {
        const regexStr = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '{{GLOBSTAR}}')
            .replace(/\*/g, '[^/\\\\]*')
            .replace(/\{\{GLOBSTAR\}\}/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexStr}$`);
        return regex.test(target.replace(/\\/g, '/'));
    };

    const normalized = filePath.replace(/\\/g, '/');
    return patterns.some(p => minimatchLike(p, normalized));
}

export function getLanguageFromExtension(ext: string): string {
    const map: Record<string, string> = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.mjs': 'javascript',
        '.cjs': 'javascript',
        '.py': 'python',
        '.css': 'css',
        '.scss': 'css',
        '.sass': 'css',
        '.less': 'css',
    };
    return map[ext] || 'unknown';
}

export function getExtensionsForLanguage(language: string): string[] {
    const map: Record<string, string[]> = {
        typescript: ['ts', 'tsx'],
        javascript: ['js', 'jsx', 'mjs', 'cjs'],
        python: ['py'],
        css: ['css', 'scss', 'sass', 'less'],
    };
    return map[language] || [];
}

export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
        return str;
    }
    return str.substring(0, maxLen - 3) + '...';
}

export function formatCount(count: number): string {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}

export async function readFileContent(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf-8');
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
}
