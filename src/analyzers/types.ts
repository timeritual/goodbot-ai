/** A single parsed import from a source file */
export interface ParsedImport {
  specifier: string;
  resolvedPath: string | null;
  line: number;
  kind: 'import' | 'require' | 'reexport';
  /** The module name of the resolved import target (set during import resolution) */
  targetModule?: string;
}

/** All imports found in a single file */
export interface FileImports {
  filePath: string;
  moduleName: string;
  imports: ParsedImport[];
}

/** An edge in the module dependency graph */
export interface ModuleEdge {
  from: string;
  to: string;
  files: Array<{
    sourceFile: string;
    targetFile: string;
    line: number;
    specifier: string;
  }>;
}

/** A node in the module dependency graph */
export interface ModuleNode {
  name: string;
  path: string;
  fileCount: number;
  dependsOn: Set<string>;
  dependedOnBy: Set<string>;
}

/** Stability metrics for a module */
export interface StabilityMetrics {
  moduleName: string;
  afferentCoupling: number;
  efferentCoupling: number;
  instability: number;
}

/** A dependency that violates the Stable Dependency Principle */
export interface StabilityViolation {
  from: string;
  to: string;
  fromInstability: number;
  toInstability: number;
  files: ModuleEdge['files'];
}

/** A detected circular dependency */
export interface CircularDependency {
  cycle: string[];
  files: ModuleEdge['files'];
}

/** A barrel import bypass violation */
export interface BarrelViolation {
  file: string;
  line: number;
  specifier: string;
  targetModule: string;
  suggestion: string;
  sourceRole?: string;
  targetRole?: string;
}

/** Counts of violations that were suppressed (by `analysis.suppressions` rules) */
export interface SuppressionSummary {
  total: number;
  byRule: Record<string, number>;
  /**
   * Suppressions from config that didn't match any detected violation.
   * Likely indicates a typo in cycle pattern, a deleted/renamed file,
   * or a violation that's been fixed since the suppression was added.
   */
  orphaned: Array<{
    index: number;
    rule: string;
    file?: string;
    cycle?: string;
    reason: string;
  }>;
}

/** A layer ordering violation */
export interface LayerViolation {
  file: string;
  line: number;
  specifier: string;
  fromModule: string;
  fromLevel: number;
  fromRole?: string;
  toModule: string;
  toLevel: number;
  toRole?: string;
}

/** Complete analysis result */
export interface DependencyAnalysis {
  modules: ModuleNode[];
  edges: ModuleEdge[];
  stability: StabilityMetrics[];
  stabilityViolations: StabilityViolation[];
  circularDependencies: CircularDependency[];
  barrelViolations: BarrelViolation[];
  layerViolations: LayerViolation[];
  filesParsed: number;
  timeTakenMs: number;
}

// ─── SOLID Analysis ───────────────────────────────────────

export type SolidPrinciple = 'SRP' | 'OCP' | 'LSP' | 'ISP' | 'DIP' | 'CUSTOM';
export type ViolationSeverity = 'info' | 'warning' | 'error';

export interface SolidViolation {
  principle: SolidPrinciple;
  severity: ViolationSeverity;
  file: string;
  line?: number;
  message: string;
  suggestion: string;
}

export interface SolidScores {
  srp: number;   // 0-100
  dip: number;   // 0-100
  isp: number;   // 0-100
  overall: number;
}

export interface SolidAnalysis {
  violations: SolidViolation[];
  scores: SolidScores;
}

export interface AnalysisThresholds {
  maxFileLines: number;
  maxBarrelExports: number;
  maxModuleCoupling: number;
  maxFileComplexity?: number;       // cyclomatic complexity per file (default 20)
  maxComplexityDensity?: number;    // complexity per 100 lines (default 15)
}

export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  maxFileLines: 200,
  maxBarrelExports: 10,
  maxModuleCoupling: 6,
  maxFileComplexity: 25,
  maxComplexityDensity: 20,
};

// ─── Health Score ─────────────────────────────────────────

export type HealthGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

export interface HealthContributor {
  label: string;
  count: number;
  pointsLost: number;
}

export interface HealthScore {
  grade: HealthGrade;
  score: number;        // 0-100
  breakdown: {
    dependencies: number;  // 0-100
    stability: number;
    solid: number;
    architecture: number;
  };
  contributors: HealthContributor[];
}

// ─── Full Analysis Result ─────────────────────────────────

export interface FullAnalysis {
  dependency: DependencyAnalysis;
  solid: SolidAnalysis;
  health: HealthScore;
  suppressions?: SuppressionSummary;
}

/** Lightweight summary for generator context */
export interface DependencyAnalysisSummary {
  moduleCount: number;
  edgeCount: number;
  circularDependencyCount: number;
  barrelViolationCount: number;
  layerViolationCount: number;
  stabilityViolationCount: number;
  topViolations: string[];
}
