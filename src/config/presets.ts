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
 * Sensible out-of-the-box analysis-scoped ignores. Backend API frameworks
 * commonly have ORM entity files that form bidirectional cycles via decorator
 * relationships (@OneToMany, @ManyToOne, etc.) — these are runtime-safe and
 * shouldn't inflate the circular-dep count.
 */
export function defaultAnalysisIgnore(framework: Framework): GoodbotConfig['analysis']['ignore'] {
  const entityGlobs = ['**/entities/**', '**/models/**', '**/schemas/**'];
  switch (framework) {
    case 'nest':
    case 'express':
    case 'fastapi':
    case 'django':
    case 'flask':
      return { circularDeps: entityGlobs };
    case 'node':
      return { circularDeps: entityGlobs };
    default:
      return {};
  }
}

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
      ignore: defaultAnalysisIgnore(scan.framework.framework),
    },
    customRulesConfig: [],
    team: {},
    ignore: {
      paths: defaults.ignorePaths,
      sensitiveFiles: ['.env', '.env.*', 'credentials.json', '*.pem', '*.key'],
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
