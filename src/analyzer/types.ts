export enum DeadCodeType {
    Variable = 'variable',
    Function = 'function',
    Class = 'class',
    Interface = 'interface',
    TypeAlias = 'type',
    Enum = 'enum',
    Import = 'import',
    Export = 'export',
    CssClass = 'css-class',
    Component = 'component',
}

export interface DeadCodeItem {
    name: string;
    type: DeadCodeType;
    filePath: string;
    line: number;
    endLine: number;
    column: number;
    confidence: number;
    language: string;
    message: string;
    fullText: string;
    ignored?: boolean;
}

export interface AnalysisResult {
    items: DeadCodeItem[];
    language: string;
}

export interface ScanResult {
    items: DeadCodeItem[];
    scannedFiles: number;
    scanDuration: number;
    timestamp: number;
}
