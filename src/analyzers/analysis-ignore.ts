import picomatch from 'picomatch';
import type {
  CircularDependency,
  LayerViolation,
  BarrelViolation,
  StabilityViolation,
  SolidViolation,
} from './types.js';

export type AnalysisIgnoreConfig = {
  circularDep?: string[];
  layerViolation?: string[];
  barrelViolation?: string[];
  stabilityViolation?: string[];
  oversizedFile?: string[];
  complexity?: string[];
  duplication?: string[];
  deadExport?: string[];
  dependencyInversion?: string[];
  interfaceSegregation?: string[];
  shallowModule?: string[];
  godModule?: string[];
};

/** Build a matcher that returns true if the path matches any of the patterns. */
function buildMatcher(patterns: string[] | undefined): (file: string) => boolean {
  if (!patterns || patterns.length === 0) return () => false;
  const match = picomatch(patterns, { dot: true });
  return (file: string) => match(file);
}

// ─── Circular dependencies ──────────────────────────────

/**
 * Drop a cycle only if EVERY participating file matches the ignore patterns.
 * If even one file in any edge is outside the ignored paths, keep the cycle.
 */
export function filterCyclesByFile(
  cycles: CircularDependency[],
  patterns: string[] | undefined,
): CircularDependency[] {
  const matches = buildMatcher(patterns);
  if (!patterns || patterns.length === 0) return cycles;

  return cycles.filter((cycle) => {
    if (cycle.files.length === 0) return true; // No file info, keep it
    const allMatch = cycle.files.every(
      (f) => matches(f.sourceFile) && matches(f.targetFile),
    );
    return !allMatch;
  });
}

// ─── Per-file violations ────────────────────────────────

export function filterLayerViolationsByFile(
  violations: LayerViolation[],
  patterns: string[] | undefined,
): LayerViolation[] {
  const matches = buildMatcher(patterns);
  if (!patterns || patterns.length === 0) return violations;
  return violations.filter((v) => !matches(v.file));
}

export function filterBarrelViolationsByFile(
  violations: BarrelViolation[],
  patterns: string[] | undefined,
): BarrelViolation[] {
  const matches = buildMatcher(patterns);
  if (!patterns || patterns.length === 0) return violations;
  return violations.filter((v) => !matches(v.file));
}

/**
 * Drop a stability violation only if EVERY edge-backing file matches.
 */
export function filterStabilityViolationsByFile(
  violations: StabilityViolation[],
  patterns: string[] | undefined,
): StabilityViolation[] {
  const matches = buildMatcher(patterns);
  if (!patterns || patterns.length === 0) return violations;
  return violations.filter((v) => {
    if (v.files.length === 0) return true;
    const allMatch = v.files.every(
      (f) => matches(f.sourceFile) && matches(f.targetFile),
    );
    return !allMatch;
  });
}

// ─── SOLID violations (filtered by principle + message content) ─

interface SolidCategoryFilter {
  principle?: SolidViolation['principle'];
  messagePredicate?: (message: string) => boolean;
}

const CATEGORY_FILTERS: Record<string, SolidCategoryFilter> = {
  oversizedFile: {
    principle: 'SRP',
    messagePredicate: (m) => m.includes('lines (threshold'),
  },
  complexity: {
    principle: 'SRP',
    messagePredicate: (m) => m.toLowerCase().includes('complexity'),
  },
  duplication: {
    principle: 'SRP',
    messagePredicate: (m) => m.toLowerCase().includes('duplicat'),
  },
  deadExport: {
    messagePredicate: (m) => m.includes('Dead export'),
  },
  dependencyInversion: {
    principle: 'DIP',
  },
  interfaceSegregation: {
    principle: 'ISP',
  },
  shallowModule: {
    messagePredicate: (m) => m.includes('Shallow module'),
  },
  godModule: {
    messagePredicate: (m) => m.includes('God module'),
  },
};

function isInCategory(violation: SolidViolation, category: string): boolean {
  const filter = CATEGORY_FILTERS[category];
  if (!filter) return false;
  if (filter.principle && violation.principle !== filter.principle) return false;
  if (filter.messagePredicate && !filter.messagePredicate(violation.message)) return false;
  return true;
}

/**
 * Apply analysis-scoped ignores to SOLID violations. A violation is only
 * dropped if it matches an ignored category AND its file matches the
 * category's patterns.
 */
export function filterSolidViolationsByCategory(
  violations: SolidViolation[],
  ignoreConfig: AnalysisIgnoreConfig,
): SolidViolation[] {
  const categoryMatchers: Record<string, (file: string) => boolean> = {};
  for (const category of Object.keys(CATEGORY_FILTERS)) {
    const patterns = (ignoreConfig as Record<string, string[] | undefined>)[category];
    if (patterns && patterns.length > 0) {
      categoryMatchers[category] = buildMatcher(patterns);
    }
  }
  if (Object.keys(categoryMatchers).length === 0) return violations;

  return violations.filter((v) => {
    for (const [category, matches] of Object.entries(categoryMatchers)) {
      if (isInCategory(v, category) && matches(v.file)) {
        return false;
      }
    }
    return true;
  });
}
