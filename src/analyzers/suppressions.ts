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

export interface SuppressionResult<T> {
  remaining: T[];
  suppressed: T[];
  /** Indices (into the original suppressions array) of entries that matched at least one violation. */
  matchedIndices: Set<number>;
}

/** Normalize a cycle path for matching: sort module names, join with " → " */
function cycleKey(cycle: string[]): string {
  // Drop the trailing repeat of the first module if present (cycle is [a,b,c,a])
  const unique = cycle[cycle.length - 1] === cycle[0] ? cycle.slice(0, -1) : cycle;
  return [...unique].sort().join(' → ');
}

/**
 * Parse a cycle pattern string from config into a canonical form.
 *
 * Accepts all common separators:
 *   "a → b"     (Unicode arrow)
 *   "a ↔ b"     (Unicode bidirectional)
 *   "a -> b"    (ASCII arrow)
 *   "a <-> b"   (ASCII bidirectional)
 *   "a, b"      (comma)
 *   "a > b"     (plain greater-than)
 *
 * Output: modules sorted alphabetically, joined with " → ".
 */
export function parseCyclePattern(pattern: string): string {
  const parts = pattern
    .split(/\s*(?:→|↔|<->|->|<-|>|,)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Dedupe so "a -> b -> a" (user showing the loop) matches "a → b" canonical
  const unique = Array.from(new Set(parts));
  return unique.sort().join(' → ');
}

// ─── Circular dep suppressions ──────────────────────────

export function applySuppressionsToCycles(
  cycles: CircularDependency[],
  suppressions: Suppression[],
): SuppressionResult<CircularDependency> {
  const matchedIndices = new Set<number>();
  const remaining: CircularDependency[] = [];
  const suppressed: CircularDependency[] = [];

  for (const cycle of cycles) {
    const key = cycleKey(cycle.cycle);
    let matched = false;
    for (let i = 0; i < suppressions.length; i++) {
      const s = suppressions[i];
      if (s.rule !== 'circularDep' || !s.cycle) continue;
      if (parseCyclePattern(s.cycle) === key) {
        matchedIndices.add(i);
        matched = true;
      }
    }
    if (matched) suppressed.push(cycle);
    else remaining.push(cycle);
  }

  return { remaining, suppressed, matchedIndices };
}

// ─── Per-file violation suppressions ────────────────────

function matchesFile(violationFile: string, suppressionFile: string | undefined): boolean {
  if (!suppressionFile) return false;
  return (
    violationFile === suppressionFile ||
    violationFile.endsWith(suppressionFile) ||
    suppressionFile.endsWith(violationFile)
  );
}

function splitByRuleAndFile<T extends { file: string }>(
  violations: T[],
  rule: SuppressionRule,
  suppressions: Suppression[],
): SuppressionResult<T> {
  const matchedIndices = new Set<number>();
  const remaining: T[] = [];
  const suppressed: T[] = [];

  for (const v of violations) {
    let matched = false;
    for (let i = 0; i < suppressions.length; i++) {
      const s = suppressions[i];
      if (s.rule !== rule) continue;
      if (matchesFile(v.file, s.file)) {
        matchedIndices.add(i);
        matched = true;
      }
    }
    if (matched) suppressed.push(v);
    else remaining.push(v);
  }

  return { remaining, suppressed, matchedIndices };
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
  const matchedIndices = new Set<number>();
  const remaining: StabilityViolation[] = [];
  const suppressed: StabilityViolation[] = [];

  for (const v of violations) {
    let matched = false;
    for (let i = 0; i < suppressions.length; i++) {
      const s = suppressions[i];
      if (s.rule !== 'stabilityViolation' || !s.file) continue;
      const anyEdgeMatches = v.files.some(
        (f) => matchesFile(f.sourceFile, s.file) || matchesFile(f.targetFile, s.file),
      );
      if (anyEdgeMatches) {
        matchedIndices.add(i);
        matched = true;
      }
    }
    if (matched) suppressed.push(v);
    else remaining.push(v);
  }

  return { remaining, suppressed, matchedIndices };
}

// ─── SOLID suppressions (per-category) ──────────────────

const SOLID_RULE_TO_CATEGORY: Record<string, (v: SolidViolation) => boolean> = {
  oversizedFile: (v) => v.principle === 'SRP' && v.message.includes('lines (threshold'),
  complexity: (v) => v.principle === 'SRP' && v.message.toLowerCase().includes('complexity'),
  duplication: (v) => v.principle === 'SRP' && v.message.toLowerCase().includes('duplicat'),
  deadExport: (v) => v.message.includes('Dead export'),
  dependencyInversion: (v) => v.principle === 'DIP',
  interfaceSegregation: (v) =>
    v.principle === 'ISP' && !v.message.includes('Shallow module') && !v.message.includes('God module'),
  shallowModule: (v) => v.message.includes('Shallow module'),
  godModule: (v) => v.message.includes('God module'),
};

export function applySuppressionsToSolidViolations(
  violations: SolidViolation[],
  suppressions: Suppression[],
): {
  remaining: SolidViolation[];
  suppressed: SolidViolation[];
  countsByRule: Record<string, number>;
  matchedIndices: Set<number>;
} {
  const remaining: SolidViolation[] = [];
  const suppressed: SolidViolation[] = [];
  const countsByRule: Record<string, number> = {};
  const matchedIndices = new Set<number>();

  for (const v of violations) {
    let matchedRule: SuppressionRule | null = null;
    for (const [rule, categoryTest] of Object.entries(SOLID_RULE_TO_CATEGORY)) {
      if (!categoryTest(v)) continue;
      let foundForThisRule = false;
      for (let i = 0; i < suppressions.length; i++) {
        const s = suppressions[i];
        if (s.rule !== rule) continue;
        if (matchesFile(v.file, s.file)) {
          matchedIndices.add(i);
          foundForThisRule = true;
        }
      }
      if (foundForThisRule) {
        matchedRule = rule as SuppressionRule;
        break;
      }
    }

    if (matchedRule) {
      suppressed.push(v);
      countsByRule[matchedRule] = (countsByRule[matchedRule] ?? 0) + 1;
    } else {
      remaining.push(v);
    }
  }

  return { remaining, suppressed, countsByRule, matchedIndices };
}
