import type {
  FileImports,
  ModuleNode,
  SolidAnalysis,
  SolidScores,
  SolidViolation,
  AnalysisThresholds,
  DEFAULT_THRESHOLDS,
} from './types.js';
import { DEFAULT_THRESHOLDS as DEFAULTS } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';
import { checkSRP } from './srp-checker.js';
import { checkDIP } from './dip-checker.js';
import { checkISP } from './isp-checker.js';
import { checkComplexity } from './complexity-checker.js';
import { checkGodModules } from './god-module-checker.js';
import { checkShallowModules } from './shallow-module-checker.js';
import { checkPassthroughMethods } from './passthrough-checker.js';
import { checkDeadExports } from './dead-export-checker.js';
import { checkDuplication } from './duplication-checker.js';

export async function runSolidAnalysis(
  fileImports: FileImports[],
  sourceFiles: string[],
  detectedLayers: DetectedLayer[],
  projectRoot: string,
  srcRootAbsolute: string,
  thresholds: AnalysisThresholds = DEFAULTS,
  modules: ModuleNode[] = [],
): Promise<SolidAnalysis> {
  const [srpViolations, dipViolations, ispViolations, complexityResult, shallowResult, passthroughResult, deadExportResult, duplicationResult] = await Promise.all([
    checkSRP(fileImports, sourceFiles, projectRoot, thresholds),
    Promise.resolve(checkDIP(fileImports, detectedLayers, srcRootAbsolute)),
    checkISP(detectedLayers, srcRootAbsolute, thresholds),
    checkComplexity(sourceFiles, projectRoot, thresholds),
    checkShallowModules(modules, detectedLayers, sourceFiles, srcRootAbsolute, thresholds),
    checkPassthroughMethods(sourceFiles, projectRoot),
    checkDeadExports(sourceFiles, detectedLayers, srcRootAbsolute, projectRoot),
    checkDuplication(sourceFiles, projectRoot),
  ]);

  const godModuleResult = checkGodModules(modules, thresholds);

  const violations: SolidViolation[] = [
    ...srpViolations,
    ...dipViolations,
    ...ispViolations,
    ...complexityResult.violations,
    ...godModuleResult.violations,
    ...shallowResult.violations,
    ...passthroughResult.violations,
    ...deadExportResult.violations,
    ...duplicationResult.violations,
  ];

  const scores = calculateScores(violations, sourceFiles.length);

  return { violations, scores };
}

function calculateScores(violations: SolidViolation[], totalFiles: number): SolidScores {
  if (totalFiles === 0) return { srp: 100, dip: 100, isp: 100, overall: 100 };

  const count = (principle: string) =>
    violations.filter((v) => v.principle === principle);

  const score = (principle: string): number => {
    const v = count(principle);
    const errors = v.filter((x) => x.severity === 'error').length;
    const warnings = v.filter((x) => x.severity === 'warning').length;
    const infos = v.filter((x) => x.severity === 'info').length;

    // Mild normalization using sqrt so large projects aren't punished for
    // raw count alone, but can't hide behind thousands of clean files either.
    // A 100-file project divides by ~3.2, a 1000-file project by ~10
    const rawPenalty = errors * 10 + warnings * 5 + infos * 1;
    const normalizer = Math.max(Math.sqrt(totalFiles / 10), 1);
    const penalty = rawPenalty / normalizer;
    return Math.max(0, Math.round(100 - penalty));
  };

  const srp = score('SRP');
  const dip = score('DIP');
  const isp = score('ISP');
  const overall = Math.round((srp + dip + isp) / 3);

  return { srp, dip, isp, overall };
}
