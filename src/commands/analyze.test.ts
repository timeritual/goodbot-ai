import { describe, it, expect } from 'vitest';
import { checkBudget } from './analyze.js';
import { checkCustomRules } from '../analyzers/custom-rules.js';
import type { FullAnalysis, DependencyAnalysis, SolidAnalysis, FileImports } from '../analyzers/types.js';
import type { GoodbotConfig } from '../config/schema.js';
import { GoodbotConfigSchema } from '../config/schema.js';
import type { CustomRule } from '../analyzers/custom-rules.js';

// ─── Factories ───────────────────────────────────────────

function makeAnalysis(
  overrides: {
    circular?: number;
    layer?: number;
    barrel?: number;
    solidViolations?: Array<{ principle: string; severity: string; message: string; file: string }>;
  } = {},
): FullAnalysis {
  const solidViolations = (overrides.solidViolations ?? []).map((v) => ({
    principle: v.principle as 'SRP' | 'CUSTOM',
    severity: v.severity as 'error' | 'warning' | 'info',
    file: v.file,
    message: v.message,
    suggestion: '',
  }));

  const dependency: DependencyAnalysis = {
    modules: [],
    edges: [],
    stability: [],
    stabilityViolations: [],
    circularDependencies: Array.from({ length: overrides.circular ?? 0 }, () => ({
      cycle: ['a', 'b'],
      files: [],
    })),
    barrelViolations: Array.from({ length: overrides.barrel ?? 0 }, () => ({
      file: 'f.ts',
      line: 1,
      specifier: './internal',
      targetModule: 'mod',
      suggestion: 'use barrel',
    })),
    layerViolations: Array.from({ length: overrides.layer ?? 0 }, () => ({
      file: 'f.ts',
      line: 1,
      specifier: './upper',
      fromModule: 'low',
      fromLevel: 0,
      toModule: 'high',
      toLevel: 1,
    })),
    filesParsed: 10,
    timeTakenMs: 50,
  };

  const solid: SolidAnalysis = {
    violations: solidViolations,
    scores: { srp: 90, dip: 90, isp: 90, overall: 90 },
  };

  return {
    dependency,
    solid,
    health: {
      grade: 'A',
      score: 90,
      breakdown: { dependencies: 90, stability: 90, solid: 90, architecture: 90 },
    },
  };
}

const makeConfig = (budget: Record<string, number>): GoodbotConfig =>
  GoodbotConfigSchema.parse({
    version: 1,
    project: { name: 'test', framework: 'node', language: 'typescript' },
    analysis: { budget },
  });

function makeFileImports(
  filePath: string,
  imports: Array<{ specifier: string; line?: number }>,
): FileImports {
  return {
    filePath,
    moduleName: filePath.split('/')[1] ?? 'root',
    imports: imports.map((imp) => ({
      specifier: imp.specifier,
      resolvedPath: null,
      line: imp.line ?? 1,
      kind: 'import' as const,
    })),
  };
}

// ─── checkBudget ─────────────────────────────────────────

describe('checkBudget', () => {
  it('returns empty array when no budget configured', () => {
    const result = checkBudget(makeAnalysis(), makeConfig({}));
    expect(result).toEqual([]);
  });

  it('returns entries only for configured budget categories', () => {
    const result = checkBudget(makeAnalysis(), makeConfig({ circular: 5 }));
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Circular dependencies');
  });

  it('correctly identifies within-budget categories', () => {
    const analysis = makeAnalysis({ circular: 2 });
    const result = checkBudget(analysis, makeConfig({ circular: 5 }));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      category: 'Circular dependencies',
      actual: 2,
      budget: 5,
      overBudget: false,
    });
  });

  it('correctly identifies over-budget categories', () => {
    const analysis = makeAnalysis({ circular: 6 });
    const result = checkBudget(analysis, makeConfig({ circular: 5 }));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      category: 'Circular dependencies',
      actual: 6,
      budget: 5,
      overBudget: true,
    });
  });

  it('budget of 0 means zero tolerance', () => {
    const analysis = makeAnalysis({ layer: 1 });
    const result = checkBudget(analysis, makeConfig({ layer: 0 }));
    expect(result).toHaveLength(1);
    expect(result[0].overBudget).toBe(true);
    expect(result[0].actual).toBe(1);
    expect(result[0].budget).toBe(0);
  });

  it('budget of 0 passes when actual is 0', () => {
    const analysis = makeAnalysis({ layer: 0 });
    const result = checkBudget(analysis, makeConfig({ layer: 0 }));
    expect(result).toHaveLength(1);
    expect(result[0].overBudget).toBe(false);
  });

  it('handles multiple categories with mixed over/within budget', () => {
    const analysis = makeAnalysis({
      circular: 3,
      layer: 0,
      barrel: 10,
      solidViolations: [
        { principle: 'SRP', severity: 'warning', message: 'Too many responsibilities', file: 'a.ts' },
        { principle: 'SRP', severity: 'warning', message: 'Too many responsibilities', file: 'b.ts' },
        { principle: 'CUSTOM', severity: 'error', message: 'Custom violation', file: 'c.ts' },
      ],
    });
    const config = makeConfig({
      circular: 2,
      layer: 5,
      barrel: 10,
      srp: 1,
      custom: 0,
    });

    const result = checkBudget(analysis, config);
    expect(result).toHaveLength(5);

    const circular = result.find((e) => e.category === 'Circular dependencies')!;
    expect(circular.overBudget).toBe(true);
    expect(circular.actual).toBe(3);

    const layer = result.find((e) => e.category === 'Layer violations')!;
    expect(layer.overBudget).toBe(false);
    expect(layer.actual).toBe(0);

    const barrel = result.find((e) => e.category === 'Barrel violations')!;
    expect(barrel.overBudget).toBe(false);
    expect(barrel.actual).toBe(10);

    const srp = result.find((e) => e.category === 'SRP violations')!;
    expect(srp.overBudget).toBe(true);
    expect(srp.actual).toBe(2);

    const custom = result.find((e) => e.category === 'Custom rule violations')!;
    expect(custom.overBudget).toBe(true);
    expect(custom.actual).toBe(1);
  });
});

