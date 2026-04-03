import path from 'node:path';
import type { StructureAnalysis, DetectedLayer } from '../scanners/types.js';
import type { GoodbotConfig } from '../config/index.js';
import type {
  DependencyAnalysis, DependencyAnalysisSummary, FileImports,
  FullAnalysis, SolidAnalysis, HealthScore, AnalysisThresholds,
} from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';
import { parseFileImports } from './import-parser.js';
import { collectSourceFiles, getModuleName, resolveImportPath } from './module-resolver.js';
import { buildDependencyGraph } from './graph-builder.js';
import { calculateStability, findStabilityViolations } from './stability.js';
import { findCircularDependencies } from './cycles.js';
import { findBarrelViolations } from './barrel-checker.js';
import { findLayerViolations } from './layer-checker.js';
import { runSolidAnalysis } from './solid.js';
import { calculateHealthScore } from './health-score.js';
import { loadIgnoreRules, filterSolidViolations, filterLayerViolations, filterBarrelViolations } from './ignore.js';
import { checkCustomRules } from './custom-rules.js';

export type { DependencyAnalysis, DependencyAnalysisSummary, FullAnalysis, SolidAnalysis, HealthScore } from './types.js';

const BATCH_SIZE = 50;

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

  // 1. Collect source files
  const sourceFiles = await collectSourceFiles(srcRootAbsolute);
  if (sourceFiles.length === 0) {
    return emptyAnalysis(0);
  }

  // 2. Parse imports from all files (batched)
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

  // 3. Resolve import paths and assign target modules
  for (const fi of allFileImports) {
    const fileAbsolute = path.resolve(projectRoot, fi.filePath);
    const fileDir = path.dirname(fileAbsolute);

    for (const imp of fi.imports) {
      const resolved = await resolveImportPath(imp.specifier, fileDir);
      imp.resolvedPath = resolved ? path.relative(projectRoot, resolved) : null;

      if (resolved) {
        const targetModule = getModuleName(resolved, srcRootAbsolute);
        // Attach target module to import for use by analyzers
        (imp as { _targetModule?: string })._targetModule = targetModule;
      }
    }
  }

  // 4. Build dependency graph
  const { modules, edges } = buildDependencyGraph(allFileImports);

  // Enrich module paths from detected layers
  const layerPaths = new Map(structure.detectedLayers.map((l) => [l.name, l.path]));
  for (const mod of modules) {
    mod.path = layerPaths.get(mod.name) ?? mod.name;
  }

  // 5. Run analyses
  const stability = calculateStability(modules);
  const stabilityViolations = findStabilityViolations(stability, edges);
  const circularDependencies = findCircularDependencies(modules, edges);

  // Use config layers if available, otherwise use detected layers
  const layers: Array<{ name: string; level: number }> = config?.architecture.layers.length
    ? config.architecture.layers
    : structure.detectedLayers.map((l) => ({ name: l.name, level: l.suggestedLevel }));

  const barrelViolations =
    (config?.architecture.barrelImportRule === 'always' || structure.hasBarrelFiles)
      ? findBarrelViolations(allFileImports, structure.detectedLayers, srcRootAbsolute)
      : [];

  const layerViolations = layers.length > 0
    ? findLayerViolations(allFileImports, layers)
    : [];

  return {
    modules,
    edges,
    stability,
    stabilityViolations,
    circularDependencies,
    barrelViolations,
    layerViolations,
    filesParsed: sourceFiles.length,
    timeTakenMs: Date.now() - startTime,
  };
}

