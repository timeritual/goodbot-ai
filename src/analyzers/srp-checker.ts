import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { FileImports, SolidViolation, AnalysisThresholds } from './types.js';

/**
 * Single Responsibility Principle checker.
 * Detects: oversized files, mixed concerns (importing from distant layers).
 */
export async function checkSRP(
  fileImports: FileImports[],
  sourceFiles: string[],
  projectRoot: string,
  thresholds: AnalysisThresholds,
): Promise<SolidViolation[]> {
  const violations: SolidViolation[] = [];

  // 1. File size check — files over threshold lines
  const lineCounts = await countFileLines(sourceFiles);
  for (const [filePath, lineCount] of lineCounts) {
    if (lineCount > thresholds.maxFileLines) {
      const relative = filePath.replace(projectRoot + '/', '');
      violations.push({
        principle: 'SRP',
        severity: lineCount > thresholds.maxFileLines * 2 ? 'error' : 'warning',
        file: relative,
        message: `File has ${lineCount} lines (threshold: ${thresholds.maxFileLines})`,
        suggestion: 'Split into smaller, focused modules with single responsibilities',
      });
    }
  }

  // 2. Mixed concerns — files importing from 4+ different modules
  for (const fi of fileImports) {
    const targetModules = new Set<string>();
    for (const imp of fi.imports) {
      const target = imp.targetModule;
      if (target && target !== fi.moduleName && target !== '_root') {
        targetModules.add(target);
      }
    }

    if (targetModules.size >= 4) {
      violations.push({
        principle: 'SRP',
        severity: targetModules.size >= 6 ? 'error' : 'warning',
        file: fi.filePath,
        message: `Imports from ${targetModules.size} different modules: ${Array.from(targetModules).join(', ')}`,
        suggestion: 'A file depending on many modules may have mixed responsibilities. Consider splitting.',
      });
    }
  }

  return violations;
}

async function countFileLines(files: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Process in batches
  const BATCH = 50;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filePath) => {
        let count = 0;
        const rl = createInterface({
          input: createReadStream(filePath, { encoding: 'utf-8' }),
          crlfDelay: Infinity,
        });
        for await (const _ of rl) {
          count++;
        }
        results.set(filePath, count);
      }),
    );
  }

  return results;
}
