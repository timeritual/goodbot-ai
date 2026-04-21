export interface GeneratorContext {
  project: {
    name: string;
    framework: string;
    language: string;
    description?: string;
  };
  architecture: {
    layers: Array<{
      name: string;
      path: string;
      level: number;
      hasBarrel: boolean;
      description?: string;
      role?: { id: string; displayName: string; description: string; isLeaf?: boolean };
    }>;
    dependencyDirection: string;
    barrelImportRule: string;
    interfaceContracts: boolean;
    layerDiagramAscii: string;
    systemType: 'api' | 'ui' | 'mixed' | 'library';
    systemTypeLabel: string;
  };
  businessLogic: {
    allowedIn: string[];
    forbiddenIn: string[];
    redFlags: string[];
    layers: Array<{ name: string; should: string; shouldNot: string; role: 'allowed' | 'forbidden' }>;
  };
  verification: {
    commands: Array<{ name: string; command: string }>;
  };
  conventions: {
    mainBranch: string;
    importStyle: string;
    customRules: string[];
  };
  ignore: {
    paths: string[];
    sensitiveFiles: string[];
  };
  // Framework-tailored SOLID examples
  srpExample: string;
  dipExample: string;
  ocpExample: string;
  // Computed flags
  isTypescript: boolean;
  hasBarrels: boolean;
  hasLayers: boolean;
  hasRedFlags: boolean;
  hasCustomRules: boolean;
  hasVerification: boolean;
  // Optional dependency analysis (legacy)
  dependencyAnalysis?: {
    moduleCount: number;
    circularDependencyCount: number;
    barrelViolationCount: number;
    layerViolationCount: number;
    stabilityViolationCount: number;
    topViolations: string[];
  };
  hasAnalysis: boolean;
  // Full analysis insights for adaptive guardrails
  analysisInsights?: AnalysisInsights;
  // Framework-specific patterns detected by scanner
  frameworkPatterns?: {
    conventions: Array<{ name: string; description: string; evidence: string }>;
    structuralNotes: string[];
  };
  hasFrameworkPatterns: boolean;
}

/** Structured analysis data for adaptive guardrail generation */
export interface AnalysisInsights {
  healthGrade: string;
  healthScore: number;
  // Violation counts by category
  circularDeps: number;
  barrelViolations: number;
  layerViolations: number;
  srpViolations: number;
  complexityViolations: number;
  duplicationClusters: number;
  deadExportCount: number;
  shallowModules: string[];
  godModules: string[];
  // Top problem files (for targeted rules)
  oversizedFiles: string[];
  highComplexityFiles: string[];
  deadExportModules: Array<{ module: string; exports: string[] }>;
  // Git history insights
  hotspotFiles: string[];
  aiCommitRatio: number;         // 0-100 percentage
  temporalCouplings: Array<{ fileA: string; fileB: string; strength: number }>;
  // Flags for conditional template sections
  hasCircularDeps: boolean;
  hasBarrelViolations: boolean;
  hasLayerViolations: boolean;
  hasSrpIssues: boolean;
  hasComplexity: boolean;
  hasDuplication: boolean;
  hasDeadExports: boolean;
  hasShallowModules: boolean;
  hasGodModules: boolean;
  hasHotspots: boolean;
  hasTemporalCoupling: boolean;
  hasHighAIRatio: boolean;
}

export interface GeneratedFile {
  fileName: string;
  relativePath: string;
  content: string;
  mergeWithExisting: boolean;
}
