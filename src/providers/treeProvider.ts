import * as vscode from 'vscode';
import * as path from 'path';
import { DeadCodeItem, DeadCodeType, ScanResult, onScanComplete } from '../analyzer/index';
import { relativePath, groupBy, formatCount } from '../utils/helpers';

type TreeElement = FileNode | TypeGroupNode | DeadCodeNode;

class FileNode {
    constructor(
        public readonly filePath: string,
        public readonly items: DeadCodeItem[]
    ) {}

    get label(): string {
        return relativePath(this.filePath);
    }

    get count(): number {
        return this.items.filter(i => !i.ignored).length;
    }
}

class TypeGroupNode {
    constructor(
        public readonly type: DeadCodeType,
        public readonly items: DeadCodeItem[],
        public readonly filePath: string
    ) {}

    get label(): string {
        return this.typeLabel(this.type);
    }

    get count(): number {
        return this.items.filter(i => !i.ignored).length;
    }

    private typeLabel(type: DeadCodeType): string {
        const labels: Record<string, string> = {
            [DeadCodeType.Variable]: 'Variables',
            [DeadCodeType.Function]: 'Functions',
            [DeadCodeType.Class]: 'Classes',
            [DeadCodeType.Interface]: 'Interfaces',
            [DeadCodeType.TypeAlias]: 'Types',
            [DeadCodeType.Enum]: 'Enums',
            [DeadCodeType.Import]: 'Imports',
            [DeadCodeType.Export]: 'Exports',
            [DeadCodeType.CssClass]: 'CSS Selectors',
            [DeadCodeType.Component]: 'Components',
        };
        return labels[type] || type;
    }
}

class DeadCodeNode {
    constructor(public readonly item: DeadCodeItem) {}

    get label(): string {
        return this.item.name;
    }
}

export class DeadCodeTreeProvider implements vscode.TreeDataProvider<TreeElement> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private items: DeadCodeItem[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.disposables.push(
            onScanComplete((result: ScanResult) => {
                this.items = result.items.filter(i => !i.ignored);
                this._onDidChangeTreeData.fire();
            })
        );
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeElement): vscode.TreeItem {
        if (element instanceof FileNode) {
            return this.createFileTreeItem(element);
        }
        if (element instanceof TypeGroupNode) {
            return this.createTypeGroupTreeItem(element);
        }
        if (element instanceof DeadCodeNode) {
            return this.createDeadCodeTreeItem(element);
        }
        return new vscode.TreeItem('Unknown');
    }

    getChildren(element?: TreeElement): TreeElement[] {
        if (!element) {
            return this.getFileNodes();
        }
        if (element instanceof FileNode) {
            return this.getTypeGroupNodes(element);
        }
        if (element instanceof TypeGroupNode) {
            return this.getDeadCodeNodes(element);
        }
        return [];
    }

    getParent(element: TreeElement): TreeElement | undefined {
        if (element instanceof DeadCodeNode) {
            const item = element.item;
            const fileNode = this.getFileNodes().find(fn => fn.filePath === item.filePath);
            if (fileNode) {
                return this.getTypeGroupNodes(fileNode).find(tg => tg.type === item.type);
            }
        }
        if (element instanceof TypeGroupNode) {
            return this.getFileNodes().find(fn => fn.filePath === element.filePath);
        }
        return undefined;
    }

    getTotalCount(): number {
        return this.items.filter(i => !i.ignored).length;
    }

    getItemForNode(node: TreeElement): DeadCodeItem | undefined {
        if (node instanceof DeadCodeNode) {
            return node.item;
        }
        return undefined;
    }

    private getFileNodes(): FileNode[] {
        const activeItems = this.items.filter(i => !i.ignored);
        const grouped = groupBy(activeItems, item => item.filePath);
        const nodes: FileNode[] = [];

        for (const [filePath, items] of grouped) {
            nodes.push(new FileNode(filePath, items));
        }

        return nodes.sort((a, b) => b.count - a.count);
    }

    private getTypeGroupNodes(fileNode: FileNode): TypeGroupNode[] {
        const activeItems = fileNode.items.filter(i => !i.ignored);
        const grouped = groupBy(activeItems, item => item.type);
        const nodes: TypeGroupNode[] = [];

        for (const [type, items] of grouped) {
            nodes.push(new TypeGroupNode(type, items, fileNode.filePath));
        }

        return nodes.sort((a, b) => a.label.localeCompare(b.label));
    }

    private getDeadCodeNodes(typeGroup: TypeGroupNode): DeadCodeNode[] {
        return typeGroup.items
            .filter(i => !i.ignored)
            .sort((a, b) => a.line - b.line)
            .map(item => new DeadCodeNode(item));
    }

    private createFileTreeItem(node: FileNode): vscode.TreeItem {
        const item = new vscode.TreeItem(
            node.label,
            vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = `${node.count} item${node.count !== 1 ? 's' : ''}`;
        item.iconPath = vscode.ThemeIcon.File;
        item.resourceUri = vscode.Uri.file(node.filePath);
        item.tooltip = `${node.filePath}\n${node.count} dead code item${node.count !== 1 ? 's' : ''}`;
        return item;
    }

    private createTypeGroupTreeItem(node: TypeGroupNode): vscode.TreeItem {
        const item = new vscode.TreeItem(
            node.label,
            vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = `${node.count}`;
        item.iconPath = this.getTypeIcon(node.type);
        item.tooltip = `${node.count} unused ${node.label.toLowerCase()}`;
        return item;
    }

    private createDeadCodeTreeItem(node: DeadCodeNode): vscode.TreeItem {
        const deadItem = node.item;
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.description = `Line ${deadItem.line} · ${deadItem.confidence}%`;
        item.iconPath = this.getTypeIcon(deadItem.type);
        item.tooltip = new vscode.MarkdownString(
            `**${deadItem.name}** (${deadItem.type})\n\n` +
            `${deadItem.message}\n\n` +
            `📄 ${relativePath(deadItem.filePath)}:${deadItem.line}\n\n` +
            `🎯 Confidence: ${deadItem.confidence}%\n\n` +
            `\`\`\`\n${deadItem.fullText}\n\`\`\``
        );
        item.command = {
            command: 'deadsweep.jumpToItem',
            title: 'Jump to Definition',
            arguments: [deadItem],
        };
        item.contextValue = 'deadCodeItem';
        return item;
    }

    private getTypeIcon(type: DeadCodeType): vscode.ThemeIcon {
        const icons: Record<string, string> = {
            [DeadCodeType.Variable]: 'symbol-variable',
            [DeadCodeType.Function]: 'symbol-method',
            [DeadCodeType.Class]: 'symbol-class',
            [DeadCodeType.Interface]: 'symbol-interface',
            [DeadCodeType.TypeAlias]: 'symbol-type-parameter',
            [DeadCodeType.Enum]: 'symbol-enum',
            [DeadCodeType.Import]: 'package',
            [DeadCodeType.Export]: 'export',
            [DeadCodeType.CssClass]: 'paintcan',
            [DeadCodeType.Component]: 'extensions',
        };
        return new vscode.ThemeIcon(icons[type] || 'circle-outline');
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
