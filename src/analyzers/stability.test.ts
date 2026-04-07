import { describe, it, expect } from 'vitest';
import { calculateStability, findStabilityViolations } from './stability.js';
import type { ModuleNode, ModuleEdge } from './types.js';

function makeNode(name: string, dependsOn: string[], dependedOnBy: string[]): ModuleNode {
  return {
    name,
    path: `src/${name}`,
    fileCount: 3,
    dependsOn: new Set(dependsOn),
    dependedOnBy: new Set(dependedOnBy),
  };
}

function makeEdge(from: string, to: string): ModuleEdge {
  return { from, to, files: [] };
}

describe('calculateStability', () => {
  it('returns empty for no modules', () => {
    expect(calculateStability([])).toHaveLength(0);
  });

  it('filters out _root module', () => {
    const modules = [
      makeNode('_root', ['a'], []),
      makeNode('a', [], ['_root']),
    ];
    const result = calculateStability(modules);
    expect(result.map(m => m.moduleName)).not.toContain('_root');
  });

  it('calculates fully stable module (I=0) when only depended on', () => {
    const modules = [
      makeNode('utils', [], ['services', 'commands']),
    ];
    const result = calculateStability(modules);
    expect(result[0].instability).toBe(0);
    expect(result[0].afferentCoupling).toBe(2);
    expect(result[0].efferentCoupling).toBe(0);
  });

  it('calculates fully unstable module (I=1) when only depends on others', () => {
    const modules = [
      makeNode('commands', ['services', 'utils'], []),
    ];
    const result = calculateStability(modules);
    expect(result[0].instability).toBe(1);
    expect(result[0].afferentCoupling).toBe(0);
    expect(result[0].efferentCoupling).toBe(2);
  });

  it('calculates 0.5 instability for isolated modules', () => {
    const modules = [makeNode('isolated', [], [])];
    const result = calculateStability(modules);
    expect(result[0].instability).toBe(0.5);
  });

  it('sorts by instability ascending', () => {
    const modules = [
      makeNode('unstable', ['a', 'b'], []),
      makeNode('stable', [], ['x', 'y']),
      makeNode('a', [], ['unstable']),
      makeNode('b', [], ['unstable']),
      makeNode('x', ['stable'], []),
      makeNode('y', ['stable'], []),
    ];
    const result = calculateStability(modules);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].instability).toBeGreaterThanOrEqual(result[i - 1].instability);
    }
  });
});

describe('findStabilityViolations', () => {
  it('returns empty when no SDP violations exist', () => {
    // Stable module depends on even more stable module — OK
    const metrics = [
      { moduleName: 'utils', afferentCoupling: 3, efferentCoupling: 0, instability: 0 },
      { moduleName: 'services', afferentCoupling: 1, efferentCoupling: 2, instability: 0.67 },
    ];
    const edges = [makeEdge('services', 'utils')];
    const result = findStabilityViolations(metrics, edges);
    expect(result).toHaveLength(0);
  });

  it('detects when stable module depends on unstable module', () => {
    const metrics = [
      { moduleName: 'utils', afferentCoupling: 3, efferentCoupling: 0, instability: 0 },
      { moduleName: 'commands', afferentCoupling: 0, efferentCoupling: 3, instability: 1 },
    ];
    // utils (I=0, stable) depends on commands (I=1, unstable) — violation
    const edges = [makeEdge('utils', 'commands')];
    const result = findStabilityViolations(metrics, edges);
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('utils');
    expect(result[0].to).toBe('commands');
  });

  it('ignores differences below 0.1 threshold', () => {
    const metrics = [
      { moduleName: 'a', afferentCoupling: 5, efferentCoupling: 4, instability: 0.44 },
      { moduleName: 'b', afferentCoupling: 4, efferentCoupling: 5, instability: 0.5 },
    ];
    const edges = [makeEdge('a', 'b')];
    const result = findStabilityViolations(metrics, edges);
    // 0.5 - 0.44 = 0.06 < 0.1 threshold
    expect(result).toHaveLength(0);
  });

  it('sorts violations by instability difference descending', () => {
    const metrics = [
      { moduleName: 'a', afferentCoupling: 5, efferentCoupling: 0, instability: 0 },
      { moduleName: 'b', afferentCoupling: 3, efferentCoupling: 1, instability: 0.25 },
      { moduleName: 'c', afferentCoupling: 0, efferentCoupling: 5, instability: 1 },
      { moduleName: 'd', afferentCoupling: 1, efferentCoupling: 4, instability: 0.8 },
    ];
    const edges = [makeEdge('a', 'c'), makeEdge('b', 'd')];
    const result = findStabilityViolations(metrics, edges);
    expect(result).toHaveLength(2);
    // a→c has diff 1.0, b→d has diff 0.55 — largest diff first
    expect(result[0].from).toBe('a');
    expect(result[1].from).toBe('b');
  });
});
