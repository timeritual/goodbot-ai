import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './snapshot.js';
import type { AnalysisInsights } from '../generators/types.js';

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
