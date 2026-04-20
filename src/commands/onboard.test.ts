import { describe, it, expect } from 'vitest';
import { describeModule } from './onboard.js';
import type { DetectedLayer } from '../scanners/types.js';
import type { FullAnalysis, ModuleNode, StabilityMetrics, SolidViolation } from '../analyzers/types.js';

function makeLayer(name: string, overrides: Partial<DetectedLayer> = {}): DetectedLayer {
  return {
    name,
    path: `src/${name}`,
    suggestedLevel: 0,
    hasBarrel: false,
    hasInterfaces: false,
    ...overrides,
  };
}

function makeModule(
  name: string,
  overrides: Partial<{ fileCount: number; dependsOn: string[]; dependedOnBy: string[] }> = {},
): ModuleNode {
  return {
    name,
    path: `src/${name}`,
    fileCount: overrides.fileCount ?? 3,
    dependsOn: new Set(overrides.dependsOn ?? []),
    dependedOnBy: new Set(overrides.dependedOnBy ?? []),
  };
}

function makeStability(
  name: string,
  instability: number,
  afferent: number,
  efferent: number,
): StabilityMetrics {
  return {
    moduleName: name,
    instability,
    afferentCoupling: afferent,
    efferentCoupling: efferent,
  };
}

function makeAnalysis(
  modules: ModuleNode[],
  stability: StabilityMetrics[] = [],
  violations: SolidViolation[] = [],
): FullAnalysis {
  return {
    dependency: {
      modules,
      edges: [],
      stability,
      stabilityViolations: [],
      circularDependencies: [],
      barrelViolations: [],
      layerViolations: [],
      filesParsed: modules.reduce((sum, m) => sum + m.fileCount, 0),
      timeTakenMs: 0,
    },
    solid: {
      violations,
      scores: { srp: 100, dip: 100, isp: 100, overall: 100 },
    },
    health: {
      grade: 'A',
      score: 90,
      breakdown: { dependencies: 90, stability: 90, solid: 90, architecture: 90 },
      contributors: [],
    },
  };
}

describe('describeModule', () => {
  it('returns fallback for module not found in analysis', () => {
    const layer = makeLayer('missing');
    const analysis = makeAnalysis([]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toBe('missing module.');
  });

  it('includes file count', () => {
    const mod = makeModule('utils', { fileCount: 7 });
    const layer = makeLayer('utils');
    const analysis = makeAnalysis([mod]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('7 files');
  });

  it('describes highly stable module (instability <= 0.2, afferent > 0)', () => {
    const mod = makeModule('utils', { fileCount: 4, dependedOnBy: ['services'] });
    const stability = makeStability('utils', 0.1, 5, 0);
    const layer = makeLayer('utils');
    const analysis = makeAnalysis([mod], [stability]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('highly stable');
  });

  it('describes volatile module (instability >= 0.8, efferent > 0)', () => {
    const mod = makeModule('commands', { fileCount: 2, dependsOn: ['services'] });
    const stability = makeStability('commands', 0.9, 0, 5);
    const layer = makeLayer('commands');
    const analysis = makeAnalysis([mod], [stability]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('volatile');
  });

  it('describes foundation layer (dependedOnBy but no dependsOn)', () => {
    const mod = makeModule('utils', { fileCount: 3, dependedOnBy: ['services', 'commands'] });
    const layer = makeLayer('utils');
    const analysis = makeAnalysis([mod]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('foundation layer');
    expect(result).toContain('services');
    expect(result).toContain('commands');
  });

  it('describes leaf layer (dependsOn but no dependedOnBy)', () => {
    const mod = makeModule('commands', { fileCount: 5, dependsOn: ['services', 'utils'] });
    const layer = makeLayer('commands');
    const analysis = makeAnalysis([mod]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('leaf layer');
    expect(result).toContain('services');
    expect(result).toContain('utils');
  });

  it('includes barrel status when hasBarrel is true', () => {
    const mod = makeModule('services', { fileCount: 4 });
    const layer = makeLayer('services', { hasBarrel: true });
    const analysis = makeAnalysis([mod]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('has barrel');
  });

  it('includes violation count when module has errors', () => {
    const mod = makeModule('services', { fileCount: 3 });
    const layer = makeLayer('services');
    const violations: SolidViolation[] = [
      { principle: 'SRP', severity: 'error', file: 'src/services/user.ts', line: 10, message: 'Too large', suggestion: 'Split' },
      { principle: 'DIP', severity: 'error', file: 'src/services/auth.ts', line: 5, message: 'Concrete dep', suggestion: 'Use interface' },
      { principle: 'SRP', severity: 'warning', file: 'src/services/other.ts', line: 1, message: 'Minor', suggestion: 'Consider' },
    ];
    const analysis = makeAnalysis([mod], [], violations);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('2 issues to address');
  });

  it('lists dependency module names', () => {
    const mod = makeModule('services', { fileCount: 2, dependsOn: ['utils'], dependedOnBy: ['commands'] });
    const layer = makeLayer('services');
    const analysis = makeAnalysis([mod]);
    const result = describeModule(layer, analysis.dependency, analysis);
    expect(result).toContain('utils');
    expect(result).toContain('commands');
  });
});
