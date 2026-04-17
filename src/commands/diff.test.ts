import { describe, it, expect } from 'vitest';
import { filterToChangedFiles } from './diff.js';
import type { FullAnalysis } from '../analyzers/types.js';

function makeAnalysis(overrides: {
  layerViolations?: FullAnalysis['dependency']['layerViolations'];
  barrelViolations?: FullAnalysis['dependency']['barrelViolations'];
  solidViolations?: FullAnalysis['solid']['violations'];
} = {}): FullAnalysis {
  return {
    dependency: {
      modules: [],
      edges: [],
      stability: [],
      stabilityViolations: [],
      circularDependencies: [],
      barrelViolations: overrides.barrelViolations ?? [],
      layerViolations: overrides.layerViolations ?? [],
      filesParsed: 0,
      timeTakenMs: 0,
    },
    solid: {
      violations: overrides.solidViolations ?? [],
      scores: { srp: 100, dip: 100, isp: 100, overall: 100 },
    },
    health: {
      grade: 'A+',
      score: 100,
      breakdown: { dependencies: 100, stability: 100, solid: 100, architecture: 100 },
    },
  };
}

describe('filterToChangedFiles', () => {
  it('returns zero violations when no changed files match', () => {
    const analysis = makeAnalysis({
      layerViolations: [
        { file: 'src/foo.ts', line: 1, specifier: './bar', fromModule: 'foo', fromLevel: 0, toModule: 'bar', toLevel: 1 },
      ],
      barrelViolations: [
        { file: 'src/baz.ts', line: 5, specifier: './internal', targetModule: 'baz', suggestion: 'use barrel' },
      ],
      solidViolations: [
        { principle: 'SRP', severity: 'warning', file: 'src/qux.ts', message: 'Too many responsibilities', suggestion: 'Split' },
      ],
    });

    const result = filterToChangedFiles(analysis, ['src/unrelated.ts']);

    expect(result.layerViolations).toBe(0);
    expect(result.barrelViolations).toBe(0);
    expect(result.solidViolations).toBe(0);
    expect(result.details).toEqual([]);
  });

  it('filters layer violations to changed files only', () => {
    const analysis = makeAnalysis({
      layerViolations: [
        { file: 'src/a.ts', line: 1, specifier: './b', fromModule: 'a', fromLevel: 0, toModule: 'b', toLevel: 1 },
        { file: 'src/c.ts', line: 2, specifier: './d', fromModule: 'c', fromLevel: 0, toModule: 'd', toLevel: 1 },
      ],
    });

    const result = filterToChangedFiles(analysis, ['src/a.ts']);

    expect(result.layerViolations).toBe(1);
    expect(result.barrelViolations).toBe(0);
    expect(result.solidViolations).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].file).toBe('src/a.ts');
  });

  it('filters barrel violations to changed files only', () => {
    const analysis = makeAnalysis({
      barrelViolations: [
        { file: 'src/x.ts', line: 3, specifier: './internals/helper', targetModule: 'utils', suggestion: 'import from utils' },
        { file: 'src/y.ts', line: 7, specifier: './internals/other', targetModule: 'core', suggestion: 'import from core' },
      ],
    });

    const result = filterToChangedFiles(analysis, ['src/y.ts']);

    expect(result.barrelViolations).toBe(1);
    expect(result.layerViolations).toBe(0);
    expect(result.solidViolations).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].file).toBe('src/y.ts');
  });

  it('filters SOLID violations to changed files only', () => {
    const analysis = makeAnalysis({
      solidViolations: [
        { principle: 'SRP', severity: 'warning', file: 'src/big.ts', message: 'File too large', suggestion: 'Split file' },
        { principle: 'DIP', severity: 'error', file: 'src/small.ts', message: 'Concrete dependency', suggestion: 'Use interface' },
      ],
    });

    const result = filterToChangedFiles(analysis, ['src/small.ts']);

    expect(result.solidViolations).toBe(1);
    expect(result.layerViolations).toBe(0);
    expect(result.barrelViolations).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].file).toBe('src/small.ts');
  });

  it('returns correct details with type and message for each violation type', () => {
    const analysis = makeAnalysis({
      layerViolations: [
        { file: 'src/a.ts', line: 1, specifier: './b', fromModule: 'api', fromLevel: 0, toModule: 'db', toLevel: 2 },
      ],
      barrelViolations: [
        { file: 'src/a.ts', line: 5, specifier: './utils/internal', targetModule: 'utils', suggestion: 'import from utils' },
      ],
      solidViolations: [
        { principle: 'SRP', severity: 'warning', file: 'src/a.ts', message: 'Too many responsibilities', suggestion: 'Split' },
      ],
    });

    const result = filterToChangedFiles(analysis, ['src/a.ts']);

    expect(result.layerViolations).toBe(1);
    expect(result.barrelViolations).toBe(1);
    expect(result.solidViolations).toBe(1);
    expect(result.details).toHaveLength(3);

    const layer = result.details.find(d => d.type === 'layer')!;
    expect(layer.file).toBe('src/a.ts');
    expect(layer.message).toBe('api (L0) → db (L2)');

    const barrel = result.details.find(d => d.type === 'barrel')!;
    expect(barrel.file).toBe('src/a.ts');
    expect(barrel.message).toBe('Bypasses barrel: ./utils/internal');

    const solid = result.details.find(d => d.type === 'SRP')!;
    expect(solid.file).toBe('src/a.ts');
    expect(solid.message).toBe('Too many responsibilities');
  });

  it('handles empty analysis (no violations at all)', () => {
    const analysis = makeAnalysis();

    const result = filterToChangedFiles(analysis, ['src/anything.ts']);

    expect(result.layerViolations).toBe(0);
    expect(result.barrelViolations).toBe(0);
    expect(result.solidViolations).toBe(0);
    expect(result.details).toEqual([]);
  });
});
