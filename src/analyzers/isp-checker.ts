import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { SolidViolation, AnalysisThresholds } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

/**
 * Interface Segregation Principle checker.
 * Detects: overly broad barrel exports (fat interfaces).
 */
export async function checkISP(
  detectedLayers: DetectedLayer[],
  srcRootAbsolute: string,
  thresholds: AnalysisThresholds,
): Promise<SolidViolation[]> {
  const violations: SolidViolation[] = [];

  for (const layer of detectedLayers) {
    if (!layer.hasBarrel) continue;

    // Count exports in the barrel file
    const barrelPath = findBarrelPath(srcRootAbsolute, layer.path);
    if (!barrelPath) continue;

    const exportCount = await countExports(barrelPath);

    if (exportCount > thresholds.maxBarrelExports) {
      const relative = path.relative(path.dirname(srcRootAbsolute), barrelPath);
      violations.push({
        principle: 'ISP',
        severity: exportCount > thresholds.maxBarrelExports * 2 ? 'error' : 'warning',
        file: relative,
        message: `Barrel exports ${exportCount} symbols (threshold: ${thresholds.maxBarrelExports})`,
        suggestion: 'Split into focused sub-modules so consumers only depend on what they need',
      });
    }
  }

  return violations;
}

function findBarrelPath(srcRoot: string, layerPath: string): string | null {
  // layerPath is like "src/services", srcRoot is absolute path to "src"
  const layerName = layerPath.split('/').pop()!;
  const dir = path.join(srcRoot, layerName);

  // We check common barrel file names
  for (const name of ['index.ts', 'index.tsx', 'index.js']) {
    const candidate = path.join(dir, name);
    // We'll check existence during export counting
    return candidate;
  }
  return null;
}

async function countExports(filePath: string): Promise<number> {
  let count = 0;

  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('export')) continue;

      // export { a, b, c } from — count individual names
      const braceMatch = trimmed.match(/export\s+(?:type\s+)?\{([^}]+)\}/);
      if (braceMatch) {
        const names = braceMatch[1].split(',').filter((s) => s.trim());
        count += names.length;
        continue;
      }

      // export * from — count as 1 (we can't know how many without parsing the target)
      if (/export\s+\*\s+from/.test(trimmed)) {
        count += 5; // Estimate: star re-exports typically expose many symbols
        continue;
      }

      // export const/function/class/type/interface
      if (/export\s+(const|let|var|function|class|type|interface|enum)\s/.test(trimmed)) {
        count++;
      }
    }
  } catch {
    // File doesn't exist or can't be read
    return 0;
  }

  return count;
}
