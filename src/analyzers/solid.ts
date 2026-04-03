import type {
  FileImports,
  SolidAnalysis,
  SolidScores,
  SolidViolation,
  AnalysisThresholds,
  DEFAULT_THRESHOLDS,
} from './types.js';
import { DEFAULT_THRESHOLDS as DEFAULTS } from './types.js';
import type { DetectedLayer } from '../scanners/types.js';
import { checkSRP } from './srp-checker.js';
import { checkDIP } from './dip-checker.js';
import { checkISP } from './isp-checker.js';

export async function runSolidAnalysis(
  fileImports: FileImports[],
  sourceFiles: string[],
  detectedLayers: DetectedLayer[],
  projectRoot: string,
  srcRootAbsolute: string,
  thresholds: AnalysisThresholds = DEFAULTS,
): Promise<SolidAnalysis> {
  const [srpViolations, dipViolations, ispViolations] = await Promise.all([
    checkSRP(fileImports, sourceFiles, projectRoot, thresholds),
    Promise.resolve(checkDIP(fileImports, detectedLayers, srcRootAbsolute)),
    checkISP(detectedLayers, srcRootAbsolute, thresholds),
  ]);

  const violations: SolidViolation[] = [
    ...srpViolations,
    ...dipViolations,
    ...ispViolations,
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

    // Deduct points per violation relative to project size
    const penalty = (errors * 10 + warnings * 5 + infos * 1) / Math.max(totalFiles / 10, 1);
    return Math.max(0, Math.round(100 - penalty));
  };

  const srp = score('SRP');
  const dip = score('DIP');
  const isp = score('ISP');
  const overall = Math.round((srp + dip + isp) / 3);

  return { srp, dip, isp, overall };
}
