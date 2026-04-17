import path from 'node:path';
import type { FileImports, SolidViolation } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

/**
 * Dependency Inversion Principle checker.
 * Detects: high-level modules depending on low-level concretions,
 * bypassing available abstractions (interfaces.ts).
 */
export function checkDIP(
  fileImports: FileImports[],
  detectedLayers: DetectedLayer[],
  srcRootAbsolute: string,
): SolidViolation[] {
  const violations: SolidViolation[] = [];

  // Build map of modules that have interfaces.ts
  const modulesWithInterfaces = new Set(
    detectedLayers.filter((l) => l.hasInterfaces).map((l) => l.name),
  );

  // Build layer level map
  const levelByModule = new Map(
    detectedLayers.map((l) => [l.name, l.suggestedLevel]),
  );

  for (const fi of fileImports) {
    const fromLevel = levelByModule.get(fi.moduleName) ?? -1;

    for (const imp of fi.imports) {
      if (!imp.resolvedPath) continue;

      const targetModule = imp.targetModule;
      if (!targetModule || targetModule === fi.moduleName || targetModule === '_root') continue;

      const toLevel = levelByModule.get(targetModule) ?? -1;

      // Only check when a higher-level module imports from a lower-level module
      // that has interfaces available
      if (fromLevel <= toLevel) continue;
      if (!modulesWithInterfaces.has(targetModule)) continue;

      // Check if the import goes to a concrete file (not the barrel/interfaces)
      const targetRelative = path.relative(srcRootAbsolute, imp.resolvedPath);
      const targetParts = targetRelative.split(path.sep);
      const targetFileName = targetParts[targetParts.length - 1];

      const isAbstraction =
        targetFileName.startsWith('index.') ||
        targetFileName.startsWith('interfaces.');

      if (!isAbstraction) {
        violations.push({
          principle: 'DIP',
          severity: 'warning',
          file: fi.filePath,
          line: imp.line,
          message: `Imports concrete '${imp.specifier}' from ${targetModule} which has interfaces.ts`,
          suggestion: `Depend on abstractions: import from '${targetModule}' barrel or interfaces instead of internal files`,
        });
      }
    }
  }

  return violations;
}
