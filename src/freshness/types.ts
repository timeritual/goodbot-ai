/** Structured snapshot of analysis claims at guardrail generation time */
export interface AnalysisSnapshot {
  generatedAt: string;
  // Health
  healthGrade: string;
  healthScore: number;
  // Violation counts
  circularDeps: number;
  barrelViolations: number;
  layerViolations: number;
  srpViolations: number;
  complexityViolations: number;
  duplicationClusters: number;
  deadExportCount: number;
  // Module-level issues
  shallowModules: string[];
  godModules: string[];
  // File-level issues
  oversizedFiles: string[];
  highComplexityFiles: string[];
  deadExportModules: Array<{ module: string; exports: string[] }>;
  // Git history
  hotspotFiles: string[];
  aiCommitRatio: number;
  temporalCouplings: Array<{ fileA: string; fileB: string; strength: number }>;
  // Config state at generation time
  customRules: string[];
  moduleCount: number;
  filesParsed: number;
}

export interface FreshnessClaim {
  category: string;
  label: string;
  storedValue: string | number;
  currentValue: string | number;
  status: 'fresh' | 'stale' | 'improved' | 'degraded';
  delta?: number;
}

export interface FreshnessReport {
  overallStatus: 'fresh' | 'stale' | 'degraded';
  generatedAt: string;
  checkedAt: string;
  daysSinceGeneration: number;
  claims: FreshnessClaim[];
  summary: {
    fresh: number;
    stale: number;
    degraded: number;
    improved: number;
  };
}
