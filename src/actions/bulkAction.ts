import * as vscode from 'vscode';
import { DeadCodeItem, DeadCodeType, getLastScanResult } from '../analyzer/index';
import { deleteMultipleItems } from './deleteAction';
import { relativePath, escapeHtml } from '../utils/helpers';
import * as logger from '../utils/logger';

export class BulkCleanupWizard {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async show(): Promise<void> {
        const scanResult = getLastScanResult();
        if (!scanResult || scanResult.items.length === 0) {
            vscode.window.showInformationMessage('No dead code found. Run a scan first.');
            return;
        }

        const activeItems = scanResult.items.filter(i => !i.ignored);
        if (activeItems.length === 0) {
            vscode.window.showInformationMessage('No actionable dead code items.');
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'deadsweepWizard',
            'DeadSweep: Cleanup Wizard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.iconPath = vscode.Uri.parse('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="14" font-size="14">🧹</text></svg>');
        this.panel.webview.html = this.getWizardHtml(activeItems);

        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'deleteSelected': {
                    const selectedItems: DeadCodeItem[] = message.items;
                    if (selectedItems.length === 0) {
                        vscode.window.showWarningMessage('No items selected for deletion.');
                        return;
                    }

                    const confirm = await vscode.window.showWarningMessage(
                        `Delete ${selectedItems.length} dead code item${selectedItems.length !== 1 ? 's' : ''}?`,
                        { modal: true },
                        'Delete'
                    );

                    if (confirm === 'Delete') {
                        const result = await deleteMultipleItems(selectedItems);
                        this.panel?.webview.postMessage({
                            command: 'deleteResult',
                            success: result.success,
                            failed: result.failed,
                        });
                        vscode.window.showInformationMessage(
                            `Deleted ${result.success} items${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                        );
                    }
                    break;
                }
                case 'close': {
                    this.panel?.dispose();
                    break;
                }
            }
        }, undefined, this.context.subscriptions);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private getWizardHtml(items: DeadCodeItem[]): string {
        const itemsJson = JSON.stringify(items.map(item => ({
            name: escapeHtml(item.name),
            type: item.type,
            filePath: item.filePath,
            relativePath: escapeHtml(relativePath(item.filePath)),
            line: item.line,
            endLine: item.endLine,
            confidence: item.confidence,
            language: item.language,
            message: escapeHtml(item.message),
            fullText: escapeHtml(item.fullText.substring(0, 300)),
        })));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeadSweep Cleanup Wizard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
        .wizard-container { max-width: 900px; margin: 0 auto; padding: 24px; }
        .wizard-header {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 24px; padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .wizard-header h1 { font-size: 24px; margin: 0; }
        .wizard-header .subtitle { color: var(--vscode-descriptionForeground); font-size: 14px; }

        .step-indicator {
            display: flex; gap: 8px; margin-bottom: 24px;
        }
        .step {
            padding: 8px 16px; border-radius: 4px; font-size: 13px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: pointer;
        }
        .step.active {
            background: #C0392B; color: white;
        }
        .step.completed { background: var(--vscode-testing-iconPassed); color: white; }

        .summary-cards {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px; margin-bottom: 24px;
        }
        .summary-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px; padding: 16px; text-align: center;
        }
        .summary-card .number { font-size: 32px; font-weight: bold; color: #C0392B; }
        .summary-card .label { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

        .controls {
            display: flex; gap: 8px; margin-bottom: 16px; align-items: center;
        }
        .controls button {
            padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer;
            font-size: 13px;
        }
        .btn-primary { background: #C0392B; color: white; }
        .btn-primary:hover { background: #A93226; }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-danger { background: #E74C3C; color: white; }

        .filter-bar {
            display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .filter-chip {
            padding: 4px 10px; border-radius: 12px; font-size: 12px; cursor: pointer;
            background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
            border: 1px solid transparent;
        }
        .filter-chip.active { border-color: #C0392B; }

        .item-list { list-style: none; padding: 0; margin: 0; }
        .item-row {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border);
            transition: background 0.15s;
        }
        .item-row:hover { background: var(--vscode-list-hoverBackground); }
        .item-row input[type="checkbox"] { flex-shrink: 0; }
        .item-info { flex: 1; min-width: 0; }
        .item-name { font-weight: 600; font-size: 14px; }
        .item-meta {
            font-size: 12px; color: var(--vscode-descriptionForeground);
            display: flex; gap: 8px; margin-top: 2px;
        }
        .confidence-badge {
            display: inline-block; padding: 1px 6px; border-radius: 8px;
            font-size: 11px; font-weight: 600;
        }
        .confidence-high { background: #27ae60; color: white; }
        .confidence-medium { background: #f39c12; color: white; }
        .confidence-low { background: #e74c3c; color: white; }

        .step-content { display: none; }
        .step-content.active { display: block; }

        .action-bar {
            display: flex; justify-content: space-between; align-items: center;
            padding: 16px 0; margin-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .selected-count { font-size: 14px; font-weight: 600; }

        .preview-diff {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px; padding: 12px; margin: 8px 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px; white-space: pre-wrap; overflow-x: auto;
        }
        .diff-remove { color: #E74C3C; text-decoration: line-through; }

        .result-panel {
            text-align: center; padding: 48px; display: none;
        }
        .result-panel .success-icon { font-size: 64px; margin-bottom: 16px; }
        .result-panel h2 { font-size: 24px; margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="wizard-container">
        <div class="wizard-header">
            <div>
                <h1>🧹 Cleanup Wizard</h1>
                <div class="subtitle">Review and remove dead code from your project</div>
            </div>
        </div>

        <div class="step-indicator">
            <div class="step active" data-step="1">1. Review</div>
            <div class="step" data-step="2">2. Select</div>
            <div class="step" data-step="3">3. Preview</div>
            <div class="step" data-step="4">4. Apply</div>
        </div>

        <div id="step1" class="step-content active">
            <div class="summary-cards" id="summaryCards"></div>
            <div class="controls">
                <button class="btn-primary" onclick="goToStep(2)">Next: Select Items →</button>
            </div>
        </div>

        <div id="step2" class="step-content">
            <div class="controls">
                <button class="btn-secondary" onclick="selectAll()">Select All</button>
                <button class="btn-secondary" onclick="selectNone()">Select None</button>
                <button class="btn-secondary" onclick="selectHighConfidence()">Select High Confidence (≥90%)</button>
                <span class="selected-count" id="selectedCount">0 selected</span>
            </div>
            <div class="filter-bar" id="filterBar"></div>
            <ul class="item-list" id="itemList"></ul>
            <div class="action-bar">
                <button class="btn-secondary" onclick="goToStep(1)">← Back</button>
                <button class="btn-primary" onclick="goToStep(3)">Next: Preview →</button>
            </div>
        </div>

        <div id="step3" class="step-content">
            <h3>Preview Changes</h3>
            <p>The following items will be removed:</p>
            <div id="previewList"></div>
            <div class="action-bar">
                <button class="btn-secondary" onclick="goToStep(2)">← Back</button>
                <button class="btn-danger" onclick="applyDeletions()">🗑 Delete Selected Items</button>
            </div>
        </div>

        <div id="step4" class="step-content">
            <div class="result-panel" id="resultPanel">
                <div class="success-icon">✅</div>
                <h2 id="resultTitle">Cleanup Complete!</h2>
                <p id="resultMessage"></p>
                <button class="btn-primary" onclick="closeWizard()">Close</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const items = ${itemsJson};
        let selectedItems = new Set();
        let currentStep = 1;
        let activeFilter = null;

        function init() {
            renderSummary();
            renderItems();
            renderFilters();

            items.forEach((item, idx) => {
                if (item.confidence >= 90) {
                    selectedItems.add(idx);
                }
            });
            updateCheckboxes();
            updateSelectedCount();
        }

        function renderSummary() {
            const types = {};
            const languages = {};
            items.forEach(item => {
                types[item.type] = (types[item.type] || 0) + 1;
                languages[item.language] = (languages[item.language] || 0) + 1;
            });

            let html = '<div class="summary-card"><div class="number">' + items.length + '</div><div class="label">Total Items</div></div>';
            for (const [type, count] of Object.entries(types)) {
                html += '<div class="summary-card"><div class="number">' + count + '</div><div class="label">' + type + '</div></div>';
            }
            document.getElementById('summaryCards').innerHTML = html;
        }

        function renderFilters() {
            const types = [...new Set(items.map(i => i.type))];
            let html = '<div class="filter-chip' + (!activeFilter ? ' active' : '') + '" onclick="setFilter(null)">All</div>';
            types.forEach(type => {
                html += '<div class="filter-chip' + (activeFilter === type ? ' active' : '') + '" onclick="setFilter(\\'' + type + '\\')">' + type + '</div>';
            });
            document.getElementById('filterBar').innerHTML = html;
        }

        function setFilter(type) {
            activeFilter = type;
            renderItems();
            renderFilters();
        }

        function renderItems() {
            const filtered = activeFilter ? items.filter(i => i.type === activeFilter) : items;
            let html = '';
            filtered.forEach((item, idx) => {
                const realIdx = items.indexOf(item);
                const checked = selectedItems.has(realIdx) ? 'checked' : '';
                const confClass = item.confidence >= 90 ? 'confidence-high' : item.confidence >= 60 ? 'confidence-medium' : 'confidence-low';
                html += '<li class="item-row">' +
                    '<input type="checkbox" ' + checked + ' onchange="toggleItem(' + realIdx + ')" />' +
                    '<div class="item-info">' +
                    '<div class="item-name">' + item.name + '</div>' +
                    '<div class="item-meta">' +
                    '<span>' + item.type + '</span>' +
                    '<span>' + item.relativePath + ':' + item.line + '</span>' +
                    '<span class="confidence-badge ' + confClass + '">' + item.confidence + '%</span>' +
                    '</div></div></li>';
            });
            document.getElementById('itemList').innerHTML = html;
        }

        function toggleItem(idx) {
            if (selectedItems.has(idx)) { selectedItems.delete(idx); }
            else { selectedItems.add(idx); }
            updateSelectedCount();
        }

        function selectAll() {
            items.forEach((_, idx) => selectedItems.add(idx));
            renderItems(); updateSelectedCount();
        }

        function selectNone() {
            selectedItems.clear();
            renderItems(); updateSelectedCount();
        }

        function selectHighConfidence() {
            selectedItems.clear();
            items.forEach((item, idx) => { if (item.confidence >= 90) selectedItems.add(idx); });
            renderItems(); updateSelectedCount();
        }

        function updateCheckboxes() {
            document.querySelectorAll('.item-row input[type="checkbox"]').forEach((cb, idx) => {
                cb.checked = selectedItems.has(idx);
            });
        }

        function updateSelectedCount() {
            document.getElementById('selectedCount').textContent = selectedItems.size + ' selected';
        }

        function goToStep(step) {
            document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.step').forEach(el => {
                const s = parseInt(el.dataset.step);
                el.classList.remove('active', 'completed');
                if (s < step) el.classList.add('completed');
                if (s === step) el.classList.add('active');
            });
            document.getElementById('step' + step).classList.add('active');
            currentStep = step;

            if (step === 3) { renderPreview(); }
        }

        function renderPreview() {
            const selected = [...selectedItems].map(idx => items[idx]);
            let html = '';
            selected.forEach(item => {
                html += '<div class="preview-diff"><span class="diff-remove">- ' + item.fullText + '</span></div>';
                html += '<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px;">' +
                    item.relativePath + ':' + item.line + '</div>';
            });
            if (selected.length === 0) {
                html = '<p>No items selected. Go back to select items.</p>';
            }
            document.getElementById('previewList').innerHTML = html;
        }

        function applyDeletions() {
            const selected = [...selectedItems].map(idx => items[idx]);
            vscode.postMessage({ command: 'deleteSelected', items: selected });
            goToStep(4);
        }

        function closeWizard() {
            vscode.postMessage({ command: 'close' });
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'deleteResult') {
                const panel = document.getElementById('resultPanel');
                panel.style.display = 'block';
                document.getElementById('resultTitle').textContent = 'Cleanup Complete!';
                document.getElementById('resultMessage').textContent =
                    msg.success + ' items deleted' + (msg.failed > 0 ? ', ' + msg.failed + ' failed' : '') + '.';
            }
        });

        init();
    </script>
</body>
</html>`;
    }
}
