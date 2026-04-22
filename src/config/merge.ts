import type { GoodbotConfig, ArchitectureLayer } from './schema.js';

export interface ConfigChange {
  path: string;
  from: string;
  to: string;
}

/**
 * Merge a freshly-built preset config into an existing config, preserving
 * everything the user might have hand-edited and refreshing only fields
 * that are auto-detected by `goodbot scan`.
 *
 * REFRESHED from preset (scan-detected):
 *   project.framework, project.language
 *   architecture.systemType
 *   architecture.layers — merged per-layer: user's level/hasBarrel/description win,
 *                         preset's role is applied (so role metadata stays current)
 *   verification.format, verification.build (user rarely customizes these)
 *
 * PRESERVED from existing (user-customizable):
 *   project.name, project.description
 *   architecture.dependencyDirection, barrelImportRule, interfaceContracts
 *   businessLogic.* (allowedIn, forbiddenIn, redFlags)
 *   verification.typecheck, verification.lint, verification.test
 *   agentFiles.* (including existingFileStrategy)
 *   conventions.* (mainBranch, importStyle, customRules)
 *   analysis.* (thresholds, budget, ignore — all user-edited)
 *   customRulesConfig, team, ignore
 */
export function mergeConfigWithPreset(
  existing: GoodbotConfig,
  preset: GoodbotConfig,
): GoodbotConfig {
  return {
    version: existing.version,
    project: {
      ...existing.project,
      framework: preset.project.framework,
      language: preset.project.language,
    },
    architecture: {
      ...existing.architecture,
      systemType: preset.architecture.systemType,
      layers: mergeLayers(existing.architecture.layers, preset.architecture.layers),
    },
    businessLogic: existing.businessLogic,
    verification: {
      ...existing.verification,
      // Refresh format/build only if existing didn't set them explicitly
      format: existing.verification.format ?? preset.verification.format,
      build: existing.verification.build ?? preset.verification.build,
    },
    agentFiles: existing.agentFiles,
    conventions: existing.conventions,
    analysis: existing.analysis,
    customRulesConfig: existing.customRulesConfig,
    team: existing.team,
    output: existing.output,
  };
}

function mergeLayers(
  existing: ArchitectureLayer[],
  preset: ArchitectureLayer[],
): ArchitectureLayer[] {
  const existingByName = new Map(existing.map((l) => [l.name, l]));
  // Preset is the canonical list (new layers added, removed layers dropped),
  // but user customizations per-layer are preserved.
  return preset.map((presetLayer) => {
    const existingLayer = existingByName.get(presetLayer.name);
    if (!existingLayer) return presetLayer;
    return {
      ...presetLayer,
      level: existingLayer.level,
      hasBarrel: existingLayer.hasBarrel,
      description: existingLayer.description ?? presetLayer.description,
    };
  });
}

/**
 * Produce a human-readable list of top-level field changes between two configs.
 * Used to show the user what re-init will change before saving.
 */
export function diffConfigs(
  before: GoodbotConfig,
  after: GoodbotConfig,
): ConfigChange[] {
  const changes: ConfigChange[] = [];

  // project
  if (before.project.framework !== after.project.framework) {
    changes.push({ path: 'project.framework', from: before.project.framework, to: after.project.framework });
  }
  if (before.project.language !== after.project.language) {
    changes.push({ path: 'project.language', from: before.project.language, to: after.project.language });
  }

  // architecture
  if (before.architecture.systemType !== after.architecture.systemType) {
    changes.push({ path: 'architecture.systemType', from: before.architecture.systemType, to: after.architecture.systemType });
  }
  const beforeLayerNames = before.architecture.layers.map((l) => l.name).sort();
  const afterLayerNames = after.architecture.layers.map((l) => l.name).sort();
  if (beforeLayerNames.join(',') !== afterLayerNames.join(',')) {
    changes.push({
      path: 'architecture.layers',
      from: beforeLayerNames.join(', ') || '(none)',
      to: afterLayerNames.join(', ') || '(none)',
    });
  }

  // verification — only report fields refreshed by merge
  if (before.verification.format !== after.verification.format) {
    changes.push({
      path: 'verification.format',
      from: before.verification.format ?? '(none)',
      to: after.verification.format ?? '(none)',
    });
  }
  if (before.verification.build !== after.verification.build) {
    changes.push({
      path: 'verification.build',
      from: before.verification.build ?? '(none)',
      to: after.verification.build ?? '(none)',
    });
  }

  return changes;
}
