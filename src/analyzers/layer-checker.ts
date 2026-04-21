import type { FileImports, LayerViolation } from './types.js';

export interface LayerInfo {
  name: string;
  level: number;
  role?: string;
}

/**
 * Find imports that violate the downward-only dependency rule.
 * A lower-level module must not import from a higher-level module.
 */
export function findLayerViolations(
  fileImports: FileImports[],
  layers: LayerInfo[],
): LayerViolation[] {
  const levelByModule = new Map<string, number>();
  const roleByModule = new Map<string, string>();
  for (const layer of layers) {
    levelByModule.set(layer.name, layer.level);
    if (layer.role) roleByModule.set(layer.name, layer.role);
  }

  const violations: LayerViolation[] = [];

  for (const fi of fileImports) {
    const fromLevel = levelByModule.get(fi.moduleName);
    if (fromLevel === undefined) continue; // Unmanaged module

    for (const imp of fi.imports) {
      const targetModule = imp.targetModule;
      if (!targetModule || targetModule === fi.moduleName) continue;

      const toLevel = levelByModule.get(targetModule);
      if (toLevel === undefined) continue; // Unmanaged module

      // Violation: importing from a higher layer (upward dependency)
      if (fromLevel < toLevel) {
        violations.push({
          file: fi.filePath,
          line: imp.line,
          specifier: imp.specifier,
          fromModule: fi.moduleName,
          fromLevel,
          fromRole: roleByModule.get(fi.moduleName),
          toModule: targetModule,
          toLevel,
          toRole: roleByModule.get(targetModule),
        });
      }
    }
  }

  return violations;
}
