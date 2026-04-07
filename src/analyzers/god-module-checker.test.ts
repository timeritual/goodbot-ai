import { describe, it, expect } from 'vitest';
import { checkGodModules } from './god-module-checker.js';
import type { ModuleNode } from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';

function makeNode(name: string, fanIn: string[], fanOut: string[]): ModuleNode {
  return {
    name,
    path: `src/${name}`,
    fileCount: 5,
    dependsOn: new Set(fanOut),
    dependedOnBy: new Set(fanIn),
  };
}

describe('checkGodModules', () => {
  it('returns empty for well-structured modules', () => {
    const modules = [
      makeNode('utils', ['services', 'commands'], []),
      makeNode('services', ['commands'], ['utils']),
      makeNode('commands', [], ['services', 'utils']),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    expect(result.violations).toHaveLength(0);
    expect(result.godModules).toHaveLength(0);
  });

  it('detects a god module with high fan-in and fan-out', () => {
    const modules = [
      makeNode('god', ['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y', 'z']),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map(n => makeNode(n, [], ['god'])),
      ...['x', 'y', 'z'].map(n => makeNode(n, ['god'], [])),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.godModules[0].moduleName).toBe('god');
  });

  it('skips _root module', () => {
    const modules = [
      makeNode('_root', ['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y', 'z']),
      makeNode('a', [], []),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    expect(result.godModules.map(m => m.moduleName)).not.toContain('_root');
  });

  it('returns empty for fewer than 3 real modules', () => {
    const modules = [
      makeNode('a', ['b'], ['b']),
      makeNode('b', ['a'], ['a']),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    expect(result.violations).toHaveLength(0);
  });

  it('flags modules with extremely high total coupling', () => {
    // maxModuleCoupling = 6, so (fanIn + fanOut) >= 12 = high coupling
    const deps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const modules = [
      makeNode('hub', deps, deps),
      ...deps.map(n => makeNode(n, ['hub'], ['hub'])),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    expect(result.violations.length).toBeGreaterThan(0);
    const hubResult = result.godModules.find(m => m.moduleName === 'hub')!;
    expect(hubResult.fanIn).toBe(7);
    expect(hubResult.fanOut).toBe(7);
  });

  it('sorts god modules by score descending', () => {
    const modules = [
      makeNode('small-god', ['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y', 'z']),
      makeNode('big-god', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['x', 'y', 'z', 'w']),
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(n => makeNode(n, [], [])),
      ...['x', 'y', 'z', 'w'].map(n => makeNode(n, [], [])),
    ];
    const result = checkGodModules(modules, DEFAULT_THRESHOLDS);
    if (result.godModules.length >= 2) {
      expect(result.godModules[0].score).toBeGreaterThanOrEqual(result.godModules[1].score);
    }
  });
});
