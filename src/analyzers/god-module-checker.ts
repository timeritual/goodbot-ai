import type { ModuleNode, SolidViolation, AnalysisThresholds } from './types.js';

/**
 * God-module detector.
 * A "god module" has both high fan-in (many dependents) and high fan-out (many dependencies),
 * indicating it knows too much and is depended on too broadly.
 */

export interface GodModuleResult {
  moduleName: string;
  fanIn: number;
  fanOut: number;
  score: number; // fanIn * fanOut — higher is worse
}

export function checkGodModules(
  modules: ModuleNode[],
  thresholds: AnalysisThresholds,
): { violations: SolidViolation[]; godModules: GodModuleResult[] } {
  const violations: SolidViolation[] = [];
  const godModules: GodModuleResult[] = [];
  const maxCoupling = thresholds.maxModuleCoupling ?? 6;

  // Filter out root module
  const realModules = modules.filter(m => m.name !== '_root');
  if (realModules.length < 3) return { violations, godModules };

  for (const mod of realModules) {
    const fanIn = mod.dependedOnBy.size;
    const fanOut = mod.dependsOn.size;
    const score = fanIn * fanOut;

    // A module is a "god module" if it has high coupling in both directions
    const isGod = fanIn >= maxCoupling && fanOut >= Math.ceil(maxCoupling / 2);
    const isHighCoupling = (fanIn + fanOut) >= maxCoupling * 2;

    if (isGod || isHighCoupling) {
      godModules.push({ moduleName: mod.name, fanIn, fanOut, score });

      violations.push({
        principle: 'SRP',
        severity: score > maxCoupling * maxCoupling ? 'error' : 'warning',
        file: mod.path || mod.name,
        message: `God module: ${mod.name} has fan-in=${fanIn}, fan-out=${fanOut} (coupling threshold: ${maxCoupling})`,
        suggestion: `Split ${mod.name} into focused sub-modules to reduce coupling`,
      });
    }
  }

  godModules.sort((a, b) => b.score - a.score);
  return { violations, godModules };
}