export function summarizeAnalysis(analysis: DependencyAnalysis): DependencyAnalysisSummary {
  const topViolations: string[] = [];

  for (const cd of analysis.circularDependencies.slice(0, 2)) {
    topViolations.push(`Circular: ${cd.cycle.join(' → ')}`);
  }
  for (const lv of analysis.layerViolations.slice(0, 2)) {
    topViolations.push(`Layer: ${lv.fromModule} (L${lv.fromLevel}) → ${lv.toModule} (L${lv.toLevel})`);
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
): Promise<FullAnalysis> {
  const startTime = Date.now();

  if (!structure.srcRoot) {
    const dep = emptyAnalysis(0);
    const solid: SolidAnalysis = { violations: [], scores: { srp: 100, dip: 100, isp: 100, overall: 100 } };
    const health = calculateHealthScore(dep, solid);
    return { dependency: dep, solid, health };
  }

  const srcRootAbsolute = path.resolve(projectRoot, structure.srcRoot);
  const sourceFiles = await collectSourceFiles(srcRootAbsolute);

  if (sourceFiles.length === 0) {
    const dep = emptyAnalysis(0);
    const solid: SolidAnalysis = { violations: [], scores: { srp: 100, dip: 100, isp: 100, overall: 100 } };
    const health = calculateHealthScore(dep, solid);
    return { dependency: dep, solid, health };
  }

  // Parse all imports
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

  // Resolve imports
  for (const fi of allFileImports) {
    const fileAbsolute = path.resolve(projectRoot, fi.filePath);
    const fileDir = path.dirname(fileAbsolute);
    for (const imp of fi.imports) {
      const resolved = await resolveImportPath(imp.specifier, fileDir);
      imp.resolvedPath = resolved ? path.relative(projectRoot, resolved) : null;
      if (resolved) {
        (imp as { _targetModule?: string })._targetModule = getModuleName(resolved, srcRootAbsolute);
      }
    }
  }

  // Dependency analysis
  const { modules, edges } = buildDependencyGraph(allFileImports);
  const layerPaths = new Map(structure.detectedLayers.map((l) => [l.name, l.path]));
  for (const mod of modules) {
    mod.path = layerPaths.get(mod.name) ?? mod.name;
  }

  const stability = calculateStability(modules);
  const stabilityViolations = findStabilityViolations(stability, edges);
  const circularDependencies = findCircularDependencies(modules, edges);

  const layers: Array<{ name: string; level: number }> = config?.architecture.layers.length
    ? config.architecture.layers
    : structure.detectedLayers.map((l) => ({ name: l.name, level: l.suggestedLevel }));

  const barrelViolations =
    (config?.architecture.barrelImportRule === 'always' || structure.hasBarrelFiles)
      ? findBarrelViolations(allFileImports, structure.detectedLayers, srcRootAbsolute)
      : [];

  const layerViolations = layers.length > 0
    ? findLayerViolations(allFileImports, layers)
    : [];

  const dep: DependencyAnalysis = {
    modules, edges, stability, stabilityViolations,
    circularDependencies, barrelViolations, layerViolations,
    filesParsed: sourceFiles.length,
    timeTakenMs: Date.now() - startTime,
  };

  // SOLID analysis
  const thresholds: AnalysisThresholds = config
    ? { ...DEFAULT_THRESHOLDS, ...(config as { analysis?: { thresholds?: Partial<AnalysisThresholds> } }).analysis?.thresholds }
    : DEFAULT_THRESHOLDS;

  const solid = await runSolidAnalysis(
    allFileImports, sourceFiles, structure.detectedLayers,
    projectRoot, srcRootAbsolute, thresholds,
  );

  // Custom rules
  const customRules = (config as { customRulesConfig?: Array<{ name: string; pattern: string; description?: string; forbidden_in?: string[]; required_in?: string[]; max_imports?: number; severity?: 'info' | 'warning' | 'error' }> })?.customRulesConfig ?? [];
  if (customRules.length > 0) {
    const customViolations = checkCustomRules(allFileImports, customRules);
    solid.violations.push(...customViolations);
  }

  // Apply ignore rules
  const ignoreRules = await loadIgnoreRules(projectRoot);
  dep.layerViolations = filterLayerViolations(dep.layerViolations, ignoreRules);
  dep.barrelViolations = filterBarrelViolations(dep.barrelViolations, ignoreRules);
  solid.violations = filterSolidViolations(solid.violations, ignoreRules);

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
