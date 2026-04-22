import { describe, it, expect } from 'vitest';
import { migrateLegacyConfig } from './migrate.js';
import { GoodbotConfigSchema } from './schema.js';

describe('migrateLegacyConfig', () => {
  it('migrates top-level ignore → output.cursorignore', () => {
    const legacy = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      ignore: {
        paths: ['node_modules', 'dist'],
        sensitiveFiles: ['.env'],
      },
    };
    const { migrated, deprecations } = migrateLegacyConfig(legacy);
    const result = migrated as Record<string, unknown>;
    expect(result.ignore).toBeUndefined();
    expect(result.output).toEqual({
      cursorignore: {
        paths: ['node_modules', 'dist'],
        sensitiveFiles: ['.env'],
      },
    });
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]).toContain('output.cursorignore');
  });

  it('migrates analysis.ignore plural keys to analysis.exclude singular keys', () => {
    const legacy = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      analysis: {
        ignore: {
          circularDeps: ['**/entities/**'],
          layerViolations: ['scripts/**'],
          oversizedFiles: ['**/*.gen.ts'],
        },
      },
    };
    const { migrated, deprecations } = migrateLegacyConfig(legacy);
    const exclude = (migrated as Record<string, Record<string, Record<string, unknown>>>)
      .analysis.exclude;
    expect(exclude.circularDep).toEqual(['**/entities/**']);
    expect(exclude.layerViolation).toEqual(['scripts/**']);
    expect(exclude.oversizedFile).toEqual(['**/*.gen.ts']);
    expect(exclude.circularDeps).toBeUndefined();
    expect(exclude.layerViolations).toBeUndefined();
    expect(exclude.oversizedFiles).toBeUndefined();
    // Should warn about both renames: ignore→exclude AND plural→singular
    expect(deprecations.length).toBeGreaterThanOrEqual(1);
    expect(deprecations.join(' ')).toContain('plural');
    expect(deprecations.join(' ')).toContain('exclude');
  });

  it('migrates multiple legacies in a single pass', () => {
    const legacy = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      analysis: { ignore: { circularDeps: ['**/entities/**'] } },
      ignore: { paths: ['dist'], sensitiveFiles: [] },
    };
    const { deprecations } = migrateLegacyConfig(legacy);
    // Expect 3: top-level ignore→output.cursorignore, analysis.ignore→analysis.exclude,
    // and circularDeps→circularDep
    expect(deprecations.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no deprecations when config already uses canonical names', () => {
    const canonical = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      output: { cursorignore: { paths: [], sensitiveFiles: [] } },
      analysis: { exclude: { circularDep: ['**/entities/**'] } },
    };
    const { deprecations } = migrateLegacyConfig(canonical);
    expect(deprecations).toEqual([]);
  });

  it('migrates analysis.ignore → analysis.exclude, prefers canonical exclude if both set', () => {
    const onlyLegacy = { analysis: { ignore: { circularDep: ['**/legacy/**'] } } };
    const { migrated: m1 } = migrateLegacyConfig(onlyLegacy);
    const exclude1 = (m1 as Record<string, Record<string, Record<string, unknown>>>).analysis.exclude;
    expect(exclude1.circularDep).toEqual(['**/legacy/**']);

    // When both ignore and exclude are present, exclude wins and ignore is dropped
    const both = {
      analysis: {
        ignore: { circularDep: ['**/legacy-wins/**'] },
        exclude: { circularDep: ['**/canonical-wins/**'] },
      },
    };
    const { migrated: m2 } = migrateLegacyConfig(both);
    const analysis2 = (m2 as Record<string, Record<string, Record<string, Record<string, unknown>>>>).analysis;
    expect(analysis2.exclude.circularDep).toEqual(['**/canonical-wins/**']);
    expect(analysis2.ignore).toBeUndefined();
  });

  it('prefers canonical singular over plural when both exist in exclude', () => {
    const mixed = {
      analysis: {
        exclude: {
          circularDeps: ['**/legacy-wins/**'],
          circularDep: ['**/canonical-wins/**'],
        },
      },
    };
    const { migrated } = migrateLegacyConfig(mixed);
    const exclude = (migrated as Record<string, Record<string, Record<string, unknown>>>).analysis.exclude;
    expect(exclude.circularDep).toEqual(['**/canonical-wins/**']);
    expect(exclude.circularDeps).toBeUndefined();
  });

  it('migrated config passes full schema validation (integration)', () => {
    const legacy = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      analysis: { ignore: { circularDeps: ['**/entities/**'] } },
      ignore: { paths: ['dist'] },
    };
    const { migrated } = migrateLegacyConfig(legacy);
    // Should not throw
    const parsed = GoodbotConfigSchema.parse(migrated);
    expect(parsed.analysis.exclude.circularDep).toEqual(['**/entities/**']);
    expect(parsed.output.cursorignore.paths).toEqual(['dist']);
  });

  it('handles non-object input gracefully', () => {
    expect(migrateLegacyConfig(null).deprecations).toEqual([]);
    expect(migrateLegacyConfig('nonsense').deprecations).toEqual([]);
    expect(migrateLegacyConfig([]).deprecations).toEqual([]);
  });
});
