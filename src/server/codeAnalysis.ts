import crypto from 'node:crypto';
import type { CodeAnalysisReport } from '../types/veritas.ts';

const CODE_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch',
  'case', 'break', 'continue', 'import', 'export', 'from', 'class', 'interface', 'type',
  'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'def', 'elif', 'except',
  'lambda', 'with', 'yield', 'pass', 'struct', 'impl', 'fn', 'pub', 'match', 'enum',
  'public', 'private', 'protected', 'static', 'void', 'int', 'string', 'boolean', 'select',
  'where', 'join', 'group', 'order', 'insert', 'update', 'delete',
]);

export function detectCodeLanguage(code: string, provided?: string): string {
  if (provided && provided !== 'auto') return provided;
  if (/\b(interface|type)\s+\w+.*[:{]|:\s*(string|number|boolean|Promise<)/m.test(code)) return 'TypeScript';
  if (/\bdef\s+\w+\s*\(.*\):|\bimport\s+\w+\s+as\s+\w+/m.test(code)) return 'Python';
  if (/\bfn\s+\w+\s*\(.*\)\s*(?:->|\{)|\blet\s+mut\s+/m.test(code)) return 'Rust';
  if (/\bfunc\s+\w+\s*\(.*\)\s*(?:\(|{|\w+)/m.test(code) && /\bpackage\s+\w+/m.test(code)) return 'Go';
  if (/\bSELECT\b[\s\S]*\bFROM\b|\bCREATE\s+TABLE\b/i.test(code)) return 'SQL';
  if (/\bpublic\s+class\s+\w+|System\.out\.println/m.test(code)) return 'Java';
  return 'JavaScript';
}

export function normalizeAstTokenStream(code: string): string[] {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/#.*$/gm, ' ')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ' STR_LIT ');

  const rawTokens = withoutComments.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|[{}()[\];.,:+\-*/=<>!&|]+/g) || [];
  const identMap = new Map<string, string>();
  let identIdx = 0;

  return rawTokens.map((tok) => {
    if (tok === 'STR_LIT') return '$STR';
    if (/^\d/.test(tok)) return '$NUM';
    if (/^[A-Za-z_]\w*$/.test(tok)) {
      const lower = tok.toLowerCase();
      if (CODE_KEYWORDS.has(lower)) return lower;
      if (!identMap.has(tok)) {
        identMap.set(tok, `ID_${identIdx++}`);
      }
      return identMap.get(tok)!;
    }
    return tok;
  });
}

export function computeAstFingerprint(tokens: string[]): string {
  return crypto.createHash('sha256').update(tokens.join(' ')).digest('hex').slice(0, 16);
}

export function computeCyclomaticComplexity(code: string): number {
  const branches =
    code.match(/\b(if|else\s+if|elif|for|while|case|catch|&&|\|\||\?)\b/g) || [];
  return 1 + branches.length;
}

export function scanSpdxLicenseRisks(code: string): CodeAnalysisReport['spdxLicenseRisks'] {
  const risks: CodeAnalysisReport['spdxLicenseRisks'] = [];
  if (/\bAGPL/i.test(code)) {
    risks.push({
      licenseId: 'AGPL-3.0',
      severity: 'High',
      detail: 'Network copyleft AGPL license marker detected; requires SaaS network users access to full source.',
    });
  } else if (/\bGPL-3\.0|GNU General Public License/i.test(code)) {
    risks.push({
      licenseId: 'GPL-3.0',
      severity: 'High',
      detail: 'Strong copyleft GPL-3.0 header detected; incompatible with proprietary or permissive MIT distribution without source disclosure.',
    });
  } else if (/Apache-2\.0|Apache License/i.test(code)) {
    risks.push({
      licenseId: 'Apache-2.0',
      severity: 'Info',
      detail: 'Permissive Apache-2.0 header with patent grant and NOTICE attribution requirements.',
    });
  } else if (/SPDX-License-Identifier:\s*MIT|Permission is hereby granted, free of charge/i.test(code)) {
    risks.push({
      licenseId: 'MIT',
      severity: 'Info',
      detail: 'Permissive MIT license header identified.',
    });
  }

  if (/copyright\s+(?:\(c\)\s*)?\d{4}/i.test(code) && risks.length === 0) {
    risks.push({
      licenseId: 'Proprietary / Copyrighted',
      severity: 'Warning',
      detail: 'Explicit copyright notice detected without a permissive SPDX identifier.',
    });
  }
  return risks;
}

export function compareCodeCorpusOverlap(
  tokens: string[],
  existingReports: { id: string; title: string; normalizedTokens?: string[] }[]
): CodeAnalysisReport['codeOverlapMatches'] {
  const window = 8;
  if (tokens.length < window) return [];

  const targetShingles = new Set<string>();
  for (let i = 0; i <= tokens.length - window; i++) {
    targetShingles.add(tokens.slice(i, i + window).join(' '));
  }

  const matches: CodeAnalysisReport['codeOverlapMatches'] = [];
  for (const prev of existingReports) {
    if (!prev.normalizedTokens || prev.normalizedTokens.length < window) continue;
    const prevSet = new Set<string>();
    for (let i = 0; i <= prev.normalizedTokens.length - window; i++) {
      prevSet.add(prev.normalizedTokens.slice(i, i + window).join(' '));
    }
    let overlap = 0;
    for (const sh of targetShingles) {
      if (prevSet.has(sh)) overlap += 1;
    }
    const sim = Math.round(((overlap / Math.max(1, targetShingles.size)) * 100) * 10) / 10;
    if (sim >= 8) {
      matches.push({
        sourceId: prev.id,
        sourceTitle: prev.title,
        structuralSimilarityPercent: sim,
      });
    }
  }
  return matches.sort((a, b) => b.structuralSimilarityPercent - a.structuralSimilarityPercent).slice(0, 5);
}

export function analyzeDeterministicCodeIdioms(code: string): string[] {
  const findings: string[] = [];
  const lines = code.split('\n');
  const commentLines = lines.filter((l) => /^\s*(?:\/\/|#|\*)/.test(l)).length;
  const commentRatio = commentLines / Math.max(1, lines.length);

  if (commentRatio > 0.24) {
    findings.push(`Elevated instructional comment density (${Math.round(commentRatio * 100)}% of lines), common in assistant-generated tutorials.`);
  }
  if (/\/\/\s*(?:Step \d+|Example usage|Helper function|Initialize|Handle edge case)/i.test(code)) {
    findings.push('Template scaffold comments ("Step N", "Example usage", "Helper function") detected.');
  }
  if (/TODO:\s*replace|placeholder|your_api_key_here/i.test(code)) {
    findings.push('Contains boilerplate placeholder tokens typical of prompt-synthesized snippets.');
  }
  if (findings.length === 0) {
    findings.push('No obvious template comment scaffolds; relies on semantic inspection for assistant attribution.');
  }
  return findings;
}
