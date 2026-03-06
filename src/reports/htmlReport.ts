import * as vscode from 'vscode';
import { ScanResult, DeadCodeItem, DeadCodeType } from '../analyzer/index';
import { relativePath, escapeHtml, groupBy } from '../utils/helpers';
import * as logger from '../utils/logger';

export async function generateHtmlReport(scanResult: ScanResult): Promise<string> {
    const items = scanResult.items.filter(i => !i.ignored);
    const totalItems = items.length;
    const fileCount = new Set(items.map(i => i.filePath)).size;
    const cleanScore = calculateCleanScore(scanResult);

    const byType = groupBy(items, i => i.type);
    const byLanguage = groupBy(items, i => i.language);
    const byFile = groupBy(items, i => i.filePath);

    const topFiles = [...byFile.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10);

    const typeBreakdownHtml = [...byType.entries()]
        .map(([type, typeItems]) =>
            `<tr><td>${escapeHtml(type)}</td><td>${typeItems.length}</td><td>${(typeItems.length / totalItems * 100).toFixed(1)}%</td></tr>`
        ).join('');

    const languageBreakdownHtml = [...byLanguage.entries()]
        .map(([lang, langItems]) =>
            `<tr><td>${escapeHtml(lang)}</td><td>${langItems.length}</td></tr>`
        ).join('');

    const topFilesHtml = topFiles
        .map(([filePath, fileItems]) =>
            `<tr><td>${escapeHtml(relativePath(filePath))}</td><td>${fileItems.length}</td></tr>`
        ).join('');

    const itemsTableHtml = items
        .sort((a, b) => b.confidence - a.confidence)
        .map(item => {
            const confClass = item.confidence >= 90 ? 'high' : item.confidence >= 60 ? 'medium' : 'low';
            return `<tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.type)}</td>
                <td>${escapeHtml(relativePath(item.filePath))}:${item.line}</td>
                <td>${escapeHtml(item.language)}</td>
                <td><span class="confidence ${confClass}">${item.confidence}%</span></td>
                <td>${escapeHtml(item.message)}</td>
            </tr>`;
        }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeadSweep Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 24px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 32px; padding: 32px; background: linear-gradient(135deg, #16213e, #0f3460); border-radius: 12px; }
        .header h1 { font-size: 36px; margin-bottom: 8px; }
        .header .subtitle { color: #aaa; font-size: 16px; }
        .header .date { color: #777; font-size: 13px; margin-top: 8px; }

        .score-section { text-align: center; margin: 32px 0; }
        .score-circle {
            width: 150px; height: 150px; border-radius: 50%;
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 48px; font-weight: bold; margin-bottom: 12px;
            border: 6px solid;
        }
        .score-good { border-color: #27ae60; color: #27ae60; }
        .score-ok { border-color: #f39c12; color: #f39c12; }
        .score-bad { border-color: #e74c3c; color: #e74c3c; }

        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; }
        .card { background: #16213e; border-radius: 8px; padding: 20px; text-align: center; }
        .card .number { font-size: 36px; font-weight: bold; color: #C0392B; }
        .card .label { font-size: 14px; color: #aaa; margin-top: 4px; }

        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #2a2a4a; font-size: 13px; }
        th { background: #16213e; font-weight: 600; color: #C0392B; }
        tr:hover { background: #1a1a3e; }

        .section { margin: 32px 0; }
        .section h2 { font-size: 20px; margin-bottom: 16px; color: #C0392B; border-bottom: 2px solid #C0392B; padding-bottom: 8px; }

        .confidence { padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
        .confidence.high { background: #27ae60; color: white; }
        .confidence.medium { background: #f39c12; color: white; }
        .confidence.low { background: #e74c3c; color: white; }

        .footer { text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid #2a2a4a; color: #666; font-size: 13px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧹 DeadSweep Report</h1>
            <div class="subtitle">Dead Code Analysis Results</div>
            <div class="date">Generated: ${new Date().toLocaleString()} · Scan duration: ${scanResult.scanDuration}ms</div>
        </div>

        <div class="score-section">
            <div class="score-circle ${cleanScore >= 80 ? 'score-good' : cleanScore >= 50 ? 'score-ok' : 'score-bad'}">
                ${cleanScore}%
            </div>
            <div style="font-size: 18px; color: #aaa;">Clean Score</div>
        </div>

        <div class="cards">
            <div class="card"><div class="number">${totalItems}</div><div class="label">Dead Code Items</div></div>
            <div class="card"><div class="number">${fileCount}</div><div class="label">Affected Files</div></div>
            <div class="card"><div class="number">${scanResult.scannedFiles}</div><div class="label">Files Scanned</div></div>
            <div class="card"><div class="number">${cleanScore}%</div><div class="label">Clean Score</div></div>
        </div>

        <div class="section">
            <h2>Breakdown by Type</h2>
            <table>
                <thead><tr><th>Type</th><th>Count</th><th>Percentage</th></tr></thead>
                <tbody>${typeBreakdownHtml}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>Breakdown by Language</h2>
            <table>
                <thead><tr><th>Language</th><th>Count</th></tr></thead>
                <tbody>${languageBreakdownHtml}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>Top 10 Files with Most Dead Code</h2>
            <table>
                <thead><tr><th>File</th><th>Dead Items</th></tr></thead>
                <tbody>${topFilesHtml}</tbody>
            </table>
        </div>

        <div class="section">
            <h2>All Dead Code Items (${totalItems})</h2>
            <table>
                <thead>
                    <tr><th>Name</th><th>Type</th><th>Location</th><th>Language</th><th>Confidence</th><th>Message</th></tr>
                </thead>
                <tbody>${itemsTableHtml}</tbody>
            </table>
        </div>

        <div class="footer">
            Generated by DeadSweep v1.0.0 · <a href="https://github.com/deadsweep/deadsweep" style="color: #C0392B;">GitHub</a>
        </div>
    </div>
</body>
</html>`;

    return html;
}

export async function exportReport(scanResult: ScanResult): Promise<void> {
    const html = await generateHtmlReport(scanResult);

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('deadsweep-report.html'),
        filters: {
            'HTML': ['html'],
        },
    });

    if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(html, 'utf-8'));
        vscode.window.showInformationMessage(`Report saved to ${uri.fsPath}`);

        const open = await vscode.window.showInformationMessage(
            'Report saved. Open in browser?',
            'Open',
            'Dismiss'
        );
        if (open === 'Open') {
            vscode.env.openExternal(uri);
        }
    }
}

export function calculateCleanScore(scanResult: ScanResult): number {
    if (scanResult.scannedFiles === 0) { return 100; }

    const itemsPerFile = scanResult.items.filter(i => !i.ignored).length / scanResult.scannedFiles;
    const score = Math.max(0, Math.min(100, Math.round(100 - (itemsPerFile * 10))));
    return score;
}
