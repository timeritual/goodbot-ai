import { describe, it, expect } from 'vitest';
import { mergeConfigWithPreset, diffConfigs } from './merge.js';
import { GoodbotConfigSchema, type GoodbotConfig } from './schema.js';

function makeConfig(overrides: Record<string, unknown> = {}): GoodbotConfig {
  return GoodbotConfigSchema.parse({
    version: 1,
    project: { name: 'app', framework: 'nest', language: 'typescript' },
    ...overrides,
  });
}

describe('mergeConfigWithPreset', () => {
  it('refreshes detected fields (framework, language, systemType) from preset', () => {
    const existing = makeConfig({
      project: { name: 'app', framework: 'nest', language: 'typescript' },
      architecture: { systemType: 'api', layers: [] },
    });
    const preset = makeConfig({
      project: { name: 'app', framework: 'next', language: 'typescript' },
      architecture: { systemType: 'mixed', layers: [] },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    expect(merged.project.framework).toBe('next');
    expect(merged.architecture.systemType).toBe('mixed');
  });

  it('preserves user-customized verification commands', () => {
    const existing = makeConfig({
      verification: {
        typecheck: 'tsc -p tsconfig.build.json --noEmit --pretty',
        lint: 'npm run lint --fix',
        test: 'npm test',
        format: null,
        build: null,
      },
    });
    const preset = makeConfig({
      verification: {
        typecheck: 'npm run typecheck',
        lint: 'npm run lint',
        test: 'npm test',
        format: null,
        build: null,
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    // User's --pretty flag is preserved (the v0.7 regression this fixes)
    expect(merged.verification.typecheck).toBe('tsc -p tsconfig.build.json --noEmit --pretty');
    expect(merged.verification.lint).toBe('npm run lint --fix');
  });

  it('preserves user custom rules and team notes', () => {
    const existing = makeConfig({
      conventions: {
        mainBranch: 'development',
        importStyle: 'barrel',
        customRules: ['Use --legacy-peer-deps', 'Run migrations before tests'],
      },
    });
    const preset = makeConfig({
      conventions: { mainBranch: 'main', importStyle: 'direct', customRules: [] },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    expect(merged.conventions.mainBranch).toBe('development');
    expect(merged.conventions.customRules).toEqual(['Use --legacy-peer-deps', 'Run migrations before tests']);
  });

  it('preserves user analysis thresholds, budget, and ignore rules', () => {
    const existing = makeConfig({
      analysis: {
        solid: true,
        thresholds: { maxFileLines: 500, maxBarrelExports: 25, maxModuleCoupling: 12 },
        budget: { circular: 3, srp: 20 },
        ignore: { circularDeps: ['**/legacy/**'] },
        suppressions: [{ rule: 'layerViolation', file: 'scripts/migrate.ts', reason: 'migration needs services' }],
      },
    });
    const preset = makeConfig({
      analysis: {
        solid: true,
        thresholds: { maxFileLines: 300, maxBarrelExports: 15, maxModuleCoupling: 8 },
        budget: {},
        ignore: { circularDeps: ['**/entities/**'] },
        suppressions: [],
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    expect(merged.analysis.thresholds.maxFileLines).toBe(500);
    expect(merged.analysis.budget.circular).toBe(3);
    expect(merged.analysis.ignore.circularDeps).toEqual(['**/legacy/**']);
    expect(merged.analysis.suppressions).toHaveLength(1);
  });

  it('preserves user agentFiles toggles and existingFileStrategy', () => {
    const existing = makeConfig({
      agentFiles: {
        claudeMd: true,
        cursorrules: false,
        windsurfrules: false,
        agentsMd: true,
        cursorignore: true,
        codingGuidelines: true,
        existingFileStrategy: 'skip',
      },
    });
    const preset = makeConfig({
      agentFiles: {
        claudeMd: true,
        cursorrules: true,
        windsurfrules: true,
        agentsMd: true,
        cursorignore: true,
        codingGuidelines: true,
        existingFileStrategy: 'merge',
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    expect(merged.agentFiles.cursorrules).toBe(false);
    expect(merged.agentFiles.existingFileStrategy).toBe('skip');
  });

  it('merges layers: preset is canonical list, user overrides level/hasBarrel/description', () => {
    const existing = makeConfig({
      architecture: {
        layers: [
          { name: 'services', path: 'src/services', level: 99, hasBarrel: false, description: 'My custom services' },
        ],
      },
    });
    const preset = makeConfig({
      architecture: {
        layers: [
          { name: 'services', path: 'src/services', level: 4, hasBarrel: true, role: { id: 'services', displayName: 'Services', description: 'Business logic' } },
          { name: 'controllers', path: 'src/controllers', level: 7, hasBarrel: true },
        ],
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    // services: user's level/hasBarrel/description preserved
    const services = merged.architecture.layers.find((l) => l.name === 'services')!;
    expect(services.level).toBe(99);
    expect(services.hasBarrel).toBe(false);
    expect(services.description).toBe('My custom services');
    // services: role metadata from preset is applied (not a user field)
    expect(services.role?.id).toBe('services');
    // controllers: new layer added from preset
    expect(merged.architecture.layers.find((l) => l.name === 'controllers')).toBeDefined();
  });

  it('preserves businessLogic customizations (allowedIn, forbiddenIn, redFlags)', () => {
    const existing = makeConfig({
      businessLogic: {
        allowedIn: ['services', 'use-cases'],
        forbiddenIn: ['controllers', 'guards', 'interceptors', 'validators'],
        redFlags: ['My project-specific red flag'],
      },
    });
    const preset = makeConfig({
      businessLogic: {
        allowedIn: ['services'],
        forbiddenIn: ['controllers'],
        redFlags: ['Business logic in controllers'],
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    expect(merged.businessLogic.allowedIn).toContain('use-cases');
    expect(merged.businessLogic.forbiddenIn).toContain('validators');
    expect(merged.businessLogic.redFlags).toContain('My project-specific red flag');
  });

  it('refreshes verification.format and verification.build only when existing is null', () => {
    const existing = makeConfig({
      verification: {
        typecheck: 'npm run typecheck',
        lint: 'npm run lint',
        test: 'npm test',
        format: 'prettier --check .', // user-set
        build: null,                   // not set
      },
    });
    const preset = makeConfig({
      verification: {
        typecheck: 'npm run typecheck',
        lint: 'npm run lint',
        test: 'npm test',
        format: 'npm run format',
        build: 'npm run build',
      },
    });
    const merged = mergeConfigWithPreset(existing, preset);
    // format: user already set it, preserve
    expect(merged.verification.format).toBe('prettier --check .');
    // build: user didn't set, take preset's detected value
    expect(merged.verification.build).toBe('npm run build');
  });
});

describe('diffConfigs', () => {
  it('detects framework changes', () => {
    const before = makeConfig({ project: { name: 'app', framework: 'nest', language: 'typescript' } });
    const after = makeConfig({ project: { name: 'app', framework: 'next', language: 'typescript' } });
    const changes = diffConfigs(before, after);
    expect(changes.map((c) => c.path)).toContain('project.framework');
  });

  it('detects systemType changes', () => {
    const before = makeConfig({ architecture: { systemType: 'api' } });
    const after = makeConfig({ architecture: { systemType: 'mixed' } });
    const changes = diffConfigs(before, after);
    expect(changes.map((c) => c.path)).toContain('architecture.systemType');
  });

  it('detects added or removed layers', () => {
    const before = makeConfig({
      architecture: { layers: [{ name: 'services', path: 'src/services', level: 4, hasBarrel: true }] },
    });
    const after = makeConfig({
      architecture: {
        layers: [
          { name: 'services', path: 'src/services', level: 4, hasBarrel: true },
          { name: 'controllers', path: 'src/controllers', level: 7, hasBarrel: true },
        ],
      },
    });
    const changes = diffConfigs(before, after);
    expect(changes.map((c) => c.path)).toContain('architecture.layers');
  });

  it('returns no changes when configs are identical', () => {
    const config = makeConfig();
    expect(diffConfigs(config, config)).toEqual([]);
  });
});
