import type { GoodbotConfig } from '../config/index.js';
import type { DependencyAnalysisSummary, FullAnalysis, GitHistoryAnalysis, TemporalCoupling } from '../analyzers/index.js';
import type { FrameworkPatterns } from '../scanners/index.js';
import type { GeneratorContext, AnalysisInsights } from './types.js';

function buildLayerDiagram(
  layers: GoodbotConfig['architecture']['layers'],
): string {
  if (layers.length === 0) return '';

  const maxNameLen = Math.max(...layers.map((l) => l.name.length));
  const maxPathLen = Math.max(...layers.map((l) => l.path.length));

  const lines: string[] = [];
  // Sort by level descending for the diagram (highest = top)
  const sorted = [...layers].sort((a, b) => b.level - a.level);

  for (const layer of sorted) {
    const barrel = layer.hasBarrel ? '(barrel)' : '';
    lines.push(
      `  Layer ${layer.level}:  ${layer.name.padEnd(maxNameLen)}  ← ${layer.path.padEnd(maxPathLen)}  ${barrel}`,
    );
  }

  return lines.join('\n');
}

export function buildContext(
  config: GoodbotConfig,
  analysisSummary?: DependencyAnalysisSummary,
  fullAnalysis?: FullAnalysis,
  gitHistory?: GitHistoryAnalysis,
  temporalCouplings?: TemporalCoupling[],
  frameworkPatterns?: FrameworkPatterns,
): GeneratorContext {
  const { project, architecture, businessLogic, verification, conventions, ignore } = config;

  const verificationCommands: Array<{ name: string; command: string }> = [];
  if (verification.typecheck) verificationCommands.push({ name: 'Type check', command: verification.typecheck });
  if (verification.lint) verificationCommands.push({ name: 'Lint', command: verification.lint });
  if (verification.test) verificationCommands.push({ name: 'Test', command: verification.test });
  if (verification.format) verificationCommands.push({ name: 'Format', command: verification.format });
  if (verification.build) verificationCommands.push({ name: 'Build', command: verification.build });

  const fw = project.framework;

  return {
    project,
    architecture: {
      ...architecture,
      layerDiagramAscii: buildLayerDiagram(architecture.layers),
    },
    businessLogic,
    verification: { commands: verificationCommands },
    conventions,
    ignore,
    isReact: fw === 'react',
    isReactNative: fw === 'react-native',
    isNext: fw === 'next',
    isNode: fw === 'node' || fw === 'express' || fw === 'nest',
    isPython: fw === 'python' || fw === 'django' || fw === 'flask' || fw === 'fastapi',
    isTypescript: project.language === 'typescript',
    hasBarrels: architecture.barrelImportRule !== 'none',
    hasLayers: architecture.layers.length > 0,
    hasRedFlags: businessLogic.redFlags.length > 0,
    hasCustomRules: conventions.customRules.length > 0,
    hasVerification: verificationCommands.length > 0,
    dependencyAnalysis: analysisSummary ? {
      moduleCount: analysisSummary.moduleCount,
      circularDependencyCount: analysisSummary.circularDependencyCount,
      barrelViolationCount: analysisSummary.barrelViolationCount,
      layerViolationCount: analysisSummary.layerViolationCount,
      stabilityViolationCount: analysisSummary.stabilityViolationCount,
      topViolations: analysisSummary.topViolations,
    } : undefined,
    hasAnalysis: !!analysisSummary,
    analysisInsights: fullAnalysis ? buildAnalysisInsights(fullAnalysis, gitHistory, temporalCouplings) : undefined,
    frameworkPatterns: frameworkPatterns && (frameworkPatterns.conventions.length > 0 || frameworkPatterns.structuralNotes.length > 0)
      ? frameworkPatterns
      : undefined,
    hasFrameworkPatterns: !!frameworkPatterns && (frameworkPatterns.conventions.length > 0 || frameworkPatterns.structuralNotes.length > 0),
  };
}

function buildAnalysisInsights(
  analysis: FullAnalysis,
  gitHistory?: GitHistoryAnalysis,
  temporalCouplings?: TemporalCoupling[],
): AnalysisInsights {
  const { dependency: dep, solid, health } = analysis;

  const srpViolations = solid.violations.filter(v => v.principle === 'SRP');
  const complexityViolations = srpViolations.filter(v => v.message.includes('complexity') || v.message.includes('Complexity'));
  const duplicationViolations = srpViolations.filter(v => v.message.includes('duplicat'));
  const deadExportViolations = solid.violations.filter(v => v.message.includes('Dead export'));
  const shallowViolations = solid.violations.filter(v => v.message.includes('Shallow module'));
  const godViolations = solid.violations.filter(v => v.message.includes('God module'));
  const oversizedViolations = srpViolations.filter(v => v.message.includes('lines (threshold'));

  // Extract dead export details
  const deadExportModules: AnalysisInsights['deadExportModules'] = [];
  for (const v of deadExportViolations) {
    const match = v.message.match(/Dead exports in (\w+): (.+) \(/);
    if (match) {
      deadExportModules.push({
        module: match[1],
        exports: match[2].split(', ').slice(0, 8),
      });
    }
  }

  return {
    healthGrade: health.grade,
    healthScore: health.score,
    circularDeps: dep.circularDependencies.length,
    barrelViolations: dep.barrelViolations.length,
    layerViolations: dep.layerViolations.length,
    srpViolations: srpViolations.length,
    complexityViolations: complexityViolations.length,
    duplicationClusters: duplicationViolations.length,
    deadExportCount: deadExportViolations.length,
    shallowModules: shallowViolations.map(v => {
      const match = v.message.match(/Shallow module: (\w+)/);
      return match ? match[1] : v.file;
    }),
    godModules: godViolations.map(v => {
      const match = v.message.match(/God module: (\w+)/);
      return match ? match[1] : v.file;
    }),
    oversizedFiles: [...new Set(oversizedViolations.map(v => v.file))].slice(0, 10),
    highComplexityFiles: [...new Set(complexityViolations.map(v => v.file))].slice(0, 10),
    deadExportModules,
    // Git history insights
    hotspotFiles: gitHistory
      ? gitHistory.hotspots.slice(0, 10).map(h => h.file)
      : [],
    aiCommitRatio: gitHistory ? Math.round(gitHistory.aiCommitRatio * 100) : 0,
    temporalCouplings: (temporalCouplings ?? []).slice(0, 5).map(tc => ({
      fileA: tc.fileA,
      fileB: tc.fileB,
      strength: tc.couplingStrength,
    })),
    // Flags
    hasCircularDeps: dep.circularDependencies.length > 0,
    hasBarrelViolations: dep.barrelViolations.length > 0,
    hasLayerViolations: dep.layerViolations.length > 0,
    hasSrpIssues: srpViolations.length > 0,
    hasComplexity: complexityViolations.length > 0,
    hasDuplication: duplicationViolations.length > 0,
    hasDeadExports: deadExportViolations.length > 0,
    hasShallowModules: shallowViolations.length > 0,
    hasGodModules: godViolations.length > 0,
    hasHotspots: (gitHistory?.hotspots.length ?? 0) > 0,
    hasTemporalCoupling: (temporalCouplings?.length ?? 0) > 0,
    hasHighAIRatio: (gitHistory?.aiCommitRatio ?? 0) >= 0.3,
  };
}
