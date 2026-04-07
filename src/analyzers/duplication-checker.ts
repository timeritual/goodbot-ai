import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import type { SolidViolation } from './types.js';

/**
 * Code duplication detector.
 *
 * Uses a sliding-window fingerprinting approach: normalize each source line
 * (strip whitespace, string literals, and variable names), then hash
 * consecutive windows of N lines. When two files share the same hash,
 * they contain a duplicated block.
 *
 * This catches copy-paste duplication common in AI-generated code, where
 * agents produce similar logic blocks in multiple locations rather than
 * extracting shared helpers.
 */

const WINDOW_SIZE = 6;         // minimum consecutive lines to count as duplication
const MIN_LINE_LENGTH = 10;    // ignore trivial lines when building windows

export interface DuplicateBlock {
  hash: string;
  locations: Array<{ file: string; startLine: number }>;
  lineCount: number;
  sample: string;  // first line of the block for display
}

export async function checkDuplication(
  sourceFiles: string[],
  projectRoot: string,
): Promise<{ violations: SolidViolation[]; duplicates: DuplicateBlock[] }> {
  const violations: SolidViolation[] = [];
  const duplicates: DuplicateBlock[] = [];

  // Step 1: Build fingerprints for all files
  const allFingerprints = new Map<string, Array<{ file: string; startLine: number; sample: string }>>();

  const BATCH = 50;
  for (let i = 0; i < sourceFiles.length; i += BATCH) {
    const batch = sourceFiles.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(f => fingerprintFile(f, projectRoot)),
    );

    for (const fileResult of results) {
      for (const fp of fileResult) {
        const existing = allFingerprints.get(fp.hash);
        if (existing) {
          existing.push({ file: fp.file, startLine: fp.startLine, sample: fp.sample });
        } else {
          allFingerprints.set(fp.hash, [{ file: fp.file, startLine: fp.startLine, sample: fp.sample }]);
        }
      }
    }
  }

  // Step 2: Find hashes that appear in multiple files
  const seenPairs = new Set<string>(); // avoid reporting overlapping windows

  for (const [hash, locations] of allFingerprints) {
    // Only flag cross-file duplication (same hash in different files)
    const uniqueFiles = new Set(locations.map(l => l.file));
    if (uniqueFiles.size < 2) continue;

    // Deduplicate: only keep one location per file
    const deduped = new Map<string, { file: string; startLine: number; sample: string }>();
    for (const loc of locations) {
      if (!deduped.has(loc.file)) deduped.set(loc.file, loc);
    }
    const dedupedLocations = Array.from(deduped.values());

    // Create a pair key to avoid reporting overlapping windows between same file pair
    const filesSorted = Array.from(uniqueFiles).sort();
    const pairKey = filesSorted.join('::');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    duplicates.push({
      hash,
      locations: dedupedLocations,
      lineCount: WINDOW_SIZE,
      sample: dedupedLocations[0].sample,
    });
  }

  // Step 3: Generate violations
  // Group duplicates by file pairs for cleaner output
  const filePairCounts = new Map<string, number>();
  for (const dup of duplicates) {
    const files = dup.locations.map(l => l.file).sort();
    const key = files.join(' ↔ ');
    filePairCounts.set(key, (filePairCounts.get(key) ?? 0) + 1);
  }

  for (const [pair, count] of filePairCounts) {
    if (count >= 2) {
      const files = pair.split(' ↔ ');
      violations.push({
        principle: 'SRP',
        severity: count >= 5 ? 'warning' : 'info',
        file: files[0],
        message: `${count} duplicated code blocks with ${files.slice(1).join(', ')}`,
        suggestion: 'Extract shared logic into a common module to reduce duplication',
      });
    }
  }

  // Also flag individual files that appear in many duplication pairs
  const fileOccurrences = new Map<string, number>();
  for (const dup of duplicates) {
    for (const loc of dup.locations) {
      fileOccurrences.set(loc.file, (fileOccurrences.get(loc.file) ?? 0) + 1);
    }
  }

  for (const [file, count] of fileOccurrences) {
    if (count >= 3) {
      violations.push({
        principle: 'SRP',
        severity: count >= 6 ? 'warning' : 'info',
        file,
        message: `File appears in ${count} duplication clusters — likely contains copy-pasted patterns`,
        suggestion: 'Review this file for extractable shared logic',
      });
    }
  }

  return { violations, duplicates };
}

interface Fingerprint {
  hash: string;
  file: string;
  startLine: number;
  sample: string;
}

async function fingerprintFile(filePath: string, projectRoot: string): Promise<Fingerprint[]> {
  const fingerprints: Fingerprint[] = [];
  const relativePath = filePath.replace(projectRoot + '/', '');

  try {
    const normalizedLines: Array<{ text: string; originalLine: number }> = [];
    let lineNumber = 0;
    let inBlockComment = false;

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const rawLine of rl) {
      lineNumber++;
      let line = rawLine.trim();

      // Skip block comments
      if (inBlockComment) {
        if (line.includes('*/')) {
          inBlockComment = false;
          line = line.substring(line.indexOf('*/') + 2).trim();
        } else {
          continue;
        }
      }
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) {
          inBlockComment = true;
          continue;
        }
        line = line.substring(line.indexOf('*/') + 2).trim();
      }

      // Skip trivial lines
      if (line === '' || line === '{' || line === '}' || line === '});') continue;
      if (line.startsWith('//')) continue;
      if (line.startsWith('import ')) continue;
      if (line.startsWith('export type ') || line.startsWith('export interface ')) continue;

      // Normalize the line for comparison
      const normalized = normalizeLine(line);
      if (normalized.length < MIN_LINE_LENGTH) continue;

      normalizedLines.push({ text: normalized, originalLine: lineNumber });
    }

    // Build sliding window hashes
    for (let i = 0; i <= normalizedLines.length - WINDOW_SIZE; i++) {
      const windowLines = normalizedLines.slice(i, i + WINDOW_SIZE);
      const windowText = windowLines.map(l => l.text).join('\n');
      const hash = createHash('md5').update(windowText).digest('hex');

      fingerprints.push({
        hash,
        file: relativePath,
        startLine: windowLines[0].originalLine,
        sample: windowLines[0].text.substring(0, 80),
      });
    }
  } catch {
    // skip unreadable files
  }

  return fingerprints;
}

/** Normalize a line for comparison — strip variable names, literals, whitespace */
function normalizeLine(line: string): string {
  let normalized = line;

  // Remove string literals (replace with placeholder)
  normalized = normalized.replace(/'[^']*'/g, "'_STR_'");
  normalized = normalized.replace(/"[^"]*"/g, '"_STR_"');
  normalized = normalized.replace(/`[^`]*`/g, '`_STR_`');

  // Remove numeric literals
  normalized = normalized.replace(/\b\d+\.?\d*\b/g, '_NUM_');

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
