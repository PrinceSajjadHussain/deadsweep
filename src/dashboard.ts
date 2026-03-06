import * as vscode from 'vscode';
import { ScanResult, DeadCodeItem, getLastScanResult, onScanComplete } from './analyzer/index';
import { calculateCleanScore, exportReport } from './reports/htmlReport';
import { copyBadgeToClipboard } from './reports/badgeGenerator';
import { relativePath, escapeHtml, groupBy } from './utils/helpers';

interface ScanHistoryEntry {
    timestamp: number;
    deadCount: number;
    cleanScore: number;
    scannedFiles: number;
}

export class DashboardPanel {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.updateDashboard();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'deadsweepDashboard',
            'DeadSweep Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.iconPath = vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="14" font-size="14">🧹</text></svg>');

        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'scan':
                    await vscode.commands.executeCommand('deadsweep.scan');
                    break;
                case 'exportReport': {
                    const result = getLastScanResult();
                    if (result) { await exportReport(result); }
                    break;
                }
                case 'copyBadge': {
                    const result = getLastScanResult();
                    if (result) { await copyBadgeToClipboard(result); }
                    break;
                }
            }
        }, undefined, this.disposables);

        this.disposables.push(
            onScanComplete(() => {
                this.updateDashboard();
            })
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.disposables.forEach(d => d.dispose());
            this.disposables = [];
        });

        this.updateDashboard();
    }

    private async updateDashboard(): Promise<void> {
        if (!this.panel) { return; }

        const scanResult = getLastScanResult();
        if (!scanResult) {
            this.panel.webview.html = this.getEmptyHtml();
            return;
        }

        await this.saveScanHistory(scanResult);
        const history = this.getScanHistory();

        this.panel.webview.html = this.getDashboardHtml(scanResult, history);
    }

    private async saveScanHistory(result: ScanResult): Promise<void> {
        const history: ScanHistoryEntry[] = this.context.globalState.get('deadsweep.scanHistory', []);
        const entry: ScanHistoryEntry = {
            timestamp: result.timestamp,
            deadCount: result.items.filter((i: DeadCodeItem) => !i.ignored).length,
            cleanScore: calculateCleanScore(result),
            scannedFiles: result.scannedFiles,
        };

        const lastEntry = history[history.length - 1];
        if (!lastEntry || (entry.timestamp - lastEntry.timestamp) > 60000) {
            history.push(entry);
            if (history.length > 100) {
                history.splice(0, history.length - 100);
            }
            await this.context.globalState.update('deadsweep.scanHistory', history);
        }
    }

    private getScanHistory(): ScanHistoryEntry[] {
        return this.context.globalState.get('deadsweep.scanHistory', []);
    }

    private getEmptyHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
        }
        .empty { text-align: center; padding: 48px; }
        .empty .icon { font-size: 80px; margin-bottom: 16px; }
        .empty h2 { font-size: 24px; margin-bottom: 12px; }
        .empty p { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
        .empty button {
            padding: 10px 24px; border: none; border-radius: 6px;
            background: #C0392B; color: white; font-size: 15px; cursor: pointer;
        }
        .empty button:hover { background: #A93226; }
    </style>
</head>
<body>
    <div class="empty">
        <div class="icon">🧹</div>
        <h2>Welcome to DeadSweep</h2>
        <p>No scan results yet. Run a scan to analyze your project for dead code.</p>
        <button onclick="scan()">Scan Project</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function scan() { vscode.postMessage({ command: 'scan' }); }
    </script>
</body>
</html>`;
    }

    private getDashboardHtml(result: ScanResult, history: ScanHistoryEntry[]): string {
        const items = result.items.filter((i: DeadCodeItem) => !i.ignored);
        const cleanScore = calculateCleanScore(result);
        const fileCount = new Set(items.map((i: DeadCodeItem) => i.filePath)).size;
        const totalLines = items.reduce((sum: number, i: DeadCodeItem) => sum + (i.endLine - i.line + 1), 0);

        const byType = groupBy(items, (i: DeadCodeItem) => i.type);
        const byLanguage = groupBy(items, (i: DeadCodeItem) => i.language);
        const byFile = groupBy(items, (i: DeadCodeItem) => i.filePath);

        const topFiles = [...byFile.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 10);

        const maxFileCount = topFiles.length > 0 ? topFiles[0][1].length : 1;

        const scoreColor = cleanScore >= 80 ? '#27ae60' : cleanScore >= 50 ? '#f39c12' : '#e74c3c';
        const circumference = 2 * Math.PI * 70;
        const dashOffset = circumference - (cleanScore / 100) * circumference;

        const typeLabels = JSON.stringify([...byType.keys()]);
        const typeData = JSON.stringify([...byType.values()].map(v => v.length));
        const langLabels = JSON.stringify([...byLanguage.keys()]);
        const langData = JSON.stringify([...byLanguage.values()].map(v => v.length));
        const historyLabels = JSON.stringify(history.map(h => new Date(h.timestamp).toLocaleDateString()));
        const historyData = JSON.stringify(history.map(h => h.deadCount));
        const historyScores = JSON.stringify(history.map(h => h.cleanScore));

        const topFilesHtml = topFiles.map(([filePath, fileItems], idx) => {
            const pct = (fileItems.length / maxFileCount) * 100;
            return `<div class="file-row">
                <span class="rank">${idx + 1}</span>
                <div style="flex:1">
                    <div class="name">${escapeHtml(relativePath(filePath))}</div>
                    <div class="bar" style="width:${pct}%"></div>
                </div>
                <span class="count-badge">${fileItems.length}</span>
            </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeadSweep Dashboard</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0; margin: 0; }
        .dashboard { max-width: 1100px; margin: 0 auto; padding: 24px; }
        .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--vscode-panel-border); }
        .dashboard-header h1 { font-size: 28px; margin: 0; }
        .actions { display: flex; gap: 8px; }
        .actions button { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; background: #C0392B; color: white; }
        .actions button:hover { background: #A93226; }
        .actions button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }

        .score-section { text-align: center; margin: 24px 0; }
        .score-ring { width: 160px; height: 160px; position: relative; display: inline-block; margin-bottom: 8px; }
        .score-ring svg { transform: rotate(-90deg); }
        .score-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: bold; }
        .score-label { font-size: 16px; color: var(--vscode-descriptionForeground); }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 24px 0; }
        .stat-card { background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; text-align: center; }
        .stat-card .value { font-size: 32px; font-weight: bold; color: #C0392B; }
        .stat-card .label { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
        .chart-card { background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; }
        .chart-card h3 { font-size: 15px; margin: 0 0 12px 0; color: #C0392B; }
        .chart-container { position: relative; height: 250px; }

        .section { margin: 24px 0; }
        .section h3 { font-size: 15px; margin-bottom: 12px; color: #C0392B; }

        .file-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
        .file-row:hover { background: var(--vscode-list-hoverBackground); }
        .file-row .rank { font-size: 14px; font-weight: bold; color: #C0392B; width: 24px; text-align: center; }
        .file-row .name { font-size: 13px; }
        .file-row .count-badge { background: #C0392B; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
        .file-row .bar { height: 4px; background: #C0392B; border-radius: 2px; margin-top: 4px; }

        @media (max-width: 700px) { .charts-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="dashboard-header">
            <h1>🧹 DeadSweep Dashboard</h1>
            <div class="actions">
                <button onclick="runScan()">Scan Project</button>
                <button class="secondary" onclick="exportReport()">Export Report</button>
                <button class="secondary" onclick="copyBadge()">Copy Badge</button>
            </div>
        </div>

        <div class="score-section">
            <div class="score-ring">
                <svg width="160" height="160">
                    <circle cx="80" cy="80" r="70" stroke="var(--vscode-panel-border)" stroke-width="10" fill="none"/>
                    <circle cx="80" cy="80" r="70" stroke="${scoreColor}" stroke-width="10" fill="none"
                        stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                        stroke-linecap="round" style="transition: stroke-dashoffset 1s ease;"/>
                </svg>
                <div class="score-text" style="color: ${scoreColor}">${cleanScore}%</div>
            </div>
            <div class="score-label">Clean Score</div>
        </div>

        <div class="stats-grid">
            <div class="stat-card"><div class="value">${items.length}</div><div class="label">Dead Items</div></div>
            <div class="stat-card"><div class="value">${fileCount}</div><div class="label">Affected Files</div></div>
            <div class="stat-card"><div class="value">${totalLines}</div><div class="label">Dead Lines</div></div>
            <div class="stat-card"><div class="value">${result.scannedFiles}</div><div class="label">Scanned Files</div></div>
            <div class="stat-card"><div class="value">${result.scanDuration}ms</div><div class="label">Scan Time</div></div>
        </div>

        <div class="charts-grid">
            <div class="chart-card">
                <h3>By Type</h3>
                <div class="chart-container"><canvas id="typeChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h3>By Language</h3>
                <div class="chart-container"><canvas id="langChart"></canvas></div>
            </div>
        </div>

        <div class="chart-card" style="margin: 24px 0;">
            <h3>Trend Over Time</h3>
            <div class="chart-container"><canvas id="trendChart"></canvas></div>
        </div>

        <div class="section">
            <h3>Top 10 Files with Most Dead Code</h3>
            ${topFilesHtml || '<p style="color:var(--vscode-descriptionForeground)">No files with dead code.</p>'}
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();
        function runScan() { vscode.postMessage({ command: 'scan' }); }
        function exportReport() { vscode.postMessage({ command: 'exportReport' }); }
        function copyBadge() { vscode.postMessage({ command: 'copyBadge' }); }

        const chartColors = ['#C0392B', '#E74C3C', '#F39C12', '#27AE60', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#2ECC71', '#34495E'];

        function initCharts() {
            if (typeof Chart === 'undefined') { return; }

            const typeCtx = document.getElementById('typeChart');
            if (typeCtx) {
                new Chart(typeCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ${typeLabels},
                        datasets: [{ data: ${typeData}, backgroundColor: chartColors }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc' } } }
                    }
                });
            }

            const langCtx = document.getElementById('langChart');
            if (langCtx) {
                new Chart(langCtx, {
                    type: 'pie',
                    data: {
                        labels: ${langLabels},
                        datasets: [{ data: ${langData}, backgroundColor: chartColors }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc' } } }
                    }
                });
            }

            const trendCtx = document.getElementById('trendChart');
            if (trendCtx) {
                new Chart(trendCtx, {
                    type: 'line',
                    data: {
                        labels: ${historyLabels},
                        datasets: [
                            {
                                label: 'Dead Items',
                                data: ${historyData},
                                borderColor: '#C0392B', backgroundColor: 'rgba(192,57,43,0.1)',
                                fill: true, tension: 0.4
                            },
                            {
                                label: 'Clean Score',
                                data: ${historyScores},
                                borderColor: '#27AE60', backgroundColor: 'rgba(39,174,96,0.1)',
                                fill: true, tension: 0.4, yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, ticks: { color: '#aaa' }, grid: { color: '#333' } },
                            y1: { position: 'right', min: 0, max: 100, ticks: { color: '#aaa' }, grid: { display: false } },
                            x: { ticks: { color: '#aaa' }, grid: { color: '#333' } }
                        },
                        plugins: { legend: { labels: { color: '#ccc' } } }
                    }
                });
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initCharts, 200));
        } else {
            setTimeout(initCharts, 200);
        }
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
