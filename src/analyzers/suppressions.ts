import type {
  CircularDependency,
  LayerViolation,
  BarrelViolation,
  StabilityViolation,
  SolidViolation,
} from './types.js';

export type SuppressionRule =
  | 'circularDep'
  | 'layerViolation'
  | 'barrelViolation'
  | 'stabilityViolation'
  | 'oversizedFile'
  | 'complexity'
  | 'duplication'
  | 'deadExport'
  | 'dependencyInversion'
  | 'interfaceSegregation'
  | 'shallowModule'
  | 'godModule';

export interface Suppression {
  rule: SuppressionRule;
  file?: string;
  cycle?: string;
  reason: string;
}

export interface SuppressionCounts {
  circularDep: number;
  layerViolation: number;
  barrelViolation: number;
  stabilityViolation: number;
  oversizedFile: number;
  complexity: number;
  duplication: number;
  deadExport: number;
  dependencyInversion: number;
  interfaceSegregation: number;
  shallowModule: number;
  godModule: number;
}

export function emptySuppressionCounts(): SuppressionCounts {
  return {
    circularDep: 0, layerViolation: 0, barrelViolation: 0, stabilityViolation: 0,
    oversizedFile: 0, complexity: 0, duplication: 0, deadExport: 0,
    dependencyInversion: 0, interfaceSegregation: 0, shallowModule: 0, godModule: 0,
  };
}

export interface SuppressionResult<T> {
  remaining: T[];
  suppressed: T[];
}

/** Normalize a cycle path for matching: sort module names, join with " → " */
function cycleKey(cycle: string[]): string {
  // Drop the trailing repeat of the first module if present (cycle is [a,b,c,a])
  const unique = cycle[cycle.length - 1] === cycle[0] ? cycle.slice(0, -1) : cycle;
  return [...unique].sort().join(' → ');
}

function parseCyclePattern(pattern: string): string {
  // Accept patterns like "database → app" or "database ↔ app" or "database,app"
  return pattern
    .split(/[→↔,>]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(' → ');
}

// ─── Filter each violation kind ──────────────────────────

export function applySuppressionsToCycles(
  cycles: CircularDependency[],
  suppressions: Suppression[],
): SuppressionResult<CircularDependency> {
  const cycleSuppressions = suppressions
    .filter((s) => s.rule === 'circularDep' && s.cycle)
    .map((s) => parseCyclePattern(s.cycle!));

  const remaining: CircularDependency[] = [];
  const suppressed: CircularDependency[] = [];

  for (const cycle of cycles) {
    const key = cycleKey(cycle.cycle);
    if (cycleSuppressions.includes(key)) {
      suppressed.push(cycle);
    } else {
      remaining.push(cycle);
    }
  }

  return { remaining, suppressed };
}

function matchesFile(violationFile: string, suppressionFile: string | undefined): boolean {
  if (!suppressionFile) return false;
  return violationFile === suppressionFile ||
    violationFile.endsWith(suppressionFile) ||
    suppressionFile.endsWith(violationFile);
}

function splitByRuleAndFile<T extends { file: string }>(
  violations: T[],
  rule: SuppressionRule,
  suppressions: Suppression[],
): SuppressionResult<T> {
  const matching = suppressions.filter((s) => s.rule === rule);
  if (matching.length === 0) return { remaining: violations, suppressed: [] };

  const remaining: T[] = [];
  const suppressed: T[] = [];

  for (const v of violations) {
    if (matching.some((s) => matchesFile(v.file, s.file))) {
      suppressed.push(v);
    } else {
      remaining.push(v);
    }
  }

  return { remaining, suppressed };
}

export function applySuppressionsToLayerViolations(
  violations: LayerViolation[],
  suppressions: Suppression[],
): SuppressionResult<LayerViolation> {
  return splitByRuleAndFile(violations, 'layerViolation', suppressions);
}

export function applySuppressionsToBarrelViolations(
  violations: BarrelViolation[],
  suppressions: Suppression[],
): SuppressionResult<BarrelViolation> {
  return splitByRuleAndFile(violations, 'barrelViolation', suppressions);
}

export function applySuppressionsToStabilityViolations(
  violations: StabilityViolation[],
  suppressions: Suppression[],
): SuppressionResult<StabilityViolation> {
  // StabilityViolation doesn't have `file` — match by files within edges
  const matching = suppressions.filter((s) => s.rule === 'stabilityViolation' && s.file);
  if (matching.length === 0) return { remaining: violations, suppressed: [] };

  const remaining: StabilityViolation[] = [];
  const suppressed: StabilityViolation[] = [];
  for (const v of violations) {
    const anyMatch = v.files.some((f) =>
      matching.some((s) => matchesFile(f.sourceFile, s.file) || matchesFile(f.targetFile, s.file)),
    );
    if (anyMatch) suppressed.push(v);
    else remaining.push(v);
  }
  return { remaining, suppressed };
}

const SOLID_RULE_TO_CATEGORY: Record<string, (v: SolidViolation) => boolean> = {
  oversizedFile: (v) => v.principle === 'SRP' && v.message.includes('lines (threshold'),
  complexity: (v) => v.principle === 'SRP' && v.message.toLowerCase().includes('complexity'),
  duplication: (v) => v.principle === 'SRP' && v.message.toLowerCase().includes('duplicat'),
  deadExport: (v) => v.message.includes('Dead export'),
  dependencyInversion: (v) => v.principle === 'DIP',
  interfaceSegregation: (v) => v.principle === 'ISP' && !v.message.includes('Shallow module') && !v.message.includes('God module'),
  shallowModule: (v) => v.message.includes('Shallow module'),
  godModule: (v) => v.message.includes('God module'),
};

export function applySuppressionsToSolidViolations(
  violations: SolidViolation[],
  suppressions: Suppression[],
): { remaining: SolidViolation[]; suppressed: SolidViolation[]; countsByRule: Partial<SuppressionCounts> } {
  const remaining: SolidViolation[] = [];
  const suppressed: SolidViolation[] = [];
  const countsByRule: Partial<SuppressionCounts> = {};

  for (const v of violations) {
    let matched: SuppressionRule | null = null;
    for (const [rule, categoryTest] of Object.entries(SOLID_RULE_TO_CATEGORY)) {
      if (!categoryTest(v)) continue;
      const fileSuppressions = suppressions.filter(
        (s) => s.rule === rule && matchesFile(v.file, s.file),
      );
      if (fileSuppressions.length > 0) {
        matched = rule as SuppressionRule;
        break;
      }
    }

    if (matched) {
      suppressed.push(v);
      countsByRule[matched] = (countsByRule[matched] ?? 0) + 1;
    } else {
      remaining.push(v);
    }
  }

  return { remaining, suppressed, countsByRule };
}
