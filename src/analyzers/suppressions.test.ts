import { describe, it, expect } from 'vitest';
import {
  applySuppressionsToCycles,
  applySuppressionsToLayerViolations,
  applySuppressionsToBarrelViolations,
  applySuppressionsToSolidViolations,
  type Suppression,
} from './suppressions.js';
import type {
  CircularDependency,
  LayerViolation,
  BarrelViolation,
  SolidViolation,
} from './types.js';

const edge = (sourceFile: string, targetFile: string) => ({
  sourceFile,
  targetFile,
  line: 1,
  specifier: `../${targetFile}`,
});

// ─── Circular dep suppressions ──────────────────────────

describe('applySuppressionsToCycles', () => {
  it('suppresses a cycle matching the `cycle` field (regardless of direction)', () => {
    const cycles: CircularDependency[] = [
      { cycle: ['app', 'database', 'app'], files: [edge('src/app/a.ts', 'src/database/b.ts')] },
    ];
    const suppressions: Suppression[] = [
      { rule: 'circularDep', cycle: 'database → app', reason: 'migration dependency' },
    ];
    const result = applySuppressionsToCycles(cycles, suppressions);
    expect(result.remaining).toHaveLength(0);
    expect(result.suppressed).toHaveLength(1);
  });

  it('matches regardless of arrow notation (→, ↔, comma, >)', () => {
    const cycles: CircularDependency[] = [
      { cycle: ['app', 'database', 'app'], files: [] },
    ];
    for (const cycleStr of ['database → app', 'app → database', 'app ↔ database', 'app,database', 'app > database']) {
      const result = applySuppressionsToCycles(cycles, [
        { rule: 'circularDep', cycle: cycleStr, reason: 'test' },
      ]);
      expect(result.suppressed, `pattern: ${cycleStr}`).toHaveLength(1);
    }
  });

  it('keeps cycles that do not match', () => {
    const cycles: CircularDependency[] = [
      { cycle: ['users', 'orders', 'users'], files: [] },
    ];
    const result = applySuppressionsToCycles(cycles, [
      { rule: 'circularDep', cycle: 'database → app', reason: 'other' },
    ]);
    expect(result.remaining).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });
});

// ─── Layer/barrel violation suppressions ────────────────

describe('applySuppressionsToLayerViolations', () => {
  const make = (file: string): LayerViolation => ({
    file,
    line: 1,
    specifier: '../foo',
    fromModule: 'a',
    fromLevel: 0,
    toModule: 'b',
    toLevel: 1,
  });

  it('suppresses violation by exact file match', () => {
    const vs = [make('src/scripts/migrate.ts'), make('src/controllers/user.ts')];
    const result = applySuppressionsToLayerViolations(vs, [
      { rule: 'layerViolation', file: 'src/scripts/migrate.ts', reason: 'migration needs services' },
    ]);
    expect(result.remaining).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].file).toBe('src/scripts/migrate.ts');
  });

  it('matches by trailing path segment', () => {
    const vs = [make('src/scripts/migrate.ts')];
    const result = applySuppressionsToLayerViolations(vs, [
      { rule: 'layerViolation', file: 'scripts/migrate.ts', reason: 'short path' },
    ]);
    expect(result.suppressed).toHaveLength(1);
  });

  it('only affects its own rule', () => {
    const vs = [make('src/foo.ts')];
    const result = applySuppressionsToLayerViolations(vs, [
      { rule: 'barrelViolation', file: 'src/foo.ts', reason: 'different rule' },
    ]);
    expect(result.remaining).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });
});

describe('applySuppressionsToBarrelViolations', () => {
  it('suppresses barrel violations by file', () => {
    const vs: BarrelViolation[] = [
      { file: 'src/legacy/old.ts', line: 1, specifier: '../services/foo', targetModule: 'services', suggestion: "import from '../services'" },
    ];
    const result = applySuppressionsToBarrelViolations(vs, [
      { rule: 'barrelViolation', file: 'src/legacy/old.ts', reason: 'legacy code' },
    ]);
    expect(result.remaining).toHaveLength(0);
    expect(result.suppressed).toHaveLength(1);
  });
});

// ─── SOLID suppressions (per-category) ──────────────────

describe('applySuppressionsToSolidViolations', () => {
  const makeV = (overrides: Partial<SolidViolation>): SolidViolation => ({
    principle: 'SRP',
    severity: 'error',
    message: 'File has 500 lines (threshold: 300)',
    file: 'src/foo.ts',
    suggestion: 'split',
    ...overrides,
  });

  it('suppresses oversizedFile violations', () => {
    const vs = [
      makeV({ file: 'src/entities/user.entity.ts' }),
      makeV({ file: 'src/services/user.service.ts' }),
    ];
    const result = applySuppressionsToSolidViolations(vs, [
      { rule: 'oversizedFile', file: 'src/entities/user.entity.ts', reason: 'generated code' },
    ]);
    expect(result.remaining).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
    expect(result.countsByRule.oversizedFile).toBe(1);
  });

  it('suppresses complexity and oversizedFile independently (same file, different rules)', () => {
    const vs: SolidViolation[] = [
      makeV({ file: 'src/foo.ts', message: 'Cyclomatic complexity 50 (threshold: 25)' }),
      makeV({ file: 'src/foo.ts', message: 'File has 500 lines (threshold: 300)' }),
    ];
    // Only suppress complexity
    const result = applySuppressionsToSolidViolations(vs, [
      { rule: 'complexity', file: 'src/foo.ts', reason: 'state machine' },
    ]);
    expect(result.remaining).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0].message).toContain('complexity');
  });

  it('counts suppressions by rule', () => {
    const vs: SolidViolation[] = [
      makeV({ file: 'src/a.ts', message: 'File has 500 lines (threshold: 300)' }),
      makeV({ file: 'src/b.ts', message: 'File has 400 lines (threshold: 300)' }),
      makeV({ principle: 'DIP', file: 'src/c.ts', message: 'Imports concrete X' }),
    ];
    const suppressions: Suppression[] = [
      { rule: 'oversizedFile', file: 'src/a.ts', reason: 'generated' },
      { rule: 'oversizedFile', file: 'src/b.ts', reason: 'fixture' },
      { rule: 'dependencyInversion', file: 'src/c.ts', reason: 'legacy' },
    ];
    const result = applySuppressionsToSolidViolations(vs, suppressions);
    expect(result.countsByRule.oversizedFile).toBe(2);
    expect(result.countsByRule.dependencyInversion).toBe(1);
    expect(result.remaining).toHaveLength(0);
  });
});
