import * as vscode from 'vscode';
import { ScanResult } from '../analyzer/index';
import { calculateCleanScore } from './htmlReport';
import * as logger from '../utils/logger';

export function generateBadgeUrl(scanResult: ScanResult): string {
    const deadCount = scanResult.items.filter(i => !i.ignored).length;
    const cleanScore = calculateCleanScore(scanResult);

    let color: string;
    if (cleanScore >= 90) {
        color = 'brightgreen';
    } else if (cleanScore >= 70) {
        color = 'green';
    } else if (cleanScore >= 50) {
        color = 'yellow';
    } else if (cleanScore >= 30) {
        color = 'orange';
    } else {
        color = 'red';
    }

    const label = encodeURIComponent('dead code');
    const message = encodeURIComponent(`${deadCount} items · ${cleanScore}%`);
    return `https://img.shields.io/badge/${label}-${message}-${color}`;
}

export function generateBadgeMarkdown(scanResult: ScanResult): string {
    const url = generateBadgeUrl(scanResult);
    return `![DeadSweep](${url})`;
}

export async function copyBadgeToClipboard(scanResult: ScanResult): Promise<void> {
    const markdown = generateBadgeMarkdown(scanResult);
    await vscode.env.clipboard.writeText(markdown);
    vscode.window.showInformationMessage('Badge markdown copied to clipboard!');
    logger.info(`Badge copied: ${markdown}`);
}

export function generateBadgeSvg(scanResult: ScanResult): string {
    const deadCount = scanResult.items.filter(i => !i.ignored).length;
    const cleanScore = calculateCleanScore(scanResult);

    let color: string;
    if (cleanScore >= 90) { color = '#4c1'; }
    else if (cleanScore >= 70) { color = '#97CA00'; }
    else if (cleanScore >= 50) { color = '#dfb317'; }
    else if (cleanScore >= 30) { color = '#fe7d37'; }
    else { color = '#e05d44'; }

    const label = 'dead code';
    const value = `${deadCount} items`;
    const labelWidth = label.length * 7 + 10;
    const valueWidth = value.length * 7 + 10;
    const totalWidth = labelWidth + valueWidth;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="a" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="${totalWidth}" height="20" fill="#555"/>
  <rect rx="3" x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  <rect rx="3" width="${totalWidth}" height="20" fill="url(#a)"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}
