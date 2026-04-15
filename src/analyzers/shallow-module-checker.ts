import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { ModuleNode, SolidViolation, AnalysisThresholds } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

/**
 * Shallow-module detector based on John Ousterhout's "A Philosophy of Software Design".
 *
 * A **deep module** provides a simple interface that hides significant complexity.
 * A **shallow module** exposes a wide interface (many exports) relative to the
 * implementation behind it (few files, few lines of code). Shallow modules push
 * complexity onto their consumers instead of absorbing it.
 *
 * Metric:  depth = implementationLines / exportCount
 *   - depth < 10  →  very shallow (error)
 *   - depth < 20  →  shallow (warning)
 */

export interface ShallowModuleResult {
  moduleName: string;
  exportCount: number;
  fileCount: number;
  totalLines: number;
  depth: number;          // totalLines / exportCount — higher is deeper
}

export async function checkShallowModules(
  modules: ModuleNode[],
  detectedLayers: DetectedLayer[],
  sourceFiles: string[],
  srcRootAbsolute: string,
  _thresholds: AnalysisThresholds,
): Promise<{ violations: SolidViolation[]; shallowModules: ShallowModuleResult[] }> {
  const violations: SolidViolation[] = [];
  const shallowModules: ShallowModuleResult[] = [];

  // Only analyze real modules that have barrel files (those are the ones with a defined interface)
  const modulesWithBarrels = detectedLayers.filter(l => l.hasBarrel);
  if (modulesWithBarrels.length === 0) return { violations, shallowModules };

  // Group source files by module
  const filesByModule = new Map<string, string[]>();
  for (const file of sourceFiles) {
    const relative = path.relative(srcRootAbsolute, file);
    const moduleName = relative.split(path.sep)[0];
    if (!moduleName || moduleName.includes('.')) continue; // root files
    const list = filesByModule.get(moduleName) ?? [];
    list.push(file);
    filesByModule.set(moduleName, list);
  }

  for (const layer of modulesWithBarrels) {
    const barrelPath = findBarrelPath(srcRootAbsolute, layer.name);
    if (!barrelPath) continue;

    const exportCount = await countExports(barrelPath);
    if (exportCount === 0) continue; // no interface to evaluate

    const modFiles = filesByModule.get(layer.name) ?? [];
    const fileCount = modFiles.length;
    if (fileCount === 0) continue;

    const totalLines = await countTotalLines(modFiles);

    // Depth: lines of implementation per export symbol
    const depth = totalLines / exportCount;

    const result: ShallowModuleResult = {
      moduleName: layer.name,
      exportCount,
      fileCount,
      totalLines,
      depth: Math.round(depth * 10) / 10,
    };
    shallowModules.push(result);

    // A module with many exports but little implementation is shallow
    if (depth < 10 && exportCount >= 5) {
      violations.push({
        principle: 'ISP',
        severity: 'error',
        file: layer.path || layer.name,
        message: `Shallow module: ${layer.name} exports ${exportCount} symbols but has only ${totalLines} lines across ${fileCount} files (depth: ${result.depth})`,
        suggestion: `Consider consolidating ${layer.name} into a deeper module or reducing its public interface`,
      });
    } else if (depth < 20 && exportCount >= 5) {
      violations.push({
        principle: 'ISP',
        severity: 'warning',
        file: layer.path || layer.name,
        message: `Shallow module: ${layer.name} exports ${exportCount} symbols with ${totalLines} lines across ${fileCount} files (depth: ${result.depth})`,
        suggestion: `${layer.name} has a wide interface relative to its implementation — look for opportunities to hide internal details`,
      });
    }
  }

  shallowModules.sort((a, b) => a.depth - b.depth);
  return { violations, shallowModules };
}

function findBarrelPath(srcRoot: string, moduleName: string): string | null {
  const dir = path.join(srcRoot, moduleName);
  for (const name of ['index.ts', 'index.tsx', 'index.js']) {
    return path.join(dir, name);
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
        count += braceMatch[1].split(',').filter(s => s.trim()).length;
        continue;
      }

      // export * from — estimate
      if (/export\s+\*\s+from/.test(trimmed)) {
        count += 5;
        continue;
      }

      // export const/function/class/type/interface/enum
      if (/export\s+(const|let|var|function|class|type|interface|enum)\s/.test(trimmed)) {
        count++;
      }
    }
  } catch {
    return 0;
  }

  return count;
}

async function countTotalLines(files: string[]): Promise<number> {
  let total = 0;

  const BATCH = 50;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const counts = await Promise.all(
      batch.map(async (filePath) => {
        try {
          let count = 0;
          const rl = createInterface({
            input: createReadStream(filePath, { encoding: 'utf-8' }),
            crlfDelay: Infinity,
          });
          for await (const _ of rl) count++;
          return count;
        } catch {
          return 0;
        }
      }),
    );
    for (const c of counts) total += c;
  }

  return total;
}
