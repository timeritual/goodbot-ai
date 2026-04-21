import type { AnalysisInsights } from '../generators/index.js';
import type { AnalysisSnapshot } from './types.js';
import { safeReadJson, safeWriteJson } from '../utils/index.js';
import { snapshotPath } from '../config/index.js';

/** Build an AnalysisSnapshot from AnalysisInsights + metadata */
export function buildSnapshot(
  insights: AnalysisInsights,
  customRules: string[],
  moduleCount: number,
  filesParsed: number,
): AnalysisSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    healthGrade: insights.healthGrade,
    healthScore: insights.healthScore,
    circularDeps: insights.circularDeps,
    barrelViolations: insights.barrelViolations,
    layerViolations: insights.layerViolations,
    srpViolations: insights.srpViolations,
    complexityViolations: insights.complexityViolations,
    duplicationClusters: insights.duplicationClusters,
    deadExportCount: insights.deadExportCount,
    shallowModules: insights.shallowModules,
    godModules: insights.godModules,
    oversizedFiles: insights.oversizedFiles,
    highComplexityFiles: insights.highComplexityFiles,
    deadExportModules: insights.deadExportModules,
    hotspotFiles: insights.hotspotFiles,
    aiCommitRatio: insights.aiCommitRatio,
    temporalCouplings: insights.temporalCouplings,
    customRules,
    moduleCount,
    filesParsed,
  };
}

export async function saveSnapshot(
  projectRoot: string,
  snapshot: AnalysisSnapshot,
): Promise<void> {
  await safeWriteJson(snapshotPath(projectRoot), snapshot);
}

export async function loadSnapshot(
  projectRoot: string,
): Promise<AnalysisSnapshot | null> {
  return safeReadJson<AnalysisSnapshot>(snapshotPath(projectRoot));
}

/**
 * Reconstruct AnalysisInsights from a saved snapshot so generate can surface
 * the Current Health block on quick re-runs without re-running analysis.
 * The has* boolean flags are derived from the cached count fields.
 */
export function snapshotToInsights(snapshot: AnalysisSnapshot): AnalysisInsights {
  return {
    healthGrade: snapshot.healthGrade,
    healthScore: snapshot.healthScore,
    circularDeps: snapshot.circularDeps,
    barrelViolations: snapshot.barrelViolations,
    layerViolations: snapshot.layerViolations,
    srpViolations: snapshot.srpViolations,
    complexityViolations: snapshot.complexityViolations,
    duplicationClusters: snapshot.duplicationClusters,
    deadExportCount: snapshot.deadExportCount,
    shallowModules: snapshot.shallowModules,
    godModules: snapshot.godModules,
    oversizedFiles: snapshot.oversizedFiles,
    highComplexityFiles: snapshot.highComplexityFiles,
    deadExportModules: snapshot.deadExportModules,
    hotspotFiles: snapshot.hotspotFiles,
    aiCommitRatio: snapshot.aiCommitRatio,
    temporalCouplings: snapshot.temporalCouplings,
    hasCircularDeps: snapshot.circularDeps > 0,
    hasBarrelViolations: snapshot.barrelViolations > 0,
    hasLayerViolations: snapshot.layerViolations > 0,
    hasSrpIssues: snapshot.srpViolations > 0,
    hasComplexity: snapshot.complexityViolations > 0,
    hasDuplication: snapshot.duplicationClusters > 0,
    hasDeadExports: snapshot.deadExportCount > 0,
    hasShallowModules: snapshot.shallowModules.length > 0,
    hasGodModules: snapshot.godModules.length > 0,
    hasHotspots: snapshot.hotspotFiles.length > 0,
    hasTemporalCoupling: snapshot.temporalCouplings.length > 0,
    hasHighAIRatio: snapshot.aiCommitRatio >= 30,
  };
}
