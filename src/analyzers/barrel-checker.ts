import path from 'node:path';
import type { FileImports, BarrelViolation } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

/**
 * Find imports that bypass barrel files (index.ts).
 * e.g., `import { x } from '../services/orderService'` instead of `from '../services'`
 */
export function findBarrelViolations(
  fileImports: FileImports[],
  detectedLayers: DetectedLayer[],
  srcRootAbsolute: string,
): BarrelViolation[] {
  // Build a set of modules that have barrels
  const barrelModules = new Map<string, DetectedLayer>();
  for (const layer of detectedLayers) {
    if (layer.hasBarrel) {
      barrelModules.set(layer.name, layer);
    }
  }

  const violations: BarrelViolation[] = [];

  for (const fi of fileImports) {
    for (const imp of fi.imports) {
      if (!imp.resolvedPath) continue;

      // Get target module from resolved path
      const targetRelative = path.relative(srcRootAbsolute, imp.resolvedPath);
      const targetParts = targetRelative.split(path.sep);
      const targetModule = targetParts[0];

      // Skip if target module doesn't have a barrel
      if (!barrelModules.has(targetModule)) continue;

      // Skip intra-module imports
      if (fi.moduleName === targetModule) continue;

      // Check if the import goes through the barrel or bypasses it
      // A barrel import resolves to: <module>/index.ts
      // A bypass resolves to: <module>/someFile.ts or <module>/sub/file.ts
      const targetFileName = targetParts[targetParts.length - 1];
      const isBarrelImport =
        targetFileName.startsWith('index.') ||
        targetParts.length === 1;

      if (!isBarrelImport) {
        const suggestion = imp.specifier.replace(
          /\/[^/]+$/,
          '',
        ).replace(/\/index$/, '');

        // Make sure suggestion actually differs
        if (suggestion !== imp.specifier) {
          violations.push({
            file: fi.filePath,
            line: imp.line,
            specifier: imp.specifier,
            targetModule,
            suggestion: `import from '${suggestion}' instead`,
          });
        }
      }
    }
  }

  return violations;
}
