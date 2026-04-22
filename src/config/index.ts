import path from 'node:path';
import { safeReadJson, safeWriteJson, fileExists, log } from '../utils/index.js';
import { GoodbotConfigSchema, type GoodbotConfig } from './schema.js';
import { migrateLegacyConfig } from './migrate.js';

// Deprecation warnings are printed at most once per process, per message.
const warnedDeprecations = new Set<string>();

export { GoodbotConfigSchema, type GoodbotConfig, type ArchitectureLayer } from './schema.js';
export { frameworkDefaults } from './defaults.js';
export { buildPresetConfig, defaultAnalysisExclude, defaultAnalysisIgnore, PRESET_DESCRIPTIONS, type PresetName } from './presets.js';
export { mergeConfigWithPreset, diffConfigs, type ConfigChange } from './merge.js';

const CONFIG_DIR = '.goodbot';
const CONFIG_FILE = 'config.json';
const CHECKSUMS_FILE = 'checksums.json';
const SNAPSHOT_FILE = 'snapshot.json';

function configPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

function checksumsPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, CHECKSUMS_FILE);
}

export function snapshotPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, SNAPSHOT_FILE);
}

export async function configExists(projectRoot: string): Promise<boolean> {
  return fileExists(configPath(projectRoot));
}

export async function loadConfig(projectRoot: string): Promise<GoodbotConfig> {
  const raw = await safeReadJson(configPath(projectRoot));
  if (!raw) {
    throw new Error('No .goodbot/config.json found. Run `goodbot init` first.');
  }
  const { migrated, deprecations } = migrateLegacyConfig(raw);
  for (const msg of deprecations) {
    if (warnedDeprecations.has(msg)) continue;
    warnedDeprecations.add(msg);
    log.warn(`config: ${msg}`);
  }
  return GoodbotConfigSchema.parse(migrated);
}

export async function saveConfig(projectRoot: string, config: GoodbotConfig): Promise<void> {
  await safeWriteJson(configPath(projectRoot), config);
}

export async function loadChecksums(
  projectRoot: string,
): Promise<Record<string, string>> {
  const data = await safeReadJson<Record<string, string>>(checksumsPath(projectRoot));
  return data ?? {};
}

export async function saveChecksums(
  projectRoot: string,
  checksums: Record<string, string>,
): Promise<void> {
  await safeWriteJson(checksumsPath(projectRoot), checksums);
}
