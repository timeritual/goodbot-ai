import path from 'node:path';
import type { StructureAnalysis } from '../scanners/index.js';
import type { GoodbotConfig } from '../config/index.js';
import type {
  DependencyAnalysis, DependencyAnalysisSummary, FileImports,
  FullAnalysis, SolidAnalysis, AnalysisThresholds,
} from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';
import { parseFileImports } from './import-parser.js';
import { collectSourceFiles, getModuleName, resolveImportPath } from './module-resolver.js';

export { collectSourceFiles } from './module-resolver.js';
import { buildDependencyGraph } from './graph-builder.js';
import { calculateStability, findStabilityViolations } from './stability.js';
import { findCircularDependencies } from './cycles.js';
import { findBarrelViolations } from './barrel-checker.js';
import { findLayerViolations } from './layer-checker.js';
import { runSolidAnalysis } from './solid.js';
import { calculateHealthScore } from './health-score.js';
import { loadIgnoreRules, filterSolidViolations, filterLayerViolations, filterBarrelViolations } from './ignore.js';
import {
  filterCyclesByFile,
  filterLayerViolationsByFile,
  filterBarrelViolationsByFile,
  filterStabilityViolationsByFile,
  filterSolidViolationsByCategory,
} from './analysis-ignore.js';
import { checkCustomRules } from './custom-rules.js';

export type { DependencyAnalysis, DependencyAnalysisSummary, FullAnalysis, SolidAnalysis, HealthScore, HealthGrade, BarrelViolation } from './types.js';
export { analyzeGitHistory, type GitHistoryAnalysis, type FileHotspot, type GitCommit } from './git-history.js';
export { findTemporalCoupling, type TemporalCoupling } from './temporal-coupling.js';
export { checkDeadExports, type DeadExportResult } from './dead-export-checker.js';

const BATCH_SIZE = 50;

// ─── Shared Import Parsing Pipeline ──────────────────────

interface ParsedImportData {
  allFileImports: FileImports[];
  sourceFiles: string[];
  srcRootAbsolute: string;
}

async function parseAndResolveImports(
  projectRoot: string,
  srcRootAbsolute: string,
): Promise<ParsedImportData> {
  const sourceFiles = await collectSourceFiles(srcRootAbsolute);
  if (sourceFiles.length === 0) {
    return { allFileImports: [], sourceFiles, srcRootAbsolute };
  }

  // Parse imports from all files (batched)
  const allFileImports: FileImports[] = [];
  for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
    const batch = sourceFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const imports = await parseFileImports(filePath);
        const moduleName = getModuleName(filePath, srcRootAbsolute);
        return { filePath: path.relative(projectRoot, filePath), moduleName, imports };
      }),
    );
    allFileImports.push(...results);
  }

  // Resolve import paths and assign target modules
  for (const fi of allFileImports) {
    const fileAbsolute = path.resolve(projectRoot, fi.filePath);
    const fileDir = path.dirname(fileAbsolute);

    for (const imp of fi.imports) {
      const resolved = await resolveImportPath(imp.specifier, fileDir);
      imp.resolvedPath = resolved ? path.relative(projectRoot, resolved) : null;

      if (resolved) {
        imp.targetModule = getModuleName(resolved, srcRootAbsolute);
      }
    }
  }

  return { allFileImports, sourceFiles, srcRootAbsolute };
}

function buildDependencyAnalysis(
  allFileImports: FileImports[],
  sourceFiles: string[],
  structure: StructureAnalysis,
  srcRootAbsolute: string,
  config?: GoodbotConfig,
): DependencyAnalysis & { _startTime?: never } {
  const { modules, edges } = buildDependencyGraph(allFileImports);

  // Enrich module paths from detected layers
  const layerPaths = new Map(structure.detectedLayers.map((l) => [l.name, l.path]));
  for (const mod of modules) {
    mod.path = layerPaths.get(mod.name) ?? mod.name;
  }

  const stability = calculateStability(modules);
  const stabilityViolations = findStabilityViolations(stability, edges);
  const circularDependencies = findCircularDependencies(modules, edges);

  // Use config layers if available, otherwise use detected layers
  const layers: Array<{ name: string; level: number; role?: string }> = config?.architecture.layers.length
    ? config.architecture.layers.map((l) => ({ name: l.name, level: l.level, role: l.role?.displayName }))
    : structure.detectedLayers.map((l) => ({ name: l.name, level: l.suggestedLevel, role: l.role?.displayName }));

  const barrelViolations =
    (config?.architecture.barrelImportRule === 'always' || structure.hasBarrelFiles)
      ? findBarrelViolations(allFileImports, structure.detectedLayers, srcRootAbsolute)
      : [];

  const layerViolations = layers.length > 0
    ? findLayerViolations(allFileImports, layers)
    : [];

  return {
    modules, edges, stability, stabilityViolations,
    circularDependencies, barrelViolations, layerViolations,
    filesParsed: sourceFiles.length,
    timeTakenMs: 0,
  };
}

// ─── Public API ──────────────────────────────────────────

