import { describe, it, expect } from 'vitest';
import { compareFreshness } from './compare.js';
import type { AnalysisSnapshot } from './types.js';

function makeSnapshot(overrides: Partial<AnalysisSnapshot> = {}): AnalysisSnapshot {
  return {
    generatedAt: new Date().toISOString(),
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
    oversizedFiles: ['Canvas.tsx', 'api.ts'],
    highComplexityFiles: ['calculations.ts'],
    deadExportModules: [{ module: 'services', exports: ['unused1'] }],
    hotspotFiles: ['Canvas.tsx', 'api.ts', 'index.ts'],
    aiCommitRatio: 35,
    temporalCouplings: [{ fileA: 'a.ts', fileB: 'b.ts', strength: 0.8 }],
    customRules: ['Use zod for validation'],
    moduleCount: 6,
    filesParsed: 42,
    ...overrides,
  };
}

describe('compareFreshness', () => {
  it('reports all fresh when snapshots are identical', () => {
    const stored = makeSnapshot();
    const current = makeSnapshot();
    const report = compareFreshness(stored, current);

    expect(report.overallStatus).toBe('fresh');
    expect(report.summary.fresh).toBe(report.claims.length);
    expect(report.summary.stale).toBe(0);
    expect(report.summary.degraded).toBe(0);
    expect(report.summary.improved).toBe(0);
  });

  it('detects degraded violations when counts increase', () => {
    const stored = makeSnapshot({ circularDeps: 2 });
    const current = makeSnapshot({ circularDeps: 5 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'circular_deps')!;
    expect(claim.status).toBe('degraded');
    expect(claim.storedValue).toBe(2);
    expect(claim.currentValue).toBe(5);
    expect(claim.delta).toBe(3);
    expect(report.overallStatus).toBe('degraded');
  });

  it('detects improved violations when counts decrease', () => {
    const stored = makeSnapshot({ barrelViolations: 5 });
    const current = makeSnapshot({ barrelViolations: 2 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'barrel_violations')!;
    expect(claim.status).toBe('improved');
    expect(claim.delta).toBe(-3);
  });

  it('treats health score changes within threshold as fresh', () => {
    const stored = makeSnapshot({ healthScore: 80 });
    const current = makeSnapshot({ healthScore: 78 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'health_score')!;
    expect(claim.status).toBe('fresh');
  });

  it('detects health score degradation beyond threshold', () => {
    const stored = makeSnapshot({ healthScore: 80 });
    const current = makeSnapshot({ healthScore: 70 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'health_score')!;
    expect(claim.status).toBe('degraded');
    expect(claim.delta).toBe(-10);
  });

  it('detects health score improvement beyond threshold', () => {
    const stored = makeSnapshot({ healthScore: 70 });
    const current = makeSnapshot({ healthScore: 85 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'health_score')!;
    expect(claim.status).toBe('improved');
  });

  it('detects stale health grade', () => {
    const stored = makeSnapshot({ healthGrade: 'B+' });
    const current = makeSnapshot({ healthGrade: 'B' });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'health_grade')!;
    expect(claim.status).toBe('stale');
  });

  it('detects stale file lists when entries change', () => {
    const stored = makeSnapshot({ hotspotFiles: ['a.ts', 'b.ts', 'c.ts'] });
    const current = makeSnapshot({ hotspotFiles: ['a.ts', 'd.ts', 'e.ts'] });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'hotspots')!;
    expect(claim.status).toBe('stale');
  });

  it('treats empty lists as fresh', () => {
    const stored = makeSnapshot({ godModules: [] });
    const current = makeSnapshot({ godModules: [] });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'god_modules')!;
    expect(claim.status).toBe('fresh');
  });

  it('detects stale custom rules', () => {
    const stored = makeSnapshot({ customRules: ['Use zod for validation'] });
    const current = makeSnapshot({ customRules: ['Use valibot for validation'] });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'custom_rules')!;
    expect(claim.status).toBe('stale');
  });

  it('treats unchanged custom rules as fresh', () => {
    const stored = makeSnapshot({ customRules: ['rule1', 'rule2'] });
    const current = makeSnapshot({ customRules: ['rule1', 'rule2'] });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'custom_rules')!;
    expect(claim.status).toBe('fresh');
  });

  it('detects AI commit ratio drift beyond threshold', () => {
    const stored = makeSnapshot({ aiCommitRatio: 35 });
    const current = makeSnapshot({ aiCommitRatio: 55 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'ai_ratio')!;
    expect(claim.status).toBe('degraded');
  });

  it('treats minor AI ratio changes as fresh', () => {
    const stored = makeSnapshot({ aiCommitRatio: 35 });
    const current = makeSnapshot({ aiCommitRatio: 38 });
    const report = compareFreshness(stored, current);

    const claim = report.claims.find(c => c.category === 'ai_ratio')!;
    expect(claim.status).toBe('fresh');
  });

  it('overall status is stale when no degraded but some stale claims exist', () => {
    const stored = makeSnapshot({ healthGrade: 'B+' });
    const current = makeSnapshot({ healthGrade: 'A' });
    const report = compareFreshness(stored, current);

    // Grade changed but violations stayed same — stale but not degraded
    expect(report.overallStatus).toBe('stale');
  });

  it('overall status is degraded when any claim is degraded', () => {
    const stored = makeSnapshot({ circularDeps: 0 });
    const current = makeSnapshot({ circularDeps: 3 });
    const report = compareFreshness(stored, current);

    expect(report.overallStatus).toBe('degraded');
  });

  it('computes daysSinceGeneration correctly', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stored = makeSnapshot({ generatedAt: threeDaysAgo });
    const current = makeSnapshot();
    const report = compareFreshness(stored, current);

    expect(report.daysSinceGeneration).toBe(3);
  });

  it('handles all violation types degrading simultaneously', () => {
    const stored = makeSnapshot({
      circularDeps: 0,
      barrelViolations: 0,
      layerViolations: 0,
      srpViolations: 0,
      complexityViolations: 0,
      duplicationClusters: 0,
      deadExportCount: 0,
    });
    const current = makeSnapshot({
      circularDeps: 2,
      barrelViolations: 3,
      layerViolations: 1,
      srpViolations: 5,
      complexityViolations: 2,
      duplicationClusters: 1,
      deadExportCount: 4,
    });
    const report = compareFreshness(stored, current);

    expect(report.summary.degraded).toBe(7);
    expect(report.overallStatus).toBe('degraded');
  });
});
