import { describe, it, expect } from 'vitest';
import { buildSnapshot, snapshotToInsights } from './snapshot.js';
import type { AnalysisInsights } from '../generators/index.js';

function makeInsights(overrides: Partial<AnalysisInsights> = {}): AnalysisInsights {
  return {
    healthGrade: 'B+',
    healthScore: 80,
    circularDeps: 2,
    barrelViolations: 5,
    layerViolations: 1,
    srpViolations: 3,
    complexityViolations: 2,
    duplicationClusters: 1,
    deadExportCount: 4,
    shallowModules: ['utils'],
    godModules: ['contexts'],
    oversizedFiles: ['Canvas.tsx'],
    highComplexityFiles: ['calculations.ts'],
    deadExportModules: [{ module: 'services', exports: ['unused1'] }],
    hotspotFiles: ['Canvas.tsx', 'api.ts'],
    aiCommitRatio: 35,
    temporalCouplings: [{ fileA: 'a.ts', fileB: 'b.ts', strength: 0.8 }],
    hasCircularDeps: true,
    hasBarrelViolations: true,
    hasLayerViolations: true,
    hasSrpIssues: true,
    hasComplexity: true,
    hasDuplication: true,
    hasDeadExports: true,
    hasShallowModules: true,
    hasGodModules: true,
    hasHotspots: true,
    hasTemporalCoupling: true,
    hasHighAIRatio: true,
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('creates a snapshot from analysis insights', () => {
    const insights = makeInsights();
    const snapshot = buildSnapshot(insights, ['rule1'], 6, 42);

    expect(snapshot.healthGrade).toBe('B+');
    expect(snapshot.healthScore).toBe(80);
    expect(snapshot.circularDeps).toBe(2);
    expect(snapshot.barrelViolations).toBe(5);
    expect(snapshot.customRules).toEqual(['rule1']);
    expect(snapshot.moduleCount).toBe(6);
    expect(snapshot.filesParsed).toBe(42);
    expect(snapshot.generatedAt).toBeDefined();
  });

  it('copies all violation counts from insights', () => {
    const insights = makeInsights({
      layerViolations: 7,
      srpViolations: 12,
      complexityViolations: 5,
      duplicationClusters: 3,
      deadExportCount: 9,
    });
    const snapshot = buildSnapshot(insights, [], 0, 0);

    expect(snapshot.layerViolations).toBe(7);
    expect(snapshot.srpViolations).toBe(12);
    expect(snapshot.complexityViolations).toBe(5);
    expect(snapshot.duplicationClusters).toBe(3);
    expect(snapshot.deadExportCount).toBe(9);
  });

  it('copies file and module lists from insights', () => {
    const insights = makeInsights({
      shallowModules: ['mod1', 'mod2'],
      godModules: ['bigmod'],
      oversizedFiles: ['big.ts'],
      highComplexityFiles: ['complex.ts'],
      hotspotFiles: ['hot.ts'],
    });
    const snapshot = buildSnapshot(insights, [], 0, 0);

    expect(snapshot.shallowModules).toEqual(['mod1', 'mod2']);
    expect(snapshot.godModules).toEqual(['bigmod']);
    expect(snapshot.oversizedFiles).toEqual(['big.ts']);
    expect(snapshot.highComplexityFiles).toEqual(['complex.ts']);
    expect(snapshot.hotspotFiles).toEqual(['hot.ts']);
  });

  it('copies git history data from insights', () => {
    const insights = makeInsights({
      aiCommitRatio: 42,
      temporalCouplings: [{ fileA: 'x.ts', fileB: 'y.ts', strength: 0.9 }],
    });
    const snapshot = buildSnapshot(insights, [], 0, 0);

    expect(snapshot.aiCommitRatio).toBe(42);
    expect(snapshot.temporalCouplings).toEqual([{ fileA: 'x.ts', fileB: 'y.ts', strength: 0.9 }]);
  });

  it('does not include boolean flags from insights', () => {
    const insights = makeInsights();
    const snapshot = buildSnapshot(insights, [], 0, 0);

    // Snapshot should not have the boolean flags — those are template concerns
    expect(snapshot).not.toHaveProperty('hasCircularDeps');
    expect(snapshot).not.toHaveProperty('hasBarrelViolations');
  });

  it('sets generatedAt to a valid ISO timestamp', () => {
    const before = new Date();
    const snapshot = buildSnapshot(makeInsights(), [], 0, 0);
    const after = new Date();

    const generated = new Date(snapshot.generatedAt);
    expect(generated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(generated.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('snapshotToInsights', () => {
  it('round-trips count fields and arrays', () => {
    const original = makeInsights();
    const snapshot = buildSnapshot(original, [], 0, 0);
    const restored = snapshotToInsights(snapshot);

    expect(restored.healthGrade).toBe(original.healthGrade);
    expect(restored.healthScore).toBe(original.healthScore);
    expect(restored.circularDeps).toBe(original.circularDeps);
    expect(restored.barrelViolations).toBe(original.barrelViolations);
    expect(restored.layerViolations).toBe(original.layerViolations);
    expect(restored.srpViolations).toBe(original.srpViolations);
    expect(restored.oversizedFiles).toEqual(original.oversizedFiles);
    expect(restored.hotspotFiles).toEqual(original.hotspotFiles);
    expect(restored.deadExportModules).toEqual(original.deadExportModules);
    expect(restored.temporalCouplings).toEqual(original.temporalCouplings);
  });

  it('derives has* flags from count fields (non-zero → true)', () => {
    const snapshot = buildSnapshot(makeInsights(), [], 0, 0);
    const restored = snapshotToInsights(snapshot);

    expect(restored.hasCircularDeps).toBe(true);
    expect(restored.hasBarrelViolations).toBe(true);
    expect(restored.hasLayerViolations).toBe(true);
    expect(restored.hasSrpIssues).toBe(true);
    expect(restored.hasComplexity).toBe(true);
    expect(restored.hasDuplication).toBe(true);
    expect(restored.hasDeadExports).toBe(true);
    expect(restored.hasShallowModules).toBe(true);
    expect(restored.hasGodModules).toBe(true);
    expect(restored.hasHotspots).toBe(true);
    expect(restored.hasTemporalCoupling).toBe(true);
    expect(restored.hasHighAIRatio).toBe(true);
  });

  it('derives has* flags to false when count/array is zero/empty', () => {
    const cleanInsights = makeInsights({
      circularDeps: 0,
      barrelViolations: 0,
      layerViolations: 0,
      srpViolations: 0,
      complexityViolations: 0,
      duplicationClusters: 0,
      deadExportCount: 0,
      shallowModules: [],
      godModules: [],
      hotspotFiles: [],
      aiCommitRatio: 0,
      temporalCouplings: [],
    });
    const snapshot = buildSnapshot(cleanInsights, [], 0, 0);
    const restored = snapshotToInsights(snapshot);

    expect(restored.hasCircularDeps).toBe(false);
    expect(restored.hasBarrelViolations).toBe(false);
    expect(restored.hasLayerViolations).toBe(false);
    expect(restored.hasSrpIssues).toBe(false);
    expect(restored.hasComplexity).toBe(false);
    expect(restored.hasDuplication).toBe(false);
    expect(restored.hasDeadExports).toBe(false);
    expect(restored.hasShallowModules).toBe(false);
    expect(restored.hasGodModules).toBe(false);
    expect(restored.hasHotspots).toBe(false);
    expect(restored.hasTemporalCoupling).toBe(false);
    expect(restored.hasHighAIRatio).toBe(false);
  });

  it('treats AI commit ratio >= 30 as high', () => {
    const snapshot = buildSnapshot(makeInsights({ aiCommitRatio: 30 }), [], 0, 0);
    expect(snapshotToInsights(snapshot).hasHighAIRatio).toBe(true);

    const snapshotLow = buildSnapshot(makeInsights({ aiCommitRatio: 29 }), [], 0, 0);
    expect(snapshotToInsights(snapshotLow).hasHighAIRatio).toBe(false);
  });
});