export async function runDependencyAnalysis(
  projectRoot: string,
  structure: StructureAnalysis,
  config?: GoodbotConfig,
): Promise<DependencyAnalysis> {
  const startTime = Date.now();

  if (!structure.srcRoot) {
    return emptyAnalysis(0);
  }

  const srcRootAbsolute = path.resolve(projectRoot, structure.srcRoot);
  const { allFileImports, sourceFiles } = await parseAndResolveImports(projectRoot, srcRootAbsolute);

  if (sourceFiles.length === 0) {
    return emptyAnalysis(0);
  }

  const dep = buildDependencyAnalysis(allFileImports, sourceFiles, structure, srcRootAbsolute, config);
  dep.timeTakenMs = Date.now() - startTime;
  return dep;
}

export function summarizeAnalysis(analysis: DependencyAnalysis): DependencyAnalysisSummary {
  const topViolations: string[] = [];

  for (const cd of analysis.circularDependencies.slice(0, 2)) {
    topViolations.push(`Circular: ${cd.cycle.join(' → ')}`);
  }
  for (const lv of analysis.layerViolations.slice(0, 2)) {
    const fromLabel = lv.fromRole ? `[${lv.fromRole}] ${lv.fromModule}` : `${lv.fromModule} (L${lv.fromLevel})`;
    const toLabel = lv.toRole ? `[${lv.toRole}] ${lv.toModule}` : `${lv.toModule} (L${lv.toLevel})`;
    topViolations.push(`Layer: ${fromLabel} → ${toLabel}`);
  }
  for (const sv of analysis.stabilityViolations.slice(0, 1)) {
    topViolations.push(`Stability: ${sv.from} (I=${sv.fromInstability}) → ${sv.to} (I=${sv.toInstability})`);
  }

  return {
    moduleCount: analysis.modules.length,
    edgeCount: analysis.edges.length,
    circularDependencyCount: analysis.circularDependencies.length,
    barrelViolationCount: analysis.barrelViolations.length,
    layerViolationCount: analysis.layerViolations.length,
    stabilityViolationCount: analysis.stabilityViolations.length,
    topViolations,
  };
}

/**
 * Run full analysis: dependencies + SOLID + health score.
 */
export async function runFullAnalysis(
  projectRoot: string,
  structure: StructureAnalysis,
  config?: GoodbotConfig,
  options: { noIgnore?: boolean } = {},
): Promise<FullAnalysis> {
  const startTime = Date.now();

  if (!structure.srcRoot) {
    const dep = emptyAnalysis(0);
    const solid: SolidAnalysis = { violations: [], scores: { srp: 0, dip: 0, isp: 0, overall: 0 } };
    const health = calculateHealthScore(dep, solid);
    return { dependency: dep, solid, health };
  }

  const srcRootAbsolute = path.resolve(projectRoot, structure.srcRoot);
  const { allFileImports, sourceFiles } = await parseAndResolveImports(projectRoot, srcRootAbsolute);

  if (sourceFiles.length === 0) {
    const dep = emptyAnalysis(0);
    const solid: SolidAnalysis = { violations: [], scores: { srp: 0, dip: 0, isp: 0, overall: 0 } };
    const health = calculateHealthScore(dep, solid);
    return { dependency: dep, solid, health };
  }

  // Dependency analysis
  const dep = buildDependencyAnalysis(allFileImports, sourceFiles, structure, srcRootAbsolute, config);

  // SOLID analysis
  const thresholds: AnalysisThresholds = config
    ? { ...DEFAULT_THRESHOLDS, ...config.analysis?.thresholds }
    : DEFAULT_THRESHOLDS;

  const solid = await runSolidAnalysis(
    allFileImports, sourceFiles, structure.detectedLayers,
    projectRoot, srcRootAbsolute, thresholds, dep.modules,
  );

  // Custom rules
  const customRules = config?.customRulesConfig ?? [];
  if (customRules.length > 0) {
    const customViolations = checkCustomRules(allFileImports, customRules);
    solid.violations.push(...customViolations);
  }

  // Apply legacy .goodbot/ignore file rules
  const ignoreRules = await loadIgnoreRules(projectRoot);
  dep.layerViolations = filterLayerViolations(dep.layerViolations, ignoreRules);
  dep.barrelViolations = filterBarrelViolations(dep.barrelViolations, ignoreRules);
  solid.violations = filterSolidViolations(solid.violations, ignoreRules);

  // Apply analysis-scoped ignores from config (can be bypassed with --no-ignore)
  const scopedIgnore = config?.analysis.ignore;
  if (scopedIgnore && !options.noIgnore) {
    dep.circularDependencies = filterCyclesByFile(dep.circularDependencies, scopedIgnore.circularDeps);
    dep.layerViolations = filterLayerViolationsByFile(dep.layerViolations, scopedIgnore.layerViolations);
    dep.barrelViolations = filterBarrelViolationsByFile(dep.barrelViolations, scopedIgnore.barrelViolations);
    dep.stabilityViolations = filterStabilityViolationsByFile(dep.stabilityViolations, scopedIgnore.stabilityViolations);
    solid.violations = filterSolidViolationsByCategory(solid.violations, scopedIgnore);
  }

  // Health score
  const health = calculateHealthScore(dep, solid);

  // Update timing to include SOLID
  dep.timeTakenMs = Date.now() - startTime;

  return { dependency: dep, solid, health };
}

function emptyAnalysis(timeTakenMs: number): DependencyAnalysis {
  return {
    modules: [],
    edges: [],
    stability: [],
    stabilityViolations: [],
    circularDependencies: [],
    barrelViolations: [],
    layerViolations: [],
    filesParsed: 0,
    timeTakenMs,
  };
}
