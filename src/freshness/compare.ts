import type { AnalysisSnapshot, FreshnessClaim, FreshnessReport } from './types.js';

/** Compare a stored snapshot against a current snapshot to detect staleness */
export function compareFreshness(
  stored: AnalysisSnapshot,
  current: AnalysisSnapshot,
): FreshnessReport {
  const claims: FreshnessClaim[] = [];

  // Health grade
  claims.push(compareString('health_grade', 'Health grade', stored.healthGrade, current.healthGrade));

  // Health score (use a threshold — small fluctuations aren't meaningful)
  // Higher score is better, so a drop is degradation
  claims.push(compareNumeric('health_score', 'Health score', stored.healthScore, current.healthScore, 5, true));

  // Violation counts — any change is meaningful
  claims.push(compareViolation('circular_deps', 'Circular dependencies', stored.circularDeps, current.circularDeps));
  claims.push(compareViolation('barrel_violations', 'Barrel violations', stored.barrelViolations, current.barrelViolations));
  claims.push(compareViolation('layer_violations', 'Layer violations', stored.layerViolations, current.layerViolations));
  claims.push(compareViolation('srp_violations', 'SRP violations', stored.srpViolations, current.srpViolations));
  claims.push(compareViolation('complexity', 'Complexity violations', stored.complexityViolations, current.complexityViolations));
  claims.push(compareViolation('duplication', 'Duplication clusters', stored.duplicationClusters, current.duplicationClusters));
  claims.push(compareViolation('dead_exports', 'Dead exports', stored.deadExportCount, current.deadExportCount));

  // File/module lists — stale if >30% of the list changed
  claims.push(compareList('hotspots', 'Hotspot files', stored.hotspotFiles, current.hotspotFiles));
  claims.push(compareList('oversized', 'Oversized files', stored.oversizedFiles, current.oversizedFiles));
  claims.push(compareList('god_modules', 'God modules', stored.godModules, current.godModules));
  claims.push(compareList('shallow_modules', 'Shallow modules', stored.shallowModules, current.shallowModules));

  // AI commit ratio — stale if changed by more than 5 percentage points
  // Higher AI ratio is degradation (more AI-generated code)
  claims.push(compareNumeric('ai_ratio', 'AI commit ratio', stored.aiCommitRatio, current.aiCommitRatio, 5, false));

  // Custom rules — stale if config rules changed since generation
  claims.push(compareStringList('custom_rules', 'Custom rules', stored.customRules, current.customRules));

  const summary = {
    fresh: claims.filter(c => c.status === 'fresh').length,
    stale: claims.filter(c => c.status === 'stale').length,
    degraded: claims.filter(c => c.status === 'degraded').length,
    improved: claims.filter(c => c.status === 'improved').length,
  };

  const now = new Date();
  const generated = new Date(stored.generatedAt);
  const daysSinceGeneration = Math.floor((now.getTime() - generated.getTime()) / (1000 * 60 * 60 * 24));

  let overallStatus: FreshnessReport['overallStatus'] = 'fresh';
  if (summary.degraded > 0) {
    overallStatus = 'degraded';
  } else if (summary.stale > 0) {
    overallStatus = 'stale';
  }

  return {
    overallStatus,
    generatedAt: stored.generatedAt,
    checkedAt: now.toISOString(),
    daysSinceGeneration,
    claims,
    summary,
  };
}

/** Compare a numeric violation count — increase is degraded, decrease is improved */
function compareViolation(
  category: string,
  label: string,
  stored: number,
  current: number,
): FreshnessClaim {
  const delta = current - stored;
  if (delta === 0) return { category, label, storedValue: stored, currentValue: current, status: 'fresh' };
  return {
    category,
    label,
    storedValue: stored,
    currentValue: current,
    status: delta > 0 ? 'degraded' : 'improved',
    delta,
  };
}

/** Compare a numeric value with a threshold — only flag if delta exceeds threshold */
function compareNumeric(
  category: string,
  label: string,
  stored: number,
  current: number,
  threshold: number,
  higherIsBetter: boolean,
): FreshnessClaim {
  const delta = current - stored;
  if (Math.abs(delta) <= threshold) {
    return { category, label, storedValue: stored, currentValue: current, status: 'fresh' };
  }
  const isDegraded = higherIsBetter ? delta < 0 : delta > 0;
  return {
    category,
    label,
    storedValue: stored,
    currentValue: current,
    status: isDegraded ? 'degraded' : 'improved',
    delta,
  };
}

/** Compare a string value — different means stale */
function compareString(
  category: string,
  label: string,
  stored: string,
  current: string,
): FreshnessClaim {
  if (stored === current) {
    return { category, label, storedValue: stored, currentValue: current, status: 'fresh' };
  }
  return { category, label, storedValue: stored, currentValue: current, status: 'stale' };
}

/** Compare a list of strings — stale if >30% of items changed */
function compareList(
  category: string,
  label: string,
  stored: string[],
  current: string[],
): FreshnessClaim {
  const storedSet = new Set(stored);
  const currentSet = new Set(current);

  // Both empty is fresh
  if (storedSet.size === 0 && currentSet.size === 0) {
    return { category, label, storedValue: 0, currentValue: 0, status: 'fresh' };
  }

  const added = [...currentSet].filter(x => !storedSet.has(x));
  const removed = [...storedSet].filter(x => !currentSet.has(x));
  const totalChanges = added.length + removed.length;
  const maxSize = Math.max(storedSet.size, currentSet.size, 1);
  const changeRatio = totalChanges / maxSize;

  if (totalChanges === 0) {
    return { category, label, storedValue: stored.length, currentValue: current.length, status: 'fresh' };
  }

  if (changeRatio > 0.3) {
    return {
      category,
      label,
      storedValue: `${stored.length} items`,
      currentValue: `${current.length} items (${added.length} new, ${removed.length} removed)`,
      status: 'stale',
    };
  }

  // Minor changes — still stale but less concerning
  return {
    category,
    label,
    storedValue: `${stored.length} items`,
    currentValue: `${current.length} items (${added.length} new, ${removed.length} removed)`,
    status: 'stale',
  };
}

/** Compare two string arrays for exact equality */
function compareStringList(
  category: string,
  label: string,
  stored: string[],
  current: string[],
): FreshnessClaim {
  const same = stored.length === current.length &&
    stored.every((s, i) => s === current[i]);

  if (same) {
    return { category, label, storedValue: `${stored.length} rules`, currentValue: `${current.length} rules`, status: 'fresh' };
  }

  return {
    category,
    label,
    storedValue: `${stored.length} rules`,
    currentValue: `${current.length} rules`,
    status: 'stale',
  };
}
