import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { SolidViolation, AnalysisThresholds } from './types.js';

/**
 * Cyclomatic complexity checker.
 * Counts branching statements per file as a proxy for complexity.
 * Files with high complexity are harder to test, understand, and maintain.
 */

// Count branching keywords per file
const BRANCH_KEYWORDS = /\b(if|else|for|while|do|switch|case|catch)\b/g;
const TERNARY = /\?[^?.:\s]/g;
const LOGICAL_OPS = /(&&|\|\|)/g;

export interface FileComplexity {
  filePath: string;
  complexity: number;
  lineCount: number;
  complexityDensity: number; // complexity per 100 lines
}

export async function checkComplexity(
  sourceFiles: string[],
  projectRoot: string,
  thresholds: AnalysisThresholds,
): Promise<{ violations: SolidViolation[]; fileComplexities: FileComplexity[] }> {
  const violations: SolidViolation[] = [];
  const fileComplexities: FileComplexity[] = [];

  const maxComplexity = thresholds.maxFileComplexity ?? 20;
  const maxDensity = thresholds.maxComplexityDensity ?? 15;

  const BATCH = 50;
  for (let i = 0; i < sourceFiles.length; i += BATCH) {
    const batch = sourceFiles.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => analyzeFileComplexity(f)));

    for (const result of results) {
      if (!result) continue;
      fileComplexities.push(result);

      const relative = result.filePath.replace(projectRoot + '/', '');

      if (result.complexity > maxComplexity) {
        violations.push({
          principle: 'SRP',
          severity: result.complexity > maxComplexity * 2 ? 'error' : 'warning',
          file: relative,
          message: `Cyclomatic complexity ${result.complexity} (threshold: ${maxComplexity})`,
          suggestion: 'Break complex logic into smaller functions with single responsibilities',
        });
      }

      if (result.lineCount >= 50 && result.complexityDensity > maxDensity) {
        violations.push({
          principle: 'SRP',
          severity: result.complexityDensity > maxDensity * 2 ? 'error' : 'warning',
          file: relative,
          message: `Complexity density ${result.complexityDensity.toFixed(1)} per 100 lines (threshold: ${maxDensity})`,
          suggestion: 'High density of branching logic — consider extracting helper functions',
        });
      }
    }
  }

  return { violations, fileComplexities };
}

async function analyzeFileComplexity(filePath: string): Promise<FileComplexity | null> {
  try {
    let complexity = 1; // base path
    let lineCount = 0;
    let inBlockComment = false;

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      lineCount++;
      let trimmed = line.trim();

      // Skip block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
          trimmed = trimmed.substring(trimmed.indexOf('*/') + 2).trim();
        } else {
          continue;
        }
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) {
          inBlockComment = true;
          continue;
        }
        trimmed = trimmed.substring(trimmed.indexOf('*/') + 2).trim();
      }

      // Skip single-line comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') continue;
      // Skip import/export declarations (not logic)
      if (trimmed.startsWith('import ') || trimmed.startsWith('export type ') || trimmed.startsWith('export interface ')) continue;

      // Count branching keywords
      const keywordMatches = trimmed.match(BRANCH_KEYWORDS);
      if (keywordMatches) complexity += keywordMatches.length;

      // Count ternary operators
      const ternaryMatches = trimmed.match(TERNARY);
      if (ternaryMatches) complexity += ternaryMatches.length;

      // Count logical operators (each one is an additional path)
      const logicalMatches = trimmed.match(LOGICAL_OPS);
      if (logicalMatches) complexity += logicalMatches.length;
    }

    const complexityDensity = lineCount > 0 ? (complexity / lineCount) * 100 : 0;

    return { filePath, complexity, lineCount, complexityDensity };
  } catch {
    return null;
  }
}
