import type { AnalysisInsights } from '../generators/types.js';
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
