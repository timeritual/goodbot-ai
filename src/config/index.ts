import path from 'node:path';
import { safeReadJson, safeWriteJson, fileExists } from '../utils/index.js';
import { GoodbotConfigSchema, type GoodbotConfig } from './schema.js';

export { GoodbotConfigSchema, type GoodbotConfig, type ArchitectureLayer } from './schema.js';
export { frameworkDefaults } from './defaults.js';
export { buildPresetConfig, PRESET_DESCRIPTIONS, type PresetName } from './presets.js';

const CONFIG_DIR = '.goodbot';
const CONFIG_FILE = 'config.json';
const CHECKSUMS_FILE = 'checksums.json';

export function configDir(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR);
}

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export function checksumsPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, CHECKSUMS_FILE);
}

export async function configExists(projectRoot: string): Promise<boolean> {
  return fileExists(configPath(projectRoot));
}

export async function loadConfig(projectRoot: string): Promise<GoodbotConfig> {
  const raw = await safeReadJson(configPath(projectRoot));
  if (!raw) {
    throw new Error('No .goodbot/config.json found. Run `goodbot init` first.');
  }
  return GoodbotConfigSchema.parse(raw);
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
