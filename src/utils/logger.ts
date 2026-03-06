import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('DeadSweep');

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

let currentLevel = LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

function formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
}

export function debug(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.Debug) {
        const formatted = formatMessage('DEBUG', message);
        outputChannel.appendLine(formatted);
        if (args.length > 0) {
            outputChannel.appendLine(`  Data: ${JSON.stringify(args, null, 2)}`);
        }
    }
}

export function info(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.Info) {
        const formatted = formatMessage('INFO', message);
        outputChannel.appendLine(formatted);
        if (args.length > 0) {
            outputChannel.appendLine(`  Data: ${JSON.stringify(args, null, 2)}`);
        }
    }
}

export function warn(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.Warn) {
        const formatted = formatMessage('WARN', message);
        outputChannel.appendLine(formatted);
        if (args.length > 0) {
            outputChannel.appendLine(`  Data: ${JSON.stringify(args, null, 2)}`);
        }
    }
}

export function error(message: string, err?: Error | unknown): void {
    if (currentLevel <= LogLevel.Error) {
        const formatted = formatMessage('ERROR', message);
        outputChannel.appendLine(formatted);
        if (err instanceof Error) {
            outputChannel.appendLine(`  Stack: ${err.stack}`);
        } else if (err !== undefined) {
            outputChannel.appendLine(`  Detail: ${JSON.stringify(err)}`);
        }
    }
}

export function show(): void {
    outputChannel.show(true);
}

export function dispose(): void {
    outputChannel.dispose();
}
