import { describe, it, expect } from 'vitest';
import {
  filterCyclesByFile,
  filterLayerViolationsByFile,
  filterBarrelViolationsByFile,
  filterStabilityViolationsByFile,
  filterSolidViolationsByCategory,
} from './analysis-ignore.js';
import type {
  CircularDependency,
  LayerViolation,
  BarrelViolation,
  StabilityViolation,
  SolidViolation,
} from './types.js';

const edge = (sourceFile: string, targetFile: string) => ({
  sourceFile,
  targetFile,
  line: 1,
  specifier: `../${targetFile}`,
});

// ─── filterCyclesByFile ──────────────────────────────────

describe('filterCyclesByFile', () => {
  it('returns cycles unchanged when patterns is empty', () => {
    const cycles: CircularDependency[] = [
      { cycle: ['a', 'b', 'a'], files: [edge('src/a.ts', 'src/b.ts')] },
    ];
    expect(filterCyclesByFile(cycles, undefined)).toEqual(cycles);
    expect(filterCyclesByFile(cycles, [])).toEqual(cycles);
  });

  it('drops a cycle when ALL its files match the pattern (TypeORM entity case)', () => {
    const cycles: CircularDependency[] = [
      {
        cycle: ['users', 'orders'],
        files: [
          edge('src/users/user.entity.ts', 'src/orders/order.entity.ts'),
          edge('src/orders/order.entity.ts', 'src/users/user.entity.ts'),
        ],
      },
    ];
    const result = filterCyclesByFile(cycles, ['**/entities/**', '**/*.entity.ts']);
    expect(result).toHaveLength(0);
  });

  it('KEEPS a cycle if even one file is outside the ignored paths', () => {
    const cycles: CircularDependency[] = [
      {
        cycle: ['users', 'auth'],
        files: [
          edge('src/users/user.entity.ts', 'src/auth/auth.service.ts'), // auth.service not an entity
          edge('src/auth/auth.service.ts', 'src/users/user.entity.ts'),
        ],
      },
    ];
    const result = filterCyclesByFile(cycles, ['**/*.entity.ts']);
    expect(result).toHaveLength(1);
  });

  it('keeps cycles with no file info (nothing to match against)', () => {
    const cycles: CircularDependency[] = [
      { cycle: ['a', 'b'], files: [] },
    ];
    const result = filterCyclesByFile(cycles, ['**/*.entity.ts']);
    expect(result).toHaveLength(1);
  });

  it('filters only matching cycles from a mixed set', () => {
    const cycles: CircularDependency[] = [
      {
        cycle: ['users', 'orders'],
        files: [edge('src/users/user.entity.ts', 'src/orders/order.entity.ts')],
      },
      {
        cycle: ['auth', 'session'],
        files: [edge('src/auth/auth.service.ts', 'src/session/session.service.ts')],
      },
    ];
    const result = filterCyclesByFile(cycles, ['**/*.entity.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].cycle).toEqual(['auth', 'session']);
  });
});

// ─── filterLayerViolationsByFile ─────────────────────────

describe('filterLayerViolationsByFile', () => {
  const makeViolation = (file: string): LayerViolation => ({
    file,
    line: 1,
    specifier: '../foo',
    fromModule: 'a',
    fromLevel: 0,
    toModule: 'b',
    toLevel: 1,
  });

  it('returns violations unchanged when patterns is empty', () => {
    const vs = [makeViolation('src/foo.ts')];
    expect(filterLayerViolationsByFile(vs, undefined)).toEqual(vs);
    expect(filterLayerViolationsByFile(vs, [])).toEqual(vs);
  });

  it('drops violations whose file matches the pattern', () => {
    const vs = [
      makeViolation('src/entities/user.entity.ts'),
      makeViolation('src/services/user.service.ts'),
    ];
    const result = filterLayerViolationsByFile(vs, ['**/entities/**']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/services/user.service.ts');
  });
});

// ─── filterBarrelViolationsByFile ────────────────────────

describe('filterBarrelViolationsByFile', () => {
  const makeViolation = (file: string): BarrelViolation => ({
    file,
    line: 1,
    specifier: '../foo/bar',
    targetModule: 'foo',
    suggestion: "import from '../foo' instead",
  });

  it('drops violations whose file matches', () => {
    const vs = [
      makeViolation('src/legacy/old.ts'),
      makeViolation('src/services/new.ts'),
    ];
    const result = filterBarrelViolationsByFile(vs, ['src/legacy/**']);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/services/new.ts');
  });
});

// ─── filterStabilityViolationsByFile ─────────────────────

describe('filterStabilityViolationsByFile', () => {
  it('drops when every edge-backing file matches', () => {
    const vs: StabilityViolation[] = [
      {
        from: 'users',
        to: 'orders',
        fromInstability: 0.2,
        toInstability: 0.8,
        files: [edge('src/users/user.entity.ts', 'src/orders/order.entity.ts')],
      },
    ];
    const result = filterStabilityViolationsByFile(vs, ['**/*.entity.ts']);
    expect(result).toHaveLength(0);
  });

  it('keeps when at least one file does not match', () => {
    const vs: StabilityViolation[] = [
      {
        from: 'users',
        to: 'auth',
        fromInstability: 0.2,
        toInstability: 0.8,
        files: [edge('src/users/user.entity.ts', 'src/auth/auth.service.ts')],
      },
    ];
    const result = filterStabilityViolationsByFile(vs, ['**/*.entity.ts']);
    expect(result).toHaveLength(1);
  });
});

// ─── filterSolidViolationsByCategory ─────────────────────

describe('filterSolidViolationsByCategory', () => {
  const makeViolation = (overrides: Partial<SolidViolation>): SolidViolation => ({
    principle: 'SRP',
    severity: 'error',
    message: 'File has 500 lines (threshold: 300)',
    file: 'src/foo.ts',
    suggestion: 'split',
    ...overrides,
  });

  it('drops oversizedFiles violations whose file matches', () => {
    const vs = [
      makeViolation({ file: 'src/entities/user.entity.ts' }),
      makeViolation({ file: 'src/services/user.service.ts' }),
    ];
    const result = filterSolidViolationsByCategory(vs, {
      oversizedFile: ['**/*.entity.ts'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/services/user.service.ts');
  });

  it('does not drop oversizedFiles patterns from other categories', () => {
    const vs: SolidViolation[] = [
      // An entity file WITH DIP violation — should NOT be dropped by oversizedFiles ignore
      makeViolation({
        principle: 'DIP',
        message: 'Imports concrete X instead of interface',
        file: 'src/entities/user.entity.ts',
      }),
    ];
    const result = filterSolidViolationsByCategory(vs, {
      oversizedFile: ['**/*.entity.ts'],
    });
    expect(result).toHaveLength(1); // DIP violation kept
  });

  it('category scope is strict: oversizedFiles ignore only drops SRP+lines violations', () => {
    const vs: SolidViolation[] = [
      // Complexity violation in an entity file — should NOT be dropped by oversizedFiles
      makeViolation({
        message: 'Cyclomatic complexity 50 (threshold: 25)',
        file: 'src/entities/user.entity.ts',
      }),
      // Oversized entity file — should be dropped
      makeViolation({
        message: 'File has 500 lines (threshold: 300)',
        file: 'src/entities/user.entity.ts',
      }),
    ];
    const result = filterSolidViolationsByCategory(vs, {
      oversizedFile: ['**/*.entity.ts'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('complexity');
  });

  it('independent categories apply independently', () => {
    const vs: SolidViolation[] = [
      makeViolation({
        principle: 'DIP',
        message: 'Imports concrete X',
        file: 'src/entities/user.entity.ts',
      }),
      makeViolation({
        principle: 'SRP',
        message: 'File has 500 lines (threshold: 300)',
        file: 'src/entities/user.entity.ts',
      }),
    ];
    // Ignore DIP in entities but keep oversized check
    const result = filterSolidViolationsByCategory(vs, {
      dependencyInversion: ['**/*.entity.ts'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].principle).toBe('SRP');
  });

  it('returns violations unchanged when no categories are ignored', () => {
    const vs = [makeViolation({})];
    expect(filterSolidViolationsByCategory(vs, {})).toEqual(vs);
  });
});
