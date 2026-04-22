import type { GoodbotConfig } from './schema.js';
import type { Framework, ScanResult } from '../scanners/index.js';
import { frameworkDefaults } from './defaults.js';

export type PresetName = 'strict' | 'recommended' | 'relaxed';

export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  strict: 'Maximum enforcement — barrel imports required, interface contracts, all agent files',
  recommended: 'Balanced defaults — barrel imports recommended, all agent files, standard thresholds',
  relaxed: 'Minimal guardrails — basic guidelines and agent files only',
};

/**
 * Sensible out-of-the-box analysis exclusions. Backend API frameworks
 * commonly have ORM entity files that form bidirectional cycles via decorator
 * relationships (@OneToMany, @ManyToOne, etc.) — these are runtime-safe and
 * shouldn't inflate the circular-dep count.
 *
 * (Also exported as `defaultAnalysisIgnore` for backward compatibility; the
 * `Ignore` name is deprecated in favour of `Exclude`.)
 */
export function defaultAnalysisExclude(framework: Framework): GoodbotConfig['analysis']['exclude'] {
  const entityGlobs = ['**/entities/**', '**/models/**', '**/schemas/**'];
  switch (framework) {
    case 'nest':
    case 'express':
    case 'fastapi':
    case 'django':
    case 'flask':
      return { circularDep: entityGlobs };
    case 'node':
      return { circularDep: entityGlobs };
    default:
      return {};
  }
}

/** @deprecated Use `defaultAnalysisExclude`. Kept for backward compatibility. */
export const defaultAnalysisIgnore = defaultAnalysisExclude;

export function buildPresetConfig(
  preset: PresetName,
  scan: ScanResult,
): GoodbotConfig {
  const defaults = frameworkDefaults[scan.framework.framework];

  const base: GoodbotConfig = {
    version: 1,
    project: {
      name: scan.projectName,
      framework: scan.framework.framework,
      language: scan.language.primary,
    },
    architecture: {
      layers: scan.structure.detectedLayers.map((l) => ({
        name: l.name,
        path: l.path,
        level: l.suggestedLevel,
        hasBarrel: l.hasBarrel,
        role: l.role,
      })),
      dependencyDirection: 'downward',
      barrelImportRule: 'recommended',
      interfaceContracts: false,
      systemType: scan.systemType,
    },
    businessLogic: {
      allowedIn: defaults.businessLogicIn,
      forbiddenIn: defaults.businessLogicForbidden,
      redFlags: defaults.redFlags,
    },
    verification: {
      typecheck: scan.verification.typecheck,
      lint: scan.verification.lint,
      test: scan.verification.test,
      format: scan.verification.format,
      build: scan.verification.build,
    },
    agentFiles: {
      claudeMd: true,
      cursorrules: true,
      windsurfrules: true,
      agentsMd: true,
      cursorignore: true,
      codingGuidelines: true,
      existingFileStrategy: 'merge',
    },
    conventions: {
      mainBranch: scan.defaultBranch,
      importStyle: 'direct',
      customRules: [],
    },
    analysis: {
      solid: true,
      thresholds: { maxFileLines: 300, maxBarrelExports: 15, maxModuleCoupling: 8 },
      budget: {},
      exclude: defaultAnalysisExclude(scan.framework.framework),
      suppressions: [],
    },
    customRulesConfig: [],
    team: {},
    output: {
      cursorignore: {
        paths: defaults.ignorePaths,
        sensitiveFiles: ['.env', '.env.*', 'credentials.json', '*.pem', '*.key'],
      },
    },
  };

  switch (preset) {
    case 'strict':
      base.architecture.barrelImportRule = 'always';
      base.architecture.interfaceContracts = scan.structure.hasInterfaceFiles;
      base.conventions.importStyle = 'barrel';
      return base;

    case 'recommended':
      base.architecture.barrelImportRule = scan.structure.hasBarrelFiles ? 'always' : 'recommended';
      base.architecture.interfaceContracts = scan.structure.hasInterfaceFiles;
      base.conventions.importStyle = scan.structure.hasBarrelFiles ? 'barrel' : 'direct';
      return base;

    case 'relaxed':
      base.architecture.barrelImportRule = 'none';
      base.architecture.layers = [];
      base.businessLogic.redFlags = [];
      base.conventions.importStyle = 'direct';
      return base;
  }
}
