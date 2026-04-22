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

  it('migrates analysis.ignore plural keys to singular', () => {
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
    const analysisIgnore = (migrated as Record<string, Record<string, Record<string, unknown>>>)
      .analysis.ignore;
    expect(analysisIgnore.circularDep).toEqual(['**/entities/**']);
    expect(analysisIgnore.layerViolation).toEqual(['scripts/**']);
    expect(analysisIgnore.oversizedFile).toEqual(['**/*.gen.ts']);
    expect(analysisIgnore.circularDeps).toBeUndefined();
    expect(analysisIgnore.layerViolations).toBeUndefined();
    expect(analysisIgnore.oversizedFiles).toBeUndefined();
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]).toContain('plural');
  });

  it('migrates both legacies in a single pass', () => {
    const legacy = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      analysis: { ignore: { circularDeps: ['**/entities/**'] } },
      ignore: { paths: ['dist'], sensitiveFiles: [] },
    };
    const { deprecations } = migrateLegacyConfig(legacy);
    expect(deprecations).toHaveLength(2);
  });

  it('returns no deprecations when config already uses canonical names', () => {
    const canonical = {
      version: 1,
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      output: { cursorignore: { paths: [], sensitiveFiles: [] } },
      analysis: { ignore: { circularDep: ['**/entities/**'] } },
    };
    const { deprecations } = migrateLegacyConfig(canonical);
    expect(deprecations).toEqual([]);
  });

  it('prefers canonical over legacy when both are set', () => {
    const mixed = {
      analysis: {
        ignore: {
          circularDeps: ['**/legacy-wins/**'],
          circularDep: ['**/canonical-wins/**'],
        },
      },
    };
    const { migrated } = migrateLegacyConfig(mixed);
    const ignore = (migrated as Record<string, Record<string, Record<string, unknown>>>).analysis.ignore;
    expect(ignore.circularDep).toEqual(['**/canonical-wins/**']);
    expect(ignore.circularDeps).toBeUndefined();
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
    expect(parsed.analysis.ignore.circularDep).toEqual(['**/entities/**']);
    expect(parsed.output.cursorignore.paths).toEqual(['dist']);
  });

  it('handles non-object input gracefully', () => {
    expect(migrateLegacyConfig(null).deprecations).toEqual([]);
    expect(migrateLegacyConfig('nonsense').deprecations).toEqual([]);
    expect(migrateLegacyConfig([]).deprecations).toEqual([]);
  });
});
