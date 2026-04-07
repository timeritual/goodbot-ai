import { describe, it, expect } from 'vitest';
import { findCircularDependencies } from './cycles.js';
import type { ModuleNode, ModuleEdge } from './types.js';

function makeNode(name: string, dependsOn: string[] = []): ModuleNode {
  return {
    name,
    path: `src/${name}`,
    fileCount: 3,
    dependsOn: new Set(dependsOn),
    dependedOnBy: new Set(),
  };
}

function makeEdge(from: string, to: string): ModuleEdge {
  return {
    from,
    to,
    files: [{ sourceFile: `${from}/index.ts`, targetFile: `${to}/index.ts`, line: 1, specifier: `./${to}` }],
  };
}

describe('findCircularDependencies', () => {
  it('returns empty for acyclic graph', () => {
    const modules = [
      makeNode('a', ['b']),
      makeNode('b', ['c']),
      makeNode('c'),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = findCircularDependencies(modules, edges);
    expect(result).toHaveLength(0);
  });

  it('detects a simple 2-node cycle', () => {
    const modules = [
      makeNode('a', ['b']),
      makeNode('b', ['a']),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')];
    const result = findCircularDependencies(modules, edges);
    expect(result).toHaveLength(1);
    expect(result[0].cycle).toContain('a');
    expect(result[0].cycle).toContain('b');
  });

  it('detects a 3-node cycle', () => {
    const modules = [
      makeNode('a', ['b']),
      makeNode('b', ['c']),
      makeNode('c', ['a']),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')];
    const result = findCircularDependencies(modules, edges);
    expect(result).toHaveLength(1);
    expect(result[0].cycle).toContain('a');
    expect(result[0].cycle).toContain('b');
    expect(result[0].cycle).toContain('c');
  });

  it('detects multiple independent cycles', () => {
    const modules = [
      makeNode('a', ['b']),
      makeNode('b', ['a']),
      makeNode('c', ['d']),
      makeNode('d', ['c']),
    ];
    const edges = [
      makeEdge('a', 'b'), makeEdge('b', 'a'),
      makeEdge('c', 'd'), makeEdge('d', 'c'),
    ];
    const result = findCircularDependencies(modules, edges);
    expect(result).toHaveLength(2);
  });

  it('handles single-node graph (no cycle)', () => {
    const modules = [makeNode('a')];
    const result = findCircularDependencies(modules, []);
    expect(result).toHaveLength(0);
  });

  it('handles empty graph', () => {
    const result = findCircularDependencies([], []);
    expect(result).toHaveLength(0);
  });

  it('includes file evidence in results', () => {
    const modules = [
      makeNode('a', ['b']),
      makeNode('b', ['a']),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')];
    const result = findCircularDependencies(modules, edges);
    expect(result[0].files.length).toBeGreaterThan(0);
    expect(result[0].files[0].sourceFile).toContain('/index.ts');
  });
});
