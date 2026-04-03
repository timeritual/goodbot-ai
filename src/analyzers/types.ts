/** A single parsed import from a source file */
export interface ParsedImport {
  specifier: string;
  resolvedPath: string | null;
  line: number;
  kind: 'import' | 'require' | 'reexport';
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
}

/** A layer ordering violation */
export interface LayerViolation {
  file: string;
  line: number;
  specifier: string;
  fromModule: string;
  fromLevel: number;
  toModule: string;
  toLevel: number;
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
