import type { GitCommit } from './git-history.js';

/**
 * Temporal coupling detector.
 *
 * Finds files that frequently change together in the same commits but
 * aren't structurally connected (not in the same module, no import relationship).
 * These reveal hidden dependencies — often from copy-paste patterns where
 * AI agents duplicate logic that should be shared.
 */

export interface TemporalCoupling {
  fileA: string;
  fileB: string;
  coChangeCount: number;      // commits where both files changed
  totalChangesA: number;      // total commits changing fileA
  totalChangesB: number;      // total commits changing fileB
  couplingStrength: number;   // coChangeCount / min(totalA, totalB) — 0 to 1
}

export function findTemporalCoupling(
  commits: GitCommit[],
  minCoChanges = 3,
  minStrength = 0.5,
  srcFilter?: string,
): TemporalCoupling[] {
  // Count per-file changes
  const fileChangeCounts = new Map<string, number>();
  // Count co-changes between file pairs
  const coChangeCounts = new Map<string, number>();

  for (const commit of commits) {
    // Skip merge commits (they inflate co-change counts)
    if (commit.files.length > 30) continue;

    const sourceFiles = commit.files
      .map(f => f.file)
      .filter(f => isRelevantFile(f, srcFilter));

    // Update per-file counts
    for (const file of sourceFiles) {
      fileChangeCounts.set(file, (fileChangeCounts.get(file) ?? 0) + 1);
    }

    // Update pair counts — only for commits with 2+ source files
    if (sourceFiles.length < 2 || sourceFiles.length > 20) continue;

    for (let i = 0; i < sourceFiles.length; i++) {
      for (let j = i + 1; j < sourceFiles.length; j++) {
        const key = pairKey(sourceFiles[i], sourceFiles[j]);
        coChangeCounts.set(key, (coChangeCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // Find significant couplings
  const couplings: TemporalCoupling[] = [];

  for (const [key, coChangeCount] of coChangeCounts) {
    if (coChangeCount < minCoChanges) continue;

    const [fileA, fileB] = key.split('::');
    const totalA = fileChangeCounts.get(fileA) ?? 0;
    const totalB = fileChangeCounts.get(fileB) ?? 0;

    // Skip if files are in the same module directory
    if (sameModule(fileA, fileB)) continue;

    const strength = coChangeCount / Math.min(totalA, totalB);
    if (strength < minStrength) continue;

    couplings.push({
      fileA,
      fileB,
      coChangeCount,
      totalChangesA: totalA,
      totalChangesB: totalB,
      couplingStrength: Math.round(strength * 100) / 100,
    });
  }

  couplings.sort((a, b) => b.couplingStrength - a.couplingStrength);
  return couplings;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function sameModule(a: string, b: string): boolean {
  // Extract module from path like src/analyzers/foo.ts → analyzers
  const modA = extractModule(a);
  const modB = extractModule(b);
  return modA === modB;
}

function extractModule(filePath: string): string {
  const parts = filePath.split('/');
  // Look for src/ prefix
  const srcIdx = parts.indexOf('src');
  if (srcIdx >= 0 && srcIdx + 1 < parts.length) {
    return parts[srcIdx + 1];
  }
  // Fallback: first directory
  return parts[0];
}

function isRelevantFile(file: string, srcFilter?: string): boolean {
  if (srcFilter && !file.startsWith(srcFilter)) return false;
  if (file.includes('node_modules/') || file.includes('dist/')) return false;
  if (file.endsWith('.lock') || file.endsWith('.json') || file.endsWith('.md')) return false;
  if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) return false;
  return /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/.test(file);
}