// ─── checkCustomRules ────────────────────────────────────

describe('checkCustomRules', () => {
  it('returns empty for no rules', () => {
    const files = [makeFileImports('src/utils/helper.ts', [{ specifier: 'lodash' }])];
    const result = checkCustomRules(files, []);
    expect(result).toEqual([]);
  });

  it('forbiddenIn: flags matching imports in matching files', () => {
    const rule: CustomRule = {
      name: 'no-lodash-in-utils',
      pattern: 'lodash',
      forbiddenIn: ['src/utils/**'],
    };
    const files = [
      makeFileImports('src/utils/helper.ts', [{ specifier: 'lodash', line: 3 }]),
    ];

    const result = checkCustomRules(files, [rule]);
    expect(result).toHaveLength(1);
    expect(result[0].principle).toBe('CUSTOM');
    expect(result[0].file).toBe('src/utils/helper.ts');
    expect(result[0].message).toContain('no-lodash-in-utils');
    expect(result[0].message).toContain('lodash');
  });

  it('forbiddenIn: ignores non-matching files', () => {
    const rule: CustomRule = {
      name: 'no-lodash-in-utils',
      pattern: 'lodash',
      forbiddenIn: ['src/utils/**'],
    };
    const files = [
      makeFileImports('src/services/data.ts', [{ specifier: 'lodash' }]),
    ];

    const result = checkCustomRules(files, [rule]);
    expect(result).toEqual([]);
  });

  it('maxImports: flags when count exceeds limit', () => {
    const rule: CustomRule = {
      name: 'limit-external',
      pattern: '^[a-z]',
      maxImports: 2,
      forbiddenIn: ['src/controllers/**'],
    };
    const files = [
      makeFileImports('src/controllers/app.ts', [
        { specifier: 'axios' },
        { specifier: 'lodash' },
        { specifier: 'chalk' },
      ]),
    ];

    const result = checkCustomRules(files, [rule]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const maxViolation = result.find((v) => v.message.includes('max:'));
    expect(maxViolation).toBeDefined();
    expect(maxViolation!.principle).toBe('CUSTOM');
  });

  it('requiredIn: flags files missing required imports', () => {
    const rule: CustomRule = {
      name: 'must-import-logger',
      pattern: 'logger',
      requiredIn: ['src/services/**'],
    };
    const files = [
      makeFileImports('src/services/user.ts', [{ specifier: 'axios' }]),
    ];

    const result = checkCustomRules(files, [rule]);
    expect(result).toHaveLength(1);
    expect(result[0].principle).toBe('CUSTOM');
    expect(result[0].file).toBe('src/services/user.ts');
    expect(result[0].message).toContain('must-import-logger');
  });

  it('all violations use principle CUSTOM', () => {
    const rules: CustomRule[] = [
      { name: 'forbidden', pattern: 'bad', forbiddenIn: ['**'] },
      { name: 'required', pattern: 'good', requiredIn: ['**'] },
    ];
    const files = [
      makeFileImports('src/app.ts', [{ specifier: 'bad' }]),
    ];

    const result = checkCustomRules(files, rules);
    expect(result.length).toBeGreaterThan(0);
    for (const v of result) {
      expect(v.principle).toBe('CUSTOM');
    }
  });
});
