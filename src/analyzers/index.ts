import path from 'node:path';
import type { StructureAnalysis, DetectedLayer } from '../scanners/types.js';
import type { GoodbotConfig } from '../config/index.js';
import type { DependencyAnalysis, DependencyAnalysisSummary, FileImports } from './types.js';
import { parseFileImports } from './import-parser.js';
import { collectSourceFiles, getModuleName, resolveImportPath } from './module-resolver.js';
import { buildDependencyGraph } from './graph-builder.js';
import { calculateStability, findStabilityViolations } from './stability.js';
import { findCircularDependencies } from './cycles.js';
import { findBarrelViolations } from './barrel-checker.js';
import { findLayerViolations } from './layer-checker.js';

export type { DependencyAnalysis, DependencyAnalysisSummary } from './types.js';

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
